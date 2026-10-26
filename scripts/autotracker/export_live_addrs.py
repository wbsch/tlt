#!/usr/bin/env python3

import argparse
import ast
import json
import pathlib
import re
import sys
import zipfile
from typing import Dict


DEFINE_RE = re.compile(r"^\s*#\s*define\s+(\w+)\s+(.+?)\s*$", re.MULTILINE)
IDENT_RE = re.compile(r"\b[A-Za-z_]\w*\b")
LINK_ASSIGN_RE = re.compile(r"^\s*(\w+)\s*=\s*(0x[0-9a-fA-F]+)\s*;\s*$", re.MULTILINE)

def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description=(
			"Export the OoT/MM RAM addresses that are defined directly in OOTMM source "
			"headers and linker scripts into JSON."
		)
	)
	parser.add_argument(
		"--ootmm-repo",
		type=pathlib.Path,
		default=pathlib.Path("../OoTMM"),
		help="Path to the OOTMM repository for source fallbacks (default: ../OoTMM)",
	)
	parser.add_argument(
		"--patchfile",
		type=pathlib.Path,
		default=None,
		help="Optional .ootmm patchfile used as the primary derivation source",
	)
	parser.add_argument(
		"--output",
		type=pathlib.Path,
		default=pathlib.Path("ootmm/live_addrs.json"),
		help="Output JSON path (default: ootmm/live_addrs.json)",
	)
	return parser.parse_args()


def main() -> int:
	args = parse_args()
	repo = args.ootmm_repo.resolve() if args.ootmm_repo is not None else None
	patchfile = args.patchfile.resolve() if args.patchfile is not None else None
	if patchfile is None and repo is None:
		print("Either --patchfile or --ootmm-repo is required", file=sys.stderr)
		return 1
	if patchfile is not None and not patchfile.is_file():
		print(f"Warning: patchfile not found ({patchfile}) — live address data will not be updated from the patchfile.", file=sys.stderr)
		patchfile = None
	if repo is not None and not repo.is_dir():
		print(f"OOTMM repository not found: {repo}", file=sys.stderr)
		return 1

	patch_meta = load_patchfile(patchfile) if patchfile is not None else None
	source_meta = load_source_metadata(repo) if repo is not None else None

	generated_from = {}
	if patchfile is not None:
		generated_from["patchfile"] = str(patchfile)
	if source_meta is not None:
		generated_from.update(source_meta["generatedFrom"])

	oot_output = build_game_output(
		"oot",
		patch_meta,
		source_meta,
		link_symbol_name="gSaveContext",
		combo_define_name="COMBO_CTX_ADDR_OOT",
	)
	mm_output = build_game_output(
		"mm",
		patch_meta,
		source_meta,
		link_symbol_name="gSaveContext",
		combo_define_name="COMBO_CTX_ADDR_MM",
	)

	output = {
		"schemaVersion": 1,
		"generatedFrom": generated_from,
		"oot": oot_output,
		"mm": mm_output,
		"notDerivableWithoutLinking": {
			"oot": not_derivable_without_linking("oot", oot_output),
			"mm": not_derivable_without_linking("mm", mm_output),
		},
	}

	output_path = args.output.resolve()
	output_path.parent.mkdir(parents=True, exist_ok=True)
	output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
	print(output_path)
	return 0


def load_patchfile(path: pathlib.Path) -> dict:
	with zipfile.ZipFile(path) as archive:
		meta = json.loads(archive.read("meta.json"))
		symbols = json.loads(archive.read("symbols.json"))
		blob = archive.read("blob.bin")
	return {
		"meta": meta,
		"symbols": symbols,
		"blob": blob,
	}


def load_source_metadata(repo: pathlib.Path) -> dict:
	defs_path = repo / "packages/generator/include/combo/defs.h"
	defs_text = defs_path.read_text(encoding="utf-8")
	root_defines = parse_define_block(defs_text)
	oot_block = extract_ifdef_block(defs_text, "GAME_OOT")
	mm_block = extract_ifdef_block(defs_text, "GAME_MM")
	oot_link_path = repo / "packages/generator/src/link_oot.in"
	mm_link_path = repo / "packages/generator/src/link_mm.in"
	oot_link = parse_link_assignments(oot_link_path.read_text(encoding="utf-8"))
	mm_link = parse_link_assignments(mm_link_path.read_text(encoding="utf-8"))
	return {
		"generatedFrom": {
			"ootmmRepo": str(repo),
			"defs": str(defs_path),
			"ootLinker": str(oot_link_path),
			"mmLinker": str(mm_link_path),
		},
		"defines": {
			"root": root_defines,
			"oot": oot_block,
			"mm": mm_block,
		},
		"links": {
			"oot": oot_link,
			"mm": mm_link,
		},
	}


