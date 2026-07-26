import autotrackerDataManifest from './data/v31_0/manifest.json';
import inventorySlotsData from './data/v31_0/inventory_slots.json';
import liveAddrsData from './data/v31_0/live_addrs.json';
import locationsData from './data/v31_0/locations.json';
import specialLocationsMmData from './data/v31_0/special_locations_mm.json';
import specialLocationsOotData from './data/v31_0/special_locations_oot.json';
import {
  hasAutotrackerDataForVersion,
  resolveAutotrackerDataVersion,
  getSupportedVersionLabels,
} from './data/versions';
import { getVersionedDataFile } from './data/registry';

// ---------------------------------------------------------------------------
// Version-data loading (uses the eager registry, all files resolved at build time)
// ---------------------------------------------------------------------------

type AutotrackerDataBundle = {
  manifest: AutotrackerDataManifest;
  inventorySlots: InventorySlotFile;
  liveAddrs: LiveAddrFile;
  locations: LocationFile;
  specialLocationsMm: MmSpecialLocationEntry[];
  specialLocationsOot: OotSpecialLocationEntry[];
  sharedSaveOffsets: SharedFixedOffsets;
};

function loadAutotrackerDataSync(dirName: string): AutotrackerDataBundle {
  return {
    manifest: getVersionedDataFile(
      dirName,
      'manifest.json',
    ) as AutotrackerDataManifest,
    inventorySlots: getVersionedDataFile(
      dirName,
      'inventory_slots.json',
    ) as InventorySlotFile,
    liveAddrs: getVersionedDataFile(dirName, 'live_addrs.json') as LiveAddrFile,
    locations: getVersionedDataFile(dirName, 'locations.json') as LocationFile,
    specialLocationsMm: getVersionedDataFile(
      dirName,
      'special_locations_mm.json',
    ) as MmSpecialLocationEntry[],
    specialLocationsOot: getVersionedDataFile(
      dirName,
      'special_locations_oot.json',
    ) as OotSpecialLocationEntry[],
    sharedSaveOffsets: getVersionedDataFile(
      dirName,
      'shared_save_offsets.json',
    ) as SharedFixedOffsets,
  };
}

async function loadAutotrackerData(
  dirName: string,
): Promise<AutotrackerDataBundle> {
  // The registry is eager, so this is effectively sync, but we keep the async
  // signature because the public factory is async.
  return loadAutotrackerDataSync(dirName);
}

// ---------------------------------------------------------------------------
// Mutable module-level tables – initialized from the default (v31_0) data
// and swapped out when a version-specific spoiler log is loaded.
// ---------------------------------------------------------------------------

/** All version-dependent derived tables bundled together. */
interface ParserTables {
  liveAddrs: LiveAddrFile;
  inventorySlotFile: InventorySlotFile;
  sharedStateReadSize: number;
  sharedFixedOffsets: SharedFixedOffsets;
  addrOotSaveCtx: number;
  addrMmSaveCtx: number;
  addrOotForeignMmSaveLive: number;
  addrOotSharedCustomSaveLive: number;
  addrMmForeignOotSaveLive: number;
  addrMmSharedCustomSaveLive: number;
  addrOotRuntimeMaxKeysLive: number;
  addrOotRuntimeOotComboConfigLive: number;
  addrOotRuntimeSilverRupeeDataLive: number;
  addrMmRuntimeOotComboConfigLive: number;
  ootInventoryEntries: InventorySlotEntry[];
  mmInventoryEntries: InventorySlotEntry[];
  sharedStorage: SharedStorageLayout;
  sharedBitmaps: Map<string, SharedBitmapInfo>;
  trackedCatalogItems: CatalogItemEntry[];
  catalogItemSources: Map<string, CatalogItemSource>;
  sharedBitmapUsedBits: Map<string, number>;
  checkNameTable: Map<string, string>;
  ootSceneConflictTable: Map<string, SceneConflictEntry>;
  fishCheckTables: Map<string, Map<number, string>>;
  npcCheckTables: Map<string, Map<number, string>>;
  gsCheckTables: Map<string, Map<number, string>>;
  xflagCheckTables: Map<string, Map<number, string>>;
  ootBitmapConflictTable: Map<string, Map<number, BitmapConflictEntry>>;
  shopCheckTables: Map<string, Map<number, string>>;
  scrubCheckTables: Map<string, Map<number, string>>;
  silverRupeeCheckTables: Map<string, Map<number, string>>;
  npcSymbolTables: Map<string, Map<string, string>>;
  mmSpecialLocationEntries: MmSpecialLocationEntry[];
  ootSpecialLocationEntries: OotSpecialLocationEntry[];
  mmSymbolChecks: MmSymbolCheck[];
  ootSymbolChecks: OotSymbolCheck[];
  sceneCheckFallbacks: Map<string, string>;
}

function buildParserTables(bundle: AutotrackerDataBundle): ParserTables {
  const sharedBitmaps = buildSharedBitmapTable(
    bundle.inventorySlots.catalog.shared,
  );
  const { trackedCatalogItems, catalogItemSources, sharedBitmapUsedBits } =
    buildCatalogTables(bundle.inventorySlots.catalog.items, sharedBitmaps);
  markSharedCheckBitmapsUsed(sharedBitmapUsedBits, sharedBitmaps);

  const locTables = buildLocationTables(bundle.locations);

  const fo: SharedFixedOffsets = bundle.sharedSaveOffsets;

  return {
    liveAddrs: bundle.liveAddrs,
    inventorySlotFile: bundle.inventorySlots,
    sharedStateReadSize: Math.max(
      fo.sharedCustomSaveSize,
      bundle.inventorySlots.catalog.shared.trackedSize,
      fo.songNotesOffset + fo.songNoteCount,
      fo.bombchuBagFlagsOffset + 1,
      fo.rustyKeysOffset + fo.rustyKeysOotSize + fo.rustyKeysMmSize,
    ),
    sharedFixedOffsets: fo,
    addrOotSaveCtx: parseHexAddress(
      bundle.liveAddrs.oot.saveCtx,
      'oot.saveCtx',
    ),
    addrMmSaveCtx: parseHexAddress(bundle.liveAddrs.mm.saveCtx, 'mm.saveCtx'),
    addrOotForeignMmSaveLive: parseHexAddressWithFallback(
      bundle.liveAddrs.oot.foreignSaveLive,
      DEFAULT_ADDR_OOT_FOREIGN_MM_SAVE_LIVE,
    ),
    addrOotSharedCustomSaveLive: parseHexAddressWithFallback(
      bundle.liveAddrs.oot.sharedCustomSaveLive,
      DEFAULT_ADDR_OOT_SHARED_CUSTOM_SAVE_LIVE,
    ),
    addrMmForeignOotSaveLive: parseHexAddressWithFallback(
      bundle.liveAddrs.mm.foreignSaveLive,
      DEFAULT_ADDR_MM_FOREIGN_OOT_SAVE_LIVE,
    ),
    addrMmSharedCustomSaveLive: parseHexAddressWithFallback(
      bundle.liveAddrs.mm.sharedCustomSaveLive,
      DEFAULT_ADDR_MM_SHARED_CUSTOM_SAVE_LIVE,
    ),
    addrOotRuntimeMaxKeysLive: parseHexAddressWithFallback(
      bundle.liveAddrs.oot.runtimeMaxKeysLive,
      DEFAULT_ADDR_OOT_RUNTIME_MAX_KEYS_LIVE,
    ),
    addrOotRuntimeOotComboConfigLive: parseHexAddressWithFallback(
      bundle.liveAddrs.oot.comboConfigLive,
      DEFAULT_ADDR_OOT_RUNTIME_OOT_COMBO_CONFIG_LIVE,
    ),
    addrOotRuntimeSilverRupeeDataLive: parseHexAddressWithFallback(
      bundle.liveAddrs.oot.runtimeSilverRupeeDataLive,
      DEFAULT_ADDR_OOT_RUNTIME_SILVER_RUPEE_DATA_LIVE,
    ),
    addrMmRuntimeOotComboConfigLive: parseHexAddressWithFallback(
      bundle.liveAddrs.mm.comboConfigLive,
      DEFAULT_ADDR_MM_RUNTIME_OOT_COMBO_CONFIG_LIVE,
    ),
    ootInventoryEntries: buildInventorySlotTable(bundle.inventorySlots.oot),
    mmInventoryEntries: buildInventorySlotTable(bundle.inventorySlots.mm),
    sharedStorage: bundle.inventorySlots.catalog.shared,
    sharedBitmaps,
    trackedCatalogItems,
    catalogItemSources,
    sharedBitmapUsedBits,
    ...locTables,
    mmSpecialLocationEntries: bundle.specialLocationsMm,
    ootSpecialLocationEntries: bundle.specialLocationsOot,
    mmSymbolChecks: buildMmSymbolChecks(bundle.specialLocationsMm),
    ootSymbolChecks: buildOotSymbolChecks(bundle.specialLocationsOot),
    sceneCheckFallbacks: new Map<string, string>([
      [
        sceneCheckKey('OOT', 1, 'collect', 24),
        'Dodongo Cavern Heart Miniboss Lava',
      ],
    ]),
  };
}

const AUTOTRACKER_DATA_SCHEMA_VERSION = 1;

type AutotrackerDataManifest = {
  schemaVersion: number;
  files: Record<string, number>;
};

type LiveAddrGameFile = {
  comboCtx: string;
  saveCtx: string;
  payload: string;
  comboConfigLive?: string;
  runtimeMaxKeysLive?: string;
  runtimeSilverRupeeDataLive?: string;
  foreignSaveLive?: string;
  sharedCustomSaveLive?: string;
};

type LiveAddrFile = {
  schemaVersion: number;
  oot: LiveAddrGameFile;
  mm: LiveAddrGameFile;
};

const autotrackerManifest = autotrackerDataManifest as AutotrackerDataManifest;
if (autotrackerManifest.schemaVersion !== AUTOTRACKER_DATA_SCHEMA_VERSION) {
  throw new Error(
    `Unsupported autotracker data schema version: ${autotrackerManifest.schemaVersion}`,
  );
}

let liveAddrs = liveAddrsData as LiveAddrFile;
if (liveAddrs.schemaVersion !== 1) {
  throw new Error(
    `Unsupported live_addrs schema version: ${liveAddrs.schemaVersion}`,
  );
}

// ---------------------------------------------------------------------------
// Helper: swap all module-level data-dependent tables to a new version.
// ---------------------------------------------------------------------------
function applyVersionData(tables: ParserTables): void {
  liveAddrs = tables.liveAddrs;
  addrOotSaveCtx = tables.addrOotSaveCtx;
  addrMmSaveCtx = tables.addrMmSaveCtx;
  addrOotForeignMmSaveLive = tables.addrOotForeignMmSaveLive;
  addrOotSharedCustomSaveLive = tables.addrOotSharedCustomSaveLive;
  addrMmForeignOotSaveLive = tables.addrMmForeignOotSaveLive;
  addrMmSharedCustomSaveLive = tables.addrMmSharedCustomSaveLive;
  addrOotRuntimeMaxKeysLive = tables.addrOotRuntimeMaxKeysLive;
  addrOotRuntimeOotComboConfigLive = tables.addrOotRuntimeOotComboConfigLive;
  addrOotRuntimeSilverRupeeDataLive = tables.addrOotRuntimeSilverRupeeDataLive;
  addrMmRuntimeOotComboConfigLive = tables.addrMmRuntimeOotComboConfigLive;
  inventorySlotFile = tables.inventorySlotFile;
  sharedStateReadSize = tables.sharedStateReadSize;
  sharedFixedOffsets = tables.sharedFixedOffsets;
  ootInventoryEntries = tables.ootInventoryEntries;
  mmInventoryEntries = tables.mmInventoryEntries;
  sharedStorage = tables.sharedStorage;
  sharedBitmaps = tables.sharedBitmaps;
  trackedCatalogItems = tables.trackedCatalogItems;
  catalogItemSources = tables.catalogItemSources;
  sharedBitmapUsedBits = tables.sharedBitmapUsedBits;
  checkNameTable = tables.checkNameTable;
  ootSceneConflictTable = tables.ootSceneConflictTable;
  fishCheckTables = tables.fishCheckTables;
  npcCheckTables = tables.npcCheckTables;
  gsCheckTables = tables.gsCheckTables;
  xflagCheckTables = tables.xflagCheckTables;
  ootBitmapConflictTable = tables.ootBitmapConflictTable;
  shopCheckTables = tables.shopCheckTables;
  scrubCheckTables = tables.scrubCheckTables;
  silverRupeeCheckTables = tables.silverRupeeCheckTables;
  npcSymbolTables = tables.npcSymbolTables;
  mmSpecialLocationEntries = tables.mmSpecialLocationEntries;
  ootSpecialLocationEntries = tables.ootSpecialLocationEntries;
  mmSymbolChecks = tables.mmSymbolChecks;
  ootSymbolChecks = tables.ootSymbolChecks;
  sceneCheckFallbacks = tables.sceneCheckFallbacks;
  rebuildChunkSpecs();
}

export type RawAutotrackerGame = 'OoT' | 'MM';

export interface RawAutotrackerChunk {
  name: string;
  address: number;
  length: number;
  data: string | Uint8Array;
}

export interface RawAutotrackerMessage {
  type: 'raw';
  schemaVersion: string;
  diff: boolean;
  refresh: boolean;
  sequence: number;
  game: string;
  saveIndex: number;
  chunks: RawAutotrackerChunk[];
}

export interface RawAutotrackerItem {
  id: string;
  qty: number;
}

export interface RawAutotrackerCheck {
  id?: string;
  name?: string;
  checked: boolean;
}

export interface ParsedRawAutotrackerSnapshot {
  activeGame: RawAutotrackerGame;
  saveIndex: number;
  ootSceneId: number;
  mmSceneId: number;
  mmDay: number;
  mmPlayerForm: number;
  items: RawAutotrackerItem[];
  checks: RawAutotrackerCheck[];
}

export interface RawAutotrackerParser {
  parse(message: RawAutotrackerMessage): ParsedRawAutotrackerSnapshot | null;
  reset(): void;
}

export interface RawAutotrackerChunkSpec {
  name: string;
  address: number;
  length: number;
}

export interface RawAutotrackerChunkSpecsByGame {
  oot: RawAutotrackerChunkSpec[];
  mm: RawAutotrackerChunkSpec[];
}

