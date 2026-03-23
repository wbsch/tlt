import { afterEach, describe, expect, it } from 'vitest';

import {
  GRID_ICON_VARIANTS,
  getGridItemAutoSelectItemId,
  getGridItemAutoSelectItemIds,
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
