import * as DataMod from '@ootmm/data';
import { isSettingContains } from './mapSettingsVisibility';

const resolveExport = <T>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown };
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T);
};

type EntranceData = {
  game: string;
  type: string;
  from: string;
  to: string;
  reverse?: string;
};

const ENTRANCES_RAW =
  resolveExport<Record<string, EntranceData>>(DataMod, 'ENTRANCES') ?? {};

const TYPE_TO_SETTING: Record<string, string> = {
  dungeon: 'erMajorDungeons',
  'dungeon-minor': 'erMinorDungeons',
  'dungeon-ganon': 'erGanonCastle',
  'dungeon-ganon-tower': 'erGanonTower',
  'dungeon-sh': 'erSpiderHouses',
  'dungeon-pf': 'erPirateFortress',
  'dungeon-btw': 'erBeneathWell',
  'dungeon-acoi': 'erIkanaCastle',
  'dungeon-ss': 'erSecretShrine',
  'dungeon-ctr': 'erMoon',
};

type TrackedEntrancePolarity = 'in' | 'out' | 'any';

const DUNGEON_TYPES = new Set(Object.keys(TYPE_TO_SETTING));
const BOSS_TYPES = new Set(['boss']);
const GROTTO_TYPES = new Set(['grotto', 'grave']);
const REGION_TYPES = new Set(['region', 'region-extra', 'region-shortcut']);
const OVERWORLD_TYPES = new Set(['overworld', 'overworld-pf']);
const INTERIOR_TYPES = new Set(['indoors', 'indoors-extra', 'indoors-pf']);
const SPAWN_TYPES = new Set(['spawn-child', 'spawn-adult']);
const WARP_TYPES = new Set(['one-way-song', 'one-way-statue']);
const WALLMASTER_TYPES = new Set(['wallmaster']);
const ONE_WAY_TYPES = new Set([
  'one-way',
  'one-way-ikana',
  'one-way-song',
  'one-way-statue',
  'one-way-owl',
  'one-way-woods',
  'one-way-water-void',
]);

const ONE_WAY_SUB_SETTING_BY_TYPE: Record<string, string> = {
  'one-way': 'erOneWaysMajor',
  'one-way-ikana': 'erOneWaysIkana',
  'one-way-song': 'erOneWaysSongs',
  'one-way-statue': 'erOneWaysStatues',
  'one-way-owl': 'erOneWaysOwls',
  'one-way-woods': 'erOneWaysWoods',
  'one-way-water-void': 'erOneWaysWaterVoids',
};

/** Wallmasters that exist ONLY in MQ dungeons (absent from vanilla). */
const WALLMASTER_MQ_ONLY: Record<string, string> = {
  OOT_WALLMASTER_SPIRIT_CHILD_SUN: 'Spirit',
  OOT_WALLMASTER_SPIRIT_STATUE: 'Spirit',
  OOT_WALLMASTER_BOTW_BASEMENT: 'BotW',
  OOT_WALLMASTER_BOTW_PIT: 'BotW',
};

/** Wallmasters that exist ONLY in vanilla dungeons (absent from MQ). */
const WALLMASTER_VANILLA_ONLY: Record<string, string> = {
  OOT_WALLMASTER_SHADOW: 'Shadow',
  OOT_WALLMASTER_SPIRIT_CHILD_RUPEES: 'Spirit',
  OOT_WALLMASTER_GANON_LIGHT: 'Ganon',
};

export const INTERIOR_GAME_LINK_SOURCE_KEYS = new Set([
  'OOT_MARKET_FROM_MASK_SHOP',
  'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
]);
export const INTERIOR_GAME_LINK_EXIT_KEYS = new Set([
  'OOT_SHOP_MASKS',
  'MM_CLOCK_TOWER_FROM_CLOCK_TOWN',
]);
export const GAME_LINK_VANILLA_EXIT_MAPPING: Record<
  string,
  Record<string, string>
