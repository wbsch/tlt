import * as DataMod from '@ootmm/data';

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

const DUNGEON_TYPES = new Set(Object.keys(TYPE_TO_SETTING));
const GROTTO_TYPES = new Set(['grotto', 'grave']);
const INTERIOR_TYPES = new Set(['indoors', 'indoors-extra', 'indoors-pf']);
export const INTERIOR_GAME_LINK_SOURCE_KEYS = new Set([
  'OOT_SHOP_MASKS',
  'MM_CLOCK_TOWER_FROM_CLOCK_TOWN',
]);
const INTERIOR_EXIT_TYPES = new Set(['indoors-exit', 'indoors-link']);
const TRACKED_EXIT_TYPES = new Set([
  'dungeon-exit',
  'grotto-exit',
  'grave-exit',
  ...INTERIOR_EXIT_TYPES,
]);
const DEKU_PALACE_JP_LAYOUT = 'DekuPalace';
const JP_LAYOUT_GROTTO_KEYS = new Set([
  'MM_GROTTO_JP_CLIMB_LEFT',
  'MM_GROTTO_JP_CLIMB_RIGHT',
  'MM_GROTTO_JP_LINE_START',
  'MM_GROTTO_JP_LINE_END',
]);

export type TrackedEntrancePool = 'dungeon' | 'grotto' | 'interior';

function isTrackedInteriorSource(
  key: string | undefined,
  type: string,
): boolean {
  if (INTERIOR_TYPES.has(type)) return true;
  return Boolean(key && INTERIOR_GAME_LINK_SOURCE_KEYS.has(key));
}

function getEnabledInteriorSources(settings: Record<string, unknown>): {
  types: Set<string>;
  sourceKeys: Set<string>;
} {
  const types = new Set<string>();
  const sourceKeys = new Set<string>();

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
    for (const key of INTERIOR_GAME_LINK_SOURCE_KEYS) {
      sourceKeys.add(key);
    }
  }

  return { types, sourceKeys };
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
): TrackedEntrancePool | null {
  if (DUNGEON_TYPES.has(type)) return 'dungeon';
  if (GROTTO_TYPES.has(type)) return 'grotto';
  if (isTrackedInteriorSource(key, type)) return 'interior';
  return null;
}

export function isTrackedEntranceSourceType(
  type: string,
  key?: string,
): boolean {
  return getTrackedEntrancePool(type, key) !== null;
}

export function isTrackedEntranceExitType(type: string): boolean {
  return TRACKED_EXIT_TYPES.has(type);
}

export function normalizeTrackedEntranceKey(key: string): string {
  const data = ENTRANCES_RAW[key];
  if (!data || !isTrackedEntranceExitType(data.type)) return key;

  const reverse = data.reverse?.trim();
  if (!reverse) return key;

  const reverseData = ENTRANCES_RAW[reverse];
  if (!reverseData || !isTrackedEntranceSourceType(reverseData.type, reverse)) {
    return key;
  }

  return reverse;
}

