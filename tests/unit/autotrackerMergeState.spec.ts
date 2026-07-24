import { describe, expect, it } from 'vitest';

import {
  buildAutotrackerInventorySnapshot,
  mergeAutotrackerCollectedLocationsUpdate,
  mergeAutotrackerInventoryUpdate,
} from '../../packs/ootmm/src/autotracker/mergeState';

describe('autotracker merge state', () => {
  it('preserves manual item corrections while applying only new remote deltas', () => {
    const merged = mergeAutotrackerInventoryUpdate({
      currentInventory: new Map([['OOT_HOOKSHOT', 0]]),
      previousRemoteInventory: { OOT_HOOKSHOT: 1 },
      nextRemoteInventory: { OOT_HOOKSHOT: 1, OOT_BOW: 1 },
      itemMaxCounts: new Map([
        ['OOT_HOOKSHOT', 2],
        ['OOT_BOW', 1],
      ]),
    });

    expect(Object.fromEntries(merged)).toEqual({ OOT_BOW: 1 });
  });

  it('clamps live item deltas to the configured item maxima', () => {
    const merged = mergeAutotrackerInventoryUpdate({
      currentInventory: new Map([['OOT_HOOKSHOT', 2]]),
      previousRemoteInventory: { OOT_HOOKSHOT: 1 },
      nextRemoteInventory: { OOT_HOOKSHOT: 2, OOT_BOW: 1 },
      itemMaxCounts: new Map([
        ['OOT_HOOKSHOT', 2],
        ['OOT_BOW', 1],
      ]),
    });

    expect(Object.fromEntries(merged)).toEqual({
      OOT_HOOKSHOT: 2,
      OOT_BOW: 1,
    });
  });

  it('preserves manually unchecked collected locations when the remote snapshot repeats them', () => {
    const merged = mergeAutotrackerCollectedLocationsUpdate({
      currentCollectedLocationIds: [],
      previousRemoteCollectedLocationIds: new Set(['loc-a']),
      nextRemoteCollectedLocationIds: new Set(['loc-a', 'loc-b']),
    });

    expect(merged).toEqual(['loc-b']);
  });

  it('clamps overwrite snapshots to known maxima without inventing unknown limits', () => {
    const snapshot = buildAutotrackerInventorySnapshot(
      { OOT_HOOKSHOT: 3, OOT_BOW: 1, UNKNOWN_ITEM: 4 },
      new Map([
        ['OOT_HOOKSHOT', 2],
        ['OOT_BOW', 1],
      ]),
    );

    expect(Object.fromEntries(snapshot)).toEqual({
      OOT_HOOKSHOT: 2,
      OOT_BOW: 1,
      UNKNOWN_ITEM: 4,
    });
  });

  it('does not decrement derived items when they disappear from the remote snapshot', () => {
    // Simulates a derived item (e.g. SHARED_BOMBCHU_BAG) that transiently
    // disappears from the next remote state due to a signal-item glitch.
    const merged = mergeAutotrackerInventoryUpdate({
      currentInventory: new Map([['SHARED_BOMBCHU_BAG', 1]]),
      previousRemoteInventory: { SHARED_BOMBCHU_BAG: 1 },
      nextRemoteInventory: {
        /* bombchu bag glitched out */
      },
      itemMaxCounts: new Map(),
      derivedItemIds: new Set(['SHARED_BOMBCHU_BAG']),
    });

    // The derived item must NOT be removed from the tracker.
    expect(Object.fromEntries(merged)).toEqual({ SHARED_BOMBCHU_BAG: 1 });
  });

  it('still applies positive deltas for derived items present in both snapshots', () => {
    const merged = mergeAutotrackerInventoryUpdate({
      currentInventory: new Map([['SHARED_BOMBCHU_BAG', 1]]),
      previousRemoteInventory: { SHARED_BOMBCHU_BAG: 0 },
      nextRemoteInventory: { SHARED_BOMBCHU_BAG: 1 },
      itemMaxCounts: new Map([['SHARED_BOMBCHU_BAG', 1]]),
      derivedItemIds: new Set(['SHARED_BOMBCHU_BAG']),
    });

    // Derived item should be added (delta +1, clamped to max 1).
    expect(Object.fromEntries(merged)).toEqual({ SHARED_BOMBCHU_BAG: 1 });
  });
});
