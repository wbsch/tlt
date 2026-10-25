#!/usr/bin/env python3

"""Build the autotracker location tables from OoTMM's generated check data.

Since v33 OoTMM no longer ships the per-scene xflag bit tables or the
``data/pool/*.csv`` files this script used to read. The prebuilt
``data-checks.json`` now carries one record per check with a key that already
encodes everything the autotracker needs:

* ``ov`` is the overworld check type (``chest``, ``npc``, ``xflag``, ...).
* The low 16 bits of ``key`` are the value (scene flag bit, npc id, xflag id,
  ...).
* Bits 16-23 hold the scene id where the type needs one.

That removes the raw-id -> bit conversions this script used to do from
``xflag_table_*.bin`` and the pool CSVs. MQ dungeon checks are still folded
back onto their vanilla scene id (and, for the bitmap blocks, onto the shared
bit the game actually sets): the save's permanent scene flags are indexed by
the base scene id and the bitmap blocks share bits between vanilla and MQ, so
vanilla and MQ checks that share a flag bit are disambiguated at runtime by
the MQ dungeon state (the ``*_conflicts`` tables).
"""

import argparse
import json
import pathlib
import sys
from collections import defaultdict


DATA_LIB_DIR = "packages/data/dist/lib"
CHECKS_FILE = "data-checks.json"
NPCS_FILE = "data-npc.json"

# OoT MQ scenes occupy ids 0x70 + the vanilla dungeon scene id.
MQ_SCENE_OFFSET = 0x70

SCENE_KIND_BY_OV = {
    "chest": "chest",
    "collectible": "collect",
}

BITMAP_BLOCKS = {
    ("oot", "npc"): "npcOot",
    ("mm", "npc"): "npcMm",
    ("oot", "gs"): "gsOot",
    ("oot", "shop"): "shopsOot",
    ("mm", "shop"): "shopsMm",
    ("oot", "scrub"): "scrubsOot",
    ("oot", "sr"): "srOot",
    ("oot", "fish"): "caughtFishFlags",
}

XFLAG_BLOCKS = {
    "oot": "xflagsOot",
    "mm": "xflagsMm",
}

# Bitmap blocks where a shared bit can name either the vanilla or the MQ check.
MQ_CONFLICT_BLOCKS = {"gsOot", "srOot", "scrubsOot"}

