#!/usr/bin/env python3

import argparse
import ast
import json
import pathlib
import re
import struct
import sys
import zipfile
from typing import Dict


DEFINE_RE = re.compile(r"^\s*#\s*define\s+(\w+)\s+(.+?)\s*$", re.MULTILINE)
IDENT_RE = re.compile(r"\b[A-Za-z_]\w*\b")
LINK_ASSIGN_RE = re.compile(r"^\s*(\w+)\s*=\s*(0x[0-9a-fA-F]+)\s*;\s*$", re.MULTILINE)

OOT_SILVER_RUPEE_DATA_PATTERN = bytes([
	0x00, 0x01, 0x00, 0x00,
	0x00, 0x08, 0x1F, 0x05,
	0x00, 0x06, 0x05, 0x05,
	0x00, 0x06, 0x0A, 0x05,
	0x00, 0x06, 0x02, 0x05,
	0x00, 0x07, 0x01, 0x05,
	0x00, 0x07, 0x00, 0x00,
	0x00, 0x07, 0x09, 0x05,
	0x00, 0x07, 0x08, 0x05,
	0x00, 0x09, 0x08, 0x05,
	0x00, 0x09, 0x09, 0x05,
	0x00, 0x0B, 0x1C, 0x05,
	0x00, 0x0B, 0x0C, 0x05,
	0x00, 0x0B, 0x1B, 0x05,
	0x00, 0x0D, 0x0B, 0x05,
	0x00, 0x0D, 0x12, 0x05,
	0x00, 0x0D, 0x09, 0x05,
	0x00, 0x0D, 0x0E, 0x05,
])

COMBO_CONFIG_VROM_LOAD = 0x3C05F020
MIPS_ADDIU_OPS = {
	0x2442,
	0x2443,
	0x2444,
	0x2462,
	0x2463,
	0x2464,
	0x2482,
	0x2483,
	0x2484,
	0x24C6,
	0x2529,
	0x2610,
}
MIPS_LOAD_IMM_5 = {0x24020005, 0x24030005, 0x24040005, 0x24060005}


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
		print(f"Patchfile not found: {patchfile}", file=sys.stderr)
		return 1
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

	combo_symbol = first_patch_symbol(patch_symbols, "gComboConfig")
	if combo_symbol is not None:
		output["comboConfigLive"] = format_hex(combo_symbol)
		derivation["comboConfigLive"] = "patchfile-symbol"
	else:
		combo_value = scan_combo_config_addr(patch_meta, game) if patch_meta is not None else None
		if combo_value is not None:
			output["comboConfigLive"] = format_hex(combo_value)
			derivation["comboConfigLive"] = "patchfile-code-scan"
		else:
			missing_patch_symbols.append("gComboConfig")

	if game == "oot":
		silver_symbol = first_patch_symbol(patch_symbols, "gSilverRupeeData")
		if silver_symbol is not None:
			output["runtimeSilverRupeeDataLive"] = format_hex(silver_symbol)
			derivation["runtimeSilverRupeeDataLive"] = "patchfile-symbol"
		else:
			silver_value = scan_oot_silver_rupee_data_addr(patch_meta) if patch_meta is not None else None
			if silver_value is not None:
				output["runtimeSilverRupeeDataLive"] = format_hex(silver_value)
				derivation["runtimeSilverRupeeDataLive"] = "patchfile-payload-scan"
			else:
				missing_patch_symbols.append("gSilverRupeeData")

	if game == "oot":
		g_symbol = first_patch_symbol(patch_symbols, "g")
		if g_symbol is not None:
			output["runtimeMaxKeysLive"] = format_hex(g_symbol + 0x20)
			derivation["runtimeMaxKeysLive"] = "patchfile-symbol+offset"
		else:
			g_value = scan_combo_global_addr(patch_meta, game) if patch_meta is not None else None
			if g_value is not None:
				output["runtimeMaxKeysLive"] = format_hex(g_value + 0x20)
				derivation["runtimeMaxKeysLive"] = "patchfile-code-scan+offset"
			else:
				missing_patch_symbols.append("g")

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
			"comboConfigLive",
			"runtimeMaxKeysLive",
			"runtimeSilverRupeeDataLive",
		],
		"mm": [
			"foreignSaveLive",
			"sharedCustomSaveLive",
			"comboConfigLive",
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


def scan_oot_silver_rupee_data_addr(patch_meta: dict) -> int | None:
	entry = patchfile_new_file(patch_meta["meta"], "oot/payload")
	payload_base = extract_patchfile_vram(entry, "oot")
	if payload_base is None:
		return None
	payload_data = patchfile_file_data(patch_meta, entry)
	index = payload_data.find(OOT_SILVER_RUPEE_DATA_PATTERN)
	if index < 0:
		return None
	return payload_base + index


def scan_combo_config_addr(patch_meta: dict, game: str) -> int | None:
	entry = patchfile_new_file(patch_meta["meta"], f"{game}/payload")
	payload_base = extract_patchfile_vram(entry, game)
	if payload_base is None:
		return None
	words = patchfile_words(patch_meta, entry)
	hits = [index for index, word in enumerate(words) if word == COMBO_CONFIG_VROM_LOAD]
	if len(hits) != 1:
		return None

	index = hits[0]
	candidates = set()
	for i in range(max(0, index-2), min(len(words), index+5)):
		word = words[i]
		if (word >> 26) != 0x0F:
			continue
		register = (word >> 16) & 0x1F
		hi = word & 0xFFFF
		for j in range(i+1, min(len(words), index+5)):
			word2 = words[j]
			if (word2 >> 16) not in MIPS_ADDIU_OPS:
				continue
			if ((word2 >> 21) & 0x1F) != register:
				continue
			target = mips_symbol_address(hi, word2 & 0xFFFF)
			if payload_base <= target < payload_base + len(patchfile_file_data(patch_meta, entry)):
				candidates.add(target)
	if len(candidates) != 1:
		return None
	return next(iter(candidates))


def scan_combo_global_addr(patch_meta: dict, game: str) -> int | None:
	entry = patchfile_new_file(patch_meta["meta"], f"{game}/payload")
	words = patchfile_words(patch_meta, entry)
	candidates = set()
	for index in range(len(words) - 5):
		seq = words[index:index+6]
		if (seq[0] >> 16) != 0x3C10 or (seq[1] >> 16) != 0x2610:
			continue
		if not any(word in MIPS_LOAD_IMM_5 for word in seq[2:5]):
			continue
		if not any(((word >> 26) == 0x2B) and (((word >> 21) & 0x1F) == 16) and ((word & 0xFFFF) == 0x20) for word in seq[3:6]):
			continue
		candidates.add(mips_symbol_address(seq[0] & 0xFFFF, seq[1] & 0xFFFF))
	if len(candidates) != 1:
		return None
	return next(iter(candidates))


def patchfile_file_data(patch_meta: dict, entry: dict) -> bytes:
	offset = int(entry["offset"])
	size = int(entry["size"])
	blob = patch_meta["blob"]
	return blob[offset:offset + size]


def patchfile_words(patch_meta: dict, entry: dict) -> list[int]:
	data = patchfile_file_data(patch_meta, entry)
	limit = len(data) - (len(data) % 4)
	return [struct.unpack(">I", data[index:index+4])[0] for index in range(0, limit, 4)]


def mips_symbol_address(hi: int, lo: int) -> int:
	return ((hi << 16) + (lo if lo < 0x8000 else lo - 0x10000)) & 0xFFFFFFFF


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
