import type {
  TrackerPack,
  TrackerCheckResult,
  LocationInfo,
  TrackerLocationTraceResult,
} from '@/types/tracker';
import type { OoTMMSettings } from './types/settings';
import { DEFAULT_OOTMM_SETTINGS } from './types/settings';
import { VANILLA_SONG_EVENTS } from './data/song-events';

// Import from OoTMM submodule - using default imports for CJS/TS interop
import * as LogicMod from '@ootmm/core/logic/index';
import * as PathfinderMod from '@ootmm/core/logic/pathfind';
import * as LocationsMod from '@ootmm/core/logic/locations';
import * as ExprMod from '@ootmm/core/logic/expr';
import * as ItemsMod from '@ootmm/core/items/index';
import * as MonitorMod from '@ootmm/core/monitor';
import * as SettingsMod from '@ootmm/core/settings/index';
import * as EntranceMod from '@ootmm/core/logic/entrance';
import * as IsShuffledMod from '@ootmm/core/logic/is-shuffled';
import * as DataMod from '@ootmm/data';

import { ITEM_DATABASE } from './data/items';
import { LOCATION_CODE_CATALOG } from './data/locationCatalog';
import {
  getActiveEntranceKeys,
  isTrackedEntranceExitType,
  INTERIOR_GAME_LINK_SOURCE_KEYS,
} from './utils/entranceRandomization';

const resolveExport = <T>(mod: unknown, key: string): T =>
  (mod as Record<string, T>)?.[key] ??
  (mod as { default: Record<string, T> })?.default?.[key];

const worldState = resolveExport<typeof LogicMod.worldState>(
  LogicMod,
  'worldState',
);
const Pathfinder = resolveExport<typeof PathfinderMod.Pathfinder>(
  PathfinderMod,
  'Pathfinder',
);
const makeLocation = resolveExport<typeof LocationsMod.makeLocation>(
  LocationsMod,
  'makeLocation',
);
const locationData = resolveExport<typeof LocationsMod.locationData>(
  LocationsMod,
  'locationData',
);
const exprTrue = resolveExport<typeof ExprMod.exprTrue>(ExprMod, 'exprTrue');
const exprHas = resolveExport<(item: unknown, count: number) => unknown>(
  ExprMod,
  'exprHas',
);
const exprOr = resolveExport<(exprs: unknown[]) => unknown>(ExprMod, 'exprOr');
const exprAnd = resolveExport<(exprs: unknown[]) => unknown>(
  ExprMod,
  'exprAnd',
);
const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items');
const makePlayerItem = resolveExport<typeof ItemsMod.makePlayerItem>(
  ItemsMod,
  'makePlayerItem',
);
const itemByID = resolveExport<typeof ItemsMod.itemByID>(ItemsMod, 'itemByID');
const Monitor = resolveExport<typeof MonitorMod.Monitor>(MonitorMod, 'Monitor');
const makeSettings = resolveExport<typeof SettingsMod.makeSettings>(
  SettingsMod,
  'makeSettings',
);
const mergeSettings = resolveExport<typeof SettingsMod.mergeSettings>(
  SettingsMod,
  'mergeSettings',
);
const LogicPassEntrances = resolveExport<typeof EntranceMod.LogicPassEntrances>(
  EntranceMod,
  'LogicPassEntrances',
);
const isShuffled = resolveExport<typeof IsShuffledMod.isShuffled>(
  IsShuffledMod,
  'isShuffled',
);
const ENTRANCES_DATA =
  resolveExport<
    Record<
      string,
      {
        game: string;
        type: string;
        from: string;
        to: string;
        reverse?: string;
        flags?: string[];
      }
    >
  >(DataMod, 'ENTRANCES') ?? {};

import type { World } from '@ootmm/core/logic/world';
import type { PlayerItems, PlayerItem } from '@ootmm/core/items/index';

type WorldData = {
  worlds: World[];
  fixedLocations?: unknown;
  allItems?: unknown;
  startingItems?: unknown;
  [key: string]: unknown;
};

type PathfinderState = ReturnType<InstanceType<typeof Pathfinder>['run']>;

type StableReachabilityState = {
  state: PathfinderState;
  reachableLocationIds: string[];
  newLocationIds: string[];
  silverRupeeCounts: Map<string, number>;
  owlStatueCounts: Map<string, number>;
};

type TraceAreaData = {
  ootTime: number;
  mmTime: number;
  mmTime2: number;
  flagsOn: number;
  flagsOff: number;
};

type TraceAgeState = {
  areas?: Map<string, TraceAreaData>;
};

type TraceWorldState = {
  ages?: TraceAgeState[];
  items?: Map<unknown, number>;
  renewables?: Map<unknown, number>;
  licenses?: Map<unknown, number>;
  events?: Set<string>;
};

type TraceAreaNode = {
  worldId: number;
  age: number;
  areaName: string;
};

type TraceReachabilityState = {
  state: PathfinderState;
  reachableLocationIds: string[];
  traceParents: Map<string, string | null>;
};

/**
 * WORKAROUND: The OoTMM core library seems to have been transpiled with an assumption
 * that Map.entries() returns an array (or using a C-style for loop on the result),
 * but in the browser it returns an Iterator which has no .length property.
 * This wrapper Map overrides entries() to return an array instead of an iterator.
 * See: https://github.com/microsoft/TypeScript/issues/33077 (maybe related?)
 */
class ArrayEntriesMap<K, V> extends Map<K, V> {
  // @ts-expect-error OoTMM core iterates entries() with .length; return array instead of MapIterator
  entries(): [K, V][] {
    return Array.from(super.entries());
  }
}

const PRECOMPLETED_MAJOR_DUNGEONS = new Set([
  'DT',
  'DC',
  'JJ',
  'Forest',
  'Fire',
  'Water',
  'Shadow',
  'Spirit',
  'WF',
  'SH',
  'GB',
  'ST',
]);

const PRECOMPLETED_WISPS: Record<string, string> = {
  Water: 'OOT_WISP_CLEAR_STATE_LAKE',
  WF: 'MM_WISP_CLEAR_STATE_WOODFALL',
  SH: 'MM_WISP_CLEAR_STATE_SNOWHEAD',
  GB: 'MM_WISP_CLEAR_STATE_GREAT_BAY',
  IST: 'MM_WISP_CLEAR_STATE_IKANA',
};

const SINGLE_COUNT_ITEM_IDS = new Set([
  'OOT_BOTTLE_EMPTY',
  'OOT_BOMBCHU_10',
  'OOT_SHIELD_DEKU',
  'OOT_SHIELD_HYLIAN',
  'OOT_TUNIC_GORON',
  'OOT_TUNIC_ZORA',
  'MM_BOMBCHU',
  'MM_SHIELD_HERO',
  'MM_BOTTLE_EMPTY',
  'SHARED_SHIELD_HYLIAN',
  'SHARED_TUNIC_GORON',
  'SHARED_TUNIC_ZORA',
  'MM_MAGIC_BEAN',
]);

const FISHING_POND_ALWAYS_INCLUDED_ITEM_IDS = new Set([
  'OOT_FISHING_POND_CHILD_FISH_7LBS',
  'OOT_FISHING_POND_ADULT_FISH_8LBS',
  'OOT_FISHING_POND_CHILD_LOACH_14LBS',
  'OOT_FISHING_POND_ADULT_LOACH_29LBS',
]);

/**
 * Vanilla cross-game entrance mappings for game-link EXIT keys.
 * These match the format used by OoTMM's connectGamesDefault()
 * (which maps the overworld-door transitions, not the interior-exit transitions).
 * When erIndoorsGameLinks is active but the user hasn't assigned the game-link
 * entrances, the tracker adds these to the plando to preserve the OOT↔MM connection.
 */
const GAME_LINK_VANILLA_EXIT_MAPPING: Record<string, Record<string, string>> = {
  ootmm: {
    OOT_SHOP_MASKS: 'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
    MM_CLOCK_TOWER_FROM_CLOCK_TOWN: 'OOT_MARKET_FROM_MASK_SHOP',
  },
  oot: {
    OOT_SHOP_MASKS: 'OOT_MARKET_FROM_MASK_SHOP',
  },
  mm: {
    MM_CLOCK_TOWER_FROM_CLOCK_TOWN: 'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
  },
};

const BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_OOT_MM = new Set([
  'OOT_BOTTLE_EMPTY',
  'MM_BOTTLE_EMPTY',
]);

const BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_SHARED = new Set(['SHARED_BOTTLE_EMPTY']);

const CLOCK_ITEM_IDS = new Set([
  'MM_CLOCK1',
  'MM_CLOCK2',
  'MM_CLOCK3',
  'MM_CLOCK4',
  'MM_CLOCK5',
  'MM_CLOCK6',
]);

const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';

const BOTTLE_CONTENT_BASE_ITEM_IDS: Record<string, string> = {
  OOT_BOTTLE_POTION_RED: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POTION_GREEN: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_POTION_BLUE: 'OOT_BOTTLE_EMPTY',
  OOT_BOTTLE_BLUE_FIRE: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_RED: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_GREEN: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_POTION_BLUE: 'MM_BOTTLE_EMPTY',
  MM_BOTTLE_BLUE_FIRE: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_RED: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_GREEN: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_POTION_BLUE: 'SHARED_BOTTLE_EMPTY',
  SHARED_BOTTLE_BLUE_FIRE: 'SHARED_BOTTLE_EMPTY',
};

const VANILLA_SILVER_RUPEE_PREFIX = 'OOT_RUPEE_SILVER_';
const GRID_WHEEL_OVERLAY_STATE_PREFIX = '__grid_wheel_overlay_state__:';
const OWL_STATUE_PREFIX = 'MM_OWL_';

const PRICE_COUNT_OOT_SHOPS = 64;
const PRICE_COUNT_OOT_SCRUBS = 38;
const PRICE_COUNT_OOT_MERCHANTS = 4;
const PRICE_COUNT_MM_SHOPS = 22;
const PRICE_COUNT_MM_SHOPS_EX = 1;
const PRICE_COUNT_MM_TINGLE = 12;
const PRICE_RANGE_OOT_SHOPS = 0;
const PRICE_RANGE_OOT_SCRUBS = PRICE_RANGE_OOT_SHOPS + PRICE_COUNT_OOT_SHOPS;
const PRICE_RANGE_OOT_MERCHANTS =
  PRICE_RANGE_OOT_SCRUBS + PRICE_COUNT_OOT_SCRUBS;
const PRICE_RANGE_MM_SHOPS =
  PRICE_RANGE_OOT_MERCHANTS + PRICE_COUNT_OOT_MERCHANTS;
const PRICE_RANGE_MM_SHOPS_EX = PRICE_RANGE_MM_SHOPS + PRICE_COUNT_MM_SHOPS;
const PRICE_RANGE_MM_TINGLE = PRICE_RANGE_MM_SHOPS_EX + PRICE_COUNT_MM_SHOPS_EX;

type ShopPriceSlot = {
  worldId: number;
  slots: number[];
};

const OOT_MERCHANT_SLOT_BY_ID: Record<string, number> = {
  OOT_MEDIGORON: 0,
  OOT_CARPET_MERCHANT: 1,
  OOT_WITCH_BLUE_POTION: 2,
  OOT_TALON_MILK: 3,
};

const isTrackerDebugModeEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
};

export class OoTMMTracker implements TrackerPack {
  id = 'ootmm';
  name = 'OoTMM';
  description = "Ocarina of Time / Majora's Mask Randomizer Tracker";

  private pathfinder!: InstanceType<typeof Pathfinder>;
  private worlds!: World[];
  private baseWorlds!: World[];
  private settings!: Record<string, unknown>;
  private currentItems: Map<unknown, PlayerItem> = new Map();
  private allLocationIds: string[] = [];
  private fixedLocationIds: Set<string> = new Set();
  private hiddenLocationIds: Set<string> = new Set();
  private baseHiddenLocationIds: Set<string> = new Set();
  private preCompletedDungeonIds: Set<string> = new Set();
  private baseWispEvents: Map<number, Map<string, unknown>> = new Map();
  private availableItemIds: Set<string> = new Set();
  private itemMaxCounts: Map<string, number> = new Map();
  private silverRupeeLocationIdsByItemId: Map<string, string[]> = new Map();
  private owlStatueLocationIdsByItemId: Map<string, string[]> = new Map();
  private shopPriceSlotsByLocationId: Map<string, ShopPriceSlot> = new Map();
  private baseShopPricesByLocationId: Map<string, number[]> = new Map();
  private devLocationCatalog: LocationInfo[] = [];
  /** Saved exit expressions for all ER entrances, keyed by entrance key. */
  private savedEntranceExitExprs: Map<string, { from: string; expr: unknown }> =
    new Map();
  /** Saved exit expressions for ER exit-type keys, from the remapped world. */
  private savedExitExitExprs: Map<string, { from: string; expr: unknown }> =
    new Map();
  /** Cached worldData from worldState() to skip expensive rebuilds when only entrance mappings change. */
  private cachedWorldData: WorldData | null = null;
  /** Settings key (excluding plando.entrances) used to validate the worldData cache. */
  private cachedWorldDataSettingsKey: string | null = null;
  /**
   * Number of times initialize() has been called.  The first two calls are
   * the createTracker + attachTracker sequence on every page load; using the
   * cache during that phase causes a stale-pathfinder bug on fresh pages.
   * The cache is only active from the third call onward (entrance dropdown
   * changes via reinitializeForEntrances).
   */
  private initCallCount = 0;
  private readonly debugModeEnabled = isTrackerDebugModeEnabled();

