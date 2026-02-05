#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GI_PATH = ROOT / 'OoTMM' / 'packages' / 'data' / 'src' / 'defs' / 'gi.yml'
NAMES_PATH = ROOT / 'OoTMM' / 'packages' / 'core' / 'lib' / 'combo' / 'names.ts'
ITEMS_PATH = ROOT / 'packs' / 'ootmm' / 'src' / 'data' / 'items.ts'
GI_ITEMS_TS = ROOT / 'packs' / 'ootmm' / 'src' / 'data' / 'giItems.ts'

PREFIXES_TO_STRIP = (
    'the ',
    'a ',
    'an ',
    'some ',
)

NAME_PATTERN = re.compile(
    r'^\s*([A-Z0-9_]+)\s*:\s*("([^"\\]|\\.)*"|\'([^\'\\]|\\.)*\')\s*,?\s*$'
)

DYNAMIC_MAX_COUNT_ITEMS = {
    'MM_CLOCK',
    'MM_OCARINA',
    'MM_SCALE',
    'MM_SHIELD',
    'MM_SWORD',
    'MM_STRENGTH',
    'MM_WALLET',
    'OOT_HOOKSHOT',
    'OOT_OCARINA',
    'OOT_SCALE',
    'OOT_SHIELD',
    'OOT_SWORD',
    'OOT_SWORD_GORON',
    'OOT_STRENGTH',
    'OOT_WALLET',
    'SHARED_HOOKSHOT',
    'SHARED_OCARINA',
    'SHARED_SCALE',
    'SHARED_SHIELD',
    'SHARED_SWORD',
    'SHARED_STRENGTH',
    'SHARED_WALLET',
}


def clean_name(raw: str) -> str:
    name = re.sub(r'<[^>]+>', '', raw)
    name = re.sub(r'\s+', ' ', name).strip()
    lowered = name.lower()
    for prefix in PREFIXES_TO_STRIP:
        if lowered.startswith(prefix):
            name = name[len(prefix):].strip()
            lowered = name.lower()
            break
    if name and name[0].islower():
        name = name[0].upper() + name[1:]
    return name


def fallback_name(item_id: str) -> str:
    name = re.sub(r'^(OOT_|MM_|SHARED_)', '', item_id)
    parts = name.split('_')
    return ' '.join([p[:1].upper() + p[1:].lower() if p else '' for p in parts]).strip()


def parse_gi_items() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in GI_PATH.read_text().splitlines():
        m = re.search(r'\bid:\s*([^,}]+)', line)
        if not m:
            continue
        item_id = m.group(1).strip()
        if item_id in seen:
            continue
        seen.add(item_id)
        m_name = re.search(r'\bname:\s*\"([^\"]*)\"', line)
        if m_name:
            name = clean_name(m_name.group(1))
        else:
            name = fallback_name(item_id)
        items.append({'id': item_id, 'name': name})
    return items


def parse_core_names() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in NAMES_PATH.read_text().splitlines():
        m = NAME_PATTERN.match(line)
        if not m:
            continue
        item_id = m.group(1)
        if item_id in seen:
            continue
        raw_literal = m.group(2)
        try:
            name = ast.literal_eval(raw_literal)
        except Exception:
            name = raw_literal.strip('\'"')
        items.append({'id': item_id, 'name': name})
        seen.add(item_id)
    return items


def parse_existing_items():
    existing = {}
    order = []
    for line in ITEMS_PATH.read_text().splitlines():
        if "id: '" not in line:
            continue
        m_id = re.search(r"\bid:\s*'([^']+)'", line)
        if not m_id:
            continue
        item_id = m_id.group(1)
        order.append(item_id)
        m_cat = re.search(r"\bcategory:\s*'([^']+)'", line)
        m_game = re.search(r"\bgame:\s*'([^']+)'", line)
        m_icon = re.search(r"\bicon:\s*'([^']*)'", line)
        m_max = re.search(r"\bmaxCount:\s*(\d+)", line)
        existing[item_id] = {
            'category': m_cat.group(1) if m_cat else 'misc',
            'game': m_game.group(1) if m_game else 'shared',
            'icon': m_icon.group(1) if m_icon else '❓',
            'maxCount': int(m_max.group(1)) if m_max else None,
        }
    return existing, order


def get_category(item_id: str) -> str:
    if 'KEY' in item_id:
        return 'key'
    if 'SONG' in item_id:
        return 'song'
    if 'MASK' in item_id:
        return 'mask'
    if any(token in item_id for token in ('SWORD', 'SHIELD', 'TUNIC', 'BOOTS')):
        return 'equipment'
    if any(token in item_id for token in ('BOW', 'HOOKSHOT', 'HAMMER', 'OCARINA', 'LENS')):
        return 'equipment'
    if any(token in item_id for token in ('SCALE', 'STRENGTH', 'WALLET', 'MAGIC')):
        return 'equipment'
    if any(token in item_id for token in ('MEDALLION', 'STONE', 'REMAINS')):
        return 'quest'
    if 'TRAP' in item_id:
        return 'trap'
    if 'MAP' in item_id or 'COMPASS' in item_id:
        return 'dungeon'
    if 'STRAY_FAIRY' in item_id:
        return 'dungeon'
    if 'GS_TOKEN' in item_id:
        return 'token'
    if 'SOUL' in item_id:
        return 'soul'
    if 'RUPEE' in item_id:
        return 'consumable'
    return 'misc'