export function getTrackedEntranceKeysForBinding(key: string): string[] {
  const normalized = normalizeTrackedEntranceKey(key);
  const keys = new Set<string>([normalized]);
  const data = ENTRANCES_RAW[key];
  if (data && isTrackedEntranceExitType(data.type)) {
    keys.add(key);
  }
  return [...keys];
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

export function hasDekuPalaceJpLayout(
  settings: Record<string, unknown>,
): boolean {
  return hasSetSettingValue(settings?.jpLayouts, DEKU_PALACE_JP_LAYOUT);
}

export function isTrackedEntranceAvailable(
  key: string,
  settings: Record<string, unknown>,
): boolean {
  const normalized = normalizeTrackedEntranceKey(key);
  if (
    JP_LAYOUT_GROTTO_KEYS.has(normalized) &&
    !hasDekuPalaceJpLayout(settings)
  ) {
    return false;
  }
  return true;
}

export function getActiveEntranceKeys(
  settings: Record<string, unknown>,
): Set<string> {
  const selectedGames = String(settings?.games ?? 'ootmm');
  const keys = new Set<string>();
  const erDungeons = settings?.erDungeons;
  const erGrottos = settings?.erGrottos;
  const erIndoors = settings?.erIndoors;
  const enabledDungeonTypes = getEnabledDungeonTypes(settings);
  const enabledInteriorSources = getEnabledInteriorSources(settings);

  for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
    if (selectedGames === 'oot' && data.game === 'mm') continue;
    if (selectedGames === 'mm' && data.game === 'oot') continue;
    if (!isTrackedEntranceAvailable(key, settings)) continue;

    if (erDungeons && erDungeons !== 'none' && DUNGEON_TYPES.has(data.type)) {
      if (!enabledDungeonTypes.has(data.type)) continue;
      keys.add(key);
      continue;
    }

    if (erGrottos && erGrottos !== 'none' && GROTTO_TYPES.has(data.type)) {
      keys.add(key);
      continue;
    }

    if (erIndoors && erIndoors !== 'none') {
      if (enabledInteriorSources.sourceKeys.has(key)) {
        keys.add(key);
        continue;
      }

      if (enabledInteriorSources.types.has(data.type)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

/**
 * For a source entrance key, return its reverse (exit) key, or null if none.
 */
export function getExitKeyForEntrance(sourceKey: string): string | null {
  const data = ENTRANCES_RAW[sourceKey];
  if (!data) return null;
  const rev = data.reverse?.trim();
  if (!rev || !ENTRANCES_RAW[rev]) return null;
  return rev;
}

/**
 * Get the label for an exit key (the dungeon you're exiting from).
 */
export function getExitLabel(exitKey: string): string {
  const data = ENTRANCES_RAW[exitKey];
  if (!data) return exitKey.replace(/_/g, ' ');
  if (data.from && data.from !== 'NONE') {
    return data.from.replace(/^(OOT|MM) /, '');
  }
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
  if (overworld && dungeonName) return `${overworld} (${dungeonName})`;
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
 * Given an exit mapping exitSrc → exitDst, derive the corresponding entrance mapping.
 * Exit key = reverse(entranceDst), exit destination = reverse(entranceSrc).
 * So entrance mapping = reverse(exitDst) → reverse(exitSrc).
 * Returns { entranceSrc, entranceDst } or null if derivation fails.
 */
export function deriveEntranceFromExitMapping(
  exitSrcKey: string,
  exitDstKey: string,
): { entranceSrc: string; entranceDst: string } | null {
  const exitSrcData = ENTRANCES_RAW[exitSrcKey];
  const exitDstData = ENTRANCES_RAW[exitDstKey];
  if (!exitSrcData?.reverse || !exitDstData?.reverse) return null;
  const entranceDst = exitSrcData.reverse.trim();
  const entranceSrc = exitDstData.reverse.trim();
  if (!entranceDst || !entranceSrc) return null;
  if (!ENTRANCES_RAW[entranceDst] || !ENTRANCES_RAW[entranceSrc]) return null;
  return { entranceSrc, entranceDst };
}

/**
 * Derive exit overrides from entrance overrides.
 * For each entrance mapping src → dst, the exit mapping is reverse(dst) → reverse(src).
 */
export function computeExitOverrides(
  entranceOverrides: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [src, dst] of Object.entries(entranceOverrides)) {
    const srcData = ENTRANCES_RAW[src];
    const dstData = ENTRANCES_RAW[dst];
    if (!srcData?.reverse || !dstData?.reverse) continue;
    const srcRev = srcData.reverse.trim();
    const dstRev = dstData.reverse.trim();
    if (!srcRev || !dstRev) continue;
    if (!ENTRANCES_RAW[srcRev] || !ENTRANCES_RAW[dstRev]) continue;
    result[dstRev] = srcRev;
  }
  return result;
}

export function filterEntranceOverridesForSettings(
  overrides: Record<string, string>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const activeKeys = getActiveEntranceKeys(settings);
  if (activeKeys.size === 0) return {};

  const filtered: Record<string, string> = {};
  for (const [src, dst] of Object.entries(overrides)) {
    const normalizedSrc = normalizeTrackedEntranceKey(src);
    const normalizedDst = normalizeTrackedEntranceKey(dst);
    if (!activeKeys.has(normalizedSrc)) continue;
    if (!activeKeys.has(normalizedDst)) continue;
    filtered[normalizedSrc] = normalizedDst;
  }
  return filtered;
}
