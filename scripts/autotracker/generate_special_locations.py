#!/usr/bin/env python3

import argparse
import csv
import json
import pathlib
import re
import sys
from collections import defaultdict
from typing import Any


SUPPORTED_EXTRA_GROUPS = {"gMmExtraFlags", "gMmExtraFlags2", "gMmExtraFlags3"}
SUPPORTED_GROUPS = SUPPORTED_EXTRA_GROUPS | {"weekEventReg", "gMmOwlFlags", "sharedNpcBitmap", "inventoryQuest", "gMmExtraBoss"}
SUPPORTED_OOT_GROUPS = {"gOotExtraFlags", "inventoryQuest", "gOotTradeSave", "eventsChk", "eventsItem", "eventsMisc"}
MM_RUNTIME_FALLBACK_GROUPS = SUPPORTED_EXTRA_GROUPS | {"weekEventReg", "gMmOwlFlags"}
MM_RUNTIME_SUPPORTED_GROUPS = MM_RUNTIME_FALLBACK_GROUPS | {"gMmExtraBoss"}
MM_HINT_ONLY_GROUPS = {"inventoryQuest", "sharedNpcBitmap"}
OOT_RUNTIME_FALLBACK_GROUPS = SUPPORTED_OOT_GROUPS

# Explicit runtime mapping overrides for MM symbols where checks must mirror
# another authoritative signal.
MM_SOURCE_OVERRIDES = {
    "MM_MASK_KEATON": [
        {
            "group": "gMmExtraFlags2",
            "field": "gMmExtraFlags2.letterMama",
            "mask": "0x00000100",
        }
    ],
}

# Explicit runtime mapping overrides for OoT symbols where gameplay timing
# requires a different signal than naive source discovery would pick.
OOT_SOURCE_OVERRIDES = {
    "ZELDA_LETTER": [
        {
            "group": "eventsChk",
            "field": "gOotSave.context.eventsChk",
            "flag": 89,
        }
    ],
}

EXTRA_STRUCTS = {
    "gMmExtraFlags": "MmExtraFlags",
    "gMmExtraFlags2": "MmExtraFlags2",
    "gMmExtraFlags3": "MmExtraFlags3",
}

OOT_EXTRA_STRUCTS = {
    "gOotExtraFlags": "OotExtraFlags",
}

QUEST_SYMBOL_FIELDS = {
    "MM_SONG_AWAKENING": "songAwakening",
    "MM_SONG_ZORA": "songNewWave",
    "MM_SKULL_KID_SONG": "songTime",
}

BOSS_SYMBOL_BITS = {
    "MM_REMAINS_ODOLWA": 0,
    "MM_REMAINS_GOHT": 1,
    "MM_REMAINS_GYORG": 2,
    "MM_REMAINS_TWINMOLD": 3,
}

MM_DUNGEON_CLEAR_EVENT_MACROS = {
    "WF": "EV_MM_WEEK_DUNGEON_WF",
    "SH": "EV_MM_WEEK_DUNGEON_SH",
    "GB": "EV_MM_WEEK_DUNGEON_GB",
    "IST": "EV_MM_WEEK_DUNGEON_ST",
}

MM_DUNGEON_CLEAR_NAMES = {
    "WF": "Woodfall Temple Boss",
    "SH": "Snowhead Temple Boss",
    "GB": "Great Bay Temple Boss",
    "IST": "Stone Tower Temple Inverted Boss",
}

