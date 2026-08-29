import { describe, expect, it } from 'vitest';
import { getVersionedDataFile } from '@/../packs/ootmm/src/autotracker/data/registry';
import { LOCATION_CODE_CATALOG } from '@/../packs/ootmm/src/data/locationCatalog';

/**
 * Regression guards for the v32.3 Great Bay Coast rename (see
 * `src/utils/migrations/locationRenames.ts`).
 *
 * The tracker resolves autotracker check names against the CURRENT world
 * graph (bundled OoTMM data), never against the version's historical graph.
 * Versioned `locations.json` files must therefore use the CURRENT names for
 * their checks, or the checks silently never resolve to a location id and are
 * never marked collected.
 *
 * The v32.0/v32.1/v32.2 xflags layout is identical to v32.3's — only 18
 * Great Bay Coast names differed (renamed in v32.3) — so those dirs must
 * mirror v32.3's bitmap section exactly.
 *
 * v30_1/v31_0/v31_1 use a different xflags bit layout, so their bitmap can
 * not be byte-identical to v32.3's; they were aligned by NAME (the v32.3
 * rename preserved raw flag IDs). For those dirs we only require the
 * name-level invariant: no check name that v32_3 resolves may be
 * unresolvable there.
 */
const V32_DIRS = ['v32_0', 'v32_1', 'v32_2'] as const;
const PREV_LAYOUT_DIRS = ['v30_1', 'v31_0', 'v31_1'] as const;

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

type BitmapEntry = { block: string; bit: number; name: string };

function bitmapMap(dirName: string): Map<string, string> {
  const file = getVersionedDataFile(dirName, 'locations.json') as {
    bitmap?: BitmapEntry[];
  };
  const map = new Map<string, string>();
  for (const entry of file.bitmap ?? []) {
    map.set(`${entry.block}:${entry.bit}`, entry.name);
  }
  return map;
}

function firstDiffs(a: Map<string, string>, b: Map<string, string>): string[] {
  const diffs: string[] = [];
  for (const [key, aName] of a) {
    const bName = b.get(key);
    if (bName !== aName) {
      diffs.push(`${key}: ${aName} vs ${bName ?? '<missing>'}`);
      if (diffs.length >= 10) break;
    }
  }
  if (diffs.length < 10) {
    for (const [key, bName] of b) {
      if (!a.has(key)) {
        diffs.push(`${key}: <missing> vs ${bName}`);
        if (diffs.length >= 10) break;
      }
    }
  }
  return diffs;
}

describe('versioned autotracker check names resolve against the current world graph', () => {
  it.each(V32_DIRS)('%s bitmap section is identical to v32_3', (dirName) => {
    const old = bitmapMap(dirName);
    const current = bitmapMap('v32_3');
    const diffs = firstDiffs(old, current);
    expect(diffs).toEqual([]);
  });

  it.each([...V32_DIRS, ...PREV_LAYOUT_DIRS])(
    '%s has no check names the current dir does not also have',
    (dirName) => {
      const catalogNames = new Set(
        LOCATION_CODE_CATALOG.map((entry) => entry.id.replace(/@\d+$/, '')),
      );

      const unresolvableFor = (name: string) => {
        const missing: string[] = [];
        for (const [key, checkName] of bitmapMap(name)) {
          const block = key.slice(0, key.indexOf(':'));
          const game = BLOCK_GAME[block];
          if (!game) continue;
          const full = `${game} ${checkName}`;
          if (!catalogNames.has(full)) missing.push(full);
        }
        return missing.sort();
      };

      const currentUnresolvable = unresolvableFor('v32_3');
      const oldUnresolvable = unresolvableFor(dirName);

      // Whatever is unresolvable in v32_3 (e.g. save flags that cover multiple
      // world checks or have no location) is tolerated for the old dirs too —
      // but an old dir must never have names that the current dir resolves.
      const unexpected = oldUnresolvable.filter(
        (name) => !currentUnresolvable.includes(name),
      );
      expect(unexpected).toEqual([]);
    },
  );
});
