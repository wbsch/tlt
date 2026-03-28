import { afterEach, describe, expect, it } from 'vitest';

import {
  GRID_ICON_VARIANTS,
  getGridItemAutoSelectItemId,
  getGridItemAutoSelectItemIds,
  getGridTextLabel,
  getItemIcon,
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
  });

  it('resolves readable text for resolved label icon paths', () => {
    expect(getGridTextLabel(getItemIcon('oot_firetemple_label'))).toBe('Fire');
    expect(getGridTextLabel(getItemIcon('mm_woodfall_label'))).toBe('Wood');
    expect(getGridTextLabel(getItemIcon('free_label'))).toBe('Free');
  });
});
