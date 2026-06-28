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
  itemId: string; // Item ID (or "JUNK")
}

export interface RecordedItemRegionHint {
  region: string; // Region ID
  itemId: string; // Item ID (or "JUNK")
}

export interface RecordedFoolishHint {
  region: string; // Region ID
}

export interface HintTrackerState {
  pathHints: RecordedPathHint[];
  alwaysHints: RecordedItemExactHint[];
  sometimesHints: RecordedItemExactHint[];
  regionHints: RecordedItemRegionHint[];
  foolishHints: RecordedFoolishHint[];
}

export function createEmptyHintTrackerState(): HintTrackerState {
  return {
    pathHints: [],
    alwaysHints: [],
    sometimesHints: [],
    regionHints: [],
    foolishHints: [],
  };
}

// ── Parsed hint from spoiler log ──

export type ParsedHintType =
  | 'path'
  | 'foolish'
  | 'item-exact'
  | 'item-region'
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
  | { type: 'hints.always.add'; hint: RecordedItemExactHint }
  | { type: 'hints.always.remove'; index: number }
  | { type: 'hints.sometimes.add'; hint: RecordedItemExactHint }
  | { type: 'hints.sometimes.remove'; index: number }
  | { type: 'hints.region.add'; hint: RecordedItemRegionHint }
  | { type: 'hints.region.remove'; index: number }
  | { type: 'hints.foolish.add'; hint: RecordedFoolishHint }
  | { type: 'hints.foolish.remove'; index: number }
  | { type: 'hints.set_full'; state: HintTrackerState }
  | { type: 'hints.protected_location_ids.set'; ids: string[] };

// ── Hint Check Location definitions ──

export interface HintCheckDef {
  id: string; // Check hint ID (e.g. "OOT_FROGS_FINAL")
  locationName: string; // Name as shown on the Gossip Stone
  locationCodes: string[]; // Location codes in the tracker's location system
}