  private debugLog(...args: unknown[]): void {
    if (!this.debugModeEnabled) return;
    console.log(...args);
  }

  async initialize(userSettings: Partial<OoTMMSettings> = {}): Promise<void> {
    this.debugLog('[OoTMM Tracker] Initializing...');
    this.initCallCount++;

    // Merge with defaults
    const ootmmSettings = {
      ...DEFAULT_OOTMM_SETTINGS,
      ...userSettings,
    };
    this.ensureDeterministicClockStart(ootmmSettings);
    this.debugLog('[OoTMM Tracker] Merged settings:', ootmmSettings);

    // Convert to OoTMM settings format
    this.settings = makeSettings(ootmmSettings) as Record<string, unknown>;
    this.debugLog(
      '[OoTMM Tracker] Final settings after makeSettings:',
      this.settings,
    );

    // Build a cache key from the normalized settings (output of makeSettings),
    // excluding plando.entrances which only affect the entrance pass, not the
    // world graph from worldState().  Using makeSettings output ensures both
    // the initial load (reading from localStorage) and the Pinia-hydrated
    // settings produce identical keys for equivalent inputs.
    const settingsForKey = this.settings as Record<string, unknown>;
    const { plando: plandoForKey, ...settingsRestForKey } = settingsForKey;
    const plandoObjForKey =
      plandoForKey && typeof plandoForKey === 'object'
        ? (plandoForKey as Record<string, unknown>)
        : {};
    const { entrances: _entrancesForKey, ...plandoRestForKey } =
      plandoObjForKey;
    const settingsKey = JSON.stringify({
      ...settingsRestForKey,
      ...(Object.keys(plandoRestForKey).length > 0
        ? { plando: plandoRestForKey }
        : {}),
    });

    // Only allow cache reuse from the third call onward.  The first two calls
    // are the createTracker + attachTracker sequence that runs on every page
    // load; using the cache during that phase causes stale-pathfinder issues
    // on fresh pages (empty localStorage).  Subsequent calls come from
    // reinitializeForEntrances (entrance dropdown changes) where caching is
    // safe and provides the main performance benefit.
    const canReuseCache =
      this.initCallCount > 2 &&
      this.cachedWorldData !== null &&
      this.cachedWorldDataSettingsKey === settingsKey;

    let worldData: WorldData;
    if (canReuseCache) {
      this.debugLog(
        '[OoTMM Tracker] Reusing cached world graph (only entrance mappings changed)',
      );
      worldData = this.cachedWorldData!;
      this.baseWorlds = worldData.worlds ?? [];
    } else {
      // Create monitor for progress tracking
      const monitor = new Monitor(
        {
          onLog: (msg: string) => this.debugLog(`[OoTMM] ${msg}`),
          onProgress: (current: number, total: number) => {
            this.debugLog(`[OoTMM] Building world: ${current}/${total}`);
          },
        },
        false,
      );

      const opts = {
        settings: this.settings,
        seed: 'TRACKER_SEED',
        settingsLog: null,
        mode: 'seed' as const,
        cosmetics: {},
        random: {},
      };

      this.debugLog('[OoTMM Tracker] Building world graph...');
      worldData = await worldState(monitor, opts as Record<string, unknown>);
      this.baseWorlds = worldData.worlds ?? [];
      this.normalizeWorldItems(this.baseWorlds);

      // Cache the worldData and settings key for future reuse.
      this.cachedWorldData = worldData;
      this.cachedWorldDataSettingsKey = settingsKey;
    }

    // Run entrance pass to connect games
    this.debugLog('[OoTMM Tracker] Running entrance pass...');
    const plandoEntrances: Record<string, string> =
      ootmmSettings.plando && typeof ootmmSettings.plando === 'object'
        ? (((ootmmSettings.plando as Record<string, unknown>).entrances as
            | Record<string, string>
            | undefined) ?? {})
        : {};

    // When ER is active, use logic: 'none' to prevent random shuffling.
    // Self-map all enabled dungeon entrances to prevent random assignment,
    // then after the entrance pass, disconnect unassigned ones so their
    // checks are unreachable until the user explicitly maps them.
    const activeEntranceKeys = getActiveEntranceKeys(
      this.settings as Record<string, unknown>,
    );
    const isErActive = activeEntranceKeys.size > 0;
    const finalPlandoEntrances = { ...plandoEntrances };
    const unmappedEntrances: string[] = [];
    const selfMappedNoGlobalEntrances: string[] = [];

    if (isErActive) {
      // Self-map every active tracked entrance to prevent random shuffling.
      // Track which ones are NOT user-assigned so we can disconnect them later.
      // Keep special entrances with `no-global` connected while unmapped.
      for (const [key, data] of Object.entries(ENTRANCES_DATA)) {
        if (!activeEntranceKeys.has(key)) continue;
        if (data.from === 'NONE' || data.to === 'NONE') continue;
        if (!finalPlandoEntrances[key]) {
          // Game-link source entrances (OOT_MARKET_FROM_MASK_SHOP, MM_CLOCK_TOWN_FROM_CLOCK_TOWER)
          // are NOT self-mapped.  Their internal exits stay vanilla, and
          // the cross-game connection is handled below via exit-key mapping
          // (matching OoTMM's connectGamesDefault() format).
          // However, they must still be disconnected when unmapped so the
          // pathfinder cannot traverse their vanilla forward edge.
          if (INTERIOR_GAME_LINK_SOURCE_KEYS.has(key)) {
            unmappedEntrances.push(key);
            continue;
          }
          finalPlandoEntrances[key] = key;
          const isNoGlobalEntrance = Boolean(data.flags?.includes('no-global'));
          if (!isNoGlobalEntrance) {
            unmappedEntrances.push(key);
          } else {
            selfMappedNoGlobalEntrances.push(key);
          }
        }
      }

      // Add vanilla game-link exit mappings to preserve the OOT↔MM connection.
      // These use the EXIT keys (type 'none') as plando sources, matching what
      // OoTMM's connectGamesDefault() does: it overrides the overworld-door
      // transitions (e.g. OOT_SHOP_MASKS, MM_CLOCK_TOWER_FROM_CLOCK_TOWN)
      // rather than the interior-exit transitions.
      // Skip mappings whose destination is an unmapped game-link source key:
      // the cross-game edge must not exist until the user explicitly maps it.
      if (ootmmSettings.erIndoorsGameLinks) {
        const unmappedSet = new Set(unmappedEntrances);
        const gamesMode = String(ootmmSettings.games ?? 'ootmm');
        const vanillaExitMapping =
          GAME_LINK_VANILLA_EXIT_MAPPING[gamesMode] ?? {};
        for (const [exitSrc, exitDst] of Object.entries(vanillaExitMapping)) {
          if (!finalPlandoEntrances[exitSrc] && !unmappedSet.has(exitDst)) {
            finalPlandoEntrances[exitSrc] = exitDst;
            selfMappedNoGlobalEntrances.push(exitSrc);
          }
        }
      }

      // `no-global` entrances stay connected by default, but if another
      // entrance is explicitly mapped to that destination, the original source
      // must be disconnected to avoid duplicate access paths.
      // Exclude destinations that come from other selfMapped/vanilla entries
      // (e.g. game-link vanilla cross-mappings referencing each other).
      const selfMappedNoGlobalSet = new Set(selfMappedNoGlobalEntrances);
      const occupiedDestinationKeys = new Set(
        Object.entries(finalPlandoEntrances)
          .filter(
            ([sourceKey, destinationKey]) =>
              sourceKey !== destinationKey &&
              !selfMappedNoGlobalSet.has(sourceKey),
          )
          .map(([, destinationKey]) => destinationKey),
      );
      for (const key of selfMappedNoGlobalEntrances) {
        if (occupiedDestinationKeys.has(key)) {
          unmappedEntrances.push(key);
        }
      }
    }

    const hasPlandoEntrances = Object.keys(finalPlandoEntrances).length > 0;
    const entranceSettings =
      isErActive || hasPlandoEntrances
        ? {
            ...(this.settings as Record<string, unknown>),
            logic: 'none',
            // Disable all ER pool-creating settings so that makePools() returns
            // empty pools.  We handle every dungeon entrance ourselves via plando
            // (self-mapping + user overrides).  Without this, user mappings that
            // cross entrance types (e.g. dungeon → dungeon-ctr) can leave
            // unmatched entries in the pool, causing "Unable to place pools".
            erDungeons: 'none',
            erBoss: 'none',
            erGrottos: 'none',
            erIndoors: 'none',
            erRegions: 'none',
            erOverworld: 'none',
            erWarps: 'none',
            erOneWays: 'none',
            erSpawns: 'none',
            erWallmasters: 'none',
            erMixed: 'none',
            plando: {
              ...(((this.settings as Record<string, unknown>).plando as Record<
                string,
                unknown
              >) ?? {}),
              entrances: finalPlandoEntrances,
            },
          }
        : this.settings;
    const entranceInput = {
      ...(worldData as Record<string, unknown>),
      startingItems: new Map(),
      settings: entranceSettings,
    };

    const entrancePass = new LogicPassEntrances(
      entranceInput as Record<string, unknown>,
    );

    // Save the original source-side exit expressions for all tracked ER
    // entrances before the entrance pass rewires exits to their mapped
    // destinations.  Reachability in the UI should answer "can I stand at
    // this entrance and enter it from the source side?"; using the mapped
    // destination exit can accidentally pick up destination-specific global
    // access expressions for grottos.
    this.savedEntranceExitExprs = new Map();
    if (isErActive) {
      for (const world of this.baseWorlds) {
        const areas = (world as Record<string, unknown>).areas as Record<
          string,
          { exits?: Record<string, unknown> }
        >;
        for (const [key, data] of Object.entries(ENTRANCES_DATA)) {
          if (!activeEntranceKeys.has(key)) continue;
          if (data.from === 'NONE' || data.to === 'NONE') continue;

          const fromArea = areas[data.from];
          const exitExpr = fromArea?.exits?.[data.to];
          if (exitExpr) {
            this.savedEntranceExitExprs.set(key, {
              from: data.from,
              expr: exitExpr,
            });
          }
        }
        // Only need to save from the first world (single-player tracker)
        break;
      }
    }

    const entranceResult = entrancePass.run();
    this.worlds = entranceResult.worlds;

    // Save exit expressions for tracked exit-type keys from the remapped
    // world graph.  These are used to compute exit reachability in the UI.
    // IMPORTANT: This must happen BEFORE disconnecting unmapped entrances,
    // otherwise the exit edges (e.g. Link's House -> Kokiri Forest) are
    // already deleted and the expressions can't be captured.
    this.savedExitExitExprs = new Map();
    if (isErActive) {
      for (const world of this.worlds) {
        const areas = (world as Record<string, unknown>).areas as Record<
          string,
          { exits?: Record<string, unknown> }
        >;
        for (const [key, data] of Object.entries(ENTRANCES_DATA)) {
          if (!isTrackedEntranceExitType(data.type, key)) continue;
          if (data.from === 'NONE' || data.to === 'NONE') continue;
          // Only save exits whose source entrance is active
          const sourceKey = data.reverse?.trim();
          if (!sourceKey || !activeEntranceKeys.has(sourceKey)) continue;

          const fromArea = areas[data.from];
          const exitExpr = fromArea?.exits?.[data.to];
          if (exitExpr) {
            this.savedExitExitExprs.set(key, {
              from: data.from,
              expr: exitExpr,
            });
          }
        }
        break;
      }
    }

    // Disconnect unmapped tracked entrances so their checks are unreachable.
    // We self-mapped them above to prevent random shuffling, but now we remove
    // the exit connections so the pathfinder can't reach them.
    if (unmappedEntrances.length > 0) {
      const retainedMappedExitPairs = new Set<string>();
      const unmappedEntranceSet = new Set(unmappedEntrances);

      for (const [sourceKey, destinationKey] of Object.entries(
        finalPlandoEntrances,
      )) {
        if (unmappedEntranceSet.has(sourceKey)) continue;

        const sourceData = ENTRANCES_DATA[sourceKey];
        const destinationData = ENTRANCES_DATA[destinationKey];
        if (!sourceData || !destinationData) continue;
        if (sourceData.from === 'NONE' || destinationData.to === 'NONE') {
          continue;
        }

        // Forward edge: source area -> destination area
        retainedMappedExitPairs.add(
          `${sourceData.from}=>${destinationData.to}`,
        );

        // Reverse edge: the entrance pass also wires the exit from
        // the destination interior back to the source exterior.
        if (destinationData.reverse && sourceData.reverse) {
          const destRev = ENTRANCES_DATA[destinationData.reverse];
          const srcRev = ENTRANCES_DATA[sourceData.reverse];
          if (
            destRev &&
            srcRev &&
            destRev.from !== 'NONE' &&
            srcRev.to !== 'NONE'
          ) {
            retainedMappedExitPairs.add(`${destRev.from}=>${srcRev.to}`);
          }
        }
      }

      for (const world of this.worlds) {
        const areas = (world as Record<string, unknown>).areas as Record<
          string,
          { exits?: Record<string, unknown> }
        >;

        for (const key of unmappedEntrances) {
          const data = ENTRANCES_DATA[key];
          if (!data) continue;

          // Disconnect the source-side edge (e.g. Kokiri Forest -> Link's House)
          const exitPairKey = `${data.from}=>${data.to}`;
          if (!retainedMappedExitPairs.has(exitPairKey)) {
            const fromArea = areas[data.from];
            if (fromArea?.exits && data.to in fromArea.exits) {
              delete fromArea.exits[data.to];
            }
          }

          // Also disconnect the reverse/exit-side edge
          // (e.g. Link's House -> Kokiri Forest).
          // Exit-type entrances are not in activeEntranceKeys so they
          // would otherwise survive, leaving a stale connection.
          if (data.reverse) {
            const reverseData = ENTRANCES_DATA[data.reverse];
            if (reverseData) {
              const revExitPairKey = `${reverseData.from}=>${reverseData.to}`;
              if (!retainedMappedExitPairs.has(revExitPairKey)) {
                const revFromArea = areas[reverseData.from];
                if (revFromArea?.exits && reverseData.to in revFromArea.exits) {
                  delete revFromArea.exits[reverseData.to];
                }
              }
            }
          }
        }
      }
    }

    this.normalizeWorldItems(this.worlds);
    this.applyAlwaysIncludedFishingPondConditions(this.worlds);

    // Mirror configured starting items into pathfinder state.
    this.pathfinder = new Pathfinder(
      this.worlds,
      this.settings,
      this.buildPathfinderStartingItems(),
    );

    // Cache all location IDs
    this.allLocationIds = this.worlds.flatMap((world, worldId) =>
      Object.keys(world.checks).map((loc) => makeLocation(loc, worldId)),
    );
    this.fixedLocationIds = this.buildFixedLocationIds(
      worldData?.fixedLocations as Set<string> | undefined,
    );
    this.baseHiddenLocationIds = this.buildBaseHiddenLocationIds();
    this.hiddenLocationIds = new Set(this.baseHiddenLocationIds);
    this.preCompletedDungeonIds.clear();
    this.baseWispEvents.clear();
    this.availableItemIds = this.buildAvailableItemIds(
      worldData?.allItems as Map<unknown, number> | undefined,
    );
    this.itemMaxCounts = this.buildItemMaxCounts(
      worldData?.allItems as Map<unknown, number> | undefined,
      worldData?.startingItems as Map<unknown, number> | undefined,
    );
    this.silverRupeeLocationIdsByItemId = this.buildSilverRupeeLocationIndex(
      this.worlds,
    );
    this.owlStatueLocationIdsByItemId = this.buildOwlStatueLocationIndex(
      this.worlds,
    );
    const shopPriceIndex = this.buildShopPriceIndex(this.worlds);
    this.shopPriceSlotsByLocationId = shopPriceIndex.slotsByLocationId;
    this.baseShopPricesByLocationId = shopPriceIndex.basePricesByLocationId;
    this.devLocationCatalog = this.buildCodeSearchLocationCatalog();

    this.debugLog(
      `[OoTMM Tracker] Initialized with ${this.allLocationIds.length} locations`,
    );
  }

