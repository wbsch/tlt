// ── Hint Tracker - Type Definitions ──

export type PathSubType =
  | 'woth'
  | 'triforce'
  | 'dungeon'
  | 'boss'
  | 'end-boss'
  | 'event';

export interface RecordedPathHint {
  region: string; // Region ID (e.g. "OOT_KOKIRI_FOREST")
  subType: PathSubType;
  subId?: number; // Specific index for the subtype
}

export interface RecordedItemExactHint {
  location: string; // Check location hint ID (e.g. "OOT_FROGS_FINAL")
  itemId: string; // First item ID (or "JUNK")
  /** Additional item IDs for checks that yield multiple items (dual hints) */
  extraItemIds?: string[];
}

export interface RecordedItemRegionHint {
  region: string; // Region ID
  itemId: string; // Item ID (or "JUNK")
}

export interface RecordedFoolishHint {
  region: string; // Region ID
}

export interface RecordedMoonHint {
  region: string; // Region ID
  itemId: string; // Item ID (or "JUNK")
}

export interface HintTrackerState {
  pathHints: RecordedPathHint[];
  alwaysSometimesHints: RecordedItemExactHint[];
  regionHints: RecordedItemRegionHint[];
  foolishHints: RecordedFoolishHint[];
  moonHints: RecordedMoonHint[];
}

export function createEmptyHintTrackerState(): HintTrackerState {
  return {
    pathHints: [],
    alwaysSometimesHints: [],
    regionHints: [],
    foolishHints: [],
    moonHints: [],
  };
}

// ── Parsed hint from spoiler log ──

export type ParsedHintType =
  | 'path'
  | 'foolish'
  | 'item-exact'
  | 'item-region'
  | 'moon'
  | 'junk';

export interface ParsedSpoilerHint {
  type: ParsedHintType;
  region?: string;
  pathSubType?: PathSubType;
  pathSubId?: number;
  checkLocation?: string; // For item-exact hints
  itemId?: string;
  itemName?: string;
}

// ── Sync operations ──

export type HintSyncOperation =
  | { type: 'hints.path.add'; hint: RecordedPathHint }
  | { type: 'hints.path.remove'; index: number }
  | { type: 'hints.always-sometimes.add'; hint: RecordedItemExactHint }
  | { type: 'hints.always-sometimes.remove'; index: number }
  | { type: 'hints.region.add'; hint: RecordedItemRegionHint }
  | { type: 'hints.region.remove'; index: number }
  | { type: 'hints.foolish.add'; hint: RecordedFoolishHint }
  | { type: 'hints.foolish.remove'; index: number }
  | { type: 'hints.moon.add'; hint: RecordedMoonHint }
  | { type: 'hints.moon.remove'; index: number }
  | { type: 'hints.set_full'; state: HintTrackerState }
  | { type: 'hints.protected_location_ids.set'; ids: string[] };

// ── Hint Check Location definitions ──

export interface HintCheckDef {
  id: string; // Check hint ID (e.g. "OOT_FROGS_FINAL")
  locationName: string; // Name as shown on the Gossip Stone
  locationCodes: string[]; // Location codes in the tracker's location system
  /**
   * How many items this check yields. Checks with more than one item are
   * "dual hints" (e.g. the Ranch Defense gives two items). Defaults to 1.
   */
  itemCount?: number;
}
