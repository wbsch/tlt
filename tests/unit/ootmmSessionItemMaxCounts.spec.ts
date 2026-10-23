import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';

/**
 * Regression guard for the Deku Stick/Nut upgrade item grid.
 *
 * Without the initial upgrades shuffled, the first capacity level is owned from
 * the start (`startUndimmed`), so only two upgrade stages remain. A stale pool
 * count of 3 (e.g. left over from the previous settings) used to win over the
 * icon-defined stage count and produced an untrackable, duplicated top stage
 * (20 → 30 → 40 → 40 green).
 */
describe('ootmm session effective item max count', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('clamps undimmed-start items to the displayed stage count', () => {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.trackerSettings = { sticksNutsUpgradesInitial: false };
    sessionStore.itemMaxCountsById = {
      OOT_NUT_UPGRADE: 3,
      OOT_STICK_UPGRADE: 3,
    };

    expect(sessionStore.itemMaxCountsMap.get('OOT_NUT_UPGRADE')).toBe(2);
    expect(sessionStore.itemMaxCountsMap.get('OOT_STICK_UPGRADE')).toBe(2);
  });

  it('keeps the extra stage when the initial upgrades are shuffled', () => {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.trackerSettings = { sticksNutsUpgradesInitial: true };
    sessionStore.itemMaxCountsById = {
      OOT_NUT_UPGRADE: 3,
      OOT_STICK_UPGRADE: 3,
    };

    expect(sessionStore.itemMaxCountsMap.get('OOT_NUT_UPGRADE')).toBe(3);
    expect(sessionStore.itemMaxCountsMap.get('OOT_STICK_UPGRADE')).toBe(3);
  });

  it('leaves dimmed-start items unaffected by the clamp', () => {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.trackerSettings = { sticksNutsUpgradesInitial: true };
    sessionStore.itemMaxCountsById = { OOT_BOMB_BAG: 4 };

    expect(sessionStore.itemMaxCountsMap.get('OOT_BOMB_BAG')).toBe(4);
  });
});
