import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { markRaw, nextTick } from 'vue';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';
import type { TrackerPack } from '@/types/tracker';

/**
 * A minimal tracker stub whose location → region map is controlled by the test.
 * `getLocationRegionMap` returns the current `map` reference, so re-assigning
 * `map` (rather than mutating it in place) mirrors the real tracker, which
 * rebuilds a fresh `Map` on every re-initialization.
 */
function createStubTracker(getMap: () => Map<string, string>): TrackerPack {
  return markRaw({
    id: 'stub',
    name: 'stub',
    description: 'stub',
    async initialize() {},
    reset() {},
    getSettings: () => ({}),
    getLocationRegionMap: () => getMap(),
    getDungeonRewardRegionIds: () => new Set<string>(),
    getAllLocations: () => [],
    getAvailableItemIds: () => new Set<string>(),
    getItemMaxCounts: () => new Map<string, number>(),
    setPreCompletedDungeons: () => {},
    getPreCompletedLocationIds: () => [],
    checkReachability: () => ({
      reachableLocationIds: [],
      newLocationIds: [],
      canComplete: false,
      extra: {},
    }),
  }) as unknown as TrackerPack;
}

describe('Foolish hint re-collection on ER region map change', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('collects locations added to a hinted region after a re-initialization', async () => {
    let map = new Map<string, string>([
      ['OOT Kokiri Sword Chest@0', 'OOT_KOKIRI_FOREST'],
      ['OOT Goron Shop Item 1@0', 'OOT_GORON_CITY'],
    ]);
    const store = useOoTMMSessionStore();
    await store.attachTracker(createStubTracker(() => map));

    // Record a Foolish hint for Kokiri Forest, collecting its current locations
    // (mirrors what HintTrackerMain.addFoolishHint does).
    store.addFoolishHint({ region: 'OOT_KOKIRI_FOREST' });
    const kokiriIds = Array.from(
      store.regionToLocationIds.get('OOT_KOKIRI_FOREST') ?? [],
    );
    store.collectLocationIds(kokiriIds);
    store.addHintProtectedLocationIds(kokiriIds);

    expect(new Set(store.collectedLocationIds)).toEqual(
      new Set(['OOT Kokiri Sword Chest@0']),
    );
    expect(new Set(store.collectedLocationIds)).not.toContain(
      'OOT Goron Shop Item 1@0',
    );

    // ER re-maps the Goron Shop interior into Kokiri Forest (new Map reference).
    map = new Map<string, string>([
      ['OOT Kokiri Sword Chest@0', 'OOT_KOKIRI_FOREST'],
      ['OOT Goron Shop Item 1@0', 'OOT_KOKIRI_FOREST'],
    ]);

    // Re-apply pre-completed dungeons, which bumps the tracker's locations
    // version and triggers the region map (and thus the re-collection watch).
    store.applyPreCompletedDungeons();
    await nextTick();

    expect(new Set(store.collectedLocationIds)).toEqual(
      new Set(['OOT Kokiri Sword Chest@0', 'OOT Goron Shop Item 1@0']),
    );
    expect(store.hintProtectedLocationIds).toContain('OOT Goron Shop Item 1@0');
  });
});