> = {
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
const INTERIOR_EXIT_TYPES = new Set(['indoors-exit']);
const TRACKED_EXIT_TYPES = new Set([
  'dungeon-exit',
  'grotto-exit',
  'grave-exit',
  'region-exit',
  ...INTERIOR_EXIT_TYPES,
]);
const DEKU_PALACE_JP_LAYOUT = 'DekuPalace';
const JP_LAYOUT_GROTTO_KEYS = new Set([
  'MM_GROTTO_JP_CLIMB_LEFT',
  'MM_GROTTO_JP_CLIMB_RIGHT',
  'MM_GROTTO_JP_LINE_START',
  'MM_GROTTO_JP_LINE_END',
]);
const POLARITY_ANY_OVERWORLD = new Set<string>([
  'region',
  'region-extra',
  'region-shortcut',
  'region-exit',
]);
const POLARITY_IN = new Set<string>([
  'boss',
  'dungeon',
  'dungeon-minor',
  'dungeon-ganon',
  'dungeon-ganon-tower',
  'dungeon-sh',
  'dungeon-pf',
  'dungeon-btw',
  'dungeon-acoi',
  'dungeon-ss',
  'dungeon-ctr',
  'wallmaster',
  'region',
  'region-extra',
  'region-shortcut',
  'indoors',
  'indoors-pf',
  'indoors-extra',
  'indoors-special',
  'grotto',
  'grave',
]);
const POLARITY_OUT = new Set<string>([
  'dungeon-exit',
  'indoors-exit',
  'region-exit',
  'grotto-exit',
  'grave-exit',
]);

export type TrackedEntrancePool =
  | 'boss'
  | 'dungeon'
  | 'grotto'
  | 'region'
  | 'overworld'
  | 'interior'
  | 'spawn'
  | 'warp'
  | 'wallmaster'
  | 'one-way';

const TRACKED_ENTRANCE_POOLS: TrackedEntrancePool[] = [
  'boss',
  'dungeon',
  'grotto',
  'region',
  'overworld',
  'interior',
  'spawn',
  'warp',
  'wallmaster',
  'one-way',
];
const TRACKED_POOL_MODE_SETTING: Record<TrackedEntrancePool, string> = {
  boss: 'erBoss',
  dungeon: 'erDungeons',
  grotto: 'erGrottos',
  region: 'erRegions',
  overworld: 'erOverworld',
  interior: 'erIndoors',
  spawn: 'erSpawns',
  warp: 'erWarps',
  wallmaster: 'erWallmasters',
  'one-way': 'erOneWays',
};
const TRACKED_POOL_MIXED_SETTING: Partial<Record<TrackedEntrancePool, string>> =
  {
    dungeon: 'erMixedDungeons',
    grotto: 'erMixedGrottos',
    region: 'erMixedRegions',
    overworld: 'erMixedOverworld',
    interior: 'erMixedIndoors',
  };

/**
 * For game-link keys (no polarity), return the partner (reverse) key.
 * Returns null for non-game-link keys.
 */
export function getGameLinkPartner(key: string): string | null {
  if (
    !INTERIOR_GAME_LINK_SOURCE_KEYS.has(key) &&
    !INTERIOR_GAME_LINK_EXIT_KEYS.has(key)
  ) {
    return null;
  }
  const data = ENTRANCES_RAW[key];
  return data?.reverse?.trim() || null;
}

/**
 * Return the reverse (partner) key for a given entrance/exit key,
 * or null if none exists.
 */
export function getEdgeReverse(key: string): string | null {
  const data = ENTRANCES_RAW[key];
  if (!data) return null;
  const rev = data.reverse?.trim();
  if (!rev || !ENTRANCES_RAW[rev]) return null;
  return rev;
}

/**
 * Given a directed edge src → dst, compute the reverse edge.
 * Returns { reverseSrc: reverse(dst), reverseDst: reverse(src) } or null.
 */
export function computeCoupledReverse(
  src: string,
  dst: string,
): { reverseSrc: string; reverseDst: string } | null {
  const reverseDst = getEdgeReverse(src);
  const reverseSrc = getEdgeReverse(dst);
  if (!reverseSrc || !reverseDst) return null;
  return { reverseSrc, reverseDst };
}

function isTrackedInteriorSource(
  key: string | undefined,
  type: string,
): boolean {
  if (INTERIOR_TYPES.has(type)) return true;
  return Boolean(key && INTERIOR_GAME_LINK_SOURCE_KEYS.has(key));
}

function getActiveGameLinkKeys(settings: Record<string, unknown>): Set<string> {
  const gamesMode = String(settings?.games ?? 'ootmm');
  const activeGameLinkKeys =
    gamesMode === 'ootmm'
      ? INTERIOR_GAME_LINK_EXIT_KEYS
      : INTERIOR_GAME_LINK_SOURCE_KEYS;

  return new Set(activeGameLinkKeys);
}

function getEnabledInteriorSources(settings: Record<string, unknown>): {
  types: Set<string>;
  gameLinkKeys: Set<string>;
} {
  const types = new Set<string>();
  const gameLinkKeys = new Set<string>();

  if (settings?.erIndoorsMajor) {
    types.add('indoors');
  }
  if (settings?.erIndoorsExtra) {
    types.add('indoors-extra');
    if (settings?.erPiratesWorld) {
      types.add('indoors-pf');
    }
  }
  if (settings?.erIndoorsGameLinks) {
    for (const key of getActiveGameLinkKeys(settings)) {
      gameLinkKeys.add(key);
    }
  }

  return { types, gameLinkKeys };
}

function getEnabledSpawnSourceTypes(
  settings: Record<string, unknown>,
): Set<string> {
  const types = new Set<string>();
  const mode = String(settings?.erSpawns ?? 'none');

  if (mode === 'child' || mode === 'both') {
    types.add('spawn-child');
  }
  if (mode === 'adult' || mode === 'both') {
    types.add('spawn-adult');
  }

  return types;
}

function getSpawnDestinationTypes(
  settings: Record<string, unknown>,
): Set<string> {
  const types = new Set<string>();

  if (settings?.erDungeons && settings?.erDungeons !== 'none') {
    for (const type of getEnabledDungeonTypes(settings)) {
      types.add(type);
    }
  }

  if (settings?.erGrottos && settings?.erGrottos !== 'none') {
    for (const type of GROTTO_TYPES) {
      types.add(type);
    }
  }

  if (settings?.erRegions && settings?.erRegions !== 'none') {
    for (const type of getEnabledRegionSources(settings)) {
      types.add(type);
    }
  }

  if (settings?.erIndoors && settings?.erIndoors !== 'none') {
    const enabledInteriorSources = getEnabledInteriorSources(settings);
    for (const type of enabledInteriorSources.types) {
      types.add(type);
    }
  }

  if (settings?.erWarps && settings?.erWarps !== 'none') {
    for (const type of getEnabledWarpSources(settings)) {
      types.add(type);
    }
  }

  // OoTMM's spawn pool always includes these destination categories even when
  // their own settings are otherwise off.
  types.add('indoors');
  types.add('one-way-song');
  types.add('region');

  return types;
}

function getEnabledRegionSources(
  settings: Record<string, unknown>,
): Set<string> {
  const types = new Set<string>(['region']);

  if (settings?.erRegionsExtra) {
    types.add('region-extra');
  }

  if (settings?.erRegionsShortcuts) {
    types.add('region-shortcut');
  }

  return types;
}

function getEnabledOverworldSources(
  settings: Record<string, unknown>,
): Set<string> {
  // OoTMM's overworld pool includes all major-region edges,
  // their extras/shortcuts, and the dedicated overworld edges.
  const types = new Set<string>([
    'region',
    'region-extra',
    'region-shortcut',
    'region-exit',
    'overworld',
  ]);

  if (settings?.erPiratesWorld) {
    types.add('overworld-pf');
    types.add('dungeon-pf');
  }

  return types;
}

export function getEnabledDungeonTypes(
  settings: Record<string, unknown>,
): Set<string> {
  const enabled = new Set<string>();
  for (const [type, settingKey] of Object.entries(TYPE_TO_SETTING)) {
    if (settings?.[settingKey]) {
      enabled.add(type);
    }
  }

  return enabled;
}

export function getTrackedEntrancePool(
  type: string,
  key?: string,
  settings?: Record<string, unknown>,
): TrackedEntrancePool | null {
  const overworldEnabled = String(settings?.erOverworld ?? 'none') !== 'none';
  const noPolarity = Boolean(settings?.erNoPolarity);

  if (BOSS_TYPES.has(type)) return 'boss';
  if (type === 'dungeon-pf' && overworldEnabled && settings?.erPiratesWorld) {
    return 'overworld';
  }
  if (DUNGEON_TYPES.has(type)) return 'dungeon';
  if (GROTTO_TYPES.has(type)) return 'grotto';
  if (REGION_TYPES.has(type)) {
    if (overworldEnabled) {
      return 'overworld';
    }
    return 'region';
  }
  if (type === 'region-exit' && overworldEnabled) {
    return 'overworld';
  }
  // erNoPolarity: exit types become source types in their corresponding pools,
  // mirroring OoTMM's assumedFromPools behavior.
  if (noPolarity) {
    if (type === 'dungeon-exit') return 'dungeon';
    if (type === 'grotto-exit' || type === 'grave-exit') return 'grotto';
    if (type === 'indoors-exit') return 'interior';
    // region-exit: only reaches here when overworld is OFF.
    // When overworld is ON, the existing check above catches it.
    if (type === 'region-exit') {
      return overworldEnabled ? 'overworld' : 'region';
    }
  }
  if (OVERWORLD_TYPES.has(type)) return 'overworld';
  if (isTrackedInteriorSource(key, type)) return 'interior';
  if (SPAWN_TYPES.has(type)) return 'spawn';
  if (ONE_WAY_TYPES.has(type)) {
    // song/statue: only return 'one-way' if erOneWays is active AND sub-toggle is on
    const subKey = ONE_WAY_SUB_SETTING_BY_TYPE[type];
    if (
      subKey &&
      (!settings?.erOneWays ||
        settings.erOneWays === 'none' ||
        !settings[subKey])
    ) {
      // Fall through to WARP_TYPES check below for song/statue
    } else {
      return 'one-way';
    }
  }
  if (WARP_TYPES.has(type)) return 'warp';
  if (WALLMASTER_TYPES.has(type)) return 'wallmaster';
  return null;
}

export function isTrackedEntranceSourceType(
  type: string,
  key?: string,
  settings?: Record<string, unknown>,
): boolean {
  return getTrackedEntrancePool(type, key, settings) !== null;
}

export function isTrackedEntranceExitType(type: string, key?: string): boolean {
  if (TRACKED_EXIT_TYPES.has(type)) return true;
  return Boolean(key && INTERIOR_GAME_LINK_EXIT_KEYS.has(key));
}

function getTrackedPoolMode(
  pool: TrackedEntrancePool,
  settings: Record<string, unknown>,
): string {
  return String(settings?.[TRACKED_POOL_MODE_SETTING[pool]] ?? 'none');
}

function isTrackedPoolMixed(
  pool: TrackedEntrancePool,
  settings: Record<string, unknown>,
): boolean {
  const mixedSettingKey = TRACKED_POOL_MIXED_SETTING[pool];
  if (!mixedSettingKey) return false;

  const mixedMode = String(settings?.erMixed ?? 'none');
  if (mixedMode === 'none') return false;
  if (!settings?.[mixedSettingKey]) return false;
  return getTrackedPoolMode(pool, settings) === mixedMode;
}

function getEnabledWarpSources(settings: Record<string, unknown>): Set<string> {
  const types = new Set<string>(WARP_TYPES);

  if (settings?.erWarps === 'ootOnly' || settings?.erOneWaysStatues) {
    types.delete('one-way-statue');
  }

  if (settings?.erWarps === 'mmOnly' || settings?.erOneWaysSongs) {
    types.delete('one-way-song');
  }

  return types;
}

export function getTrackedEntranceCompatiblePools(
  pool: TrackedEntrancePool,
  settings: Record<string, unknown>,
): TrackedEntrancePool[] {
  if (pool === 'spawn') return ['spawn'];
  if (!isTrackedPoolMixed(pool, settings)) return [pool];
  return TRACKED_ENTRANCE_POOLS.filter((candidatePool) =>
    isTrackedPoolMixed(candidatePool, settings),
  );
}

export function getTrackedEntranceOwnGameMode(
  pool: TrackedEntrancePool,
  settings: Record<string, unknown>,
): boolean {
  if (pool === 'spawn') return true;
  if (isTrackedPoolMixed(pool, settings)) {
    return String(settings?.erMixed ?? 'none') === 'ownGame';
  }
  return getTrackedPoolMode(pool, settings) === 'ownGame';
}

export function getTrackedEntrancePolarity(
  key: string,
  settings: Record<string, unknown>,
): TrackedEntrancePolarity {
  // erNoPolarity disables all polarity distinctions
  if (settings?.erNoPolarity) {
    return 'any';
  }

  if (
    INTERIOR_GAME_LINK_SOURCE_KEYS.has(key) ||
    INTERIOR_GAME_LINK_EXIT_KEYS.has(key)
  ) {
    return 'any';
  }

  const data = ENTRANCES_RAW[key];
  if (!data) return 'any';

  if (
    String(settings?.erOverworld ?? 'none') !== 'none' &&
    POLARITY_ANY_OVERWORLD.has(data.type)
  ) {
    return 'any';
  }

  if (POLARITY_IN.has(data.type)) {
    return 'in';
  }

  if (POLARITY_OUT.has(data.type)) {
    return 'out';
  }

  return 'any';
}

export function doTrackedEntrancePolaritiesMatch(
  sourceKey: string,
  destinationKey: string,
  settings: Record<string, unknown>,
): boolean {
  const sourcePolarity = getTrackedEntrancePolarity(sourceKey, settings);
  const destinationPolarity = getTrackedEntrancePolarity(
    destinationKey,
    settings,
  );

  if (sourcePolarity === 'any' || destinationPolarity === 'any') {
    return true;
  }

  return sourcePolarity === destinationPolarity;
}

export function isTrackedSpawnDestination(
  key: string,
  type: string,
  settings: Record<string, unknown>,
): boolean {
  if (
    INTERIOR_GAME_LINK_SOURCE_KEYS.has(key) ||
    INTERIOR_GAME_LINK_EXIT_KEYS.has(key)
  ) {
    if (!settings?.erIndoorsGameLinks) {
      return false;
    }

    return getActiveGameLinkKeys(settings).has(key);
  }

  return getSpawnDestinationTypes(settings).has(type);
}

export function isTrackedDestinationAllowedForSource(
  sourceKey: string,
  destinationKey: string,
  settings: Record<string, unknown>,
  activeKeys: Set<string>,
): boolean {
  const sourceData = ENTRANCES_RAW[sourceKey];
  if (!sourceData) return false;

  const sourcePool = getTrackedEntrancePool(sourceData.type, sourceKey);
  if (sourcePool === 'wallmaster') {
    const dstData = ENTRANCES_RAW[destinationKey];
    if (!dstData) return false;
    return isTrackedWallmasterDestination(dstData.type);
  }

  if (sourcePool === 'one-way') {
    const dstData = ENTRANCES_RAW[destinationKey];
    if (!dstData) return false;
    return isTrackedOneWayDestination(dstData.type, settings);
  }

  if (sourcePool !== 'spawn') {
    // Non-spawn: destination itself or its reverse must be in activeKeys.
    if (activeKeys.has(destinationKey)) return true;
    const rev = getEdgeReverse(destinationKey);
    if (rev && activeKeys.has(rev)) return true;
    return false;
  }

  // Spawn sources: check both the raw destination and its reverse.
  const dstData = ENTRANCES_RAW[destinationKey];
  const dstRev = getEdgeReverse(destinationKey);
  const dstRevData = dstRev ? ENTRANCES_RAW[dstRev] : null;

  const candidates = [
    { key: destinationKey, data: dstData },
    ...(dstRev && dstRevData ? [{ key: dstRev, data: dstRevData }] : []),
  ];

  const valid = candidates.some(({ key, data }) => {
    if (!data) return false;
    if (!isTrackedEntranceAvailable(key, settings)) return false;
    if (sourceData.game !== data.game) return false;
    return isTrackedSpawnDestination(key, data.type, settings);
  });

  return valid;
}

function hasSetSettingValue(setting: unknown, value: string): boolean {
  if (typeof setting === 'string') {
    return setting === 'all';
  }

  if (!setting || typeof setting !== 'object') {
    return false;
  }

  const type = String((setting as { type?: unknown }).type ?? 'none');
  if (type === 'all') return true;
  if (type !== 'specific') return false;

  const values = (setting as { values?: unknown }).values;
  return Array.isArray(values) && values.includes(value);
}

export function isTrackedWallmasterDestination(type: string): boolean {
  if (DUNGEON_TYPES.has(type)) return true;
  if (BOSS_TYPES.has(type)) return true;
  return false;
}

function isOneWayTypeEnabled(
  type: string,
  settings?: Record<string, unknown>,
): boolean {
  if (!ONE_WAY_TYPES.has(type)) return false;
  const subKey = ONE_WAY_SUB_SETTING_BY_TYPE[type];
  // Only check sub-toggle when settings are provided; without settings
  // (e.g. during plando import) allow all one-way types.
  if (subKey && settings && !settings[subKey]) return false;
  return true;
}

export function isTrackedOneWayDestination(
  type: string,
  settings?: Record<string, unknown>,
): boolean {
  // Standard mode: one-ways shuffle among themselves
  if (!settings?.erOneWaysAnywhere) {
    return isOneWayTypeEnabled(type, settings);
  }

  // Anywhere mode: one-ways can target ALL shuffled destination types
  // (matches OoTMM's poolOneWaysAnywhere which uses poolsTypesDst()).
  // Each pool's types are only included if that pool's ER setting is
  // active (not 'none').  Dungeon types are always included regardless
  // (matching OoTMM's unconditional poolOneWaysAnywhere addition of
  // dungeon / dungeon-minor / dungeon-sh).  Boss is gated behind
  // erBoss !== 'none', matching the OoTMM solver.
  if (isOneWayTypeEnabled(type, settings)) return true;
  if (DUNGEON_TYPES.has(type)) return true;
  if (settings?.erBoss && settings?.erBoss !== 'none' && BOSS_TYPES.has(type))
    return true;
  if (
    settings?.erRegions &&
    settings?.erRegions !== 'none' &&
    (REGION_TYPES.has(type) || type === 'region-exit')
  )
    return true;
  if (
    settings?.erGrottos &&
    settings?.erGrottos !== 'none' &&
    GROTTO_TYPES.has(type)
  )
    return true;
  if (
    settings?.erIndoors &&
    settings?.erIndoors !== 'none' &&
    INTERIOR_TYPES.has(type)
  )
    return true;
  if (
    settings?.erOverworld &&
    settings?.erOverworld !== 'none' &&
    OVERWORLD_TYPES.has(type)
  )
    return true;
  return false;
}

export function hasDekuPalaceJpLayout(
  settings: Record<string, unknown>,
): boolean {
  return hasSetSettingValue(settings?.jpLayouts, DEKU_PALACE_JP_LAYOUT);
}

export function isTrackedEntranceAvailable(
  key: string,
  settings: Record<string, unknown>,
): boolean {
  // Check both the raw key and its reverse against JP_LAYOUT_GROTTO_KEYS.
  const isJpGrotto =
    JP_LAYOUT_GROTTO_KEYS.has(key) ||
    (getEdgeReverse(key) !== null &&
      JP_LAYOUT_GROTTO_KEYS.has(getEdgeReverse(key)!));
  if (isJpGrotto && !hasDekuPalaceJpLayout(settings)) {
    return false;
  }
  return true;
}

export function computeEffectiveTrackedEntranceOverrides(
  overrides: Record<string, string>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const activeKeys = getActiveEntranceKeys(settings);
  if (activeKeys.size === 0) return {};

  const decoupled = Boolean(settings?.erDecoupled);
  const result: Record<string, string> = {};

  for (const [rawSrc, rawDst] of Object.entries(overrides)) {
    // Only accept sources directly in activeKeys.
    // In decoupled mode, also accept exit keys as independent sources.
    if (!activeKeys.has(rawSrc)) {
      if (!decoupled) continue;
      const rev = getEdgeReverse(rawSrc);
      if (!rev || !activeKeys.has(rev)) continue;
      if (!ENTRANCES_RAW[rawSrc]) continue;
    }

    if (
      !isTrackedDestinationAllowedForSource(
        rawSrc,
        rawDst,
        settings,
        activeKeys,
      )
    ) {
      continue;
    }

    if (!ENTRANCES_RAW[rawDst]) continue;
    result[rawSrc] = rawDst;
  }

  return result;
}

export function getActiveEntranceKeys(
  settings: Record<string, unknown>,
): Set<string> {
  const selectedGames = String(settings?.games ?? 'ootmm');
  const keys = new Set<string>();
  const erDungeons = settings?.erDungeons;
  const erBoss = settings?.erBoss;
  const erGrottos = settings?.erGrottos;
  const erRegions = settings?.erRegions;
  const erOverworld = settings?.erOverworld;
  const erIndoors = settings?.erIndoors;
  const erSpawns = settings?.erSpawns;
  const erWarps = settings?.erWarps;
  const enabledDungeonTypes = getEnabledDungeonTypes(settings);
  const enabledRegionTypes = getEnabledRegionSources(settings);
  const enabledOverworldTypes = getEnabledOverworldSources(settings);
  const enabledInteriorSources = getEnabledInteriorSources(settings);
  const enabledSpawnTypes = getEnabledSpawnSourceTypes(settings);
  const enabledWarpSources = getEnabledWarpSources(settings);

  for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
    if (selectedGames === 'oot' && data.game === 'mm') continue;
    if (selectedGames === 'mm' && data.game === 'oot') continue;
    if (!isTrackedEntranceAvailable(key, settings)) continue;

    if (erBoss && erBoss !== 'none' && BOSS_TYPES.has(data.type)) {
      keys.add(key);
      continue;
    }

    if (erDungeons && erDungeons !== 'none' && DUNGEON_TYPES.has(data.type)) {
      if (!enabledDungeonTypes.has(data.type)) continue;
      keys.add(key);
      continue;
    }

    if (erGrottos && erGrottos !== 'none' && GROTTO_TYPES.has(data.type)) {
      keys.add(key);
      continue;
    }

    if (
      erRegions &&
      erRegions !== 'none' &&
      enabledRegionTypes.has(data.type)
    ) {
      keys.add(key);
      continue;
    }

    if (
      erOverworld &&
      erOverworld !== 'none' &&
      enabledOverworldTypes.has(data.type)
    ) {
      keys.add(key);
      continue;
    }

    if (erIndoors && erIndoors !== 'none') {
      if (enabledInteriorSources.gameLinkKeys.has(key)) {
        keys.add(key);
        continue;
      }

      if (enabledInteriorSources.types.has(data.type)) {
        keys.add(key);
      }
    }

    if (erSpawns && erSpawns !== 'none' && enabledSpawnTypes.has(data.type)) {
      keys.add(key);
      continue;
    }

    const erOneWays = settings?.erOneWays;
    if (erOneWays && erOneWays !== 'none' && ONE_WAY_TYPES.has(data.type)) {
      const subSettingKey = ONE_WAY_SUB_SETTING_BY_TYPE[data.type];
      if (subSettingKey && !settings?.[subSettingKey]) {
        // Sub-setting off → don't add as 'one-way', but fall through
        // so warp types (one-way-song/one-way-statue) can still be
        // activated via the WARP_TYPES check below.
      } else {
        keys.add(key);
        continue;
      }
    }

    if (erWarps && erWarps !== 'none' && enabledWarpSources.has(data.type)) {
      keys.add(key);
    }

    const erWallmasters = settings?.erWallmasters;
    if (
      erWallmasters &&
      erWallmasters !== 'none' &&
      WALLMASTER_TYPES.has(data.type)
    ) {
      // MQ-only wallmaster: skip if dungeon is NOT in mqDungeons
      const mqDungeonCode = WALLMASTER_MQ_ONLY[key];
      if (
        mqDungeonCode &&
        !isSettingContains(settings, 'mqDungeons', mqDungeonCode)
      ) {
        continue;
      }
      // Vanilla-only wallmaster: skip if dungeon IS in mqDungeons
      const vanillaDungeonCode = WALLMASTER_VANILLA_ONLY[key];
      if (
        vanillaDungeonCode &&
        isSettingContains(settings, 'mqDungeons', vanillaDungeonCode)
      ) {
        continue;
      }
      keys.add(key);
    }

    // erNoPolarity: exit types appear as entrance rows in the sidebar
    // (polarity is 'any', so they won't appear in the exit section).
    // Only activate an exit key when its corresponding entrance (reverse)
    // has a type that is actually active — erNoPolarity itself must not
    // enable disabled pools or subtypes.
    if (settings?.erNoPolarity) {
      if (data.type === 'dungeon-exit') {
        const revKey = getEdgeReverse(key);
        const revType = revKey && ENTRANCES_RAW[revKey]?.type;
        if (
          erDungeons &&
          erDungeons !== 'none' &&
          revType &&
          enabledDungeonTypes.has(revType)
        ) {
          keys.add(key);
          continue;
        }
      }

      if (data.type === 'grotto-exit' || data.type === 'grave-exit') {
        if (erGrottos && erGrottos !== 'none') {
          keys.add(key);
          continue;
        }
      }

      if (data.type === 'region-exit') {
        const revKey = getEdgeReverse(key);
        const revType = revKey && ENTRANCES_RAW[revKey]?.type;
        if (
          erRegions &&
          erRegions !== 'none' &&
          revType &&
          enabledRegionTypes.has(revType) &&
          !(erOverworld && erOverworld !== 'none')
        ) {
          keys.add(key);
          continue;
        }
      }

      if (data.type === 'indoors-exit') {
        const revKey = getEdgeReverse(key);
        const revType = revKey && ENTRANCES_RAW[revKey]?.type;
        const reverseActive =
          (revType && enabledInteriorSources.types.has(revType)) ||
          (revKey && enabledInteriorSources.gameLinkKeys.has(revKey));
        if (erIndoors && erIndoors !== 'none' && reverseActive) {
          keys.add(key);
          continue;
        }
      }
    }
  }

  return keys;
}

