import 'tsconfig-paths/register';
import { OoTMMTracker } from './packs/ootmm/src/tracker';
async function test() {
  const tracker = new OoTMMTracker();
  await tracker.initialize();

  const inventory = new Map<string, number>();

  const availableItemIds = tracker.getAvailableItemIds();
  const itemMaxCounts = tracker.getItemMaxCounts();

  for (const id of availableItemIds) {
    const maxCount = itemMaxCounts.get(id) ?? 1;
    inventory.set(id, Math.max(1, maxCount));
  }

  const { reachableLocationIds } = tracker.checkReachability(inventory);
  const totalLocations = tracker.getAllLocations().length;
  const reachableCount = reachableLocationIds.length;
  console.log(`Reachable with FULL inventory: ${reachableCount}/${totalLocations}`);
  if (reachableCount !== totalLocations) {
    console.warn(
      `Missing reachable checks: ${totalLocations - reachableCount} (see tracker for details)`
    );
  }
}

test().catch(console.error);
