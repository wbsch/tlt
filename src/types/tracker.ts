/**
 * Base interface that all tracker packs must implement
 */
export interface TrackerPack {
  /** Unique ID for this tracker pack */
  id: string;

  /** Display name */
  name: string;

  /** Brief description */
  description: string;

  /** Initialize the tracker with settings */
  initialize(settings: Record<string, unknown>): Promise<void>;

  /** Check reachability based on current inventory */
  checkReachability(inventory: Map<string, number>): TrackerCheckResult;

  /** Get all available locations */
  getAllLocations(): LocationInfo[];

  /** Get available item IDs (if the pack supports item filtering) */
  getAvailableItemIds?(): Set<string>;

  /** Get per-item maximum counts (if the pack supports dynamic counts) */
  getItemMaxCounts?(): Map<string, number>;

  /** Get current settings */
  getSettings(): Record<string, unknown>;

  /** Optional: Mark pre-completed dungeons to adjust logic/UI */
  setPreCompletedDungeons?(dungeons: string[]): void;

  /** Optional: Patch special conditions used in logic */
  setSpecialConds?(patch: Record<string, unknown>): void;

  /** Reset tracker state */
  reset(): void;
}

/**
 * Result from checking reachability
 */
export interface TrackerCheckResult {
  /** IDs of reachable locations */
  reachableLocationIds: string[];

  /** IDs of newly reachable locations (since last check) */
  newLocationIds: string[];

  /** Can the game be completed? */
  canComplete: boolean;

  /** Additional pack-specific data */
  extra?: Record<string, unknown>;
}

/**
 * Information about a location/check
 */
export interface LocationInfo {
  /** Unique location ID */
  id: string;

  /** Display name */
  name: string;

  /** Category (e.g., "Dungeon", "Overworld", "Shop") */
  category: string;

  /** Area within the game */
  area: string;

  /** Position on map (if applicable) */
  position?: { x: number; y: number };

  /** Icon identifier */
  icon?: string;

  /** True if this location is a Skulltula token check */
  isSkulltulaToken?: boolean;

  /** True if this location is a Stray Fairy check */
  isStrayFairy?: boolean;

  /** Whether this location is shuffled based on settings (if applicable) */
  isShuffled?: boolean;
}

/**
 * Information about an item
 */
export interface ItemInfo {
  /** Unique item ID */
  id: string;

  /** Display name */
  name: string;

  /** Category (e.g., "Equipment", "Consumable", "Key Item") */
  category: string;

  /** Icon identifier */
  icon?: string;

  /** Maximum stack size (1 for unique items) */
  maxCount?: number;
}

/**
 * Setting definition for the settings UI
 */
export interface SettingDefinition {
  /** Setting key */
  key: string;

  /** Display label */
  label: string;

  /** Setting type */
  type: 'boolean' | 'select' | 'number' | 'text' | 'multi-select';

  /** Default value */
  default: unknown;

  /** Options (for select/multi-select) */
  options?: {
    value: unknown;
    label: string;
    description?: string;
    cond?: (settings: Record<string, unknown>) => boolean;
  }[];

  /** Description/tooltip */
  description?: string;

  /** Grouping category */
  category?: string;

  /** Optional condition for rendering */
  cond?: (settings: Record<string, unknown>) => boolean;

  /** Optional numeric bounds (for number settings) */
  min?: number | ((settings: Record<string, unknown>) => number);
  max?: number | ((settings: Record<string, unknown>) => number);
}
