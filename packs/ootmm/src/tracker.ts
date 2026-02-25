import type {
  TrackerPack,
  TrackerCheckResult,
  LocationInfo,
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

import { ITEM_DATABASE } from './data/items';
import { LOCATION_CODE_CATALOG } from './data/locationCatalog';

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

import type { World } from '@ootmm/core/logic/world';
import type { PlayerItems, PlayerItem } from '@ootmm/core/items/index';

type WorldData = {
  worlds: World[];
  fixedLocations?: unknown;
  allItems?: unknown;
  startingItems?: unknown;
  [key: string]: unknown;
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
  'OOT_FISHING_POND_CHILD_LOACH_16LBS',
  'OOT_FISHING_POND_ADULT_LOACH_30LBS',
]);

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
  private shopPriceSlotsByLocationId: Map<string, ShopPriceSlot> = new Map();
  private baseShopPricesByLocationId: Map<string, number[]> = new Map();
  private devLocationCatalog: LocationInfo[] = [];
  private readonly debugModeEnabled = isTrackerDebugModeEnabled();

  private debugLog(...args: unknown[]): void {
    if (!this.debugModeEnabled) return;
    console.log(...args);
  }

  async initialize(userSettings: Partial<OoTMMSettings> = {}): Promise<void> {
    this.debugLog('[OoTMM Tracker] Initializing...');

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
    const worldData: WorldData = await worldState(
      monitor,
      opts as Record<string, unknown>,
    );
    this.baseWorlds = worldData.worlds ?? [];
    this.normalizeWorldItems(this.baseWorlds);

    // Run entrance pass to connect games
    this.debugLog('[OoTMM Tracker] Running entrance pass...');
    const hasPlandoEntrances = Boolean(
      ootmmSettings.plando &&
      typeof ootmmSettings.plando === 'object' &&
      Object.keys(
        ((ootmmSettings.plando as Record<string, unknown>).entrances as
          | Record<string, unknown>
          | undefined) ?? {},
      ).length > 0,
    );
    const entranceInput = hasPlandoEntrances
      ? {
          ...(worldData as Record<string, unknown>),
          startingItems: new Map(),
          settings: {
            ...(this.settings as Record<string, unknown>),
            logic: 'none',
          },
        }
      : { ...(worldData as Record<string, unknown>), startingItems: new Map() };
    const entrancePass = new LogicPassEntrances(
      entranceInput as Record<string, unknown>,
    );

    const entranceResult = entrancePass.run();
    this.worlds = entranceResult.worlds;
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
    const isVanillaSilverRupees = this.isVanillaSilverRupeeShuffle();
    const baseInventory = isVanillaSilverRupees
      ? this.stripVanillaSilverRupees(inventory)
      : inventory;

    let assumedInventory = baseInventory;
    let state;
    let reachableLocationIds: string[] = [];
    let newLocationIds: string[] = [];
    let silverRupeeCounts = new Map<string, number>();
    let iterations = 0;

    while (true) {
      const result = this.runPathfinder(assumedInventory);
      state = result.state;
      reachableLocationIds = result.reachableLocationIds;
      newLocationIds = result.newLocationIds;

      if (
        !isVanillaSilverRupees ||
        this.silverRupeeLocationIdsByItemId.size === 0
      ) {
        break;
      }

      const nextCounts =
        this.computeVanillaSilverRupeeCounts(reachableLocationIds);
      if (this.areCountMapsEqual(nextCounts, silverRupeeCounts)) {
        silverRupeeCounts = nextCounts;
        break;
      }
      silverRupeeCounts = nextCounts;
      assumedInventory = this.mergeInventoryWithCounts(
        baseInventory,
        silverRupeeCounts,
      );
      iterations += 1;
      if (iterations >= 10) {
        console.warn(
          '[OoTMM Tracker] Vanilla silver rupee auto-tracking did not stabilize after 10 iterations',
        );
        break;
      }
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!');
      throw new Error('Pathfinder returned undefined');
    }

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

    return {
      reachableLocationIds,
      newLocationIds,
      canComplete: state.goal,
      extra,
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
      'OOT_FISHING_POND_CHILD_LOACH_16LBS',
    ];
    const adultFallbackIds = [
      'OOT_FISHING_POND_ADULT_FISH_8LBS',
      'OOT_FISHING_POND_ADULT_LOACH_30LBS',
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
      return !this.isSharedBottlesEnabled();
    }

    return true;
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

  private isOwlStatueItemId(itemId: string): boolean {
    return itemId.startsWith(OWL_STATUE_PREFIX);
  }

  private stripVanillaSilverRupees(
    inventory: Map<string, number>,
  ): Map<string, number> {
    if (!inventory || inventory.size === 0) return new Map();
    const next = new Map<string, number>();
    for (const [itemId, count] of inventory) {
      if (this.isVanillaSilverRupeeItemId(itemId)) continue;
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
      if (itemId.startsWith(GRID_REF_STATE_PREFIX)) {
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
    const map = new Map<string, string[]>();
    if (!worlds || worlds.length === 0) return map;

    for (const [worldId, world] of worlds.entries()) {
      for (const [locId, check] of Object.entries(world.checks ?? {})) {
        const itemId = (check as { item?: { id?: string } })?.item?.id;
        if (!itemId || !this.isVanillaSilverRupeeItemId(itemId)) continue;
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
    const counts = new Map<string, number>();
    if (this.silverRupeeLocationIdsByItemId.size === 0) return counts;
    const reachable = new Set(reachableLocationIds);
    for (const [itemId, locationIds] of this.silverRupeeLocationIdsByItemId) {
      let count = 0;
      for (const locId of locationIds) {
        if (reachable.has(locId)) count += 1;
      }
      if (count > 0) {
        counts.set(itemId, count);
      }
    }
    return counts;
  }
}
