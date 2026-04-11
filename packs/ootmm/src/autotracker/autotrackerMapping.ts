/**
 * Mapping from autotracker WebSocket item IDs to tracker item IDs.
 *
 * The autotracker sends raw save-data IDs that differ from the tracker's
 * canonical IDs in several ways:
 *   - Song teleport names (MINUET → TP_FOREST)
 *   - Equipment bitmasks (OOT_SWORD as bitmask → individual items)
 *   - Dungeon item naming (FIRE_TEMPLE_KEYS → SMALL_KEY_FIRE)
 *   - Inventory slot raw values (OOT_ADULT_TRADE → individual trade items)
 */

// ---------------------------------------------------------------------------
// 1. Simple 1:1 renames
// ---------------------------------------------------------------------------

const SIMPLE_RENAMES: Record<string, string> = {
  // OOT songs with different names
  OOT_SONG_MINUET: 'OOT_SONG_TP_FOREST',
  OOT_SONG_BOLERO: 'OOT_SONG_TP_FIRE',
  OOT_SONG_SERENADE: 'OOT_SONG_TP_WATER',
  OOT_SONG_REQUIEM: 'OOT_SONG_TP_SPIRIT',
  OOT_SONG_NOCTURNE: 'OOT_SONG_TP_SHADOW',
  OOT_SONG_PRELUDE: 'OOT_SONG_TP_LIGHT',
  OOT_SONG_LULLABY: 'OOT_SONG_ZELDA',

  // Quest items
  OOT_GOLD_TOKENS: 'OOT_GS_TOKEN',

  // MM notebook
  MM_NOTEBOOK: 'MM_BOMBER_NOTEBOOK',

  // Ganon boss key
  OOT_GANON_BK: 'OOT_BOSS_KEY_GANON',
};

// ---------------------------------------------------------------------------
// 2. OOT equipment bitmask decomposition
// ---------------------------------------------------------------------------

interface BitmaskEntry {
  bit: number;
  trackerId: string;
}

const OOT_EQUIPMENT_BITMASKS: Record<string, BitmaskEntry[]> = {
  OOT_SWORD: [
    { bit: 0, trackerId: 'OOT_SWORD_KOKIRI' },
    { bit: 1, trackerId: 'OOT_SWORD_MASTER' },
    { bit: 2, trackerId: 'OOT_SWORD_BIGGORON' },
  ],
  OOT_SHIELD: [
    { bit: 0, trackerId: 'OOT_SHIELD_DEKU' },
    { bit: 1, trackerId: 'OOT_SHIELD_HYLIAN' },
    { bit: 2, trackerId: 'OOT_SHIELD_MIRROR' },
  ],
  OOT_TUNIC: [
    { bit: 1, trackerId: 'OOT_TUNIC_GORON' },
    { bit: 2, trackerId: 'OOT_TUNIC_ZORA' },
  ],
  OOT_BOOTS: [
    { bit: 1, trackerId: 'OOT_BOOTS_IRON' },
    { bit: 2, trackerId: 'OOT_BOOTS_HOVER' },
  ],
};

// ---------------------------------------------------------------------------
// 3. MM equipment progressive → individual decomposition
// ---------------------------------------------------------------------------

interface ProgressiveEntry {
  minLevel: number;
  trackerId: string;
}

const PROGRESSIVE_TO_INDIVIDUAL: Record<string, ProgressiveEntry[]> = {
  // MM_SHIELD is NOT progressive in the tracker — it uses individual items.
  // MM_SHIELD: 0=none, 1=Hero, 2=Mirror
  MM_SHIELD: [
    { minLevel: 1, trackerId: 'MM_SHIELD_HERO' },
    { minLevel: 2, trackerId: 'MM_SHIELD_MIRROR' },
  ],
};

// MM_SWORD IS progressive in the tracker (MM_SWORD levels 1-3).
// It passes through directly, no decomposition needed.

// ---------------------------------------------------------------------------
// 4. Dungeon item renaming
// ---------------------------------------------------------------------------

interface DungeonMapping {
  autoPrefix: string;
  trackerAbbrev: string;
}

