#!/usr/bin/env python3

"""Report check slots that map to more than one location in OoTMM's data.

Before v33 this inspected the raw xflag tables for OoT bits shared by vanilla
and MQ actors. Since v33 the generated ``data-checks.json`` is the source of
truth, so this simply runs the same mapping as ``generate_locations.py`` and
prints the conflict tables it derives.
"""

from __future__ import annotations

import argparse
import pathlib
from collections import defaultdict

import generate_locations


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OOTMM_REPO = REPO_ROOT / 'OoTMM'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Inspect conflicting check mappings in the OoTMM data.',
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
    mapping = generate_locations.build_location_mapping(repo_root)

    dungeon_conflicts: dict[int, int] = defaultdict(int)

    for entry in mapping['bitmap_conflicts']:
        print(
            f"{entry['block']} bit {entry['bit']} conflict: "
            f"{entry['vanilla']} (vanilla) vs {entry['mq']} (MQ)"
        )
        dungeon_conflicts[entry['dungeonMq']] += 1

    for entry in mapping['scene_conflicts']:
        print(
            f"{entry['key']} conflict: "
            f"{entry['vanilla']} (vanilla) vs {entry['mq']} (MQ)"
        )
        dungeon_conflicts[entry['dungeonMq']] += 1

    print('\nPer-Dungeon Summary:')
    if not dungeon_conflicts:
        print('no conflicts')
    for dungeon_mq in sorted(dungeon_conflicts):
        print(f'dungeon {dungeon_mq}: {dungeon_conflicts[dungeon_mq]} conflicts')


if __name__ == '__main__':
    main()
