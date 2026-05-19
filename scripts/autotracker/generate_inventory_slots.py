#!/usr/bin/env python3

import argparse
import json
import pathlib
import re
import sys


SLOT_DEFINE_RE = re.compile(r"^#define\s+(ITS_(OOT|MM)_[A-Z0-9_]+)\s+0x([0-9a-fA-F]+)\s*$")
GI_ID_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),")
SOUL_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),\s+type:\s+SOUL,\s+add:\s+\[[A-Z_]+,\s+0x([0-9a-fA-F]+)\]")
COIN_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),.*add:\s+\[COIN,\s+([0-9]+)\]")
CLOCK_GI_RE = re.compile(r"^-\s+\{\s+id:\s+(MM_CLOCK[1-6]),.*add:\s+\[MM_CLOCK,\s+([0-9]+)\]")
SONG_NOTE_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),.*add:\s+\[SONG_NOTE,\s+(NOTES_SONG_[A-Z0-9_]+)\]")
NOTE_DEFINE_RE = re.compile(r"^#define\s+(NOTES_SONG_[A-Z0-9_]+)\s+0x([0-9a-fA-F]+)\s*$")
NOTES_MAX_RE = re.compile(r"^#define\s+NOTES_MAX\s+0x([0-9a-fA-F]+)\s*$")
MAX_SONG_NOTE_RE = re.compile(r"^\s*(\d+),\s*//\s*(NOTES_SONG_[A-Z0-9_]+)\s*$")

SHARED_COIN_COUNT = 4

OOT_OVERRIDES = {
    "STICKS": "STICK",
    "NUTS": "DEKU_NUTS",
    "ARROW_FIRE": "ARROW_FIRE",
    "SPELL_FIRE": "SPELL_FIRE",
    "BOMBCHU": "BOMBCHUS",
    "ARROW_ICE": "ARROW_ICE",
    "SPELL_WIND": "SPELL_WIND",
    "MAGIC_BEAN": "MAGIC_BEAN",
    "HAMMER": "HAMMER",
    "ARROW_LIGHT": "ARROW_LIGHT",
    "SPELL_LOVE": "SPELL_LOVE",
    "BOTTLE": "BOTTLE_1",
    "BOTTLE2": "BOTTLE_2",
    "BOTTLE3": "BOTTLE_3",
    "BOTTLE4": "BOTTLE_4",
    "TRADE_ADULT": "ADULT_TRADE",
    "TRADE_CHILD": "CHILD_TRADE",
}

MM_OVERRIDES = {
    "ARROW_FIRE": "ARROW_FIRE",
    "ARROW_ICE": "ARROW_ICE",
    "ARROW_LIGHT": "ARROW_LIGHT",
    "TRADE1": "TRADE_1",
    "BOMBCHU": "BOMBCHU",
    "STICKS": "STICK",
    "NUTS": "NUT",
    "BEANS": "MAGIC_BEAN",
    "TRADE2": "TRADE_2",
    "KEG": "POWDER_KEG",
    "PICTOBOX": "PICTOGRAPH_BOX",
    "TRADE3": "TRADE_3",
    "BOTTLE": "BOTTLE_1",
    "BOTTLE2": "BOTTLE_2",
    "BOTTLE3": "BOTTLE_3",
    "BOTTLE4": "BOTTLE_4",
    "BOTTLE5": "BOTTLE_5",
    "BOTTLE6": "BOTTLE_6",
}

EXPECTED_SLOT_COUNTS = {
    "OOT": 24,
    "MM": 48,
}

SLOT_QUANTITY_RULES = {
    "ITS_OOT_OCARINA": {"stages": [0x07, 0x08]},
    "ITS_OOT_HOOKSHOT": {"stages": [0x0A, 0x0B]},
    "ITS_OOT_MAGIC_BEAN": {"useBeansCount": True},
    "ITS_OOT_TRADE_ADULT": {
        "stages": [0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x14],
        "maxWithBottle": True,
    },
    "ITS_OOT_TRADE_CHILD": {
        "stages": [0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x9C, 0x9D, 0x14],
        "maxWithBottle": True,
    },
    "ITS_MM_OCARINA": {"stages": [0x05, 0x00]},
    "ITS_MM_TRADE1": {"stages": [0xB0, 0x28, 0x29, 0x2A, 0x2B, 0x2C]},
    "ITS_MM_TRADE2": {"stages": [0xAE, 0xB1, 0xB3, 0x2D, 0x2E]},
    "ITS_MM_HOOKSHOT": {"stages": [0x11, 0x0F]},
    "ITS_MM_GREAT_FAIRY_SWORD": {"stages": [0x10, 0xB5]},
    "ITS_MM_TRADE3": {"stages": [0xAF, 0xB2, 0xB4, 0x2F, 0x30]},
}

