import { describe, expect, it } from 'vitest';

import itemGrids from '@/../packs/ootmm/src/data/itemGrids.json';
import { ITEM_DATABASE } from '@/../packs/ootmm/src/data/items';
import { collectAllGridItemIds } from '@/../packs/ootmm/src/utils/itemGridRef';

const SOUL_ITEM_ID_PATTERN = /^(?:OOT|MM|SHARED)_SOUL_/;

interface GridNodeLike {
  type?: string;
  items?: string[];
  content?: GridNodeLike[];
  rows?: unknown[][];
  submenu?: GridNodeLike;
}

function collectItemListIds(node: unknown, ids: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectItemListIds(child, ids);
    return ids;
  }
  if (!node || typeof node !== 'object') return ids;

  const gridNode = node as GridNodeLike;
  if (gridNode.type === 'itemlist') {
    ids.push(...(gridNode.items ?? []));
  }
  collectItemListIds(gridNode.content, ids);
  collectItemListIds(gridNode.submenu, ids);
  for (const row of gridNode.rows ?? []) {
    if (Array.isArray(row)) collectItemListIds(row, ids);
  }
  return ids;
}

function findSoulsSubmenu(grid: unknown): string[] {
  const submenus: GridNodeLike[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const gridNode = node as GridNodeLike;
    if (gridNode.submenu) submenus.push(gridNode);
    walk(gridNode.content);
    walk(gridNode.submenu);
    for (const row of gridNode.rows ?? []) {
      if (Array.isArray(row)) walk(row);
    }
  }

  walk(grid);
  return submenus.flatMap((submenu) => collectItemListIds(submenu.submenu));
}

describe('soul item grid entries', () => {
  const soulItemIds = ITEM_DATABASE.filter((item) =>
    SOUL_ITEM_ID_PATTERN.test(item.id),
  ).map((item) => item.id);
  const gridItemIds = collectAllGridItemIds(itemGrids);

  it('has souls to check', () => {
    expect(soulItemIds.length).toBeGreaterThan(0);
  });

  it('lists every soul in the item grid', () => {
    const missing = soulItemIds.filter((itemId) => !gridItemIds.has(itemId));

    expect(missing).toEqual([]);
  });

  it('keeps each grid to its own soul variants', () => {
    const sharedSouls = findSoulsSubmenu(itemGrids.item_grid_shared);
    const ootSouls = findSoulsSubmenu(itemGrids.item_grid_tall_oot);
    const mmSouls = findSoulsSubmenu(itemGrids.item_grid_tall_mm);

    expect(sharedSouls.length).toBeGreaterThan(0);
    expect(ootSouls.length).toBeGreaterThan(0);
    expect(mmSouls.length).toBeGreaterThan(0);

    expect(sharedSouls.every((id) => id.startsWith('SHARED_SOUL_'))).toBe(true);
    expect(ootSouls.every((id) => id.startsWith('OOT_SOUL_'))).toBe(true);
    expect(mmSouls.every((id) => id.startsWith('MM_SOUL_'))).toBe(true);
  });
});
