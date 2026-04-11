import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '@packs/ootmm/tracker';

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
});
