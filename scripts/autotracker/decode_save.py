#!/usr/bin/env python3

from __future__ import annotations

import argparse

from dump_fixture_utils import decode_regions, format_bytes_hex, load_dump, parse_int, read_region_bytes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Decode selected fields from a save-context region inside a dump fixture.',
    )
    parser.add_argument('dump', help='Fixture name under tests/fixtures/autotracker/dumps or a direct JSON path.')
    parser.add_argument('--region', required=True, help='Region name to decode, for example ootSaveContext or mmSaveContext.')
    parser.add_argument(
        '--field',
        action='append',
        required=True,
        metavar='OFFSET[:TYPE[:LABEL]]',
        help='Field spec such as 0xa0:u32:upgrades or 0xd4:bytes16:perm.',
    )
    return parser.parse_args()


def parse_field_spec(spec: str) -> tuple[int, str, str]:
    parts = spec.split(':', 2)
    offset = parse_int(parts[0])
    kind = parts[1] if len(parts) >= 2 and parts[1] else 'u8'
    label = parts[2] if len(parts) == 3 else f'{kind}@0x{offset:x}'
    return offset, kind, label


def decode_value(raw: bytes, kind: str) -> str:
    if kind == 'u8':
        return str(raw[0])
    if kind == 's8':
        return str(int.from_bytes(raw, 'big', signed=True))
    if kind == 'u16':
        return f'0x{int.from_bytes(raw, "big"):04x} ({int.from_bytes(raw, "big")})'
    if kind == 's16':
        return str(int.from_bytes(raw, 'big', signed=True))
    if kind == 'u32':
        return f'0x{int.from_bytes(raw, "big"):08x} ({int.from_bytes(raw, "big")})'
    if kind == 's32':
        return str(int.from_bytes(raw, 'big', signed=True))
    if kind.startswith('bytes'):
        return format_bytes_hex(raw)
    raise ValueError(f'Unsupported field type {kind!r}.')


def field_length(kind: str) -> int:
    if kind in {'u8', 's8'}:
        return 1
    if kind in {'u16', 's16'}:
        return 2
    if kind in {'u32', 's32'}:
        return 4
    if kind.startswith('bytes'):
        return int(kind[5:], 10)
    raise ValueError(f'Unsupported field type {kind!r}.')


def main() -> None:
    args = parse_args()
    dump_path, snapshot = load_dump(args.dump)
    regions = decode_regions(snapshot)

    print(f'Dump: {dump_path}')
    print(f'Region: {args.region}')

    for spec in args.field:
        offset, kind, label = parse_field_spec(spec)
        raw = read_region_bytes(regions, args.region, offset, field_length(kind))
        print(f'{label}: offset=0x{offset:x} type={kind} value={decode_value(raw, kind)}')


if __name__ == '__main__':
    main()