  checkReachability(inventory: Map<string, number>): TrackerCheckResult {
    try {
      this.debugLog(
        '[OoTMM Tracker] checkReachability called with inventory:',
        JSON.stringify(Array.from(inventory.entries())),
      );
    } catch (e) {
      this.debugLog(
        '[OoTMM Tracker] checkReachability called with inventory: (could not stringify) ',
        Array.from(inventory.entries()),
      );
      this.debugLog('[OoTMM Tracker] Inventory stringify error:', e);
    }
    const {
      state,
      reachableLocationIds,
      newLocationIds,
      silverRupeeCounts,
      owlStatueCounts,
    } = this.computeStableReachabilityState(inventory);

    this.debugLog('[OoTMM Tracker] State after pathfinder:', {
      locations: state.locations.size,
      goal: state.goal,
      started: state.started,
    });

    this.debugLog(
      '[OoTMM Tracker] Pathfinder result: reachable =',
      reachableLocationIds.length,
      'new =',
      newLocationIds.length,
    );

    const isVanillaSilverRupees = this.isVanillaSilverRupeeShuffle();
    const isVanillaOwls = this.isVanillaOwlShuffle();

    const extra: Record<string, unknown> = {
      canReachBosses: state.ganonMajora,
      gossipStones: Array.isArray(state.gossips)
        ? state.gossips.reduce(
            (count: number, worldGossips: Set<string>) =>
              count + worldGossips.size,
            0,
          )
        : 0,
    };

    if (isVanillaSilverRupees) {
      extra.vanillaSilverRupeeCounts = this.countMapToRecord(silverRupeeCounts);
    }

    if (isVanillaOwls) {
      extra.vanillaOwlStatueCounts = this.countMapToRecord(owlStatueCounts);
    }

    // Compute which ER entrances are reachable (can be entered).
    if (this.savedEntranceExitExprs.size > 0) {
      extra.reachableEntranceIds = this.computeReachableEntrances(state);
    }

    return {
      reachableLocationIds,
      newLocationIds,
      canComplete: state.goal,
      extra,
    };
  }

  traceLocationPath(
    checkId: string,
    inventory: Map<string, number>,
  ): TrackerLocationTraceResult {
    const locationInfo = this.buildLocations(true).find(
      (location) => location.id === checkId,
    );
    const parsedLocationId = this.parseLocationId(checkId);
    if (!parsedLocationId) {
      return {
        checkId,
        checkName: locationInfo?.name ?? checkId,
        reachable: false,
        totalReachableLocations: 0,
        checkAreaNames: [],
        areaPath: null,
        message: 'The selected check could not be resolved.',
      };
    }

    const { locationName, worldId } = parsedLocationId;
    const world = this.worlds[worldId];
    if (!world) {
      return {
        checkId,
        checkName: locationInfo?.name ?? locationName,
        reachable: false,
        totalReachableLocations: 0,
        checkAreaNames: [],
        areaPath: null,
        message: 'The selected check does not belong to an active world.',
      };
    }

    const { state, reachableLocationIds, traceParents } =
      this.computeTraceReachabilityState(inventory);
    const checkAreaNames = this.findCheckAreas(world, locationName);
    const reachable = reachableLocationIds.includes(checkId);

    if (!reachable) {
      return {
        checkId,
        checkName: locationInfo?.name ?? locationName,
        reachable: false,
        totalReachableLocations: reachableLocationIds.length,
        checkAreaNames,
        areaPath: null,
        message: 'This check is unreachable with the current tracker state.',
      };
    }

    if (checkAreaNames.length === 0) {
      return {
        checkId,
        checkName: locationInfo?.name ?? locationName,
        reachable: true,
        totalReachableLocations: reachableLocationIds.length,
        checkAreaNames: [],
        areaPath: null,
        message:
          'The check is reachable, but its containing area could not be resolved.',
      };
    }

    const reachableTargetAreaKeys = this.findReachableTraceTargetKeys(
      state,
      worldId,
      checkAreaNames,
    );
    if (reachableTargetAreaKeys.length === 0) {
      return {
        checkId,
        checkName: locationInfo?.name ?? locationName,
        reachable: true,
        totalReachableLocations: reachableLocationIds.length,
        checkAreaNames,
        areaPath: null,
        message:
          'The check is reachable, but no matching reachable area copy was found.',
      };
    }

    const areaPath = this.reconstructTraceAreaPath(
      traceParents,
      reachableTargetAreaKeys,
    );

    return {
      checkId,
      checkName: locationInfo?.name ?? locationName,
      reachable: true,
      totalReachableLocations: reachableLocationIds.length,
      checkAreaNames,
      areaPath,
      message:
        areaPath !== null
          ? null
          : 'The check is reachable, but the area path could not be reconstructed.',
    };
  }

  getAllLocations(): LocationInfo[] {
    return this.buildLocations(false);
  }

