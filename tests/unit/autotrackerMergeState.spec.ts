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
});
