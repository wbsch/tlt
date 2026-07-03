#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import pathlib
from collections import defaultdict

import generate_locations


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OOTMM_REPO = REPO_ROOT / 'OoTMM'

XFLAG_TYPES = {
    'pot',
    'crate',
    'barrel',
    'grass',
    'tree',
    'bush',
    'rock',
    'soil',
    'fairy',
    'snowball',
    'hive',
    'rupee',
    'heart',
    'fairy_spot',
    'wonder',
    'butterfly',
    'redboulder',
    'icicle',
    'redice',
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Inspect conflicting OoT xflag bit mappings in the OoTMM data tables.',
    )
    parser.add_argument(
        '--ootmm-repo',
        default=str(DEFAULT_OOTMM_REPO),
        help='Path to the OoTMM repository root. Defaults to the workspace OoTMM checkout.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    data_root = repo_root / 'data'
    defs_root = data_root / 'defs'
    pool_root = data_root / 'pool'
    xflags_header = repo_root / 'packages/generator/include/combo/xflags_data.h'

    scenes = generate_locations.load_symbol_ids(defs_root / 'scenes.yml')
    xflag_counts = generate_locations.load_xflag_counts(xflags_header)
    tables = {
        'scenes': generate_locations.load_u16_table(
            repo_root / 'packages/generator/data/static/xflag_table_oot_scenes.bin'
        ),
        'setups': generate_locations.load_u16_table(
            repo_root / 'packages/generator/data/static/xflag_table_oot_setups.bin'
        ),
        'rooms': generate_locations.load_i16_table(
            repo_root / 'packages/generator/data/static/xflag_table_oot_rooms.bin'
        ),
    }

    bit_to_locations: dict[int, list[tuple[str, str]]] = defaultdict(list)
    with (pool_root / 'pool_oot.csv').open(newline='', encoding='utf-8') as handle:
        for row in csv.DictReader(handle, skipinitialspace=True):
            location_name = row['location'].strip()
            location_type = row['type'].strip()
            scene_name = row['scene'].strip()
            raw_id = row['id'].strip()
            if location_type not in XFLAG_TYPES or not scene_name or not raw_id:
                continue
            scene_id = scenes.get(f'OOT_{scene_name}')
            if scene_id is None:
                continue
            bit_position = generate_locations.xflag_bit_position(
                scene_id,
                int(raw_id, 0),
                tables['scenes'],
                tables['setups'],
                tables['rooms'],
                xflag_counts['OOT'] * 8,
            )
            if bit_position is not None:
                bit_to_locations[bit_position].append((location_name, scene_name))

    dungeon_conflicts: dict[str, int] = defaultdict(int)
    for bit_position in sorted(bit_to_locations):
        locations = sorted({location for location, _ in bit_to_locations[bit_position]})
        if len(locations) <= 1:
            continue
        print(f'Bit {bit_position} conflict: {", ".join(locations)}')
        for _, scene_name in bit_to_locations[bit_position]:
            dungeon_conflicts[scene_name] += 1

    print('\nPer-Dungeon Summary:')
    for scene_name in sorted(dungeon_conflicts):
        print(f'{scene_name}: {dungeon_conflicts[scene_name]} conflicts')


if __name__ == '__main__':
    main()