function parseHexAddress(raw: string | undefined, field: string): number {
  if (!raw) {
    throw new Error(`Missing autotracker live address for ${field}`);
  }

  const parsed = Number.parseInt(raw, 0);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid autotracker live address for ${field}: ${raw}`);
  }

  return parsed;
}

function parseHexAddressWithFallback(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }

  return parseHexAddress(raw, 'fallback');
}

type InventorySlotFile = {
  oot: InventorySlotEntry[];
  mm: InventorySlotEntry[];
  catalog: ItemCatalog;
};

type InventorySlotEntry = {
  index: number;
  slot: string;
  itemId: string;
  quantity?: SlotQuantityRule;
};

type SlotQuantityRule = {
  stages?: number[];
  maxWithBottle?: boolean;
  useBeansCount?: boolean;
};

type ItemCatalog = {
  shared: SharedStorageLayout;
  items: CatalogItemEntry[];
};

type SharedStorageLayout = {
  baseOffset: number;
  stride: number;
  trackedSize: number;
  bitmaps: SharedBitmapInfo[];
};

type SharedFixedOffsets = {
  sharedCustomSaveSize: number;
  halfDaysOffset: number;
  coinsOffset: number;
  ocarinaButtonMaskOotOffset: number;
  ocarinaButtonMaskMmOffset: number;
  caughtChildFishWeightOffset: number;
  caughtAdultFishWeightOffset: number;
  caughtFishWeightCount: number;
  songNotesOffset: number;
  songNoteCount: number;
  rustyKeysOffset: number;
  rustyKeysOotSize: number;
  rustyKeysMmSize: number;
  bombchuBagFlagsOffset: number;
  songFlagsOotOffset: number;
};

type SharedBitmapInfo = {
  name: string;
  offset: number;
  size: number;
};

type CatalogItemEntry = {
  itemId: string;
  source: CatalogItemSource;
};

type CatalogItemSource = {
  kind: string;
  block?: string;
  byte?: number;
  index?: number;
  max?: number;
  record?: number;
  bit?: number;
  game?: string;
};

type LocationFile = {
  scene: SceneLocationEntry[];
  scene_conflicts: SceneConflictEntry[];
  bitmap: BitmapLocationEntry[];
  bitmap_conflicts: BitmapConflictEntry[];
  symbols: SymbolLocationEntry[];
};

type SceneLocationEntry = {
  key: string;
  name: string;
};

type SceneConflictEntry = {
  key: string;
  dungeonMq: number;
  vanilla: string;
  mq: string;
};

type BitmapLocationEntry = {
  block: string;
  bit: number;
  name: string;
};

type BitmapConflictEntry = {
  block: string;
  bit: number;
  dungeonMq: number;
  vanilla: string[];
  mq: string[];
};

type SymbolLocationEntry = {
  game: string;
  symbol: string;
  name: string;
};

type MmSpecialLocationEntry = {
  symbol: string;
  name: string;
  sources: MmSpecialLocationSourceEntry[];
  bits?: number[];
  byteIndex?: number;
  mask?: number;
};

type MmSpecialLocationSourceEntry = {
  group: string;
  field?: string;
  mask?: string;
};

type OotSpecialLocationEntry = {
  symbol: string;
  name?: string;
  sources: OotSpecialLocationSourceEntry[];
};

type OotSpecialLocationSourceEntry = {
  group: string;
  field?: string;
  bit?: number;
  flag?: number;
  mask?: string;
};

type SceneFlags = {
  chests: number;
  switch0: number;
  switch1: number;
  clearedRoom: number;
  collectibles: number;
  visitedRooms: number;
  visitedFloors: number;
};

type CycleSceneFlags = {
  chests: number;
  switch0: number;
  switch1: number;
  clearedRoom: number;
  collectibles: number;
};

type OotState = {
  sceneId: number;
  liveSceneId: number;
  age: number;
  gameMode: number;
  ocarinaGameRound: number;
  hasMagic: boolean;
  hasDoubleMagic: boolean;
  isBiggoronSword: boolean;
  liveChestFlags: number;
  liveCollectFlags: number;
  liveTempCollectFlag: number;
  hasLiveSceneFlags: boolean;
  items: number[];
  ammo: number[];
  beans: number;
  equipment: number;
  upgrades: number;
  questItems: number;
  heartPieces: number;
  dungeonItems: number[];
  dungeonKeys: number[];
  goldTokens: number;
  gsFlags: number[];
  runtimeMqBits: number;
  runtimeMaxKeys: number[];
  runtimeSilverRupeeCounts: number[];
  hasRuntimeMqBits: boolean;
  hasRuntimeMaxKeys: boolean;
  hasRuntimeSilverRupeeCounts: boolean;
  bronzeScaleEnabled: boolean;
  sceneFlags: SceneFlags[];
  extraRecords: number[];
  eventsChk: number[];
  eventsItem: number[];
  eventsMisc: number[];
};

type MmState = {
  playerForm: number;
  day: number;
  time: number;
  gameMode: number;
  hasMagic: boolean;
  hasDoubleMagic: boolean;
  liveSceneId: number;
  liveChestFlags: number;
  liveSwitch0Flags: number;
  liveSwitch1Flags: number;
  liveCollectFlags: number;
  hasLiveSceneFlags: boolean;
  items: number[];
  ammo: number[];
  equipment: number;
  upgrades: number;
  questItems: number;
  heartPieces: number;
  owlActivationFlags: number;
  dungeonItems: number[];
  dungeonKeys: number[];
  strayFairies: number[];
  weekEventReg: number[];
  townStrayFairy: boolean;
  extraFlags2: number;
  skullTokensSwamp: number;
  skullTokensOcean: number;
  sceneFlags: SceneFlags[];
  cycleFlags: CycleSceneFlags[];
};

type SharedCustomState = {
  bitmaps: Map<string, Uint8Array>;
  halfDays: number;
  coins: number[];
  ocarinaButtonMaskOot: number;
  ocarinaButtonMaskMm: number;
  bombchuBagOot: number;
  bombchuBagMm: number;
  songNotes: number[];
  caughtChildFishWeights: number[];
  caughtAdultFishWeights: number[];
  rustyKeysOot: number[];
  rustyKeysMm: number[];
  songFlagsOot: number;
};

type GameState = {
  activeGame: RawAutotrackerGame;
  saveIndex: number;
  oot: OotState;
  mm: MmState;
  shared: SharedCustomState;
};

type LivePlayStateSignature = {
  sceneId: number;
  currentRoom: number;
};

type OotSymbolCheckSource =
  | 'extra-flags'
  | 'quest'
  | 'child-trade'
  | 'trade'
  | 'event'
  | 'event-item'
  | 'event-misc';

type OotSymbolCheck = {
  source: OotSymbolCheckSource;
  symbol: string;
  keyPrefix: string;
  flags: number[];
  mask: number;
  bit: number;
};

type MmSymbolCheckSource =
  | 'extra-flags'
  | 'extra-flags-2'
  | 'extra-flags-3'
  | 'extra-boss'
  | 'week-event'
  | 'owl-activation';

type MmSymbolCheck = {
  source: MmSymbolCheckSource;
  symbol: string;
  name: string;
  keyPrefix: string;
  bit: number;
  byteIndex: number;
  mask: number;
};

type DecodedRawChunk = {
  name: string;
  address: number;
  length: number;
  data: Uint8Array;
};

type RawFrameMemory = Map<string, DecodedRawChunk>;

const OOT_SAVE_SIZE = 0x1354;
const MM_SAVE_SIZE = 0x3ca0;

const ADDR_OOT_PLAYSTATE_NTSC_10 = 0x801c84a0;
const ADDR_MM_PLAYSTATE_1 = 0x803e6b20;

const DEFAULT_ADDR_OOT_FOREIGN_MM_SAVE_LIVE = 0x80443970;
const DEFAULT_ADDR_OOT_SHARED_CUSTOM_SAVE_LIVE = 0x80443100;
const DEFAULT_ADDR_MM_FOREIGN_OOT_SAVE_LIVE = 0x807729f0;
const DEFAULT_ADDR_MM_SHARED_CUSTOM_SAVE_LIVE = 0x80772180;
const DEFAULT_ADDR_OOT_RUNTIME_MAX_KEYS_LIVE = 0x80441c78;
const DEFAULT_ADDR_OOT_RUNTIME_OOT_COMBO_CONFIG_LIVE = 0x804416c8;
const DEFAULT_ADDR_OOT_RUNTIME_SILVER_RUPEE_DATA_LIVE = 0x8042ec10;
const DEFAULT_ADDR_MM_RUNTIME_OOT_COMBO_CONFIG_LIVE = 0x80770b18;

let addrOotSaveCtx = parseHexAddress(liveAddrs.oot.saveCtx, 'oot.saveCtx');
let addrMmSaveCtx = parseHexAddress(liveAddrs.mm.saveCtx, 'mm.saveCtx');
let addrOotForeignMmSaveLive = parseHexAddressWithFallback(
  liveAddrs.oot.foreignSaveLive,
  DEFAULT_ADDR_OOT_FOREIGN_MM_SAVE_LIVE,
);
let addrOotSharedCustomSaveLive = parseHexAddressWithFallback(
  liveAddrs.oot.sharedCustomSaveLive,
  DEFAULT_ADDR_OOT_SHARED_CUSTOM_SAVE_LIVE,
);
let addrMmForeignOotSaveLive = parseHexAddressWithFallback(
  liveAddrs.mm.foreignSaveLive,
  DEFAULT_ADDR_MM_FOREIGN_OOT_SAVE_LIVE,
);
let addrMmSharedCustomSaveLive = parseHexAddressWithFallback(
  liveAddrs.mm.sharedCustomSaveLive,
  DEFAULT_ADDR_MM_SHARED_CUSTOM_SAVE_LIVE,
);
let addrOotRuntimeMaxKeysLive = parseHexAddressWithFallback(
  liveAddrs.oot.runtimeMaxKeysLive,
  DEFAULT_ADDR_OOT_RUNTIME_MAX_KEYS_LIVE,
);
let addrOotRuntimeOotComboConfigLive = parseHexAddressWithFallback(
  liveAddrs.oot.comboConfigLive,
  DEFAULT_ADDR_OOT_RUNTIME_OOT_COMBO_CONFIG_LIVE,
);
let addrOotRuntimeSilverRupeeDataLive = parseHexAddressWithFallback(
  liveAddrs.oot.runtimeSilverRupeeDataLive,
  DEFAULT_ADDR_OOT_RUNTIME_SILVER_RUPEE_DATA_LIVE,
);
let addrMmRuntimeOotComboConfigLive = parseHexAddressWithFallback(
  liveAddrs.mm.comboConfigLive,
  DEFAULT_ADDR_MM_RUNTIME_OOT_COMBO_CONFIG_LIVE,
);

const OOT_RUNTIME_SCENE_COUNT = 17;
const OOT_SILVER_RUPEE_SET_COUNT = 18;
const OOT_SILVER_RUPEE_DATA_SIZE = OOT_SILVER_RUPEE_SET_COUNT * 4;
const OOT_MAX_KEYS_BLOCK_SIZE = OOT_RUNTIME_SCENE_COUNT + 4;
const OOT_COMBO_CONFIG_SIZE = 0x2dc;

const OOT_COMBO_CONFIG_FLAGS_OFFSET = 0x0ec;
const OOT_COMBO_CONFIG_FLAGS_COUNT = 0x40;
const OOT_COMBO_CONFIG_MQ_OFFSET = 0x09c;
const OOT_COMBO_CONFIG_TRIFORCE_PIECES_OFFSET = 0x276;
const OOT_COMBO_CONFIG_TRIFORCE_GOAL_OFFSET = 0x278;
const OOT_COMBO_CONFIG_SPECIAL_OFFSET = 0x12c;
const OOT_COMBO_CONFIG_SPECIAL_COUNT = 5;
const OOT_COMBO_CONFIG_SPECIAL_SIZE = 8;
const OOT_COMBO_CONFIG_PRICES_OFFSET = 0x15c;
const OOT_COMBO_CONFIG_PRICE_COUNT = 141;
const OOT_COMBO_CONFIG_PRICE_MAX = 4995;
const OOT_COMBO_CONFIG_STATIC_HINTS_OFFSET = 0x2a4;
const OOT_COMBO_CONFIG_STATIC_HINT_COUNT = 20;
const OOT_COMBO_CONFIG_BOSS_OFFSET = 0x2ba;
const OOT_COMBO_CONFIG_BOSS_COUNT = 12;
const OOT_COMBO_CONFIG_STRAY_FAIRY_REWARD_COUNT_OFFSET = 0x2c6;
const OOT_COMBO_CONFIG_BOMBCHU_BEHAVIOR_OOT_OFFSET = 0x2c7;
const OOT_COMBO_CONFIG_BOMBCHU_BEHAVIOR_MM_OFFSET = 0x2c8;
const OOT_COMBO_CONFIG_SONG_EVENTS_OFFSET = 0x2c9;
const OOT_COMBO_CONFIG_SONG_EVENT_COUNT = 18;
const OOT_COMBO_CONFIG_FLAG_BRONZE_SCALE = 192;

const OOT_PLAY_OFF_SCENE_ID = 0x00a4;
const OOT_PLAY_OFF_CHEST_FLAGS = 0x1d38;
const OOT_PLAY_OFF_COLLECT_FLAGS = 0x1d44;
const OOT_PLAY_OFF_TEMP_COLLECT = 0x1d48;
const OOT_PLAY_OFF_CURRENT_ROOM = 0x11cbc;
const OOT_PLAY_OFF_LINK_AGE_ON_LOAD = 0x11de8;

const MM_PLAY_OFF_SCENE_ID = 0x00a4;
const MM_PLAY_OFF_SWITCH0_FLAGS = 0x1e58;
const MM_PLAY_OFF_SWITCH1_FLAGS = 0x1e5c;
const MM_PLAY_OFF_CHEST_FLAGS = 0x1e68;
const MM_PLAY_OFF_COLLECT_FLAGS = 0x1e74;
const MM_PLAY_OFF_CURRENT_ROOM = 0x186e0;

const OOT_PLAYSTATE_FLAGS_SIZE =
  OOT_PLAY_OFF_TEMP_COLLECT + 4 - OOT_PLAY_OFF_CHEST_FLAGS;
const MM_PLAYSTATE_FLAGS_SIZE =
  MM_PLAY_OFF_COLLECT_FLAGS + 4 - MM_PLAY_OFF_SWITCH0_FLAGS;

const OOT_OFF_SCENE_ID = 0x66;
const OOT_OFF_MAGIC_ACQUIRED = 0x3a;
const OOT_OFF_DOUBLE_MAGIC = 0x3c;
const OOT_OFF_OCARINA_GAME_ROUND = 0x3f;
const OOT_OFF_IS_BIGGORON_SWORD = 0x3e;
const OOT_OFF_INV_ITEMS = 0x74;
const OOT_OFF_INV_AMMO = 0x8c;
const OOT_OFF_INV_BEANS = 0x9b;
const OOT_OFF_EQUIPMENT = 0x9c;
const OOT_OFF_UPGRADES = 0x0a0;
const OOT_OFF_QUEST_ITEMS = 0x0a4;
const OOT_OFF_DUNGEON_ITEMS = 0x0a8;
const OOT_OFF_DUNGEON_KEYS = 0x0bc;
const OOT_OFF_GOLD_TOKENS = 0x0d0;
const OOT_OFF_PERM = 0x0d4;
const OOT_OFF_EVENTS_CHK = 0x0ed4;
const OOT_OFF_EVENTS_ITEM = 0x0ef0;
const OOT_OFF_EVENTS_MISC = 0x0ef8;
const OOT_OFF_GS_FLAGS = 0x0e9c;
const OOT_OFF_AGE = 0x04;
const OOT_PERM_ENTRY_SIZE = 0x1c;
const OOT_PERM_COUNT = 124;
const OOT_PERM_EXTRA_OFF = 0x10;
const OOT_CTX_OFF_GAME_MODE = 0x135c;
const OOT_ACTIVE_SAVE_END = OOT_OFF_EVENTS_MISC + 30 * 2;

const MM_OFF_PLAYER_FORM = 0x20;
const MM_OFF_DAY = 0x18;
const MM_OFF_TIME = 0x0c;
const MM_OFF_MAGIC_ACQUIRED = 0x40;
const MM_OFF_DOUBLE_MAGIC = 0x41;
const MM_OFF_OWL_ACTIVATION_FLAGS = 0x46;
const MM_OFF_EQUIPMENT = 0x6c;
const MM_OFF_INV_ITEMS = 0x70;
const MM_OFF_INV_AMMO = 0x0a0;
const MM_OFF_INV_UPGRADES = 0x0b8;
const MM_OFF_INV_QUEST = 0x0bc;
const MM_OFF_DUNGEON_ITEMS = 0x0c0;
const MM_OFF_DUNGEON_KEYS = 0x0ca;
const MM_OFF_STRAY_FAIRIES = 0x0d4;
const MM_OFF_PERM_SCENES = 0x0f8;
const MM_OFF_SKULL_SWAMP = 0x0ec0;
const MM_OFF_SKULL_OCEAN = 0x0ec2;
const MM_OFF_WEEK_EVENT_REG = 0x0ef8;
const MM_PERM_ENTRY_SIZE = 0x1c;
const MM_PERM_COUNT = 120;
const MM_CTX_OFF_GAME_MODE = 0x3ca8;
const MM_CTX_OFF_CYCLE_FLAGS = 0x3f68;
const MM_ACTIVE_SAVE_START = MM_OFF_MAGIC_ACQUIRED;
const MM_ACTIVE_SAVE_END = MM_OFF_WEEK_EVENT_REG + 100;
const MM_CYCLE_FLAGS_SIZE = MM_PERM_COUNT * 0x14;

const EXTRA_IDX_OOT_TRADE = 0;
const EXTRA_IDX_OOT_FLAGS = 2;
const EXTRA_IDX_MM_BOSS = 3;
const EXTRA_IDX_MM_TRADE = 5;
const EXTRA_IDX_MM_FLAGS = 6;
const EXTRA_IDX_MM_FLAGS2 = 7;
const EXTRA_IDX_COW_FLAGS = 9;
const EXTRA_IDX_OOT_TRADE_SAVE = 10;
const EXTRA_IDX_MM_OWL_FLAGS = 11;
const EXTRA_IDX_MM_FLAGS3 = 13;
const EXTRA_IDX_OOT_SILVER_1 = 14;
const EXTRA_IDX_OOT_TRIFORCE = 19;

const QUEST_OOT_MEDALLION_FOREST = 0;
const QUEST_OOT_MEDALLION_FIRE = 1;
const QUEST_OOT_MEDALLION_WATER = 2;
const QUEST_OOT_MEDALLION_SPIRIT = 3;
const QUEST_OOT_MEDALLION_SHADOW = 4;
const QUEST_OOT_MEDALLION_LIGHT = 5;
const QUEST_OOT_SONG_MINUET = 6;
const QUEST_OOT_SONG_BOLERO = 7;
const QUEST_OOT_SONG_SERENADE = 8;
const QUEST_OOT_SONG_REQUIEM = 9;
const QUEST_OOT_SONG_NOCTURNE = 10;
const QUEST_OOT_SONG_PRELUDE = 11;
const QUEST_OOT_SONG_LULLABY = 12;
const QUEST_OOT_SONG_EPONA = 13;
const QUEST_OOT_SONG_SARIA = 14;
const QUEST_OOT_SONG_SUN = 15;
const QUEST_OOT_SONG_TIME = 16;
const QUEST_OOT_SONG_STORMS = 17;
const QUEST_OOT_STONE_EMERALD = 18;
const QUEST_OOT_STONE_RUBY = 19;
const QUEST_OOT_STONE_SAPPHIRE = 20;
const QUEST_OOT_AGONY = 21;
const QUEST_OOT_GERUDO_CARD = 22;

const QUEST_MM_REMAINS_ODOLWA = 0;
const QUEST_MM_REMAINS_GOHT = 1;
const QUEST_MM_REMAINS_GYORG = 2;
const QUEST_MM_REMAINS_TWINMOLD = 3;
const QUEST_MM_SONG_AWAKENING = 6;
const QUEST_MM_SONG_GORON = 7;
const QUEST_MM_SONG_ZORA = 8;
const QUEST_MM_SONG_EMPTINESS = 9;
const QUEST_MM_SONG_ORDER = 10;
const QUEST_MM_SONG_SARIA = 11;
const QUEST_MM_SONG_TIME = 12;
const QUEST_MM_SONG_HEALING = 13;
const QUEST_MM_SONG_EPONA = 14;
const QUEST_MM_SONG_SOARING = 15;
const QUEST_MM_SONG_STORMS = 16;
const QUEST_MM_SONG_SUN = 17;
const QUEST_MM_NOTEBOOK = 18;

const MM_WEEK_EVENT_TOWN_STRAY_FAIRY_BYTE = 8;
const MM_WEEK_EVENT_TOWN_STRAY_FAIRY_MASK = 0x80;

const DUNGEON_ITEM_MAP_MASK = 0x04;
const DUNGEON_ITEM_COMPASS_MASK = 0x02;
const DUNGEON_ITEM_BOSS_KEY_MASK = 0x01;

const FISHING_POND_LOACH_WEIGHT_MASK = 0x80;
const FISHING_POND_CHILD_FISH_MIN_WEIGHT = 2;
const FISHING_POND_CHILD_FISH_MAX_WEIGHT = 14;
const FISHING_POND_ADULT_FISH_MIN_WEIGHT = 4;
const FISHING_POND_ADULT_FISH_MAX_WEIGHT = 25;
const FISHING_POND_CHILD_LOACH_MIN_WEIGHT = 14;
const FISHING_POND_CHILD_LOACH_MAX_WEIGHT = 19;
const FISHING_POND_ADULT_LOACH_MIN_WEIGHT = 29;
const FISHING_POND_ADULT_LOACH_MAX_WEIGHT = 36;

const SHARED_OCARINA_BUTTON_MASK_DISABLED = 0xffff;
const SHARED_OCARINA_BUTTON_A_MASK = 0x8000;
const SHARED_OCARINA_BUTTON_C_RIGHT_MASK = 0x0001;
const SHARED_OCARINA_BUTTON_C_LEFT_MASK = 0x0002;
const SHARED_OCARINA_BUTTON_C_UP_MASK = 0x0004;
const SHARED_OCARINA_BUTTON_C_DOWN_MASK = 0x0008;

const OOT_EXTRA_FLAGS_CHILD_WALLET_BIT = 17;
const OOT_EXTRA_FLAGS_BOTTOMLESS_BIT = 7;
const MM_EXTRA_FLAGS_2_CHILD_WALLET_BIT = 31;
const MM_EXTRA_FLAGS_3_BOTTOMLESS_BIT = 31;

const OOT_NPC_LOST_WOODS_MEMORY_BIT = 12;

const OOT_EVENT_ITEM_LOST_WOODS_MEMORY = 0x17;

const MM_SKELETON_KEY_MAX_KEYS = [1, 3, 1, 4];
const OOT_FALLBACK_MAX_KEYS = [
  0, 0, 0, 5, 7, 5, 5, 5, 3, 0, 0, 9, 4, 2, 0, 0, 0,
];
const OOT_FALLBACK_SILVER_RUPEE_MAX_COUNTS = [
  0, 5, 5, 5, 5, 5, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
];

const OOT_SILVER_RUPEE_ITEM_IDS = [
  ['OOT_RUPEE_SILVER_DC', 'OOT_RUPEE_SILVER_DC'],
  ['OOT_RUPEE_SILVER_BOTW', 'OOT_RUPEE_SILVER_BOTW'],
  ['OOT_RUPEE_SILVER_SPIRIT_CHILD', 'OOT_RUPEE_SILVER_SPIRIT_LOBBY'],
  ['OOT_RUPEE_SILVER_SPIRIT_SUN', 'OOT_RUPEE_SILVER_SPIRIT_ADULT'],
  ['OOT_RUPEE_SILVER_SPIRIT_BOULDERS', 'OOT_RUPEE_SILVER_SPIRIT_BOULDERS'],
  ['OOT_RUPEE_SILVER_SHADOW_SCYTHE', 'OOT_RUPEE_SILVER_SHADOW_SCYTHE'],
  ['OOT_RUPEE_SILVER_SHADOW_BLADES', 'OOT_RUPEE_SILVER_SHADOW_BLADES'],
  ['OOT_RUPEE_SILVER_SHADOW_PIT', 'OOT_RUPEE_SILVER_SHADOW_PIT'],
  ['OOT_RUPEE_SILVER_SHADOW_SPIKES', 'OOT_RUPEE_SILVER_SHADOW_SPIKES'],
  ['OOT_RUPEE_SILVER_IC_SCYTHE', 'OOT_RUPEE_SILVER_IC_SCYTHE'],
  ['OOT_RUPEE_SILVER_IC_BLOCK', 'OOT_RUPEE_SILVER_IC_BLOCK'],
  ['OOT_RUPEE_SILVER_GTG_SLOPES', 'OOT_RUPEE_SILVER_GTG_SLOPES'],
  ['OOT_RUPEE_SILVER_GTG_LAVA', 'OOT_RUPEE_SILVER_GTG_LAVA'],
  ['OOT_RUPEE_SILVER_GTG_WATER', 'OOT_RUPEE_SILVER_GTG_WATER'],
  ['OOT_RUPEE_SILVER_GANON_SPIRIT', 'OOT_RUPEE_SILVER_GANON_SHADOW'],
  ['OOT_RUPEE_SILVER_GANON_LIGHT', 'OOT_RUPEE_SILVER_GANON_WATER'],
  ['OOT_RUPEE_SILVER_GANON_FIRE', 'OOT_RUPEE_SILVER_GANON_FIRE'],
  ['OOT_RUPEE_SILVER_GANON_FOREST', 'OOT_RUPEE_SILVER_GANON_FOREST'],
] as const;

const OOT_ITEM_RUTO_LETTER = 0x1b;
const MM_ITEM_GOLD_DUST = 0x22;
const MM_ITEM_RUTO_LETTER = 0xb6;

const EMPTY_INVENTORY_ITEM = 0xff;

const SHARED_COIN_COUNT = 4;
const SHARED_BOMBCHU_BAG_OOT_SHIFT = 4;
const SHARED_BOMBCHU_BAG_MM_SHIFT = 6;
const SHARED_BOMBCHU_BAG_MASK = 0x3;

const OOT_SCENE_TEMPLE_FOREST = 3;
const OOT_SCENE_TEMPLE_FIRE = 4;
const OOT_SCENE_TEMPLE_WATER = 5;
const OOT_SCENE_TEMPLE_SPIRIT = 6;
const OOT_SCENE_TEMPLE_SHADOW = 7;
const OOT_SCENE_BOTTOM_OF_THE_WELL = 8;
const OOT_SCENE_GERUDO_TRAINING_GROUND = 11;
const OOT_SCENE_INSIDE_GANON_CASTLE = 13;

const OOT_MQ_DODONGOS_CAVERN = 1;
const OOT_MQ_TEMPLE_FOREST = 3;
const OOT_MQ_TEMPLE_FIRE = 4;
const OOT_MQ_TEMPLE_WATER = 5;
const OOT_MQ_TEMPLE_SPIRIT = 6;
const OOT_MQ_TEMPLE_SHADOW = 7;
const OOT_MQ_BOTTOM_OF_THE_WELL = 8;
const OOT_MQ_ICE_CAVERN = 9;
const OOT_MQ_GERUDO_TRAINING_GROUNDS = 10;
const OOT_MQ_GANON_CASTLE = 11;
const OOT_MQ_DUNGEON_COUNT = 12;

const MM_EXTRA_BOSS_LEGACY_DUNGEON_INDEX_BASE = 8;

const MM_OWL_ITEMS = [
  ['MM_OWL_GREAT_BAY', 0],
  ['MM_OWL_ZORA_CAPE', 1],
  ['MM_OWL_SNOWHEAD', 2],
  ['MM_OWL_MOUNTAIN_VILLAGE', 3],
  ['MM_OWL_CLOCK_TOWN', 4],
  ['MM_OWL_MILK_ROAD', 5],
  ['MM_OWL_WOODFALL', 6],
  ['MM_OWL_SOUTHERN_SWAMP', 7],
  ['MM_OWL_IKANA_CANYON', 8],
  ['MM_OWL_STONE_TOWER', 9],
  ['MM_OWL_HIDDEN', 15],
] as const;

const SHARED_OCARINA_BUTTONS = [
  ['OOT_BUTTON_A', 'MM_BUTTON_A', SHARED_OCARINA_BUTTON_A_MASK],
  [
    'OOT_BUTTON_C_RIGHT',
    'MM_BUTTON_C_RIGHT',
    SHARED_OCARINA_BUTTON_C_RIGHT_MASK,
  ],
  ['OOT_BUTTON_C_LEFT', 'MM_BUTTON_C_LEFT', SHARED_OCARINA_BUTTON_C_LEFT_MASK],
  ['OOT_BUTTON_C_UP', 'MM_BUTTON_C_UP', SHARED_OCARINA_BUTTON_C_UP_MASK],
  ['OOT_BUTTON_C_DOWN', 'MM_BUTTON_C_DOWN', SHARED_OCARINA_BUTTON_C_DOWN_MASK],
] as const;

const OOT_ADULT_TRADE_CONSUMPTION_FALLBACKS = [
  [0, 'POCKET_EGG'],
  [1, 'TRADE_COJIRO'],
  [2, 'TRADE_ODD_MUSHROOM'],
  [3, 'TRADE_ODD_POTION'],
  [4, 'TRADE_POACHER_SAW'],
  [5, 'TRADE_BROKEN_GORON_SWORD'],
  [6, 'TRADE_PRESCRIPTION'],
  [7, 'TRADE_EYEBALL_FROG'],
  [8, 'TRADE_EYE_DROPS'],
  [9, 'TRADE_CLAIM_CHECK'],
  [10, 'TRADE_BIGGORON_SWORD'],
] as const;

const OOT_SILVER_RUPEE_ALLOWED: ReadonlyArray<
  ReadonlyArray<{ flag: number; count: number }>
> = [
  [
    { flag: 0x00, count: 0x00 },
    { flag: 0x25, count: 0x05 },
  ],
  [
    { flag: 0x1f, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
  [
    { flag: 0x05, count: 0x05 },
    { flag: 0x37, count: 0x05 },
  ],
  [
    { flag: 0x0a, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
  [
    { flag: 0x02, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
  [
    { flag: 0x01, count: 0x05 },
    { flag: 0x01, count: 0x05 },
  ],
  [
    { flag: 0x00, count: 0x00 },
    { flag: 0x03, count: 0x0a },
  ],
  [
    { flag: 0x09, count: 0x05 },
    { flag: 0x11, count: 0x05 },
  ],
  [
    { flag: 0x08, count: 0x05 },
    { flag: 0x08, count: 0x0a },
  ],
  [
    { flag: 0x08, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
  [
    { flag: 0x09, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
  [
    { flag: 0x1c, count: 0x05 },
    { flag: 0x1c, count: 0x05 },
  ],
  [
    { flag: 0x0c, count: 0x05 },
    { flag: 0x0c, count: 0x06 },
  ],
  [
    { flag: 0x1b, count: 0x05 },
    { flag: 0x1b, count: 0x03 },
  ],
  [
    { flag: 0x0b, count: 0x05 },
    { flag: 0x0b, count: 0x05 },
  ],
  [
    { flag: 0x12, count: 0x05 },
    { flag: 0x02, count: 0x05 },
  ],
  [
    { flag: 0x09, count: 0x05 },
    { flag: 0x01, count: 0x05 },
  ],
  [
    { flag: 0x0e, count: 0x05 },
    { flag: 0x00, count: 0x00 },
  ],
];

const SHARED_CHECK_BITMAP_NAMES = [
  'xflagsOot',
  'npcOot',
  'shopsOot',
  'scrubsOot',
  'srOot',
  'xflagsMm',
  'npcMm',
  'shopsMm',
  'caughtFishFlags',
  'progressiveFlags',
] as const;

const OOT_SAVE_CTX_CHUNK = 'oot_save_state';
const MM_SAVE_CTX_CHUNK = 'mm_save_state';
const OOT_FOREIGN_MM_SAVE_CHUNK = 'oot_foreign_mm_save';
const MM_FOREIGN_OOT_SAVE_CHUNK = 'mm_foreign_oot_save';
const OOT_SHARED_CUSTOM_SAVE_CHUNK = 'oot_shared_custom_save';
const MM_SHARED_CUSTOM_SAVE_CHUNK = 'mm_shared_custom_save';
const OOT_RUNTIME_COMBO_CONFIG_CHUNK = 'oot_runtime_combo_config';
const MM_RUNTIME_COMBO_CONFIG_CHUNK = 'mm_runtime_combo_config';
const OOT_RUNTIME_SILVER_RUPEE_DATA_CHUNK = 'oot_runtime_silver_rupee_data';
const OOT_RUNTIME_MAX_KEYS_CHUNK = 'oot_runtime_max_keys';
const MM_CYCLE_FLAGS_CHUNK = 'mm_cycle_flags';
const OOT_PLAYSTATE_SCENE_CHUNK = 'oot_playstate_scene';
const OOT_PLAYSTATE_ROOM_CHUNK = 'oot_playstate_room';
const OOT_PLAYSTATE_LINK_AGE_CHUNK = 'oot_playstate_link_age';
const OOT_PLAYSTATE_FLAGS_CHUNK = 'oot_playstate_flags';
const MM_PLAYSTATE_SCENE_CHUNK = 'mm_playstate_scene';
const MM_PLAYSTATE_ROOM_CHUNK = 'mm_playstate_room';
const MM_PLAYSTATE_FLAGS_CHUNK = 'mm_playstate_flags';
const OOT_SAVE_CTX_USED_SIZE = Math.max(
  OOT_SAVE_SIZE,
  OOT_CTX_OFF_GAME_MODE + 4,
);
const MM_SAVE_CTX_USED_SIZE = Math.max(
  MM_SAVE_SIZE,
  MM_CTX_OFF_GAME_MODE + 4,
  MM_CTX_OFF_CYCLE_FLAGS + MM_PERM_COUNT * 0x14,
);
let inventorySlotFile = inventorySlotsData as InventorySlotFile;

const DEFAULT_FIXED_OFFSETS: SharedFixedOffsets = {
  sharedCustomSaveSize: 0x880,
  halfDaysOffset: 0x6de,
  coinsOffset: 0x7c0,
  ocarinaButtonMaskOotOffset: 0x7c8,
  ocarinaButtonMaskMmOffset: 0x7ca,
  caughtChildFishWeightOffset: 2037,
  caughtAdultFishWeightOffset: 2057,
  caughtFishWeightCount: 20,
  songNotesOffset: 2125,
  songNoteCount: 38,
  rustyKeysOffset: 2163,
  rustyKeysOotSize: 4,
  rustyKeysMmSize: 5,
  bombchuBagFlagsOffset: 2114,
  songFlagsOotOffset: 0x362,
};

let sharedFixedOffsets: SharedFixedOffsets = { ...DEFAULT_FIXED_OFFSETS };

let sharedStateReadSize = Math.max(
  sharedFixedOffsets.sharedCustomSaveSize,
  inventorySlotFile.catalog.shared.trackedSize,
  sharedFixedOffsets.songNotesOffset + sharedFixedOffsets.songNoteCount,
  sharedFixedOffsets.bombchuBagFlagsOffset + 1,
  sharedFixedOffsets.rustyKeysOffset +
    sharedFixedOffsets.rustyKeysOotSize +
    sharedFixedOffsets.rustyKeysMmSize,
);

const buildSharedStateChunkSpecs = (
  prefix: 'oot' | 'mm',
  baseAddress: number,
  layout: SharedStorageLayout,
): RawAutotrackerChunkSpec[] => {
  const specs: RawAutotrackerChunkSpec[] = layout.bitmaps.map((bitmap) => ({
    name: `${prefix}_shared_custom_save_bitmap_${bitmap.name}`,
    address: baseAddress + bitmap.offset,
    length: bitmap.size,
  }));

  const fo = sharedFixedOffsets;

  specs.push(
    {
      name: `${prefix}_shared_custom_save_half_days`,
      address: baseAddress + fo.halfDaysOffset,
      length: 1,
    },
    {
      name: `${prefix}_shared_custom_save_fish_weights`,
      address: baseAddress + fo.caughtChildFishWeightOffset,
      length:
        fo.caughtAdultFishWeightOffset +
        fo.caughtFishWeightCount -
        fo.caughtChildFishWeightOffset,
    },
    {
      name: `${prefix}_shared_custom_save_coins_and_masks`,
      address: baseAddress + fo.coinsOffset,
      length: fo.ocarinaButtonMaskMmOffset + 2 - fo.coinsOffset,
    },
    {
      name: `${prefix}_shared_custom_save_bombchu_bag_flags`,
      address: baseAddress + fo.bombchuBagFlagsOffset,
      length: 1,
    },
    {
      name: `${prefix}_shared_custom_save_song_notes`,
      address: baseAddress + fo.songNotesOffset,
      length: fo.songNoteCount,
    },
    {
      name: `${prefix}_shared_custom_save_song_flags_oot`,
      address: baseAddress + fo.songFlagsOotOffset,
      length: 2,
    },
    {
      name: `${prefix}_shared_custom_save_rusty_keys`,
      address: baseAddress + fo.rustyKeysOffset,
      length: fo.rustyKeysOotSize + fo.rustyKeysMmSize,
    },
  );

  specs.sort((left, right) => {
    if (left.address === right.address) {
      return left.name.localeCompare(right.name);
    }
    return left.address - right.address;
  });

  return specs;
};

export interface RawAutotrackerMemoryAreas {
  oot: string[];
  mm: string[];
}

export let RAW_CHUNK_SPECS_BY_GAME: RawAutotrackerChunkSpecsByGame;
export let RAW_CHUNK_SPECS: RawAutotrackerChunkSpec[];
export let RAW_MEMORY_AREAS_BY_GAME: RawAutotrackerMemoryAreas;

function rebuildChunkSpecs(): void {
  const activeOot = buildActiveOotSaveChunkSpecs();
  const activeMm = buildActiveMmSaveChunkSpecs();
  const foreignOot = buildForeignOotSaveChunkSpecs();
  const foreignMm = buildForeignMmSaveChunkSpecs();
  const ootShared = buildSharedStateChunkSpecs(
    'oot',
    addrOotSharedCustomSaveLive,
    inventorySlotFile.catalog.shared,
  );
  const mmShared = buildSharedStateChunkSpecs(
    'mm',
    addrMmSharedCustomSaveLive,
    inventorySlotFile.catalog.shared,
  );

  const byGame: RawAutotrackerChunkSpecsByGame = {
    oot: [
      ...activeOot,
      ...foreignMm,
      ...ootShared,
      {
        name: OOT_RUNTIME_COMBO_CONFIG_CHUNK,
        address: addrOotRuntimeOotComboConfigLive,
        length: OOT_COMBO_CONFIG_SIZE,
      },
      {
        name: OOT_RUNTIME_SILVER_RUPEE_DATA_CHUNK,
        address: addrOotRuntimeSilverRupeeDataLive,
        length: OOT_SILVER_RUPEE_DATA_SIZE,
      },
      {
        name: OOT_RUNTIME_MAX_KEYS_CHUNK,
        address: addrOotRuntimeMaxKeysLive,
        length: OOT_MAX_KEYS_BLOCK_SIZE,
      },
      {
        name: OOT_PLAYSTATE_SCENE_CHUNK,
        address: ADDR_OOT_PLAYSTATE_NTSC_10 + OOT_PLAY_OFF_SCENE_ID,
        length: 2,
      },
      {
        name: OOT_PLAYSTATE_ROOM_CHUNK,
        address: ADDR_OOT_PLAYSTATE_NTSC_10 + OOT_PLAY_OFF_CURRENT_ROOM,
        length: 1,
      },
      {
        name: OOT_PLAYSTATE_LINK_AGE_CHUNK,
        address: ADDR_OOT_PLAYSTATE_NTSC_10 + OOT_PLAY_OFF_LINK_AGE_ON_LOAD,
        length: 1,
      },
      {
        name: OOT_PLAYSTATE_FLAGS_CHUNK,
        address: ADDR_OOT_PLAYSTATE_NTSC_10 + OOT_PLAY_OFF_CHEST_FLAGS,
        length: OOT_PLAYSTATE_FLAGS_SIZE,
      },
    ],
    mm: [
      ...activeMm,
      ...foreignOot,
      ...mmShared,
      {
        name: MM_RUNTIME_COMBO_CONFIG_CHUNK,
        address: addrMmRuntimeOotComboConfigLive,
        length: OOT_COMBO_CONFIG_SIZE,
      },
      {
        name: MM_PLAYSTATE_SCENE_CHUNK,
        address: ADDR_MM_PLAYSTATE_1 + MM_PLAY_OFF_SCENE_ID,
        length: 2,
      },
      {
        name: MM_PLAYSTATE_ROOM_CHUNK,
        address: ADDR_MM_PLAYSTATE_1 + MM_PLAY_OFF_CURRENT_ROOM,
        length: 1,
      },
      {
        name: MM_PLAYSTATE_FLAGS_CHUNK,
        address: ADDR_MM_PLAYSTATE_1 + MM_PLAY_OFF_SWITCH0_FLAGS,
        length: MM_PLAYSTATE_FLAGS_SIZE,
      },
    ],
  };

  const legacySpecs: RawAutotrackerChunkSpec[] = [
    {
      name: OOT_SAVE_CTX_CHUNK,
      address: addrOotSaveCtx + OOT_OFF_AGE,
      length: OOT_ACTIVE_SAVE_END - OOT_OFF_AGE,
    },
    {
      name: MM_SAVE_CTX_CHUNK,
      address: addrMmSaveCtx + MM_ACTIVE_SAVE_START,
      length: MM_ACTIVE_SAVE_END - MM_ACTIVE_SAVE_START,
    },
    {
      name: OOT_FOREIGN_MM_SAVE_CHUNK,
      address: addrOotForeignMmSaveLive,
      length: MM_SAVE_SIZE,
    },
    {
      name: MM_FOREIGN_OOT_SAVE_CHUNK,
      address: addrMmForeignOotSaveLive,
      length: OOT_SAVE_SIZE,
    },
    {
      name: OOT_SHARED_CUSTOM_SAVE_CHUNK,
      address: addrOotSharedCustomSaveLive,
      length: sharedStateReadSize,
    },
    {
      name: MM_SHARED_CUSTOM_SAVE_CHUNK,
      address: addrMmSharedCustomSaveLive,
      length: sharedStateReadSize,
    },
  ];

  RAW_CHUNK_SPECS_BY_GAME = byGame;
  RAW_CHUNK_SPECS = [...byGame.oot, ...byGame.mm, ...legacySpecs];
  RAW_MEMORY_AREAS_BY_GAME = {
    oot: byGame.oot.map((spec) => spec.name),
    mm: byGame.mm.map((spec) => spec.name),
  };
}

function buildActiveOotSaveChunkSpecs(): RawAutotrackerChunkSpec[] {
  return [
    {
      name: 'oot_save_state_age',
      address: addrOotSaveCtx + OOT_OFF_AGE,
      length: 4,
    },
    {
      name: 'oot_save_state_magic',
      address: addrOotSaveCtx + OOT_OFF_MAGIC_ACQUIRED,
      length: OOT_OFF_OCARINA_GAME_ROUND + 1 - OOT_OFF_MAGIC_ACQUIRED,
    },
    {
      name: 'oot_save_state_scene',
      address: addrOotSaveCtx + OOT_OFF_SCENE_ID,
      length: 2,
    },
    {
      name: 'oot_save_state_inventory',
      address: addrOotSaveCtx + OOT_OFF_INV_ITEMS,
      length: OOT_OFF_GOLD_TOKENS + 2 - OOT_OFF_INV_ITEMS,
    },
    {
      name: 'oot_save_state_scene_flags',
      address: addrOotSaveCtx + OOT_OFF_PERM,
      length: OOT_PERM_COUNT * OOT_PERM_ENTRY_SIZE,
    },
    {
      name: 'oot_save_state_gs_flags',
      address: addrOotSaveCtx + OOT_OFF_GS_FLAGS,
      length: 6 * 4,
    },
    {
      name: 'oot_save_state_events',
      address: addrOotSaveCtx + OOT_OFF_EVENTS_CHK,
      length: OOT_ACTIVE_SAVE_END - OOT_OFF_EVENTS_CHK,
    },
  ];
}

function buildActiveMmSaveChunkSpecs(): RawAutotrackerChunkSpec[] {
  return [
    {
      name: 'mm_save_state_day',
      address: addrMmSaveCtx + MM_OFF_DAY,
      length: 4,
    },
    {
      name: 'mm_save_state_player_form',
      address: addrMmSaveCtx + MM_OFF_PLAYER_FORM,
      length: 1,
    },
    {
      name: 'mm_save_state_magic',
      address: addrMmSaveCtx + MM_ACTIVE_SAVE_START,
      length: MM_OFF_DOUBLE_MAGIC + 1 - MM_ACTIVE_SAVE_START,
    },
    {
      name: 'mm_save_state_owl_flags',
      address: addrMmSaveCtx + MM_OFF_OWL_ACTIVATION_FLAGS,
      length: 2,
    },
    {
      name: 'mm_save_state_inventory',
      address: addrMmSaveCtx + MM_OFF_EQUIPMENT,
      length: MM_OFF_STRAY_FAIRIES + 10 - MM_OFF_EQUIPMENT,
    },
    {
      name: 'mm_save_state_scene_flags',
      address: addrMmSaveCtx + MM_OFF_PERM_SCENES,
      length: MM_PERM_COUNT * MM_PERM_ENTRY_SIZE,
    },
    {
      name: 'mm_save_state_skull_tokens',
      address: addrMmSaveCtx + MM_OFF_SKULL_SWAMP,
      length: MM_OFF_SKULL_OCEAN + 2 - MM_OFF_SKULL_SWAMP,
    },
    {
      name: 'mm_save_state_week_events',
      address: addrMmSaveCtx + MM_OFF_WEEK_EVENT_REG,
      length: MM_ACTIVE_SAVE_END - MM_OFF_WEEK_EVENT_REG,
    },
    {
      name: MM_CYCLE_FLAGS_CHUNK,
      address: addrMmSaveCtx + MM_CTX_OFF_CYCLE_FLAGS,
      length: MM_CYCLE_FLAGS_SIZE,
    },
  ];
}

function buildForeignOotSaveChunkSpecs(): RawAutotrackerChunkSpec[] {
  return [
    {
      name: 'mm_foreign_oot_save_age',
      address: addrMmForeignOotSaveLive + OOT_OFF_AGE,
      length: 4,
    },
    {
      name: 'mm_foreign_oot_save_magic',
      address: addrMmForeignOotSaveLive + OOT_OFF_MAGIC_ACQUIRED,
      length: OOT_OFF_OCARINA_GAME_ROUND + 1 - OOT_OFF_MAGIC_ACQUIRED,
    },
    {
      name: 'mm_foreign_oot_save_scene',
      address: addrMmForeignOotSaveLive + OOT_OFF_SCENE_ID,
      length: 2,
    },
    {
      name: 'mm_foreign_oot_save_inventory',
      address: addrMmForeignOotSaveLive + OOT_OFF_INV_ITEMS,
      length: OOT_OFF_GOLD_TOKENS + 2 - OOT_OFF_INV_ITEMS,
    },
    {
      name: 'mm_foreign_oot_save_scene_flags',
      address: addrMmForeignOotSaveLive + OOT_OFF_PERM,
      length: OOT_PERM_COUNT * OOT_PERM_ENTRY_SIZE,
    },
    {
      name: 'mm_foreign_oot_save_gs_flags',
      address: addrMmForeignOotSaveLive + OOT_OFF_GS_FLAGS,
      length: 6 * 4,
    },
    {
      name: 'mm_foreign_oot_save_events',
      address: addrMmForeignOotSaveLive + OOT_OFF_EVENTS_CHK,
      length: OOT_ACTIVE_SAVE_END - OOT_OFF_EVENTS_CHK,
    },
  ];
}

function buildForeignMmSaveChunkSpecs(): RawAutotrackerChunkSpec[] {
  return [
    {
      name: 'oot_foreign_mm_save_day',
      address: addrOotForeignMmSaveLive + MM_OFF_DAY,
      length: 4,
    },
    {
      name: 'oot_foreign_mm_save_player_form',
      address: addrOotForeignMmSaveLive + MM_OFF_PLAYER_FORM,
      length: 1,
    },
    {
      name: 'oot_foreign_mm_save_magic',
      address: addrOotForeignMmSaveLive + MM_ACTIVE_SAVE_START,
      length: MM_OFF_DOUBLE_MAGIC + 1 - MM_ACTIVE_SAVE_START,
    },
    {
      name: 'oot_foreign_mm_save_owl_flags',
      address: addrOotForeignMmSaveLive + MM_OFF_OWL_ACTIVATION_FLAGS,
      length: 2,
    },
    {
      name: 'oot_foreign_mm_save_inventory',
      address: addrOotForeignMmSaveLive + MM_OFF_EQUIPMENT,
      length: MM_OFF_STRAY_FAIRIES + 10 - MM_OFF_EQUIPMENT,
    },
    {
      name: 'oot_foreign_mm_save_scene_flags',
      address: addrOotForeignMmSaveLive + MM_OFF_PERM_SCENES,
      length: MM_PERM_COUNT * MM_PERM_ENTRY_SIZE,
    },
    {
      name: 'oot_foreign_mm_save_skull_tokens',
      address: addrOotForeignMmSaveLive + MM_OFF_SKULL_SWAMP,
      length: MM_OFF_SKULL_OCEAN + 2 - MM_OFF_SKULL_SWAMP,
    },
    {
      name: 'oot_foreign_mm_save_week_events',
      address: addrOotForeignMmSaveLive + MM_OFF_WEEK_EVENT_REG,
      length: MM_ACTIVE_SAVE_END - MM_OFF_WEEK_EVENT_REG,
    },
    {
      name: 'oot_foreign_mm_cycle_flags',
      address: addrOotForeignMmSaveLive + MM_CTX_OFF_CYCLE_FLAGS,
      length: MM_CYCLE_FLAGS_SIZE,
    },
  ];
}

// Initialize at module load time from the default data.
rebuildChunkSpecs();

let locationFile = locationsData as LocationFile;
let mmSpecialLocationEntries =
  specialLocationsMmData as MmSpecialLocationEntry[];
let ootSpecialLocationEntries =
  specialLocationsOotData as OotSpecialLocationEntry[];

let ootInventoryEntries = buildInventorySlotTable(inventorySlotFile.oot);
let mmInventoryEntries = buildInventorySlotTable(inventorySlotFile.mm);
let sharedStorage = inventorySlotFile.catalog.shared;
let sharedBitmaps = buildSharedBitmapTable(sharedStorage);
let trackedCatalogItems: CatalogItemEntry[];
let catalogItemSources: Map<string, CatalogItemSource>;
let sharedBitmapUsedBits: Map<string, number>;
{
  const built = buildCatalogTables(
    inventorySlotFile.catalog.items,
    sharedBitmaps,
  );
  trackedCatalogItems = built.trackedCatalogItems;
  catalogItemSources = built.catalogItemSources;
  sharedBitmapUsedBits = built.sharedBitmapUsedBits;
}

markSharedCheckBitmapsUsed(sharedBitmapUsedBits, sharedBitmaps);

let checkNameTable: Map<string, string>;
let ootSceneConflictTable: Map<string, SceneConflictEntry>;
let fishCheckTables: Map<string, Map<number, string>>;
let npcCheckTables: Map<string, Map<number, string>>;
let gsCheckTables: Map<string, Map<number, string>>;
let xflagCheckTables: Map<string, Map<number, string>>;
let ootBitmapConflictTable: Map<string, Map<number, BitmapConflictEntry>>;
let shopCheckTables: Map<string, Map<number, string>>;
let scrubCheckTables: Map<string, Map<number, string>>;
let silverRupeeCheckTables: Map<string, Map<number, string>>;
let npcSymbolTables: Map<string, Map<string, string>>;
{
  const built = buildLocationTables(locationFile);
  checkNameTable = built.checkNameTable;
  ootSceneConflictTable = built.ootSceneConflictTable;
  fishCheckTables = built.fishCheckTables;
  npcCheckTables = built.npcCheckTables;
  gsCheckTables = built.gsCheckTables;
  xflagCheckTables = built.xflagCheckTables;
  ootBitmapConflictTable = built.ootBitmapConflictTable;
  shopCheckTables = built.shopCheckTables;
  scrubCheckTables = built.scrubCheckTables;
  silverRupeeCheckTables = built.silverRupeeCheckTables;
  npcSymbolTables = built.npcSymbolTables;
}

let ootSymbolChecks = buildOotSymbolChecks(ootSpecialLocationEntries);
let mmSymbolChecks = buildMmSymbolChecks(mmSpecialLocationEntries);

let sceneCheckFallbacks = new Map<string, string>([
  [
    sceneCheckKey('OOT', 1, 'collect', 24),
    'Dodongo Cavern Heart Miniboss Lava',
  ],
]);

class RawAutotrackerParserImpl implements RawAutotrackerParser {
  private lastKnownOot: OotState | null = null;
  private lastKnownMm: MmState | null = null;
  private lastKnownMmSaveIndex: number | null = null;
  private lastKnownShared: SharedCustomState | null = null;
  private lastStableActiveGame: RawAutotrackerGame | null = null;
  private lastStableOotLiveSignature: string | null = null;
  private lastStableMmLiveSignature: string | null = null;
  private pendingLiveTransitionGame: RawAutotrackerGame | null = null;
  private pendingLiveTransitionSignature: string | null = null;
  private pendingLiveTransitionTimestamp: number | null = null;
  private pendingLiveTransitionDiscardCount = 0;
  private hasEverSeenNonZeroMmRegions = false;

  parse(message: RawAutotrackerMessage): ParsedRawAutotrackerSnapshot | null {
    if (message.schemaVersion !== '1' || message.diff) {
      return null;
    }

    const activeGame = normalizeRawGame(message.game);
    if (!activeGame) {
      return null;
    }

    const memory = decodeRawFrameMemory(message.chunks);
    const state = this.parseGameState(
      memory,
      activeGame,
      message.saveIndex >>> 0,
    );
    if (!state) {
      return null;
    }

    this.rememberOotState(state.oot);
    this.rememberMmState(state.mm, state.saveIndex);
    this.rememberSharedState(state.shared);

    // Use the live (play-state) scene ID for auto-map-switching, as it
    // updates immediately on scene transitions. Fall back to the save-context
    // scene ID when no live sample is available yet (liveSceneId == 0).
    const ootSceneId =
      state.oot.liveSceneId !== 0 ? state.oot.liveSceneId : state.oot.sceneId;

    return {
      activeGame: state.activeGame,
      saveIndex: state.saveIndex >>> 0,
      ootSceneId: ootSceneId >>> 0,
      mmSceneId: state.mm.liveSceneId >>> 0,
      mmDay: state.mm.day >>> 0,
      mmPlayerForm: state.mm.playerForm >>> 0,
      items: extractItems(state),
      checks: extractChecks(state),
    };
  }

  reset(): void {
    this.lastKnownOot = null;
    this.lastKnownMm = null;
    this.lastKnownMmSaveIndex = null;
    this.lastKnownShared = null;
    this.lastStableActiveGame = null;
    this.lastStableOotLiveSignature = null;
    this.lastStableMmLiveSignature = null;
    this.pendingLiveTransitionGame = null;
    this.pendingLiveTransitionSignature = null;
    this.pendingLiveTransitionTimestamp = null;
    this.pendingLiveTransitionDiscardCount = 0;
    this.hasEverSeenNonZeroMmRegions = false;
  }

  private parseGameState(
    memory: RawFrameMemory,
    activeGame: RawAutotrackerGame,
    saveIndex: number,
  ): GameState | null {
    const state: GameState = {
      activeGame,
      saveIndex,
      oot: createEmptyOotState(),
      mm: createEmptyMmState(),
      shared: createEmptySharedState(),
    };

    if (activeGame === 'OoT') {
      const ootSaveData = buildChunkedData(
        memory,
        addrOotSaveCtx,
        OOT_SAVE_CTX_USED_SIZE,
        buildActiveOotSaveChunkSpecs(),
        OOT_SAVE_CTX_CHUNK,
      );
      if (!ootSaveData) {
        return null;
      }
      if (!isPlausibleOotSave(ootSaveData)) {
        return null;
      }
      parseOotSave(state.oot, ootSaveData);
      const ootLiveSignature = readOotPlayStateSignature(memory);
      const ootLiveSample = readOotPlayStateSample(memory);
      if (
        this.shouldDeferActiveGameFrame(
          'OoT',
          ootLiveSignature,
          ootLiveSample != null,
        )
      ) {
        return null;
      }
      if (ootLiveSample) {
        state.oot.liveSceneId = ootLiveSample.sceneId;
        state.oot.liveChestFlags = ootLiveSample.chestFlags;
        state.oot.liveCollectFlags = ootLiveSample.collectFlags;
        state.oot.liveTempCollectFlag = ootLiveSample.tempCollect;
        state.oot.hasLiveSceneFlags = true;
      }
      this.readForeignMmState(memory, state.mm);
      this.overlayLastKnownMm(saveIndex, state.mm);
      state.mm.extraFlags2 = state.oot.extraRecords[EXTRA_IDX_MM_FLAGS2] ?? 0;
      this.readSharedState(memory, activeGame, state);
      readOotRuntimeConfigFromMemory(memory, activeGame, state.oot);
      this.restoreLastKnownOotRuntimeState(activeGame, state);
    } else {
      const mmSaveData = buildChunkedData(
        memory,
        addrMmSaveCtx,
        MM_SAVE_CTX_USED_SIZE,
        buildActiveMmSaveChunkSpecs(),
        MM_SAVE_CTX_CHUNK,
      );
      if (!mmSaveData) {
        return null;
      }
      if (!isPlausibleMmSave(mmSaveData, this.hasEverSeenNonZeroMmRegions)) {
        return null;
      }
      if (!mmSaveRegionsAreAllZero(mmSaveData)) {
        this.hasEverSeenNonZeroMmRegions = true;
      }
      parseMmSave(state.mm, mmSaveData);
      const mmLiveSignature = readMmPlayStateSignature(memory);
      const mmLiveSample = readMmPlayStateSample(memory);
      if (
        this.shouldDeferActiveGameFrame(
          'MM',
          mmLiveSignature,
          mmLiveSample != null,
        )
      ) {
        return null;
      }
      if (mmLiveSample) {
        state.mm.liveSceneId = mmLiveSample.sceneId;
        state.mm.liveChestFlags = mmLiveSample.chestFlags;
        state.mm.liveSwitch0Flags = mmLiveSample.switch0Flags;
        state.mm.liveSwitch1Flags = mmLiveSample.switch1Flags;
        state.mm.liveCollectFlags = mmLiveSample.collectFlags;
        state.mm.hasLiveSceneFlags = true;
      }
      this.readForeignOotState(memory, state.oot);
      state.mm.extraFlags2 = state.oot.extraRecords[EXTRA_IDX_MM_FLAGS2] ?? 0;
      this.readSharedState(memory, activeGame, state);
      readOotRuntimeConfigFromMemory(memory, activeGame, state.oot);
      this.restoreLastKnownOotRuntimeState(activeGame, state);
    }

    return state;
  }

  private readForeignOotState(memory: RawFrameMemory, oot: OotState): void {
    const direct = buildChunkedData(
      memory,
      addrMmForeignOotSaveLive,
      OOT_SAVE_CTX_USED_SIZE,
      buildForeignOotSaveChunkSpecs(),
      MM_FOREIGN_OOT_SAVE_CHUNK,
    );
    if (direct && validateForeignOotSave(direct)) {
      parseOotSave(oot, direct);
      return;
    }

    const payload = memory.get('mm_payload');
    const data = payload
      ? sliceAbsoluteChunk(payload, addrMmForeignOotSaveLive, OOT_SAVE_SIZE)
      : null;
    if (data && validateForeignOotSave(data)) {
      parseOotSave(oot, data);
      return;
    }

    if (this.lastKnownOot) {
      copyOotState(oot, this.lastKnownOot);
      return;
    }

    resetEmptyOotState(oot);
  }

  private readForeignMmState(memory: RawFrameMemory, mm: MmState): void {
    const direct = buildChunkedData(
      memory,
      addrOotForeignMmSaveLive,
      MM_SAVE_CTX_USED_SIZE,
      buildForeignMmSaveChunkSpecs(),
      OOT_FOREIGN_MM_SAVE_CHUNK,
    );
    if (
      direct &&
      validateForeignMmSave(direct, this.hasEverSeenNonZeroMmRegions)
    ) {
      if (!mmSaveRegionsAreAllZero(direct)) {
        this.hasEverSeenNonZeroMmRegions = true;
      }
      parseMmSave(mm, direct);
      return;
    }

    const payload = memory.get('oot_payload');
    const data = payload
      ? sliceAbsoluteChunk(payload, addrOotForeignMmSaveLive, MM_SAVE_SIZE)
      : null;
    if (data && validateForeignMmSave(data, this.hasEverSeenNonZeroMmRegions)) {
      if (!mmSaveRegionsAreAllZero(data)) {
        this.hasEverSeenNonZeroMmRegions = true;
      }
      parseMmSave(mm, data);
      return;
    }

    if (this.lastKnownMm) {
      copyMmState(mm, this.lastKnownMm);
      return;
    }

    resetEmptyMmState(mm);
  }

  private readSharedState(
    memory: RawFrameMemory,
    activeGame: RawAutotrackerGame,
    state: GameState,
  ): void {
    const direct = buildChunkedData(
      memory,
      activeGame === 'OoT'
        ? addrOotSharedCustomSaveLive
        : addrMmSharedCustomSaveLive,
      sharedStateReadSize,
      activeGame === 'OoT'
        ? buildSharedStateChunkSpecs(
            'oot',
            addrOotSharedCustomSaveLive,
            inventorySlotFile.catalog.shared,
          )
        : buildSharedStateChunkSpecs(
            'mm',
            addrMmSharedCustomSaveLive,
            inventorySlotFile.catalog.shared,
          ),
      activeGame === 'OoT'
        ? OOT_SHARED_CUSTOM_SAVE_CHUNK
        : MM_SHARED_CUSTOM_SAVE_CHUNK,
    );
    if (direct) {
      const parsed = parseSharedState(direct);
      if (
        parsed &&
        !this.shouldReuseLastKnownSharedState(parsed, activeGame, state)
      ) {
        copySharedState(state.shared, parsed);
        return;
      }
    }

    const payload = memory.get(
      activeGame === 'OoT' ? 'oot_payload' : 'mm_payload',
    );
    const sharedAddress =
      activeGame === 'OoT'
        ? addrOotSharedCustomSaveLive
        : addrMmSharedCustomSaveLive;
    const data = payload
      ? sliceAbsoluteChunk(payload, sharedAddress, sharedStateReadSize)
      : null;
    if (data) {
      const parsed = parseSharedState(data);
      if (
        parsed &&
        !this.shouldReuseLastKnownSharedState(parsed, activeGame, state)
      ) {
        copySharedState(state.shared, parsed);
        return;
      }
    }

    if (this.lastKnownShared) {
      copySharedState(state.shared, this.lastKnownShared);
      return;
    }

    state.shared = createEmptySharedState();
  }

  private shouldReuseLastKnownSharedState(
    shared: SharedCustomState,
    activeGame: RawAutotrackerGame,
    state: GameState,
  ): boolean {
    if (
      !this.lastKnownShared ||
      !sharedStateHasMeaningfulData(this.lastKnownShared)
    ) {
      return false;
    }

    if (sharedStateHasMeaningfulData(shared)) {
      // The current shared state has data, but during OoT/MM handoff it can
      // be partially degraded: MM bitmaps go to zero while OoT bitmaps stay.
      // If the core game state is unchanged, prefer the last known shared
      // state over a degraded one so items (souls, coins, buttons, clocks)
      // don't momentarily disappear.
      if (
        this.activeGameCoreStateMatchesLastKnown(activeGame, state) &&
        sharedStateDegradedFrom(shared, this.lastKnownShared)
      ) {
        return true;
      }
      return false;
    }

    // During the OoT/MM handoff the shared custom save can transiently read as
    // all-zero while the active game's core save data remains unchanged.
    return this.activeGameCoreStateMatchesLastKnown(activeGame, state);
  }

  private activeGameCoreStateMatchesLastKnown(
    activeGame: RawAutotrackerGame,
    state: GameState,
  ): boolean {
    if (activeGame === 'OoT') {
      return (
        this.lastKnownOot != null &&
        ootCoreProgressMatches(state.oot, this.lastKnownOot)
      );
    }

    return (
      this.lastKnownMm != null &&
      mmCoreProgressMatches(state.mm, this.lastKnownMm)
    );
  }

  private restoreLastKnownOotRuntimeState(
    activeGame: RawAutotrackerGame,
    state: GameState,
  ): void {
    if (
      !this.lastKnownOot ||
      !ootRuntimeStateHasMeaningfulData(this.lastKnownOot)
    ) {
      return;
    }

    if (!ootRuntimeStateLooksTransitionEmpty(state.oot)) {
      return;
    }

    if (!this.activeGameCoreStateMatchesLastKnown(activeGame, state)) {
      return;
    }

    copyOotRuntimeState(state.oot, this.lastKnownOot);
  }

  private overlayLastKnownMm(saveIndex: number, mm: MmState): void {
    if (!this.lastKnownMm || this.lastKnownMmSaveIndex !== saveIndex) {
      return;
    }

    for (let index = 0; index < mm.cycleFlags.length; index++) {
      const current = mm.cycleFlags[index];
      const previous = this.lastKnownMm.cycleFlags[index];
      current.chests |= previous.chests;
      current.switch0 |= previous.switch0;
      current.switch1 |= previous.switch1;
      current.clearedRoom |= previous.clearedRoom;
      current.collectibles |= previous.collectibles;
    }
    mm.townStrayFairy = mm.townStrayFairy || this.lastKnownMm.townStrayFairy;
    mm.extraFlags2 |= this.lastKnownMm.extraFlags2;
  }

  private shouldDeferActiveGameFrame(
    activeGame: RawAutotrackerGame,
    signature: LivePlayStateSignature | null,
    canAccept: boolean,
  ): boolean {
    if (!signature) {
      return false;
    }

    const signatureKey = livePlayStateSignatureKey(signature);

    // Timeout-based acceptance: if a transition has been pending for 1 s
    // without new data, the autotracker is idle → state is stable.
    if (
      this.pendingLiveTransitionGame === activeGame &&
      this.pendingLiveTransitionSignature === signatureKey &&
      this.pendingLiveTransitionTimestamp !== null
    ) {
      const elapsed = Date.now() - this.pendingLiveTransitionTimestamp;
      if (elapsed >= 1000) {
        this.pendingLiveTransitionDiscardCount = 0;
        this.markStableActiveGameFrame(activeGame, signatureKey);
        return false;
      }
    }

    if (!canAccept) {
      // Don't let an invalid playstate sample overwrite an existing
      // pending transition for the same game.  The pending state retains
      // the last valid signature, its discard count, and its timestamp,
      // so the next valid frame can make progress through the gate or
      // eventually be accepted via timeout.
      if (this.pendingLiveTransitionGame === activeGame) {
        return true;
      }

      this.pendingLiveTransitionGame = activeGame;
      this.pendingLiveTransitionSignature = signatureKey;
      // Don't record a timestamp for implausible samples – we never want
      // to accept nonsense data via timeout.
      this.pendingLiveTransitionTimestamp = null;
      return true;
    }

    const stableSignature =
      activeGame === 'OoT'
        ? this.lastStableOotLiveSignature
        : this.lastStableMmLiveSignature;

    if (this.lastStableActiveGame === null) {
      this.markStableActiveGameFrame(activeGame, signatureKey);
      return false;
    }

    if (
      this.lastStableActiveGame === activeGame &&
      stableSignature === signatureKey
    ) {
      this.pendingLiveTransitionGame = null;
      this.pendingLiveTransitionSignature = null;
      this.pendingLiveTransitionTimestamp = null;
      this.pendingLiveTransitionDiscardCount = 0;
      return false;
    }

    // If only the room changed (scene is the same), accept immediately.
    // Room transitions within a scene are legitimate player movement,
    // and implausible room values are already rejected by canAccept=false.
    if (this.lastStableActiveGame === activeGame && stableSignature !== null) {
      const stableSceneId = Number(stableSignature.split(':')[0]);
      if (stableSceneId === signature.sceneId) {
        this.markStableActiveGameFrame(activeGame, signatureKey);
        return false;
      }
    }

    if (
      this.pendingLiveTransitionGame === activeGame &&
      this.pendingLiveTransitionSignature === signatureKey
    ) {
      if (this.pendingLiveTransitionDiscardCount > 0) {
        this.pendingLiveTransitionDiscardCount--;
        return true;
      }
      this.markStableActiveGameFrame(activeGame, signatureKey);
      return false;
    }

    this.pendingLiveTransitionGame = activeGame;
    this.pendingLiveTransitionSignature = signatureKey;
    this.pendingLiveTransitionTimestamp = Date.now();
    this.pendingLiveTransitionDiscardCount = 1;
    return true;
  }

  private markStableActiveGameFrame(
    activeGame: RawAutotrackerGame,
    signatureKey: string,
  ): void {
    this.lastStableActiveGame = activeGame;
    if (activeGame === 'OoT') {
      this.lastStableOotLiveSignature = signatureKey;
    } else {
      this.lastStableMmLiveSignature = signatureKey;
    }
    this.pendingLiveTransitionGame = null;
    this.pendingLiveTransitionSignature = null;
    this.pendingLiveTransitionTimestamp = null;
    this.pendingLiveTransitionDiscardCount = 0;
  }

  private rememberOotState(oot: OotState): void {
    this.lastKnownOot = cloneOotState(oot);
    this.lastKnownOot.liveSceneId = 0;
    this.lastKnownOot.liveChestFlags = 0;
    this.lastKnownOot.liveCollectFlags = 0;
    this.lastKnownOot.liveTempCollectFlag = 0;
    this.lastKnownOot.hasLiveSceneFlags = false;
  }

  private rememberMmState(mm: MmState, saveIndex: number): void {
    this.lastKnownMm = cloneMmState(mm);
    this.lastKnownMm.liveSceneId = 0;
    this.lastKnownMm.liveChestFlags = 0;
    this.lastKnownMm.liveSwitch0Flags = 0;
    this.lastKnownMm.liveSwitch1Flags = 0;
    this.lastKnownMm.liveCollectFlags = 0;
    this.lastKnownMm.hasLiveSceneFlags = false;
    this.lastKnownMmSaveIndex = saveIndex;
  }

  private rememberSharedState(shared: SharedCustomState): void {
    this.lastKnownShared = cloneSharedState(shared);
  }
}

export interface CreateRawAutotrackerParserOptions {
  /**
   * OoTMM spoiler-log version string (e.g. "v30.1" or "30.1").
   * When provided, the parser validates that autotracker data exists
   * for this version.  If omitted, the default data version is used.
   */
  ootmmVersion?: string | null;
}

export async function createRawAutotrackerParser(
  options?: CreateRawAutotrackerParserOptions,
): Promise<RawAutotrackerParser> {
  if (options?.ootmmVersion) {
    if (!hasAutotrackerDataForVersion(options.ootmmVersion)) {
      throw new Error(
        `No autotracker data available for spoiler-log version "${options.ootmmVersion}". ` +
          `Supported versions: ${getSupportedVersionLabels()}.`,
      );
    }

    const { dirName } = resolveAutotrackerDataVersion(options.ootmmVersion);
    const bundle = await loadAutotrackerData(dirName);
    applyVersionData(buildParserTables(bundle));
  }

  return new RawAutotrackerParserImpl();
}

/**
 * Synchronous test-only factory.  Accepts a pre-built data bundle directly
 * instead of loading from disk.
 */
export function createRawAutotrackerParserForTest(
  bundle: AutotrackerDataBundle,
): RawAutotrackerParser {
  applyVersionData(buildParserTables(bundle));
  return new RawAutotrackerParserImpl();
}

/**
 * Synchronous factory that loads data for a specific version directory
 * (e.g. `'v30_1'`, `'v31_0'`, `'v31_1'`) and returns a parser.
 * Uses the eager registry so no async imports are needed.
 */
export function createRawAutotrackerParserSync(
  dirName = 'v31_0',
): RawAutotrackerParser {
  const bundle = loadAutotrackerDataSync(dirName);
  applyVersionData(buildParserTables(bundle));
  return new RawAutotrackerParserImpl();
}

function normalizeRawGame(game: string): RawAutotrackerGame | null {
  const normalized = game.trim().toLowerCase();
  if (normalized === 'oot') return 'OoT';
  if (normalized === 'mm') return 'MM';
  return null;
}

function decodeRawFrameMemory(chunks: RawAutotrackerChunk[]): RawFrameMemory {
  const memory = new Map<string, DecodedRawChunk>();
  for (const chunk of chunks) {
    const data = decodeChunkData(chunk.data);
    memory.set(chunk.name, {
      name: chunk.name,
      address: chunk.address >>> 0,
      length: chunk.length,
      data,
    });
  }
  return memory;
}

function decodeChunkData(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (typeof atob === 'function') {
    const decoded = atob(data);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(data, 'base64'));
  }

  throw new Error('No base64 decoder available');
}

function buildInventorySlotTable(
  entries: InventorySlotEntry[],
): InventorySlotEntry[] {
  let maxIndex = -1;
  for (const entry of entries) {
    maxIndex = Math.max(maxIndex, entry.index);
  }
  const table: InventorySlotEntry[] = Array.from(
    { length: maxIndex + 1 },
    (): InventorySlotEntry => ({
      index: -1,
      slot: '',
      itemId: '',
    }),
  );
  for (const entry of entries) {
    table[entry.index] = entry;
  }
  return table;
}

function buildSharedBitmapTable(
  layout: SharedStorageLayout,
): Map<string, SharedBitmapInfo> {
  const bitmaps = new Map<string, SharedBitmapInfo>();
  for (const bitmap of layout.bitmaps) {
    bitmaps.set(bitmap.name, bitmap);
  }
  return bitmaps;
}

function buildCatalogTables(
  items: CatalogItemEntry[],
  bitmaps: Map<string, SharedBitmapInfo>,
): {
  trackedCatalogItems: CatalogItemEntry[];
  catalogItemSources: Map<string, CatalogItemSource>;
  sharedBitmapUsedBits: Map<string, number>;
} {
  const trackedCatalogItems: CatalogItemEntry[] = [];
  const catalogItemSources = new Map<string, CatalogItemSource>();
  const sharedBitmapUsedBits = new Map<string, number>();

  for (const item of items) {
    catalogItemSources.set(item.itemId, item.source);
    switch (item.source.kind) {
      case 'shared-bitmap-bit': {
        const bitmap = bitmaps.get(item.source.block ?? '');
        if (bitmap) {
          sharedBitmapUsedBits.set(
            bitmap.name,
            Math.max(
              sharedBitmapUsedBits.get(bitmap.name) ?? 0,
              (item.source.bit ?? 0) + 1,
            ),
          );
        }
        break;
      }
      default:
        break;
    }

    if (shouldTrackCatalogItem(item.itemId, item.source)) {
      trackedCatalogItems.push(item);
    }
  }

  return {
    trackedCatalogItems,
    catalogItemSources,
    sharedBitmapUsedBits,
  };
}

function shouldTrackCatalogItem(
  itemId: string,
  source: CatalogItemSource,
): boolean {
  if (itemId === 'OOT_SCALE_BRONZE' || itemId === 'MM_SCALE_BRONZE') {
    return false;
  }

  switch (source.kind) {
    case 'oot-derived-key-ring':
    case 'mm-derived-key-ring':
    case 'oot-derived-skeleton-key':
    case 'oot-derived-platinum-token':
    case 'mm-derived-platinum-token':
    case 'oot-derived-magical-rupee':
    case 'mm-derived-skeleton-key':
    case 'mm-derived-transcendent-fairy':
      return false;
    default:
      return true;
  }
}

function markSharedCheckBitmapsUsed(
  usedBits: Map<string, number>,
  bitmaps: Map<string, SharedBitmapInfo>,
): void {
  for (const name of SHARED_CHECK_BITMAP_NAMES) {
    const bitmap = bitmaps.get(name);
    if (!bitmap) {
      continue;
    }
    usedBits.set(name, bitmap.size * 8);
  }
}

function buildLocationTables(locationFile: LocationFile): {
  checkNameTable: Map<string, string>;
  ootSceneConflictTable: Map<string, SceneConflictEntry>;
  fishCheckTables: Map<string, Map<number, string>>;
  npcCheckTables: Map<string, Map<number, string>>;
  gsCheckTables: Map<string, Map<number, string>>;
  xflagCheckTables: Map<string, Map<number, string>>;
  ootBitmapConflictTable: Map<string, Map<number, BitmapConflictEntry>>;
  shopCheckTables: Map<string, Map<number, string>>;
  scrubCheckTables: Map<string, Map<number, string>>;
  silverRupeeCheckTables: Map<string, Map<number, string>>;
  npcSymbolTables: Map<string, Map<string, string>>;
} {
  const checkNameTable = new Map<string, string>();
  const ootSceneConflictTable = new Map<string, SceneConflictEntry>();
  const fishCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
  ]);
  const npcCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);
  const gsCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
  ]);
  const xflagCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);
  const ootBitmapConflictTable = new Map<
    string,
    Map<number, BitmapConflictEntry>
  >([
    ['gsOot', new Map()],
    ['xflagsOot', new Map()],
    ['srOot', new Map()],
  ]);
  const shopCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);
  const scrubCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);
  const silverRupeeCheckTables = new Map<string, Map<number, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);
  const npcSymbolTables = new Map<string, Map<string, string>>([
    ['OOT', new Map()],
    ['MM', new Map()],
  ]);

  for (const entry of locationFile.scene) {
    checkNameTable.set(entry.key, entry.name);
  }

  for (const entry of locationFile.scene_conflicts) {
    ootSceneConflictTable.set(entry.key, entry);
  }

  for (const entry of locationFile.bitmap) {
    const table = tableForBitmapBlock(
      entry.block,
      fishCheckTables,
      npcCheckTables,
      gsCheckTables,
      xflagCheckTables,
      shopCheckTables,
      scrubCheckTables,
      silverRupeeCheckTables,
    );
    table.set(entry.bit, entry.name);
  }

  for (const entry of locationFile.bitmap_conflicts) {
    ootBitmapConflictTable.get(entry.block)?.set(entry.bit, entry);
  }

  for (const entry of locationFile.symbols) {
    if (entry.game === 'MM') {
      continue;
    }
    npcSymbolTables.get(entry.game)?.set(entry.symbol, entry.name);
  }

  return {
    checkNameTable,
    ootSceneConflictTable,
    fishCheckTables,
    npcCheckTables,
    gsCheckTables,
    xflagCheckTables,
    ootBitmapConflictTable,
    shopCheckTables,
    scrubCheckTables,
    silverRupeeCheckTables,
    npcSymbolTables,
  };
}

function tableForBitmapBlock(
  block: string,
  fishTables: Map<string, Map<number, string>>,
  npcTables: Map<string, Map<number, string>>,
  gsTables: Map<string, Map<number, string>>,
  xflagTables: Map<string, Map<number, string>>,
  shopTables: Map<string, Map<number, string>>,
  scrubTables: Map<string, Map<number, string>>,
  silverTables: Map<string, Map<number, string>>,
): Map<number, string> {
  switch (block) {
    case 'caughtFishFlags':
      return fishTables.get('OOT')!;
    case 'npcOot':
      return npcTables.get('OOT')!;
    case 'npcMm':
      return npcTables.get('MM')!;
    case 'gsOot':
      return gsTables.get('OOT')!;
    case 'xflagsOot':
      return xflagTables.get('OOT')!;
    case 'xflagsMm':
      return xflagTables.get('MM')!;
    case 'shopsOot':
      return shopTables.get('OOT')!;
    case 'shopsMm':
      return shopTables.get('MM')!;
    case 'scrubsOot':
      return scrubTables.get('OOT')!;
    case 'srOot':
      return silverTables.get('OOT')!;
    default:
      return new Map();
  }
}

function buildMmSymbolChecks(
  entries: MmSpecialLocationEntry[],
): MmSymbolCheck[] {
  const result: MmSymbolCheck[] = [];
  for (const entry of entries) {
    if (!entry.name) {
      continue;
    }
    const symbol = entry.symbol?.replace(/^MM_/, '') ?? '';
    for (const source of entry.sources ?? []) {
      const sourceInfo = getMmSourceInfo(source.group);
      if (!sourceInfo) {
        continue;
      }

      const check: MmSymbolCheck = {
        source: sourceInfo.source,
        symbol,
        name: entry.name,
        keyPrefix: sourceInfo.keyPrefix,
        bit: 0,
        byteIndex: 0,
        mask: 0,
      };

      switch (sourceInfo.source) {
        case 'extra-boss': {
          const parsed = parseExtraBossSource(source.mask ?? '');
          if (!parsed) {
            continue;
          }
          check.bit = parsed.bit;
          check.mask = parsed.mask;
          break;
        }
        case 'week-event': {
          const parsed = parseWeekEventSource(entry, source);
          if (!parsed) {
            continue;
          }
          check.byteIndex = parsed.byteIndex;
          check.mask = parsed.mask;
          break;
        }
        default: {
          if (!entry.bits || entry.bits.length === 0) {
            continue;
          }
          check.bit = entry.bits[0];
          break;
        }
      }

      result.push(check);
    }
  }
  return result;
}

function getMmSourceInfo(
  group: string,
): { source: MmSymbolCheckSource; keyPrefix: string } | null {
  switch (group) {
    case 'gMmExtraFlags':
      return { source: 'extra-flags', keyPrefix: 'MM_extra_6_' };
    case 'gMmExtraFlags2':
      return { source: 'extra-flags-2', keyPrefix: 'MM_extra_' };
    case 'gMmExtraFlags3':
      return { source: 'extra-flags-3', keyPrefix: 'MM_extra_13_' };
    case 'gMmExtraBoss':
      return { source: 'extra-boss', keyPrefix: 'MM_boss_remains_dungeon_' };
    case 'weekEventReg':
      return { source: 'week-event', keyPrefix: 'MM_week_event_' };
    case 'gMmOwlFlags':
      return { source: 'owl-activation', keyPrefix: 'MM_owl_activation_' };
    default:
      return null;
  }
}

function parseExtraBossSource(
  maskText: string,
): { bit: number; mask: number } | null {
  const mask = Number.parseInt(maskText, 0);
  if (!Number.isInteger(mask) || mask <= 0 || (mask & (mask - 1)) !== 0) {
    return null;
  }
  return {
    bit: trailingZeros(mask) + MM_EXTRA_BOSS_LEGACY_DUNGEON_INDEX_BASE,
    mask,
  };
}

function parseWeekEventSource(
  entry: MmSpecialLocationEntry,
  source: MmSpecialLocationSourceEntry,
): { byteIndex: number; mask: number } | null {
  let byteIndex = entry.byteIndex ?? -1;
  let mask = entry.mask ?? 0;

  const field = source.field ?? '';
  const start = field.lastIndexOf('[');
  const end = field.lastIndexOf(']');
  if (start >= 0 && end > start) {
    const parsedByteIndex = Number.parseInt(field.slice(start + 1, end), 10);
    if (Number.isInteger(parsedByteIndex)) {
      byteIndex = parsedByteIndex;
    }
  }
  if (source.mask) {
    const parsedMask = Number.parseInt(source.mask, 0);
    if (Number.isInteger(parsedMask)) {
      mask = parsedMask;
    }
  }

  if (byteIndex < 0 || mask === 0) {
    return null;
  }

  return { byteIndex, mask };
}

function buildOotSymbolChecks(
  entries: OotSpecialLocationEntry[],
): OotSymbolCheck[] {
  const result: OotSymbolCheck[] = [];
  for (const entry of entries) {
    if (!entry.symbol) {
      continue;
    }
    for (const source of entry.sources ?? []) {
      const sourceInfo = getOotSourceInfo(source.group, source.field ?? '');
      if (!sourceInfo) {
        continue;
      }

      result.push({
        source: sourceInfo.source,
        symbol: entry.symbol,
        keyPrefix: sourceInfo.keyPrefix,
        flags: source.flag == null ? [] : [source.flag],
        mask:
          source.mask != null && source.mask !== ''
            ? Number.parseInt(source.mask, 0)
            : 0,
        bit: source.bit ?? 0,
      });
    }
  }
  return result;
}

function getOotSourceInfo(
  group: string,
  field: string,
): { source: OotSymbolCheckSource; keyPrefix: string } | null {
  switch (group) {
    case 'gOotExtraFlags':
      return { source: 'extra-flags', keyPrefix: 'OOT_extra_2_' };
    case 'inventoryQuest':
      return { source: 'quest', keyPrefix: 'OOT_quest_' };
    case 'gOotTradeSave':
      return field.includes('child')
        ? { source: 'child-trade', keyPrefix: 'OOT_child_trade_' }
        : { source: 'trade', keyPrefix: 'OOT_trade_' };
    case 'eventsChk':
      return { source: 'event', keyPrefix: 'OOT_event_' };
    case 'eventsItem':
      return { source: 'event-item', keyPrefix: 'OOT_event_item_' };
    case 'eventsMisc':
      return { source: 'event-misc', keyPrefix: 'OOT_event_misc_' };
    default:
      return null;
  }
}

function readOotPlayStateSample(memory: RawFrameMemory): {
  sceneId: number;
  currentRoom: number;
  linkAgeOnLoad: number;
  chestFlags: number;
  collectFlags: number;
  tempCollect: number;
} | null {
  const directScene = memory.get(OOT_PLAYSTATE_SCENE_CHUNK);
  const directRoom = memory.get(OOT_PLAYSTATE_ROOM_CHUNK);
  const directLinkAge = memory.get(OOT_PLAYSTATE_LINK_AGE_CHUNK);
  const directFlags = memory.get(OOT_PLAYSTATE_FLAGS_CHUNK);
  if (directScene && directRoom && directLinkAge && directFlags) {
    const sample = {
      sceneId: readU16BE(directScene.data, 0),
      currentRoom: readU8(directRoom.data, 0),
      linkAgeOnLoad: readU8(directLinkAge.data, 0),
      chestFlags: readU32BE(directFlags.data, 0),
      collectFlags: readU32BE(
        directFlags.data,
        OOT_PLAY_OFF_COLLECT_FLAGS - OOT_PLAY_OFF_CHEST_FLAGS,
      ),
      tempCollect: readU32BE(
        directFlags.data,
        OOT_PLAY_OFF_TEMP_COLLECT - OOT_PLAY_OFF_CHEST_FLAGS,
      ),
    };
    if (isPlausibleOotPlayStateSample(sample)) {
      return sample;
    }
  }

  return null;
}

function readOotPlayStateSignature(
  memory: RawFrameMemory,
): LivePlayStateSignature | null {
  const directScene = memory.get(OOT_PLAYSTATE_SCENE_CHUNK);
  const directRoom = memory.get(OOT_PLAYSTATE_ROOM_CHUNK);
  if (!directScene || !directRoom) {
    return null;
  }

  return {
    sceneId: readU16BE(directScene.data, 0),
    currentRoom: readU8(directRoom.data, 0),
  };
}

function isPlausibleOotPlayStateSample(sample: {
  sceneId: number;
  currentRoom: number;
  linkAgeOnLoad: number;
}): boolean {
  return (
    sample.sceneId < OOT_PERM_COUNT &&
    sample.currentRoom < 0x40 &&
    sample.linkAgeOnLoad <= 1
  );
}

function readMmPlayStateSample(memory: RawFrameMemory): {
  sceneId: number;
  currentRoom: number;
  switch0Flags: number;
  switch1Flags: number;
  chestFlags: number;
  collectFlags: number;
} | null {
  const directScene = memory.get(MM_PLAYSTATE_SCENE_CHUNK);
  const directRoom = memory.get(MM_PLAYSTATE_ROOM_CHUNK);
  const directFlags = memory.get(MM_PLAYSTATE_FLAGS_CHUNK);
  if (directScene && directRoom && directFlags) {
    const sample = {
      sceneId: readU16BE(directScene.data, 0),
      currentRoom: readU8(directRoom.data, 0),
      switch0Flags: readU32BE(directFlags.data, 0),
      switch1Flags: readU32BE(
        directFlags.data,
        MM_PLAY_OFF_SWITCH1_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
      ),
      chestFlags: readU32BE(
        directFlags.data,
        MM_PLAY_OFF_CHEST_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
      ),
      collectFlags: readU32BE(
        directFlags.data,
        MM_PLAY_OFF_COLLECT_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
      ),
    };
    if (isPlausibleMmPlayStateSample(sample)) {
      return sample;
    }
  }

  return null;
}

function readMmPlayStateSignature(
  memory: RawFrameMemory,
): LivePlayStateSignature | null {
  const directScene = memory.get(MM_PLAYSTATE_SCENE_CHUNK);
  const directRoom = memory.get(MM_PLAYSTATE_ROOM_CHUNK);
  if (!directScene || !directRoom) {
    return null;
  }

  return {
    sceneId: readU16BE(directScene.data, 0),
    currentRoom: readU8(directRoom.data, 0),
  };
}

function isPlausibleMmPlayStateSample(sample: {
  sceneId: number;
  currentRoom: number;
}): boolean {
  return sample.sceneId < MM_PERM_COUNT && sample.currentRoom < 0x40;
}

function livePlayStateSignatureKey(signature: LivePlayStateSignature): string {
  return `${signature.sceneId}:${signature.currentRoom}`;
}

function readOotRuntimeConfig(
  payload: Uint8Array,
  includeRuntimeCounts: boolean,
  oot: OotState,
): void {
  oot.runtimeMqBits = 0;
  oot.hasRuntimeMqBits = false;
  oot.bronzeScaleEnabled = false;
  const comboConfigOffset = locateOotComboConfig(payload);
  if (comboConfigOffset >= 0) {
    const comboConfig = payload.subarray(
      comboConfigOffset,
      comboConfigOffset + OOT_COMBO_CONFIG_SIZE,
    );
    oot.runtimeMqBits = readU32BE(comboConfig, OOT_COMBO_CONFIG_MQ_OFFSET);
    oot.hasRuntimeMqBits = true;
    oot.bronzeScaleEnabled = ootComboConfigFlagEnabled(
      comboConfig.subarray(
        OOT_COMBO_CONFIG_FLAGS_OFFSET,
        OOT_COMBO_CONFIG_FLAGS_OFFSET + OOT_COMBO_CONFIG_FLAGS_COUNT,
      ),
      OOT_COMBO_CONFIG_FLAG_BRONZE_SCALE,
    );
  }

  oot.runtimeMaxKeys.fill(0);
  oot.hasRuntimeMaxKeys = false;
  oot.runtimeSilverRupeeCounts.fill(0);
  oot.hasRuntimeSilverRupeeCounts = false;
  if (!includeRuntimeCounts) {
    return;
  }

  const silverOffset = locateSilverRupeeData(payload);
  if (silverOffset >= 0) {
    for (let index = 0; index < OOT_SILVER_RUPEE_SET_COUNT; index++) {
      oot.runtimeSilverRupeeCounts[index] =
        payload[silverOffset + index * 4 + 3] ?? 0;
    }
    oot.hasRuntimeSilverRupeeCounts = true;
  }

  const maxKeysOffset = locateOotMaxKeys(payload);
  if (maxKeysOffset >= 0) {
    for (let index = 0; index < OOT_RUNTIME_SCENE_COUNT; index++) {
      oot.runtimeMaxKeys[index] = payload[maxKeysOffset + index] ?? 0;
    }
    oot.hasRuntimeMaxKeys = true;
  }
}

function readOotRuntimeConfigFromMemory(
  memory: RawFrameMemory,
  activeGame: RawAutotrackerGame,
  oot: OotState,
): void {
  oot.runtimeMqBits = 0;
  oot.hasRuntimeMqBits = false;
  oot.bronzeScaleEnabled = false;

  const comboChunk = memory.get(
    activeGame === 'OoT'
      ? OOT_RUNTIME_COMBO_CONFIG_CHUNK
      : MM_RUNTIME_COMBO_CONFIG_CHUNK,
  );
  if (comboChunk && validateOotComboConfig(comboChunk.data)) {
    oot.runtimeMqBits = readU32BE(comboChunk.data, OOT_COMBO_CONFIG_MQ_OFFSET);
    oot.hasRuntimeMqBits = true;
    oot.bronzeScaleEnabled = ootComboConfigFlagEnabled(
      comboChunk.data.subarray(
        OOT_COMBO_CONFIG_FLAGS_OFFSET,
        OOT_COMBO_CONFIG_FLAGS_OFFSET + OOT_COMBO_CONFIG_FLAGS_COUNT,
      ),
      OOT_COMBO_CONFIG_FLAG_BRONZE_SCALE,
    );
  } else {
    const payload = memory.get(
      activeGame === 'OoT' ? 'oot_payload' : 'mm_payload',
    );
    if (payload) {
      readOotRuntimeConfig(payload.data, activeGame === 'OoT', oot);
      return;
    }
  }

  oot.runtimeMaxKeys.fill(0);
  oot.hasRuntimeMaxKeys = false;
  oot.runtimeSilverRupeeCounts.fill(0);
  oot.hasRuntimeSilverRupeeCounts = false;
  if (activeGame !== 'OoT') {
    return;
  }

  const silverChunk = memory.get(OOT_RUNTIME_SILVER_RUPEE_DATA_CHUNK);
  if (silverChunk && validateSilverRupeeData(silverChunk.data)) {
    for (let index = 0; index < OOT_SILVER_RUPEE_SET_COUNT; index++) {
      oot.runtimeSilverRupeeCounts[index] =
        silverChunk.data[index * 4 + 3] ?? 0;
    }
    oot.hasRuntimeSilverRupeeCounts = true;
  }

  const maxKeysChunk = memory.get(OOT_RUNTIME_MAX_KEYS_CHUNK);
  if (maxKeysChunk && validateOotMaxKeyBlock(maxKeysChunk.data)) {
    for (let index = 0; index < OOT_RUNTIME_SCENE_COUNT; index++) {
      oot.runtimeMaxKeys[index] = maxKeysChunk.data[index] ?? 0;
    }
    oot.hasRuntimeMaxKeys = true;
  }
}

function locateSilverRupeeData(payload: Uint8Array): number {
  for (
    let offset = 0;
    offset + OOT_SILVER_RUPEE_DATA_SIZE <= payload.length;
    offset++
  ) {
    if (
      validateSilverRupeeData(
        payload.subarray(offset, offset + OOT_SILVER_RUPEE_DATA_SIZE),
      )
    ) {
      return offset;
    }
  }
  return -1;
}

function validateSilverRupeeData(data: Uint8Array): boolean {
  if (data.length < OOT_SILVER_RUPEE_DATA_SIZE) {
    return false;
  }
  for (let index = 0; index < OOT_SILVER_RUPEE_SET_COUNT; index++) {
    const flag = data[index * 4 + 2] ?? 0;
    const count = data[index * 4 + 3] ?? 0;
    const allowed = OOT_SILVER_RUPEE_ALLOWED[index];
    const valid = allowed.some(
      (entry) => entry.flag === flag && entry.count === count,
    );
    if (!valid) {
      return false;
    }
  }

  return (
    sameSilverScene(data, 2, 3) &&
    sameSilverScene(data, 3, 4) &&
    sameSilverScene(data, 5, 6) &&
    sameSilverScene(data, 6, 7) &&
    sameSilverScene(data, 7, 8) &&
    sameSilverScene(data, 9, 10) &&
    sameSilverScene(data, 11, 12) &&
    sameSilverScene(data, 12, 13) &&
    sameSilverScene(data, 14, 15) &&
    sameSilverScene(data, 15, 16) &&
    sameSilverScene(data, 16, 17)
  );
}

function sameSilverScene(
  data: Uint8Array,
  left: number,
  right: number,
): boolean {
  const leftOffset = left * 4;
  const rightOffset = right * 4;
  return (
    data[leftOffset] === data[rightOffset] &&
    data[leftOffset + 1] === data[rightOffset + 1]
  );
}

function locateOotMaxKeys(payload: Uint8Array): number {
  let bestOffset = -1;
  let bestScore = -1;
  for (
    let offset = 0;
    offset + OOT_MAX_KEYS_BLOCK_SIZE <= payload.length;
    offset++
  ) {
    const block = payload.subarray(offset, offset + OOT_MAX_KEYS_BLOCK_SIZE);
    if (!validateOotMaxKeyBlock(block)) {
      continue;
    }
    const score = maxKeyBlockScore(payload, offset);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

function maxKeyBlockScore(payload: Uint8Array, offset: number): number {
  const end = offset + OOT_MAX_KEYS_BLOCK_SIZE;
  let score = 0;
  for (let index = offset; index < end; index++) {
    score += payload[index] ?? 0;
  }
  for (let index = offset - 8; index < offset; index++) {
    if (index >= 0 && payload[index] !== 0) {
      score++;
    }
  }
  for (let index = end; index < end + 12 && index < payload.length; index++) {
    if (payload[index] !== 0) {
      score++;
    }
  }
  return score;
}

function validateOotMaxKeyBlock(data: Uint8Array): boolean {
  if (data.length < OOT_MAX_KEYS_BLOCK_SIZE) {
    return false;
  }
  for (let sceneId = 0; sceneId < OOT_RUNTIME_SCENE_COUNT; sceneId++) {
    if (!ootMaxKeyValueAllowed(sceneId, data[sceneId] ?? 0)) {
      return false;
    }
  }
  return (
    mmMaxKeyValueAllowed(0, data[17] ?? 0) &&
    mmMaxKeyValueAllowed(1, data[18] ?? 0) &&
    mmMaxKeyValueAllowed(2, data[19] ?? 0) &&
    mmMaxKeyValueAllowed(3, data[20] ?? 0)
  );
}

function locateOotComboConfig(payload: Uint8Array): number {
  let bestOffset = -1;
  let bestScore = -1;
  for (
    let offset = 0;
    offset + OOT_COMBO_CONFIG_SIZE <= payload.length;
    offset += 4
  ) {
    const block = payload.subarray(offset, offset + OOT_COMBO_CONFIG_SIZE);
    if (!validateOotComboConfig(block)) {
      continue;
    }
    const score = ootComboConfigScore(block);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

function validateOotComboConfig(data: Uint8Array): boolean {
  if (data.length < OOT_COMBO_CONFIG_SIZE) {
    return false;
  }
  if (data[0] === 0 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0) {
    return false;
  }

  const mqBits = readU32BE(data, OOT_COMBO_CONFIG_MQ_OFFSET);
  if ((mqBits & ~((1 << OOT_MQ_DUNGEON_COUNT) - 1)) !== 0) {
    return false;
  }

  const triforcePieces = readU16BE(
    data,
    OOT_COMBO_CONFIG_TRIFORCE_PIECES_OFFSET,
  );
  const triforceGoal = readU16BE(data, OOT_COMBO_CONFIG_TRIFORCE_GOAL_OFFSET);
  if (triforcePieces !== 0 && triforceGoal > triforcePieces) {
    return false;
  }

  for (let index = 0; index < OOT_COMBO_CONFIG_SPECIAL_COUNT; index++) {
    const offset =
      OOT_COMBO_CONFIG_SPECIAL_OFFSET + index * OOT_COMBO_CONFIG_SPECIAL_SIZE;
    const flags = readU32BE(data, offset);
    const count = readU16BE(data, offset + 4);
    const zero = readU16BE(data, offset + 6);
    if (zero !== 0 || flags >>> 19 !== 0 || count > 0x400) {
      return false;
    }
  }

  for (let index = 0; index < OOT_COMBO_CONFIG_PRICE_COUNT; index++) {
    const price = readU16BE(data, OOT_COMBO_CONFIG_PRICES_OFFSET + index * 2);
    if (price > OOT_COMBO_CONFIG_PRICE_MAX || price % 5 !== 0) {
      return false;
    }
  }

  for (let index = 0; index < OOT_COMBO_CONFIG_STATIC_HINT_COUNT; index++) {
    const value = toSignedByte(
      data[OOT_COMBO_CONFIG_STATIC_HINTS_OFFSET + index] ?? 0,
    );
    if (value < -1 || value > 3) {
      return false;
    }
  }

  const seenBosses = new Set<number>();
  for (let index = 0; index < OOT_COMBO_CONFIG_BOSS_COUNT; index++) {
    const bossId = data[OOT_COMBO_CONFIG_BOSS_OFFSET + index] ?? 0;
    if (bossId >= OOT_COMBO_CONFIG_BOSS_COUNT || seenBosses.has(bossId)) {
      return false;
    }
    seenBosses.add(bossId);
  }

  if ((data[OOT_COMBO_CONFIG_STRAY_FAIRY_REWARD_COUNT_OFFSET] ?? 0) > 15) {
    return false;
  }
  if (
    (data[OOT_COMBO_CONFIG_BOMBCHU_BEHAVIOR_OOT_OFFSET] ?? 0) > 3 ||
    (data[OOT_COMBO_CONFIG_BOMBCHU_BEHAVIOR_MM_OFFSET] ?? 0) > 3
  ) {
    return false;
  }
  for (let index = 0; index < OOT_COMBO_CONFIG_SONG_EVENT_COUNT; index++) {
    if ((data[OOT_COMBO_CONFIG_SONG_EVENTS_OFFSET + index] ?? 0) > 5) {
      return false;
    }
  }

  return true;
}

function ootComboConfigScore(data: Uint8Array): number {
  let score = data[0] ?? 0;
  for (let offset = 4; offset < OOT_COMBO_CONFIG_PRICES_OFFSET; offset += 4) {
    if (readU32BE(data, offset) !== 0) {
      score++;
    }
  }
  for (let index = 0; index < OOT_COMBO_CONFIG_PRICE_COUNT; index++) {
    if (readU16BE(data, OOT_COMBO_CONFIG_PRICES_OFFSET + index * 2) !== 0) {
      score++;
    }
  }
  return score;
}

function ootComboConfigFlagEnabled(config: Uint8Array, flag: number): boolean {
  if (flag < 0) {
    return false;
  }
  const byteIndex = Math.floor(flag / 8);
  if (byteIndex < 0 || byteIndex >= config.length) {
    return false;
  }
  return (config[byteIndex] & (1 << (flag % 8))) !== 0;
}

function ootMaxKeyValueAllowed(sceneId: number, value: number): boolean {
  switch (sceneId) {
    case 0:
    case 1:
    case 2:
    case 9:
    case 10:
    case 14:
    case 15:
      return value === 0;
    case 3:
      return value === 0 || value === 5 || value === 6;
    case 4:
      return value === 0 || value === 5 || value === 7 || value === 8;
    case 5:
      return value === 0 || value === 2 || value === 5;
    case 6:
      return value === 0 || value === 5 || value === 7;
    case 7:
      return value === 0 || value === 5 || value === 6;
    case 8:
      return value === 0 || value === 2 || value === 3;
    case 11:
      return value === 0 || value === 3 || value === 9;
    case 12:
      return value === 0 || value === 1 || value === 4;
    case 13:
      return value === 0 || value === 2 || value === 3;
    case 16:
      return value === 0 || value === 6;
    default:
      return false;
  }
}

function mmMaxKeyValueAllowed(dungeonIndex: number, value: number): boolean {
  switch (dungeonIndex) {
    case 0:
    case 2:
      return value === 0 || value === 1;
    case 1:
      return value === 0 || value === 3;
    case 3:
      return value === 0 || value === 4;
    default:
      return false;
  }
}

function parseOotSave(oot: OotState, data: Uint8Array): void {
  resetEmptyOotState(oot);
  oot.age = readU32BE(data, OOT_OFF_AGE);
  oot.sceneId = readU16BE(data, OOT_OFF_SCENE_ID);
  oot.hasMagic = (data[OOT_OFF_MAGIC_ACQUIRED] ?? 0) !== 0;
  oot.hasDoubleMagic = (data[OOT_OFF_DOUBLE_MAGIC] ?? 0) !== 0;
  oot.ocarinaGameRound = data[OOT_OFF_OCARINA_GAME_ROUND] ?? 0;
  oot.isBiggoronSword = (data[OOT_OFF_IS_BIGGORON_SWORD] ?? 0) !== 0;

  for (let index = 0; index < 24; index++) {
    oot.items[index] = data[OOT_OFF_INV_ITEMS + index] ?? EMPTY_INVENTORY_ITEM;
  }
  for (let index = 0; index < 15; index++) {
    oot.ammo[index] = data[OOT_OFF_INV_AMMO + index] ?? 0;
  }
  oot.beans = data[OOT_OFF_INV_BEANS] ?? 0;
  oot.equipment = readU16BE(data, OOT_OFF_EQUIPMENT);
  oot.upgrades = readU32BE(data, OOT_OFF_UPGRADES);
  oot.questItems = readU32BE(data, OOT_OFF_QUEST_ITEMS);
  oot.heartPieces = (oot.questItems >>> 28) & 0x0f;

  for (let index = 0; index < 20; index++) {
    oot.dungeonItems[index] = data[OOT_OFF_DUNGEON_ITEMS + index] ?? 0;
  }
  for (let index = 0; index < 19; index++) {
    oot.dungeonKeys[index] = toSignedByte(
      data[OOT_OFF_DUNGEON_KEYS + index] ?? 0xff,
    );
  }
  oot.goldTokens = readU16BE(data, OOT_OFF_GOLD_TOKENS);
  for (let index = 0; index < 6; index++) {
    oot.gsFlags[index] = readU32BE(data, OOT_OFF_GS_FLAGS + index * 4);
  }

  for (let index = 0; index < OOT_PERM_COUNT; index++) {
    const offset = OOT_OFF_PERM + index * OOT_PERM_ENTRY_SIZE;
    oot.sceneFlags[index] = {
      chests: readU32BE(data, offset),
      switch0: readU32BE(data, offset + 4),
      switch1: 0,
      clearedRoom: readU32BE(data, offset + 8),
      collectibles: readU32BE(data, offset + 12),
      visitedRooms: readU32BE(data, offset + 20),
      visitedFloors: readU32BE(data, offset + 24),
    };
  }

  for (let index = 0; index < 22; index++) {
    const offset =
      OOT_OFF_PERM + index * OOT_PERM_ENTRY_SIZE + OOT_PERM_EXTRA_OFF;
    oot.extraRecords[index] = readU32BE(data, offset);
  }

  for (let index = 0; index < 14; index++) {
    oot.eventsChk[index] = readU16BE(data, OOT_OFF_EVENTS_CHK + index * 2);
  }
  for (let index = 0; index < 4; index++) {
    oot.eventsItem[index] = readU16BE(data, OOT_OFF_EVENTS_ITEM + index * 2);
  }
  for (let index = 0; index < 30; index++) {
    oot.eventsMisc[index] = readU16BE(data, OOT_OFF_EVENTS_MISC + index * 2);
  }

  oot.gameMode =
    data.length >= OOT_CTX_OFF_GAME_MODE + 4
      ? readU32BE(data, OOT_CTX_OFF_GAME_MODE)
      : 0;
}

function parseMmSave(mm: MmState, data: Uint8Array): void {
  resetEmptyMmState(mm);
  mm.playerForm = data[MM_OFF_PLAYER_FORM] ?? 0;
  mm.day = readU32BE(data, MM_OFF_DAY);
  mm.time = readU16BE(data, MM_OFF_TIME);
  mm.hasMagic = (data[MM_OFF_MAGIC_ACQUIRED] ?? 0) !== 0;
  mm.hasDoubleMagic = (data[MM_OFF_DOUBLE_MAGIC] ?? 0) !== 0;

  for (let index = 0; index < 48; index++) {
    mm.items[index] = data[MM_OFF_INV_ITEMS + index] ?? EMPTY_INVENTORY_ITEM;
  }
  for (let index = 0; index < 24; index++) {
    mm.ammo[index] = toSignedByte(data[MM_OFF_INV_AMMO + index] ?? 0);
  }

  mm.equipment = readU16BE(data, MM_OFF_EQUIPMENT);
  mm.upgrades = readU32BE(data, MM_OFF_INV_UPGRADES);
  mm.questItems = readU32BE(data, MM_OFF_INV_QUEST);
  mm.heartPieces = (mm.questItems >>> 28) & 0x0f;
  mm.owlActivationFlags = readU16BE(data, MM_OFF_OWL_ACTIVATION_FLAGS);
  mm.skullTokensSwamp = readU16BE(data, MM_OFF_SKULL_SWAMP);
  mm.skullTokensOcean = readU16BE(data, MM_OFF_SKULL_OCEAN);

  for (let index = 0; index < 10; index++) {
    mm.dungeonItems[index] = data[MM_OFF_DUNGEON_ITEMS + index] ?? 0;
  }
  for (let index = 0; index < 9; index++) {
    mm.dungeonKeys[index] = toSignedByte(
      data[MM_OFF_DUNGEON_KEYS + index] ?? 0xff,
    );
  }
  for (let index = 0; index < 10; index++) {
    mm.strayFairies[index] = toSignedByte(
      data[MM_OFF_STRAY_FAIRIES + index] ?? 0,
    );
  }
  for (let index = 0; index < 100; index++) {
    mm.weekEventReg[index] = data[MM_OFF_WEEK_EVENT_REG + index] ?? 0;
  }
  mm.townStrayFairy =
    (mm.weekEventReg[MM_WEEK_EVENT_TOWN_STRAY_FAIRY_BYTE] ?? 0) &
    MM_WEEK_EVENT_TOWN_STRAY_FAIRY_MASK
      ? true
      : false;

  for (let index = 0; index < MM_PERM_COUNT; index++) {
    const offset = MM_OFF_PERM_SCENES + index * MM_PERM_ENTRY_SIZE;
    mm.sceneFlags[index] = {
      chests: readU32BE(data, offset),
      switch0: readU32BE(data, offset + 4),
      switch1: readU32BE(data, offset + 8),
      clearedRoom: readU32BE(data, offset + 12),
      collectibles: readU32BE(data, offset + 16),
      visitedFloors: readU32BE(data, offset + 20),
      visitedRooms: readU32BE(data, offset + 24),
    };
  }

  for (let index = 0; index < MM_PERM_COUNT; index++) {
    const offset = MM_CTX_OFF_CYCLE_FLAGS + index * 0x14;
    mm.cycleFlags[index] = {
      chests: readU32BE(data, offset),
      switch0: readU32BE(data, offset + 4),
      switch1: readU32BE(data, offset + 8),
      clearedRoom: readU32BE(data, offset + 12),
      collectibles: readU32BE(data, offset + 16),
    };
  }

  mm.gameMode =
    data.length >= MM_CTX_OFF_GAME_MODE + 4
      ? readU32BE(data, MM_CTX_OFF_GAME_MODE)
      : 0;
}

function parseSharedState(data: Uint8Array): SharedCustomState | null {
  const parsed = parseSharedStateUnchecked(data);
  if (!parsed || !isPlausibleSharedState(parsed)) {
    return null;
  }
  return parsed;
}

function parseSharedStateUnchecked(data: Uint8Array): SharedCustomState | null {
  const parsed = createEmptySharedState();
  for (const bitmap of sharedStorage.bitmaps) {
    const end = bitmap.offset + bitmap.size;
    if (bitmap.offset < 0 || end > data.length) {
      return null;
    }
    parsed.bitmaps.set(bitmap.name, data.slice(bitmap.offset, end));
  }

  const fo = sharedFixedOffsets;

  if (data.length >= fo.coinsOffset + SHARED_COIN_COUNT * 2) {
    for (let index = 0; index < parsed.coins.length; index++) {
      parsed.coins[index] = readU16BE(data, fo.coinsOffset + index * 2);
    }
  }
  if (data.length >= fo.ocarinaButtonMaskMmOffset + 2) {
    parsed.ocarinaButtonMaskOot = readU16BE(
      data,
      fo.ocarinaButtonMaskOotOffset,
    );
    parsed.ocarinaButtonMaskMm = readU16BE(data, fo.ocarinaButtonMaskMmOffset);
  }
  if (data.length > fo.halfDaysOffset) {
    parsed.halfDays = data[fo.halfDaysOffset] ?? 0;
  }
  if (
    data.length >=
    fo.caughtChildFishWeightOffset + fo.caughtFishWeightCount
  ) {
    for (let index = 0; index < fo.caughtFishWeightCount; index++) {
      parsed.caughtChildFishWeights[index] =
        data[fo.caughtChildFishWeightOffset + index] ?? 0;
    }
  }
  if (
    data.length >=
    fo.caughtAdultFishWeightOffset + fo.caughtFishWeightCount
  ) {
    for (let index = 0; index < fo.caughtFishWeightCount; index++) {
      parsed.caughtAdultFishWeights[index] =
        data[fo.caughtAdultFishWeightOffset + index] ?? 0;
    }
  }
  if (data.length > fo.bombchuBagFlagsOffset) {
    const flags = data[fo.bombchuBagFlagsOffset] ?? 0;
    parsed.bombchuBagOot =
      (flags >> SHARED_BOMBCHU_BAG_OOT_SHIFT) & SHARED_BOMBCHU_BAG_MASK;
    parsed.bombchuBagMm =
      (flags >> SHARED_BOMBCHU_BAG_MM_SHIFT) & SHARED_BOMBCHU_BAG_MASK;
  }
  if (data.length >= fo.songNotesOffset + fo.songNoteCount) {
    for (let index = 0; index < fo.songNoteCount; index++) {
      parsed.songNotes[index] = data[fo.songNotesOffset + index] ?? 0;
    }
  }
  if (data.length > fo.songFlagsOotOffset + 1) {
    parsed.songFlagsOot =
      (data[fo.songFlagsOotOffset] ?? 0) |
      ((data[fo.songFlagsOotOffset + 1] ?? 0) << 8);
  }
  if (
    data.length >=
    fo.rustyKeysOffset + fo.rustyKeysOotSize + fo.rustyKeysMmSize
  ) {
    for (let index = 0; index < fo.rustyKeysOotSize; index++) {
      parsed.rustyKeysOot[index] = data[fo.rustyKeysOffset + index] ?? 0;
    }
    for (let index = 0; index < fo.rustyKeysMmSize; index++) {
      parsed.rustyKeysMm[index] =
        data[fo.rustyKeysOffset + fo.rustyKeysOotSize + index] ?? 0;
    }
  }

  return parsed;
}

function isPlausibleSharedState(shared: SharedCustomState): boolean {
  for (const [name, bitmapInfo] of sharedBitmaps) {
    if (isSoulBitmap(name)) {
      continue;
    }
    if (
      !sharedBitmapHasNoUnusedBits(
        shared.bitmaps.get(name),
        sharedBitmapUsedBits.get(name) ?? 0,
        bitmapInfo.size,
      )
    ) {
      return false;
    }
  }
  return true;
}

function isSoulBitmap(name: string): boolean {
  return name.startsWith('souls');
}

function sharedBitmapHasNoUnusedBits(
  bitmap: Uint8Array | undefined,
  usedBits: number,
  expectedSize: number,
): boolean {
  if (!bitmap || bitmap.length !== expectedSize) {
    return false;
  }
  if (usedBits < 0 || usedBits > bitmap.length * 8) {
    return false;
  }

  let fullBytes = Math.floor(usedBits / 8);
  const remainingBits = usedBits % 8;
  if (remainingBits !== 0 && fullBytes < bitmap.length) {
    const mask = 0xff << remainingBits;
    if ((bitmap[fullBytes] & mask) !== 0) {
      return false;
    }
    fullBytes++;
  }

  for (let index = fullBytes; index < bitmap.length; index++) {
    if (bitmap[index] !== 0) {
      return false;
    }
  }

  return true;
}

function validateForeignOotSave(data: Uint8Array): boolean {
  return isPlausibleOotSave(data);
}

export function validateForeignMmSave(
  data: Uint8Array,
  rejectAllZero = true,
): boolean {
  return isPlausibleMmSave(data, rejectAllZero);
}

function isPlausibleOotSave(data: Uint8Array): boolean {
  const age = readU32BE(data, OOT_OFF_AGE);
  if (age > 1) {
    return false;
  }
  const sceneId = readU16BE(data, OOT_OFF_SCENE_ID);
  if (sceneId >= OOT_PERM_COUNT) {
    return false;
  }

  if (readU16BE(data, OOT_OFF_GOLD_TOKENS) > 100) {
    return false;
  }
  for (let index = 0; index < 19; index++) {
    const keys = toSignedByte(data[OOT_OFF_DUNGEON_KEYS + index] ?? 0xff);
    if (keys < -1 || keys > 9) {
      return false;
    }
  }

  // Reject if the permanent scene-flags region is entirely zero — this
  // indicates uninitialised/reset memory (e.g. emulator soft-reset).
  if (
    !saveDataRegionHasNonZeroValue(
      data,
      OOT_OFF_PERM,
      OOT_PERM_COUNT * OOT_PERM_ENTRY_SIZE,
    )
  ) {
    return false;
  }

  return true;
}

export function isPlausibleMmSave(
  data: Uint8Array,
  rejectAllZero = true,
): boolean {
  const playerForm = data[MM_OFF_PLAYER_FORM] ?? 0;
  if (playerForm > 4) {
    return false;
  }
  const day = readU32BE(data, MM_OFF_DAY);
  if (day > 4) {
    return false;
  }
  for (let index = 0; index < 9; index++) {
    const keys = toSignedByte(data[MM_OFF_DUNGEON_KEYS + index] ?? 0xff);
    if (keys < -1 || keys > 9) {
      return false;
    }
  }
  for (let index = 0; index < 10; index++) {
    const fairies = toSignedByte(data[MM_OFF_STRAY_FAIRIES + index] ?? 0);
    if (fairies < 0 || fairies > 15) {
      return false;
    }
  }

  // Reject if none of the key data regions carry any non-zero values —
  // this indicates uninitialised/reset memory (e.g. emulator soft-reset).
  // We check equipment, permanent scene flags AND cycle flags because MM
  // saves may legitimately have all-zero scene/cycle flags while still
  // carrying items/equipment (e.g. right after a story cutscene).
  //
  // This check is only enforced once we have previously seen a frame
  // where at least one of the three regions was non-zero.  Before that,
  // an all-zero save is accepted so that legitimate saves that only
  // carry data outside the three checked regions (e.g. Stray Fairies in
  // the foreign-MM area while playing OoT) are not discarded.
  if (rejectAllZero && mmSaveRegionsAreAllZero(data)) {
    return false;
  }

  return true;
}

/**
 * Returns true when equipment, permanent scene flags, AND cycle flags are
 * all zero in the given MM save buffer.
 */
export function mmSaveRegionsAreAllZero(data: Uint8Array): boolean {
  const hasEquipment =
    MM_OFF_EQUIPMENT + 2 <= data.length &&
    readU16BE(data, MM_OFF_EQUIPMENT) !== 0;
  if (hasEquipment) return false;

  const hasSceneFlags = saveDataRegionHasNonZeroValue(
    data,
    MM_OFF_PERM_SCENES,
    MM_PERM_COUNT * MM_PERM_ENTRY_SIZE,
  );
  if (hasSceneFlags) return false;

  const hasCycleFlags = saveDataRegionHasNonZeroValue(
    data,
    MM_CTX_OFF_CYCLE_FLAGS,
    MM_CYCLE_FLAGS_SIZE,
  );
  if (hasCycleFlags) return false;

  return true;
}

/**
 * Returns true when at least one byte in the range [startOffset, startOffset + length)
 * within `data` is non-zero.  Used to reject save-context dumps that are entirely
 * zeroed out (e.g. emulator soft-reset / uninitialised memory).
 */
function saveDataRegionHasNonZeroValue(
  data: Uint8Array,
  startOffset: number,
  length: number,
): boolean {
  const end = Math.min(startOffset + length, data.length);
  for (let i = startOffset; i < end; i++) {
    if (data[i] !== 0) return true;
  }
  return false;
}

/**
 * Returns true if the current shared state has lost data compared to the
 * last known shared state — i.e. at least one bitmap or scalar field
 * that was non-zero is now all-zero.  Used to detect the OoT/MM handoff
 * case where MM-related shared data slabs read as transiently empty
 * while the active game core save is unchanged.
 */
function sharedStateDegradedFrom(
  current: SharedCustomState,
  previous: SharedCustomState,
): boolean {
  for (const [name, prevBitmap] of previous.bitmaps) {
    const currBitmap = current.bitmaps.get(name);
    if (
      currBitmap &&
      typedArrayHasNonZeroValue(prevBitmap) &&
      !typedArrayHasNonZeroValue(currBitmap)
    ) {
      return true;
    }
  }

  if (previous.coins.some((v) => v > 0) && !current.coins.some((v) => v > 0)) {
    return true;
  }

  if (
    (previous.bombchuBagOot > 0 || previous.bombchuBagMm > 0) &&
    current.bombchuBagOot === 0 &&
    current.bombchuBagMm === 0
  ) {
    return true;
  }

  if (
    previous.songNotes.some((v) => v > 0) &&
    !current.songNotes.some((v) => v > 0)
  ) {
    return true;
  }

  if (previous.songFlagsOot > 0 && current.songFlagsOot === 0) {
    return true;
  }

  return false;
}

function sharedStateHasMeaningfulData(shared: SharedCustomState): boolean {
  for (const bitmap of shared.bitmaps.values()) {
    if (typedArrayHasNonZeroValue(bitmap)) {
      return true;
    }
  }

  return (
    shared.coins.some((value) => value > 0) ||
    (shared.ocarinaButtonMaskOot !== 0 &&
      shared.ocarinaButtonMaskOot !== SHARED_OCARINA_BUTTON_MASK_DISABLED) ||
    (shared.ocarinaButtonMaskMm !== 0 &&
      shared.ocarinaButtonMaskMm !== SHARED_OCARINA_BUTTON_MASK_DISABLED) ||
    shared.bombchuBagOot > 0 ||
    shared.bombchuBagMm > 0 ||
    shared.songNotes.some((value) => value > 0) ||
    shared.caughtChildFishWeights.some((value) => value > 0) ||
    shared.caughtAdultFishWeights.some((value) => value > 0) ||
    shared.songFlagsOot > 0
  );
}

function ootRuntimeStateHasMeaningfulData(oot: OotState): boolean {
  return (
    oot.hasRuntimeMqBits ||
    oot.hasRuntimeMaxKeys ||
    oot.hasRuntimeSilverRupeeCounts
  );
}

function ootRuntimeStateLooksTransitionEmpty(oot: OotState): boolean {
  return (
    !oot.hasRuntimeMqBits &&
    !oot.hasRuntimeSilverRupeeCounts &&
    (!oot.hasRuntimeMaxKeys || arrayValuesAllEqual(oot.runtimeMaxKeys, 0))
  );
}

function copyOotRuntimeState(target: OotState, source: OotState): void {
  target.runtimeMqBits = source.runtimeMqBits;
  target.hasRuntimeMqBits = source.hasRuntimeMqBits;
  target.runtimeMaxKeys = [...source.runtimeMaxKeys];
  target.hasRuntimeMaxKeys = source.hasRuntimeMaxKeys;
  target.runtimeSilverRupeeCounts = [...source.runtimeSilverRupeeCounts];
  target.hasRuntimeSilverRupeeCounts = source.hasRuntimeSilverRupeeCounts;
  target.bronzeScaleEnabled = source.bronzeScaleEnabled;
}

function ootCoreProgressMatches(
  current: OotState,
  previous: OotState,
): boolean {
  return (
    current.age === previous.age &&
    current.hasMagic === previous.hasMagic &&
    current.hasDoubleMagic === previous.hasDoubleMagic &&
    current.isBiggoronSword === previous.isBiggoronSword &&
    current.beans === previous.beans &&
    current.equipment === previous.equipment &&
    current.upgrades === previous.upgrades &&
    current.questItems === previous.questItems &&
    current.goldTokens === previous.goldTokens &&
    arrayValuesEqual(current.items, previous.items) &&
    arrayValuesEqual(current.dungeonItems, previous.dungeonItems) &&
    arrayValuesEqual(current.dungeonKeys, previous.dungeonKeys) &&
    arrayValuesEqual(current.extraRecords, previous.extraRecords)
  );
}

function mmCoreProgressMatches(current: MmState, previous: MmState): boolean {
  return (
    current.hasMagic === previous.hasMagic &&
    current.hasDoubleMagic === previous.hasDoubleMagic &&
    current.equipment === previous.equipment &&
    current.upgrades === previous.upgrades &&
    current.questItems === previous.questItems &&
    current.owlActivationFlags === previous.owlActivationFlags &&
    current.skullTokensSwamp === previous.skullTokensSwamp &&
    current.skullTokensOcean === previous.skullTokensOcean &&
    arrayValuesEqual(current.items, previous.items) &&
    arrayValuesEqual(current.dungeonItems, previous.dungeonItems) &&
    arrayValuesEqual(current.dungeonKeys, previous.dungeonKeys) &&
    arrayValuesEqual(current.strayFairies, previous.strayFairies)
  );
}

function arrayValuesEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function arrayValuesAllEqual(values: number[], expected: number): boolean {
  for (const value of values) {
    if (value !== expected) {
      return false;
    }
  }

  return true;
}

function typedArrayHasNonZeroValue(values: Uint8Array): boolean {
  for (const value of values) {
    if (value !== 0) {
      return true;
    }
  }

  return false;
}

function extractItems(state: GameState): RawAutotrackerItem[] {
  const items: RawAutotrackerItem[] = [];
  const oot = state.oot;
  const mm = state.mm;

  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_FOREST,
    'OOT_MEDALLION_FOREST',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_FIRE,
    'OOT_MEDALLION_FIRE',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_WATER,
    'OOT_MEDALLION_WATER',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_SPIRIT,
    'OOT_MEDALLION_SPIRIT',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_SHADOW,
    'OOT_MEDALLION_SHADOW',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_MEDALLION_LIGHT,
    'OOT_MEDALLION_LIGHT',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_STONE_EMERALD,
    'OOT_STONE_EMERALD',
  );
  appendQuestBit(items, oot.questItems, QUEST_OOT_STONE_RUBY, 'OOT_STONE_RUBY');
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_STONE_SAPPHIRE,
    'OOT_STONE_SAPPHIRE',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_MINUET,
    'OOT_SONG_MINUET',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_BOLERO,
    'OOT_SONG_BOLERO',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_SERENADE,
    'OOT_SONG_SERENADE',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_REQUIEM,
    'OOT_SONG_REQUIEM',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_NOCTURNE,
    'OOT_SONG_NOCTURNE',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_PRELUDE,
    'OOT_SONG_PRELUDE',
  );
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_LULLABY,
    'OOT_SONG_LULLABY',
  );
  appendQuestBit(items, oot.questItems, QUEST_OOT_SONG_EPONA, 'OOT_SONG_EPONA');
  appendQuestBit(items, oot.questItems, QUEST_OOT_SONG_SARIA, 'OOT_SONG_SARIA');
  appendQuestBit(items, oot.questItems, QUEST_OOT_SONG_SUN, 'OOT_SONG_SUN');
  appendQuestBit(items, oot.questItems, QUEST_OOT_SONG_TIME, 'OOT_SONG_TIME');
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_SONG_STORMS,
    'OOT_SONG_STORMS',
  );
  // Cross-game songs stored as bitfields in SharedCustomSave.oot, not quest items.
  // N64 is big-endian: GCC packs bitfields MSB-first within each byte.
  // Byte 0: hasElegy(7) chateauActive(6) hasSongHealing(5) hasSongSoaring(4)
  //          hasSongAwakening(3) hasSongGoronHalf(2) hasSongGoron(1) hasSongZora(0)
  // Byte 1: hasSongOrder(15)
  const sf = state.shared.songFlagsOot;
  appendPositiveItem(items, 'OOT_SONG_EMPTINESS', (sf >> 7) & 1);
  appendPositiveItem(items, 'OOT_SONG_HEALING', (sf >> 5) & 1);
  appendPositiveItem(items, 'OOT_SONG_SOARING', (sf >> 4) & 1);
  appendPositiveItem(items, 'OOT_SONG_AWAKENING', (sf >> 3) & 1);
  appendPositiveItem(items, 'OOT_SONG_GORON_HALF', (sf >> 2) & 1);
  appendPositiveItem(items, 'OOT_SONG_GORON', (sf >> 1) & 1);
  appendPositiveItem(items, 'OOT_SONG_ZORA', sf & 1);
  appendPositiveItem(items, 'OOT_SONG_ORDER', (sf >> 15) & 1);
  appendQuestBit(items, oot.questItems, QUEST_OOT_AGONY, 'OOT_STONE_OF_AGONY');
  appendQuestBit(
    items,
    oot.questItems,
    QUEST_OOT_GERUDO_CARD,
    'OOT_GERUDO_CARD',
  );

  appendPositiveItem(items, 'OOT_GOLD_TOKENS', oot.goldTokens);
  appendPositiveItem(items, 'OOT_HEART_PIECES', oot.heartPieces);

  const ootTunics = (oot.equipment >> 8) & 0x0f;
  const ootBoots = (oot.equipment >> 12) & 0x0f;
  // info.inventory.equipment.swords is an ownership bitmask (OOT_SWORD):
  //   bit 0 → EQ_OOT_SWORD_KOKIRI     → OOT_SWORD_KOKIRI
  //   bit 1 → EQ_OOT_SWORD_MASTER     → OOT_SWORD_MASTER
  //   bit 2 → EQ_OOT_SWORD_KNIFE      → OOT_SWORD_KNIFE (Giant's/Goron Knife)
  //   bit 4 → isBiggoronSword flag    → OOT_SWORD_BIGGORON
  // Both Giant's Knife and Biggoron's Sword set bit 2 in the save data.
  // isBiggoronSword (save+0x3e) is only set for Biggoron's Sword, so when it is
  // set we must clear bit 2 to avoid a false Goron Knife detection.
  // The delta system will preserve an already-tracked Goron Knife.
  {
    let swordBits = oot.equipment & 0x0f;
    if (oot.isBiggoronSword) {
      swordBits |= 0x10; // encode Biggoron's Sword as bit 4
      swordBits &= ~0x04; // clear bit 2 (ambiguous with Knife)
    }
    appendPositiveItem(items, 'OOT_SWORD', swordBits);
  }
  appendPositiveItem(items, 'OOT_SHIELD', (oot.equipment >> 4) & 0x0f);
  appendPositiveItem(items, 'OOT_TUNIC', ootEquipmentLevel(ootTunics));
  appendPositiveItem(
    items,
    'OOT_TUNIC_GORON',
    boolToInt((ootTunics & 0x02) !== 0),
  );
  appendPositiveItem(
    items,
    'OOT_TUNIC_ZORA',
    boolToInt((ootTunics & 0x04) !== 0),
  );
  appendPositiveItem(
    items,
    'OOT_BOOTS_IRON',
    boolToInt((ootBoots & 0x02) !== 0),
  );
  appendPositiveItem(
    items,
    'OOT_BOOTS_HOVER',
    boolToInt((ootBoots & 0x04) !== 0),
  );

  appendPositiveItem(items, 'OOT_QUIVER', getUpgradeLevel(oot.upgrades, 0, 3));
  appendPositiveItem(
    items,
    'OOT_BOMB_BAG',
    getUpgradeLevel(oot.upgrades, 3, 3),
  );
  appendPositiveItem(
    items,
    'OOT_STRENGTH',
    getUpgradeLevel(oot.upgrades, 6, 3),
  );
  appendPositiveItem(items, 'OOT_SCALE', ootScaleLevel(state));
  appendPositiveItem(
    items,
    'OOT_MAGIC_UPGRADE',
    magicUpgradeLevel(oot.hasMagic, oot.hasDoubleMagic),
  );
  appendPositiveItem(items, 'OOT_WALLET', ootWalletLevel(oot));
  appendPositiveItem(
    items,
    'OOT_BULLET_BAG',
    getUpgradeLevel(oot.upgrades, 14, 3),
  );
  appendPositiveItem(
    items,
    'OOT_STICK_UPGRADE',
    getUpgradeLevel(oot.upgrades, 17, 3),
  );
  appendPositiveItem(
    items,
    'OOT_NUT_UPGRADE',
    getUpgradeLevel(oot.upgrades, 20, 3),
  );

  for (let index = 0; index < oot.items.length; index++) {
    const itemId = oot.items[index];
    const entry = ootInventoryEntries[index];
    if (!entry?.itemId) {
      continue;
    }
    if (
      entry.itemId === 'OOT_ADULT_TRADE' ||
      entry.itemId === 'OOT_CHILD_TRADE'
    ) {
      continue;
    }
    let qty = inventorySlotQty(entry, itemId, oot.beans);
    if (
      entry.itemId === 'OOT_BOMBCHUS' &&
      qty === 0 &&
      state.shared.bombchuBagOot > 0
    ) {
      qty = 1;
    }
    appendPositiveItem(items, entry.itemId, qty);
  }
  appendPositiveItem(
    items,
    'OOT_BOTTLE_RUTO_LETTER',
    countOotBottleItem(oot.items, OOT_ITEM_RUTO_LETTER),
  );

  const ootTradeRecord = oot.extraRecords[EXTRA_IDX_OOT_TRADE] ?? 0;
  const ootTradeSaveRecord = oot.extraRecords[EXTRA_IDX_OOT_TRADE_SAVE] ?? 0;
  appendPositiveItem(
    items,
    'OOT_CHILD_TRADE',
    (ootTradeRecord >>> 16) | (ootTradeSaveRecord >>> 16),
  );
  appendPositiveItem(
    items,
    'OOT_ADULT_TRADE',
    (ootTradeRecord | ootTradeSaveRecord) & 0xffff,
  );

  for (let index = 0; index < 20; index++) {
    const dungeonItem = oot.dungeonItems[index] ?? 0;
    const [bossKeyId, compassId, mapId] = ootDungeonItemIds(index);
    if (bossKeyId) {
      appendPositiveItem(
        items,
        bossKeyId,
        boolToInt((dungeonItem & DUNGEON_ITEM_BOSS_KEY_MASK) !== 0),
      );
    }
    if (compassId) {
      appendPositiveItem(
        items,
        compassId,
        boolToInt((dungeonItem & DUNGEON_ITEM_COMPASS_MASK) !== 0),
      );
    }
    if (mapId) {
      appendPositiveItem(
        items,
        mapId,
        boolToInt((dungeonItem & DUNGEON_ITEM_MAP_MASK) !== 0),
      );
    }
  }
  for (let index = 0; index < 19; index++) {
    const keyId = ootDungeonSmallKeyId(index);
    if (!keyId) {
      continue;
    }
    const currentKeys = Math.max(0, oot.dungeonKeys[index] ?? 0);
    const maxKeys = dungeonMaxKeys(oot.dungeonItems[index] ?? 0);
    appendPositiveItem(items, keyId, Math.max(currentKeys, maxKeys));
  }

  appendOotSilverRupeeItems(items, oot);
  appendPositiveItem(
    items,
    'OOT_GANON_BK',
    boolToInt(((oot.extraRecords[EXTRA_IDX_OOT_FLAGS] ?? 0) & 1) !== 0),
  );
  appendPositiveItem(
    items,
    'OOT_TRIFORCE',
    oot.extraRecords[EXTRA_IDX_OOT_TRIFORCE] ?? 0,
  );

  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_REMAINS_ODOLWA,
    'MM_REMAINS_ODOLWA',
  );
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_REMAINS_GOHT,
    'MM_REMAINS_GOHT',
  );
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_REMAINS_GYORG,
    'MM_REMAINS_GYORG',
  );
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_REMAINS_TWINMOLD,
    'MM_REMAINS_TWINMOLD',
  );
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_SONG_AWAKENING,
    'MM_SONG_AWAKENING',
  );
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_GORON, 'MM_SONG_GORON');
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_ZORA, 'MM_SONG_ZORA');
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_SONG_EMPTINESS,
    'MM_SONG_EMPTINESS',
  );
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_ORDER, 'MM_SONG_ORDER');
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_SARIA, 'MM_SONG_SARIA');
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_TIME, 'MM_SONG_TIME');
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_SONG_HEALING,
    'MM_SONG_HEALING',
  );
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_EPONA, 'MM_SONG_EPONA');
  appendQuestBit(
    items,
    mm.questItems,
    QUEST_MM_SONG_SOARING,
    'MM_SONG_SOARING',
  );
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_STORMS, 'MM_SONG_STORMS');
  appendQuestBit(items, mm.questItems, QUEST_MM_SONG_SUN, 'MM_SONG_SUN');
  appendQuestBit(items, mm.questItems, QUEST_MM_NOTEBOOK, 'MM_NOTEBOOK');

  appendPositiveItem(items, 'MM_HEART_PIECES', mm.heartPieces);
  appendPositiveItem(items, 'MM_SWORD', mm.equipment & 0x0f);
  appendPositiveItem(items, 'MM_SHIELD', (mm.equipment >> 4) & 0x0f);

  for (let index = 0; index < mm.items.length; index++) {
    const itemId = mm.items[index];
    const entry = mmInventoryEntries[index];
    if (!entry?.itemId) {
      continue;
    }
    if (
      entry.itemId === 'MM_TRADE_1' ||
      entry.itemId === 'MM_TRADE_2' ||
      entry.itemId === 'MM_TRADE_3'
    ) {
      continue;
    }
    let qty = inventorySlotQty(entry, itemId, 0);
    if (
      entry.itemId === 'MM_BOMBCHU' &&
      qty === 0 &&
      state.shared.bombchuBagMm > 0
    ) {
      qty = 1;
    }
    appendPositiveItem(items, entry.itemId, qty);
  }
  appendPositiveItem(
    items,
    'MM_BOTTLE_RUTO_LETTER',
    countMmBottleItem(mm.items, MM_ITEM_RUTO_LETTER),
  );
  appendPositiveItem(
    items,
    'MM_BOTTLED_GOLD_DUST',
    countMmBottleItem(mm.items, MM_ITEM_GOLD_DUST),
  );

  const mmTradeRecord = oot.extraRecords[EXTRA_IDX_MM_TRADE] ?? 0;
  appendPositiveItem(items, 'MM_TRADE_1', (mmTradeRecord >>> 10) & 0x3f);
  appendPositiveItem(items, 'MM_TRADE_2', (mmTradeRecord >>> 5) & 0x1f);
  appendPositiveItem(items, 'MM_TRADE_3', mmTradeRecord & 0x1f);

  appendPositiveItem(items, 'MM_QUIVER', getUpgradeLevel(mm.upgrades, 0, 3));
  appendPositiveItem(items, 'MM_BOMB_BAG', getUpgradeLevel(mm.upgrades, 3, 3));
  appendPositiveItem(items, 'MM_STRENGTH', getUpgradeLevel(mm.upgrades, 6, 3));
  appendPositiveItem(items, 'MM_SCALE', mmScaleLevel(state));
  appendPositiveItem(
    items,
    'MM_MAGIC_UPGRADE',
    magicUpgradeLevel(mm.hasMagic, mm.hasDoubleMagic),
  );
  appendPositiveItem(items, 'MM_WALLET', mmWalletLevel(state));

  for (let index = 0; index < 10; index++) {
    const dungeonItem = mm.dungeonItems[index] ?? 0;
    const [bossKeyId, compassId, mapId] = mmDungeonItemIds(index);
    if (bossKeyId) {
      appendPositiveItem(
        items,
        bossKeyId,
        boolToInt((dungeonItem & DUNGEON_ITEM_BOSS_KEY_MASK) !== 0),
      );
    }
    if (compassId) {
      appendPositiveItem(
        items,
        compassId,
        boolToInt((dungeonItem & DUNGEON_ITEM_COMPASS_MASK) !== 0),
      );
    }
    if (mapId) {
      appendPositiveItem(
        items,
        mapId,
        boolToInt((dungeonItem & DUNGEON_ITEM_MAP_MASK) !== 0),
      );
    }
  }
  for (let index = 0; index < 9; index++) {
    const keyId = mmDungeonSmallKeyId(index);
    if (!keyId) {
      continue;
    }
    const currentKeys = Math.max(0, mm.dungeonKeys[index] ?? 0);
    const maxKeys = dungeonMaxKeys(mm.dungeonItems[index] ?? 0);
    appendPositiveItem(items, keyId, Math.max(currentKeys, maxKeys));
  }

  for (let index = 0; index < 10; index++) {
    const strayFairyId = mmDungeonStrayFairyId(index);
    if (!strayFairyId) {
      continue;
    }
    appendPositiveItem(
      items,
      strayFairyId,
      Math.max(0, mm.strayFairies[index] ?? 0),
    );
  }
  appendPositiveItem(
    items,
    'MM_STRAY_FAIRY_TOWN',
    boolToInt(mmTownStrayFairyCollected(state)),
  );
  appendPositiveItem(items, 'MM_GS_TOKEN_SWAMP', mm.skullTokensSwamp);
  appendPositiveItem(items, 'MM_GS_TOKEN_OCEAN', mm.skullTokensOcean);

  for (const [itemId, bit] of MM_OWL_ITEMS) {
    appendPositiveItem(
      items,
      itemId,
      boolToInt(
        ((oot.extraRecords[EXTRA_IDX_MM_OWL_FLAGS] ?? 0) & (1 << bit)) !== 0,
      ),
    );
  }

  for (const [ootItemId, mmItemId, mask] of SHARED_OCARINA_BUTTONS) {
    appendPositiveItem(
      items,
      ootItemId,
      boolToInt(
        sharedOcarinaButtonOwned(state.shared.ocarinaButtonMaskOot, mask),
      ),
    );
    appendPositiveItem(
      items,
      mmItemId,
      boolToInt(
        sharedOcarinaButtonOwned(state.shared.ocarinaButtonMaskMm, mask),
      ),
    );
  }

  appendOotFishingPondItems(items, state.shared);
  appendCatalogItems(items, state);

  return items;
}

function extractChecks(state: GameState): RawAutotrackerCheck[] {
  const checks: RawAutotrackerCheck[] = [];
  const seenNames = new Set<string>();

  const appendCheck = (name: string | null | undefined): void => {
    if (!name || seenNames.has(name)) {
      return;
    }
    seenNames.add(name);
    checks.push({ name, checked: true });
  };

  for (let sceneIndex = 0; sceneIndex < OOT_PERM_COUNT; sceneIndex++) {
    const sceneFlags = state.oot.sceneFlags[sceneIndex];
    let chests = sceneFlags.chests;
    let collectibles = sceneFlags.collectibles;
    if (state.oot.hasLiveSceneFlags && sceneIndex === state.oot.liveSceneId) {
      chests |= state.oot.liveChestFlags;
      collectibles |= state.oot.liveCollectFlags;
      collectibles |= state.oot.liveTempCollectFlag;
    }
    for (let bit = 0; bit < 32; bit++) {
      if ((chests & (1 << bit)) !== 0) {
        appendCheck(
          ootSceneCheckNameForState(state.oot, sceneIndex, 'chest', bit),
        );
      }
      if ((collectibles & (1 << bit)) !== 0) {
        appendCheck(
          ootSceneCheckNameForState(state.oot, sceneIndex, 'collect', bit),
        );
      }
    }
  }

  for (let sceneIndex = 0; sceneIndex < MM_PERM_COUNT; sceneIndex++) {
    const sceneFlags = state.mm.sceneFlags[sceneIndex];
    let chests = sceneFlags.chests;
    let switch0 = sceneFlags.switch0;
    let switch1 = sceneFlags.switch1;
    let collectibles = sceneFlags.collectibles;
    const cycleFlags = state.mm.cycleFlags[sceneIndex];
    chests |= cycleFlags.chests;
    switch0 |= cycleFlags.switch0;
    switch1 |= cycleFlags.switch1;
    collectibles |= cycleFlags.collectibles;
    if (state.mm.hasLiveSceneFlags && sceneIndex === state.mm.liveSceneId) {
      chests |= state.mm.liveChestFlags;
      switch0 |= state.mm.liveSwitch0Flags;
      switch1 |= state.mm.liveSwitch1Flags;
      collectibles |= state.mm.liveCollectFlags;
    }

    for (let bit = 0; bit < 32; bit++) {
      if ((chests & (1 << bit)) !== 0) {
        appendCheck(lookupSceneCheckName('MM', sceneIndex, 'chest', bit));
      }
      if ((collectibles & (1 << bit)) !== 0) {
        appendCheck(lookupSceneCheckName('MM', sceneIndex, 'collect', bit));
      }
      if ((switch0 & (1 << bit)) !== 0) {
        appendCheck(lookupSceneCheckName('MM', sceneIndex, 'switch0', bit));
      }
      if ((switch1 & (1 << bit)) !== 0) {
        appendCheck(lookupSceneCheckName('MM', sceneIndex, 'switch1', bit));
      }
    }
  }

  appendBitmapChecks(
    state.shared.bitmaps.get('npcOot'),
    'OOT',
    npcCheckName,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('npcMm'),
    'MM',
    npcCheckName,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('caughtFishFlags'),
    'OOT',
    fishCheckName,
    appendCheck,
  );
  appendOotGsChecks(state.oot.gsFlags, state.oot, appendCheck);
  appendOotXflagChecks(
    state.shared.bitmaps.get('xflagsOot'),
    state.oot,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('xflagsMm'),
    'MM',
    xflagCheckName,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('shopsOot'),
    'OOT',
    shopCheckName,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('shopsMm'),
    'MM',
    shopCheckName,
    appendCheck,
  );
  appendBitmapChecks(
    state.shared.bitmaps.get('scrubsOot'),
    'OOT',
    scrubCheckName,
    appendCheck,
  );
  appendOotSilverRupeeChecks(
    state.shared.bitmaps.get('srOot'),
    state.oot,
    appendCheck,
  );
  appendCowChecks(
    state.oot.extraRecords[EXTRA_IDX_COW_FLAGS] ?? 0,
    appendCheck,
  );
  appendOotSymbolChecks(state, ootSymbolChecks, appendCheck);
  appendOotAdultTradeConsumptionFallbacks(state, appendCheck);
  appendMmSymbolChecks(state, mmSymbolChecks, appendCheck);
  appendOotAmbiguousEventItemChecks(state, appendCheck);

  return checks;
}

function appendBitmapChecks(
  bitmap: Uint8Array | undefined,
  game: string,
  lookup: (game: string, bit: number) => string | null,
  appendCheck: (name: string | null | undefined) => void,
): void {
  if (!bitmap) {
    return;
  }
  for (let byteIndex = 0; byteIndex < bitmap.length; byteIndex++) {
    const value = bitmap[byteIndex] ?? 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((value & (1 << bit)) === 0) {
        continue;
      }
      appendCheck(lookup(game, byteIndex * 8 + bit));
    }
  }
}

function appendOotGsChecks(
  bitmap: number[],
  oot: OotState,
  appendCheck: (name: string | null | undefined) => void,
): void {
  for (let wordIndex = 0; wordIndex < bitmap.length; wordIndex++) {
    const value = bitmap[wordIndex] ?? 0;
    for (let bit = 0; bit < 32; bit++) {
      if ((value & (1 << bit)) === 0) {
        continue;
      }
      const index = wordIndex * 32 + bit;
      appendCheck(gsCheckName('OOT', index));
      if (!gsCheckName('OOT', index)) {
        const conflicts = ootConflictingGsCheckNames(oot, index);
        for (const name of conflicts) {
          appendCheck(name);
        }
      }
    }
  }
}

function appendOotXflagChecks(
  bitmap: Uint8Array | undefined,
  oot: OotState,
  appendCheck: (name: string | null | undefined) => void,
): void {
  if (!bitmap) {
    return;
  }
  for (let byteIndex = 0; byteIndex < bitmap.length; byteIndex++) {
    const value = bitmap[byteIndex] ?? 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((value & (1 << bit)) === 0) {
        continue;
      }
      const index = byteIndex * 8 + bit;
      const direct = xflagCheckName('OOT', index);
      if (direct) {
        appendCheck(direct);
        continue;
      }
      for (const name of ootConflictingXflagCheckNames(oot, index)) {
        appendCheck(name);
      }
    }
  }
}

function appendCowChecks(
  cowFlags: number,
  appendCheck: (name: string | null | undefined) => void,
): void {
  for (let bit = 0; bit < 32; bit++) {
    if ((cowFlags & (1 << bit)) === 0) {
      continue;
    }
    appendCheck(checkNameTable.get(`OOT_cow_${bit}`));
    appendCheck(checkNameTable.get(`MM_cow_${bit}`));
  }
}

function appendOotSilverRupeeChecks(
  bitmap: Uint8Array | undefined,
  oot: OotState,
  appendCheck: (name: string | null | undefined) => void,
): void {
  if (!bitmap) {
    return;
  }
  for (let byteIndex = 0; byteIndex < bitmap.length; byteIndex++) {
    const value = bitmap[byteIndex] ?? 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((value & (1 << bit)) === 0) {
        continue;
      }
      const index = byteIndex * 8 + bit;
      const direct = silverRupeeCheckName('OOT', index);
      if (direct) {
        appendCheck(direct);
        continue;
      }
      for (const name of ootConflictingSilverRupeeCheckNames(oot, index)) {
        appendCheck(name);
      }
    }
  }
}

function appendMmSymbolChecks(
  state: GameState,
  entries: MmSymbolCheck[],
  appendCheck: (name: string | null | undefined) => void,
): void {
  const mmFlags = state.oot.extraRecords[EXTRA_IDX_MM_FLAGS] ?? 0;
  const mmFlags2 = mmExtraFlags2(state);
  const mmFlags3 = state.oot.extraRecords[EXTRA_IDX_MM_FLAGS3] ?? 0;
  for (const entry of entries) {
    if (!mmSymbolCheckMatches(state, entry, mmFlags, mmFlags2, mmFlags3)) {
      continue;
    }
    appendCheck(npcSymbolCheckName('MM', entry.symbol) ?? entry.name);
  }
}

function appendOotSymbolChecks(
  state: GameState,
  entries: OotSymbolCheck[],
  appendCheck: (name: string | null | undefined) => void,
): void {
  const childTradeSave =
    (state.oot.extraRecords[EXTRA_IDX_OOT_TRADE_SAVE] ?? 0) >>> 16;
  const adultTradeSave =
    (state.oot.extraRecords[EXTRA_IDX_OOT_TRADE_SAVE] ?? 0) & 0xffff;
  const ootFlags = state.oot.extraRecords[EXTRA_IDX_OOT_FLAGS] ?? 0;
  for (const entry of entries) {
    if (
      !ootSymbolCheckMatches(
        state,
        entry,
        childTradeSave,
        adultTradeSave,
        ootFlags,
      )
    ) {
      continue;
    }
    appendCheck(npcSymbolCheckName('OOT', entry.symbol));
  }
}

function appendOotAdultTradeConsumptionFallbacks(
  state: GameState,
  appendCheck: (name: string | null | undefined) => void,
): void {
  const adultTrade =
    (state.oot.extraRecords[EXTRA_IDX_OOT_TRADE] ?? 0) & 0xffff;
  const adultTradeSave =
    (state.oot.extraRecords[EXTRA_IDX_OOT_TRADE_SAVE] ?? 0) & 0xffff;

  for (const [consumedBit, symbol] of OOT_ADULT_TRADE_CONSUMPTION_FALLBACKS) {
    const mask = 1 << consumedBit;
    if ((adultTradeSave & mask) === 0 || (adultTrade & mask) !== 0) {
      continue;
    }
    appendCheck(npcSymbolCheckName('OOT', symbol));
  }
}

function appendOotAmbiguousEventItemChecks(
  state: GameState,
  appendCheck: (name: string | null | undefined) => void,
): void {
  const npcOot = state.shared.bitmaps.get('npcOot');
  if (
    bitmapHasBit(npcOot, OOT_NPC_LOST_WOODS_MEMORY_BIT) ||
    hasOotEventItemCheck(state, OOT_EVENT_ITEM_LOST_WOODS_MEMORY) ||
    state.oot.ocarinaGameRound > 0
  ) {
    appendCheck(npcSymbolCheckName('OOT', 'LOST_WOODS_MEMORY'));
  }
}

function mmSymbolCheckMatches(
  state: GameState,
  entry: MmSymbolCheck,
  mmFlags: number,
  mmFlags2: number,
  mmFlags3: number,
): boolean {
  switch (entry.source) {
    case 'extra-flags':
      return (mmFlags & (1 << entry.bit)) !== 0;
    case 'extra-flags-2':
      return (mmFlags2 & (1 << entry.bit)) !== 0;
    case 'extra-flags-3':
      return (mmFlags3 & (1 << entry.bit)) !== 0;
    case 'extra-boss':
      return (mmExtraBossItems(state) & entry.mask) !== 0;
    case 'week-event':
      return hasMmWeekEventBit(state, entry.byteIndex, entry.mask);
    case 'owl-activation':
      return (state.mm.owlActivationFlags & (1 << entry.bit)) !== 0;
    default:
      return false;
  }
}

function ootSymbolCheckMatches(
  state: GameState,
  entry: OotSymbolCheck,
  childTradeSave: number,
  adultTradeSave: number,
  ootFlags: number,
): boolean {
  switch (entry.source) {
    case 'extra-flags':
      return (ootFlags & (1 << entry.bit)) !== 0;
    case 'quest':
      return hasQuestBit(state.oot.questItems, entry.bit);
    case 'child-trade':
      return (childTradeSave & entry.mask) !== 0;
    case 'trade':
      return (adultTradeSave & entry.mask) !== 0;
    case 'event':
      return entry.flags.some((flag) => hasOotEventCheck(state, flag));
    case 'event-item':
      return entry.flags.some((flag) => hasOotEventItemCheck(state, flag));
    case 'event-misc':
      return entry.flags.some((flag) => hasOotEventMiscCheck(state, flag));
    default:
      return false;
  }
}

function appendPositiveItem(
  items: RawAutotrackerItem[],
  id: string,
  qty: number,
): void {
  if (qty > 0) {
    items.push({ id, qty });
  }
}

function appendQuestBit(
  items: RawAutotrackerItem[],
  questItems: number,
  bit: number,
  id: string,
): void {
  if (hasQuestBit(questItems, bit)) {
    items.push({ id, qty: 1 });
  }
}

function hasQuestBit(questItems: number, bit: number): boolean {
  return (questItems & (1 << bit)) !== 0;
}

function getUpgradeLevel(
  upgrades: number,
  shift: number,
  bits: number,
): number {
  const mask = (1 << bits) - 1;
  return (upgrades >>> shift) & mask;
}

function magicUpgradeLevel(hasMagic: boolean, hasDoubleMagic: boolean): number {
  if (!hasMagic) return 0;
  return hasDoubleMagic ? 2 : 1;
}

function ootWalletLevel(oot: OotState): number {
  const ootFlags = oot.extraRecords[EXTRA_IDX_OOT_FLAGS] ?? 0;
  if ((ootFlags & (1 << OOT_EXTRA_FLAGS_CHILD_WALLET_BIT)) === 0) {
    return 0;
  }
  if ((ootFlags & (1 << OOT_EXTRA_FLAGS_BOTTOMLESS_BIT)) !== 0) {
    return 5;
  }
  return getUpgradeLevel(oot.upgrades, 12, 2) + 1;
}

function mmWalletLevel(state: GameState): number {
  if (
    (state.oot.extraRecords[EXTRA_IDX_MM_FLAGS2] ?? 0) &
    (1 << MM_EXTRA_FLAGS_2_CHILD_WALLET_BIT)
  ) {
    if (
      (state.oot.extraRecords[EXTRA_IDX_MM_FLAGS3] ?? 0) &
      (1 << MM_EXTRA_FLAGS_3_BOTTOMLESS_BIT)
    ) {
      return 5;
    }
    return getUpgradeLevel(state.mm.upgrades, 12, 2) + 1;
  }
  return 0;
}

function ootScaleLevel(state: GameState): number {
  const level = getUpgradeLevel(state.oot.upgrades, 9, 3);
  if (!state.oot.bronzeScaleEnabled) {
    return level;
  }
  const bronze = catalogItemSources.get('OOT_SCALE_BRONZE');
  if (
    bronze?.block &&
    bitmapHasBit(state.shared.bitmaps.get(bronze.block), bronze.bit ?? 0)
  ) {
    return level + 1;
  }
  return level;
}

function mmScaleLevel(state: GameState): number {
  const level = getUpgradeLevel(state.mm.upgrades, 9, 3);
  if (!state.oot.bronzeScaleEnabled) {
    return level;
  }
  const bronze = catalogItemSources.get('MM_SCALE_BRONZE');
  if (
    bronze?.block &&
    bitmapHasBit(state.shared.bitmaps.get(bronze.block), bronze.bit ?? 0)
  ) {
    return level + 1;
  }
  return level;
}

function mmExtraFlags2(state: GameState): number {
  return (
    state.mm.extraFlags2 || (state.oot.extraRecords[EXTRA_IDX_MM_FLAGS2] ?? 0)
  );
}

function mmExtraBossItems(state: GameState): number {
  return ((state.oot.extraRecords[EXTRA_IDX_MM_BOSS] ?? 0) >>> 8) & 0xff;
}

function mmTownStrayFairyCollected(state: GameState): boolean {
  return state.mm.townStrayFairy;
}

function hasMmWeekEventBit(
  state: GameState,
  byteIndex: number,
  mask: number,
): boolean {
  return (
    byteIndex >= 0 &&
    byteIndex < state.mm.weekEventReg.length &&
    ((state.mm.weekEventReg[byteIndex] ?? 0) & mask) !== 0
  );
}

function ootEquipmentLevel(mask: number): number {
  return mask === 0 ? 0 : 32 - Math.clz32(mask);
}

function ootDungeonItemIds(index: number): [string, string, string] {
  switch (index) {
    case 0:
      return ['', 'OOT_COMPASS_DT', 'OOT_MAP_DT'];
    case 1:
      return ['', 'OOT_COMPASS_DC', 'OOT_MAP_DC'];
    case 2:
      return ['', 'OOT_COMPASS_JJ', 'OOT_MAP_JJ'];
    case 3:
      return ['OOT_BOSS_KEY_FOREST', 'OOT_COMPASS_FOREST', 'OOT_MAP_FOREST'];
    case 4:
      return ['OOT_BOSS_KEY_FIRE', 'OOT_COMPASS_FIRE', 'OOT_MAP_FIRE'];
    case 5:
      return ['OOT_BOSS_KEY_WATER', 'OOT_COMPASS_WATER', 'OOT_MAP_WATER'];
    case 6:
      return ['OOT_BOSS_KEY_SPIRIT', 'OOT_COMPASS_SPIRIT', 'OOT_MAP_SPIRIT'];
    case 7:
      return ['OOT_BOSS_KEY_SHADOW', 'OOT_COMPASS_SHADOW', 'OOT_MAP_SHADOW'];
    case 8:
      return ['', 'OOT_COMPASS_BOTW', 'OOT_MAP_BOTW'];
    case 9:
      return ['', 'OOT_COMPASS_ICE', 'OOT_MAP_ICE'];
    case 10:
      return ['OOT_BOSS_KEY_GANON', '', ''];
    case 11:
      return ['', 'OOT_COMPASS_GTG', 'OOT_MAP_GTG'];
    case 13:
      return ['', 'OOT_COMPASS_GANON', 'OOT_MAP_GANON'];
    default:
      return ['', '', ''];
  }
}

function ootDungeonSmallKeyId(index: number): string {
  switch (index) {
    case 3:
      return 'OOT_SMALL_KEY_FOREST';
    case 4:
      return 'OOT_SMALL_KEY_FIRE';
    case 5:
      return 'OOT_SMALL_KEY_WATER';
    case 6:
      return 'OOT_SMALL_KEY_SPIRIT';
    case 7:
      return 'OOT_SMALL_KEY_SHADOW';
    case 8:
      return 'OOT_SMALL_KEY_BOTW';
    case 11:
      return 'OOT_SMALL_KEY_GTG';
    case 12:
      return 'OOT_SMALL_KEY_GF';
    case 13:
      return 'OOT_SMALL_KEY_GANON';
    case 16:
      return 'OOT_SMALL_KEY_TCG';
    default:
      return '';
  }
}

function mmDungeonItemIds(index: number): [string, string, string] {
  switch (index) {
    case 0:
      return ['MM_BOSS_KEY_WF', 'MM_COMPASS_WF', 'MM_MAP_WF'];
    case 1:
      return ['MM_BOSS_KEY_SH', 'MM_COMPASS_SH', 'MM_MAP_SH'];
    case 2:
      return ['MM_BOSS_KEY_GB', 'MM_COMPASS_GB', 'MM_MAP_GB'];
    case 3:
      return ['MM_BOSS_KEY_ST', 'MM_COMPASS_ST', 'MM_MAP_ST'];
    default:
      return ['', '', ''];
  }
}

function mmDungeonSmallKeyId(index: number): string {
  switch (index) {
    case 0:
      return 'MM_SMALL_KEY_WF';
    case 1:
      return 'MM_SMALL_KEY_SH';
    case 2:
      return 'MM_SMALL_KEY_GB';
    case 3:
      return 'MM_SMALL_KEY_ST';
    default:
      return '';
  }
}

function mmDungeonStrayFairyId(index: number): string {
  switch (index) {
    case 0:
      return 'MM_STRAY_FAIRY_WF';
    case 1:
      return 'MM_STRAY_FAIRY_SH';
    case 2:
      return 'MM_STRAY_FAIRY_GB';
    case 3:
      return 'MM_STRAY_FAIRY_ST';
    default:
      return '';
  }
}

function appendCatalogItems(
  items: RawAutotrackerItem[],
  state: GameState,
): void {
  for (const entry of trackedCatalogItems) {
    let qty = 0;
    switch (entry.source.kind) {
      case 'oot-derived-key-ring':
        qty = boolToInt(hasOotKeyRing(state.oot, entry.source.record ?? -1));
        break;
      case 'oot-derived-skeleton-key':
        qty = boolToInt(hasOotSkeletonKey(state.oot));
        break;
      case 'mm-derived-key-ring':
        qty = boolToInt(hasMmKeyRing(state.mm, entry.source.record ?? -1));
        break;
      case 'oot-derived-platinum-token':
        qty = boolToInt(hasOotPlatinumToken(state.oot));
        break;
      case 'mm-derived-platinum-token':
        qty = boolToInt(hasMmPlatinumToken(state.mm));
        break;
      case 'oot-derived-magical-rupee':
        qty = boolToInt(hasOotMagicalRupee(state.oot));
        break;
      case 'shared-bitmap-bit':
        qty = boolToInt(
          bitmapHasBit(
            state.shared.bitmaps.get(entry.source.block ?? ''),
            entry.source.bit ?? 0,
          ),
        );
        break;
      case 'shared-coin-count':
        qty = state.shared.coins[entry.source.index ?? -1] ?? 0;
        break;
      case 'shared-song-note':
        qty = state.shared.songNotes[entry.source.index ?? -1] ?? 0;
        break;
      case 'shared-half-day-bit':
        qty = boolToInt(
          (state.shared.halfDays & (1 << (entry.source.bit ?? 0))) !== 0,
        );
        break;
      case 'oot-extra-bit':
        qty = boolToInt(
          ((state.oot.extraRecords[entry.source.record ?? -1] ?? 0) &
            (1 << (entry.source.bit ?? 0))) !==
            0,
        );
        break;
      case 'oot-extra-byte-nonzero':
        qty = boolToInt(
          (((state.oot.extraRecords[entry.source.record ?? -1] ?? 0) >>>
            ((entry.source.byte ?? 0) * 8)) &
            0xff) !==
            0,
        );
        break;
      case 'shared-rusty-key': {
        const rustyGame = entry.source.game as 'oot' | 'mm';
        const rustyBytes =
          rustyGame === 'oot'
            ? state.shared.rustyKeysOot
            : state.shared.rustyKeysMm;
        qty = boolToInt(
          ((rustyBytes[entry.source.byte ?? -1] ?? 0) &
            (1 << (entry.source.bit ?? 0))) !==
            0,
        );
        break;
      }
      case 'mm-week-event-bit':
        qty = boolToInt(
          ((state.mm.weekEventReg[entry.source.byte ?? -1] ?? 0) &
            (1 << (entry.source.bit ?? 0))) !==
            0,
        );
        break;
      case 'mm-derived-skeleton-key':
        qty = boolToInt(hasMmSkeletonKey(state.mm));
        break;
      case 'mm-derived-transcendent-fairy':
        qty = boolToInt(hasMmTranscendentFairy(state));
        break;
      default:
        break;
    }
    appendPositiveItem(items, entry.itemId, qty);
  }
}

function appendOotFishingPondItems(
  items: RawAutotrackerItem[],
  shared: SharedCustomState,
): void {
  appendFishingPondWeightItems(items, shared.caughtChildFishWeights, false);
  appendFishingPondWeightItems(items, shared.caughtAdultFishWeights, true);
}

function appendFishingPondWeightItems(
  items: RawAutotrackerItem[],
  caughtWeights: number[],
  adult: boolean,
): void {
  if (caughtWeights.length === 0) {
    return;
  }
  let count = caughtWeights[0] ?? 0;
  count = Math.min(count, caughtWeights.length - 1);
  if (count <= 0) {
    return;
  }

  const counts = new Map<number, number>();
  for (let index = 1; index <= count; index++) {
    const rawWeight = caughtWeights[index] ?? 0;
    const itemId = ootFishingPondItemId(adult, rawWeight);
    if (!itemId) {
      continue;
    }
    counts.set(rawWeight, (counts.get(rawWeight) ?? 0) + 1);
  }

  if (adult) {
    for (
      let weight = FISHING_POND_ADULT_FISH_MIN_WEIGHT;
      weight <= FISHING_POND_ADULT_FISH_MAX_WEIGHT;
      weight++
    ) {
      appendPositiveItem(
        items,
        ootFishingPondItemId(true, weight),
        counts.get(weight) ?? 0,
      );
    }
    for (
      let weight = FISHING_POND_ADULT_LOACH_MIN_WEIGHT;
      weight <= FISHING_POND_ADULT_LOACH_MAX_WEIGHT;
      weight++
    ) {
      const rawWeight = weight | FISHING_POND_LOACH_WEIGHT_MASK;
      appendPositiveItem(
        items,
        ootFishingPondItemId(true, rawWeight),
        counts.get(rawWeight) ?? 0,
      );
    }
    return;
  }

  for (
    let weight = FISHING_POND_CHILD_FISH_MIN_WEIGHT;
    weight <= FISHING_POND_CHILD_FISH_MAX_WEIGHT;
    weight++
  ) {
    appendPositiveItem(
      items,
      ootFishingPondItemId(false, weight),
      counts.get(weight) ?? 0,
    );
  }
  for (
    let weight = FISHING_POND_CHILD_LOACH_MIN_WEIGHT;
    weight <= FISHING_POND_CHILD_LOACH_MAX_WEIGHT;
    weight++
  ) {
    const rawWeight = weight | FISHING_POND_LOACH_WEIGHT_MASK;
    appendPositiveItem(
      items,
      ootFishingPondItemId(false, rawWeight),
      counts.get(rawWeight) ?? 0,
    );
  }
}

function ootFishingPondItemId(adult: boolean, rawWeight: number): string {
  const weight = rawWeight & ~FISHING_POND_LOACH_WEIGHT_MASK;
  if ((rawWeight & FISHING_POND_LOACH_WEIGHT_MASK) !== 0) {
    if (adult) {
      return weight >= FISHING_POND_ADULT_LOACH_MIN_WEIGHT &&
        weight <= FISHING_POND_ADULT_LOACH_MAX_WEIGHT
        ? `OOT_FISHING_POND_ADULT_LOACH_${weight}LBS`
        : '';
    }
    return weight >= FISHING_POND_CHILD_LOACH_MIN_WEIGHT &&
      weight <= FISHING_POND_CHILD_LOACH_MAX_WEIGHT
      ? `OOT_FISHING_POND_CHILD_LOACH_${weight}LBS`
      : '';
  }
  if (adult) {
    return weight >= FISHING_POND_ADULT_FISH_MIN_WEIGHT &&
      weight <= FISHING_POND_ADULT_FISH_MAX_WEIGHT
      ? `OOT_FISHING_POND_ADULT_FISH_${weight}LBS`
      : '';
  }
  return weight >= FISHING_POND_CHILD_FISH_MIN_WEIGHT &&
    weight <= FISHING_POND_CHILD_FISH_MAX_WEIGHT
    ? `OOT_FISHING_POND_CHILD_FISH_${weight}LBS`
    : '';
}

function hasMmSkeletonKey(mm: MmState): boolean {
  for (let index = 0; index < MM_SKELETON_KEY_MAX_KEYS.length; index++) {
    if (
      dungeonMaxKeys(mm.dungeonItems[index] ?? 0) <
      MM_SKELETON_KEY_MAX_KEYS[index]
    ) {
      return false;
    }
  }
  return true;
}

function hasOotKeyRing(oot: OotState, dungeonIndex: number): boolean {
  if (dungeonIndex < 0 || dungeonIndex >= OOT_RUNTIME_SCENE_COUNT) {
    return false;
  }
  const wanted = ootMaxKeyLimit(oot, dungeonIndex);
  return (
    wanted > 0 && dungeonMaxKeys(oot.dungeonItems[dungeonIndex] ?? 0) >= wanted
  );
}

function hasOotSkeletonKey(oot: OotState): boolean {
  let totalWanted = 0;
  for (let sceneId = 0; sceneId < OOT_RUNTIME_SCENE_COUNT; sceneId++) {
    const wanted = ootMaxKeyLimit(oot, sceneId);
    if (wanted === 0) {
      continue;
    }
    totalWanted += wanted;
    if (dungeonMaxKeys(oot.dungeonItems[sceneId] ?? 0) < wanted) {
      return false;
    }
  }
  return totalWanted > 0;
}

function hasMmKeyRing(mm: MmState, dungeonIndex: number): boolean {
  return (
    dungeonIndex >= 0 &&
    dungeonIndex < MM_SKELETON_KEY_MAX_KEYS.length &&
    dungeonMaxKeys(mm.dungeonItems[dungeonIndex] ?? 0) >=
      MM_SKELETON_KEY_MAX_KEYS[dungeonIndex]
  );
}

function hasOotPlatinumToken(oot: OotState): boolean {
  return oot.goldTokens >= 100;
}

function hasMmPlatinumToken(mm: MmState): boolean {
  return mm.skullTokensSwamp >= 30 && mm.skullTokensOcean >= 30;
}

function appendOotSilverRupeeItems(
  items: RawAutotrackerItem[],
  oot: OotState,
): void {
  for (
    let silverRupeeId = 0;
    silverRupeeId < OOT_SILVER_RUPEE_SET_COUNT;
    silverRupeeId++
  ) {
    const qty = ootSilverRupeeCount(oot, silverRupeeId);
    if (qty <= 0) {
      continue;
    }
    const itemId = ootSilverRupeeItemId(oot, silverRupeeId);
    if (itemId) {
      appendPositiveItem(items, itemId, qty);
    }
  }
}

function ootSilverRupeeItemId(oot: OotState, silverRupeeId: number): string {
  const entry = OOT_SILVER_RUPEE_ITEM_IDS[silverRupeeId];
  if (!entry) {
    return '';
  }
  let variant = 0;
  if ((silverRupeeId === 2 || silverRupeeId === 3) && ootIsMqSpirit(oot)) {
    variant = 1;
  }
  if (
    (silverRupeeId === 14 || silverRupeeId === 15) &&
    ootIsMqGanonCastle(oot)
  ) {
    variant = 1;
  }
  return entry[variant] ?? '';
}

function ootMqDungeonState(
  oot: OotState,
  dungeonId: number,
): [boolean, boolean] {
  if (oot.hasRuntimeMqBits) {
    return [((oot.runtimeMqBits >>> dungeonId) & 1) !== 0, true];
  }
  switch (dungeonId) {
    case OOT_MQ_DODONGOS_CAVERN:
      return ootRuntimeSilverLimitMqState(oot, 0, 5, 0);
    case OOT_MQ_TEMPLE_FOREST:
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_TEMPLE_FOREST, 6, 5);
    case OOT_MQ_TEMPLE_FIRE:
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_TEMPLE_FIRE, 5, 7, 8);
    case OOT_MQ_TEMPLE_WATER:
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_TEMPLE_WATER, 2, 5);
    case OOT_MQ_TEMPLE_SPIRIT: {
      const silverResult = ootRuntimeSilverLimitMqState(oot, 4, 0, 5);
      if (silverResult[1]) {
        return silverResult;
      }
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_TEMPLE_SPIRIT, 7, 5);
    }
    case OOT_MQ_TEMPLE_SHADOW:
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_TEMPLE_SHADOW, 6, 5);
    case OOT_MQ_BOTTOM_OF_THE_WELL:
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_BOTTOM_OF_THE_WELL, 2, 3);
    case OOT_MQ_ICE_CAVERN:
      return ootRuntimeSilverLimitMqState(oot, 9, 0, 5);
    case OOT_MQ_GERUDO_TRAINING_GROUNDS: {
      const maxKeyResult = ootRuntimeMaxKeyMqState(
        oot,
        OOT_SCENE_GERUDO_TRAINING_GROUND,
        3,
        9,
      );
      if (maxKeyResult[1]) {
        return maxKeyResult;
      }
      return ootRuntimeSilverLimitMqState(oot, 12, 6, 5);
    }
    case OOT_MQ_GANON_CASTLE: {
      const silverResult = ootRuntimeSilverLimitMqState(oot, 17, 0, 5);
      if (silverResult[1]) {
        return silverResult;
      }
      return ootRuntimeMaxKeyMqState(oot, OOT_SCENE_INSIDE_GANON_CASTLE, 3, 2);
    }
    default:
      return [false, false];
  }
}

function ootRuntimeMaxKeyMqState(
  oot: OotState,
  sceneId: number,
  mqValue: number,
  ...vanillaValues: number[]
): [boolean, boolean] {
  if (
    !oot.hasRuntimeMaxKeys ||
    sceneId < 0 ||
    sceneId >= oot.runtimeMaxKeys.length
  ) {
    return [false, false];
  }
  const value = oot.runtimeMaxKeys[sceneId] ?? 0;
  if (value === mqValue) {
    return [true, true];
  }
  return [false, vanillaValues.includes(value)];
}

function ootRuntimeSilverLimitMqState(
  oot: OotState,
  silverRupeeId: number,
  mqValue: number,
  ...vanillaValues: number[]
): [boolean, boolean] {
  if (
    !oot.hasRuntimeSilverRupeeCounts ||
    silverRupeeId < 0 ||
    silverRupeeId >= oot.runtimeSilverRupeeCounts.length
  ) {
    return [false, false];
  }
  const value = oot.runtimeSilverRupeeCounts[silverRupeeId] ?? 0;
  if (value === mqValue) {
    return [true, true];
  }
  return [false, vanillaValues.includes(value)];
}

function ootIsMqSpirit(oot: OotState): boolean {
  return ootMqDungeonState(oot, OOT_MQ_TEMPLE_SPIRIT)[0];
}

function ootIsMqGanonCastle(oot: OotState): boolean {
  return ootMqDungeonState(oot, OOT_MQ_GANON_CASTLE)[0];
}

function hasOotMagicalRupee(oot: OotState): boolean {
  for (
    let silverRupeeId = 0;
    silverRupeeId < OOT_SILVER_RUPEE_SET_COUNT;
    silverRupeeId++
  ) {
    const wanted = ootSilverRupeeLimit(oot, silverRupeeId);
    if (wanted === 0) {
      continue;
    }
    if (ootSilverRupeeCount(oot, silverRupeeId) < wanted) {
      return false;
    }
  }
  return true;
}

function ootSilverRupeeCount(oot: OotState, silverRupeeId: number): number {
  const recordIndex = EXTRA_IDX_OOT_SILVER_1 + Math.floor(silverRupeeId / 4);
  const shift = (silverRupeeId % 4) * 8;
  return ((oot.extraRecords[recordIndex] ?? 0) >>> shift) & 0xff;
}

function hasMmTranscendentFairy(state: GameState): boolean {
  if (!mmTownStrayFairyCollected(state)) {
    return false;
  }
  for (let index = 0; index < MM_SKELETON_KEY_MAX_KEYS.length; index++) {
    if ((state.mm.strayFairies[index] ?? 0) < 15) {
      return false;
    }
  }
  return true;
}

function sharedOcarinaButtonOwned(buttonMask: number, mask: number): boolean {
  return (
    buttonMask !== SHARED_OCARINA_BUTTON_MASK_DISABLED &&
    (buttonMask & mask) !== 0
  );
}

function ootMaxKeyLimit(oot: OotState, sceneId: number): number {
  if (sceneId < 0 || sceneId >= OOT_RUNTIME_SCENE_COUNT) {
    return 0;
  }
  return oot.hasRuntimeMaxKeys
    ? (oot.runtimeMaxKeys[sceneId] ?? 0)
    : (OOT_FALLBACK_MAX_KEYS[sceneId] ?? 0);
}

function ootSilverRupeeLimit(oot: OotState, silverRupeeId: number): number {
  if (silverRupeeId < 0 || silverRupeeId >= OOT_SILVER_RUPEE_SET_COUNT) {
    return 0;
  }
  return oot.hasRuntimeSilverRupeeCounts
    ? (oot.runtimeSilverRupeeCounts[silverRupeeId] ?? 0)
    : (OOT_FALLBACK_SILVER_RUPEE_MAX_COUNTS[silverRupeeId] ?? 0);
}

function dungeonMaxKeys(dungeonItem: number): number {
  return dungeonItem >>> 3;
}

function bitmapHasBit(bitmap: Uint8Array | undefined, bit: number): boolean {
  if (!bitmap) {
    return false;
  }
  const byteIndex = Math.floor(bit / 8);
  return byteIndex >= 0 && byteIndex < bitmap.length
    ? (bitmap[byteIndex] & (1 << (bit % 8))) !== 0
    : false;
}

function inventorySlotQty(
  entry: InventorySlotEntry,
  itemId: number,
  beans: number,
): number {
  if (itemId === EMPTY_INVENTORY_ITEM) {
    return 0;
  }

  if (entry.quantity?.useBeansCount) {
    return beans > 0 ? beans : 1;
  }

  if (entry.quantity?.stages?.length) {
    if (entry.quantity.maxWithBottle && isOotBottleItem(itemId)) {
      return entry.quantity.stages.length;
    }
    return stageQty(itemId, entry.quantity.stages);
  }

  return 1;
}

function stageQty(itemId: number, stages: number[]): number {
  const index = stages.indexOf(itemId);
  return index >= 0 ? index + 1 : 0;
}

function isOotBottleItem(itemId: number): boolean {
  return (
    (itemId >= 0x14 && itemId <= 0x20) ||
    itemId === 0x82 ||
    (itemId >= 0x9e && itemId <= 0xa5)
  );
}

function countOotBottleItem(items: number[], target: number): number {
  return countBottleItem(items, target, ootInventoryEntries, 'OOT_BOTTLE_');
}

function countMmBottleItem(items: number[], target: number): number {
  return countBottleItem(items, target, mmInventoryEntries, 'MM_BOTTLE_');
}

function countBottleItem(
  items: number[],
  target: number,
  table: InventorySlotEntry[],
  bottlePrefix: string,
): number {
  let count = 0;
  for (let index = 0; index < items.length; index++) {
    if ((items[index] ?? 0) !== target) {
      continue;
    }
    const entry = table[index];
    if (entry?.itemId?.startsWith(bottlePrefix)) {
      count++;
    }
  }
  return count;
}

function hasOotEventCheck(state: GameState, flag: number): boolean {
  return hasOotEventBitmapFlag(state.oot.eventsChk, flag);
}

function hasOotEventItemCheck(state: GameState, flag: number): boolean {
  return hasOotEventBitmapFlag(state.oot.eventsItem, flag);
}

function hasOotEventMiscCheck(state: GameState, flag: number): boolean {
  return hasOotEventBitmapFlag(state.oot.eventsMisc, flag);
}

function hasOotEventBitmapFlag(bitmap: number[], flag: number): boolean {
  const word = flag >> 4;
  return word >= 0 && word < bitmap.length
    ? ((bitmap[word] ?? 0) & (1 << (flag & 0x0f))) !== 0
    : false;
}

function sceneCheckKey(
  game: string,
  scene: number,
  kind: string,
  bit: number,
): string {
  return `${game}_${kind}_${scene}_${bit}`;
}

function lookupSceneCheckName(
  game: string,
  scene: number,
  kind: string,
  bit: number,
): string | null {
  const key = sceneCheckKey(game, scene, kind, bit);
  return checkNameTable.get(key) ?? sceneCheckFallbacks.get(key) ?? null;
}

function ootSceneCheckNameForState(
  oot: OotState,
  scene: number,
  kind: string,
  bit: number,
): string | null {
  const key = sceneCheckKey('OOT', scene, kind, bit);
  return (
    checkNameTable.get(key) ??
    ootConflictingSceneCheckName(oot, key) ??
    sceneCheckFallbacks.get(key) ??
    null
  );
}

function npcCheckName(game: string, id: number): string | null {
  return npcCheckTables.get(game)?.get(id) ?? null;
}

function npcSymbolCheckName(game: string, symbol: string): string | null {
  return npcSymbolTables.get(game)?.get(symbol) ?? null;
}

function fishCheckName(game: string, bitPosition: number): string | null {
  return fishCheckTables.get(game)?.get(bitPosition) ?? null;
}

function xflagCheckName(game: string, bitPosition: number): string | null {
  return xflagCheckTables.get(game)?.get(bitPosition) ?? null;
}

function gsCheckName(game: string, bitPosition: number): string | null {
  return gsCheckTables.get(game)?.get(bitPosition) ?? null;
}

function shopCheckName(game: string, bitPosition: number): string | null {
  return shopCheckTables.get(game)?.get(bitPosition) ?? null;
}

function scrubCheckName(game: string, bitPosition: number): string | null {
  return scrubCheckTables.get(game)?.get(bitPosition) ?? null;
}

function silverRupeeCheckName(
  game: string,
  bitPosition: number,
): string | null {
  return silverRupeeCheckTables.get(game)?.get(bitPosition) ?? null;
}

function ootConflictingBitmapCheckNames(
  oot: OotState,
  block: string,
  bitPosition: number,
): string[] {
  const entry = ootBitmapConflictTable.get(block)?.get(bitPosition);
  if (!entry) {
    return [];
  }
  const [mq, known] = ootMqDungeonState(oot, entry.dungeonMq);
  if (!known) {
    return [];
  }
  return mq ? entry.mq : entry.vanilla;
}

function ootConflictingXflagCheckNames(
  oot: OotState,
  bitPosition: number,
): string[] {
  return ootConflictingBitmapCheckNames(oot, 'xflagsOot', bitPosition);
}

function ootConflictingGsCheckNames(
  oot: OotState,
  bitPosition: number,
): string[] {
  return ootConflictingBitmapCheckNames(oot, 'gsOot', bitPosition);
}

function ootConflictingSilverRupeeCheckNames(
  oot: OotState,
  bitPosition: number,
): string[] {
  return ootConflictingBitmapCheckNames(oot, 'srOot', bitPosition);
}

function ootConflictingSceneCheckName(
  oot: OotState,
  key: string,
): string | null {
  const entry = ootSceneConflictTable.get(key);
  if (!entry) {
    return null;
  }
  const [mq, known] = ootMqDungeonState(oot, entry.dungeonMq);
  if (!known) {
    return null;
  }
  return mq ? entry.mq : entry.vanilla;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function readU8(data: Uint8Array, offset: number): number {
  return data[offset] ?? 0;
}

function readU16BE(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0);
}

function readU32BE(data: Uint8Array, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

function toSignedByte(value: number): number {
  return value > 0x7f ? value - 0x100 : value;
}

function trailingZeros(value: number): number {
  return 31 - Math.clz32(value & -value);
}

function sliceAbsoluteChunk(
  chunk: DecodedRawChunk,
  absoluteAddress: number,
  size: number,
): Uint8Array | null {
  if (absoluteAddress < chunk.address) {
    return null;
  }
  const offset = absoluteAddress - chunk.address;
  if (offset < 0 || offset + size > chunk.data.length) {
    return null;
  }
  return chunk.data.slice(offset, offset + size);
}

function buildChunkedData(
  memory: RawFrameMemory,
  baseAddress: number,
  fullLength: number,
  specs: RawAutotrackerChunkSpec[],
  legacyChunkName?: string,
): Uint8Array | null {
  const data = new Uint8Array(fullLength);
  const legacyChunk = legacyChunkName ? memory.get(legacyChunkName) : undefined;
  if (legacyChunkName) {
    if (legacyChunk) {
      if (!copyChunkIntoBuffer(data, legacyChunk, baseAddress)) {
        return null;
      }
    }
  }

  for (const spec of specs) {
    const chunk = memory.get(spec.name);
    if (!chunk) {
      if (legacyChunk && chunkInRange(legacyChunk, spec.address, spec.length)) {
        continue;
      }
      return null;
    }

    if (!copyChunkIntoBuffer(data, chunk, baseAddress)) {
      return null;
    }
  }

  return data;
}

function copyChunkIntoBuffer(
  target: Uint8Array,
  chunk: DecodedRawChunk,
  baseAddress: number,
): boolean {
  const offset = chunk.address - baseAddress;
  if (offset < 0 || offset + chunk.data.length > target.length) {
    return false;
  }

  target.set(chunk.data, offset);
  return true;
}

function chunkInRange(
  chunk: DecodedRawChunk,
  absoluteAddress: number,
  size: number,
): boolean {
  if (absoluteAddress < chunk.address) {
    return false;
  }
  const offset = absoluteAddress - chunk.address;
  return offset >= 0 && offset + size <= chunk.data.length;
}

function createEmptyOotState(): OotState {
  return {
    sceneId: 0,
    liveSceneId: 0,
    age: 0,
    gameMode: 0,
    ocarinaGameRound: 0,
    hasMagic: false,
    hasDoubleMagic: false,
    isBiggoronSword: false,
    liveChestFlags: 0,
    liveCollectFlags: 0,
    liveTempCollectFlag: 0,
    hasLiveSceneFlags: false,
    items: Array.from({ length: 24 }, () => EMPTY_INVENTORY_ITEM),
    ammo: Array.from({ length: 15 }, () => 0),
    beans: 0,
    equipment: 0,
    upgrades: 0,
    questItems: 0,
    heartPieces: 0,
    dungeonItems: Array.from({ length: 20 }, () => 0),
    dungeonKeys: Array.from({ length: 19 }, () => -1),
    goldTokens: 0,
    gsFlags: Array.from({ length: 6 }, () => 0),
    runtimeMqBits: 0,
    runtimeMaxKeys: Array.from({ length: OOT_RUNTIME_SCENE_COUNT }, () => 0),
    runtimeSilverRupeeCounts: Array.from(
      { length: OOT_SILVER_RUPEE_SET_COUNT },
      () => 0,
    ),
    hasRuntimeMqBits: false,
    hasRuntimeMaxKeys: false,
    hasRuntimeSilverRupeeCounts: false,
    bronzeScaleEnabled: false,
    sceneFlags: Array.from({ length: OOT_PERM_COUNT }, createEmptySceneFlags),
    extraRecords: Array.from({ length: 22 }, () => 0),
    eventsChk: Array.from({ length: 14 }, () => 0),
    eventsItem: Array.from({ length: 4 }, () => 0),
    eventsMisc: Array.from({ length: 30 }, () => 0),
  };
}

function createEmptyMmState(): MmState {
  return {
    playerForm: 0,
    day: 0,
    time: 0,
    gameMode: 0,
    hasMagic: false,
    hasDoubleMagic: false,
    liveSceneId: 0,
    liveChestFlags: 0,
    liveSwitch0Flags: 0,
    liveSwitch1Flags: 0,
    liveCollectFlags: 0,
    hasLiveSceneFlags: false,
    items: Array.from({ length: 48 }, () => EMPTY_INVENTORY_ITEM),
    ammo: Array.from({ length: 24 }, () => 0),
    equipment: 0,
    upgrades: 0,
    questItems: 0,
    heartPieces: 0,
    owlActivationFlags: 0,
    dungeonItems: Array.from({ length: 10 }, () => 0),
    dungeonKeys: Array.from({ length: 9 }, () => -1),
    strayFairies: Array.from({ length: 10 }, () => 0),
    weekEventReg: Array.from({ length: 100 }, () => 0),
    townStrayFairy: false,
    extraFlags2: 0,
    skullTokensSwamp: 0,
    skullTokensOcean: 0,
    sceneFlags: Array.from({ length: MM_PERM_COUNT }, createEmptySceneFlags),
    cycleFlags: Array.from(
      { length: MM_PERM_COUNT },
      createEmptyCycleSceneFlags,
    ),
  };
}

function createEmptySharedState(): SharedCustomState {
  const fo = sharedFixedOffsets;
  return {
    bitmaps: new Map(),
    halfDays: 0,
    coins: Array.from({ length: SHARED_COIN_COUNT }, () => 0),
    ocarinaButtonMaskOot: 0,
    ocarinaButtonMaskMm: 0,
    bombchuBagOot: 0,
    bombchuBagMm: 0,
    songNotes: Array.from({ length: fo.songNoteCount }, () => 0),
    caughtChildFishWeights: Array.from(
      { length: fo.caughtFishWeightCount },
      () => 0,
    ),
    caughtAdultFishWeights: Array.from(
      { length: fo.caughtFishWeightCount },
      () => 0,
    ),
    rustyKeysOot: Array.from({ length: fo.rustyKeysOotSize }, () => 0),
    rustyKeysMm: Array.from({ length: fo.rustyKeysMmSize }, () => 0),
    songFlagsOot: 0,
  };
}

function createEmptySceneFlags(): SceneFlags {
  return {
    chests: 0,
    switch0: 0,
    switch1: 0,
    clearedRoom: 0,
    collectibles: 0,
    visitedRooms: 0,
    visitedFloors: 0,
  };
}

function createEmptyCycleSceneFlags(): CycleSceneFlags {
  return {
    chests: 0,
    switch0: 0,
    switch1: 0,
    clearedRoom: 0,
    collectibles: 0,
  };
}

function cloneOotState(source: OotState): OotState {
  return {
    ...source,
    items: [...source.items],
    ammo: [...source.ammo],
    dungeonItems: [...source.dungeonItems],
    dungeonKeys: [...source.dungeonKeys],
    gsFlags: [...source.gsFlags],
    runtimeMaxKeys: [...source.runtimeMaxKeys],
    runtimeSilverRupeeCounts: [...source.runtimeSilverRupeeCounts],
    sceneFlags: source.sceneFlags.map((flags) => ({ ...flags })),
    extraRecords: [...source.extraRecords],
    eventsChk: [...source.eventsChk],
    eventsItem: [...source.eventsItem],
    eventsMisc: [...source.eventsMisc],
  };
}

function cloneMmState(source: MmState): MmState {
  return {
    ...source,
    items: [...source.items],
    ammo: [...source.ammo],
    dungeonItems: [...source.dungeonItems],
    dungeonKeys: [...source.dungeonKeys],
    strayFairies: [...source.strayFairies],
    weekEventReg: [...source.weekEventReg],
    sceneFlags: source.sceneFlags.map((flags) => ({ ...flags })),
    cycleFlags: source.cycleFlags.map((flags) => ({ ...flags })),
  };
}

function cloneSharedState(source: SharedCustomState): SharedCustomState {
  return {
    bitmaps: new Map(
      Array.from(source.bitmaps, ([name, bitmap]) => [name, bitmap.slice()]),
    ),
    halfDays: source.halfDays,
    coins: [...source.coins],
    ocarinaButtonMaskOot: source.ocarinaButtonMaskOot,
    ocarinaButtonMaskMm: source.ocarinaButtonMaskMm,
    bombchuBagOot: source.bombchuBagOot,
    bombchuBagMm: source.bombchuBagMm,
    songNotes: [...source.songNotes],
    caughtChildFishWeights: [...source.caughtChildFishWeights],
    caughtAdultFishWeights: [...source.caughtAdultFishWeights],
    rustyKeysOot: [...source.rustyKeysOot],
    rustyKeysMm: [...source.rustyKeysMm],
    songFlagsOot: source.songFlagsOot,
  };
}

function copyOotState(target: OotState, source: OotState): void {
  Object.assign(target, cloneOotState(source));
}

function copyMmState(target: MmState, source: MmState): void {
  Object.assign(target, cloneMmState(source));
}

function copySharedState(
  target: SharedCustomState,
  source: SharedCustomState,
): void {
  Object.assign(target, cloneSharedState(source));
}

function resetEmptyOotState(oot: OotState): void {
  Object.assign(oot, createEmptyOotState());
}

function resetEmptyMmState(mm: MmState): void {
  Object.assign(mm, createEmptyMmState());
}
