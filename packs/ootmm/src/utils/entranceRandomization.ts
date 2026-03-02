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

export function getActiveDungeonEntranceKeys(
  settings: Record<string, unknown>,
): Set<string> {
  const erDungeons = settings?.erDungeons;
  if (erDungeons === 'none' || !erDungeons) return new Set<string>();

  const selectedGames = String(settings?.games ?? 'ootmm');
  const enabledTypes = getEnabledDungeonTypes(settings);
  const keys = new Set<string>();

  for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
    if (!DUNGEON_TYPES.has(data.type)) continue;
    if (selectedGames === 'oot' && data.game === 'mm') continue;
    if (selectedGames === 'mm' && data.game === 'oot') continue;
    if (!enabledTypes.has(data.type)) continue;
    keys.add(key);
  }

  return keys;
}

export function filterEntranceOverridesForSettings(
  overrides: Record<string, string>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const activeKeys = getActiveDungeonEntranceKeys(settings);
  if (activeKeys.size === 0) return {};

  const filtered: Record<string, string> = {};
  for (const [src, dst] of Object.entries(overrides)) {
    if (!activeKeys.has(src)) continue;
    if (!activeKeys.has(dst)) continue;
    filtered[src] = dst;
  }
  return filtered;
}
