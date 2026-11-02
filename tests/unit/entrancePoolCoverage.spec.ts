import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getActiveEntranceKeys,
  isTrackedOneWayDestination,
  isTrackedSpawnDestination,
  isTrackedWallmasterDestination,
} from '../../packs/ootmm/src/utils/entranceRandomization';

type EntranceData = {
  game: 'oot' | 'mm';
  type: string;
  reverse?: string;
};

type EntranceMenuRef = {
  entrances: number;
  exits: number;
  both: number;
};

const ENTRANCES = JSON.parse(
  readFileSync(
    path.resolve('OoTMM/packages/data/dist/lib/data-entrances.json'),
    'utf8',
  ),
) as Record<string, EntranceData>;

const DEFAULT_TRACKER_SETTINGS = {
  games: 'oot',
  erBoss: 'none',
  erDungeons: 'none',
  erGrottos: 'none',
  erRegions: 'none',
  erRegionsExtra: false,
  erRegionsShortcuts: false,
  erOverworld: 'none',
  erIndoors: 'none',
  erSpawns: 'none',
  erWarps: 'none',
  erMixed: 'none',
  erMixedRegions: false,
  erMixedOverworld: false,
  erPiratesWorld: false,
  erIndoorsMajor: false,
  erIndoorsExtra: false,
  erIndoorsGameLinks: false,
  erOneWaysSongs: false,
  erOneWaysStatues: false,
};

function collectEntranceMenuRefs(): Map<string, EntranceMenuRef> {
  const mapsDir = path.resolve('packs/ootmm/src/data/maps');
  const refs = new Map<string, EntranceMenuRef>();

  const walkMarkers = (items: unknown[]) => {
    for (const marker of items) {
      if (!marker || typeof marker !== 'object') continue;

      const markerObj = marker as {
        entranceMenu?: { entranceIds?: string | string[]; display?: string };
        markers?: unknown[];
      };

      const entranceIds = markerObj.entranceMenu?.entranceIds;
      if (entranceIds) {
        const ids = Array.isArray(entranceIds) ? entranceIds : [entranceIds];
        const display = markerObj.entranceMenu?.display ?? 'both';

        for (const id of ids) {
          const ref = refs.get(id) ?? { entrances: 0, exits: 0, both: 0 };
          if (display === 'entrances') {
            ref.entrances += 1;
          } else if (display === 'exits') {
            ref.exits += 1;
          } else {
            ref.both += 1;
          }
          refs.set(id, ref);
        }
      }

      if (Array.isArray(markerObj.markers)) {
        walkMarkers(markerObj.markers);
      }
    }
  };

  for (const fileName of readdirSync(mapsDir)) {
    if (!fileName.endsWith('.json')) continue;

    const mapData = JSON.parse(
      readFileSync(path.join(mapsDir, fileName), 'utf8'),
    ) as { markers?: unknown[] };
    walkMarkers(mapData.markers ?? []);
  }

  return refs;
}