SHARED_STORAGE = {
    "baseOffset": 0x18000,
    "stride": 0x4000,
    "trackedSize": 0x846,
    "bitmaps": [
        {"name": "xflagsOot", "offset": 0x000, "size": 0x2E8},
        {"name": "npcOot", "offset": 0x2E8, "size": 0x20},
        {"name": "shopsOot", "offset": 0x308, "size": 0x08},
        {"name": "scrubsOot", "offset": 0x310, "size": 0x08},
        {"name": "srOot", "offset": 0x318, "size": 0x10},
        {"name": "xflagsMm", "offset": 0x370, "size": 0x34A},
        {"name": "npcMm", "offset": 0x6BA, "size": 0x20},
        {"name": "shopsMm", "offset": 0x6DA, "size": 0x04},
        {"name": "soulsEnemyOot", "offset": 0x7CC, "size": 8},
        {"name": "soulsEnemyMm", "offset": 0x7D4, "size": 8},
        {"name": "soulsBossOot", "offset": 0x7DC, "size": 2},
        {"name": "soulsBossMm", "offset": 0x7DE, "size": 1},
        {"name": "soulsNpcOot", "offset": 0x7DF, "size": 8},
        {"name": "soulsNpcMm", "offset": 0x7E7, "size": 8},
        {"name": "soulsAnimalOot", "offset": 0x7EF, "size": 2},
        {"name": "soulsAnimalMm", "offset": 0x7F1, "size": 2},
        {"name": "soulsMiscOot", "offset": 0x7F3, "size": 1},
        {"name": "soulsMiscMm", "offset": 0x7F4, "size": 1},
        {"name": "caughtFishFlags", "offset": 0x81D, "size": 5},
        {"name": "progressiveFlags", "offset": 0x845, "size": 1},
    ],
}

SOUL_SOURCE_SPECS = [
    {"prefix": "OOT_SOUL_ENEMY_", "block": "soulsEnemyOot"},
    {"prefix": "OOT_SOUL_BOSS_", "block": "soulsBossOot"},
    {"prefix": "OOT_SOUL_NPC_", "block": "soulsNpcOot"},
    {"prefix": "OOT_SOUL_ANIMAL_", "block": "soulsAnimalOot"},
    {"prefix": "OOT_SOUL_MISC_", "block": "soulsMiscOot"},
    {"prefix": "MM_SOUL_ENEMY_", "block": "soulsEnemyMm"},
    {"prefix": "MM_SOUL_BOSS_", "block": "soulsBossMm"},
    {"prefix": "MM_SOUL_NPC_", "block": "soulsNpcMm"},
    {"prefix": "MM_SOUL_ANIMAL_", "block": "soulsAnimalMm"},
    {"prefix": "MM_SOUL_MISC_", "block": "soulsMiscMm"},
]