NPC_DEFINE_RE = re.compile(r"^(MM_[A-Z0-9_]+):\s*(0x[0-9a-fA-F]+|\d+)\s*$")
BITFIELD_RE = re.compile(r"\bu32\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)\s*;")
STRUCT_RE_TEMPLATE = r"typedef\s+struct\s*\{(?P<body>[^{}]*)\}\s*%s\s*;"
MM_EV_RE = re.compile(r"#define\s+(EV_MM_WEEK_[A-Z0-9_]+)\s+MM_EV\((\d+),\s*(\d+)\)")
OOT_EVENT_RE = re.compile(r"#define\s+((?:EV|EN)_OOT_(CHK|ITEM|INF)_[A-Z0-9_]+)\s+(.+)")
OOT_QUEST_RE = re.compile(r"#define\s+QUEST_OOT_([A-Z0-9_]+)\s+(\d+)")
MM_SET_EVENT_RE = re.compile(r"MM_SET_EVENT_WEEK\(([^)]+)\)")
EXTRA_ASSIGN_RE = re.compile(r"\b(gMmExtraFlags2|gMmExtraFlags3|gMmExtraFlags)\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\|=)")
NPC_REF_RE = re.compile(r"\bNPC_(MM_[A-Z0-9_]+)\b")
OOT_NPC_REF_RE = re.compile(r"\bNPC_OOT_([A-Z0-9_]+)\b")
OOT_EXTRA_ASSIGN_RE = re.compile(r"\bgOotExtraFlags\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\|=)")
OOT_DIRECT_NPC_EVENT_RE = re.compile(r"\bNPC_OOT_([A-Z0-9_]+)\b[^;{}]*?\b((?:EV|EN)_OOT_(?:CHK|ITEM|INF)_[A-Z0-9_]+)\b")
OOT_SET_CHK_RE = re.compile(r"\b(?:SetEventChk|checkSetEvent)\s*\([^;]*?\b((?:EV|EN)_OOT_CHK_[A-Z0-9_]+)\b")
OOT_GET_CHK_RE = re.compile(r"\bGetEventChk\s*\(\s*((?:EV|EN)_OOT_CHK_[A-Z0-9_]+)\s*\)")
OOT_BITMAP_EVENT_RE = re.compile(r"\bBITMAP16_(?:SET|GET)\s*\(\s*g(?:Save|OotSave)\.info\.events(Chk|Item|Misc)\s*,\s*((?:EV|EN)_OOT_(?:CHK|ITEM|INF)_[A-Z0-9_]+)\s*\)")
OOT_ARRAY_OR_RE = re.compile(r"\bg(?:Save|OotSave)\.info\.events(Item|Misc)\s*\[\s*(\d+)\s*\]\s*\|=\s*(0x[0-9a-fA-F]+|\d+)")
MM_BOSS_EVENT_CLEAR_RE = re.compile(
    r"\{\s*name:\s*'[^']+'.*?entrance:\s*'MM_[^']+'.*?dungeon:\s*'(?P<dungeon>[^']+)'.*?eventClear:\s*'(?P<symbol>MM_CLEAR_STATE_[A-Z_]+)'",
    re.S,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate special location metadata for the autotracker from an OoTMM checkout."
    )
    parser.add_argument("--ootmm-repo", required=True, help="Path to the OoTMM repository root.")
    parser.add_argument("--mm-output", required=True, help="Path to write MM special_locations_mm.json.")
    parser.add_argument("--oot-output", help="Optional path to write OoT special_locations_oot.json.")
    parser.add_argument(
        "--hints",
        help=(
            "Optional existing special_locations_mm.json to preserve manual source hints/notes. "
            "Defaults to --mm-output when that file exists."
        ),
    )
    parser.add_argument(
        "--oot-hints",
        help=(
            "Optional existing special_locations_oot.json to preserve manual source hints/notes. "
            "Defaults to --oot-output when that file exists."
        ),
    )
    parser.add_argument(
        "--no-existing-hints",
        action="store_true",
        help="Do not read output files as hint files when explicit hints are omitted.",
    )
    parser.add_argument(
        "--fallback-baseline",
        help=(
            "Optional JSON file containing the approved MM runtime fallback source state. "
            "Generation fails when the generated state differs."
        ),
    )
    parser.add_argument(
        "--oot-fallback-baseline",
        help=(
            "Optional JSON file containing the approved OoT runtime fallback source state. "
            "Generation fails when the generated state differs."
        ),
    )
    parser.add_argument(
        "--update-fallback-baseline",
        action="store_true",
        help="Write fallback baseline files instead of checking them.",
    )
    return parser.parse_args()


def load_npc_ids(path: pathlib.Path) -> dict[str, int]:
    ids: dict[str, int] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        match = NPC_DEFINE_RE.match(line)
        if not match:
            continue
        symbol, value = match.groups()
        if symbol.startswith("MM_"):
            ids[symbol] = int(value, 0)
    return ids


def load_pool_names(path: pathlib.Path, prefix: str = "MM") -> dict[str, str]:
    names: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, skipinitialspace=True)
        for row in reader:
            if row["type"].strip() != "npc":
                continue
            location = row["location"].strip()
            raw_id = row["id"].strip()
            if not location or not raw_id:
                continue
            symbol = raw_id if raw_id.startswith(f"{prefix}_") else f"{prefix}_{raw_id}"
            names.setdefault(symbol, location)
    return names


