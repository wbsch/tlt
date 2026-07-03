#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


GAMES = ("oot", "mm")
DEFAULT_DUPLICATE_WHITELIST_FILE = Path("scripts/map_duplicate_whitelist.txt")


def to_location_name(game: str, location_name: str) -> str:
    return f"{game.upper()} {location_name}"


def layout_to_game(layout: str) -> str | None:
    if layout == "oot" or layout == "mq" or layout.startswith("mq_"):
        return "oot"
    if layout == "mm" or layout.startswith("mm_"):
        return "mm"
    return None


def collect_world_location_names(world: dict[str, Any]) -> set[str]:
    names: set[str] = set()

    for layout_key, world_by_layout in (world or {}).items():
        game = layout_to_game(layout_key)
        if game is None or not isinstance(world_by_layout, dict):
            continue

        for area_set in world_by_layout.values():
            if not isinstance(area_set, dict):
                continue
            for area in area_set.values():
                if not isinstance(area, dict):
                    continue
                locations = area.get("locations", {})
                if not isinstance(locations, dict):
                    continue
                for location_name in locations.keys():
                    if isinstance(location_name, str):
                        names.add(to_location_name(game, location_name))

    return names


def collect_hint_location_names(hints: Any) -> set[str]:
    names: set[str] = set()

    # data-gossips.json (OoTMM v31+) is a flat list of records whose
    # location names already carry the game prefix ("OOT ..."/"MM ...").
    if isinstance(hints, list):
        for record in hints:
            if not isinstance(record, dict):
                continue
            location = record.get("location")
            game = record.get("game")
            if not isinstance(location, str) or game not in GAMES:
                continue
            prefix = f"{game.upper()} "
            if location.startswith(prefix):
                names.add(location)
            else:
                names.add(to_location_name(game, location))
        return names

    for game in GAMES:
        records = hints.get(game, []) if isinstance(hints, dict) else []
        if not isinstance(records, list):
            continue
        for record in records:
            if not isinstance(record, dict):
                continue
            location = record.get("location")
            if isinstance(location, str):
                names.add(to_location_name(game, location))

    return names


def build_reference_location_names(world: dict[str, Any], hints: Any) -> set[str]:
    # Keep this aligned with map-schema/devtool code sourcing:
    # the reference universe is the union of world + hints locations.
    return collect_world_location_names(world) | collect_hint_location_names(hints)


def extract_codes(node: Any) -> Iterable[str]:
    if isinstance(node, dict):
        for key in ("codes", "Codes"):
            value = node.get(key)
            if isinstance(value, str):
                yield value
            elif isinstance(value, list):
                for entry in value:
                    if isinstance(entry, str):
                        yield entry

        for child in node.values():
            yield from extract_codes(child)
    elif isinstance(node, list):
        for item in node:
            yield from extract_codes(item)


def is_todo_code(code: str) -> bool:
    return code.startswith("TODO ")


def load_duplicate_whitelist(file_path: Path) -> set[str]:
    if not file_path.is_file():
        return set()

    whitelist: set[str] = set()
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        whitelist.add(line)
    return whitelist


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Search all map JSON files and report duplicate codes as well as codes "
            "missing from the reference set (world + hints)."
        )
    )
    parser.add_argument(
        "--maps-dir",
        type=Path,
        default=Path("packs/ootmm/src/data/maps"),
        help="Directory containing the map files (Default: packs/ootmm/src/data/maps)",
    )
    parser.add_argument(
        "--world-file",
        type=Path,
        default=Path("OoTMM/packages/core/dist/data-world.json"),
        help="Path to data-world.json",
    )
    parser.add_argument(
        "--hints-file",
        type=Path,
        default=Path("OoTMM/packages/core/dist/data-gossips.json"),
        help="Path to data-gossips.json",
    )
    parser.add_argument(
        "--include-todo",
        action="store_true",
        help="Include TODO codes in the map analysis (ignored by default)",
    )
    parser.add_argument(
        "--duplicate-whitelist-file",
        type=Path,
        default=DEFAULT_DUPLICATE_WHITELIST_FILE,
        help=(
            "File with allowed duplicate locations (one per line, use # for comments). "
            "Default: scripts/map_duplicate_whitelist.txt"
        ),
    )
    parser.add_argument(
        "--allow-duplicate",
        action="append",
        default=[],
        help="Additional allowed duplicate locations (can be specified multiple times)",
    )
    parser.add_argument(
        "--build-warning-mode",
        action="store_true",
        help=(
            "For npm build: only emit a warning when duplicate or missing locations "
            "are found. Exit code remains 0."
        ),
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    maps_dir = (repo_root / args.maps_dir).resolve()
    world_file = (repo_root / args.world_file).resolve()
    hints_file = (repo_root / args.hints_file).resolve()
    duplicate_whitelist_file = (repo_root / args.duplicate_whitelist_file).resolve()

    if not maps_dir.is_dir():
        raise SystemExit(f"Map directory not found: {maps_dir}")
    if not world_file.is_file():
        raise SystemExit(f"World file not found: {world_file}")
    if not hints_file.is_file():
        raise SystemExit(f"Hints file not found: {hints_file}")

    world = json.loads(world_file.read_text(encoding="utf-8"))
    hints = json.loads(hints_file.read_text(encoding="utf-8"))

    duplicate_whitelist = load_duplicate_whitelist(duplicate_whitelist_file)
    duplicate_whitelist.update(args.allow_duplicate)

    reference_universe = build_reference_location_names(world, hints)

    counter: Counter[str] = Counter()
    map_files = sorted(maps_dir.glob("*.json"))
    for map_file in map_files:
        data = json.loads(map_file.read_text(encoding="utf-8"))
        for code in extract_codes(data):
            if not args.include_todo and is_todo_code(code):
                continue
            counter[code] += 1

    duplicate_locations = sorted(
        code
        for code, count in counter.items()
        if count > 1 and code not in duplicate_whitelist
    )
    map_locations = set(counter.keys())
    missing_locations = sorted(reference_universe - map_locations)

    if args.build_warning_mode:
        if duplicate_locations or missing_locations:
            print(
                "WARNING: Please check map locations by running "
                "python3 scripts/check_map_locations.py."
            )
            print(
                f"Details: {len(duplicate_locations)} duplicates, "
                f"{len(missing_locations)} missing."
            )
        return 0

    print(f"Map files scanned: {len(map_files)}")
    print()
    print("1) Locations duplicated across maps:")
    if duplicate_locations:
        for location in duplicate_locations:
            print(location)
    else:
        print("(none)")

    print()
    print(
        "2) Locations from the reference set (world + hints) "
        "that are missing from the maps:"
    )
    if missing_locations:
        for location in missing_locations:
            print(location)
    else:
        print("(none)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