SPECIAL_ITEM_SOURCES = [
    {"itemId": "OOT_KEY_RING_FOREST", "source": {"kind": "oot-derived-key-ring", "record": 3}},
    {"itemId": "OOT_KEY_RING_FIRE", "source": {"kind": "oot-derived-key-ring", "record": 4}},
    {"itemId": "OOT_KEY_RING_WATER", "source": {"kind": "oot-derived-key-ring", "record": 5}},
    {"itemId": "OOT_KEY_RING_SPIRIT", "source": {"kind": "oot-derived-key-ring", "record": 6}},
    {"itemId": "OOT_KEY_RING_SHADOW", "source": {"kind": "oot-derived-key-ring", "record": 7}},
    {"itemId": "OOT_KEY_RING_BOTW", "source": {"kind": "oot-derived-key-ring", "record": 8}},
    {"itemId": "OOT_KEY_RING_GTG", "source": {"kind": "oot-derived-key-ring", "record": 11}},
    {"itemId": "OOT_KEY_RING_GF", "source": {"kind": "oot-derived-key-ring", "record": 12}},
    {"itemId": "OOT_KEY_RING_GANON", "source": {"kind": "oot-derived-key-ring", "record": 13}},
    {"itemId": "OOT_KEY_RING_TCG", "source": {"kind": "oot-derived-key-ring", "record": 16}},
    {"itemId": "OOT_SKELETON_KEY", "source": {"kind": "oot-derived-skeleton-key"}},
    {"itemId": "MM_KEY_RING_WF", "source": {"kind": "mm-derived-key-ring", "record": 0}},
    {"itemId": "MM_KEY_RING_SH", "source": {"kind": "mm-derived-key-ring", "record": 1}},
    {"itemId": "MM_KEY_RING_GB", "source": {"kind": "mm-derived-key-ring", "record": 2}},
    {"itemId": "MM_KEY_RING_ST", "source": {"kind": "mm-derived-key-ring", "record": 3}},
    {"itemId": "OOT_PLATINUM_TOKEN", "source": {"kind": "oot-derived-platinum-token"}},
    {"itemId": "MM_PLATINUM_TOKEN", "source": {"kind": "mm-derived-platinum-token"}},
    {"itemId": "OOT_RUPEE_MAGICAL", "source": {"kind": "oot-derived-magical-rupee"}},
    {"itemId": "MM_SKELETON_KEY", "source": {"kind": "mm-derived-skeleton-key"}},
    {"itemId": "MM_TRANSCENDENT_FAIRY", "source": {"kind": "mm-derived-transcendent-fairy"}},
    {"itemId": "OOT_SCALE_BRONZE", "source": {"kind": "shared-bitmap-bit", "block": "progressiveFlags", "bit": 4}},
    {"itemId": "MM_SCALE_BRONZE", "source": {"kind": "shared-bitmap-bit", "block": "progressiveFlags", "bit": 3}},
    {"itemId": "MM_HAMMER", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 6}},
    {"itemId": "MM_SPELL_FIRE", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 10}},
    {"itemId": "MM_MOON_TEAR", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 11}},
    {"itemId": "MM_DEED_LAND", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 12}},
    {"itemId": "MM_DEED_SWAMP", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 13}},
    {"itemId": "MM_DEED_MOUNTAIN", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 14}},
    {"itemId": "MM_DEED_OCEAN", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 15}},
    {"itemId": "MM_SPELL_WIND", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 5}},
    {"itemId": "MM_BOOTS_IRON", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 6}},
    {"itemId": "MM_TUNIC_GORON", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 7}},
    {"itemId": "MM_ROOM_KEY", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 8}},
    {"itemId": "MM_LETTER_TO_MAMA", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 9}},
    {"itemId": "MM_SPELL_LOVE", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 0}},
    {"itemId": "MM_BOOTS_HOVER", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 1}},
    {"itemId": "MM_TUNIC_ZORA", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 2}},
    {"itemId": "MM_LETTER_TO_KAFEI", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 3}},
    {"itemId": "MM_PENDANT_OF_MEMORIES", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 4}},
    {"itemId": "OOT_WALLET5", "source": {"kind": "oot-extra-bit", "record": 2, "bit": 7}},
    {"itemId": "MM_WALLET5", "source": {"kind": "oot-extra-bit", "record": 13, "bit": 31}},
    {"itemId": "MM_STONE_OF_AGONY", "source": {"kind": "oot-extra-bit", "record": 13, "bit": 1}},
    {"itemId": "OOT_SPIN_UPGRADE", "source": {"kind": "oot-extra-bit", "record": 2, "bit": 26}},
    {"itemId": "MM_SPIN_UPGRADE", "source": {"kind": "mm-week-event-bit", "byte": 23, "bit": 1}},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate autotracker inventory slot mappings from an OoTMM checkout."
    )
    parser.add_argument(
        "--ootmm-repo",
        required=True,
        help="Path to the OoTMM repository root.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to the output JSON file.",
    )
    return parser.parse_args()


def tracker_id_for(slot_name: str, game: str) -> str:
    suffix = slot_name.removeprefix(f"ITS_{game}_")
    overrides = OOT_OVERRIDES if game == "OOT" else MM_OVERRIDES
    suffix = overrides.get(suffix, suffix)
    return f"{game}_{suffix}"


def extract_slots(items_header: pathlib.Path) -> dict[str, list[dict[str, object]]]:
    slots: dict[str, list[dict[str, object]]] = {"OOT": [], "MM": []}

    for line in items_header.read_text(encoding="utf-8").splitlines():
        match = SLOT_DEFINE_RE.match(line)
        if not match:
            continue

        slot_name, game, raw_index = match.groups()
        index = int(raw_index, 16)
        entry = {
            "index": index,
            "slot": slot_name,
            "itemId": tracker_id_for(slot_name, game),
        }
        quantity = SLOT_QUANTITY_RULES.get(slot_name)
        if quantity is not None:
            entry["quantity"] = quantity
        slots[game].append(entry)

    for game, entries in slots.items():
        entries.sort(key=lambda entry: int(entry["index"]))
        expected = EXPECTED_SLOT_COUNTS[game]
        if len(entries) != expected:
            raise ValueError(
                f"expected {expected} {game} slots in {items_header}, found {len(entries)}"
            )

        indices = [int(entry["index"]) for entry in entries]
        if indices != list(range(expected)):
            raise ValueError(f"{game} slot indices are not contiguous: {indices}")

    return {"oot": slots["OOT"], "mm": slots["MM"]}


