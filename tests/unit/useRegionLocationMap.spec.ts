import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';
import { buildRegionLocationMap } from '../../packs/ootmm/src/composables/useRegionLocationMap';
import {
  isValidHintRegion,
  SELECTABLE_REGION_IDS,
} from '../../packs/ootmm/src/data/regionNames';

describe('useRegionLocationMap / region mapping', () => {
  it('derives the reverse region → locations direction', () => {
    const locationIdToRegion = new Map<string, string>([
      ['OOT Kokiri Sword Chest@0', 'OOT_KOKIRI_FOREST'],
      ["OOT Mido's House Top Left@0", 'OOT_KOKIRI_FOREST'],
      ['OOT Goron Shop Item 1@0', 'OOT_GORON_CITY'],
    ]);
    const { regionToLocationIds } = buildRegionLocationMap(locationIdToRegion);

    expect(regionToLocationIds.get('OOT_KOKIRI_FOREST')).toEqual(
      new Set(['OOT Kokiri Sword Chest@0', "OOT Mido's House Top Left@0"]),
    );
    expect(regionToLocationIds.get('OOT_GORON_CITY')).toEqual(
      new Set(['OOT Goron Shop Item 1@0']),
    );
    expect(regionToLocationIds.get('OOT_ZORA_DOMAIN')).toBeUndefined();
  });

  it('isValidHintRegion accepts selectable regions and rejects markers', () => {
    expect(isValidHintRegion('OOT_KOKIRI_FOREST')).toBe(true);
    expect(isValidHintRegion('MM_CLOCK_TOWN_SOUTH')).toBe(true);

    for (const marker of [
      'NONE',
      'NAMELESS',
      'POCKET',
      'ENTRANCE',
      'BUFFER',
      'BUFFER_DELAYED',
    ]) {
      expect(isValidHintRegion(marker)).toBe(false);
    }
    expect(isValidHintRegion(undefined)).toBe(false);
  });

  it('builds a valid location → region map from the tracker without a spoiler log', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({ games: 'ootmm' });

    const map = tracker.getLocationRegionMap();
    expect(map.size).toBeGreaterThan(0);

    // Every mapped location must have a selectable (non-marker) region.
    for (const [locationId, region] of map) {
      expect(SELECTABLE_REGION_IDS).toContain(region);
      expect(isValidHintRegion(region)).toBe(true);
      // Full IDs are always world-suffixed.
      expect(locationId).toMatch(/@\d+$/);
    }

    // The post-entrance-pass region propagation is what turns an interior
    // (ENTRANCE placeholder) into its parent region. Without it these would
    // be excluded as markers, so their presence proves the map is sourced
    // from `this.worlds` (post `logicPassEntrances`) rather than `baseWorlds`.
    expect(map.get("OOT Mido's House Top Left@0")).toBe('OOT_KOKIRI_FOREST');
    expect(map.get('OOT Kokiri Forest Kokiri Sword Chest@0')).toBe(
      'OOT_KOKIRI_FOREST',
    );

    const regions = new Set(map.values());
    expect(regions.has('OOT_KOKIRI_FOREST')).toBe(true);
    expect(regions.has('OOT_GORON_CITY')).toBe(true);
  }, 30000);

  it('reports the hint regions that hold a dungeon reward on a blue warp', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({ games: 'ootmm' });

    const rewardRegionIds = tracker.getDungeonRewardRegionIds();
    // The 8 OoT + 4 MM major dungeons whose reward sits on the boss blue warp,
    // plus the Temple of Time Medallion slot (also a warp-location reward).
    expect(rewardRegionIds).toEqual(
      new Set([
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
        'OOT_JABU_JABU',
        'OOT_TEMPLE_FOREST',
        'OOT_TEMPLE_FIRE',
        'OOT_TEMPLE_WATER',
        'OOT_TEMPLE_SPIRIT',
        'OOT_TEMPLE_SHADOW',
        'OOT_SACRED_REALM',
        'MM_TEMPLE_WOODFALL',
        'MM_TEMPLE_SNOWHEAD',
        'MM_TEMPLE_GREAT_BAY',
        'MM_TEMPLE_STONE_TOWER',
      ]),
    );

    // Every reported region must be a valid, selectable hint region and every
    // reward-region location must exist in the location → region map.
    for (const region of rewardRegionIds) {
      expect(isValidHintRegion(region)).toBe(true);
    }
    const mappedRegions = new Set(tracker.getLocationRegionMap().values());
    for (const region of rewardRegionIds) {
      expect(mappedRegions.has(region)).toBe(true);
    }
  }, 30000);
});