const OOT_DUNGEON_MAPPINGS: DungeonMapping[] = [
  { autoPrefix: 'OOT_DEKU_TREE', trackerAbbrev: 'DT' },
  { autoPrefix: 'OOT_DODONGOS_CAVERN', trackerAbbrev: 'DC' },
  { autoPrefix: 'OOT_JABU_JABU', trackerAbbrev: 'JABU' },
  { autoPrefix: 'OOT_FOREST_TEMPLE', trackerAbbrev: 'FOREST' },
  { autoPrefix: 'OOT_FIRE_TEMPLE', trackerAbbrev: 'FIRE' },
  { autoPrefix: 'OOT_WATER_TEMPLE', trackerAbbrev: 'WATER' },
  { autoPrefix: 'OOT_SPIRIT_TEMPLE', trackerAbbrev: 'SPIRIT' },
  { autoPrefix: 'OOT_SHADOW_TEMPLE', trackerAbbrev: 'SHADOW' },
  { autoPrefix: 'OOT_BOTTOM_WELL', trackerAbbrev: 'BOTW' },
  { autoPrefix: 'OOT_ICE_CAVERN', trackerAbbrev: 'IC' },
  { autoPrefix: 'OOT_GANONS_TOWER', trackerAbbrev: 'GANON' },
  { autoPrefix: 'OOT_GERUDO_FORTRESS', trackerAbbrev: 'GF' },
  { autoPrefix: 'OOT_GERUDO_TRAINING', trackerAbbrev: 'GTG' },
  { autoPrefix: 'OOT_GANONS_CASTLE', trackerAbbrev: 'GANON' },
];

const MM_DUNGEON_MAPPINGS: DungeonMapping[] = [
  { autoPrefix: 'MM_WOODFALL_TEMPLE', trackerAbbrev: 'WF' },
  { autoPrefix: 'MM_SNOWHEAD_TEMPLE', trackerAbbrev: 'SH' },
  { autoPrefix: 'MM_GREAT_BAY_TEMPLE', trackerAbbrev: 'GB' },
  { autoPrefix: 'MM_STONE_TOWER_TEMPLE', trackerAbbrev: 'ST' },
];

