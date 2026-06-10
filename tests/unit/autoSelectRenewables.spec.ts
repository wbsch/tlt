import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

function toItemIdSet(items: Map<unknown, number>): Set<string> {
  return new Set(
    [...items.keys()].map((item) => (item as { id?: string })?.id ?? ''),
  );
}

describe('tracker auto-select renewables', () => {
  it('treats auto-selected stick items as renewable when only the upgrade is tracked', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize({ games: 'ootmm' });

    const result = tracker['runPathfinder'](
      new Map<string, number>([['SHARED_STICK_UPGRADE', 1]]),
    ) as {
      state: {
        ws: Array<{
          items: Map<unknown, number>;
          renewables: Map<unknown, number>;
        }>;
      };
    };

    const ws0 = result.state.ws[0];
    const itemIds = toItemIdSet(ws0.items);
    const renewableIds = toItemIdSet(ws0.renewables);

    expect(itemIds.has('SHARED_STICK')).toBe(true);
    expect(renewableIds.has('SHARED_STICK')).toBe(true);
  }, 30000);
});