def extract_gi_ids(gi_defs: pathlib.Path) -> list[str]:
    gi_ids: list[str] = []

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = GI_ID_RE.match(line)
        if match:
            gi_ids.append(match.group(1))

    return gi_ids


def extract_soul_entries(gi_defs: pathlib.Path) -> list[dict[str, int | str]]:
    soul_entries: list[dict[str, int | str]] = []

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = SOUL_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_add = match.groups()
        soul_entries.append(
            {
                "itemId": item_id,
                "bit": int(raw_add, 16) & 0x0FFF,
            }
        )

    return soul_entries


def extract_coin_entries(gi_defs: pathlib.Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_indices: set[int] = set()

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = COIN_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_index = match.groups()
        index = int(raw_index)
        if item_id in seen_ids:
            raise ValueError(f"duplicate coin item {item_id} in {gi_defs}")
        if index < 0 or index >= SHARED_COIN_COUNT:
            raise ValueError(f"coin item {item_id} has out-of-range index {index}")
        if index in seen_indices:
            raise ValueError(f"duplicate coin index {index} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-coin-count",
                    "index": index,
                },
            }
        )
        seen_ids.add(item_id)
        seen_indices.add(index)

    missing_indices = sorted(set(range(SHARED_COIN_COUNT)) - seen_indices)
    if missing_indices:
        raise ValueError(
            f"missing coin GI entries in {gi_defs} for indices: {', '.join(str(index) for index in missing_indices)}"
        )

    entries.sort(key=lambda entry: int(entry["source"]["index"]))
    return entries


def extract_clock_entries(gi_defs: pathlib.Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_bits: set[int] = set()

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = CLOCK_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_bit = match.groups()
        bit = int(raw_bit)
        if item_id in seen_ids:
            raise ValueError(f"duplicate clock item {item_id} in {gi_defs}")
        if bit < 0 or bit >= 8:
            raise ValueError(f"clock item {item_id} has out-of-range bit {bit}")
        if bit in seen_bits:
            raise ValueError(f"duplicate clock bit {bit} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-half-day-bit",
                    "bit": bit,
                },
            }
        )
        seen_ids.add(item_id)
        seen_bits.add(bit)

    missing_bits = sorted(set(range(6)) - seen_bits)
    if missing_bits:
        raise ValueError(
            f"missing clock GI entries in {gi_defs} for bits: {', '.join(str(bit) for bit in missing_bits)}"
        )

    entries.sort(key=lambda entry: int(entry["source"]["bit"]))
    return entries


def extract_note_indices(notes_header: pathlib.Path) -> dict[str, int]:
    note_indices: dict[str, int] = {}
    note_count: int | None = None

    for line in notes_header.read_text(encoding="utf-8").splitlines():
        match = NOTE_DEFINE_RE.match(line)
        if match:
            symbol, raw_index = match.groups()
            note_indices[symbol] = int(raw_index, 16)
            continue

        match = NOTES_MAX_RE.match(line)
        if match:
            note_count = int(match.group(1), 16)

    if note_count is None:
        raise ValueError(f"missing NOTES_MAX in {notes_header}")
    if len(note_indices) != note_count:
        raise ValueError(
            f"expected {note_count} song note defines in {notes_header}, found {len(note_indices)}"
        )

    indices = sorted(note_indices.values())
    if indices != list(range(note_count)):
        raise ValueError(f"song note indices are not contiguous: {indices}")

    return note_indices


def extract_note_max_counts(item_add_source: pathlib.Path) -> dict[str, int]:
    note_max_counts: dict[str, int] = {}
    in_song_note_array = False

    for line in item_add_source.read_text(encoding="utf-8").splitlines():
        if not in_song_note_array:
            if "const u8 kMaxSongNotes[] = {" in line:
                in_song_note_array = True
            continue

        if line.strip() == "};":
            break

        match = MAX_SONG_NOTE_RE.match(line)
        if not match:
            continue

        raw_count, symbol = match.groups()
        note_max_counts[symbol] = int(raw_count)

    if not note_max_counts:
        raise ValueError(f"missing kMaxSongNotes entries in {item_add_source}")

    return note_max_counts