function tryDungeonItemRename(
  autoId: string,
): { trackerId: string; isCount: boolean } | null {
  const allMappings = [...OOT_DUNGEON_MAPPINGS, ...MM_DUNGEON_MAPPINGS];
  const gamePrefix = autoId.startsWith('MM_') ? 'MM' : 'OOT';

  for (const { autoPrefix, trackerAbbrev } of allMappings) {
    if (!autoId.startsWith(autoPrefix + '_')) continue;
    const suffix = autoId.slice(autoPrefix.length + 1);

    switch (suffix) {
      case 'KEYS':
        return {
          trackerId: `${gamePrefix}_SMALL_KEY_${trackerAbbrev}`,
          isCount: true,
        };
      case 'BOSS_KEY':
        return {
          trackerId: `${gamePrefix}_BOSS_KEY_${trackerAbbrev}`,
          isCount: false,
        };
      case 'MAP':
        return {
          trackerId: `${gamePrefix}_MAP_${trackerAbbrev}`,
          isCount: false,
        };
      case 'COMPASS':
        return {
          trackerId: `${gamePrefix}_COMPASS_${trackerAbbrev}`,
          isCount: false,
        };
      case 'STRAY_FAIRIES':
        return {
          trackerId: `${gamePrefix}_STRAY_FAIRY_${trackerAbbrev}`,
          isCount: true,
        };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Trade item bitmask mappings
// ---------------------------------------------------------------------------
// Trade items are sent as bitmasks. Each set bit represents an obtained item.

// OOT_ADULT_TRADE: u16 bitmask (bits 0–10 mapped; bits 11+ ignored/overflow)
const OOT_ADULT_TRADE_ITEMS: string[] = [
  'OOT_POCKET_EGG', // bit 0
  'OOT_POCKET_CUCCO', // bit 1
  'OOT_COJIRO', // bit 2
  'OOT_ODD_MUSHROOM', // bit 3
  'OOT_ODD_POTION', // bit 4
  'OOT_POACHER_SAW', // bit 5
  'OOT_BROKEN_GORON_SWORD', // bit 6
  'OOT_PRESCRIPTION', // bit 7
  'OOT_EYEBALL_FROG', // bit 8
  'OOT_EYE_DROPS', // bit 9
  'OOT_CLAIM_CHECK', // bit 10
];

// OOT_CHILD_TRADE: u16 bitmask (bits 0–10 mapped; bits 11+ ignored/overflow)
const OOT_CHILD_TRADE_ITEMS: string[] = [
  'OOT_WEIRD_EGG', // bit 0
  'OOT_CHICKEN', // bit 1
  'OOT_ZELDA_LETTER', // bit 2
  'OOT_MASK_KEATON', // bit 3
  'OOT_MASK_SKULL', // bit 4
  'OOT_MASK_SPOOKY', // bit 5
  'OOT_MASK_BUNNY', // bit 6
  'OOT_MASK_GORON', // bit 7
  'OOT_MASK_ZORA', // bit 8
  'OOT_MASK_GERUDO', // bit 9
  'OOT_MASK_TRUTH', // bit 10
];

// MM_TRADE_1: 6-bit bitmask
const MM_TRADE1_ITEMS: string[] = [
  'MM_SPELL_FIRE', // bit 0
  'MM_MOON_TEAR', // bit 1
  'MM_DEED_LAND', // bit 2
  'MM_DEED_SWAMP', // bit 3
  'MM_DEED_MOUNTAIN', // bit 4
  'MM_DEED_OCEAN', // bit 5
];

// MM_TRADE_2: 5-bit bitmask
const MM_TRADE2_ITEMS: string[] = [
  'MM_SPELL_WIND', // bit 0
  'MM_BOOTS_IRON', // bit 1
  'MM_TUNIC_GORON', // bit 2
  'MM_ROOM_KEY', // bit 3
  'MM_LETTER_TO_MAMA', // bit 4
];

// MM_TRADE_3: 5-bit bitmask
const MM_TRADE3_ITEMS: string[] = [
  'MM_SPELL_LOVE', // bit 0
  'MM_BOOTS_HOVER', // bit 1
  'MM_TUNIC_ZORA', // bit 2
  'MM_LETTER_TO_KAFEI', // bit 3
  'MM_PENDANT_OF_MEMORIES', // bit 4
];

// IDs to skip entirely (handled by other mechanisms or not useful)
const SKIP_IDS = new Set([
  'OOT_HEART_PIECES', // not tracked as item
  'MM_HEART_PIECES', // not tracked as item
  'OOT_QUIVER', // upgrade level for bow, not tracked separately
  'MM_QUIVER', // upgrade level for bow, not tracked separately
  'OOT_BULLET_BAG', // upgrade level for slingshot, not tracked separately
  'OOT_DEKU_NUTS', // presence flag; tracker uses OOT_NUT_UPGRADE
  'MM_NUT', // presence flag; tracker uses MM_NUT_UPGRADE
  'OOT_STICK', // presence flag; tracker uses OOT_STICK_UPGRADE
  'MM_STICK', // presence flag; tracker uses MM_STICK_UPGRADE
  // MM_TRADE_1/2/3 are now handled as bitmasks below
]);

// Items that may have SHARED_ variants depending on settings
const SHAREABLE_PREFIXES = [
  'BOW',
  'ARROW_FIRE',
  'ARROW_ICE',
  'ARROW_LIGHT',
  'LENS',
  'HAMMER',
  'HOOKSHOT',
  'SPELL_FIRE',
  'SPELL_WIND',
  'SPELL_LOVE',
  'SONG_EPONA',
  'SONG_STORMS',
  'SONG_TIME',
  'SONG_SUN',
  'SONG_EMPTINESS',
  'STRENGTH',
  'SCALE',
  'WALLET',
  'MASK_GORON',
  'MASK_ZORA',
  'MASK_BUNNY',
  'MASK_KEATON',
  'MASK_TRUTH',
  'MASK_BLAST',
  'MASK_STONE',
  'SPIN_UPGRADE',
  'STONE_OF_AGONY',
  'BOMBCHU',
  'BOMBCHU_BAG',
  'BOOTS_IRON',
  'BOOTS_HOVER',
  'TUNIC_GORON',
  'TUNIC_ZORA',
  'SKELETON_KEY',
  'SHIELD_DEKU',
  'SHIELD_HYLIAN',
  'SHIELD_MIRROR',
  'BOTTLE_EMPTY',
  'BOMB_BAG',
  'STICK_UPGRADE',
  'NUT_UPGRADE',
  'PLATINUM_TOKEN',
];

function resolveTrackerId(
  gameSpecificId: string,
  availableItemIds: Set<string>,
): string {
  if (availableItemIds.has(gameSpecificId)) return gameSpecificId;

  // Try SHARED_ variant
  const match = gameSpecificId.match(/^(OOT|MM)_(.+)$/);
  if (match) {
    const suffix = match[2];
    const sharedId = `SHARED_${suffix}`;
    if (availableItemIds.has(sharedId)) return sharedId;
  }

  // Return original even if not in available set — the store will accept it
  return gameSpecificId;
}

// ---------------------------------------------------------------------------
// Main translation function
// ---------------------------------------------------------------------------

export interface AutotrackerItem {
  id: string;
  qty: number;
}

/**
 * Translate a batch of autotracker items into tracker inventory entries.
 * For diff=false (full sync), qty is absolute.
 * For diff=true (delta), qty is additive — caller handles addition.
 */
export function translateAutotrackerItems(
  items: AutotrackerItem[],
  availableItemIds: Set<string>,
): Record<string, number> {
  const result: Record<string, number> = {};

  function set(trackerId: string, qty: number) {
    const resolvedId = resolveTrackerId(trackerId, availableItemIds);
    result[resolvedId] = Math.max(result[resolvedId] ?? 0, qty);
  }

  for (const { id, qty } of items) {
    if (SKIP_IDS.has(id)) continue;

    // Simple renames
    if (id in SIMPLE_RENAMES) {
      set(SIMPLE_RENAMES[id], qty);
      continue;
    }

    // OOT equipment bitmasks
    if (id in OOT_EQUIPMENT_BITMASKS) {
      for (const { bit, trackerId } of OOT_EQUIPMENT_BITMASKS[id]) {
        set(trackerId, (qty >> bit) & 1);
      }
      continue;
    }

    // Progressive → individual decomposition (e.g. MM_SHIELD)
    if (id in PROGRESSIVE_TO_INDIVIDUAL) {
      for (const { minLevel, trackerId } of PROGRESSIVE_TO_INDIVIDUAL[id]) {
        set(trackerId, qty >= minLevel ? 1 : 0);
      }
      continue;
    }

    // Dungeon items
    const dungeonResult = tryDungeonItemRename(id);
    if (dungeonResult) {
      set(dungeonResult.trackerId, qty);
      continue;
    }

    // Trade item bitmasks — each set bit = one obtained item
    const TRADE_BITMASK_MAPS: Record<string, string[]> = {
      OOT_ADULT_TRADE: OOT_ADULT_TRADE_ITEMS,
      OOT_CHILD_TRADE: OOT_CHILD_TRADE_ITEMS,
      MM_TRADE_1: MM_TRADE1_ITEMS,
      MM_TRADE_2: MM_TRADE2_ITEMS,
      MM_TRADE_3: MM_TRADE3_ITEMS,
    };
    if (id in TRADE_BITMASK_MAPS) {
      const tradeItems = TRADE_BITMASK_MAPS[id];
      for (let bit = 0; bit < tradeItems.length; bit++) {
        set(tradeItems[bit], (qty >> bit) & 1);
      }
      continue;
    }

    // MM_WALLET5 → bottomless wallet flag (separate from MM_WALLET level)
    // MM_WALLET handles main progressive level; WALLET5 is extra
    // For now pass through

    // OOT_OCARINA, MM_OCARINA — progressive level, pass through
    // OOT_QUIVER, MM_QUIVER — progressive level, pass through
    // OOT_BULLET_BAG — progressive level, pass through

    // Direct pass-through (same ID or close enough)
    set(id, qty);
  }

  return result;
}

/**
 * Apply a delta to canonical state. For diff=true updates, qty values
 * from the autotracker are additive to the current known state.
 */
export function applyDelta(
  currentState: Map<string, number>,
  deltaItems: AutotrackerItem[],
  availableItemIds: Set<string>,
): Map<string, number> {
  const next = new Map(currentState);
  const translated = translateAutotrackerItems(deltaItems, availableItemIds);
  for (const [id, deltaQty] of Object.entries(translated)) {
    const current = next.get(id) ?? 0;
    const newVal = current + deltaQty;
    if (newVal > 0) {
      next.set(id, newVal);
    } else {
      next.delete(id);
    }
  }
  return next;
}
