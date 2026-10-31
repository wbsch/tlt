import { describe, expect, it } from 'vitest';

import {
  SONG_UNKNOWN,
  getMmSongChoices,
  getOotSongChoices,
  resolveSongChoice,
  withDefaultSongEvents,
} from '../../packs/ootmm/src/data/song-events';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

const UNKNOWN_EVENT_CHECKS = [
  'OOT Graveyard Royal Tomb Chest@0',
  'OOT Graveyard Royal Tomb Song@0',
];

async function buildFullInventory(tracker: OoTMMTracker) {
  const inventory = new Map<string, number>();
  const itemMaxCounts = tracker.getItemMaxCounts();
  for (const itemId of tracker.getAvailableItemIds()) {
    inventory.set(itemId, Math.max(1, itemMaxCounts.get(itemId) ?? 1));
  }
  return inventory;
}

describe('song event unknown state', () => {
  it('offers an unknown choice outside the valid song range', () => {
    for (const choices of [getOotSongChoices({}), getMmSongChoices({})]) {
      const unknown = choices.find((choice) => choice.value === SONG_UNKNOWN);
      expect(unknown).toBeDefined();
      expect(unknown?.label).toBe('Unknown');
      expect(unknown?.image).toContain('song_events/unknown.png');
      expect(SONG_UNKNOWN).toBeGreaterThan(19);
    }
  });

  it('preselects unknown for every enabled event and keeps selections', () => {
    const filled = withDefaultSongEvents({ 2: 5 }, { oot: true, mm: true });
    expect(filled.changed).toBe(true);
    expect(filled.events[2]).toBe(5);
    for (let eventId = 0; eventId < 18; eventId++) {
      if (eventId === 2) continue;
      expect(filled.events[eventId], `oot ${eventId}`).toBe(SONG_UNKNOWN);
    }
    for (let eventId = 18; eventId < 31; eventId++) {
      expect(filled.events[eventId], `mm ${eventId}`).toBe(SONG_UNKNOWN);
    }
  });

  it('only fills events of enabled games', () => {
    const ootOnly = withDefaultSongEvents({}, { oot: true, mm: false });
    expect(ootOnly.events[0]).toBe(SONG_UNKNOWN);
    expect(ootOnly.events[18]).toBeUndefined();

    const unchanged = withDefaultSongEvents({}, { oot: false, mm: false });
    expect(unchanged.changed).toBe(false);
    expect(unchanged.events).toEqual({});
  });

  it('displays Unknown when no song was selected yet', () => {
    const choices = getOotSongChoices({});
    expect(resolveSongChoice(choices, undefined)?.label).toBe('Unknown');
    expect(resolveSongChoice(choices, SONG_UNKNOWN)?.label).toBe('Unknown');
    expect(resolveSongChoice(choices, 5)?.label).toBe('Song of Time');
  });

  it('makes checks behind an unknown event unreachable', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({ songEventsShuffleOot: true } as never);
    const inventory = await buildFullInventory(tracker);
    const allLocationIds = tracker
      .getAllLocations()
      .map((location) => location.id);

    const baseline = new Set(
      tracker.checkReachability(inventory).reachableLocationIds,
    );
    expect(baseline.size).toBe(allLocationIds.length);

    tracker.setSongEvents({ 2: SONG_UNKNOWN });
    const reachable = new Set(
      tracker.checkReachability(inventory).reachableLocationIds,
    );

    for (const checkId of UNKNOWN_EVENT_CHECKS) {
      expect(baseline.has(checkId), checkId).toBe(true);
      expect(reachable.has(checkId), checkId).toBe(false);
    }
  }, 60000);
});