describe('entrance pool coverage', () => {
  it('matches OoTMM overworld pool composition for regions, extras, and shortcuts', () => {
    const regionKeys = getActiveEntranceKeys({
      ...DEFAULT_TRACKER_SETTINGS,
      erRegions: 'ownGame',
    });
    const overworldKeys = getActiveEntranceKeys({
      ...DEFAULT_TRACKER_SETTINGS,
      erOverworld: 'ownGame',
    });

    expect(regionKeys.has('OOT_LAKE_HYLIA_FROM_FIELD')).toBe(true);
    expect(overworldKeys.has('OOT_LAKE_HYLIA_FROM_FIELD')).toBe(true);
    expect(regionKeys.has('OOT_MARKET_ENTRANCE_FROM_FIELD')).toBe(false);
    expect(regionKeys.has('OOT_GORON_CITY_FROM_LOST_WOODS')).toBe(false);
    expect(overworldKeys.has('OOT_MARKET_ENTRANCE_FROM_FIELD')).toBe(true);
    expect(overworldKeys.has('OOT_GORON_CITY_FROM_LOST_WOODS')).toBe(true);
    expect(overworldKeys.has('OOT_LAKE_HYLIA_FROM_ZORA_DOMAIN')).toBe(true);
  });

  it('includes Pirates Fortress main entrance in overworld shuffle when its extra setting is enabled', () => {
    const overworldKeys = getActiveEntranceKeys({
      ...DEFAULT_TRACKER_SETTINGS,
      games: 'mm',
      erOverworld: 'ownGame',
      erPiratesWorld: true,
    });

    expect(overworldKeys.has('MM_PIRATE_FORTRESS')).toBe(true);
    expect(overworldKeys.has('MM_SEWERS_FROM_EXTERIOR_GATE')).toBe(true);
  });

  it('includes entrance and exit submenu markers for every tracked major-region source edge', () => {
    const refs = collectEntranceMenuRefs();
    const regionTypes = new Set(['region', 'region-extra', 'region-shortcut']);

    const missingRefs = Object.entries(ENTRANCES)
      .filter(([, data]) => regionTypes.has(data.type) && data.reverse)
      .map(([key]) => {
        const ref = refs.get(key);
        const hasEntrance = Boolean(ref && (ref.entrances > 0 || ref.both > 0));
        const hasExit = Boolean(ref && (ref.exits > 0 || ref.both > 0));
        return hasEntrance && hasExit
          ? null
          : {
              key,
              hasEntrance,
              hasExit,
            };
      })
      .filter((entry) => entry !== null);

    expect(missingRefs).toEqual([]);
  });

  it('only adds dungeon, dungeon-minor, and dungeon-sh unconditionally to wallmaster destinations', () => {
    const settings = { games: 'ootmm', erWallmasters: 'full' };

    for (const type of ['dungeon', 'dungeon-minor', 'dungeon-sh']) {
      expect(isTrackedWallmasterDestination(type, settings)).toBe(true);
    }
    for (const type of [
      'dungeon-ganon',
      'dungeon-ganon-tower',
      'dungeon-pf',
      'dungeon-btw',
      'dungeon-acoi',
      'dungeon-ss',
      'dungeon-ctr',
    ]) {
      expect(isTrackedWallmasterDestination(type, settings)).toBe(false);
    }
  });

  it('gates non-unconditional dungeon types for wallmasters through erDungeons sub-settings', () => {
    const base = {
      games: 'ootmm',
      erWallmasters: 'full',
      erDungeons: 'full',
    };

    expect(
      isTrackedWallmasterDestination('dungeon-ganon', {
        ...base,
        erMajorDungeons: true,
      }),
    ).toBe(false);
    expect(
      isTrackedWallmasterDestination('dungeon-ganon', {
        ...base,
        erGanonCastle: true,
      }),
    ).toBe(true);
    expect(
      isTrackedWallmasterDestination('dungeon-btw', {
        ...base,
        erBeneathWell: true,
      }),
    ).toBe(true);
  });

  it('restricts wallmaster interior destinations to enabled interior sub-pools', () => {
    const settings = {
      games: 'ootmm',
      erWallmasters: 'full',
      erIndoors: 'full',
      erIndoorsMajor: true,
    };

    expect(isTrackedWallmasterDestination('indoors', settings)).toBe(true);
    expect(isTrackedWallmasterDestination('indoors-extra', settings)).toBe(
      false,
    );
    expect(isTrackedWallmasterDestination('indoors-pf', settings)).toBe(false);
  });

  it('never offers telescope interiors as wallmaster destinations', () => {
    const settings = {
      games: 'ootmm',
      erWallmasters: 'full',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsTelescopes: true,
    };

    expect(isTrackedWallmasterDestination('indoors-telescope', settings)).toBe(
      false,
    );
  });

  it('omits one-way types from wallmaster destinations under erOneWaysAnywhere', () => {
    expect(
      isTrackedWallmasterDestination('one-way', {
        games: 'ootmm',
        erWallmasters: 'full',
        erOneWays: 'full',
        erOneWaysMajor: true,
      }),
    ).toBe(true);
    expect(
      isTrackedWallmasterDestination('one-way', {
        games: 'ootmm',
        erWallmasters: 'full',
        erOneWays: 'full',
        erOneWaysMajor: true,
        erOneWaysAnywhere: true,
      }),
    ).toBe(false);
  });

  it('removes telescope interiors from spawn destinations', () => {
    const settings = {
      games: 'ootmm',
      erSpawns: 'both',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsTelescopes: true,
    };

    expect(
      isTrackedSpawnDestination(
        'MM_TERMINA_FIELD_TELESCOPE',
        'indoors-telescope',
        settings,
      ),
    ).toBe(false);
    expect(
      isTrackedSpawnDestination('OOT_HOUSE_MIDO', 'indoors', settings),
    ).toBe(true);
  });

  it('only adds dungeon, dungeon-minor, and dungeon-sh unconditionally to one-way-anywhere destinations', () => {
    const settings = {
      games: 'ootmm',
      erOneWays: 'full',
      erOneWaysAnywhere: true,
      erOneWaysMajor: true,
    };

    for (const type of ['dungeon', 'dungeon-minor', 'dungeon-sh']) {
      expect(isTrackedOneWayDestination(type, settings)).toBe(true);
    }
    for (const type of [
      'dungeon-ganon',
      'dungeon-ganon-tower',
      'dungeon-pf',
      'dungeon-btw',
      'dungeon-acoi',
      'dungeon-ss',
      'dungeon-ctr',
    ]) {
      expect(isTrackedOneWayDestination(type, settings)).toBe(false);
    }
  });

  it('restricts one-way-anywhere interior destinations to enabled interior sub-pools', () => {
    const settings = {
      games: 'ootmm',
      erOneWays: 'full',
      erOneWaysAnywhere: true,
      erOneWaysMajor: true,
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsTelescopes: true,
    };

    expect(isTrackedOneWayDestination('indoors', settings)).toBe(true);
    expect(isTrackedOneWayDestination('indoors-telescope', settings)).toBe(
      true,
    );
    expect(isTrackedOneWayDestination('indoors-extra', settings)).toBe(false);
    expect(isTrackedOneWayDestination('indoors-pf', settings)).toBe(false);
  });
});
