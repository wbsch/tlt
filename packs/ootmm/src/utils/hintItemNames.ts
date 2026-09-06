// ── Hint Item Name Helpers ──
// Shared logic for the hint tracker's item picker:
//  - restrict the selectable items to the current seed's item pool, and
//  - disambiguate items that exist in both games (OoT + MM) and/or as shared
//    variants by prefixing their name with the game they belong to.

import { GI_ITEM_LIST } from '../data/giItems';
import { getGridItemIcon } from '../data/itemIcons';
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

/**
 * The masks a Moon Trial hint can point to. Moon Trial gossip stones only ever
 * hint at MM masks (and their shared variants) — mirrors OoTMM's
 * `ItemGroups.MASKS_REGULAR_VANILLA_MM` used by `placeMoonGossip`.
 *
 * Masks that exist in both games are represented as an `[mm, shared]` pair so
 * the picker can surface only the variant that is actually in the seed's item
 * pool. Masks that only exist in MM are a single ID.
 */
export const MOON_TRIAL_MASK_VARIANTS: ReadonlyArray<
  readonly [mm: string, shared?: string]
> = [
  ['MM_MASK_CAPTAIN'],
  ['MM_MASK_GIANT'],
  ['MM_MASK_ALL_NIGHT'],
  ['MM_MASK_BUNNY', 'SHARED_MASK_BUNNY'],
  ['MM_MASK_KEATON', 'SHARED_MASK_KEATON'],
  ['MM_MASK_GARO'],
  ['MM_MASK_ROMANI'],
  ['MM_MASK_TROUPE_LEADER'],
  ['MM_MASK_POSTMAN'],
  ['MM_MASK_COUPLE'],
  ['MM_MASK_GREAT_FAIRY'],
  ['MM_MASK_GIBDO'],
  ['MM_MASK_DON_GERO'],
  ['MM_MASK_KAMARO', 'SHARED_MASK_KAMARO'],
  ['MM_MASK_TRUTH', 'SHARED_MASK_TRUTH'],
  ['MM_MASK_STONE', 'SHARED_MASK_STONE'],
  ['MM_MASK_BREMEN'],
  ['MM_MASK_BLAST', 'SHARED_MASK_BLAST'],
  ['MM_MASK_SCENTS'],
  ['MM_MASK_KAFEI'],
];

/**
 * Resolve the Moon Trial mask item IDs to offer in the picker. When the seed's
 * item pool is known, each mask contributes only the variant (MM or shared)
 * that is actually in the pool; when the pool is unknown/empty, all variants
 * are returned.
 */
export function getMoonTrialMaskItemIds(
  poolItemIds?: Iterable<string> | null,
): string[] {
  const pool = poolItemIds ? new Set(poolItemIds) : null;
  const result: string[] = [];
  for (const [mm, shared] of MOON_TRIAL_MASK_VARIANTS) {
    if (!pool) {
      result.push(mm);
      if (shared) result.push(shared);
      continue;
    }
    if (shared && pool.has(shared)) {
      result.push(shared);
    } else {
      result.push(mm);
    }
  }
  return result;
}

/** Map an item ID's game prefix to its display label ("OoT", "MM", "Shared"). */
export function getItemGamePrefix(itemId: string): string | null {
  for (const [prefix, label] of GAME_PREFIXES) {
    if (itemId.startsWith(prefix)) return label;
  }
  return null;
}

/**
 * Resolve the icon shown for an item in the hint tracker (dropdowns and
 * recorded hint rows). Uses the item grid's first-stage icon (count 0)
 * resolved against the current tracker settings, so multi-stage items
 * (e.g. Hookshot, Ocarina, Bow) show the same image the grid displays for
 * their first stage. Falls back to the regular item icon for items without
 * grid variants.
 */
export function getHintItemIcon(
  itemId: string,
  settings?: Record<string, unknown> | null,
): string {
  return getGridItemIcon(itemId, 0, { settings: settings ?? null });
}

/**
 * The items selectable for hint recording: every item that appears in the item
 * grid (deduplicated, first appearance only for progressive), optionally
 * restricted to the current seed's item pool.
 * When `poolItemIds` is null/empty, all grid items are returned.
 *
 * Icons use the item grid's first-stage icon (count 0) resolved against the
 * current tracker settings, so multi-stage items (e.g. Hookshot, Ocarina)
 * show the same image the grid displays for their first stage.
 */
export function getHintItemEntries(
  poolItemIds?: Iterable<string> | null,
  settings?: Record<string, unknown> | null,
): HintItemEntry[] {
  const gridIds = collectAllGridItemIds(itemGrids);
  const pool = poolItemIds ? new Set(poolItemIds) : null;
  const seenIds = new Set<string>();
  const items: HintItemEntry[] = [];

  function addItem(id: string, name: string): void {
    if (seenIds.has(id) || !gridIds.has(id)) return;
    if (pool && !pool.has(id)) return;
    seenIds.add(id);
    items.push({
      id,
      name,
      iconPath: getHintItemIcon(id, settings),
    });
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