def get_game(item_id: str) -> str:
    if item_id.startswith('MM_'):
        return 'mm'
    if item_id.startswith('OOT_'):
        return 'oot'
    return 'shared'


def get_icon(item_id: str, category: str) -> str:
    icon = '❓'
    if category == 'key':
        icon = '🔑'
    if 'BOSS_KEY' in item_id:
        icon = '🗝️'
    if category == 'song':
        icon = '🎵'
    if category == 'mask':
        icon = '🎭'
    if 'SWORD' in item_id:
        icon = '⚔️'
    if 'SHIELD' in item_id:
        icon = '🛡️'
    if 'BOW' in item_id:
        icon = '🏹'
    if 'BOMB' in item_id:
        icon = '💣'
    if 'POTION' in item_id:
        icon = '🧪'
    if 'BOTTLE' in item_id:
        icon = '🍾'
    if 'MAP' in item_id:
        icon = 'Map'
    if 'COMPASS' in item_id:
        icon = 'Comp'
    if 'GS_TOKEN' in item_id:
        icon = '💀'
    if 'HEART' in item_id:
        icon = '❤️'
    if 'MEDALLION' in item_id:
        icon = '🏅'
    if 'STONE' in item_id:
        icon = '💎'
    if 'REMAINS' in item_id:
        icon = '👹'
    if 'TRAP' in item_id:
        icon = '⚠️'
    if 'SOUL' in item_id:
        icon = '👻'
    return icon


def get_max_count(item_id: str) -> int | None:
    if item_id == 'OOT_GS_TOKEN':
        return 100
    if item_id.startswith('MM_GS_TOKEN_'):
        return 30
    if 'STRAY_FAIRY' in item_id:
        return 15
    if 'RUPEE_SILVER' in item_id:
        return 5
    return None


def write_gi_items_ts(gi_items: list[dict[str, str]]):
    lines = []
    lines.append('// Auto-generated from OoTMM/packages/data/src/defs/gi.yml')
    lines.append('// and OoTMM/packages/core/lib/combo/names.ts')
    lines.append('export const GI_ITEM_LIST = [')
    for item in gi_items:
        name_literal = json.dumps(item['name'], ensure_ascii=False)
        lines.append(f"  {{ id: '{item['id']}', name: {name_literal} }},")
    lines.append('] as const')
    lines.append('')
    GI_ITEMS_TS.write_text('\n'.join(lines) + '\n')


def write_items_ts(gi_items: list[dict[str, str]], existing: dict, existing_order: list[str]):
    gi_ids = [item['id'] for item in gi_items]
    gi_name_map = {item['id']: item['name'] for item in gi_items}
    gi_set = set(gi_ids)

    ordered_ids = [item_id for item_id in existing_order if item_id in gi_set]
    existing_set = set(existing_order)
    for item_id in gi_ids:
        if item_id not in existing_set:
            ordered_ids.append(item_id)

    lines = []
    lines.append("import type { OoTMMItem } from '../types'")
    lines.append('')
    lines.append('export const ITEM_DATABASE: OoTMMItem[] = [')

    for item_id in ordered_ids:
        name = gi_name_map.get(item_id, fallback_name(item_id))
        if item_id in existing:
            meta = existing[item_id]
            category = meta['category']
            game = meta['game']
            icon = meta['icon']
            max_count = meta['maxCount']
            if max_count is None:
                max_count = get_max_count(item_id)
        else:
            category = get_category(item_id)
            game = get_game(item_id)
            icon = get_icon(item_id, category)
            max_count = get_max_count(item_id)

        if item_id in DYNAMIC_MAX_COUNT_ITEMS:
            max_count = None

        # Ensure soul/trap items are categorized consistently
        if 'SOUL' in item_id:
            category = 'soul'
            icon = get_icon(item_id, category)
        if 'TRAP' in item_id:
            category = 'trap'
            icon = get_icon(item_id, category)

        name_literal = json.dumps(name, ensure_ascii=False)
        icon_literal = icon.replace("'", "\\'")
        parts = [
            f"id: '{item_id}'",
            f"name: {name_literal}",
            f"category: '{category}'",
            f"game: '{game}'",
            f"icon: '{icon_literal}'",
        ]
        if max_count is not None:
            parts.append(f"maxCount: {max_count}")
        lines.append('  { ' + ', '.join(parts) + ' },')

    lines.append(']')
    lines.append('')
    ITEMS_PATH.write_text('\n'.join(lines) + '\n')


def main():
    gi_items = parse_gi_items()
    core_items = parse_core_names()
    gi_ids = {item['id'] for item in gi_items}
    for item in core_items:
        if item['id'] in gi_ids:
            continue
        gi_items.append(item)
    existing, order = parse_existing_items()
    write_gi_items_ts(gi_items)
    write_items_ts(gi_items, existing, order)
    print(f"Wrote {GI_ITEMS_TS}")
    print(f"Wrote {ITEMS_PATH}")


if __name__ == '__main__':
    main()
