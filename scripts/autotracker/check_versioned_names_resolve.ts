/**
 * Verify that every bitmap check name in every versioned autotracker data dir
 * resolves against the current tracker world graph (by name, with the
 * game prefix inferred from the bitmap block).
 *
 * Names that do not resolve mean the autotracker would silently never mark
 * that location collected for that spoiler-log version.
 *
 * Usage: node --import tsx scripts/autotracker/check_versioned_names_resolve.ts
 */

import 'tsconfig-paths/register';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

const BLOCK_GAME: Record<string, string> = {
  caughtFishFlags: 'OOT',
  npcOot: 'OOT',
  npcMm: 'MM',
  gsOot: 'OOT',
  xflagsOot: 'OOT',
  xflagsMm: 'MM',
  shopsOot: 'OOT',
  shopsMm: 'MM',
  scrubsOot: 'OOT',
  srOot: 'OOT',
};

async function main() {
  const tracker = new OoTMMTracker();
  await tracker.initialize();
  const locs = tracker.getAllLocationsForCodeSearch();
  const nameSet = new Set(locs.map((l) => l.id.replace(/@\d+$/, '')));

  const base = path.resolve('packs/ootmm/src/autotracker/data');
  const versionDirs = fs
    .readdirSync(base)
    .filter((name) => /^v\d+_\d+$/.test(name))
    .sort();

  let totalMissing = 0;
  for (const v of versionDirs) {
    const d = JSON.parse(
      fs.readFileSync(path.join(base, v, 'locations.json'), 'utf8'),
    );
    const missing: string[] = [];
    for (const entry of d.bitmap ?? []) {
      const game = BLOCK_GAME[entry.block];
      if (!game) continue;
      const full = `${game} ${entry.name}`;
      if (!nameSet.has(full)) missing.push(full);
    }
    const unique = [...new Set(missing)].sort();
    console.log(`${v}: unresolvable bitmap names: ${unique.length}`);
    for (const m of unique) console.log(`    ${m}`);
    totalMissing += unique.length;
  }
  console.log(`total unresolvable: ${totalMissing}`);
  process.exit(totalMissing > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
