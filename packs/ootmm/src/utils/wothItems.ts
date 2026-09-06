// ── Way of the Hero item normalization ──
// Helpers for surfacing items in Path / Way of the Hero hints. Bottle content
// items (potions, milk, fairies, poes, blue fire, chateau) are not distinct
// grid items — they live inside the bottle slots, which display as "Empty
// Bottle". Ruto's Letter and Gold Dust are separately-tracked bottle contents
// with their own grid elements, so they surface under their own names.

/**
 * Bottle content items → their base "Empty Bottle" item ID. Ruto's Letter and
 * Gold Dust are intentionally excluded (see the variant sets below).
 */
export const WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS: Record<string, string> = {
  OOT_BOTTLE_MILK: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POTION_RED: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POTION_GREEN: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POTION_BLUE: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_FAIRY: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POE: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_BIG_POE: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_BLUE_FIRE: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_CHATEAU: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLE_MILK: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_RED: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_GREEN: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_BLUE: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_FAIRY: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POE: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_BIG_POE: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_BLUE_FIRE: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_CHATEAU: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLE_MILK: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_RED: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_GREEN: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_BLUE: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_FAIRY: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POE: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_BIG_POE: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_BLUE_FIRE: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_CHATEAU: 'SHARED_BOTTLE_EMPTY',
};

/**
 * Ruto's Letter and Gold Dust exist as OoT/MM/SHARED variants that all share
 * the same display name. The spoiler-log name→ID resolution keeps the last
 * variant with a given name, which for these two items is a "phantom" variant
 * OoTMM never actually places (Ruto's Letter is OoT-only, Gold Dust is MM-only)
 * and which has no grid element or icon. These sets let us recognize any
 * variant and normalize it to the one that actually appears in the item grid.
 */
export const WOTH_RUTO_LETTER_VARIANTS = new Set([
  'OOT_BOTTLE_RUTO_LETTER',
  'MM_BOTTLE_RUTO_LETTER',
  'SHARED_BOTTLE_RUTO_LETTER',
]);
export const WOTH_GOLD_DUST_VARIANTS = new Set([
  'OOT_BOTTLED_GOLD_DUST',
  'MM_BOTTLED_GOLD_DUST',
  'SHARED_BOTTLED_GOLD_DUST',
]);

/**
 * Souls (enemy, boss, NPC, animal and misc souls) are not represented in the
 * item grid, but OoTMM can still use them as Way of the Hero path hint
 * targets. They are recognized by their `(OOT|MM|SHARED)_SOUL_...` item ID
 * prefix, mirroring the soul section detection in the inventory.
 */
const SOUL_ITEM_ID_RE = /^(?:OOT|MM|SHARED)_SOUL_/;

/** True when the item ID is a soul (any kind). */
export function isSoulItemId(itemId: string): boolean {
  return SOUL_ITEM_ID_RE.test(itemId);
}

/**
 * Canonical (grid-representable) item ID for a Way of the Hero item:
 *  - bottle contents collapse to their base "Empty Bottle" ID;
 *  - Ruto's Letter / Gold Dust normalize to their real (non-phantom) variant;
 *  - everything else is returned unchanged.
 */
export function getWotHCanonicalItemId(itemId: string): string {
  const bottleBase = WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS[itemId];
  if (bottleBase) return bottleBase;
  if (WOTH_RUTO_LETTER_VARIANTS.has(itemId)) return 'OOT_BOTTLE_RUTO_LETTER';
  if (WOTH_GOLD_DUST_VARIANTS.has(itemId)) return 'MM_BOTTLED_GOLD_DUST';
  return itemId;
}

/**
 * True when the item (or any of its equivalent variants) is present in the
 * given hint-grid item ID set (grid items ∩ current pool).
 */
export function isWotHItemInGrid(
  itemId: string,
  gridItemIdSet: ReadonlySet<string>,
): boolean {
  // Souls are never in the item grid, but are still valid Way of the Hero
  // targets, so they always pass this check.
  if (isSoulItemId(itemId)) return true;
  const bottleBase = WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS[itemId];
  if (bottleBase) return gridItemIdSet.has(bottleBase);
  if (WOTH_RUTO_LETTER_VARIANTS.has(itemId)) {
    for (const id of WOTH_RUTO_LETTER_VARIANTS) {
      if (gridItemIdSet.has(id)) return true;
    }
    return false;
  }
  if (WOTH_GOLD_DUST_VARIANTS.has(itemId)) {
    for (const id of WOTH_GOLD_DUST_VARIANTS) {
      if (gridItemIdSet.has(id)) return true;
    }
    return false;
  }
  return gridItemIdSet.has(itemId);
}
