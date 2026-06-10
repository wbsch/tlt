import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

describe('traceLocationPath', () => {
  it('reconstructs a multi-step path for reachable interior checks', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize();

    const inventory = tracker.getItemMaxCounts();
    const result = tracker.traceLocationPath(
      'OOT Kakariko Bazaar Item 1@0',
      inventory,
    );

    expect(result.reachable).toBe(true);
    expect(result.areaPath).not.toBeNull();
    expect(result.areaPath?.length).toBeGreaterThan(1);
    expect(result.areaPath?.at(-1)).toBe('OOT Kakariko Bazaar');
    expect(result.areaPath).toContain('OOT Kakariko');
  }, 30000);
});
