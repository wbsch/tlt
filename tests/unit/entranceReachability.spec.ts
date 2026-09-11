import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';
import type { OoTMMSettings } from '../../packs/ootmm/src/types/settings';

describe('entrance reachability', () => {
  it('keeps mapped reverse exits reachable from their original source side', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      erDungeons: 'full',
      erMajorDungeons: true,
      erMinorDungeons: true,
      erRegions: 'full',
      erRegionsExtra: true,
      erRegionsShortcuts: true,
      erMixed: 'full',
      erMixedDungeons: true,
      erMixedRegions: true,
      plando: {
        entrances: {
          OOT_TEMPLE_WATER: 'MM_SWAMP_FROM_ROAD',
        },
      },
    });

    const result = tracker.checkReachability(tracker.getItemMaxCounts());
    const reachableEntranceIds = new Set(
      (result.extra as { reachableEntranceIds?: string[] } | undefined)
        ?.reachableEntranceIds ?? [],
    );

    expect(reachableEntranceIds.has('MM_SWAMP_ROAD_FROM_SWAMP')).toBe(true);
  }, 30000);

  it('applies spawn mappings as additive edges when they share a destination', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      erSpawns: 'both',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: false,
      plando: {
        entrances: {
          OOT_HOUSE_SARIA: 'OOT_KOKIRI_SHOP',
          OOT_SPAWN_CHILD: 'OOT_KOKIRI_SHOP',
          OOT_SPAWN_ADULT: 'OOT_KOKIRI_SHOP',
        },
      },
    });

    const world = (
      tracker as unknown as {
        worlds: Array<{
          areas?: Record<string, { exits?: Record<string, unknown> }>;
        }>;
      }
    ).worlds[0];

    expect(
      world.areas?.['OOT SPAWN CHILD']?.exits?.['OOT Kokiri Shop'],
    ).toBeTruthy();
    expect(
      world.areas?.['OOT SPAWN CHILD']?.exits?.["OOT Link's House"],
    ).toBeUndefined();
    expect(
      world.areas?.['OOT SPAWN ADULT']?.exits?.['OOT Kokiri Shop'],
    ).toBeTruthy();
    expect(
      world.areas?.['OOT SPAWN ADULT']?.exits?.['OOT Temple of Time'],
    ).toBeUndefined();
    expect(
      world.areas?.['OOT Kokiri Forest']?.exits?.['OOT Kokiri Shop'],
    ).toBeTruthy();
  }, 30000);

  it('treats returning to spawn as available at the current time of day', async () => {
    // Child spawns in the Graveyard; the only way off the Graveyard is a door
    // that leads to the time-flowing Desert Colossus, and the way back is
    // bomb-gated. The player can still save and "Return to Spawn" with the
    // night they reached in Desert Colossus, so the night-gated graves must be
    // reachable even without bombs.
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      startingAge: 'child',
      erSpawns: 'both',
      erOverworld: 'full',
      erGrottos: 'full',
      plando: {
        entrances: {
          OOT_SPAWN_CHILD: 'OOT_GRAVEYARD_FROM_TEMPLE_SHADOW',
          OOT_KAKARIKO_FROM_GRAVEYARD: 'OOT_DESERT_COLOSSUS_FROM_FAIRY',
          OOT_FAIRY_NAYRU: 'OOT_GRAVEYARD',
        },
      },
    });

    const result = tracker.checkReachability(new Map());
    const reachableEntranceIds = new Set(
      (result.extra as { reachableEntranceIds?: string[] } | undefined)
        ?.reachableEntranceIds ?? [],
    );

    expect(reachableEntranceIds.has('OOT_GRAVE_REDEAD')).toBe(true);
  }, 30000);

  // An ER interior entrance from OoT straight into MM used to deadlock: using
  // it requires the MM `ACCESS` event (`can_reset_time`), which OoTMM only
  // grants once the player is already inside Termina. With `moonCrash: cycle`
  // the player can always reset time, so walking through the entrance should
  // put them in Termina and make the reverse exit reachable.
  const ootToMmEntranceSettings: Partial<OoTMMSettings> = {
    games: 'ootmm',
    erIndoors: 'full',
    erIndoorsMajor: true,
    erIndoorsExtra: true,
    erOverworld: 'full',
    erRegions: 'full',
    erRegionsExtra: true,
    erSpawns: 'both',
    plando: {
      entrances: {
        OOT_SPAWN_CHILD: 'OOT_LAKE_HYLIA_FROM_FIELD',
        OOT_LAKE_HYLIA_FROM_FIELD: 'OOT_TEMPLE_OF_TIME_ENTRYWAY_FROM_MARKET',
        OOT_TEMPLE_OF_TIME: 'MM_DEKU_SHRINE',
      },
    },
  };

  it('grants Termina access through an ER interior entrance into MM', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      ...ootToMmEntranceSettings,
      moonCrash: 'cycle',
    });

    const result = tracker.checkReachability(new Map());
    const reachableEntranceIds = new Set(
      (result.extra as { reachableEntranceIds?: string[] } | undefined)
        ?.reachableEntranceIds ?? [],
    );

    // Reverse exit "Deku Shrine -> Temple of Time Entryway".
    expect(
      reachableEntranceIds.has('MM_DEKU_PALACE_EXTERIOR_FROM_SHRINE'),
    ).toBe(true);
  }, 30000);

  it('keeps an ER interior entrance into MM unreachable when time cannot be reset', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      ...ootToMmEntranceSettings,
      moonCrash: 'reset',
    });

    const result = tracker.checkReachability(new Map());
    const reachableEntranceIds = new Set(
      (result.extra as { reachableEntranceIds?: string[] } | undefined)
        ?.reachableEntranceIds ?? [],
    );

    expect(
      reachableEntranceIds.has('MM_DEKU_PALACE_EXTERIOR_FROM_SHRINE'),
    ).toBe(false);
  }, 30000);
});
