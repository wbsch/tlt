/**
 * Verify the name-based Great Bay Coast rename in versioned locations.json
 * dirs: after the rename, every map VALUE must appear exactly once, and no
 * map KEY may remain unless it is itself a map value (chain product such as
 * "Pot Ledge 1" produced from "Pot 01").
 *
 * Usage: node --import tsx scripts/autotracker/verify_renamed_dirs.ts [dir ...]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOCATION_RENAME_MAP } from '../../src/utils/migrations/locationRenames';

const DATA_BASE = path.resolve(
  import.meta.dirname,
  '../../packs/ootmm/src/autotracker/data',
);

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: verify_renamed_dirs.ts <dir ...>');
  process.exit(1);
}

const keys = new Set(LOCATION_RENAME_MAP.keys());
const values = new Set(LOCATION_RENAME_MAP.values());
const keysNotValues = [...keys].filter((k) => !values.has(k));

let failed = false;

for (const dir of dirs) {
  const d = JSON.parse(
    fs.readFileSync(path.join(DATA_BASE, dir, 'locations.json'), 'utf8'),
  );
  const names = (d.bitmap ?? []).map((e) => e.name);
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);

  const remainingKeys = names.filter((n) => keys.has(n));
  const badKeys = remainingKeys.filter((n) => keysNotValues.includes(n));
  const valueCounts = [...values].map((v) => ({
    name: v,
    count: counts.get(v) ?? 0,
  }));

  console.log(`=== ${dir} ===`);
  console.log(
    `  un-renamed old names (key, not a chain value): ${JSON.stringify(badKeys)}`,
  );
  console.log(
    `  map values: ${valueCounts.filter((v) => v.count !== 1).length} not exactly-once`,
  );
  for (const v of valueCounts) {
    if (v.count !== 1) console.log(`    ${v.name}: ${v.count}`);
  }

  if (badKeys.length > 0 || valueCounts.some((v) => v.count !== 1)) {
    failed = true;
  }
}

if (failed) {
  console.error('\nVERIFICATION FAILED');
  process.exit(1);
}
console.log('\nAll dirs verified OK.');
