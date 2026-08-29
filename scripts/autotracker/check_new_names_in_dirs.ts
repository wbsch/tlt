/**
 * Check whether any rename-map VALUE (new name) is already present in the
 * bitmap sections of the given dirs — indicating a prior rename application.
 *
 * Usage: node --import tsx scripts/autotracker/check_new_names_in_dirs.ts [dir ...]
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
  console.error('usage: check_new_names_in_dirs.ts <dir ...>');
  process.exit(1);
}

const newNames = new Set(LOCATION_RENAME_MAP.values());

for (const dir of dirs) {
  const d = JSON.parse(
    fs.readFileSync(path.join(DATA_BASE, dir, 'locations.json'), 'utf8'),
  );
  const names = new Set((d.bitmap ?? []).map((e) => e.name));
  const present = [...newNames].filter((n) => names.has(n));
  console.log(`${dir}: new names present: ${JSON.stringify(present)}`);
}