/**
 * Get the label for an exit key (the dungeon you're exiting from).
 */
export function getExitLabel(exitKey: string): string {
  const data = ENTRANCES_RAW[exitKey];
  if (!data) return exitKey.replace(/_/g, ' ');
  const fromName =
    data.from && data.from !== 'NONE'
      ? data.from.replace(/^(OOT|MM) /, '')
      : null;
  const toName =
    data.to && data.to !== 'NONE' ? data.to.replace(/^(OOT|MM) /, '') : null;
  if (fromName && toName) {
    return `${fromName} to ${toName}`;
  }
  if (fromName) return fromName;
  return exitKey.replace(/_/g, ' ');
}

/**
 * Get a label for an exit key when used as a destination option.
 * Shows overworld location + dungeon name, e.g. "Desert Colossus Spirit Exit (Spirit Temple)".
 */
export function getExitEndpointLabel(exitKey: string): string {
  const data = ENTRANCES_RAW[exitKey];
  if (!data) return exitKey.replace(/_/g, ' ');
  const dungeonName =
    data.from && data.from !== 'NONE'
      ? data.from.replace(/^(OOT|MM) /, '')
      : '';
  const overworld =
    data.to && data.to !== 'NONE' ? data.to.replace(/^(OOT|MM) /, '') : '';
  if (overworld && dungeonName) return `${overworld} from ${dungeonName}`;
  return overworld || dungeonName || exitKey.replace(/_/g, ' ');
}

