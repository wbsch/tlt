import 'tsconfig-paths/register';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

async function runCase(label: string, extraItems: [string, number][]) {
  const tracker = new OoTMMTracker();
  await tracker.initialize({ startingAge: 'adult' });

  const inventory = new Map<string, number>([
    ['__grid_ref_state__:__grid_ref__:Bottle1:OOT_BOTTLE_BLUE_FIRE', 1],
    ['OOT_BOTTLE_BLUE_FIRE', 1],
    ['OOT_OCARINA', 1],
    ['OOT_SONG_ZELDA', 1],
    ...extraItems,
  ]);

  const { reachableLocationIds } = tracker.checkReachability(inventory);
  const reachable = new Set(reachableLocationIds);

  const all = tracker.getAllLocations();
  const zoraTunic = all.find((loc) => loc.name.includes('Zora Domain Tunic'));
  const tunicReachable = zoraTunic ? reachable.has(zoraTunic.id) : false;
  console.log(
    `[${label}] reachable=${reachable.size}/${all.length} | Zora Domain Tunic reachable: ${tunicReachable}`,
  );
  return tunicReachable;
}

async function test() {
  const bottleOnly = await runCase('preset inventory (bottle only)', []);
  await runCase('preset + OOT_BLUE_FIRE', [['OOT_BLUE_FIRE', 1]]);

  // Regression: the bottle-with-blue-fire alone must satisfy has_blue_fire.
  if (!bottleOnly) {
    console.error(
      'FAIL: Zora Domain Tunic should be reachable with bottle blue fire only',
    );
    process.exit(1);
  }
  console.log('OK: Zora Domain Tunic reachable with bottle blue fire only');
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});
