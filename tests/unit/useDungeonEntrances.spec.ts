import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDungeonEntrances } from '@packs/ootmm/composables/useDungeonEntrances';
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
          option.value === 'OOT_BOMBCHU_BOWLING' &&
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

  it('fills the reciprocal game-link row when a normal entrance uses a game-link exit alias', () => {
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
    entrances.setSelectedDestination(
      'OOT_BOMBCHU_BOWLING',
      'OOT_MARKET_FROM_MASK_SHOP',
    );

    expect(entrances.getSelectedDestination('OOT_BOMBCHU_BOWLING')).toBe(
      'OOT_MARKET_FROM_MASK_SHOP',
    );
    expect(entrances.getSelectedDestination('OOT_SHOP_MASKS')).toBe(
      'OOT_BOMBCHU_BOWLING',
    );
    expect(
      entrances.getResolvedSelectedDestination('OOT_BOMBCHU_BOWLING'),
    ).toBe('OOT_MARKET_FROM_MASK_SHOP');
  });
});
