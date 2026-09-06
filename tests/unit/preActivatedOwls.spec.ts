import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

/**
 * Regression test for pre-activated owl statues under `owlShuffle: 'anywhere'`.
 *
 * When an owl statue is pre-activated (`mmPreActivatedOwls`) while owl statues
 * are shuffled anywhere, the OoTMM randomizer marks the owl statue location as
 * "starting" (trivially reachable via `exprTrue()` in the spawn area) but keeps
 * it in `world.checks`. The tracker must therefore:
 *
 *   1. Hide the pre-activated owl statue locations from the check list (they
 *      are already activated, so there is no check to collect there).
 *   2. Exclude them from reachability (the player cannot soar there until they
 *      find the corresponding `MM_OWL_*` item, which is shuffled elsewhere).
 */
describe('pre-activated owl statues under owl shuffle anywhere', () => {
  const PRE_ACTIVATED = ['clocktown', 'swamp', 'snowhead', 'zoracape'];

  it('hides pre-activated owl statue locations from the check list', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      owlShuffle: 'anywhere',
      mmPreActivatedOwls: { type: 'specific', values: PRE_ACTIVATED },
    } as Parameters<OoTMMTracker['initialize']>[0]);

    const locationIds = tracker.getAllLocations().map((l) => l.id);

    expect(locationIds).not.toContain('MM Clock Town Owl Statue@0');
    expect(locationIds).not.toContain('MM Southern Swamp Owl Statue@0');
    expect(locationIds).not.toContain('MM Snowhead Owl Statue@0');
    expect(locationIds).not.toContain('MM Zora Cape Owl Statue@0');

    // Non-pre-activated owl statues remain visible as checks.
    expect(locationIds).toContain('MM Woodfall Owl Statue@0');
    expect(locationIds).toContain('MM Stone Tower Owl Statue@0');
  }, 30000);

  it('does not mark pre-activated owl statue locations as reachable', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      owlShuffle: 'anywhere',
      mmPreActivatedOwls: { type: 'specific', values: PRE_ACTIVATED },
    } as Parameters<OoTMMTracker['initialize']>[0]);

    // Empty inventory: the player has no MM_OWL_* items, so they cannot soar
    // to any pre-activated owl statue.
    const { reachableLocationIds } = tracker.checkReachability(new Map());

    expect(reachableLocationIds).not.toContain('MM Clock Town Owl Statue@0');
    expect(reachableLocationIds).not.toContain(
      'MM Southern Swamp Owl Statue@0',
    );
    expect(reachableLocationIds).not.toContain('MM Snowhead Owl Statue@0');
    expect(reachableLocationIds).not.toContain('MM Zora Cape Owl Statue@0');
  }, 30000);

  it('keeps pre-activated owl statues visible under vanilla owl shuffle', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      owlShuffle: 'none',
      mmPreActivatedOwls: { type: 'specific', values: PRE_ACTIVATED },
    } as Parameters<OoTMMTracker['initialize']>[0]);

    const locationIds = tracker.getAllLocations().map((l) => l.id);

    // Under vanilla owl shuffle the existing auto-tracking logic handles owl
    // statues; pre-activated owls are not hidden by this fix.
    expect(locationIds).toContain('MM Snowhead Owl Statue@0');
  }, 30000);
});
