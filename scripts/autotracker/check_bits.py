#!/usr/bin/env python3

from __future__ import annotations

import argparse

from dump_fixture_utils import decode_regions, load_dump, parse_int, require_region


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Inspect one or more bit masks inside a dump fixture region.',
    )
    parser.add_argument('dump', help='Fixture name under tests/fixtures/autotracker/dumps or a direct JSON path.')
    parser.add_argument(
        '--bit',
        action='append',
        required=True,
        metavar='REGION:OFFSET:MASK[:LABEL]',
        help='Bit probe to evaluate. Example: mmSaveContext:0xef8:0x80:weekEventByte0',
    )
    return parser.parse_args()


def parse_bit_spec(spec: str) -> tuple[str, int, int, str]:
    parts = spec.split(':', 3)
    if len(parts) < 3:
        raise ValueError(
            f'Invalid bit spec {spec!r}. Expected REGION:OFFSET:MASK[:LABEL].'
        )

    region_name = parts[0]
    offset = parse_int(parts[1])
    mask = parse_int(parts[2])
    label = parts[3] if len(parts) == 4 else f'{region_name}+0x{offset:x}'
    if mask < 0 or mask > 0xFF:
        raise ValueError(f'Bit mask for {label!r} must fit in one byte.')
    return region_name, offset, mask, label


def main() -> None:
    args = parse_args()
    dump_path, snapshot = load_dump(args.dump)
    regions = decode_regions(snapshot)

    print(f'Dump: {dump_path}')
    for spec in args.bit:
        region_name, offset, mask, label = parse_bit_spec(spec)
        region = require_region(regions, region_name)
        if offset < 0 or offset >= len(region.data):
            raise ValueError(
                f'Offset 0x{offset:x} is outside region {region_name} size {len(region.data)}.'
            )
        byte_value = region.data[offset]
        is_set = (byte_value & mask) != 0
        print(
            f'{label}: region={region_name} address=0x{region.address + offset:08x} '
            f'byte=0x{byte_value:02x} mask=0x{mask:02x} set={str(is_set).lower()}'
        )


if __name__ == '__main__':
    main()