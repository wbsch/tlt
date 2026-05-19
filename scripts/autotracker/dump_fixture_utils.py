#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import pathlib
from dataclasses import dataclass
from typing import Any


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE_ROOT = REPO_ROOT / 'tests' / 'fixtures' / 'autotracker' / 'dumps'


@dataclass(frozen=True)
class DumpRegion:
    name: str
    address: int
    size: int
    data: bytes


def parse_int(value: str) -> int:
    return int(value, 0)


def resolve_dump_path(value: str) -> pathlib.Path:
    candidate = pathlib.Path(value)
    if candidate.is_file():
      return candidate.resolve()

    fixture_candidate = FIXTURE_ROOT / value
    if fixture_candidate.is_file():
      return fixture_candidate.resolve()

    raise FileNotFoundError(
      f'Could not resolve dump fixture {value!r}. '
      f'Checked {candidate} and {fixture_candidate}.'
    )


def load_dump(path_or_name: str) -> tuple[pathlib.Path, dict[str, Any]]:
    path = resolve_dump_path(path_or_name)
    with path.open('r', encoding='utf-8') as handle:
        return path, json.load(handle)


def decode_regions(snapshot: dict[str, Any]) -> dict[str, DumpRegion]:
    raw_regions = snapshot.get('regions')
    if not isinstance(raw_regions, list):
        raise ValueError('Expected dump fixture to contain a regions list.')

    decoded: dict[str, DumpRegion] = {}
    for entry in raw_regions:
        if not isinstance(entry, dict):
            continue

        name = entry.get('name')
        address = entry.get('address')
        size = entry.get('size')
        encoding = entry.get('encoding')
        data = entry.get('data')

        if not isinstance(name, str) or not name:
            continue
        if not isinstance(address, str) or not isinstance(size, int):
            continue
        if encoding not in ('', 'base64'):
            continue
        if not isinstance(data, str) or not data:
            continue

        decoded_data = base64.b64decode(data)
        if len(decoded_data) != size:
            raise ValueError(
                f'Region {name} size mismatch: decoded {len(decoded_data)}, '
                f'expected {size}.'
            )

        decoded[name] = DumpRegion(
            name=name,
            address=parse_int(address),
            size=size,
            data=decoded_data,
        )

    return decoded


def require_region(regions: dict[str, DumpRegion], name: str) -> DumpRegion:
    region = regions.get(name)
    if region is None:
        available = ', '.join(sorted(regions))
        raise KeyError(
            f'Region {name!r} not found. Available regions: {available}'
        )
    return region


def read_region_bytes(
    regions: dict[str, DumpRegion],
    region_name: str,
    offset: int,
    length: int,
) -> bytes:
    region = require_region(regions, region_name)
    if offset < 0 or length < 0 or offset + length > len(region.data):
        raise ValueError(
            f'Requested slice {region_name}+0x{offset:x} length {length} '
            f'exceeds region size {len(region.data)}.'
        )
    return region.data[offset : offset + length]


def format_bytes_hex(data: bytes) -> str:
    return ' '.join(f'{byte:02x}' for byte in data)