# Vanilla scene name -> MQ dungeon index, matching OoTMM's MQ config enum.
MQ_DUNGEONS = {
    "OOT_DEKU_TREE": 0,
    "OOT_DODONGO_CAVERN": 1,
    "OOT_INSIDE_JABU_JABU": 2,
    "OOT_TEMPLE_FOREST": 3,
    "OOT_TEMPLE_FIRE": 4,
    "OOT_TEMPLE_WATER": 5,
    "OOT_TEMPLE_SPIRIT": 6,
    "OOT_TEMPLE_SHADOW": 7,
    "OOT_BOTTOM_OF_THE_WELL": 8,
    "OOT_ICE_CAVERN": 9,
    "OOT_GERUDO_TRAINING_GROUND": 10,
    "OOT_INSIDE_GANON_CASTLE": 11,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate autotracker location mappings from an OoTMM checkout."
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


def load_json(path: pathlib.Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def strip_game_prefix(game: str, value: str) -> str:
    prefix = f"{game.upper()} "
    return value[len(prefix):] if value.startswith(prefix) else value


def add_unique_mapping(
    table: dict[object, str], conflicts: set[object], key: object, name: str
) -> None:
    existing = table.get(key)
    if existing is None:
        table[key] = name
        return
    if existing != name:
        conflicts.add(key)


def finalize_mapping(
    table: dict[object, str], conflicts: set[object]
) -> dict[object, str]:
    return {key: value for key, value in table.items() if key not in conflicts}


def scene_check_key(game: str, scene_id: int, kind: str, bit: int) -> str:
    return f"{game.upper()}_{kind}_{scene_id}_{bit}"


def decode_key(key: int) -> tuple[int, int]:
    value = key & 0xFFFF
    scene_id = (key >> 16) & 0xFF
    return scene_id, value


def dungeon_index_for_scene(scene_name: str) -> int | None:
    if scene_name.endswith("_MQ"):
        scene_name = scene_name[: -len("_MQ")]
    return MQ_DUNGEONS.get(scene_name)


def fold_mq_bitmap_value(block: str, value: int) -> int:
    """Map an MQ bitmap check id back to the bit it shares with vanilla.

    OoTMM stores MQ variants in the same global bit arrays as the vanilla
    checks, but keeps their ids distinct in the check data:

    * silver rupees and scrubs use ``id & 0x7f`` (``Mark_SetOot`` /
      ``Mark_GetOot``)
    * skulltulas use ``id - 0xb0`` for ids above ``0xb0`` (``getGsFlagOot``)

    Folding here makes the bitmap tables point at the bit the save actually
    sets and turns the vanilla/MQ pairs into conflict entries that are
    resolved at runtime via the MQ dungeon state.
    """
    if block in ("srOot", "scrubsOot"):
        return value & 0x7F
    if block == "gsOot" and value > 0xB0:
        return value - 0xB0
    return value


def build_location_mapping(repo_root: pathlib.Path) -> dict[str, object]:
    data_lib = repo_root / DATA_LIB_DIR
    checks = load_json(data_lib / CHECKS_FILE)
    npcs = load_json(data_lib / NPCS_FILE)

    # npc id -> symbol (without the OOT_/MM_ prefix), per game.
    npc_symbols: dict[str, dict[int, str]] = {"oot": {}, "mm": {}}
    for symbol, npc_id in npcs.items():
        for game in ("oot", "mm"):
            prefix = f"{game.upper()}_"
            if symbol.startswith(prefix):
                npc_symbols[game][npc_id] = symbol[len(prefix):]

    scene_checks_raw: dict[str, str] = {}
    scene_conflicts: set[str] = set()
    scene_candidates: dict[str, list[tuple[str, str, bool]]] = defaultdict(list)

    bitmap_checks_raw: dict[tuple[str, int], str] = {}
    bitmap_conflicts: set[tuple[str, int]] = set()
    bitmap_candidates: dict[tuple[str, int], list[tuple[str, str, bool]]] = (
        defaultdict(list)
    )

    symbol_checks_raw: dict[tuple[str, str], str] = {}

    for check in checks:
        game = check["game"]
        ov = check["ov"]
        location = strip_game_prefix(game, check["location"])
        key = int(check["key"])
        scene_id, value = decode_key(key)
        scene_name = check.get("scene") or ""

        is_mq = game == "oot" and scene_name.endswith("_MQ")

        if ov in SCENE_KIND_BY_OV or (game == "mm" and ov == "sf"):
            if ov == "sf":
                kind = "switch1" if value >= 0x20 else "collect"
                bit = value & 0x1F
            else:
                kind = SCENE_KIND_BY_OV[ov]
                bit = value

            if is_mq:
                base_scene_id = scene_id - MQ_SCENE_OFFSET
                base_scene_name = scene_name[: -len("_MQ")]
            else:
                base_scene_id = scene_id
                base_scene_name = scene_name

            scene_key = scene_check_key(game, base_scene_id, kind, bit)
            add_unique_mapping(scene_checks_raw, scene_conflicts, scene_key, location)
            scene_candidates[scene_key].append((base_scene_name, location, is_mq))
            continue

        if ov == "cow":
            scene_key = f"{game.upper()}_cow_{value}"
            add_unique_mapping(scene_checks_raw, scene_conflicts, scene_key, location)
            continue

        if ov in ("gs", "shop", "scrub", "sr", "fish", "npc"):
            block = BITMAP_BLOCKS[(game, ov)]
            stored_value = (
                fold_mq_bitmap_value(block, value) if is_mq else value
            )
            bitmap_key = (block, stored_value)
            add_unique_mapping(
                bitmap_checks_raw, bitmap_conflicts, bitmap_key, location
            )

            if block in MQ_CONFLICT_BLOCKS:
                base_scene_name = (
                    scene_name[: -len("_MQ")] if is_mq else scene_name
                )
                bitmap_candidates[bitmap_key].append(
                    (base_scene_name, location, is_mq)
                )
            elif game == "oot" and ov == "npc":
                symbol = npc_symbols["oot"].get(value)
                if symbol is not None:
                    symbol_checks_raw.setdefault((game, symbol), location)
            continue

        if ov == "xflag":
            block = XFLAG_BLOCKS[game]
            bitmap_key = (block, value)
            add_unique_mapping(
                bitmap_checks_raw, bitmap_conflicts, bitmap_key, location
            )
            continue

        raise ValueError(f"unsupported check type {ov!r} for {check['location']!r}")

    scene_checks = [
        {"key": key, "name": name}
        for key, name in sorted(
            finalize_mapping(scene_checks_raw, scene_conflicts).items()
        )
    ]

    scene_conflict_entries = []
    for key, entries in sorted(scene_candidates.items()):
        if key not in scene_conflicts:
            continue
        vanilla = [location for _, location, is_mq in entries if not is_mq]
        mq = [location for _, location, is_mq in entries if is_mq]
        if len(vanilla) != 1 or len(mq) != 1:
            continue
        dungeon_mq = dungeon_index_for_scene(entries[0][0])
        if dungeon_mq is None:
            continue
        scene_conflict_entries.append(
            {
                "key": key,
                "dungeonMq": dungeon_mq,
                "vanilla": vanilla[0],
                "mq": mq[0],
            }
        )

    bitmap_checks = [
        {"block": block, "bit": bit, "name": name}
        for (block, bit), name in sorted(
            finalize_mapping(bitmap_checks_raw, bitmap_conflicts).items()
        )
    ]

    bitmap_conflict_entries = []
    for (block, bit), entries in sorted(bitmap_candidates.items()):
        if (block, bit) not in bitmap_conflicts:
            continue
        vanilla = [location for _, location, is_mq in entries if not is_mq]
        mq = [location for _, location, is_mq in entries if is_mq]
        if not vanilla or not mq:
            continue
        dungeon_mq = dungeon_index_for_scene(entries[0][0])
        if dungeon_mq is None:
            continue
        bitmap_conflict_entries.append(
            {
                "block": block,
                "bit": bit,
                "dungeonMq": dungeon_mq,
                "vanilla": vanilla,
                "mq": mq,
            }
        )

    # Only OOT symbols are emitted; MM symbols come from
    # special_locations_mm.json.
    symbol_checks = [
        {"game": game.upper(), "symbol": symbol, "name": name}
        for (game, symbol), name in sorted(symbol_checks_raw.items())
        if game == "oot"
    ]

    return {
        "scene": scene_checks,
        "scene_conflicts": scene_conflict_entries,
        "bitmap": bitmap_checks,
        "bitmap_conflicts": bitmap_conflict_entries,
        "symbols": symbol_checks,
    }


def main() -> int:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    output_path = pathlib.Path(args.output).resolve()

    if not repo_root.is_dir():
        print(f"OoTMM repository not found: {repo_root}", file=sys.stderr)
        return 1

    mapping = build_location_mapping(repo_root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