/**
 * Get the game for an entrance/exit key.
 */
export function getEntranceGame(key: string): 'oot' | 'mm' | null {
  const data = ENTRANCES_RAW[key];
  if (!data) return null;
  return data.game as 'oot' | 'mm';
}

/**
 * Remove entrance overrides whose source (or its reverse) is not in the
 * active entrance keys. Unlike filterEntranceOverridesForSettings, this
 * does NOT strip exit keys — both directions of a coupled pair are kept.
 * Use this for tracker-internal cleanup (e.g. after settings change).
 */
export function cleanupEntranceOverridesForSettings(
  overrides: Record<string, string>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const activeKeys = getActiveEntranceKeys(settings);
  if (activeKeys.size === 0) return {};

  const cleaned: Record<string, string> = {};
  for (const [src, dst] of Object.entries(overrides)) {
    // Keep if src is active, or its reverse is active (exit key case)
    if (
      activeKeys.has(src) ||
      (getEdgeReverse(src) && activeKeys.has(getEdgeReverse(src)!))
    ) {
      // Also validate destination
      if (
        !isTrackedDestinationAllowedForSource(src, dst, settings, activeKeys)
      ) {
        continue;
      }
      cleaned[src] = dst;
    }
  }
  return cleaned;
}

export function filterEntranceOverridesForSettings(
  overrides: Record<string, string>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const activeKeys = getActiveEntranceKeys(settings);
  if (activeKeys.size === 0) return {};

  const decoupled = Boolean(settings?.erDecoupled);
  const filtered: Record<string, string> = {};
  for (const [src, dst] of Object.entries(overrides)) {
    // Only accept sources directly in activeKeys (entrance case).
    // Exit sources are skipped in coupled mode — the coupling guarantees
    // a corresponding entrance→entrance pair exists.
    // In decoupled mode, exit sources are independent and must be preserved.
    if (!activeKeys.has(src)) {
      if (!decoupled) continue;
      // In decoupled mode: accept exit keys whose reverse is an active entrance.
      const rev = getEdgeReverse(src);
      if (!rev || !activeKeys.has(rev)) continue;
      // Also validate the exit key exists in raw data.
      if (!ENTRANCES_RAW[src]) continue;
    }

    if (!isTrackedDestinationAllowedForSource(src, dst, settings, activeKeys)) {
      continue;
    }

    // Preserve the raw destination — normalization is handled downstream
    // (e.g. in computeEffectiveTrackedEntranceOverrides for the tracker,
    // or by the OoTMM core for plando).
    filtered[src] = dst;
  }
  return filtered;
}

/**
 * Maps wallmaster (and similar "parasitic") entrance keys to the entrance key
 * of the location they physically reside in. Used to force the host location's
 * map marker to be visible when the child entrance is active, even if the host's
 * own shuffle pool is disabled.
 */
export const ENTRANCE_HOST_MAP: Record<string, string> = {
  // Dampe's wallmaster lives inside the Night 3 grave
  MM_WALLMASTER_DAMPE: 'MM_GRAVE_NIGHT3',
};

/** Inverted: host key → list of child keys that reside there */
const HOST_TO_CHILDREN: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [childKey, hostKey] of Object.entries(ENTRANCE_HOST_MAP)) {
    const list = map.get(hostKey);
    if (list) {
      list.push(childKey);
    } else {
      map.set(hostKey, [childKey]);
    }
  }
  return map;
})();

/**
 * Given a host entrance key and a set of active entrance keys,
 * return all child entrance keys that are hosted by the host
 * AND currently active.
 */
export function getActiveChildrenForHost(
  hostKey: string,
  activeKeys: ReadonlySet<string>,
): string[] {
  const children = HOST_TO_CHILDREN.get(hostKey);
  if (!children) return [];
  return children.filter((c) => activeKeys.has(c));
}
