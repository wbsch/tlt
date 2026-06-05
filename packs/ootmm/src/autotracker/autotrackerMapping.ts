/**
 * Mapping from autotracker WebSocket item IDs to tracker item IDs.
 *
 * The autotracker sends raw save-data IDs that differ from the tracker's
 * canonical IDs in several ways:
 *   - Song teleport names (MINUET → TP_FOREST)
 *   - Equipment bitmasks (OOT_SWORD, OOT_SHIELD as bitmask → individual items)
 *   - Dungeon item naming (FIRE_TEMPLE_KEYS → SMALL_KEY_FIRE)
 *   - Inventory slot raw values (OOT_ADULT_TRADE → individual trade items)
 */

import { ITEM_DATABASE } from '../data/items';

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

  // OOT_QUIVER, MM_QUIVER — upgrade level for bow (0-3), mapped to bow item so
  // the qty drives icon variant selection (30/40/50 arrow overlays)
  OOT_QUIVER: 'OOT_BOW',
  MM_QUIVER: 'MM_BOW',

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
    { bit: 2, trackerId: 'OOT_SWORD_KNIFE' },
    { bit: 4, trackerId: 'OOT_SWORD_BIGGORON' },
  ],
  OOT_SHIELD: [
    { bit: 0, trackerId: 'OOT_SHIELD_DEKU' },
    { bit: 1, trackerId: 'OOT_SHIELD_HYLIAN' },
    { bit: 2, trackerId: 'OOT_SHIELD_MIRROR' },
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

const EXTRA_DUNGEON_MAPPINGS: DungeonMapping[] = [
  { autoPrefix: 'OOT_TREASURE_SHOP', trackerAbbrev: 'TCG' },
];

function tryDungeonItemRename(
  autoId: string,
): { trackerId: string; isCount: boolean } | null {
  const allMappings = [
    ...OOT_DUNGEON_MAPPINGS,
    ...MM_DUNGEON_MAPPINGS,
    ...EXTRA_DUNGEON_MAPPINGS,
  ];
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

const TRADE_BITMASK_MAPS: Record<string, string[]> = {
  OOT_ADULT_TRADE: OOT_ADULT_TRADE_ITEMS,
  OOT_CHILD_TRADE: OOT_CHILD_TRADE_ITEMS,
  MM_TRADE_1: MM_TRADE1_ITEMS,
  MM_TRADE_2: MM_TRADE2_ITEMS,
  MM_TRADE_3: MM_TRADE3_ITEMS,
};

// IDs to skip entirely (handled by other mechanisms or not useful)
const SKIP_IDS = new Set([
  'OOT_HEART_PIECES', // not tracked as item
  'MM_HEART_PIECES', // not tracked as item
  'OOT_TUNIC', // legacy combined tunic bitmask; direct tunic IDs are tracked now
  'OOT_BOOTS', // legacy combined boots bitmask; direct boots IDs are tracked now
  // OOT_QUIVER, MM_QUIVER — remapped to OOT_BOW/MM_BOW via SIMPLE_RENAMES
  'OOT_BULLET_BAG', // upgrade level for slingshot, not tracked separately
  'OOT_DEKU_NUTS', // presence flag; tracker uses OOT_NUT_UPGRADE
  'MM_NUT', // presence flag; tracker uses MM_NUT_UPGRADE
  'OOT_STICK', // presence flag; tracker uses OOT_STICK_UPGRADE
  'MM_STICK', // presence flag; tracker uses MM_STICK_UPGRADE
  // MM_TRADE_1/2/3 are now handled as bitmasks below
]);

const DEFAULT_ITEM_MAX_COUNTS = new Map(
  ITEM_DATABASE.filter(
    (item): item is (typeof ITEM_DATABASE)[number] & { maxCount: number } =>
      typeof item.maxCount === 'number',
  ).map((item) => [item.id, item.maxCount]),
);

interface KeyGroup {
  smallKeyId: string;
  keyRingId: string;
}

interface SilverGroup {
  rupeeId: string;
  pouchId: string;
}

const OOT_KEY_GROUPS: KeyGroup[] = [
  { smallKeyId: 'OOT_SMALL_KEY_FOREST', keyRingId: 'OOT_KEY_RING_FOREST' },
  { smallKeyId: 'OOT_SMALL_KEY_FIRE', keyRingId: 'OOT_KEY_RING_FIRE' },
  { smallKeyId: 'OOT_SMALL_KEY_WATER', keyRingId: 'OOT_KEY_RING_WATER' },
  { smallKeyId: 'OOT_SMALL_KEY_SPIRIT', keyRingId: 'OOT_KEY_RING_SPIRIT' },
  { smallKeyId: 'OOT_SMALL_KEY_SHADOW', keyRingId: 'OOT_KEY_RING_SHADOW' },
  { smallKeyId: 'OOT_SMALL_KEY_BOTW', keyRingId: 'OOT_KEY_RING_BOTW' },
  { smallKeyId: 'OOT_SMALL_KEY_GTG', keyRingId: 'OOT_KEY_RING_GTG' },
  { smallKeyId: 'OOT_SMALL_KEY_GANON', keyRingId: 'OOT_KEY_RING_GANON' },
  { smallKeyId: 'OOT_SMALL_KEY_GF', keyRingId: 'OOT_KEY_RING_GF' },
  { smallKeyId: 'OOT_SMALL_KEY_TCG', keyRingId: 'OOT_KEY_RING_TCG' },
];

const MM_KEY_GROUPS: KeyGroup[] = [
  { smallKeyId: 'MM_SMALL_KEY_WF', keyRingId: 'MM_KEY_RING_WF' },
  { smallKeyId: 'MM_SMALL_KEY_SH', keyRingId: 'MM_KEY_RING_SH' },
  { smallKeyId: 'MM_SMALL_KEY_GB', keyRingId: 'MM_KEY_RING_GB' },
  { smallKeyId: 'MM_SMALL_KEY_ST', keyRingId: 'MM_KEY_RING_ST' },
];

const OOT_SILVER_GROUPS: SilverGroup[] = [
  { rupeeId: 'OOT_RUPEE_SILVER_DC', pouchId: 'OOT_POUCH_SILVER_DC' },
  { rupeeId: 'OOT_RUPEE_SILVER_BOTW', pouchId: 'OOT_POUCH_SILVER_BOTW' },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SPIRIT_CHILD',
    pouchId: 'OOT_POUCH_SILVER_SPIRIT_CHILD',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SPIRIT_SUN',
    pouchId: 'OOT_POUCH_SILVER_SPIRIT_SUN',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SPIRIT_BOULDERS',
    pouchId: 'OOT_POUCH_SILVER_SPIRIT_BOULDERS',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SPIRIT_LOBBY',
    pouchId: 'OOT_POUCH_SILVER_SPIRIT_LOBBY',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SPIRIT_ADULT',
    pouchId: 'OOT_POUCH_SILVER_SPIRIT_ADULT',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SHADOW_SCYTHE',
    pouchId: 'OOT_POUCH_SILVER_SHADOW_SCYTHE',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SHADOW_PIT',
    pouchId: 'OOT_POUCH_SILVER_SHADOW_PIT',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SHADOW_SPIKES',
    pouchId: 'OOT_POUCH_SILVER_SHADOW_SPIKES',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_SHADOW_BLADES',
    pouchId: 'OOT_POUCH_SILVER_SHADOW_BLADES',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_IC_SCYTHE',
    pouchId: 'OOT_POUCH_SILVER_IC_SCYTHE',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_IC_BLOCK',
    pouchId: 'OOT_POUCH_SILVER_IC_BLOCK',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GTG_SLOPES',
    pouchId: 'OOT_POUCH_SILVER_GTG_SLOPES',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GTG_LAVA',
    pouchId: 'OOT_POUCH_SILVER_GTG_LAVA',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GTG_WATER',
    pouchId: 'OOT_POUCH_SILVER_GTG_WATER',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_SPIRIT',
    pouchId: 'OOT_POUCH_SILVER_GANON_SPIRIT',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_LIGHT',
    pouchId: 'OOT_POUCH_SILVER_GANON_LIGHT',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_FIRE',
    pouchId: 'OOT_POUCH_SILVER_GANON_FIRE',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_FOREST',
    pouchId: 'OOT_POUCH_SILVER_GANON_FOREST',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_SHADOW',
    pouchId: 'OOT_POUCH_SILVER_GANON_SHADOW',
  },
  {
    rupeeId: 'OOT_RUPEE_SILVER_GANON_WATER',
    pouchId: 'OOT_POUCH_SILVER_GANON_WATER',
  },
];

const MM_FAIRY_ITEM_IDS = [
  'MM_STRAY_FAIRY_TOWN',
  'MM_STRAY_FAIRY_WF',
  'MM_STRAY_FAIRY_SH',
  'MM_STRAY_FAIRY_GB',
  'MM_STRAY_FAIRY_ST',
] as const;

function getItemCount(state: Record<string, number>, itemId: string): number {
  return state[itemId] ?? 0;
}

function getItemMaxCount(
  itemId: string,
  itemMaxCounts: Map<string, number>,
): number {
  return itemMaxCounts.get(itemId) ?? DEFAULT_ITEM_MAX_COUNTS.get(itemId) ?? 1;
}

function isItemGroupRelevant(
  availableItemIds: Set<string>,
  itemIds: string[],
): boolean {
  return itemIds.some((itemId) => availableItemIds.has(itemId));
}

function isKeyGroupComplete(
  state: Record<string, number>,
  group: KeyGroup,
  itemMaxCounts: Map<string, number>,
): boolean {
  return (
    getItemCount(state, group.keyRingId) > 0 ||
    getItemCount(state, group.smallKeyId) >=
      getItemMaxCount(group.smallKeyId, itemMaxCounts)
  );
}

function isSilverGroupComplete(
  state: Record<string, number>,
  group: SilverGroup,
  itemMaxCounts: Map<string, number>,
): boolean {
  return (
    getItemCount(state, group.pouchId) > 0 ||
    getItemCount(state, group.rupeeId) >=
      getItemMaxCount(group.rupeeId, itemMaxCounts)
  );
}

function areKeyGroupsComplete(
  state: Record<string, number>,
  groups: KeyGroup[],
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
): boolean {
  const relevantGroups = groups.filter((group) =>
    isItemGroupRelevant(availableItemIds, [group.smallKeyId, group.keyRingId]),
  );
  return (
    relevantGroups.length > 0 &&
    relevantGroups.every((group) =>
      isKeyGroupComplete(state, group, itemMaxCounts),
    )
  );
}

function areSilverGroupsComplete(
  state: Record<string, number>,
  groups: SilverGroup[],
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
): boolean {
  const relevantGroups = groups.filter((group) =>
    isItemGroupRelevant(availableItemIds, [group.rupeeId, group.pouchId]),
  );
  return (
    relevantGroups.length > 0 &&
    relevantGroups.every((group) =>
      isSilverGroupComplete(state, group, itemMaxCounts),
    )
  );
}

function areCountItemsComplete(
  state: Record<string, number>,
  itemIds: string[],
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
): boolean {
  const relevantItemIds = itemIds.filter((itemId) =>
    availableItemIds.has(itemId),
  );
  return (
    relevantItemIds.length > 0 &&
    relevantItemIds.every(
      (itemId) =>
        getItemCount(state, itemId) >= getItemMaxCount(itemId, itemMaxCounts),
    )
  );
}

function setDerivedExact(
  state: Record<string, number>,
  availableItemIds: Set<string>,
  itemId: string,
  obtained: boolean,
) {
  if (!availableItemIds.has(itemId)) return;
  if (obtained) {
    state[itemId] = 1;
    return;
  }
  delete state[itemId];
}

function hasAnyPositiveItem(
  state: Record<string, number>,
  itemIds: string[],
): boolean {
  return itemIds.some((itemId) => (state[itemId] ?? 0) > 0);
}

function setDerivedFirstAvailable(
  state: Record<string, number>,
  availableItemIds: Set<string>,
  itemIds: string[],
  obtained: boolean,
) {
  const availableItemId = itemIds.find((itemId) =>
    availableItemIds.has(itemId),
  );
  if (!availableItemId) return;
  setDerivedExact(state, availableItemIds, availableItemId, obtained);
}

const OOT_BOMBCHU_SIGNAL_IDS = [
  'OOT_BOMBCHUS',
  'OOT_BOMBCHU',
  'OOT_BOMBCHU_10',
];

const MM_BOMBCHU_SIGNAL_IDS = ['MM_BOMBCHU'];

const SHARED_BOMBCHU_SIGNAL_IDS = ['SHARED_BOMBCHU'];

const OOT_BOMBCHU_BAG_IDS = [
  'OOT_BOMBCHU_BAG',
  'OOT_BOMBCHU_BAG_FIRST_5',
  'OOT_BOMBCHU_BAG_FIRST_10',
  'OOT_BOMBCHU_BAG_FIRST_20',
];

const MM_BOMBCHU_BAG_IDS = [
  'MM_BOMBCHU_BAG',
  'MM_BOMBCHU_BAG_FIRST_1',
  'MM_BOMBCHU_BAG_FIRST_5',
  'MM_BOMBCHU_BAG_FIRST_10',
  'MM_BOMBCHU_BAG_FIRST_20',
];

const SHARED_BOMBCHU_BAG_IDS = ['SHARED_BOMBCHU_BAG'];

function deriveAutotrackerOnlyItems(
  state: Record<string, number>,
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
) {
  for (const group of OOT_KEY_GROUPS) {
    setDerivedExact(
      state,
      availableItemIds,
      group.keyRingId,
      isItemGroupRelevant(availableItemIds, [
        group.smallKeyId,
        group.keyRingId,
      ]) && isKeyGroupComplete(state, group, itemMaxCounts),
    );
  }

  for (const group of MM_KEY_GROUPS) {
    setDerivedExact(
      state,
      availableItemIds,
      group.keyRingId,
      isItemGroupRelevant(availableItemIds, [
        group.smallKeyId,
        group.keyRingId,
      ]) && isKeyGroupComplete(state, group, itemMaxCounts),
    );
  }

  const ootAllKeys = areKeyGroupsComplete(
    state,
    OOT_KEY_GROUPS,
    availableItemIds,
    itemMaxCounts,
  );
  const mmAllKeys = areKeyGroupsComplete(
    state,
    MM_KEY_GROUPS,
    availableItemIds,
    itemMaxCounts,
  );
  const ootAllSilver = areSilverGroupsComplete(
    state,
    OOT_SILVER_GROUPS,
    availableItemIds,
    itemMaxCounts,
  );
  const mmAllFairies = areCountItemsComplete(
    state,
    [...MM_FAIRY_ITEM_IDS],
    availableItemIds,
    itemMaxCounts,
  );
  const ootAllTokens = areCountItemsComplete(
    state,
    ['OOT_GS_TOKEN'],
    availableItemIds,
    itemMaxCounts,
  );
  const mmAllTokens = areCountItemsComplete(
    state,
    ['MM_GS_TOKEN_SWAMP', 'MM_GS_TOKEN_OCEAN'],
    availableItemIds,
    itemMaxCounts,
  );

  setDerivedExact(state, availableItemIds, 'OOT_KEY_RING', ootAllKeys);
  setDerivedExact(state, availableItemIds, 'MM_KEY_RING', mmAllKeys);
  setDerivedExact(state, availableItemIds, 'OOT_SKELETON_KEY', ootAllKeys);
  setDerivedExact(state, availableItemIds, 'MM_SKELETON_KEY', mmAllKeys);
  setDerivedExact(
    state,
    availableItemIds,
    'SHARED_SKELETON_KEY',
    ootAllKeys && mmAllKeys,
  );
  setDerivedExact(state, availableItemIds, 'OOT_PLATINUM_TOKEN', ootAllTokens);
  setDerivedExact(state, availableItemIds, 'MM_PLATINUM_TOKEN', mmAllTokens);
  setDerivedExact(
    state,
    availableItemIds,
    'SHARED_PLATINUM_TOKEN',
    ootAllTokens && mmAllTokens,
  );
  setDerivedExact(state, availableItemIds, 'OOT_RUPEE_MAGICAL', ootAllSilver);
  setDerivedExact(
    state,
    availableItemIds,
    'MM_TRANSCENDENT_FAIRY',
    mmAllFairies,
  );

  const ootBombchuObtained = hasAnyPositiveItem(state, OOT_BOMBCHU_SIGNAL_IDS);
  const mmBombchuObtained = hasAnyPositiveItem(state, MM_BOMBCHU_SIGNAL_IDS);
  const sharedBombchuObtained = hasAnyPositiveItem(
    state,
    SHARED_BOMBCHU_SIGNAL_IDS,
  );

  setDerivedFirstAvailable(
    state,
    availableItemIds,
    OOT_BOMBCHU_BAG_IDS,
    ootBombchuObtained || sharedBombchuObtained,
  );
  setDerivedFirstAvailable(
    state,
    availableItemIds,
    MM_BOMBCHU_BAG_IDS,
    mmBombchuObtained || sharedBombchuObtained,
  );
  setDerivedFirstAvailable(
    state,
    availableItemIds,
    SHARED_BOMBCHU_BAG_IDS,
    ootBombchuObtained || mmBombchuObtained || sharedBombchuObtained,
  );
}

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

export interface AutotrackerTranslationOptions {
  childWalletsEnabled?: boolean;
  mode?: 'absolute' | 'delta';
}

function isBaseWalletId(itemId: string): boolean {
  return /^(OOT|MM)_WALLET$/.test(itemId);
}

function isBottomlessWalletId(itemId: string): boolean {
  return /^(OOT|MM)_WALLET5$/.test(itemId);
}

function requiresRawStateRebuildForDelta(
  rawId: string,
  availableItemIds: Set<string>,
): boolean {
  if (rawId in OOT_EQUIPMENT_BITMASKS) {
    return true;
  }

  if (rawId in PROGRESSIVE_TO_INDIVIDUAL) {
    return true;
  }

  if (rawId in TRADE_BITMASK_MAPS) {
    return true;
  }

  if (isBottomlessWalletId(rawId)) {
    return true;
  }

  return availableItemIds.has('SHARED_HOOKSHOT') && rawId === 'MM_HOOKSHOT';
}

export function canApplyAutotrackerDeltaItemsDirectly(
  items: AutotrackerItem[],
  availableItemIds: Set<string>,
): boolean {
  return items.every(
    ({ id }) => !requiresRawStateRebuildForDelta(id, availableItemIds),
  );
}

function translateWalletQty(
  rawId: string,
  rawQty: number,
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
  options: AutotrackerTranslationOptions,
): { trackerId: string; qty: number } {
  const baseWalletId = isBottomlessWalletId(rawId) ? rawId.slice(0, -1) : rawId;
  const trackerId = resolveTrackerId(baseWalletId, availableItemIds);

  if (options.mode === 'delta') {
    return { trackerId, qty: rawQty };
  }

  const maxCount = getItemMaxCount(trackerId, itemMaxCounts);
  if (isBottomlessWalletId(rawId)) {
    return { trackerId, qty: rawQty > 0 ? maxCount : 0 };
  }

  const startLevelOffset = options.childWalletsEnabled ? 0 : 1;
  return {
    trackerId,
    qty: Math.max(0, Math.min(maxCount, rawQty - startLevelOffset)),
  };
}

function normalizeSharedHookshotQty(
  state: Record<string, number>,
  items: AutotrackerItem[],
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
) {
  if (!availableItemIds.has('SHARED_HOOKSHOT')) return;

  const ootHookshotItem = items.find((item) => item.id === 'OOT_HOOKSHOT');
  if (!ootHookshotItem) return;

  const maxCount = getItemMaxCount('SHARED_HOOKSHOT', itemMaxCounts);
  const normalizedQty = Math.max(0, Math.min(maxCount, ootHookshotItem.qty));

  if (normalizedQty > 0) {
    state.SHARED_HOOKSHOT = normalizedQty;
    return;
  }

  delete state.SHARED_HOOKSHOT;
}

/**
 * Translate a batch of autotracker items into tracker inventory entries.
 * For diff=false (full sync), qty is absolute.
 * For diff=true (delta), qty is additive — caller handles addition.
 */
export function translateAutotrackerItems(
  items: AutotrackerItem[],
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
  options: AutotrackerTranslationOptions = {},
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
    if (id in TRADE_BITMASK_MAPS) {
      const tradeItems = TRADE_BITMASK_MAPS[id];
      for (let bit = 0; bit < tradeItems.length; bit++) {
        set(tradeItems[bit], (qty >> bit) & 1);
      }
      continue;
    }

    if (isBaseWalletId(id) || isBottomlessWalletId(id)) {
      const wallet = translateWalletQty(
        id,
        qty,
        availableItemIds,
        itemMaxCounts,
        options,
      );
      set(wallet.trackerId, wallet.qty);
      continue;
    }

    // OOT_OCARINA, MM_OCARINA — progressive level, pass through
    // OOT_QUIVER, MM_QUIVER — progressive level, pass through
    // OOT_BULLET_BAG — progressive level, pass through

    // Direct pass-through (same ID or close enough)
    set(id, qty);
  }

  normalizeSharedHookshotQty(result, items, availableItemIds, itemMaxCounts);

  deriveAutotrackerOnlyItems(result, availableItemIds, itemMaxCounts);

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
  itemMaxCounts: Map<string, number>,
  options: AutotrackerTranslationOptions = {},
): Map<string, number> {
  const next = new Map(currentState);
  const translated = translateAutotrackerItems(
    deltaItems,
    availableItemIds,
    itemMaxCounts,
    { ...options, mode: 'delta' },
  );
  for (const [id, deltaQty] of Object.entries(translated)) {
    const current = next.get(id) ?? 0;
    const newVal = current + deltaQty;
    if (newVal > 0) {
      next.set(id, newVal);
    } else {
      next.delete(id);
    }
  }

  const canonical = Object.fromEntries(next.entries());
  deriveAutotrackerOnlyItems(canonical, availableItemIds, itemMaxCounts);
  return new Map(Object.entries(canonical));
}
