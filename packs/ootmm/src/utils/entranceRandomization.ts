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
const TRACKED_SOURCE_TYPES = new Set([...DUNGEON_TYPES, ...GROTTO_TYPES]);
const TRACKED_EXIT_TYPES = new Set([
  'dungeon-exit',
  'grotto-exit',
  'grave-exit',
]);
const DEKU_PALACE_JP_LAYOUT = 'DekuPalace';
const JP_LAYOUT_GROTTO_KEYS = new Set([
  'MM_GROTTO_JP_CLIMB_LEFT',
  'MM_GROTTO_JP_CLIMB_RIGHT',
  'MM_GROTTO_JP_LINE_START',
  'MM_GROTTO_JP_LINE_END',
]);

export type TrackedEntrancePool = 'dungeon' | 'grotto';

export function getEnabledDungeonTypes(
  settings: Record<string, unknown>,
): Set<string> {
  const enabled = new Set<string>();
  enabled.add('dungeon');
  for (const [type, settingKey] of Object.entries(TYPE_TO_SETTING)) {
    if (settings?.[settingKey]) {
      enabled.add(type);
    }
  }

  return enabled;
}

export function getTrackedEntrancePool(
  type: string,
): TrackedEntrancePool | null {
  if (DUNGEON_TYPES.has(type)) return 'dungeon';
  if (GROTTO_TYPES.has(type)) return 'grotto';
  return null;
}

export function isTrackedEntranceSourceType(type: string): boolean {
  return TRACKED_SOURCE_TYPES.has(type);
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
  if (!reverseData || !isTrackedEntranceSourceType(reverseData.type)) {
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
  const enabledDungeonTypes = getEnabledDungeonTypes(settings);

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
    }
  }

  return keys;
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
