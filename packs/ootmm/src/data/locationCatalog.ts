import * as OoTMMDataMod from '@ootmm/data';

export type LocationCatalogEntry = {
  id: string;
  name: string;
  category: string;
  area: string;
  isSkulltulaToken: boolean;
  isStrayFairy: boolean;
};

type GameId = 'oot' | 'mm';
type PoolRecord = {
  location?: unknown;
  type?: unknown;
  item?: unknown;
};
type WorldAreaRecord = {
  locations?: Record<string, unknown>;
};

const resolveExport = <T>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown };
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T);
};

const POOL = resolveExport<Record<GameId, PoolRecord[]>>(OoTMMDataMod, 'POOL');
const WORLD = resolveExport<
  Record<GameId, Record<string, Record<string, WorldAreaRecord>>>
>(OoTMMDataMod, 'WORLD');

const GAMES: GameId[] = ['oot', 'mm'];

function toLocationName(game: GameId, locationName: string): string {
  return `${game.toUpperCase()} ${locationName}`;
}

function toItemId(game: GameId, itemName: string): string {
  if (!itemName || itemName === 'NOTHING') return itemName;
  return `${game.toUpperCase()}_${itemName}`;
}

function getAreaFromLocation(locationName: string): string {
  const parts = locationName.split(' ');
  if (parts.length <= 1) return locationName;
  return parts.slice(1).join(' ');
}

function buildWorldLocationSet(): Set<string> {
  const locationNames = new Set<string>();

  for (const game of GAMES) {
    const worldByGame = WORLD?.[game];
    for (const areaSet of Object.values(worldByGame ?? {})) {
      for (const area of Object.values(areaSet ?? {})) {
        for (const locationName of Object.keys(area?.locations ?? {})) {
          locationNames.add(toLocationName(game, locationName));
        }
      }
    }
  }

  return locationNames;
}

function buildCatalog(): LocationCatalogEntry[] {
  const validLocationNames = buildWorldLocationSet();
  const byId = new Map<string, LocationCatalogEntry>();

  for (const game of GAMES) {
    const pool = POOL?.[game] ?? [];
    for (const record of pool) {
      const locationName = String(record.location ?? '');
      if (!locationName) continue;

      const fullLocationName = toLocationName(game, locationName);
      if (!validLocationNames.has(fullLocationName)) continue;

      const id = `${fullLocationName}@0`;
      if (byId.has(id)) continue;

      const category = String(record.type ?? 'None');
      const itemId = toItemId(game, String(record.item ?? ''));

      byId.set(id, {
        id,
        name: fullLocationName,
        category,
        area: getAreaFromLocation(fullLocationName),
        isSkulltulaToken:
          itemId === 'OOT_GS_TOKEN' ||
          itemId === 'MM_GS_TOKEN_SWAMP' ||
          itemId === 'MM_GS_TOKEN_OCEAN',
        isStrayFairy:
          itemId.startsWith('MM_STRAY_FAIRY_') &&
          itemId !== 'MM_STRAY_FAIRY_TOWN',
      });
    }
  }

  for (const fullLocationName of validLocationNames) {
    const id = `${fullLocationName}@0`;
    if (byId.has(id)) continue;

    byId.set(id, {
      id,
      name: fullLocationName,
      category: 'None',
      area: getAreaFromLocation(fullLocationName),
      isSkulltulaToken: false,
      isStrayFairy: false,
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export const LOCATION_CODE_CATALOG: LocationCatalogEntry[] = buildCatalog();
