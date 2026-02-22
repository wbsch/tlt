import * as OoTMMDataMod from '@ootmm/data';
import {
  buildLocationCodeSet,
  collectWorldLocationNames,
  toLocationName,
  type HintsLikeData,
  type WorldLikeData,
} from './locationCodeSource';

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

const resolveExport = <T>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown };
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T);
};

const POOL = resolveExport<Record<GameId, PoolRecord[]>>(OoTMMDataMod, 'POOL');
const WORLD = resolveExport<WorldLikeData>(OoTMMDataMod, 'WORLD');
const RAW_HINTS_DATA = resolveExport<HintsLikeData>(
  OoTMMDataMod,
  'RAW_HINTS_DATA',
);

const GAMES: GameId[] = ['oot', 'mm'];

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
  return collectWorldLocationNames(WORLD);
}

function buildReferenceLocationSet(): Set<string> {
  return new Set(buildLocationCodeSet(WORLD, RAW_HINTS_DATA));
}

function buildCatalog(): LocationCatalogEntry[] {
  const worldLocationNames = buildWorldLocationSet();
  const referenceLocationNames = buildReferenceLocationSet();
  const byId = new Map<string, LocationCatalogEntry>();

  for (const game of GAMES) {
    const pool = POOL?.[game] ?? [];
    for (const record of pool) {
      const locationName = String(record.location ?? '');
      if (!locationName) continue;

      const fullLocationName = toLocationName(game, locationName);
      if (!worldLocationNames.has(fullLocationName)) continue;

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

  for (const fullLocationName of referenceLocationNames) {
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
