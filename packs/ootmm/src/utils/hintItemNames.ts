// ── Hint Item Name Helpers ──
// Shared logic for the hint tracker's item picker:
//  - restrict the selectable items to the current seed's item pool, and
//  - disambiguate items that exist in both games (OoT + MM) and/or as shared
//    variants by prefixing their name with the game they belong to.

import { GI_ITEM_LIST } from '../data/giItems';
import { getItemIcon } from '../data/itemIcons';
import { getItemName, ITEM_DATABASE } from '../data/items';
import itemGrids from '../data/itemGrids.json';
import { collectAllGridItemIds } from './itemGridRef';

export interface HintItemEntry {
  id: string;
  name: string;
  iconPath: string;
}

const GAME_PREFIXES: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['SHARED_', 'Shared'],
  ['MM_', 'MM'],
  ['OOT_', 'OoT'],
];

/** Map an item ID's game prefix to its display label ("OoT", "MM", "Shared"). */
export function getItemGamePrefix(itemId: string): string | null {
  for (const [prefix, label] of GAME_PREFIXES) {
    if (itemId.startsWith(prefix)) return label;
  }
  return null;
}

/**
 * The items selectable for hint recording: every item that appears in the item
 * grid (deduplicated, first appearance only for progressive), optionally
 * restricted to the current seed's item pool.
 * When `poolItemIds` is null/empty, all grid items are returned.
 */
export function getHintItemEntries(
  poolItemIds?: Iterable<string> | null,
): HintItemEntry[] {
  const gridIds = collectAllGridItemIds(itemGrids);
  const pool = poolItemIds ? new Set(poolItemIds) : null;
  const seenIds = new Set<string>();
  const items: HintItemEntry[] = [];

  function addItem(id: string, name: string): void {
    if (seenIds.has(id) || !gridIds.has(id)) return;
    if (pool && !pool.has(id)) return;
    seenIds.add(id);
    items.push({ id, name, iconPath: getItemIcon(id) });
  }

  // First pass: GI_ITEM_LIST for the ordering
  for (const gi of GI_ITEM_LIST) addItem(gi.id, gi.name);

  // Add any ITEM_DATABASE items not in GI_ITEM_LIST
  for (const item of ITEM_DATABASE) addItem(item.id, item.name);

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a display-name resolver for the given set of item IDs. Items whose
 * base name is shared by more than one ID (e.g. OoT/MM/Shared variants of the
 * same item) are prefixed with their game ("OoT", "MM", "Shared") so they can
 * be told apart.
 */
export function createItemDisplayNameResolver(
  itemIds: Iterable<string>,
): (itemId: string) => string {
  const nameCounts = new Map<string, number>();
  for (const id of itemIds) {
    const name = getItemName(id);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return (itemId: string): string => {
    const base = getItemName(itemId);
    if ((nameCounts.get(base) ?? 0) <= 1) return base;
    const prefix = getItemGamePrefix(itemId);
    return prefix ? `${prefix} ${base}` : base;
  };
}