def extract_song_note_entries(
    gi_defs: pathlib.Path,
    notes_header: pathlib.Path,
    item_add_source: pathlib.Path,
) -> list[dict[str, object]]:
    note_indices = extract_note_indices(notes_header)
    note_max_counts = extract_note_max_counts(item_add_source)

    missing_max_counts = sorted(set(note_indices) - set(note_max_counts))
    if missing_max_counts:
        raise ValueError(
            f"missing song note max counts in {item_add_source}: {', '.join(missing_max_counts)}"
        )

    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_symbols: set[str] = set()
    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = SONG_NOTE_GI_RE.match(line)
        if not match:
            continue

        item_id, note_symbol = match.groups()
        if item_id in seen_ids:
            raise ValueError(f"duplicate song note item {item_id} in {gi_defs}")
        if note_symbol not in note_indices:
            raise ValueError(f"unknown song note symbol {note_symbol} in {gi_defs}")
        if note_symbol in seen_symbols:
            raise ValueError(f"duplicate song note symbol {note_symbol} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-song-note",
                    "index": note_indices[note_symbol],
                    "max": note_max_counts[note_symbol],
                },
            }
        )
        seen_ids.add(item_id)
        seen_symbols.add(note_symbol)

    missing_symbols = sorted(set(note_indices) - seen_symbols)
    if missing_symbols:
        raise ValueError(f"missing song note GI entries in {gi_defs}: {', '.join(missing_symbols)}")

    return entries


def collect_prefixed_ids(gi_ids: list[str], prefix: str) -> list[str]:
    return [item_id for item_id in gi_ids if item_id.startswith(prefix)]


def ensure_ids_exist(gi_ids: list[str], required_ids: list[str], label: str) -> None:
    available = set(gi_ids)
    missing = [item_id for item_id in required_ids if item_id not in available]
    if missing:
        raise ValueError(f"missing {label} IDs in gi.yml: {', '.join(missing)}")


def build_catalog(
    gi_defs: pathlib.Path,
    notes_header: pathlib.Path,
    item_add_source: pathlib.Path,
) -> dict[str, object]:
    gi_ids = extract_gi_ids(gi_defs)
    soul_entries = extract_soul_entries(gi_defs)
    coin_entries = extract_coin_entries(gi_defs)
    clock_entries = extract_clock_entries(gi_defs)
    song_note_entries = extract_song_note_entries(gi_defs, notes_header, item_add_source)
    bitmap_sizes = {bitmap["name"]: bitmap["size"] for bitmap in SHARED_STORAGE["bitmaps"]}

    items: list[dict[str, object]] = []
    for spec in SOUL_SOURCE_SPECS:
        prefixed_souls = [entry for entry in soul_entries if str(entry["itemId"]).startswith(spec["prefix"])]
        max_bits = bitmap_sizes[spec["block"]] * 8
        used_bits: set[int] = set()
        for entry in prefixed_souls:
            item_id = str(entry["itemId"])
            bit = int(entry["bit"])
            if bit >= max_bits:
                raise ValueError(
                    f"{item_id} references out-of-range bit {bit} for {spec['block']}"
                )
            if bit in used_bits:
                raise ValueError(f"duplicate bit {bit} in {spec['block']}")
            used_bits.add(bit)
            items.append(
                {
                    "itemId": item_id,
                    "source": {
                        "kind": "shared-bitmap-bit",
                        "block": spec["block"],
                        "bit": bit,
                    },
                }
            )

    items.extend(song_note_entries)
    items.extend(coin_entries)
    items.extend(clock_entries)

    ensure_ids_exist(gi_ids, [entry["itemId"] for entry in SPECIAL_ITEM_SOURCES], "special item")
    items.extend(SPECIAL_ITEM_SOURCES)

    return {
        "shared": SHARED_STORAGE,
        "items": items,
    }


def main() -> int:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    items_header = repo_root / "packages/generator/include/combo/data/items.h"
    gi_defs = repo_root / "packages/data/src/defs/gi.yml"
    notes_header = repo_root / "packages/generator/include/combo/notes.h"
    item_add_source = repo_root / "packages/generator/src/common/item/item_add.c"
    output_path = pathlib.Path(args.output).resolve()

    if not items_header.is_file():
        print(f"items header not found: {items_header}", file=sys.stderr)
        return 1
    if not gi_defs.is_file():
        print(f"gi definitions not found: {gi_defs}", file=sys.stderr)
        return 1
    if not notes_header.is_file():
        print(f"notes header not found: {notes_header}", file=sys.stderr)
        return 1
    if not item_add_source.is_file():
        print(f"item add source not found: {item_add_source}", file=sys.stderr)
        return 1

    mapping = extract_slots(items_header)
    mapping["catalog"] = build_catalog(gi_defs, notes_header, item_add_source)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