  getAllLocationsForCodeSearch(): LocationInfo[] {
    const byId = new Map<string, LocationInfo>();
    this.buildLocations(true).forEach((location) =>
      byId.set(location.id, location),
    );
    this.devLocationCatalog.forEach((location) => {
      if (!byId.has(location.id)) {
        byId.set(location.id, location);
      }
    });
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  private computeStableReachabilityState(
    inventory: Map<string, number>,
  ): StableReachabilityState {
    const isVanillaSilverRupees = this.isVanillaSilverRupeeShuffle();
    const isVanillaOwls = this.isVanillaOwlShuffle();
    const baseInventory = this.stripAutoTrackedInventoryItems(
      inventory,
      isVanillaSilverRupees,
      isVanillaOwls,
    );

    let assumedInventory = baseInventory;
    let state: PathfinderState | null = null;
    let reachableLocationIds: string[] = [];
    let newLocationIds: string[] = [];
    let silverRupeeCounts = new Map<string, number>();
    let owlStatueCounts = new Map<string, number>();
    let iterations = 0;

    while (true) {
      const result = this.runPathfinder(assumedInventory);
      state = result.state;
      reachableLocationIds = result.reachableLocationIds;
      newLocationIds = result.newLocationIds;

      if (
        (!isVanillaSilverRupees ||
          this.silverRupeeLocationIdsByItemId.size === 0) &&
        (!isVanillaOwls || this.owlStatueLocationIdsByItemId.size === 0)
      ) {
        break;
      }

      const nextSilverRupeeCounts = isVanillaSilverRupees
        ? this.computeVanillaSilverRupeeCounts(reachableLocationIds)
        : new Map<string, number>();
      const nextOwlStatueCounts = isVanillaOwls
        ? this.computeVanillaOwlStatueCounts(reachableLocationIds)
        : new Map<string, number>();

      if (
        this.areCountMapsEqual(nextSilverRupeeCounts, silverRupeeCounts) &&
        this.areCountMapsEqual(nextOwlStatueCounts, owlStatueCounts)
      ) {
        silverRupeeCounts = nextSilverRupeeCounts;
        owlStatueCounts = nextOwlStatueCounts;
        break;
      }

      silverRupeeCounts = nextSilverRupeeCounts;
      owlStatueCounts = nextOwlStatueCounts;
      assumedInventory = this.mergeInventoryWithCounts(
        baseInventory,
        this.mergeCountMaps(silverRupeeCounts, owlStatueCounts),
      );
      iterations += 1;
      if (iterations >= 10) {
        console.warn(
          '[OoTMM Tracker] Auto-tracked vanilla item reachability did not stabilize after 10 iterations',
        );
        break;
      }
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!');
      throw new Error('Pathfinder returned undefined');
    }

    return {
      state,
      reachableLocationIds,
      newLocationIds,
      silverRupeeCounts,
      owlStatueCounts,
    };
  }

  private computeTraceReachabilityState(
    inventory: Map<string, number>,
  ): TraceReachabilityState {
    const isVanillaSilverRupees = this.isVanillaSilverRupeeShuffle();
    const isVanillaOwls = this.isVanillaOwlShuffle();
    const baseInventory = this.stripAutoTrackedInventoryItems(
      inventory,
      isVanillaSilverRupees,
      isVanillaOwls,
    );

    let assumedInventory = baseInventory;
    let traceState: TraceReachabilityState | null = null;
    let silverRupeeCounts = new Map<string, number>();
    let owlStatueCounts = new Map<string, number>();
    let iterations = 0;

    while (true) {
      traceState = this.runTracePathfinder(assumedInventory);

      if (
        (!isVanillaSilverRupees ||
          this.silverRupeeLocationIdsByItemId.size === 0) &&
        (!isVanillaOwls || this.owlStatueLocationIdsByItemId.size === 0)
      ) {
        break;
      }

      const nextSilverRupeeCounts = isVanillaSilverRupees
        ? this.computeVanillaSilverRupeeCounts(traceState.reachableLocationIds)
        : new Map<string, number>();
      const nextOwlStatueCounts = isVanillaOwls
        ? this.computeVanillaOwlStatueCounts(traceState.reachableLocationIds)
        : new Map<string, number>();

      if (
        this.areCountMapsEqual(nextSilverRupeeCounts, silverRupeeCounts) &&
        this.areCountMapsEqual(nextOwlStatueCounts, owlStatueCounts)
      ) {
        break;
      }

      silverRupeeCounts = nextSilverRupeeCounts;
      owlStatueCounts = nextOwlStatueCounts;
      assumedInventory = this.mergeInventoryWithCounts(
        baseInventory,
        this.mergeCountMaps(silverRupeeCounts, owlStatueCounts),
      );
      iterations += 1;
      if (iterations >= 10) {
        console.warn(
          '[OoTMM Tracker] Trace pathfinder did not stabilize after 10 iterations',
        );
        break;
      }
    }

    if (!traceState) {
      console.error('[OoTMM Tracker] Trace pathfinder returned undefined!');
      throw new Error('Trace pathfinder returned undefined');
    }

    return traceState;
  }

  private buildLocations(includeHidden: boolean): LocationInfo[] {
    const worldsForLocations =
      this.baseWorlds.length > 0 ? this.baseWorlds : this.worlds;
    return this.buildLocationsFromWorlds(worldsForLocations, includeHidden);
  }

  private applyAlwaysIncludedFishingPondConditions(worlds: World[]): void {
    if (!worlds || worlds.length === 0 || !exprHas || !exprOr || !exprAnd)
      return;
    if (!this.isFishingPondShuffleEnabled()) return;

    const childFallbackIds = [
      'OOT_FISHING_POND_CHILD_FISH_13LBS',
      'OOT_FISHING_POND_CHILD_LOACH_14LBS',
    ];
    const adultFallbackIds = [
      'OOT_FISHING_POND_ADULT_FISH_8LBS',
      'OOT_FISHING_POND_ADULT_LOACH_29LBS',
    ];

    const toExprs = (itemIds: string[]) =>
      itemIds
        .map((itemId) => {
          const item =
            (Items as Record<string, unknown>)?.[itemId] ||
            (() => {
              try {
                return itemByID ? itemByID(itemId) : undefined;
              } catch {
                return undefined;
              }
            })();
          return item ? exprHas(item as never, 1) : null;
        })
        .filter((expr): expr is NonNullable<typeof expr> => Boolean(expr));

    const childExtraExprs = toExprs(childFallbackIds);
    const adultExtraExprs = toExprs(adultFallbackIds);
    if (childExtraExprs.length === 0 && adultExtraExprs.length === 0) return;

    const exprContainsItemPrefix = (
      expr: unknown,
      itemPrefix: string,
    ): boolean => {
      if (!expr || typeof expr !== 'object') return false;
      const key = (expr as { key?: unknown }).key;
      if (typeof key === 'string' && key.includes(`HAS(${itemPrefix}`)) {
        return true;
      }
      const subExprs = (expr as { exprs?: unknown[] }).exprs;
      if (!Array.isArray(subExprs)) return false;
      return subExprs.some((subExpr) =>
        exprContainsItemPrefix(subExpr, itemPrefix),
      );
    };

    const patchFishRequirement = (
      expr: unknown,
      itemPrefix: string,
      extraExprs: unknown[],
    ): unknown => {
      if (!expr || extraExprs.length === 0) return expr;
      const isAnd =
        (expr as { constructor?: { name?: string } }).constructor?.name ===
        'ExprAnd';
      const andExprs = (expr as { exprs?: unknown[] }).exprs;
      if (!isAnd || !Array.isArray(andExprs) || andExprs.length === 0) {
        return expr;
      }

      const fishExprIndex = andExprs.findIndex((subExpr) =>
        exprContainsItemPrefix(subExpr, itemPrefix),
      );
      if (fishExprIndex < 0) {
        return expr;
      }

      const nextAndExprs = [...andExprs];
      nextAndExprs[fishExprIndex] = exprOr([
        nextAndExprs[fishExprIndex] as never,
        ...extraExprs,
      ]) as never;
      return exprAnd(nextAndExprs as never[]);
    };

    for (const world of worlds) {
      const area = world.areas?.['OOT Fishing Pond'];
      const locations = area?.locations;
      if (!locations) continue;

      const childKey = 'OOT Fishing Pond Child';
      const adultKey = 'OOT Fishing Pond Adult';
      const childExpr = locations[childKey];
      const adultExpr = locations[adultKey];

      if (childExpr && childExtraExprs.length > 0) {
        locations[childKey] = patchFishRequirement(
          childExpr,
          'OOT_FISHING_POND_CHILD_',
          childExtraExprs,
        ) as never;
      }
      if (adultExpr && adultExtraExprs.length > 0) {
        locations[adultKey] = patchFishRequirement(
          adultExpr,
          'OOT_FISHING_POND_ADULT_',
          adultExtraExprs,
        ) as never;
      }
    }
  }

  private buildLocationsFromWorlds(
    worlds: World[],
    includeHidden: boolean,
  ): LocationInfo[] {
    const locations: LocationInfo[] = [];
    for (const [worldId, world] of worlds.entries()) {
      const dungeonLocations = this.buildDungeonLocationIds(world);
      for (const locId of Object.keys(world.checks)) {
        const fullId = makeLocation(locId, worldId);
        if (!includeHidden && this.hiddenLocationIds.has(fullId)) continue;
        const check = world.checks?.[locId];
        const itemId = (check as { item?: { id?: string } })?.item?.id;
        const isSkulltulaToken =
          itemId === 'OOT_GS_TOKEN' ||
          itemId === 'MM_GS_TOKEN_SWAMP' ||
          itemId === 'MM_GS_TOKEN_OCEAN';
        const isStrayFairy =
          typeof itemId === 'string' &&
          itemId.startsWith('MM_STRAY_FAIRY_') &&
          itemId !== 'MM_STRAY_FAIRY_TOWN';
        const shuffled = this.computeIsShuffled(
          world,
          locId,
          fullId,
          check,
          dungeonLocations,
        );
        const showWhenUnshuffled = this.shouldShowVanillaKeyLocation(itemId);
        locations.push({
          id: fullId,
          name: locId,
          category: this.categorizeLocation(check),
          area: this.getAreaFromLocation(locId),
          isSkulltulaToken,
          isStrayFairy,
          isShuffled: shuffled,
          showWhenUnshuffled,
        });
      }

      for (const gossipName of Object.keys(
        (world as { gossip?: Record<string, unknown> }).gossip ?? {},
      )) {
        const fullId = makeLocation(gossipName, worldId);
        if (!includeHidden && this.hiddenLocationIds.has(fullId)) continue;
        locations.push({
          id: fullId,
          name: gossipName,
          category: 'Gossip Stone',
          area: this.getAreaFromGossipName(gossipName),
          isGossipStone: true,
          isShuffled: true,
        });
      }
    }
    return locations;
  }

  private buildCodeSearchLocationCatalog(): LocationInfo[] {
    const byId = new Map<string, LocationInfo>();
    for (const entry of LOCATION_CODE_CATALOG) {
      if (!entry.id) continue;
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name || entry.id,
        category: entry.category || 'None',
        area: entry.area || this.getAreaFromLocation(entry.name || entry.id),
        isSkulltulaToken: entry.isSkulltulaToken,
        isStrayFairy: entry.isStrayFairy,
      });
    }
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  getSettings(): Record<string, unknown> {
    return this.settings;
  }

  getAvailableItemIds(): Set<string> {
    return new Set(this.availableItemIds);
  }

  getItemMaxCounts(): Map<string, number> {
    return new Map(this.itemMaxCounts);
  }

  reset(): void {
    this.currentItems.clear();
  }