def load_hints(path: pathlib.Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.is_file():
        return {}
    entries = json.loads(path.read_text(encoding="utf-8"))
    return {entry["symbol"]: entry for entry in entries if entry.get("symbol")}


def parse_bitfield_structs(
    header: pathlib.Path,
    struct_names: dict[str, str] = EXTRA_STRUCTS,
) -> dict[str, dict[str, dict[str, Any]]]:
    text = header.read_text(encoding="utf-8")
    structs: dict[str, dict[str, dict[str, Any]]] = {}

    for group, struct_name in struct_names.items():
        match = re.search(STRUCT_RE_TEMPLATE % re.escape(struct_name), text, re.S)
        if not match:
            raise ValueError(f"failed to find {struct_name} in {header}")

        offset = 0
        fields: dict[str, dict[str, Any]] = {}
        for field, width_text in BITFIELD_RE.findall(match.group("body")):
            width = int(width_text)
            logical_bits = list(range(offset, offset + width))
            raw_bits = [31 - (offset + width - 1 - idx) for idx in range(width)]
            if not field.startswith("unused"):
                fields[field] = {
                    "width": width,
                    "offset": offset,
                    "logical_bits": logical_bits,
                    "raw_bits": raw_bits,
                    "logical_mask": sum(1 << bit for bit in logical_bits),
                }
            offset += width
        structs[group] = fields
    return structs


def parse_quest_fields(header: pathlib.Path) -> dict[str, dict[str, Any]]:
    text = header.read_text(encoding="utf-8")
    match = re.search(r"typedef\s+union\s*\{(?P<body>.*?)\}\s*MmQuestItems\s*;", text, re.S)
    if not match:
        raise ValueError(f"failed to find MmQuestItems in {header}")
    body = match.group("body")
    fields: dict[str, dict[str, Any]] = {}
    offset = 0
    for field, width_text in BITFIELD_RE.findall(body):
        width = int(width_text)
        logical_bits = list(range(offset, offset + width))
        if not field.startswith("unused"):
            fields[field] = {
                "width": width,
                "offset": offset,
                "logical_bits": logical_bits,
                "logical_mask": sum(1 << bit for bit in logical_bits),
            }
        offset += width
    return fields


def parse_week_events(path: pathlib.Path) -> dict[str, tuple[int, int]]:
    events: dict[str, tuple[int, int]] = {}
    for name, byte_text, bit_text in MM_EV_RE.findall(path.read_text(encoding="utf-8")):
        byte_index = int(byte_text)
        bit = int(bit_text)
        events[name] = (byte_index, 1 << bit)
    return events


def extra_source(group: str, field: str, bitfields: dict[str, dict[str, dict[str, Any]]]) -> dict[str, Any] | None:
    info = bitfields.get(group, {}).get(field)
    if info is None:
        return None
    return {
        "group": group,
        "field": f"{group}.{field}",
        "mask": f"0x{info['logical_mask']:08x}",
    }


def enrich_source(source: dict[str, Any], bitfields: dict[str, dict[str, dict[str, Any]]]) -> tuple[dict[str, Any], list[int], int | None, int | None]:
    source = dict(source)
    bits: list[int] = []
    byte_index: int | None = None
    mask: int | None = None

    group = source.get("group", "")
    field = source.get("field", "")
    source_mask = source.get("mask")

    if group in SUPPORTED_EXTRA_GROUPS:
        field_name = field.rsplit(".", 1)[-1]
        field_info = bitfields.get(group, {}).get(field_name)
        if field_info is not None:
            if not source_mask:
                source["mask"] = f"0x{field_info['logical_mask']:08x}"
                bits = list(field_info["raw_bits"])
            else:
                logical_mask = int(str(source_mask), 0)
                raw_bits: list[int] = []
                for logical_bit, raw_bit in zip(field_info["logical_bits"], field_info["raw_bits"]):
                    if logical_mask & (1 << logical_bit):
                        raw_bits.append(raw_bit)
                bits = raw_bits or list(field_info["raw_bits"])
    elif group == "weekEventReg":
        if source_mask:
            mask = int(str(source_mask), 0)
        match = re.search(r"weekEventReg\[(\d+)\]", field)
        if match:
            byte_index = int(match.group(1))
        if byte_index is not None and mask is not None:
            bits = [byte_index * 8 + bit for bit in range(8) if mask & (1 << bit)]
    elif group in {"gMmOwlFlags", "sharedNpcBitmap"}:
        if source_mask:
            logical_mask = int(str(source_mask), 0)
            bits = [bit for bit in range(32) if logical_mask & (1 << bit)]

    return source, bits, byte_index, mask


def discover_simple_sources(repo_root: pathlib.Path, bitfields: dict[str, dict[str, dict[str, Any]]], week_events: dict[str, tuple[int, int]]) -> dict[str, list[dict[str, Any]]]:
    src_root = repo_root / "packages/generator/src"
    sources: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for path in list(src_root.rglob("*.c")) + list(src_root.rglob("*.S")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        symbols = sorted(set(NPC_REF_RE.findall(text)))
        if len(symbols) != 1:
            continue

        symbol = symbols[0]
        for group, field in EXTRA_ASSIGN_RE.findall(text):
            source = extra_source(group, field, bitfields)
            if source is not None:
                append_unique_source(sources[symbol], source)

        for expr in MM_SET_EVENT_RE.findall(text):
            expr = expr.strip()
            if expr in week_events:
                byte_index, mask = week_events[expr]
                append_unique_source(
                    sources[symbol],
                    {
                        "group": "weekEventReg",
                        "field": f"gMmSave.info.weekEventReg[{byte_index}]",
                        "mask": f"0x{mask:02x}",
                    },
                )
            elif re.fullmatch(r"0x[0-9a-fA-F]+|\d+", expr):
                event = int(expr, 0)
                byte_index = event >> 3
                mask = 1 << (event & 7)
                append_unique_source(
                    sources[symbol],
                    {
                        "group": "weekEventReg",
                        "field": f"gMmSave.info.weekEventReg[{byte_index}]",
                        "mask": f"0x{mask:02x}",
                    },
                )

    return sources


def append_unique_source(sources: list[dict[str, Any]], source: dict[str, Any]) -> None:
    key = (
        source.get("group"),
        source.get("field"),
        source.get("mask"),
        source.get("bit"),
        source.get("flag"),
    )
    if all(
        (item.get("group"), item.get("field"), item.get("mask"), item.get("bit"), item.get("flag")) != key
        for item in sources
    ):
        sources.append(source)


def append_unique_sources(sources: list[dict[str, Any]], extra_sources: list[dict[str, Any]]) -> None:
    for source in extra_sources:
        append_unique_source(sources, source)


def oot_bit_source(group: str, field: str, bit: int) -> dict[str, Any]:
    return {
        "group": group,
        "field": field,
        "bit": bit,
    }


def oot_flag_source(group: str, field: str, flag: int) -> dict[str, Any]:
    return {
        "group": group,
        "field": field,
        "flag": flag,
    }


def oot_mask_source(group: str, field: str, mask: int) -> dict[str, Any]:
    return {
        "group": group,
        "field": field,
        "mask": f"0x{mask:04X}",
    }


def eval_oot_event_expr(expr: str) -> int | None:
    expr = expr.split("/*", 1)[0].split("//", 1)[0].strip()
    macro = re.fullmatch(r"OOT_EV\(\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)", expr)
    if macro:
        word, bit = macro.groups()
        return (int(word, 0) << 4) | int(bit, 0)
    literal = re.fullmatch(r"0x[0-9a-fA-F]+|\d+", expr)
    if literal:
        return int(expr, 0)
    return None


def parse_oot_events(path: pathlib.Path) -> dict[str, dict[str, Any]]:
    events: dict[str, dict[str, Any]] = {}
    for name, kind, expr in OOT_EVENT_RE.findall(path.read_text(encoding="utf-8")):
        flag = eval_oot_event_expr(expr)
        if flag is None:
            continue
        group = {
            "CHK": "eventsChk",
            "ITEM": "eventsItem",
            "INF": "eventsMisc",
        }[kind]
        field = {
            "eventsChk": "gOotSave.context.eventsChk",
            "eventsItem": "gOotSave.context.eventsItem",
            "eventsMisc": "gOotSave.context.eventsMisc",
        }[group]
        events[name] = oot_flag_source(group, field, flag)
    return events


def parse_oot_quest_bits(path: pathlib.Path) -> dict[str, int]:
    bits: dict[str, int] = {}
    for symbol, bit_text in OOT_QUEST_RE.findall(path.read_text(encoding="utf-8")):
        bits[symbol] = int(bit_text)
    return bits


def oot_source_from_event_macro(events: dict[str, dict[str, Any]], macro: str) -> dict[str, Any] | None:
    return events.get(macro)


def source_groups(sources: list[dict[str, Any]]) -> set[str]:
    return {source.get("group", "") for source in sources}


def should_prefer_discovered_mm_sources(
    hinted_sources: list[dict[str, Any]],
    discovered_sources: list[dict[str, Any]],
) -> bool:
    if not hinted_sources or not discovered_sources:
        return False
    hinted_groups = source_groups(hinted_sources)
    discovered_groups = source_groups(discovered_sources)
    return bool(discovered_groups & MM_RUNTIME_SUPPORTED_GROUPS) and hinted_groups <= MM_HINT_ONLY_GROUPS


def event_suffix(macro: str) -> str:
    return re.sub(r"^(?:EV|EN)_OOT_(?:CHK|ITEM|INF)_", "", macro)


def best_matching_event_source(
    symbol: str,
    macros: list[str],
    events: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    exact_matches = [macro for macro in macros if event_suffix(macro) == symbol]
    if len(exact_matches) == 1:
        return oot_source_from_event_macro(events, exact_matches[0])
    if len(macros) == 1:
        return oot_source_from_event_macro(events, macros[0])
    return None


def extract_oot_event_macros(text: str, events: dict[str, dict[str, Any]]) -> list[str]:
    macros: list[str] = []
    for macro in OOT_SET_CHK_RE.findall(text):
        if macro in events and macro not in macros:
            macros.append(macro)
    for macro in OOT_GET_CHK_RE.findall(text):
        if macro in events and macro not in macros:
            macros.append(macro)
    for _, macro in OOT_BITMAP_EVENT_RE.findall(text):
        if macro in events and macro not in macros:
            macros.append(macro)
    return macros


def extract_oot_literal_event_sources(text: str) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for kind, word_text, mask_text in OOT_ARRAY_OR_RE.findall(text):
        mask = int(mask_text, 0)
        if mask == 0 or mask & (mask - 1) != 0:
            continue
        flag = int(word_text) * 16 + (mask.bit_length() - 1)
        group = "eventsItem" if kind == "Item" else "eventsMisc"
        field = "gOotSave.context.eventsItem" if group == "eventsItem" else "gOotSave.context.eventsMisc"
        append_unique_source(sources, oot_flag_source(group, field, flag))
    return sources


def iter_c_functions(text: str) -> list[str]:
    functions: list[str] = []
    for match in re.finditer(r"(?m)^[A-Za-z_][A-Za-z0-9_\s\*]*\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^;{}]*\)\s*\{", text):
        depth = 0
        index = match.end() - 1
        while index < len(text):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    functions.append(text[match.start() : index + 1])
                    break
            index += 1
    return functions


def discover_oot_great_fairy_sources(text: str, bitfields: dict[str, dict[str, dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    if "gOotExtraFlags.greatFairies" not in text:
        return {}
    match = re.search(r"kGreatFairyNPCs\[\]\s*=\s*\{(?P<body>.*?)\};", text, re.S)
    if not match:
        return {}
    field_info = bitfields.get("gOotExtraFlags", {}).get("greatFairies")
    if field_info is None:
        return {}

    sources: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, symbol in enumerate(OOT_NPC_REF_RE.findall(match.group("body"))):
        raw_bits = field_info["raw_bits"]
        if index >= len(raw_bits):
            continue
        append_unique_source(
            sources[symbol],
            oot_bit_source("gOotExtraFlags", "gOotExtraFlags.greatFairies", raw_bits[index]),
        )
    return sources


def split_words(value: str) -> list[str]:
    words: list[str] = []
    for part in value.split("_"):
        part = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", part)
        words.extend(word.upper() for word in part.split("_") if word)
    return words


def word_matches_symbol(word: str, symbol_words: set[str]) -> bool:
    return any(word == symbol_word or word.startswith(symbol_word) or symbol_word.startswith(word) for symbol_word in symbol_words)


def oot_field_matches_symbol(field: str, symbol: str) -> bool:
    field_words = split_words(field)
    symbol_words = set(split_words(symbol))
    return all(word_matches_symbol(word, symbol_words) for word in field_words)


def append_oot_extra_field_source(
    sources: list[dict[str, Any]],
    field: str,
    bitfields: dict[str, dict[str, dict[str, Any]]],
) -> None:
    field_info = bitfields.get("gOotExtraFlags", {}).get(field)
    if field_info is None or not field_info["raw_bits"]:
        return
    append_unique_source(sources, oot_bit_source("gOotExtraFlags", f"gOotExtraFlags.{field}", field_info["raw_bits"][0]))


def discover_oot_sources(repo_root: pathlib.Path, hints: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    oot_save_header = repo_root / "packages/generator/include/combo/oot/save.h"
    events_header = repo_root / "packages/generator/include/combo/common/events.h"
    bitfields = parse_bitfield_structs(oot_save_header, OOT_EXTRA_STRUCTS)
    quest_bits = parse_oot_quest_bits(oot_save_header)
    events = parse_oot_events(events_header)
    target_symbols = set(hints)
    discovered: dict[str, list[dict[str, Any]]] = defaultdict(list)

    source_roots = [
        repo_root / "packages/generator/src/oot",
        repo_root / "packages/generator/src/common",
    ]
    source_paths = [path for root in source_roots for path in root.rglob("*.c")]

    for path in source_paths:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for symbol, sources in discover_oot_great_fairy_sources(text, bitfields).items():
            if not target_symbols or symbol in target_symbols:
                append_unique_sources(discovered[symbol], sources)

        file_npcs = sorted(set(OOT_NPC_REF_RE.findall(text)))
        if target_symbols:
            file_npcs = [symbol for symbol in file_npcs if symbol in target_symbols]
        file_fields = sorted(set(OOT_EXTRA_ASSIGN_RE.findall(text)))
        for field in file_fields:
            for symbol in file_npcs:
                if oot_field_matches_symbol(field, symbol):
                    append_oot_extra_field_source(discovered[symbol], field, bitfields)

        for symbol, macro in OOT_DIRECT_NPC_EVENT_RE.findall(text):
            if target_symbols and symbol not in target_symbols:
                continue
            source = oot_source_from_event_macro(events, macro)
            if source is not None:
                append_unique_source(discovered[symbol], source)

        for body in iter_c_functions(text):
            npcs = sorted(set(OOT_NPC_REF_RE.findall(body)))
            if target_symbols:
                npcs = [symbol for symbol in npcs if symbol in target_symbols]
            if not npcs:
                continue

            fields = sorted(set(OOT_EXTRA_ASSIGN_RE.findall(body)))
            if fields:
                for field in fields:
                    for symbol in npcs:
                        if len(npcs) == 1 or oot_field_matches_symbol(field, symbol):
                            append_oot_extra_field_source(discovered[symbol], field, bitfields)

            macros = extract_oot_event_macros(body, events)
            literal_sources = extract_oot_literal_event_sources(body)
            for symbol in npcs:
                source = best_matching_event_source(symbol, macros, events)
                if source is not None:
                    append_unique_source(discovered[symbol], source)
                elif len(npcs) == 1 and len(literal_sources) == 1:
                    append_unique_source(discovered[symbol], literal_sources[0])

            if len(npcs) == 1 and "gSave.info.inventory.quest.gerudoCard" in body:
                bit = quest_bits.get("GERUDO_CARD")
                if bit is not None:
                    append_unique_source(
                        discovered[npcs[0]],
                        oot_bit_source("inventoryQuest", "gOotSave.inventory.quest.value", bit),
                    )

    return discovered


def supported_hint_sources(hint: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for source in hint.get("sources", []):
        if source.get("group") in SUPPORTED_OOT_GROUPS:
            append_unique_source(sources, source)
    return sources


def build_oot_entries(
    repo_root: pathlib.Path,
    hints: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str], int]:
    discovered = discover_oot_sources(repo_root, hints)
    if hints:
        symbols = list(hints)
        symbols.extend(sorted(set(OOT_SOURCE_OVERRIDES) - set(hints)))
    else:
        symbols = sorted(set(discovered) | set(OOT_SOURCE_OVERRIDES))
    warnings: list[str] = []
    no_discovered_hinted_symbols: list[str] = []
    preserved_hint_source_count = 0
    entries: list[dict[str, Any]] = []

    for symbol in symbols:
        hint = hints.get(symbol, {})
        hinted_sources = supported_hint_sources(hint)
        discovered_sources = discovered.get(symbol, [])
        override_sources = OOT_SOURCE_OVERRIDES.get(symbol, [])
        if hinted_sources and source_groups(discovered_sources) >= source_groups(hinted_sources):
            sources = discovered_sources
        elif hinted_sources:
            sources = hinted_sources
            preserved_hint_source_count += 1
            if discovered_sources:
                warnings.append(f"OOT_{symbol}: kept hinted sources; discovered only {sorted(source_groups(discovered_sources))}")
            else:
                no_discovered_hinted_symbols.append(f"OOT_{symbol}")
        else:
            sources = discovered_sources

        if override_sources:
            sources = override_sources

        if not sources:
            continue

        entry: dict[str, Any] = {
            "symbol": symbol,
            "sources": sources,
        }
        if hint.get("note"):
            entry["note"] = hint["note"]
        entries.append(entry)

    if no_discovered_hinted_symbols:
        warnings.append(
            "no source discovered, kept hinted sources: "
            + ", ".join(sorted(no_discovered_hinted_symbols))
        )

    return entries, warnings, preserved_hint_source_count


def quest_source(symbol: str, quest_fields: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    field = QUEST_SYMBOL_FIELDS.get(symbol)
    if field is None:
        return None
    info = quest_fields.get(field)
    if info is None:
        return None
    return {
        "group": "inventoryQuest",
        "field": "gMmSave.info.inventory.quest.value",
        "mask": f"0x{info['logical_mask']:08x}",
    }


def boss_source(symbol: str) -> dict[str, Any] | None:
    bit = BOSS_SYMBOL_BITS.get(symbol)
    if bit is None:
        return None
    return {
        "group": "gMmExtraBoss",
        "field": "gMmExtraBoss",
        "mask": f"0x{1 << bit:08x}",
    }


def discover_mm_dungeon_clear_symbols(
    repo_root: pathlib.Path,
    week_events: dict[str, tuple[int, int]],
) -> dict[str, dict[str, Any]]:
    boss_metadata_path = repo_root / "packages/generator/lib/combo/logic/boss.ts"
    if not boss_metadata_path.is_file():
        return {}

    discovered: dict[str, dict[str, Any]] = {}
    text = boss_metadata_path.read_text(encoding="utf-8")
    for match in MM_BOSS_EVENT_CLEAR_RE.finditer(text):
        dungeon = match.group("dungeon")
        symbol = match.group("symbol")
        event_macro = MM_DUNGEON_CLEAR_EVENT_MACROS.get(dungeon)
        name = MM_DUNGEON_CLEAR_NAMES.get(dungeon)
        if event_macro is None or name is None:
            continue
        event_info = week_events.get(event_macro)
        if event_info is None:
            continue
        byte_index, mask = event_info
        discovered[symbol] = {
            "name": name,
            "note": f"{name} dungeon clear state",
            "sources": [
                {
                    "group": "weekEventReg",
                    "field": f"gMmSave.info.weekEventReg[{byte_index}]",
                    "mask": f"0x{mask:02x}",
                }
            ],
        }
    return discovered


def build_entries(repo_root: pathlib.Path, hints: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    data_root = repo_root / "packages/data/src"
    npc_ids = load_npc_ids(data_root / "defs/npc.yml")
    pool_names = load_pool_names(data_root / "pool/pool_mm.csv")
    mm_save_header = repo_root / "packages/generator/include/combo/mm/save.h"
    bitfields = parse_bitfield_structs(mm_save_header)
    quest_fields = parse_quest_fields(mm_save_header)
    week_events = parse_week_events(repo_root / "packages/generator/include/combo/common/events.h")
    discovered = discover_simple_sources(repo_root, bitfields, week_events)
    dungeon_clear_symbols = discover_mm_dungeon_clear_symbols(repo_root, week_events)

    warnings: list[str] = []
    entries: list[dict[str, Any]] = []

    for symbol, code in sorted(npc_ids.items(), key=lambda item: item[1]):
        hint = hints.get(symbol, {})
        hinted_sources: list[dict[str, Any]] = []
        for source in hint.get("sources", []):
            if source.get("group") in SUPPORTED_GROUPS:
                append_unique_source(hinted_sources, source)

        discovered_sources = discovered.get(symbol, [])
        override_sources = MM_SOURCE_OVERRIDES.get(symbol, [])
        sources: list[dict[str, Any]] = []
        if hinted_sources and not should_prefer_discovered_mm_sources(hinted_sources, discovered_sources):
            sources = hinted_sources
        else:
            for source in discovered_sources:
                append_unique_source(sources, source)
            if not discovered_sources:
                q_source = quest_source(symbol, quest_fields)
                if q_source is not None:
                    append_unique_source(sources, q_source)
                b_source = boss_source(symbol)
                if b_source is not None:
                    append_unique_source(sources, b_source)

        if override_sources:
            sources = list(override_sources)

        entry: dict[str, Any] = {
            "code": f"0x{code:02x}",
            "symbol": symbol,
        }
        if sources:
            enriched_sources: list[dict[str, Any]] = []
            all_bits: list[int] = []
            byte_index: int | None = None
            mask: int | None = None
            for source in sources:
                enriched, bits, source_byte_index, source_mask = enrich_source(source, bitfields)
                append_unique_source(enriched_sources, enriched)
                all_bits.extend(bits)
                if byte_index is None and source_byte_index is not None:
                    byte_index = source_byte_index
                if mask is None and source_mask is not None:
                    mask = source_mask
            entry["sources"] = enriched_sources
            if hint.get("note"):
                entry["note"] = hint["note"]
            name = pool_names.get(symbol) or hint.get("name")
            if name:
                entry["name"] = name
            unique_bits = sorted(set(all_bits))
            if unique_bits:
                entry["bits"] = unique_bits
            if byte_index is not None and mask is not None:
                entry["byteIndex"] = byte_index
                entry["mask"] = mask
        elif symbol in pool_names or hint.get("name"):
            entry["name"] = pool_names.get(symbol) or hint["name"]
            warnings.append(f"{symbol}: no source found")

        entries.append(entry)

    for symbol in sorted(dungeon_clear_symbols):
        if symbol in npc_ids:
            continue

        hint = hints.get(symbol, {})
        sources: list[dict[str, Any]] = []
        for source in hint.get("sources", []):
            if source.get("group") in SUPPORTED_GROUPS:
                append_unique_source(sources, source)
        if not sources:
            for source in dungeon_clear_symbols[symbol].get("sources", []):
                append_unique_source(sources, source)

        entry: dict[str, Any] = {
            "symbol": symbol,
        }
        if sources:
            enriched_sources: list[dict[str, Any]] = []
            all_bits: list[int] = []
            byte_index: int | None = None
            mask: int | None = None
            for source in sources:
                enriched, bits, source_byte_index, source_mask = enrich_source(source, bitfields)
                append_unique_source(enriched_sources, enriched)
                all_bits.extend(bits)
                if byte_index is None and source_byte_index is not None:
                    byte_index = source_byte_index
                if mask is None and source_mask is not None:
                    mask = source_mask
            entry["sources"] = enriched_sources
            if hint.get("note"):
                entry["note"] = hint["note"]
            elif dungeon_clear_symbols[symbol].get("note"):
                entry["note"] = dungeon_clear_symbols[symbol]["note"]
            name = hint.get("name") or dungeon_clear_symbols[symbol].get("name")
            if name:
                entry["name"] = name
            unique_bits = sorted(set(all_bits))
            if unique_bits:
                entry["bits"] = unique_bits
            if byte_index is not None and mask is not None:
                entry["byteIndex"] = byte_index
                entry["mask"] = mask
        elif hint.get("name") or dungeon_clear_symbols[symbol].get("name"):
            entry["name"] = hint.get("name") or dungeon_clear_symbols[symbol]["name"]
            warnings.append(f"{symbol}: no source found")

        entries.append(entry)

    return entries, warnings


def comparable_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def format_json(value: Any, current_indent: int = 0) -> str:
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for key, item in value.items():
            lines.append(
                " " * (current_indent + 2)
                + f"{json.dumps(key)}: {format_json(item, current_indent + 2)}"
            )
        return "{\n" + ",\n".join(lines) + "\n" + " " * current_indent + "}"

    if isinstance(value, list):
        if not value:
            return "[]"
        if all(not isinstance(item, (dict, list)) for item in value):
            return "[" + ", ".join(json.dumps(item) for item in value) + "]"
        lines = [" " * (current_indent + 2) + format_json(item, current_indent + 2) for item in value]
        return "[\n" + ",\n".join(lines) + "\n" + " " * current_indent + "]"

    return json.dumps(value)


def fallback_sort_key(value: dict[str, Any]) -> tuple[Any, ...]:
    source = value.get("source", {})
    return (
        value.get("symbol", ""),
        value.get("name", ""),
        source.get("group", ""),
        source.get("field", ""),
        source.get("mask", ""),
        source.get("bit", -1),
        source.get("flag", -1),
        value.get("bit", -1),
        value.get("byteIndex", -1),
        value.get("mask", -1),
    )


def normalize_fallback_source(source: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {
        "group": source.get("group", ""),
        "field": source.get("field", ""),
    }
    for key in ("mask", "bit", "flag"):
        if key in source:
            normalized[key] = source[key]
    return normalized


def build_mm_fallback_baseline(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    baseline: list[dict[str, Any]] = []
    for entry in entries:
        name = entry.get("name")
        if not entry.get("symbol") or not name:
            continue
        for source in entry.get("sources", []):
            group = source.get("group", "")
            if group not in MM_RUNTIME_FALLBACK_GROUPS:
                continue
            record: dict[str, Any] = {
                "symbol": entry["symbol"],
                "name": name,
                "source": normalize_fallback_source(source),
            }
            if group == "weekEventReg":
                if "byteIndex" in entry:
                    record["byteIndex"] = entry["byteIndex"]
                if "mask" in entry:
                    record["mask"] = entry["mask"]
            else:
                bits = entry.get("bits", [])
                if not bits:
                    continue
                record["bit"] = bits[0]
            baseline.append(record)
    return sorted(baseline, key=fallback_sort_key)


def build_oot_fallback_baseline(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    baseline: list[dict[str, Any]] = []
    for entry in entries:
        symbol = entry.get("symbol")
        if not symbol:
            continue
        for source in entry.get("sources", []):
            if source.get("group", "") not in OOT_RUNTIME_FALLBACK_GROUPS:
                continue
            baseline.append(
                {
                    "symbol": symbol,
                    "source": normalize_fallback_source(source),
                }
            )
    return sorted(baseline, key=fallback_sort_key)


def check_or_update_fallback_baseline(
    label: str,
    baseline_path: pathlib.Path | None,
    generated: list[dict[str, Any]],
    update: bool,
) -> bool:
    if baseline_path is None:
        return True

    if update:
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(format_json(generated) + "\n", encoding="utf-8")
        print(f"updated {label} fallback baseline: {baseline_path}", file=sys.stderr)
        return True

    if not baseline_path.is_file():
        print(
            f"{label} fallback baseline missing: {baseline_path}; "
            "rerun with --update-fallback-baseline after reviewing the generated fallbacks",
            file=sys.stderr,
        )
        return False

    expected = json.loads(baseline_path.read_text(encoding="utf-8"))
    if expected == generated:
        return True

    expected_keys = {comparable_json(record): record for record in expected}
    generated_keys = {comparable_json(record): record for record in generated}
    added = sorted(
        (generated_keys[key] for key in generated_keys.keys() - expected_keys.keys()),
        key=fallback_sort_key,
    )
    removed = sorted(
        (expected_keys[key] for key in expected_keys.keys() - generated_keys.keys()),
        key=fallback_sort_key,
    )

    print(
        f"{label} fallback baseline changed: {len(added)} added, {len(removed)} removed",
        file=sys.stderr,
    )
    for record in added[:25]:
        print(f"added: {json.dumps(record, sort_keys=True)}", file=sys.stderr)
    for record in removed[:25]:
        print(f"removed: {json.dumps(record, sort_keys=True)}", file=sys.stderr)
    if len(added) > 25 or len(removed) > 25:
        print("warning: fallback baseline diff truncated", file=sys.stderr)
    return False


def main() -> int:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    mm_output_path = pathlib.Path(args.mm_output).resolve()
    oot_output_path = pathlib.Path(args.oot_output).resolve() if args.oot_output else None
    fallback_baseline_path = pathlib.Path(args.fallback_baseline).resolve() if args.fallback_baseline else None
    oot_fallback_baseline_path = (
        pathlib.Path(args.oot_fallback_baseline).resolve() if args.oot_fallback_baseline else None
    )

    if not repo_root.is_dir():
        print(f"OoTMM repository not found: {repo_root}", file=sys.stderr)
        return 1

    hint_path: pathlib.Path | None = None
    if args.hints:
        hint_path = pathlib.Path(args.hints).resolve()
    elif not args.no_existing_hints and mm_output_path.is_file():
        hint_path = mm_output_path

    oot_hint_path: pathlib.Path | None = None
    if args.oot_hints:
        oot_hint_path = pathlib.Path(args.oot_hints).resolve()
    elif oot_output_path is not None and not args.no_existing_hints and oot_output_path.is_file():
        oot_hint_path = oot_output_path

    try:
        entries, warnings = build_entries(repo_root, load_hints(hint_path))
        oot_entries, oot_warnings, oot_preserved_hint_source_count = (
            build_oot_entries(repo_root, load_hints(oot_hint_path)) if oot_output_path is not None else ([], [], 0)
        )
    except Exception as exc:
        print(f"failed to generate special locations: {exc}", file=sys.stderr)
        return 1

    mm_output_path.parent.mkdir(parents=True, exist_ok=True)
    mm_output_path.write_text(format_json(entries) + "\n", encoding="utf-8")
    if oot_output_path is not None:
        oot_output_path.parent.mkdir(parents=True, exist_ok=True)
        oot_output_path.write_text(format_json(oot_entries) + "\n", encoding="utf-8")

    baseline_ok = check_or_update_fallback_baseline(
        "MM",
        fallback_baseline_path,
        build_mm_fallback_baseline(entries),
        args.update_fallback_baseline,
    )
    if oot_output_path is not None:
        baseline_ok = (
            check_or_update_fallback_baseline(
                "OoT",
                oot_fallback_baseline_path,
                build_oot_fallback_baseline(oot_entries),
                args.update_fallback_baseline,
            )
            and baseline_ok
        )

    if warnings:
        print(f"generated {len(entries)} entries with {len(warnings)} missing source hints", file=sys.stderr)
        for warning in warnings[:25]:
            print(f"warning: {warning}", file=sys.stderr)
        if len(warnings) > 25:
            print(f"warning: ... {len(warnings) - 25} more", file=sys.stderr)
    if oot_output_path is not None:
        print(f"generated {len(oot_entries)} OoT special location entries", file=sys.stderr)
        if oot_warnings:
            print(f"{oot_preserved_hint_source_count} OoT entries used preserved hint sources", file=sys.stderr)
            for warning in oot_warnings[:25]:
                print(f"warning: {warning}", file=sys.stderr)
            if len(oot_warnings) > 25:
                print(f"warning: ... {len(oot_warnings) - 25} more", file=sys.stderr)
    if not baseline_ok:
        print(
            "fallback baseline mismatch; review the diff before updating the baseline "
            "with make update-special-location-fallback-baselines",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
