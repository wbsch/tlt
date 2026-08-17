import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDungeonEntrances } from '../../packs/ootmm/src/composables/useDungeonEntrances';
import { filterEntranceOverridesForSettings } from '../../packs/ootmm/src/utils/entranceRandomization';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';
import { useOoTMMUiStore } from '../../packs/ootmm/src/stores/ootmmUi';

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
    ).toBe('OOT_KOKIRI_FOREST_FROM_SARIA');
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

  it('treats base major-region edges as overworld pool entries when overworld shuffle is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOverworld: 'full',
      erPiratesWorld: true,
    };

    const entrances = useDungeonEntrances();

    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_LAKE_HYLIA_FROM_FIELD' &&
          entry.pool === 'overworld',
      ),
    ).toBe(true);
    expect(
      entrances.activeExitEntries.value.some(
        (entry) =>
          entry.key === 'OOT_FIELD_FROM_LAKE_HYLIA' &&
          entry.pool === 'overworld',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_MARKET_ENTRANCE_FROM_FIELD' &&
          entry.pool === 'overworld',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_GORON_CITY_FROM_LOST_WOODS' &&
          entry.pool === 'overworld',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'OOT_LAKE_HYLIA_FROM_ZORA_DOMAIN' &&
          entry.pool === 'overworld',
      ),
    ).toBe(true);
    expect(
      entrances.activeEntrances.value.some(
        (entry) =>
          entry.key === 'MM_PIRATE_FORTRESS' && entry.pool === 'overworld',
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

  it('offers exit-side aliases for ordinary reversible entrance destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOverworld: 'full',
    };

    const entrances = useDungeonEntrances();
    const marketEntryway = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_MARKET_ENTRANCE_FROM_MARKET',
    );

    expect(marketEntryway).toBeTruthy();
    expect(
      entrances
        .destinationOptionsForEntrance(marketEntryway!)
        .some((option) => option.value === 'OOT_FIELD_FROM_KAKARIKO'),
    ).toBe(true);
  });

  it('does not offer dungeon-exit aliases for dungeon entrance rows', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erDungeons: 'full',
      erMajorDungeons: true,
      erMinorDungeons: false,
      erGanonCastle: false,
      erGanonTower: false,
      erMoon: false,
      erSpiderHouses: false,
      erPirateFortress: false,
      erBeneathWell: false,
      erIkanaCastle: false,
      erSecretShrine: false,
    };

    const entrances = useDungeonEntrances();
    const forestTemple = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_TEMPLE_FOREST',
    );

    expect(forestTemple).toBeTruthy();
    expect(
      entrances
        .destinationOptionsForEntrance(forestTemple!)
        .some(
          (option) => option.value === 'OOT_SACRED_MEADOW_FROM_TEMPLE_FOREST',
        ),
    ).toBe(false);
  });

  it('preserves ordinary exit-side aliases when filtering entrance overrides', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOverworld: 'full',
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination(
      'OOT_MARKET_ENTRANCE_FROM_MARKET',
      'OOT_FIELD_FROM_KAKARIKO',
    );

    expect(
      sessionStore.entranceOverrides['OOT_MARKET_ENTRANCE_FROM_MARKET'],
    ).toBe('OOT_FIELD_FROM_KAKARIKO');
    expect(
      entrances.getSelectedDestination('OOT_MARKET_ENTRANCE_FROM_MARKET'),
    ).toBe('OOT_FIELD_FROM_KAKARIKO');
    expect(
      entrances.getResolvedSelectedDestination(
        'OOT_MARKET_ENTRANCE_FROM_MARKET',
      ),
    ).toBe('OOT_FIELD_FROM_KAKARIKO');
    expect(
      filterEntranceOverridesForSettings(
        sessionStore.entranceOverrides,
        sessionStore.trackerSettings,
      ),
    ).toEqual({
      OOT_KAKARIKO_FROM_FIELD: 'OOT_MARKET_FROM_MARKET_ENTRANCE',
      OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_FIELD_FROM_KAKARIKO',
    });
  });

  it('derives the inverse active entrance row from ordinary exit-side aliases', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOverworld: 'full',
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination(
      'OOT_MARKET_ENTRANCE_FROM_MARKET',
      'OOT_FIELD_FROM_KAKARIKO',
    );

    expect(
      entrances.getSelectedDestination('OOT_MARKET_ENTRANCE_FROM_MARKET'),
    ).toBe('OOT_FIELD_FROM_KAKARIKO');
    expect(
      entrances.getResolvedSelectedDestination(
        'OOT_MARKET_ENTRANCE_FROM_MARKET',
      ),
    ).toBe('OOT_FIELD_FROM_KAKARIKO');
    expect(entrances.getSelectedDestination('OOT_KAKARIKO_FROM_FIELD')).toBe(
      'OOT_MARKET_FROM_MARKET_ENTRANCE',
    );
    expect(sessionStore.entranceOverrides['OOT_KAKARIKO_FROM_FIELD']).toBe(
      'OOT_MARKET_FROM_MARKET_ENTRANCE',
    );
  });

  it('activates boss entrances as their own tracked pool when boss shuffle is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erBoss: 'full',
    };

    const entrances = useDungeonEntrances();
    const bossRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_BOSS_TEMPLE_FOREST',
    );

    expect(bossRow?.pool).toBe('boss');
    expect(
      entrances
        .destinationOptionsForEntrance(bossRow!)
        .some((option) => option.value === 'MM_BOSS_TEMPLE_WOODFALL'),
    ).toBe(true);
    expect(
      entrances
        .destinationOptionsForEntrance(bossRow!)
        .some((option) => option.value === 'OOT_TEMPLE_FOREST'),
    ).toBe(false);
  });

  it('keeps boss entrances separate from dungeon mixed pools without a dedicated boss mixed setting', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erBoss: 'full',
      erDungeons: 'full',
      erMajorDungeons: true,
      erMinorDungeons: true,
      erMixed: 'full',
      erMixedDungeons: true,
    };

    const entrances = useDungeonEntrances();
    const bossRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_BOSS_TEMPLE_FOREST',
    );
    const dungeonRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_TEMPLE_FOREST',
    );

    expect(bossRow?.pool).toBe('boss');
    expect(dungeonRow?.pool).toBe('dungeon');
    expect(
      entrances
        .destinationOptionsForEntrance(bossRow!)
        .some((option) => option.value === 'OOT_TEMPLE_FOREST'),
    ).toBe(false);
    expect(
      entrances
        .destinationOptionsForEntrance(dungeonRow!)
        .some((option) => option.value === 'OOT_BOSS_TEMPLE_FIRE'),
    ).toBe(false);
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
          option.value === 'OOT_LON_LON_RANCH_FROM_HOUSE' &&
          option.label === 'Lon Lon Ranch from Lon Lon Ranch House',
      ),
    ).toBe(true);
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_WARP_SONG_LAKE' &&
          option.label === 'Lake Hylia Warp Pad',
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

  it('preserves raw spawn mappings when selecting an exit-side destination', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination(
      'OOT_SPAWN_CHILD',
      'OOT_LON_LON_RANCH_FROM_HOUSE',
    );

    expect(sessionStore.entranceOverrides['OOT_SPAWN_CHILD']).toBe(
      'OOT_LON_LON_RANCH_FROM_HOUSE',
    );
    expect(entrances.getSelectedDestination('OOT_SPAWN_CHILD')).toBe(
      'OOT_LON_LON_RANCH_FROM_HOUSE',
    );
    expect(entrances.getResolvedSelectedDestination('OOT_SPAWN_CHILD')).toBe(
      'OOT_LON_LON_RANCH_FROM_HOUSE',
    );
    expect(
      filterEntranceOverridesForSettings(
        sessionStore.entranceOverrides,
        sessionStore.trackerSettings,
      ),
    ).toEqual({
      OOT_SPAWN_CHILD: 'OOT_LON_LON_RANCH_FROM_HOUSE',
    });
  });

  it('keeps adult spawn mapped to the selected exit-side fairy edge', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
    };

    const entrances = useDungeonEntrances();
    entrances.setSelectedDestination(
      'OOT_SPAWN_ADULT',
      'OOT_DEATH_MOUNTAIN_FROM_FAIRY',
    );

    expect(sessionStore.entranceOverrides['OOT_SPAWN_ADULT']).toBe(
      'OOT_DEATH_MOUNTAIN_FROM_FAIRY',
    );
    expect(entrances.getSelectedDestination('OOT_SPAWN_ADULT')).toBe(
      'OOT_DEATH_MOUNTAIN_FROM_FAIRY',
    );
    expect(entrances.getResolvedSelectedDestination('OOT_SPAWN_ADULT')).toBe(
      'OOT_DEATH_MOUNTAIN_FROM_FAIRY',
    );
    expect(
      filterEntranceOverridesForSettings(
        sessionStore.entranceOverrides,
        sessionStore.trackerSettings,
      ),
    ).toEqual({
      OOT_SPAWN_ADULT: 'OOT_DEATH_MOUNTAIN_FROM_FAIRY',
    });
  });

  it('treats spawn mappings as additive when destinations overlap interiors', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erIndoors: 'full',
      erIndoorsMajor: true,
      erIndoorsExtra: false,
      erIndoorsGameLinks: false,
    };

    const entrances = useDungeonEntrances();
    const childSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_CHILD',
    );
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    const sariaRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_HOUSE_SARIA',
    );
    const midoRow = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_HOUSE_MIDO',
    );

    expect(childSpawn).toBeTruthy();
    expect(adultSpawn).toBeTruthy();
    expect(sariaRow).toBeTruthy();
    expect(midoRow).toBeTruthy();

    entrances.setSelectedDestination('OOT_SPAWN_CHILD', 'OOT_KOKIRI_SHOP');

    expect(
      entrances
        .destinationOptionsForEntrance(sariaRow!)
        .some((option) => option.value === 'OOT_KOKIRI_SHOP'),
    ).toBe(true);

    entrances.setSelectedDestination('OOT_HOUSE_SARIA', 'OOT_KOKIRI_SHOP');

    expect(
      entrances
        .destinationOptionsForEntrance(childSpawn!)
        .some((option) => option.value === 'OOT_KOKIRI_SHOP'),
    ).toBe(true);
    expect(
      entrances
        .destinationOptionsForEntrance(adultSpawn!)
        .some((option) => option.value === 'OOT_KOKIRI_SHOP'),
    ).toBe(true);

    entrances.setSelectedDestination('OOT_SPAWN_ADULT', 'OOT_KOKIRI_SHOP');

    expect(sessionStore.entranceOverrides['OOT_HOUSE_SARIA']).toBe(
      'OOT_KOKIRI_SHOP',
    );
    expect(sessionStore.entranceOverrides['OOT_SPAWN_CHILD']).toBe(
      'OOT_KOKIRI_SHOP',
    );
    expect(sessionStore.entranceOverrides['OOT_SPAWN_ADULT']).toBe(
      'OOT_KOKIRI_SHOP',
    );
    expect(
      entrances
        .destinationOptionsForEntrance(midoRow!)
        .some((option) => option.value === 'OOT_KOKIRI_SHOP'),
    ).toBe(false);
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
            option.label === 'Lake Hylia Warp Pad',
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

  it('gives the "Lost Woods Bridge to Hyrule Field" exit row the same destination options as the "Lost Woods Bridge to Kokiri Forest" entrance row', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOverworld: 'full',
      erGrottos: 'full',
      erMixed: 'full',
      erMixedGrottos: true,
      erMixedOverworld: true,
    };

    const entrances = useDungeonEntrances();

    // Exit row: "Lost Woods Bridge to Hyrule Field" (type: region-exit → pool: overworld).
    const lwbToFieldExit = entrances.activeExitEntries.value.find(
      (entry: { key: string }) =>
        entry.key === 'OOT_FIELD_FROM_LOST_WOODS_BRIDGE',
    );

    // Entrance row: "Lost Woods Bridge to Kokiri Forest" (type: overworld → pool: overworld).
    const lwbToForestEntrance = entrances.activeEntrances.value.find(
      (entry: { key: string }) =>
        entry.key === 'OOT_FOREST_FROM_LOST_WOODS_BRIDGE',
    );

    expect(lwbToFieldExit).toBeTruthy();
    expect(lwbToForestEntrance).toBeTruthy();
    expect(lwbToFieldExit!.pool).toBe('overworld');
    expect(lwbToForestEntrance!.pool).toBe('overworld');

    const fieldOptions = entrances.destinationOptionsForExit(lwbToFieldExit!);
    const forestOptions = entrances.destinationOptionsForEntrance(
      lwbToForestEntrance!,
    );

    const fieldValues = fieldOptions
      .map((o: { value: string }) => o.value)
      .sort();
    const forestValues = forestOptions
      .map((o: { value: string }) => o.value)
      .sort();

    expect(fieldValues).toEqual(forestValues);
  });

  it('includes overworld-type entrances in spawn destination options when erOverworld is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    // This replicates the ERtest preset: erOverworld is 'full' and erSpawns is 'both'.
    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erOverworld: 'full',
      erDungeons: 'full',
      erIndoors: 'full',
      erGrottos: 'full',
      erRegions: 'none',
      erWarps: 'none',
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // Overworld entrances from the ERtest preset should now be available.
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_DEATH_MOUNTAIN_FROM_GORON_CITY' &&
          option.label === 'Death Mountain from Goron City',
      ),
    ).toBe(true);

    // Also check the reverse direction is available.
    expect(
      options.some(
        (option) =>
          option.value === 'OOT_GORON_CITY' &&
          option.label === 'Goron City from Death Mountain',
      ),
    ).toBe(true);

    // Other overworld-type entrances that should be present.
    expect(options.some((option) => option.value === 'OOT_FOUNTAIN_ZORA')).toBe(
      true,
    );
    expect(
      options.some((option) => option.value === 'OOT_DOMAIN_FROM_FOUNTAIN'),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'OOT_CRATER_FROM_GORON_CITY'),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'OOT_GORON_CITY_FROM_CRATER'),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'OOT_SACRED_FOREST_MEADOW'),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'OOT_LOST_WOODS_FROM_MEADOW'),
    ).toBe(true);
  });

  it('includes major-region edges in wallmaster destination options when erOverworld is enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    // erRegions and erOverworld are mutually exclusive; overworld shuffle
    // subsumes the major-region edges (OoTMM's poolOverworld dst).
    sessionStore.trackerSettings = {
      games: 'ootmm',
      erWallmasters: 'full',
      erOverworld: 'full',
      erRegions: 'none',
    };

    const entrances = useDungeonEntrances();
    const wallmaster = entrances.activeEntrances.value.find(
      (entry) => entry.pool === 'wallmaster',
    );
    expect(wallmaster).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(wallmaster!);

    // Major-region edges (types region / region-extra / region-shortcut)
    expect(
      options.some((option) => option.value === 'OOT_KAKARIKO_FROM_FIELD'),
    ).toBe(true);
    expect(
      options.some(
        (option) => option.value === 'OOT_MARKET_ENTRANCE_FROM_FIELD',
      ),
    ).toBe(true);
    expect(
      options.some(
        (option) => option.value === 'OOT_GORON_CITY_FROM_LOST_WOODS',
      ),
    ).toBe(true);

    // Their reverse (region-exit) aliases as well.
    expect(
      options.some((option) => option.value === 'OOT_FIELD_FROM_KAKARIKO'),
    ).toBe(true);

    // Pure overworld-type edges keep working too.
    expect(
      options.some(
        (option) => option.value === 'OOT_DEATH_MOUNTAIN_FROM_GORON_CITY',
      ),
    ).toBe(true);
  });

  it('includes major-region edges in one-way destination options when erOneWaysAnywhere and erOverworld are enabled', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erOneWays: 'full',
      erOneWaysAnywhere: true,
      erOneWaysMajor: true,
      erOverworld: 'full',
      erRegions: 'none',
    };

    const entrances = useDungeonEntrances();
    const oneWay = entrances.activeEntrances.value.find(
      (entry) => entry.pool === 'one-way',
    );
    expect(oneWay).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(oneWay!);

    expect(
      options.some((option) => option.value === 'OOT_KAKARIKO_FROM_FIELD'),
    ).toBe(true);
    expect(
      options.some(
        (option) => option.value === 'OOT_DEATH_MOUNTAIN_FROM_GORON_CITY',
      ),
    ).toBe(true);
  });

  it('includes one-way-type entrances in spawn destinations when erOneWays is enabled without erOneWaysAnywhere', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erOneWays: 'full',
      erOneWaysMajor: true,
      erOneWaysOwls: true,
      erOneWaysWoods: true,
      erOneWaysWaterVoids: true,
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // One-way overworld transition
    expect(
      options.some((option) => option.value === 'OOT_LAKE_HYLIA_FROM_VALLEY'),
    ).toBe(true);

    // Owl statue (OoT owls have type 'one-way-owl')
    expect(options.some((option) => option.value === 'OOT_VILLAGE_OWL')).toBe(
      true,
    );

    // Woods exit
    expect(
      options.some(
        (option) => option.value === 'OOT_LOST_WOODS_FROM_LOST_WOODS_NORTH',
      ),
    ).toBe(true);

    // One-way types should also offer their reverse if one exists
    // (the solver includes reverses via entrancesForTypes)
  });

  it('excludes one-way-type entrances from spawn destinations when erOneWaysAnywhere is true', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erOneWays: 'full',
      erOneWaysAnywhere: true,
      erOneWaysMajor: true,
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // When erOneWaysAnywhere is true, one-way types should NOT be in spawn destinations
    // (matching the solver's makePoolsSimple exclusion)
    expect(
      options.some((option) => option.value === 'OOT_LAKE_HYLIA_FROM_VALLEY'),
    ).toBe(false);

    // But one-way-song is always included unconditionally
    expect(
      options.some((option) => option.value === 'OOT_WARP_SONG_LAKE'),
    ).toBe(true);
  });

  it('respects one-way sub-settings for spawn destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erOneWays: 'full',
      erOneWaysMajor: true,
      erOneWaysOwls: false, // Owls disabled
      erOneWaysWoods: true,
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // Major one-way should be present (sub-setting is true)
    expect(
      options.some((option) => option.value === 'OOT_LAKE_HYLIA_FROM_VALLEY'),
    ).toBe(true);

    // Woods exit should be present (sub-setting is true)
    expect(
      options.some(
        (option) => option.value === 'OOT_LOST_WOODS_FROM_LOST_WOODS_NORTH',
      ),
    ).toBe(true);

    // Owl statues should NOT be present (sub-setting is false)
    expect(options.some((option) => option.value === 'OOT_VILLAGE_OWL')).toBe(
      false,
    );

    // But one-way-song is still present (always unconditionally added)
    expect(
      options.some((option) => option.value === 'OOT_WARP_SONG_LAKE'),
    ).toBe(true);
  });

  it('does not include one-way types in spawn destinations when erOneWays is none', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
      erOneWays: 'none',
      erOneWaysMajor: true,
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // One-way major should NOT be present when erOneWays is 'none'
    expect(
      options.some((option) => option.value === 'OOT_LAKE_HYLIA_FROM_VALLEY'),
    ).toBe(false);

    // But one-way-song is still present (always unconditionally added)
    expect(
      options.some((option) => option.value === 'OOT_WARP_SONG_LAKE'),
    ).toBe(true);
  });

  it('includes region, indoors, and one-way-song unconditionally in spawn destinations', () => {
    const sessionStore = useOoTMMSessionStore();
    useOoTMMUiStore();

    // Minimal settings: only spawns enabled, everything else off.
    sessionStore.trackerSettings = {
      games: 'ootmm',
      erSpawns: 'both',
    };

    const entrances = useDungeonEntrances();
    const adultSpawn = entrances.activeEntrances.value.find(
      (entry) => entry.key === 'OOT_SPAWN_ADULT',
    );
    expect(adultSpawn).toBeTruthy();

    const options = entrances.destinationOptionsForEntrance(adultSpawn!);

    // Region types are unconditionally included
    expect(
      options.some((option) => option.value === 'OOT_KAKARIKO_FROM_FIELD'),
    ).toBe(true);
    expect(
      options.some((option) => option.value === 'OOT_FIELD_FROM_KAKARIKO'),
    ).toBe(true);

    // Indoor types are unconditionally included (basic 'indoors' type)
    expect(options.some((option) => option.value === 'OOT_KOKIRI_SHOP')).toBe(
      true,
    );

    // One-way-song types are unconditionally included
    expect(
      options.some((option) => option.value === 'OOT_WARP_SONG_LAKE'),
    ).toBe(true);
  });
});
