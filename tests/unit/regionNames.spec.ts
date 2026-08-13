import { describe, it, expect } from 'vitest';
import {
  getRegionDisplayName,
  isValidHintRegion,
  SELECTABLE_REGION_IDS,
} from '../../packs/ootmm/src/data/regionNames';

describe('regionNames', () => {
  it('maps region IDs to display names', () => {
    expect(getRegionDisplayName('OOT_GORON_CITY')).toBe('Goron City');
    expect(getRegionDisplayName('OOT_KAKARIKO')).toBe('Kakariko');
    expect(getRegionDisplayName('MM_CLOCK_TOWN_SOUTH')).toBe(
      'South Clock Town',
    );
  });

  it('accepts selectable regions and rejects markers', () => {
    expect(isValidHintRegion('OOT_GORON_CITY')).toBe(true);
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

  it('exposes every selectable region ID as a valid hint region', () => {
    for (const id of SELECTABLE_REGION_IDS) {
      expect(isValidHintRegion(id)).toBe(true);
      expect(getRegionDisplayName(id)).toBeTruthy();
    }
  });
});
