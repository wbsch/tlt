import { describe, expect, it } from 'vitest';

import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

interface Combo {
  label: string;
  mqDungeons: unknown;
  expected: Record<string, number>;
}

const COMBOS: Combo[] = [
  {
    label: 'vanilla key placement in vanilla dungeons uses the vanilla counts',
    mqDungeons: 'none',
    expected: {
      OOT_SMALL_KEY_FIRE: 8,
      OOT_SMALL_KEY_FOREST: 5,
      OOT_SMALL_KEY_WATER: 6,
      OOT_SMALL_KEY_SPIRIT: 5,
      OOT_SMALL_KEY_SHADOW: 5,
      OOT_SMALL_KEY_BOTW: 3,
      OOT_SMALL_KEY_GTG: 9,
      OOT_SMALL_KEY_GANON: 2,
    },
  },
  {
    label: 'vanilla key placement in MQ dungeons uses the MQ layout counts',
    mqDungeons: {
      type: 'specific',
      values: [
        'Forest',
        'Fire',
        'Water',
        'Spirit',
        'Shadow',
        'BotW',
        'GTG',
        'Ganon',
      ],
    },
    expected: {
      OOT_SMALL_KEY_FIRE: 5,
      OOT_SMALL_KEY_FOREST: 6,
      OOT_SMALL_KEY_WATER: 2,
      OOT_SMALL_KEY_SPIRIT: 7,
      OOT_SMALL_KEY_SHADOW: 6,
      OOT_SMALL_KEY_BOTW: 2,
      OOT_SMALL_KEY_GTG: 3,
      OOT_SMALL_KEY_GANON: 3,
    },
  },
];

describe('small key max counts with vanilla key placement', () => {
  it.each(COMBOS)(
    '$label',
    async ({ mqDungeons, expected }) => {
      const tracker = new OoTMMTracker();
      await tracker.initialize({
        smallKeyShuffleOot: 'vanilla',
        smallKeyShuffleMm: 'vanilla',
        mqDungeons,
      } as never);

      const maxCounts = tracker.getItemMaxCounts();
      for (const [itemId, count] of Object.entries(expected)) {
        expect(maxCounts.get(itemId) ?? 0, itemId).toBe(count);
      }
    },
    60000,
  );
});
