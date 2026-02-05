import 'tsconfig-paths/register';
import { OoTMMTracker } from './packs/ootmm/src/tracker';
import ItemsMod from '@ootmm/core/items/index.js';
// @ts-expect-error CommonJS interop
const { Items } = ItemsMod as Record<string, unknown>;

async function test() {
  const tracker = new OoTMMTracker();
  await tracker.initialize();

  const inventory = new Map<string, number>();

  // Add ALL items from defs
  for (const id of Object.keys(Items as Record<string, unknown>)) {
    // Some items might need count > 1 to be fully effective (e.g. progressive items)
    // But for most, 1 is enough to trigger logic unless it checks specific count
    // Progressive items usually check for count.
    // Let's give 3 of everything just to be safe (max wallet, max scale, etc)
    inventory.set(id, 3);
  }

  const { reachableLocationIds } = tracker.checkReachability(inventory);
  console.log(`Reachable with FULL inventory: ${reachableLocationIds.length}`);
}

test().catch(console.error);
