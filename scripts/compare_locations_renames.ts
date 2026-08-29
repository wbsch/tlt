/**
 * Compare locations.json between two autotracker data versions and report
 * location renames (same id, different name), plus added/removed ids.
 *
 * Usage: node --import tsx scripts/compare_locations_renames.ts v32_2 v32_3
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const base = path.resolve(
  import.meta.dirname,
  '../packs/ootmm/src/autotracker/data',
);
const [fromDir, toDir] = process.argv.slice(2);
if (!fromDir || !toDir) {
  console.error('usage: compare_locations_renames.ts <fromDir> <toDir>');
  process.exit(1);
}

const a = JSON.parse(
  fs.readFileSync(path.join(base, fromDir, 'locations.json'), 'utf8'),
);
const b = JSON.parse(
  fs.readFileSync(path.join(base, toDir, 'locations.json'), 'utf8'),
);

function compareSection<T>(
  name: string,
  aSection: T[],
  bSection: T[],
  idFn: (e: T) => string,
  nameFn: (e: T) => string,
) {
  const m = new Map<string, T>();
  const n = new Map<string, T>();
  for (const e of aSection) {
    const id = idFn(e);
    if (m.has(id)) console.log(`DUPLICATE id in ${fromDir}:`, id);
    m.set(id, e);
  }
  for (const e of bSection) {
    const id = idFn(e);
    if (n.has(id)) console.log(`DUPLICATE id in ${toDir}:`, id);
    n.set(id, e);
  }
  const renamed: { id: string; old: string; neu: string }[] = [];
  for (const [id, e] of m) {
    const f = n.get(id);
    if (f && nameFn(f) !== nameFn(e))
      renamed.push({ id, old: nameFn(e), neu: nameFn(f) });
  }
  const added = [...n.keys()].filter((id) => !m.has(id));
  const removed = [...m.keys()].filter((id) => !n.has(id));
  console.log(
    `=== ${name} === renamed: ${renamed.length}, added: ${added.length}, removed: ${removed.length}`,
  );
  for (const r of renamed)
    console.log(
      `  RENAME  ${JSON.stringify(r.old)}  ->  ${JSON.stringify(r.neu)}   (${r.id})`,
    );
  if (added.length) console.log('  added ids:', added.slice(0, 30).join(', '));
  if (removed.length)
    console.log('  removed ids:', removed.slice(0, 30).join(', '));
}

// scene: { sceneId: { locId: { name, ... } } }
const aScene: { id: string; name: string }[] = [];
const bScene: { id: string; name: string }[] = [];
for (const [sceneId, locs] of Object.entries(a.scene)) {
  for (const [locId, e] of Object.entries(
    locs as Record<string, { name: string }>,
  )) {
    aScene.push({ id: `${sceneId}:${locId}`, name: e.name });
  }
}
for (const [sceneId, locs] of Object.entries(b.scene)) {
  for (const [locId, e] of Object.entries(
    locs as Record<string, { name: string }>,
  )) {
    bScene.push({ id: `${sceneId}:${locId}`, name: e.name });
  }
}
compareSection(
  'scene',
  aScene,
  bScene,
  (x) => x.id,
  (x) => x.name,
);
compareSection(
  'scene_conflicts',
  a.scene_conflicts,
  b.scene_conflicts,
  (x) => x.key,
  (x) => `${x.vanilla}|${x.mq}`,
);
compareSection(
  'bitmap',
  a.bitmap,
  b.bitmap,
  (x) => `${x.block}:${x.bit}`,
  (x) => x.name,
);
compareSection(
  'bitmap_conflicts',
  a.bitmap_conflicts ?? [],
  b.bitmap_conflicts ?? [],
  (x) => `${x.block}:${x.bit}`,
  (x) => x.name,
);
compareSection(
  'symbols',
  a.symbols,
  b.symbols,
  (x) => x.symbol,
  (x) => x.name,
);