def build_game_output(
	game: str,
	patch_meta: dict | None,
	source_meta: dict | None,
	link_symbol_name: str,
	combo_define_name: str,
) -> dict:
	output: dict = {}
	derivation: dict = {}
	missing_patch_symbols: list[str] = []
	patch_symbols = patch_meta["symbols"][game] if patch_meta is not None else {}

	combo_value = None
	if source_meta is not None:
		combo_value = resolve_define(combo_define_name, source_meta["defines"]["root"])
		output["comboCtx"] = format_hex(combo_value)
		derivation["comboCtx"] = "source-define"

	save_value = None
	if source_meta is not None:
		save_value = require_link_symbol(source_meta["links"][game], link_symbol_name)
		output["saveCtx"] = format_hex(save_value)
		derivation["saveCtx"] = "source-linker"

	payload_value = None
	if patch_meta is not None:
		payload_entry = patchfile_new_file(patch_meta["meta"], f"{game}/payload")
		payload_vram = extract_patchfile_vram(payload_entry, game)
		if payload_vram is not None:
			payload_value = payload_vram
			output["payload"] = format_hex(payload_vram)
			derivation["payload"] = "patchfile-vram"
	if payload_value is None and source_meta is not None:
		payload_value = resolve_define("PAYLOAD_RAM", source_meta["defines"][game])
		output["payload"] = format_hex(payload_value)
		derivation["payload"] = "source-define"

	optional_symbol_map = {
		"oot": {
			"foreignSaveLive": "gMmSave",
			"sharedCustomSaveLive": "gSharedCustomSave",
		},
		"mm": {
			"foreignSaveLive": "gOotSave",
			"sharedCustomSaveLive": "gSharedCustomSave",
		},
	}[game]
	for field_name, symbol_name in optional_symbol_map.items():
		symbol_value = first_patch_symbol(patch_symbols, symbol_name)
		if symbol_value is None:
			missing_patch_symbols.append(symbol_name)
			continue
		output[field_name] = format_hex(symbol_value)
		derivation[field_name] = "patchfile-symbol"

	if derivation:
		output["derivation"] = derivation
	if patch_meta is not None and missing_patch_symbols:
		output["missingPatchfileSymbols"] = sorted(set(missing_patch_symbols))
	return output


def not_derivable_without_linking(game: str, output: dict) -> list[str]:
	fields = {
		"oot": [
			"foreignSaveLive",
			"sharedCustomSaveLive",
		],
		"mm": [
			"foreignSaveLive",
			"sharedCustomSaveLive",
		],
	}[game]
	return [field for field in fields if field not in output]


def patchfile_new_file(meta: dict, name: str) -> dict:
	for entry in meta.get("newFiles", []):
		if entry.get("name") == name:
			return entry
	raise ValueError(f"patchfile is missing new file {name!r}")


def extract_patchfile_vram(entry: dict, game: str) -> int | None:
	vram = entry.get("vram") or {}
	range_value = vram.get(game)
	if not range_value:
		return None
	return int(range_value[0])


def first_patch_symbol(symbols: dict, name: str) -> int | None:
	values = symbols.get(name)
	if not values:
		return None
	return int(values[0])


def parse_link_assignments(text: str) -> Dict[str, int]:
	assignments: Dict[str, int] = {}
	for match in LINK_ASSIGN_RE.finditer(text):
		name, raw_value = match.groups()
		assignments[name] = int(raw_value, 16)
	return assignments


def require_link_symbol(assignments: Dict[str, int], name: str) -> int:
	try:
		return assignments[name]
	except KeyError as exc:
		raise ValueError(f"required linker symbol {name!r} not found") from exc


def extract_ifdef_block(text: str, macro: str) -> Dict[str, str]:
	match = re.search(rf"#ifdef\s+{re.escape(macro)}\n(.*?)#endif", text, re.DOTALL)
	if not match:
		raise ValueError(f"could not find #ifdef {macro} block")
	return parse_define_block(match.group(1))


def parse_define_block(text: str) -> Dict[str, str]:
	defines: Dict[str, str] = {}
	for match in DEFINE_RE.finditer(text):
		name, expr = match.groups()
		defines[name] = expr.split("/*", 1)[0].strip()
	return defines


def resolve_define(name: str, defines: Dict[str, str]) -> int:
	if name not in defines:
		raise ValueError(f"required define {name} not found")
	return eval_expr(expand_expr(defines[name], defines, {name}))


def expand_expr(expr: str, defines: Dict[str, str], seen: set[str]) -> str:
	def replace(match: re.Match[str]) -> str:
		ident = match.group(0)
		if ident not in defines:
			return ident
		if ident in seen:
			raise ValueError(f"cyclic macro expansion for {ident}")
		return f"({expand_expr(defines[ident], defines, seen | {ident})})"

	return IDENT_RE.sub(replace, expr)


def eval_expr(expr: str) -> int:
	tree = ast.parse(expr, mode="eval")
	return eval_ast(tree.body)


def eval_ast(node: ast.AST) -> int:
	if isinstance(node, ast.Constant) and isinstance(node.value, int):
		return node.value
	if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
		value = eval_ast(node.operand)
		return value if isinstance(node.op, ast.UAdd) else -value
	if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
		left = eval_ast(node.left)
		right = eval_ast(node.right)
		return left + right if isinstance(node.op, ast.Add) else left - right
	raise ValueError(f"unsupported expression: {ast.dump(node)}")


def format_hex(value: int) -> str:
	return f"0x{value:08x}"


if __name__ == "__main__":
	raise SystemExit(main())
