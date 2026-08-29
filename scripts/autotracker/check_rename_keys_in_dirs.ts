/**
 * Check which rename-map keys appear in a versioned locations.json bitmap
 * section, and whether each appears exactly once (unambiguous rename).
 *
 * Usage: node --import tsx scripts/autotracker/check_rename_keys_in_dirs.ts [dir ...]
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
  console.error('usage: check_rename_keys_in_dirs.ts <dir ...>');
  process.exit(1);
}

for (const dir of dirs) {
  const d = JSON.parse(
    fs.readFileSync(path.join(DATA_BASE, dir, 'locations.json'), 'utf8'),
  );
  const byName = new Map<string, string[]>();
  for (const e of d.bitmap ?? []) {
    const list = byName.get(e.name) ?? [];
    list.push(`${e.block}:${e.bit}`);
    byName.set(e.name, list);
  }
  console.log(`=== ${dir} ===`);
  let hits = 0;
  for (const [oldName] of LOCATION_RENAME_MAP) {
    const locs = byName.get(oldName);
    if (locs) {
      hits += 1;
      console.log(
        `  ${oldName} -> ${locs.length} occurrence(s): ${locs.join(', ')}`,
      );
    }
  }
  console.log(`  total rename-key hits: ${hits}`);
}
