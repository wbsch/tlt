import { afterEach, describe, expect, it } from 'vitest';

import {
  GRID_ICON_VARIANTS,
  getGridItemOverlay,
  getGridItemOverlayText,
  getGridItemOverlayValue,
  getGridItemAutoSelectItemId,
  getGridItemAutoSelectItemIds,
  getGridTextLabel,
  getGridWheelOverlayStageForValue,
  getGridWheelOverlayValue,
} from '@/../packs/ootmm/src/data/itemIcons';

const TEST_ITEM_ID = '__TEST_MULTI_AUTOSELECT__';

function setTestVariant(autoSelectItemId: string | string[]) {
  GRID_ICON_VARIANTS[TEST_ITEM_ID] = {
    default: {
      icons: ['images/unknown.png'],
      autoSelectItemId,
    },
  } as (typeof GRID_ICON_VARIANTS)[string];
}

afterEach(() => {
  delete GRID_ICON_VARIANTS[TEST_ITEM_ID];
});

describe('itemIcons autoSelectItemId', () => {
  it('normalizes single auto-select IDs to a one-item array', () => {
    setTestVariant('ITEM_ALPHA');

    expect(getGridItemAutoSelectItemIds(TEST_ITEM_ID)).toEqual(['ITEM_ALPHA']);
    expect(getGridItemAutoSelectItemId(TEST_ITEM_ID)).toBe('ITEM_ALPHA');
  });

  it('returns all configured auto-select IDs when an array is provided', () => {
    setTestVariant(['ITEM_ALPHA', 'ITEM_BETA']);

    expect(getGridItemAutoSelectItemIds(TEST_ITEM_ID)).toEqual([
      'ITEM_ALPHA',
      'ITEM_BETA',
    ]);
    expect(getGridItemAutoSelectItemId(TEST_ITEM_ID)).toBe('ITEM_ALPHA');
  });
});

describe('itemIcons grid text labels', () => {
  it('resolves readable text for dungeon label item IDs', () => {
    expect(getGridTextLabel('oot_gerudofortress_label')).toBe('TH');
    expect(getGridTextLabel('oot_well_label')).toBe('BotW');
    expect(getGridTextLabel('mm_stonetower_label')).toBe('Stone');
    expect(getGridTextLabel('oot_chestgame_label')).toBe('Chest');
  });

  it('resolves readable text for numeric item overlay values without PNG paths', () => {
    expect(getGridItemOverlayValue('OOT_BOMB_BAG', 2)).toBe('30');
    expect(getGridItemOverlayText('OOT_BOMB_BAG', 2)).toBe('30');
    expect(getGridItemOverlay('OOT_BOMB_BAG', 2)).toBeNull();
    expect(getGridTextLabel('500')).toBe('500');
  });

  it('resolves readable text for reward wheel overlay values without PNG paths', () => {
    const inventory = new Map<string, number>([
      ['__grid_wheel_overlay_state__:OOT_MEDALLION_FOREST', 6],
    ]);

    expect(
      getGridWheelOverlayValue('OOT_MEDALLION_FOREST', { inventory }),
    ).toBe('oot_firetemple_label');
    expect(getGridTextLabel('oot_firetemple_label')).toBe('Fire');
    expect(getGridTextLabel('free_label')).toBe('Free');
  });

  it('keeps distinct wheel stages for different reward text labels', () => {
    expect(
      getGridWheelOverlayStageForValue('OOT_MEDALLION_FOREST', 'free_label'),
    ).toBe(1);
    expect(
      getGridWheelOverlayStageForValue(
        'OOT_MEDALLION_FOREST',
        'oot_foresttemple_label',
      ),
    ).toBe(5);
    expect(
      getGridWheelOverlayStageForValue(
        'OOT_MEDALLION_FOREST',
        'oot_shadowtemple_label',
      ),
    ).toBe(9);
  });
});
