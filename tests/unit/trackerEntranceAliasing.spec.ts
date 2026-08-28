import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

type WorldWithAreas = {
  areas: Record<string, { exits?: Record<string, unknown> }>;
};

/**
 * Regression test for aliased one-way entrances (shuffled Child Owl Flights
 * under `erOneWaysAnywhere`). OoTMM's one-way pools use `alias: true`, meaning
 * several one-way sources may legally land on the same destination entrance.
 * The tracker must not route these through the plando entrance pass, which
 * treats every destination as unique and would silently drop the second source
 * (leaving its vanilla edge, e.g. Death Mountain Summit → Kakariko Rooftop,
 * incorrectly reachable).
 */
describe('tracker aliased one-way entrance wiring', () => {
  it('wires two shuffled owl flights onto the same overworld destination', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({
      games: 'ootmm',
      erOverworld: 'full',
      erOneWays: 'full',
      erOneWaysAnywhere: true,
      erOneWaysOwls: true,
      plando: {
        entrances: {
          OOT_FIELD_OWL: 'OOT_CRATER_FROM_GORON_CITY',
          OOT_VILLAGE_OWL: 'OOT_CRATER_FROM_GORON_CITY',
        },
      },
    } as Parameters<OoTMMTracker['initialize']>[0]);

    const worlds = (tracker as unknown as { worlds: WorldWithAreas[] }).worlds;
    const areas = worlds[0].areas;

    // First owl: Lake Hylia must no longer drop at Hyrule Field Drawbridge,
    // and instead land where OOT_CRATER_FROM_GORON_CITY leads (DMC Bottom).
    const lakeHyliaExits = areas['OOT Lake Hylia']?.exits ?? {};
    expect('OOT Hyrule Field Drawbridge' in lakeHyliaExits).toBe(false);
    expect('OOT Death Mountain Crater Bottom' in lakeHyliaExits).toBe(true);

    // Second owl: Death Mountain Summit must no longer drop at Kakariko
    // Rooftop, and instead land at DMC Bottom as well (aliased destination).
    const dmtSummitExits = areas['OOT Death Mountain Summit']?.exits ?? {};
    expect('OOT Kakariko Rooftop' in dmtSummitExits).toBe(false);
    expect('OOT Death Mountain Crater Bottom' in dmtSummitExits).toBe(true);
  }, 30000);
});
