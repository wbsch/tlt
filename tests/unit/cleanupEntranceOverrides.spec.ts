import { describe, expect, it } from 'vitest';
import { cleanupEntranceOverridesForSettings } from '../../packs/ootmm/src/utils/entranceRandomization';

describe('cleanupEntranceOverridesForSettings', () => {
  it('returns empty object for empty overrides', () => {
    const result = cleanupEntranceOverridesForSettings({}, { games: 'ootmm' });
    expect(result).toEqual({});
  });

  it('returns empty object when no active pools', () => {
    const result = cleanupEntranceOverridesForSettings(
      { OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_KAKARIKO_FROM_FIELD' },
      { games: 'oot' },
    );
    expect(result).toEqual({});
  });

  it('keeps entrance keys from active pools', () => {
    const result = cleanupEntranceOverridesForSettings(
      { OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_KAKARIKO_FROM_FIELD' },
      { games: 'oot', erOverworld: 'full' },
    );
    expect(result).toEqual({
      OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_KAKARIKO_FROM_FIELD',
    });
  });

  it('removes entrance keys from disabled pools', () => {
    // OOT_TEMPLE_FOREST is a dungeon entrance — not active with only overworld
    const result = cleanupEntranceOverridesForSettings(
      { OOT_TEMPLE_FOREST: 'OOT_TEMPLE_FIRE' },
      { games: 'oot', erOverworld: 'full' },
    );
    expect(result).toEqual({});
  });

  it('keeps exit keys whose coupled entrance is active', () => {
    // OOT_FIELD_FROM_KAKARIKO is the reverse/exit of OOT_KAKARIKO_FROM_FIELD
    // With erOverworld: 'full', OOT_KAKARIKO_FROM_FIELD is in activeKeys
    const result = cleanupEntranceOverridesForSettings(
      {
        OOT_FIELD_FROM_KAKARIKO: 'OOT_MARKET_ENTRANCE_FROM_MARKET',
      },
      { games: 'oot', erOverworld: 'full' },
    );
    expect(result).toEqual({
      OOT_FIELD_FROM_KAKARIKO: 'OOT_MARKET_ENTRANCE_FROM_MARKET',
    });
  });

  it('removes exit keys whose coupled entrance is inactive', () => {
    // With no ER pools active, no entrance keys are active
    const result = cleanupEntranceOverridesForSettings(
      {
        OOT_FIELD_FROM_KAKARIKO: 'OOT_MARKET_ENTRANCE_FROM_MARKET',
      },
      { games: 'oot' },
    );
    expect(result).toEqual({});
  });

  it('removes entries whose destination is not allowed for the source', () => {
    // Overworld source but destination is a dungeon entrance not in activeKeys
    const result = cleanupEntranceOverridesForSettings(
      {
        OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_TEMPLE_FOREST',
      },
      { games: 'oot', erOverworld: 'full' },
    );
    expect(result).toEqual({});
  });

  it('keeps game-link exit keys in ootmm mode (directly in activeKeys)', () => {
    // OOT_SHOP_MASKS is a game-link exit key
    // With erIndoorsGameLinks: true, it's in activeKeys directly
    const result = cleanupEntranceOverridesForSettings(
      {
        OOT_SHOP_MASKS: 'OOT_BOMBCHU_BOWLING',
      },
      {
        games: 'ootmm',
        erIndoors: 'full',
        erIndoorsMajor: true,
        erIndoorsExtra: false,
        erIndoorsGameLinks: true,
      },
    );
    expect(result).toEqual({
      OOT_SHOP_MASKS: 'OOT_BOMBCHU_BOWLING',
    });
  });

  it('is idempotent — same result on second call', () => {
    const overrides = {
      OOT_MARKET_ENTRANCE_FROM_MARKET: 'OOT_KAKARIKO_FROM_FIELD',
      OOT_TEMPLE_FOREST: 'OOT_TEMPLE_FIRE',
    };
    const settings = { games: 'oot', erOverworld: 'full' };
    const first = cleanupEntranceOverridesForSettings(overrides, settings);
    const second = cleanupEntranceOverridesForSettings(overrides, settings);
    expect(first).toEqual(second);
  });
});
