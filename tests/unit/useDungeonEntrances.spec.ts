import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDungeonEntrances } from '@packs/ootmm/composables/useDungeonEntrances';
import { filterEntranceOverridesForSettings } from '@packs/ootmm/utils/entranceRandomization';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';
import { useOoTMMUiStore } from '@packs/ootmm/stores/ootmmUi';

describe('useDungeonEntrances', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps ootmm game-link partners available as reverse-edge exit destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: false,
      erIndoorsGameLinks: true,
    };
    sessionStore.setEntranceOverrides({
      OOT_SHOP_MASKS: 'OOT_BOMBCHU_BOWLING',
    });

    const entrances = useDungeonEntrances();
    const bowlingExit = entrances.activeExitEntries.value.find(
      (entry) => entry.key === 'OOT_MARKET_FROM_BOWLING',
    );

    expect(bowlingExit).toBeTruthy();
    expect(
      entrances.getExitSelectedDestination('OOT_MARKET_FROM_BOWLING'),
    ).toBe('OOT_MARKET_FROM_MASK_SHOP');

    const options = entrances.destinationOptionsForExit(bowlingExit!);
    expect(
      options.some((option) => option.value === 'OOT_MARKET_FROM_MASK_SHOP'),
    ).toBe(true);
  });

  it('offers both entrance and exit aliases for ootmm game-link entrance rows', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: false,
      erIndoorsGameLinks: true,
    };

    const entrances = useDungeonEntrances();
    const maskShopRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SHOP_MASKS',
    );

    expect(maskShopRow).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(maskShopRow!);
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_BOMBCHU_BOWLING' &&
          option.label === 'Bombchu Bowling from Market',
      ),
    ).toBe(true);
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_MARKET_FROM_BOWLING' &&
          option.label === 'Market from Bombchu Bowling',
      ),
    ).toBe(true);

    const clockTowerRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'MM_CLOCK_TOWER_FROM_CLOCK_TOWN',
    );

    expect(clockTowerRow).toBeTruthy();

    const clockTowerOptions = entrances.destinationOptionsForEntrance(
      clockTowerRow!,
    );
    expect(
      clockTowerOptions.some(
        (option) =>
          option.value === 'MM_CLOCK_TOWN_FROM_CLOCK_TOWER' &&
          option.label === 'Clock Town From Clock Tower from Clock Tower',
      ),
    ).toBe(true);
  });

  it('derives the inverse entrance row with the correct edge label from an entrance mapping', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: true,
      erIndoorsGameLinks: true,
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination(
      'OOT_HOUSE_SARIA',
      'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
    );

    expect(entrances.getSelectedDestination('OOT_HOUSE_SARIA')).toBe(
      'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
    );
    expect(
      entrances.getSelectedDestination('MM_CLOCK_TOWER_FROM_CLOCK_TOWN'),
    ).toBe('OOT_KOKIRI_FOREST_FROM_SARIA');
    expect(
      entrances.getExitSelectedDestination('OOT_KOKIRI_FOREST_FROM_SARIA'),
    ).toBe('');
    expect(
      entrances.getExitSelectedDestination('MM_CLOCK_TOWER_FROM_CLOCK_TOWN'),
    ).toBe('OOT_KOKIRI_FOREST_FROM_SARIA');
    expect(
      sessionStore.entranceOverrides['MM_CLOCK_TOWER_FROM_CLOCK_TOWN'],
    ).toBeUndefined();
    expect(sessionStore.entranceOverrides['OOT_HOUSE_SARIA']).toBe(
      'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
    );

    const midoRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_HOUSE_MIDO',
    );
    expect(midoRow).toBeTruthy();
    expect(
      entrances
        .destinationOptionsForEntrance(midoRow!)
        .some((option) => option.value === 'OOT_HOUSE_SARIA'),
    ).toBe(true);
  });

  it('derives the inverse entrance row with the correct edge label from an exit mapping', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: true,
      erIndoorsGameLinks: true,
    };

    const entrances = useDungeonEntrances();
    entrances.setExitDestination(
      'OOT_KOKIRI_FOREST_FROM_SARIA',
      'MM_CLOCK_TOWN_FROM_CLOCK_TOWER',
    );

    expect(
      entrances.getExitSelectedDestination('OOT_KOKIRI_FOREST_FROM_SARIA'),
    ).toBe('MM_CLOCK_TOWN_FROM_CLOCK_TOWER');
    expect(
      entrances.getSelectedDestination('MM_CLOCK_TOWER_FROM_CLOCK_TOWN'),
    ).toBe('OOT_HOUSE_SARIA');
    expect(entrances.getSelectedDestination('OOT_HOUSE_SARIA')).toBe('');
    expect(
      sessionStore.entranceOverrides['MM_CLOCK_TOWER_FROM_CLOCK_TOWN'],
    ).toBe('OOT_HOUSE_SARIA');
  });

  it('activates major region entrances and exits when region shuffle is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erRegions: 'full',
      erRegionsExtra: true,
      erRegionsShortcuts: true,
    };

    const entrances = useDungeonEntrances();

    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_ZORA_RIVER_FROM_FIELD' && entry.pool === 'region',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_MARKET_ENTRANCE_FROM_FIELD' &&
          entry.pool === 'region',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_ZORA_RIVER_FROM_LOST_WOODS' &&
          entry.pool === 'region',
      ),
    ).toBe(true);
    expect(
      entrances.activeExitEntries.value.some(
        (entry) =>
          entry.key === 'OOT_FIELD_FROM_ZORA_RIVER' && entry.pool === 'region',
      ),
    ).toBe(true);
  });

  it('mixes region destinations into other mixed entrance pools when enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erRegions: 'full',
      erRegionsExtra: true,
      erRegionsShortcuts: false,
      erMixed: 'full',
      erMixedRegions: true,
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: false,
      erIndoorsGameLinks: false,
      erMixedIndoors: true,
    };

    const entrances = useDungeonEntrances();
    const kokiriShop = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_KOKIRI_SHOP',
    );

    expect(kokiriShop).toBeTruthy();
    expect(
      entrances
        .destinationOptionsForEntrance(kokiriShop!)
        .some((option) => option.value === 'OOT_MARKET_ENTRANCE_FROM_FIELD'),
    ).toBe(true);
  });

  it('activates spawn rows and matches OoTMM spawn dropdown destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
    };

    const entrances = useDungeonEntrances();
    const childSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_CHILD',
    );
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );

    expect(childSpawn?.pool).toBe('spawn');
    expect(childSpawn?.displayLabel).toBe('Child Spawn');
    expect(adultSpawn?.displayLabel).toBe('Adult Spawn');
    expect(
      entrances.activeExitEntries.value.some((entry) => entry.pool === 'spawn'),
    ).toBe(false);

    const options = entrances.destinationOptionsForEntrance(childSpawn!);

    expect(options.some((option) => option.value === 'OOT_SPAWN_ADULT')).toBe(
      false,
    );
    expect(options.some((option) => option.value === 'OOT_SPAWN_CHILD')).toBe(
      false,
    );
    expect(
      options.some((option) => option.value === 'OOT_KAKARIKO_FROM_FIELD'),
    ).toBe(true);
    expect(options.some((option) => option.value === 'OOT_KOKIRI_SHOP')).toBe(
      true,
    );
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_WARP_SONG_LAKE' &&
          option.label === 'Lake Hylia',
      ),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'MM_WARP_OWL_CLOCK_TOWN'),
    ).toBe(false);
    expect(
      options.some(
        (option) => option.value === 'OOT_ZORA_RIVER_FROM_LOST_WOODS',
      ),
    ).toBe(false);
  });

  it('preserves spawn mappings to valid non-active destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination('OOT_SPAWN_CHILD', 'OOT_KOKIRI_SHOP');

    expect(sessionStore.entranceOverrides['OOT_SPAWN_CHILD']).toBe(
      'OOT_KOKIRI_SHOP',
    );
    expect(entrances.getSelectedDestination('OOT_SPAWN_CHILD')).toBe(
      'OOT_KOKIRI_SHOP',
    );
    expect(
      filterEntranceOverridesForSettings(
        sessionStore.entranceOverrides,
        sessionStore.trackerSettings,
      ),
    ).toEqual({
      OOT_SPAWN_CHILD: 'OOT_KOKIRI_SHOP',
    });
  });

  it('activates warp-song and soaring rows without reverse exit rows when warp shuffle is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erWarps: 'full',
    };

    const entrances = useDungeonEntrances();
    const warpEntries = entrances.activeEntrances.value.filter(
      (entry) => entry.pool === 'warp',
    );
    const meadowSong = warpEntries.find(
      (entry) => entry.key === 'OOT_WARP_SONG_MEADOW',
    );
    const lightSong = warpEntries.find(
      (entry) => entry.key === 'OOT_WARP_SONG_TEMPLE',
    );
    const clockTownOwl = warpEntries.find(
      (entry) => entry.key === 'MM_WARP_OWL_CLOCK_TOWN',
    );

    expect(meadowSong).toBeTruthy();
    expect(lightSong?.displayLabel).toBe('Prelude of Light');
    expect(
      warpEntries.some((entry) => entry.key === 'MM_WARP_OWL_CLOCK_TOWN'),
    ).toBe(true);
    expect(clockTownOwl?.displayLabel).toBe('Soaring to Owl Clock Town');
    expect(
      entrances.activeExitEntries.value.some((entry) => entry.pool === 'warp'),
    ).toBe(false);
    expect(
      entrances
        .destinationOptionsForEntrance(meadowSong!)
        .some(
          (option) =>
            option.value === 'OOT_WARP_SONG_LAKE' &&
            option.label === 'Lake Hylia',
        ),
    ).toBe(true);
    expect(
      entrances
        .destinationOptionsForEntrance(meadowSong!)
        .some(
          (option) =>
            option.value === 'MM_WARP_OWL_CLOCK_TOWN' &&
            option.label === 'Owl Clock Town',
        ),
    ).toBe(true);
  });

  it('matches OoTMM by removing warp songs from the warp pool when one-ways already shuffle them', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erWarps: 'full',
      erOneWays: 'full',
      erOneWaysSongs: true,
    };

    const entrances = useDungeonEntrances();
    const warpEntries = entrances.activeEntrances.value.filter(
      (entry) => entry.pool === 'warp',
    );

    expect(
      warpEntries.some((entry) => entry.key.startsWith('OOT_WARP_SONG_')),
    ).toBe(false);
    expect(
      warpEntries.some((entry) => entry.key === 'MM_WARP_OWL_CLOCK_TOWN'),
    ).toBe(true);
  });
});
