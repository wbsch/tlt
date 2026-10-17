#!/usr/bin/env python3

"""Probe raw OoT xflag actor ids against OoTMM's generated xflag data.

Before v33 this walked the per-scene ``xflag_table_*.bin`` binaries to compute
the save bit a raw actor id resolved to. Since v33 OoTMM ships
``data-checks-xflags.json``, which already maps the actor identity key to its
xflag id, so this looks the id up directly.
"""

from __future__ import annotations

import argparse
import json
import pathlib


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OOTMM_REPO = REPO_ROOT / 'OoTMM'
DEFAULT_RAW_IDS = ['0x00305', '0x00306', '0x00307']

MATCH_SIBLING = 0x40000000


def parse_int(value: str) -> int:
    return int(value, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Probe specific OoT xflag raw IDs and print the resolved check.',
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


def load_json(path: pathlib.Path) -> object:
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)


def actor_match_key(scene_id: int, raw_id: int) -> int:
    actor_id = raw_id & 0xFF
    room_id = (raw_id >> 8) & 0x3F
    setup_id = (raw_id >> 14) & 0x3
    return (
        actor_id
        | (room_id << 8)
        | (setup_id << 16)
        | ((scene_id & 0xFF) << 18)
    )


def main() -> None:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    data_lib = repo_root / 'packages/data/dist/lib'
    raw_ids = args.raw_id or DEFAULT_RAW_IDS
    scene_id = parse_int(args.scene)

    matches = load_json(data_lib / 'data-checks-xflags.json')
    checks = load_json(data_lib / 'data-checks.json')

    names_by_id: dict[int, list[str]] = {}
    for check in checks:
        if check.get('game') != 'oot' or check.get('ov') != 'xflag':
            continue
        xflag_id = int(check['key']) & 0xFFFF
        names_by_id.setdefault(xflag_id, []).append(check['location'])

    for raw_id_value in raw_ids:
        raw_id = parse_int(raw_id_value)
        base_key = actor_match_key(scene_id, raw_id)
        slice_id = raw_id >> 16
        key = base_key
        if slice_id:
            base_id = matches.get(str(base_key))
            if base_id is None:
                print(f'Raw ID 0x{raw_id:05x}: no base match for slice {slice_id}')
                continue
            key = MATCH_SIBLING | ((slice_id & 0x3F) << 16) | int(base_id)

        xflag_id = matches.get(str(key))
        if xflag_id is None:
            print(f'Raw ID 0x{raw_id:05x}: no xflag id (key 0x{key:08x})')
            continue

        collisions = ', '.join(sorted(names_by_id.get(int(xflag_id), [])))
        print(f'Raw ID 0x{raw_id:05x}: xflag id {xflag_id}, check: {collisions}')


if __name__ == '__main__':
    main()
