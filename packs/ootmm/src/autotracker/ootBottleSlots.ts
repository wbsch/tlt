const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';

export const OOT_BOTTLE_EMPTY_ITEM_ID = 'OOT_BOTTLE_EMPTY';
export const OOT_BOTTLE_RUTO_LETTER_ITEM_ID = 'OOT_BOTTLE_RUTO_LETTER';

/**
 * Grid ref for the bottle that occupies the Ruto's Letter slot when King Zora
 * is open: the seed replaces the letter with an empty bottle, so the slot needs
 * its own cell to keep four (six with Extra Bottles) bottles visible.
 */
export const OOT_RUTO_LETTER_BOTTLE_GRID_REF = 'BottleRutoLetter';

const OOT_EMPTY_BOTTLE_GRID_REFS = [
  'Bottle1',
  'Bottle2',
  'Bottle3',
  'Bottle4',
  'Bottle5',
];

const OOT_RUTO_LETTER_BOTTLE_GRID_REFS = [
  OOT_RUTO_LETTER_BOTTLE_GRID_REF,
  ...OOT_EMPTY_BOTTLE_GRID_REFS,
];

/** Bottle slot ids emitted by the raw frame parser (one bottle per slot). */
const OOT_BOTTLE_SLOT_ITEM_IDS = new Set([
  'OOT_BOTTLE_1',
  'OOT_BOTTLE_2',
  'OOT_BOTTLE_3',
  'OOT_BOTTLE_4',
  'OOT_BOTTLE_5',
  'OOT_BOTTLE_6',
]);

/** Bottle contents that occupy one of the tracked bottle slots. */
const OOT_BOTTLE_CONTENT_ITEM_IDS = new Set([
  'OOT_BOTTLE_RUTO_LETTER',
  'OOT_BOTTLED_GOLD_DUST',
]);

export function isOotBottleSlotItemId(itemId: string): boolean {
  return OOT_BOTTLE_SLOT_ITEM_IDS.has(itemId);
}

export function isOotBottleContentItemId(itemId: string): boolean {
  return OOT_BOTTLE_CONTENT_ITEM_IDS.has(itemId);
}

/**
 * Whether the seed replaced Ruto's Letter with an empty bottle (King Zora open).
 * The letter then holds no bottle slot of its own, so all slots are empty
 * bottles and the grid needs one more bottle cell.
 */
export function isOotRutoLetterBottleReplaced(
  availableItemIds: ReadonlySet<string>,
): boolean {
  return (
    availableItemIds.has(OOT_BOTTLE_EMPTY_ITEM_ID) &&
    !availableItemIds.has(OOT_BOTTLE_RUTO_LETTER_ITEM_ID)
  );
}

function isTrackedBottleContent(
  itemId: string,
  availableItemIds: ReadonlySet<string>,
): boolean {
  // Without a known item pool keep the previous behaviour.
  return availableItemIds.size === 0 || availableItemIds.has(itemId);
}

export interface OotBottleState {
  /** Number of bottles held in OoT bottle slots, contents not included. */
  bottleCount: number;
  /** Grid ref state keys marking the individual bottle slots. */
  gridRefStateKeys: string[];
}

/**
 * Bottle slots are filled consecutively: the tracker does not know which slot
 * holds which bottle, so the first slots are marked up to the number of bottles
 * that are not a tracked bottle content (Ruto's Letter, Gold Dust).
 */
export function buildOotBottleState(
  liveState: ReadonlyMap<string, number>,
  availableItemIds: ReadonlySet<string>,
): OotBottleState {
  let slotCount = 0;
  let contentCount = 0;

  for (const [itemId, qty] of liveState) {
    if (qty <= 0) {
      continue;
    }

    if (OOT_BOTTLE_SLOT_ITEM_IDS.has(itemId)) {
      slotCount += 1;
      continue;
    }

    if (
      OOT_BOTTLE_CONTENT_ITEM_IDS.has(itemId) &&
      isTrackedBottleContent(itemId, availableItemIds)
    ) {
      contentCount += qty;
    }
  }

  const bottleCount = Math.max(0, slotCount - contentCount);
  const gridRefs = isOotRutoLetterBottleReplaced(availableItemIds)
    ? OOT_RUTO_LETTER_BOTTLE_GRID_REFS
    : OOT_EMPTY_BOTTLE_GRID_REFS;

  const gridRefStateKeys = gridRefs
    .slice(0, Math.min(bottleCount, gridRefs.length))
    .map(
      (gridRef) =>
        `${GRID_REF_STATE_PREFIX}${GRID_REF_ALIAS_PREFIX}${gridRef}:${OOT_BOTTLE_EMPTY_ITEM_ID}`,
    );

  return { bottleCount, gridRefStateKeys };
}
