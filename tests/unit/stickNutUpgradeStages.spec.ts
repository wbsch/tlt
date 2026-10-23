import { describe, expect, it } from 'vitest';

import { getGridItemDefinedMaxCount } from '@/../packs/ootmm/src/data/itemIcons';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

const OOT_IDS = ['OOT_STICK_UPGRADE', 'OOT_NUT_UPGRADE'];
const MM_IDS = ['MM_STICK_UPGRADE', 'MM_NUT_UPGRADE'];
const SHARED_IDS = ['SHARED_STICK_UPGRADE', 'SHARED_NUT_UPGRADE'];

interface Combo {
  label: string;
  settings: Record<string, unknown>;
  ids: string[];
  expected: number;
}

const COMBOS: Combo[] = [
  {
    label: 'oot+mm, initial upgrades not shuffled',
    settings: { games: 'ootmm', sticksNutsUpgradesMm: true },
    ids: [...OOT_IDS, ...MM_IDS],
    expected: 2,
  },
  {
    label: 'oot+mm, initial upgrades shuffled',
    settings: {
      games: 'ootmm',
      sticksNutsUpgradesMm: true,
      sticksNutsUpgradesInitial: true,
    },
    ids: [...OOT_IDS, ...MM_IDS],
    expected: 3,
  },
  {
    label: 'shared sticks/nuts, initial upgrades not shuffled',
    settings: {
      games: 'ootmm',
      sticksNutsUpgradesMm: true,
      sharedNutsSticks: true,
    },
    ids: SHARED_IDS,
    expected: 2,
  },
  {
    label: 'shared sticks/nuts, initial upgrades shuffled',
    settings: {
      games: 'ootmm',
      sticksNutsUpgradesMm: true,
      sharedNutsSticks: true,
      sticksNutsUpgradesInitial: true,
    },
    ids: SHARED_IDS,
    expected: 3,
  },
];

describe('stick/nut upgrade stages match the item pool', () => {
  it.each(COMBOS)(
    '$label keeps pool count and icon stages in sync',
    async ({ settings, ids, expected }) => {
      const tracker = new OoTMMTracker();
      await tracker.initialize(settings as never);

      const poolCounts = tracker.getItemMaxCounts();
      const trackerSettings = tracker.getSettings() as Record<string, unknown>;

      for (const itemId of ids) {
        expect(poolCounts.get(itemId) ?? 0, itemId).toBe(expected);
        expect(
          getGridItemDefinedMaxCount(itemId, { settings: trackerSettings }),
          itemId,
        ).toBe(expected);
      }
    },
    60000,
  );
});
