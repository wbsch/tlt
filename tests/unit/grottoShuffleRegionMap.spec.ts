import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

describe('grotto shuffle region mapping', () => {
  it('assigns a shuffled grave grotto to the region of its new entrance', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'oot',
      erGrottos: 'full',
      plando: {
        entrances: {
          OOT_GROTTO_SCRUB_HEART_PIECE: 'OOT_GRAVE_ROYAL',
        },
      },
    });

    // With grotto shuffle, "Hyrule Field Scrub Grotto" leads into "Graveyard
    // Royal Tomb". The Royal Tomb checks must belong to Hyrule Field, not the
    // vanilla Graveyard region.
    const regionMap = tracker.getLocationRegionMap();
    expect(regionMap.get('OOT Graveyard Royal Tomb Song@0')).toBe(
      'OOT_HYRULE_FIELD',
    );
    expect(regionMap.get('OOT Graveyard Royal Tomb Chest@0')).toBe(
      'OOT_HYRULE_FIELD',
    );
  }, 30000);
});