  setPreCompletedDungeons(dungeons: string[]): void {
    if (!this.worlds || !this.settings) return;
    const next = new Set(
      dungeons.filter((id) => PRECOMPLETED_MAJOR_DUNGEONS.has(id)),
    );
    this.preCompletedDungeonIds = next;

    for (const world of this.worlds) {
      world.preCompleted = new Set(next);
    }

    this.updatePreCompletedLocations();
    this.applyPreCompletedWispEvents();
    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map());
  }

  getPreCompletedLocationIds(): string[] {
    if (
      !this.worlds ||
      this.worlds.length === 0 ||
      this.preCompletedDungeonIds.size === 0
    ) {
      return [];
    }
    return Array.from(this.collectPreCompletedLocationIds());
  }

  setSongEvents(events: Record<string, number>): void {
    if (!this.worlds || !this.settings) return;

    for (const world of this.worlds) {
      // Start with vanilla defaults from OoTMM core
      world.songEvents = [...VANILLA_SONG_EVENTS];

      // If Song Events Shuffle is enabled, apply user selections
      if (Object.keys(events).length > 0) {
        for (const [eventKey, songId] of Object.entries(events)) {
          const eventId = parseInt(eventKey, 10);
          if (
            !isNaN(eventId) &&
            songId >= 0 &&
            songId <= 5 &&
            eventId >= 0 &&
            eventId < world.songEvents.length
          ) {
            world.songEvents[eventId] = songId;
          }
        }
      }
    }

    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map());
  }

  getShopPrices(): Record<string, number> {
    const prices: Record<string, number> = {};
    if (!this.worlds || this.shopPriceSlotsByLocationId.size === 0)
      return prices;

    for (const [
      locationId,
      slotData,
    ] of this.shopPriceSlotsByLocationId.entries()) {
      const world = this.worlds[slotData.worldId];
      const slot = slotData.slots[0];
      const value =
        typeof slot === 'number' ? world?.prices?.[slot] : undefined;
      if (typeof value === 'number' && Number.isFinite(value)) {
        prices[locationId] = value;
      }
    }

    return prices;
  }

  setShopPrices(pricesByLocation: Record<string, number>): void {
    if (
      !this.worlds ||
      !this.settings ||
      this.shopPriceSlotsByLocationId.size === 0
    )
      return;

    for (const [
      locationId,
      slotData,
    ] of this.shopPriceSlotsByLocationId.entries()) {
      const base = this.baseShopPricesByLocationId.get(locationId);
      if (!Array.isArray(base) || base.length !== slotData.slots.length)
        continue;
      const world = this.worlds[slotData.worldId];
      if (!world?.prices) continue;
      for (let i = 0; i < slotData.slots.length; i += 1) {
        const slot = slotData.slots[i];
        const value = base[i];
        if (!Number.isFinite(value) || slot < 0 || slot >= world.prices.length)
          continue;
        world.prices[slot] = value;
      }
    }

    for (const world of this.worlds) {
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_OOT_SHOPS,
        PRICE_COUNT_OOT_SHOPS,
        String(
          (this.settings as { priceOotShops?: unknown }).priceOotShops ?? '',
        ),
      );
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_OOT_SCRUBS,
        PRICE_COUNT_OOT_SCRUBS,
        String(
          (this.settings as { priceOotScrubs?: unknown }).priceOotScrubs ?? '',
        ),
      );
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_OOT_MERCHANTS,
        PRICE_COUNT_OOT_MERCHANTS,
        String(
          (this.settings as { priceOotMerchants?: unknown })
            .priceOotMerchants ?? '',
        ),
      );
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_MM_SHOPS,
        PRICE_COUNT_MM_SHOPS,
        String(
          (this.settings as { priceMmShops?: unknown }).priceMmShops ?? '',
        ),
      );
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_MM_SHOPS_EX,
        PRICE_COUNT_MM_SHOPS_EX,
        String(
          (this.settings as { priceMmShops?: unknown }).priceMmShops ?? '',
        ),
      );
      this.applyAffordableModeToRange(
        world,
        PRICE_RANGE_MM_TINGLE,
        PRICE_COUNT_MM_TINGLE,
        String(
          (this.settings as { priceMmTingle?: unknown }).priceMmTingle ?? '',
        ),
      );
    }

    for (const [locationId, rawValue] of Object.entries(pricesByLocation)) {
      const slotData = this.shopPriceSlotsByLocationId.get(locationId);
      if (!slotData) continue;
      if (!this.isShopPriceEditableForLocation(slotData)) continue;

      const safeValue = Math.max(0, Math.floor(Number(rawValue)));
      if (!Number.isFinite(safeValue)) continue;

      const world = this.worlds[slotData.worldId];
      if (!world?.prices) continue;
      for (const slot of slotData.slots) {
        if (slot < 0 || slot >= world.prices.length) continue;
        world.prices[slot] = safeValue;
      }
    }

    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map());
  }

  setSpecialConds(patch: Record<string, unknown>): void {
    if (!this.worlds || !this.settings || !mergeSettings) return;
    this.settings = mergeSettings(this.settings, {
      specialConds: patch,
    } as Record<string, unknown>);
    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map());
  }

  // Helper methods
  private categorizeLocation(check?: unknown): string {
    if ((check as { type?: unknown })?.type)
      return String((check as { type?: unknown }).type);
    return 'None';
  }

  private computeIsShuffled(
    world: World,
    locId: string,
    fullId: string,
    check: unknown,
    dungeonLocations: Set<string>,
  ): boolean {
    if (this.fixedLocationIds.has(fullId)) return false;
    const base = isShuffled
      ? Boolean(isShuffled(this.settings, world, locId, dungeonLocations))
      : true;
    const itemId = (check as { item?: { id?: string } })?.item?.id;
    if (!itemId) return base;

    if (itemId === 'OOT_GS_TOKEN') {
      const mode = String(
        (this.settings as { goldSkulltulaTokens?: unknown })
          .goldSkulltulaTokens ?? '',
      );
      if (mode === 'none') return false;
      const isDungeon = dungeonLocations.has(locId);
      if (mode === 'overworld' && isDungeon) return false;
      if (mode === 'dungeons' && !isDungeon) return false;
      return true;
    }

    if (itemId === 'MM_GS_TOKEN_SWAMP' || itemId === 'MM_GS_TOKEN_OCEAN') {
      const mode = String(
        (this.settings as { housesSkulltulaTokens?: unknown })
          .housesSkulltulaTokens ?? '',
      );
      if (mode === 'none') return false;
      return true;
    }

    if (itemId === 'MM_STRAY_FAIRY_TOWN') {
      const mode = String(
        (this.settings as { townFairyShuffle?: unknown }).townFairyShuffle ??
          '',
      );
      if (mode === 'vanilla') return false;
      return true;
    }

    return base;
  }

  private shouldShowVanillaKeyLocation(itemId?: string): boolean {
    if (!itemId) return false;
    if (itemId === 'OOT_SMALL_KEY_TCG') return false;
    const smallKeySetting = this.getSmallKeyShuffleSetting(itemId);
    if (smallKeySetting === 'vanilla') return true;
    const bossKeySetting = this.getBossKeyShuffleSetting(itemId);
    if (bossKeySetting === 'vanilla') return true;
    return false;
  }

  private getSmallKeyShuffleSetting(itemId: string): string | null {
    const settings = this.settings as {
      smallKeyShuffleOot?: unknown;
      smallKeyShuffleMm?: unknown;
      smallKeyShuffleHideout?: unknown;
      smallKeyShuffleChestGame?: unknown;
    };
    if (itemId === 'OOT_SMALL_KEY_TCG') {
      return String(settings.smallKeyShuffleChestGame ?? '');
    }
    if (itemId === 'OOT_SMALL_KEY_GF') {
      return String(settings.smallKeyShuffleHideout ?? '');
    }
    if (
      itemId.startsWith('OOT_SMALL_KEY_') ||
      itemId === 'OOT_SMALL_KEY' ||
      itemId === 'OOT_TC_SMALL_KEY'
    ) {
      return String(settings.smallKeyShuffleOot ?? '');
    }
    if (itemId.startsWith('MM_SMALL_KEY_') || itemId === 'MM_SMALL_KEY') {
      return String(settings.smallKeyShuffleMm ?? '');
    }
    return null;
  }

  private getBossKeyShuffleSetting(itemId: string): string | null {
    const settings = this.settings as {
      bossKeyShuffleOot?: unknown;
      bossKeyShuffleMm?: unknown;
      ganonBossKey?: unknown;
    };
    if (itemId === 'OOT_BOSS_KEY_GANON') {
      return String(settings.ganonBossKey ?? '');
    }
    if (itemId.startsWith('OOT_BOSS_KEY_') || itemId === 'OOT_BOSS_KEY') {
      return String(settings.bossKeyShuffleOot ?? '');
    }
    if (itemId.startsWith('MM_BOSS_KEY_') || itemId === 'MM_BOSS_KEY') {
      return String(settings.bossKeyShuffleMm ?? '');
    }
    return null;
  }

  private getAreaFromLocation(locId: string): string {
    // Extract area from location ID (e.g., "OOT Kokiri Forest" -> "Kokiri Forest")
    const parts = locId.split(' ');
    if (parts.length > 1) {
      return parts.slice(1).join(' ');
    }
    return locId;
  }

  private getAreaFromGossipName(locId: string): string {
    const trimmed = locId.trim();
    const prefixMatch = trimmed.match(/^(OOT|MM)\s+(.+)$/);
    const withoutGamePrefix = prefixMatch ? prefixMatch[2] : trimmed;
    const gossipIndex = withoutGamePrefix.indexOf(' Gossip');
    if (gossipIndex > 0) {
      return withoutGamePrefix.slice(0, gossipIndex);
    }
    return this.getAreaFromLocation(locId);
  }

  private buildFixedLocationIds(fixedLocations?: Set<string>): Set<string> {
    const fixed = new Set<string>();
    if (!fixedLocations) return fixed;
    for (const loc of fixedLocations) {
      fixed.add(String(loc));
    }
    return fixed;
  }

  private buildDungeonLocationIds(world: World): Set<string> {
    const dungeonLocations = new Set<string>();
    const dungeons = world.dungeons;
    if (!dungeons) return dungeonLocations;
    for (const locs of Object.values(dungeons)) {
      if (!locs) continue;
      for (const loc of locs) {
        dungeonLocations.add(String(loc));
      }
    }
    return dungeonLocations;
  }

  private buildBaseHiddenLocationIds(): Set<string> {
    const hidden = new Set<string>();
    if (!this.worlds || this.worlds.length === 0) return hidden;

    const settings = this.settings as {
      skipZelda?: unknown;
      shuffleWonderItemsOot?: unknown;
    };
    const hideZeldaLocations = Boolean(settings.skipZelda);
    const wonderItemsSetting = String(settings.shuffleWonderItemsOot ?? '');
    const hideCourtyardWonderItem =
      hideZeldaLocations &&
      wonderItemsSetting !== '' &&
      wonderItemsSetting !== 'none';

    if (!hideZeldaLocations && !hideCourtyardWonderItem) return hidden;

    const locationNames: string[] = [];
    if (hideZeldaLocations) {
      locationNames.push("OOT Zelda's Letter", "OOT Zelda's Song");
    }
    if (hideCourtyardWonderItem) {
      locationNames.push('OOT Castle Courtyard Wonder Item');
    }

    for (let worldId = 0; worldId < this.worlds.length; worldId += 1) {
      for (const locationName of locationNames) {
        hidden.add(makeLocation(locationName, worldId));
      }
    }

    return hidden;
  }

  private updatePreCompletedLocations(): void {
    this.hiddenLocationIds = new Set(this.baseHiddenLocationIds);
  }

  private collectPreCompletedLocationIds(): Set<string> {
    const expanded = new Set(this.preCompletedDungeonIds);
    if (expanded.has('ST')) {
      expanded.add('IST');
    }

    const dungeonLocs = new Set<string>();
    for (const [worldId, world] of this.worlds.entries()) {
      for (const dungeonId of expanded) {
        const locNames = world.dungeons?.[dungeonId];
        if (!locNames) continue;
        for (const locName of locNames) {
          dungeonLocs.add(makeLocation(locName, worldId));
        }
      }
    }
    return dungeonLocs;
  }

  private applyPreCompletedWispEvents(): void {
    const shouldApply =
      Boolean(this.settings?.preCompletedDungeons) &&
      this.settings?.regionState === 'dungeonBeaten';

    const expanded = new Set(this.preCompletedDungeonIds);
    if (expanded.has('ST')) {
      expanded.add('IST');
    }

    for (const [worldId, world] of this.worlds.entries()) {
      const spawnArea = world.areas?.['OOT SPAWN'];
      if (!spawnArea) continue;

      let base = this.baseWispEvents.get(worldId);
      if (!base) {
        base = new Map();
        this.baseWispEvents.set(worldId, base);
      }

      for (const [dungeonId, eventName] of Object.entries(PRECOMPLETED_WISPS)) {
        if (!base.has(eventName)) {
          base.set(eventName, spawnArea.events?.[eventName] ?? null);
        }

        if (shouldApply && expanded.has(dungeonId)) {
          if (spawnArea.events) spawnArea.events[eventName] = exprTrue();
          continue;
        }

        const original = base.get(eventName);
        if (original === null || original === undefined) {
          if (spawnArea.events) delete spawnArea.events[eventName];
        } else {
          if (spawnArea.events) spawnArea.events[eventName] = original;
        }
      }
    }
  }

  private buildAvailableItemIds(allItems?: Map<unknown, number>): Set<string> {
    const available = new Set<string>();
    if (!allItems) return available;
    const chestGameShuffle = String(
      (this.settings as { smallKeyShuffleChestGame?: unknown })
        ?.smallKeyShuffleChestGame ?? '',
    );
    const hideVanillaSilverRupees = this.isVanillaSilverRupeeShuffle();
    const hideOwlStatues =
      String((this.settings as { owlShuffle?: unknown })?.owlShuffle ?? '') ===
      'none';
    for (const [playerItem, count] of allItems) {
      if (!count || count <= 0) continue;
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id;
      if (itemId) {
        if (hideVanillaSilverRupees && this.isVanillaSilverRupeeItemId(itemId))
          continue;
        if (itemId === 'OOT_SMALL_KEY_TCG' && chestGameShuffle === 'vanilla')
          continue;
        if (hideOwlStatues && this.isOwlStatueItemId(itemId)) continue;
        available.add(itemId);
      }
    }

    for (const itemId of FISHING_POND_ALWAYS_INCLUDED_ITEM_IDS) {
      if (this.shouldForceIncludeItem(itemId)) {
        available.add(itemId);
      }
    }

    for (const itemId of BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_OOT_MM) {
      if (this.shouldForceIncludeItem(itemId)) {
        available.add(itemId);
      }
    }

    for (const itemId of BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_SHARED) {
      if (this.shouldForceIncludeItem(itemId)) {
        available.add(itemId);
      }
    }

    return available;
  }

  private normalizeWorldItems(worlds: World[]): void {
    if (!worlds || !Items) return;
    const itemsById = Items as Record<string, unknown>;
    for (const world of worlds) {
      const checks = (
        world as { checks?: Record<string, { item?: { id?: string } }> }
      ).checks;
      if (!checks) continue;
      for (const check of Object.values(checks)) {
        const item = check?.item;
        const id = item?.id;
        if (!id) continue;
        const canonical = itemsById[id];
        if (canonical) {
          check.item = canonical;
        }
      }
    }
  }

  private buildItemMaxCounts(
    allItems?: Map<unknown, number>,
    startingItems?: Map<unknown, number>,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    if (!allItems) return counts;
    for (const [playerItem, count] of allItems) {
      if (!count || count <= 0) continue;
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id;
      if (!itemId) continue;
      counts.set(itemId, (counts.get(itemId) || 0) + count);
    }

    // Core allItems includes fixed locations on top of the initial pool snapshot,
    // which effectively double-counts fixed items. Remove one per fixed location.
    this.adjustFixedLocationCounts(counts);
    this.adjustStartingClockCounts(counts, startingItems);

    const settings = this.settings as {
      smallKeyShuffleOot?: unknown;
      smallKeyShuffleMm?: unknown;
      smallKeyShuffleHideout?: unknown;
      smallKeyShuffleChestGame?: unknown;
    };
    const ootSetting = String(settings.smallKeyShuffleOot ?? '');
    const mmSetting = String(settings.smallKeyShuffleMm ?? '');
    const hideoutSetting = String(settings.smallKeyShuffleHideout ?? '');
    const chestGameSetting = String(settings.smallKeyShuffleChestGame ?? '');

    if (
      ootSetting === 'vanilla' ||
      mmSetting === 'vanilla' ||
      hideoutSetting === 'vanilla' ||
      chestGameSetting === 'vanilla'
    ) {
      const defaultSmallKeyCounts = ITEM_DATABASE.filter(
        (item) =>
          item.id.includes('SMALL_KEY') && typeof item.maxCount === 'number',
      ).map((item): [string, number] => [item.id, item.maxCount as number]);

      for (const [itemId, maxCount] of defaultSmallKeyCounts) {
        if (itemId === 'OOT_SMALL_KEY_GF') {
          if (hideoutSetting === 'vanilla') counts.set(itemId, maxCount);
          continue;
        }
        if (itemId === 'OOT_SMALL_KEY_TCG') {
          if (chestGameSetting === 'vanilla') counts.set(itemId, maxCount);
          continue;
        }
        if (itemId.startsWith('OOT_SMALL_KEY_')) {
          if (ootSetting === 'vanilla') counts.set(itemId, maxCount);
          continue;
        }
        if (itemId.startsWith('MM_SMALL_KEY_')) {
          if (mmSetting === 'vanilla') counts.set(itemId, maxCount);
        }
      }
    }

    for (const itemId of SINGLE_COUNT_ITEM_IDS) {
      if (counts.has(itemId)) {
        counts.set(itemId, 1);
      }
    }

    for (const itemId of FISHING_POND_ALWAYS_INCLUDED_ITEM_IDS) {
      if (this.shouldForceIncludeItem(itemId)) {
        counts.set(itemId, 1);
      }
    }

    for (const itemId of BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_OOT_MM) {
      if (this.shouldForceIncludeItem(itemId)) {
        counts.set(itemId, 1);
      }
    }

    for (const itemId of BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_SHARED) {
      if (this.shouldForceIncludeItem(itemId)) {
        counts.set(itemId, 1);
      }
    }

    return counts;
  }

  /**
   * Build the starting-items map for the Pathfinder.
   *
   * Starting items from `this.settings.startingItems` are passed through
   * as-is, including any fractional clock sentinel (e.g. `MM_CLOCK1: 0.01`)
   * added by `ensureDeterministicClockStart`.  The fractional count is
   * small enough that `ExprHas(CLOCKn, 1)` evaluates to false, so it
   * does not grant free clock access.  When the user activates a full
   * clock via the item grid, it adds 1 via `assumedItems`, making the
   * total ≥ 1 and satisfying the `has(CLOCKn, 1)` check.
   */
  private buildPathfinderStartingItems(): Map<PlayerItem, number> {
    const startingItems = new Map<PlayerItem, number>();
    if (!Items || !makePlayerItem) return startingItems;

    const settings = this.settings as {
      players?: unknown;
      clocks?: unknown;
      startingItems?: Record<string, unknown>;
    };
    if (!settings.startingItems || typeof settings.startingItems !== 'object') {
      return startingItems;
    }

    const playersValue = Number(settings.players);
    const playerCount =
      Number.isFinite(playersValue) && playersValue > 0
        ? Math.floor(playersValue)
        : Math.max(1, this.worlds.length || 1);

    for (const [itemId, rawCount] of Object.entries(settings.startingItems)) {
      const count = Number(rawCount);
      if (!Number.isFinite(count) || count <= 0) continue;

      let item = (Items as Record<string, unknown>)[itemId];
      if (!item) {
        try {
          item = itemByID(itemId);
        } catch {
          item = undefined;
        }
      }
      if (!item) continue;

      for (let playerId = 0; playerId < playerCount; playerId += 1) {
        const pi = makePlayerItem(item, playerId);
        startingItems.set(pi, (startingItems.get(pi) || 0) + count);
      }
    }

    return startingItems;
  }

  /**
   * Prevent OoTMM's `LogicPassConfig` from assigning a random starting
   * clock when `clocks: true, progressiveClocks: 'separate'`.
   *
   * LogicPassConfig checks whether any clock is already present in
   * `settings.startingItems` (via `this.startingItems.has(pi)`).  If no
   * clock is found it picks one at random and adds it with count 1.
   * That count-1 clock then causes `optimizeWorldStartingAndPool` to
   * bake `has(CLOCKn)` → `EXPR_TRUE` into the world, making one time
   * slot unconditionally reachable regardless of the player's inventory.
   *
   * The trick: we add a *fractional* clock (count 0.01) to starting
   * items.  OoTMM's `countMapAdd` stores it because `0.01 > 0`, so
   * `this.startingItems.has(pi)` returns true — preventing the random
   * assignment.  But `optimizeWorldStartingAndPool` checks
   * `(count >= 1)`, so `0.01 < 1` means the `has(CLOCKn, 1)` expression
   * is NOT simplified away.  All clock gates remain intact.
   *
   * At runtime the Pathfinder has the 0.01 count in its starting items,
   * which correctly fails the `has(CLOCKn, 1)` check until the user
   * activates a full clock via the item grid (adding 1 via assumedItems).
   */
  private ensureDeterministicClockStart(
    settings: Record<string, unknown>,
  ): void {
    if (settings.clocks !== true) return;
    if (settings.progressiveClocks !== 'separate') return;

    // Only inject the sentinel when no real clock is already present.
    const existing = settings.startingItems;
    if (existing && typeof existing === 'object') {
      const clockIds = [
        'MM_CLOCK1',
        'MM_CLOCK2',
        'MM_CLOCK3',
        'MM_CLOCK4',
        'MM_CLOCK5',
        'MM_CLOCK6',
      ];
      for (const id of clockIds) {
        const v = (existing as Record<string, unknown>)[id];
        if (typeof v === 'number' && v >= 1) return; // real clock present
      }
    }

    // Inject a fractional sentinel.
    const EPSILON = 0.01;
    if (!settings.startingItems || typeof settings.startingItems !== 'object') {
      settings.startingItems = { MM_CLOCK1: EPSILON };
    } else {
      (settings.startingItems as Record<string, unknown>)['MM_CLOCK1'] =
        EPSILON;
    }
  }

  private adjustStartingClockCounts(
    counts: Map<string, number>,
    startingItems?: Map<unknown, number>,
  ): void {
    if (!startingItems || startingItems.size === 0) return;

    for (const [playerItem, count] of startingItems) {
      if (!count || count <= 0) continue;
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id;
      if (!itemId || !CLOCK_ITEM_IDS.has(itemId)) continue;

      const current = counts.get(itemId);
      if (!current) continue;

      const next = current - count;
      if (next > 0) {
        counts.set(itemId, next);
      } else {
        counts.delete(itemId);
      }
    }
  }

  private isFishingPondShuffleEnabled(): boolean {
    const value = (this.settings as { pondFishShuffle?: unknown })
      ?.pondFishShuffle;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on'
      );
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }

  private shouldForceIncludeItem(itemId: string): boolean {
    if (FISHING_POND_ALWAYS_INCLUDED_ITEM_IDS.has(itemId)) {
      return this.isFishingPondShuffleEnabled();
    }

    if (BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_SHARED.has(itemId)) {
      return this.isSharedBottlesEnabled();
    }

    if (BOTTLE_ALWAYS_INCLUDED_ITEM_IDS_OOT_MM.has(itemId)) {
      if (this.isSharedBottlesEnabled()) return false;
      if (itemId.startsWith('OOT_')) return this.isGameEnabled('oot');
      if (itemId.startsWith('MM_')) return this.isGameEnabled('mm');
      return true;
    }

    return true;
  }

  private isGameEnabled(game: 'oot' | 'mm'): boolean {
    const value = (this.settings as { games?: unknown })?.games;
    const games = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (games === 'ootmm') return true;
    if (game === 'oot') return games === 'oot';
    return games === 'mm';
  }

  private isSharedBottlesEnabled(): boolean {
    const value = (this.settings as { sharedBottles?: unknown })?.sharedBottles;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on'
      );
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }

  private adjustFixedLocationCounts(counts: Map<string, number>): void {
    if (!this.fixedLocationIds || this.fixedLocationIds.size === 0) return;
    const worlds = this.baseWorlds.length > 0 ? this.baseWorlds : this.worlds;
    if (!worlds || worlds.length === 0) return;

    for (const loc of this.fixedLocationIds) {
      let locId: string | undefined;
      let worldId: number | null | undefined;

      if (locationData) {
        const data = locationData(
          loc as unknown as ReturnType<typeof makeLocation>,
        );
        if (data) {
          locId = data.id;
          worldId = data.world;
        }
      }

      if (!locId) {
        const atIndex = loc.lastIndexOf('@');
        if (atIndex >= 0) {
          locId = loc.slice(0, atIndex);
          worldId = Number(loc.slice(atIndex + 1));
        } else {
          locId = loc;
          worldId = 0;
        }
      }

      if (worldId === null || worldId === undefined || Number.isNaN(worldId))
        continue;
      const world = worlds[worldId];
      const itemId = world?.checks?.[locId]?.item?.id;
      if (!itemId) continue;

      const current = counts.get(itemId);
      if (!current) continue;
      const next = current - 1;
      if (next > 0) {
        counts.set(itemId, next);
      } else {
        counts.delete(itemId);
      }
    }
  }

  private isVanillaSilverRupeeShuffle(): boolean {
    return (
      String(
        (this.settings as { silverRupeeShuffle?: unknown })
          ?.silverRupeeShuffle ?? '',
      ) === 'vanilla'
    );
  }

  private isVanillaSilverRupeeItemId(itemId: string): boolean {
    return itemId.startsWith(VANILLA_SILVER_RUPEE_PREFIX);
  }

  private isVanillaOwlShuffle(): boolean {
    return (
      String((this.settings as { owlShuffle?: unknown })?.owlShuffle ?? '') ===
      'none'
    );
  }

  private isOwlStatueItemId(itemId: string): boolean {
    return itemId.startsWith(OWL_STATUE_PREFIX);
  }

  private stripAutoTrackedInventoryItems(
    inventory: Map<string, number>,
    stripVanillaSilverRupees: boolean,
    stripVanillaOwls: boolean,
  ): Map<string, number> {
    if (!inventory || inventory.size === 0) return new Map();
    if (!stripVanillaSilverRupees && !stripVanillaOwls) return inventory;

    const next = new Map<string, number>();
    for (const [itemId, count] of inventory) {
      if (stripVanillaSilverRupees && this.isVanillaSilverRupeeItemId(itemId)) {
        continue;
      }
      if (stripVanillaOwls && this.isOwlStatueItemId(itemId)) {
        continue;
      }
      next.set(itemId, count);
    }
    return next;
  }

  private mergeInventoryWithCounts(
    baseInventory: Map<string, number>,
    counts: Map<string, number>,
  ): Map<string, number> {
    const next = new Map<string, number>(baseInventory);
    for (const [itemId, count] of counts) {
      if (count > 0) {
        next.set(itemId, count);
      }
    }
    return next;
  }

  private mergeCountMaps(...maps: Map<string, number>[]): Map<string, number> {
    const next = new Map<string, number>();
    for (const map of maps) {
      for (const [itemId, count] of map) {
        if (count > 0) {
          next.set(itemId, count);
        }
      }
    }
    return next;
  }

  private areCountMapsEqual(
    a: Map<string, number>,
    b: Map<string, number>,
  ): boolean {
    if (a.size !== b.size) return false;
    for (const [itemId, count] of a) {
      if (b.get(itemId) !== count) return false;
    }
    return true;
  }

  private countMapToRecord(
    counts: Map<string, number>,
  ): Record<string, number> {
    return Object.fromEntries(counts.entries());
  }

  private runPathfinder(inventory: Map<string, number>): {
    state: ReturnType<InstanceType<typeof Pathfinder>['run']>;
    reachableLocationIds: string[];
    newLocationIds: string[];
  } {
    const playerItems = this.buildPlayerItemsFromInventory(inventory);

    // Run pathfinding. Use a fresh state each run so that removals
    // of items (decrements) are correctly handled. The
    // Pathfinder only applies deltas for increased items
    // when given a previous state, which prevents reductions from
    // taking effect. Using `null` forces a full recalculation.
    let state;
    try {
      state = this.pathfinder.run(null, {
        assumedItems: playerItems, // Items the player has
        recursive: true,
        inPlace: false,
        gossips: true,
      });
    } catch (e) {
      console.error('[OoTMM Tracker] Pathfinder error:', e);
      throw e;
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!');
      throw new Error('Pathfinder returned undefined');
    }

    const typedState = state as {
      locations: Iterable<string>;
      newLocations: Iterable<string>;
      gossips?: Array<Set<string>>;
    };

    const reachableCheckIds = Array.from(typedState.locations).filter(
      (locId) => !this.hiddenLocationIds.has(locId),
    );
    const reachableGossipIds: string[] = [];
    if (Array.isArray(typedState.gossips)) {
      typedState.gossips.forEach(
        (worldGossips: Set<string>, worldId: number) => {
          worldGossips.forEach((gossipName) => {
            const gossipLocationId = makeLocation(gossipName, worldId);
            if (!this.hiddenLocationIds.has(gossipLocationId)) {
              reachableGossipIds.push(gossipLocationId);
            }
          });
        },
      );
    }
    const reachableLocationIds = Array.from(
      new Set([...reachableCheckIds, ...reachableGossipIds]),
    );
    const newLocationIds = Array.from(typedState.newLocations).filter(
      (locId) => !this.hiddenLocationIds.has(locId),
    );

    return { state, reachableLocationIds, newLocationIds };
  }

  private runTracePathfinder(
    inventory: Map<string, number>,
  ): TraceReachabilityState {
    const playerItems = this.buildPlayerItemsFromInventory(inventory);
    const traceParents = new Map<string, string | null>();
    const tracePathfinder = this.pathfinder as InstanceType<
      typeof Pathfinder
    > & {
      exploreArea?: (
        worldId: number,
        age: number,
        areaName: string,
        sourceAreaData: TraceAreaData,
        fromAreaName: string,
      ) => void;
      state?: PathfinderState;
    };
    const originalExploreArea = tracePathfinder.exploreArea?.bind(
      this.pathfinder,
    );

    if (originalExploreArea) {
      tracePathfinder.exploreArea = (
        worldId: number,
        age: number,
        areaName: string,
        sourceAreaData: TraceAreaData,
        fromAreaName: string,
      ) => {
        const areaKey = this.makeTraceAreaKey({ worldId, age, areaName });
        if (!traceParents.has(areaKey)) {
          traceParents.set(
            areaKey,
            this.resolveTraceParentKey(
              tracePathfinder.state,
              worldId,
              age,
              areaName,
              fromAreaName,
            ),
          );
        }
        originalExploreArea(
          worldId,
          age,
          areaName,
          sourceAreaData,
          fromAreaName,
        );
      };
    }

    let state;
    try {
      state = this.pathfinder.run(null, {
        assumedItems: playerItems,
        recursive: true,
        inPlace: false,
        gossips: true,
      });
    } catch (e) {
      console.error('[OoTMM Tracker] Pathfinder error:', e);
      throw e;
    } finally {
      if (originalExploreArea) {
        tracePathfinder.exploreArea = originalExploreArea;
      }
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!');
      throw new Error('Pathfinder returned undefined');
    }

    const typedState = state as {
      locations: Iterable<string>;
      gossips?: Array<Set<string>>;
    };

    const reachableCheckIds = Array.from(typedState.locations).filter(
      (locId) => !this.hiddenLocationIds.has(locId),
    );
    const reachableGossipIds: string[] = [];
    if (Array.isArray(typedState.gossips)) {
      typedState.gossips.forEach(
        (worldGossips: Set<string>, worldId: number) => {
          worldGossips.forEach((gossipName) => {
            const gossipLocationId = makeLocation(gossipName, worldId);
            if (!this.hiddenLocationIds.has(gossipLocationId)) {
              reachableGossipIds.push(gossipLocationId);
            }
          });
        },
      );
    }

    return {
      state,
      reachableLocationIds: Array.from(
        new Set([...reachableCheckIds, ...reachableGossipIds]),
      ),
      traceParents,
    };
  }

  private parseLocationId(
    checkId: string,
  ): { locationName: string; worldId: number } | null {
    const suffixIndex = checkId.lastIndexOf('@');
    if (suffixIndex <= 0 || suffixIndex >= checkId.length - 1) {
      return null;
    }

    const locationName = checkId.slice(0, suffixIndex);
    const worldId = Number.parseInt(checkId.slice(suffixIndex + 1), 10);
    if (!locationName || !Number.isInteger(worldId) || worldId < 0) {
      return null;
    }

    return { locationName, worldId };
  }

  private makeTraceAreaKey(node: TraceAreaNode): string {
    return `${node.worldId}:${node.age}:${node.areaName}`;
  }

  private parseTraceAreaKey(areaKey: string): TraceAreaNode | null {
    const firstSep = areaKey.indexOf(':');
    const secondSep = areaKey.indexOf(':', firstSep + 1);
    if (firstSep <= 0 || secondSep <= firstSep + 1) {
      return null;
    }

    const worldId = Number.parseInt(areaKey.slice(0, firstSep), 10);
    const age = Number.parseInt(areaKey.slice(firstSep + 1, secondSep), 10);
    const areaName = areaKey.slice(secondSep + 1);
    if (
      !Number.isInteger(worldId) ||
      worldId < 0 ||
      !Number.isInteger(age) ||
      age < 0 ||
      !areaName
    ) {
      return null;
    }

    return { worldId, age, areaName };
  }

  private resolveTraceParentKey(
    state: PathfinderState | undefined,
    worldId: number,
    age: number,
    areaName: string,
    fromAreaName: string,
  ): string | null {
    if (fromAreaName !== areaName) {
      return this.makeTraceAreaKey({
        worldId,
        age,
        areaName: fromAreaName,
      });
    }

    const otherAge = age === 0 ? 1 : 0;
    const otherAgeAreas = (state as { ws?: TraceWorldState[] } | undefined)
      ?.ws?.[worldId]?.ages?.[otherAge]?.areas;
    if (otherAgeAreas?.has(areaName)) {
      return this.makeTraceAreaKey({
        worldId,
        age: otherAge,
        areaName,
      });
    }

    return null;
  }

  private findCheckAreas(world: World, checkName: string): string[] {
    const areas = (world as { areas?: Record<string, { locations?: object }> })
      .areas;
    if (!areas) return [];

    return Object.entries(areas)
      .filter(([, area]) =>
        Object.prototype.hasOwnProperty.call(area.locations ?? {}, checkName),
      )
      .map(([areaName]) => areaName);
  }

  private findReachableTraceTargetKeys(
    state: PathfinderState,
    worldId: number,
    areaNames: string[],
  ): string[] {
    const reachableAreaKeys: string[] = [];
    const worldState = (
      state as {
        ws?: Array<{
          ages?: Array<{ areas?: Map<string, unknown> }>;
        }>;
      }
    ).ws?.[worldId];

    if (!worldState?.ages) return reachableAreaKeys;

    for (const [age, ageState] of worldState.ages.entries()) {
      for (const areaName of areaNames) {
        if (!ageState?.areas?.has(areaName)) continue;
        reachableAreaKeys.push(
          this.makeTraceAreaKey({ worldId, age, areaName }),
        );
      }
    }

    return reachableAreaKeys;
  }

  private reconstructTraceAreaPath(
    traceParents: Map<string, string | null>,
    targetAreaKeys: string[],
  ): string[] | null {
    let bestPath: string[] | null = null;

    for (const targetAreaKey of targetAreaKeys) {
      const path = this.reconstructTraceAreaPathFromTarget(
        traceParents,
        targetAreaKey,
      );
      if (!path) continue;
      if (!bestPath || path.length < bestPath.length) {
        bestPath = path;
      }
    }

    return bestPath;
  }

  private reconstructTraceAreaPathFromTarget(
    traceParents: Map<string, string | null>,
    targetAreaKey: string,
  ): string[] | null {
    const areaPathKeys: string[] = [];
    const visited = new Set<string>();
    let currentAreaKey: string | null = targetAreaKey;

    while (currentAreaKey !== null) {
      if (visited.has(currentAreaKey)) {
        return null;
      }
      visited.add(currentAreaKey);
      areaPathKeys.unshift(currentAreaKey);
      if (!traceParents.has(currentAreaKey)) {
        return null;
      }
      currentAreaKey = traceParents.get(currentAreaKey) ?? null;
    }

    const collapsedAreaPath: string[] = [];
    for (const areaKey of areaPathKeys) {
      const node = this.parseTraceAreaKey(areaKey);
      if (!node) return null;
      const lastAreaName = collapsedAreaPath[collapsedAreaPath.length - 1];
      if (lastAreaName !== node.areaName) {
        collapsedAreaPath.push(node.areaName);
      }
    }

    return collapsedAreaPath;
  }

  private buildPlayerItemsFromInventory(
    inventory: Map<string, number>,
  ): PlayerItems {
    // Convert inventory to PlayerItems format
    // Use ArrayEntriesMap to ensure .entries() returns an array instead of an iterator,
    // which is what the OoTMM library expects
    // @ts-expect-error ArrayEntriesMap overrides entries() for OoTMM compatibility
    const playerItems: PlayerItems = new ArrayEntriesMap<PlayerItem, number>();
    const expandedInventory = new Map<string, number>(inventory);

    for (const [itemId, count] of inventory) {
      if (count <= 0) continue;
      const baseItemId = BOTTLE_CONTENT_BASE_ITEM_IDS[itemId];
      if (!baseItemId) continue;
      expandedInventory.set(
        baseItemId,
        (expandedInventory.get(baseItemId) || 0) + count,
      );
    }

    for (const [itemId, count] of expandedInventory) {
      if (
        itemId.startsWith(GRID_REF_STATE_PREFIX) ||
        itemId.startsWith(GRID_WHEEL_OVERLAY_STATE_PREFIX)
      ) {
        continue;
      }

      let item = (Items as Record<string, unknown>)[itemId];
      if (!item) {
        try {
          item = itemByID(itemId);
        } catch (e) {
          this.debugLog('[OoTMM Tracker] Could not resolve item:', itemId, e);
          item = undefined;
        }
      }
      if (item && count > 0) {
        const pi = makePlayerItem(item, 0);
        playerItems.set(pi, count);
        this.debugLog(
          '[OoTMM Tracker] Added item to playerItems:',
          itemId,
          'as',
          pi.item.id,
          'count:',
          count,
        );
      }
    }
    return playerItems;
  }

  private buildSilverRupeeLocationIndex(
    worlds: World[],
  ): Map<string, string[]> {
    return this.buildAutoTrackedItemLocationIndex(worlds, (itemId) =>
      this.isVanillaSilverRupeeItemId(itemId),
    );
  }

  private buildOwlStatueLocationIndex(worlds: World[]): Map<string, string[]> {
    return this.buildAutoTrackedItemLocationIndex(worlds, (itemId) =>
      this.isOwlStatueItemId(itemId),
    );
  }

  private buildAutoTrackedItemLocationIndex(
    worlds: World[],
    predicate: (itemId: string) => boolean,
  ): Map<string, string[]> {
    const map = new Map<string, string[]>();
    if (!worlds || worlds.length === 0) return map;

    for (const [worldId, world] of worlds.entries()) {
      for (const [locId, check] of Object.entries(world.checks ?? {})) {
        const itemId = (check as { item?: { id?: string } })?.item?.id;
        if (!itemId || !predicate(itemId)) continue;
        const fullId = makeLocation(locId, worldId);
        const list = map.get(itemId) ?? [];
        list.push(fullId);
        map.set(itemId, list);
      }
    }
    return map;
  }

  private buildShopPriceIndex(worlds: World[]): {
    slotsByLocationId: Map<string, ShopPriceSlot>;
    basePricesByLocationId: Map<string, number[]>;
  } {
    const slotsByLocationId = new Map<string, ShopPriceSlot>();
    const basePricesByLocationId = new Map<string, number[]>();
    if (!worlds || worlds.length === 0) {
      return { slotsByLocationId, basePricesByLocationId };
    }

    for (const [worldId, world] of worlds.entries()) {
      const locationPriceSlots = this.buildLocationPriceSlotIndex(world);
      for (const [locId, check] of Object.entries(world.checks ?? {})) {
        const typedCheck = check as {
          type?: string;
          id?: number | string;
          game?: 'oot' | 'mm';
        };
        if (typedCheck.game !== 'oot' && typedCheck.game !== 'mm') continue;

        const slots = this.computePriceSlots(
          typedCheck,
          locId,
          locationPriceSlots,
        );
        if (slots.length === 0) continue;
        if (!world.prices) continue;

        const fullId = makeLocation(locId, worldId);
        slotsByLocationId.set(fullId, {
          worldId,
          slots,
        });
        basePricesByLocationId.set(
          fullId,
          slots.map((slot) => world.prices[slot]),
        );
      }
    }

    return { slotsByLocationId, basePricesByLocationId };
  }

  private computePriceSlots(
    check: { type?: string; id?: number | string; game?: 'oot' | 'mm' },
    locationId: string,
    locationPriceSlots: Map<string, number[]>,
  ): number[] {
    const slots = new Set<number>();

    if (
      check.type === 'shop' &&
      typeof check.id === 'number' &&
      Number.isInteger(check.id) &&
      check.id >= 0
    ) {
      if (check.game === 'oot') {
        slots.add(PRICE_RANGE_OOT_SHOPS + check.id);
      } else if (check.game === 'mm') {
        slots.add(PRICE_RANGE_MM_SHOPS + check.id);
      }
    }

    if (
      check.type === 'shop_ex' &&
      check.game === 'mm' &&
      typeof check.id === 'number' &&
      Number.isInteger(check.id) &&
      check.id >= 0
    ) {
      slots.add(PRICE_RANGE_MM_SHOPS_EX + check.id);
    }

    if (
      check.type === 'scrub' &&
      check.game === 'oot' &&
      typeof check.id === 'number' &&
      Number.isInteger(check.id) &&
      check.id >= 0
    ) {
      slots.add(PRICE_RANGE_OOT_SCRUBS + check.id);
    }

    if (
      check.type === 'npc' &&
      check.game === 'oot' &&
      typeof check.id === 'string'
    ) {
      const merchantSlot = OOT_MERCHANT_SLOT_BY_ID[check.id];
      if (typeof merchantSlot === 'number') {
        slots.add(PRICE_RANGE_OOT_MERCHANTS + merchantSlot);
      }
    }

    if (
      check.type === 'npc' &&
      check.game === 'mm' &&
      typeof check.id === 'string' &&
      check.id.startsWith('MM_TINGLE_MAP_')
    ) {
      const candidates = locationPriceSlots.get(locationId) ?? [];
      for (const slot of candidates) {
        if (
          slot >= PRICE_RANGE_MM_TINGLE &&
          slot < PRICE_RANGE_MM_TINGLE + PRICE_COUNT_MM_TINGLE
        ) {
          slots.add(slot);
        }
      }
    }

    return Array.from(slots)
      .filter((slot) => Number.isInteger(slot) && slot >= 0)
      .sort((a, b) => a - b);
  }

  private buildLocationPriceSlotIndex(world: World): Map<string, number[]> {
    const byLocation = new Map<string, Set<number>>();

    for (const area of Object.values(
      (
        world as {
          areas?: Record<string, { locations?: Record<string, unknown> }>;
        }
      ).areas ?? {},
    )) {
      for (const [locationId, expr] of Object.entries(area.locations ?? {})) {
        const slots = byLocation.get(locationId) ?? new Set<number>();
        this.collectPriceSlotsFromExpr(expr, slots, new WeakSet<object>());
        if (slots.size > 0) {
          byLocation.set(locationId, slots);
        }
      }
    }

    const normalized = new Map<string, number[]>();
    for (const [locationId, slots] of byLocation.entries()) {
      normalized.set(
        locationId,
        Array.from(slots).sort((a, b) => a - b),
      );
    }
    return normalized;
  }

  private collectPriceSlotsFromExpr(
    expr: unknown,
    out: Set<number>,
    seen: WeakSet<object>,
  ): void {
    if (!expr || typeof expr !== 'object') return;
    if (seen.has(expr)) return;
    seen.add(expr);
    const maybeSlot = (expr as { slot?: unknown }).slot;
    if (
      typeof maybeSlot === 'number' &&
      Number.isInteger(maybeSlot) &&
      maybeSlot >= 0
    ) {
      out.add(maybeSlot);
    }
    for (const value of Object.values(expr as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        value.forEach((entry) =>
          this.collectPriceSlotsFromExpr(entry, out, seen),
        );
      } else if (value && typeof value === 'object') {
        this.collectPriceSlotsFromExpr(value, out, seen);
      }
    }
  }

  private applyAffordableModeToRange(
    world: World,
    base: number,
    size: number,
    mode: string,
  ): void {
    if (!world?.prices || mode !== 'affordable') return;
    for (let i = 0; i < size; i += 1) {
      const slot = base + i;
      if (slot >= 0 && slot < world.prices.length) {
        world.prices[slot] = 10;
      }
    }
  }

  private isShopPriceEditableForLocation(slotData: ShopPriceSlot): boolean {
    for (const slot of slotData.slots) {
      const mode = this.getShopPriceModeForSlot(slot);
      if (mode === 'random' || mode === 'weighted') {
        return true;
      }
    }
    return false;
  }

  private getShopPriceModeForSlot(slot: number): string {
    const settings = this.settings as {
      priceOotShops?: unknown;
      priceOotScrubs?: unknown;
      priceOotMerchants?: unknown;
      priceMmShops?: unknown;
      priceMmTingle?: unknown;
    };
    if (
      slot >= PRICE_RANGE_OOT_SHOPS &&
      slot < PRICE_RANGE_OOT_SHOPS + PRICE_COUNT_OOT_SHOPS
    ) {
      return String(settings.priceOotShops ?? '');
    }
    if (
      slot >= PRICE_RANGE_OOT_SCRUBS &&
      slot < PRICE_RANGE_OOT_SCRUBS + PRICE_COUNT_OOT_SCRUBS
    ) {
      return String(settings.priceOotScrubs ?? '');
    }
    if (
      slot >= PRICE_RANGE_OOT_MERCHANTS &&
      slot < PRICE_RANGE_OOT_MERCHANTS + PRICE_COUNT_OOT_MERCHANTS
    ) {
      return String(settings.priceOotMerchants ?? '');
    }
    if (
      slot >= PRICE_RANGE_MM_SHOPS &&
      slot < PRICE_RANGE_MM_SHOPS + PRICE_COUNT_MM_SHOPS
    ) {
      return String(settings.priceMmShops ?? '');
    }
    if (
      slot >= PRICE_RANGE_MM_SHOPS_EX &&
      slot < PRICE_RANGE_MM_SHOPS_EX + PRICE_COUNT_MM_SHOPS_EX
    ) {
      return String(settings.priceMmShops ?? '');
    }
    if (
      slot >= PRICE_RANGE_MM_TINGLE &&
      slot < PRICE_RANGE_MM_TINGLE + PRICE_COUNT_MM_TINGLE
    ) {
      return String(settings.priceMmTingle ?? '');
    }
    return '';
  }

  private computeVanillaSilverRupeeCounts(
    reachableLocationIds: string[],
  ): Map<string, number> {
    return this.computeAutoTrackedItemCounts(
      reachableLocationIds,
      this.silverRupeeLocationIdsByItemId,
    );
  }

  private computeVanillaOwlStatueCounts(
    reachableLocationIds: string[],
  ): Map<string, number> {
    return this.computeAutoTrackedItemCounts(
      reachableLocationIds,
      this.owlStatueLocationIdsByItemId,
      1,
    );
  }

  private computeAutoTrackedItemCounts(
    reachableLocationIds: string[],
    locationIdsByItemId: Map<string, string[]>,
    maxCountPerItem?: number,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    if (locationIdsByItemId.size === 0) return counts;
    const reachable = new Set(reachableLocationIds);
    for (const [itemId, locationIds] of locationIdsByItemId) {
      let count = 0;
      for (const locId of locationIds) {
        if (reachable.has(locId)) {
          count += 1;
          if (maxCountPerItem && count >= maxCountPerItem) {
            count = maxCountPerItem;
            break;
          }
        }
      }
      if (count > 0) {
        counts.set(itemId, count);
      }
    }
    return counts;
  }

  /**
   * After the pathfinder has run, determine which ER entrances the player
   * can physically reach AND enter. This evaluates the saved exit expression
   * from each entrance's `from` area against the current pathfinder state.
   */
  /**
   * Build an ID-based wrapper around an item count Map so that
   * expression evaluation can find items regardless of object-reference
   * identity.  The underlying `ws.items` map is keyed by the Item
   * instances that the Pathfinder saw (from `assumedItems`), while the
   * expression objects hold references to the Item instances created by
   * `worldState()`.  Because these are different object references for
   * the same logical item, `Map.get` fails.  This wrapper falls back
   * to an ID-based lookup when direct reference lookup misses.
   */
  private buildIdAwareItemMap(
    source: Map<unknown, number>,
  ): Map<unknown, number> {
    // Build a fast id→count index for fallback lookups.
    const byId = new Map<string, number>();
    for (const [item, count] of source) {
      const id = (item as { id?: string })?.id;
      if (id) byId.set(id, (byId.get(id) || 0) + count);
    }

    // Return a thin wrapper whose `get` tries reference equality first,
    // then falls back to the id-based index.
    const wrapper = new Map(source);
    const originalGet = wrapper.get.bind(wrapper);
    wrapper.get = (key: unknown): number | undefined => {
      const direct = originalGet(key);
      if (direct !== undefined) return direct;
      const id = (key as { id?: string })?.id;
      if (id) return byId.get(id);
      return undefined;
    };
    return wrapper;
  }

  private computeReachableEntrances(
    state: ReturnType<InstanceType<typeof Pathfinder>['run']>,
  ): string[] {
    const reachable: string[] = [];
    const typedState = state as unknown as {
      ws: Array<{
        ages: [
          { areas: Map<string, unknown> },
          { areas: Map<string, unknown> },
        ];
        items: Map<unknown, number>;
        renewables: Map<unknown, number>;
        licenses: Map<unknown, number>;
        events: Set<string>;
      }>;
    };

    // Pre-build ID-aware item maps per world so expression evaluation
    // works even when the item object references differ between the
    // expression tree (from worldState) and the pathfinder state (from
    // assumedItems / Items module).
    const worldMaps = typedState.ws.map((ws) => ({
      items: this.buildIdAwareItemMap(ws.items),
      renewables: this.buildIdAwareItemMap(ws.renewables),
      licenses: this.buildIdAwareItemMap(ws.licenses),
    }));

    for (const [entranceKey, saved] of this.savedEntranceExitExprs) {
      let canEnter = false;

      for (let worldId = 0; worldId < typedState.ws.length; worldId++) {
        if (canEnter) break;
        const ws = typedState.ws[worldId];
        const world = this.worlds[worldId];
        const maps = worldMaps[worldId];

        // Check both ages (0 = child, 1 = adult)
        for (const age of [0, 1] as const) {
          const ageState = ws.ages[age];
          const areaData = ageState.areas.get(saved.from);
          if (!areaData) continue;

          // The from area is reachable at this age. Now evaluate the exit expression.
          const evalState = {
            settings: this.settings,
            world,
            areaData,
            items: maps.items,
            renewables: maps.renewables,
            licenses: maps.licenses,
            age,
            events: ws.events,
          };
          try {
            const expr = saved.expr as {
              eval: (
                s: unknown,
                deps: { items: unknown[]; events: string[] },
              ) => { result: boolean };
            };
            const result = expr.eval(evalState, {
              items: [],
              events: [],
            });
            if (result.result) {
              canEnter = true;
              break;
            }
          } catch {
            // Expression eval failed, treat as not reachable
          }
        }
      }

      if (canEnter) {
        reachable.push(entranceKey);
      }
    }

    // Also evaluate exit-type keys for reachability
    for (const [exitKey, saved] of this.savedExitExitExprs) {
      let canExit = false;

      for (let worldId = 0; worldId < typedState.ws.length; worldId++) {
        if (canExit) break;
        const ws = typedState.ws[worldId];
        const world = this.worlds[worldId];
        const maps = worldMaps[worldId];

        for (const age of [0, 1] as const) {
          const ageState = ws.ages[age];
          const areaData = ageState.areas.get(saved.from);
          if (!areaData) continue;

          const evalState = {
            settings: this.settings,
            world,
            areaData,
            items: maps.items,
            renewables: maps.renewables,
            licenses: maps.licenses,
            age,
            events: ws.events,
          };
          try {
            const expr = saved.expr as {
              eval: (
                s: unknown,
                deps: { items: unknown[]; events: string[] },
              ) => { result: boolean };
            };
            const result = expr.eval(evalState, {
              items: [],
              events: [],
            });
            if (result.result) {
              canExit = true;
              break;
            }
          } catch {
            // Expression eval failed, treat as not reachable
          }
        }
      }

      if (canExit) {
        reachable.push(exitKey);
      }
    }

    return reachable;
  }
}
