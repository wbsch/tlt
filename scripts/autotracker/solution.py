#!/usr/bin/env python3

from __future__ import annotations

import argparse
import pathlib

import generate_locations


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OOTMM_REPO = REPO_ROOT / 'OoTMM'
DEFAULT_RAW_IDS = ['0x00305', '0x00306', '0x00307']


def parse_int(value: str) -> int:
    return int(value, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Probe specific OoT xflag raw IDs and print their collision set.',
    )
    parser.add_argument(
        '--ootmm-repo',
        default=str(DEFAULT_OOTMM_REPO),
        help='Path to the OoTMM repository root. Defaults to the workspace OoTMM checkout.',
    )
    parser.add_argument(
        '--scene',
        default='0x01',
        help='Scene ID to probe, defaulting to Dodongo Cavern (0x01).',
    )
    parser.add_argument(
        '--raw-id',
        action='append',
        default=[],
        help='Raw xflag actor ID to probe. Repeat to inspect multiple IDs.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    raw_ids = args.raw_id or DEFAULT_RAW_IDS
    scene_id = parse_int(args.scene)

    oot_tables = {
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
    bit_limit = 0x2E8
    mapping = generate_locations.build_location_mapping(repo_root)

    reverse_mapping: dict[int, list[str]] = {}
    for entry in mapping.get('bitmap', []):
        if entry.get('block') != 'xflagsOot':
            continue
        bit = entry.get('bit')
        name = entry.get('name')
        if not isinstance(bit, int) or not isinstance(name, str):
            continue
        reverse_mapping.setdefault(bit, []).append(name)

    for raw_id_value in raw_ids:
        raw_id = parse_int(raw_id_value)
        bit = generate_locations.xflag_bit_position(
            scene_id,
            raw_id,
            oot_tables['scenes'],
            oot_tables['setups'],
            oot_tables['rooms'],
            bit_limit,
        )
        collisions = ', '.join(sorted(reverse_mapping.get(bit, []))) if bit is not None else ''
        print(f'Raw ID 0x{raw_id:05x}: bit {bit}, collisions: {collisions}')


if __name__ == '__main__':
    main()