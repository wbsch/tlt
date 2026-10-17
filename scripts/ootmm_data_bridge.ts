// Bridge to the OoTMM randomizer's data exports, wired up as the
// '@ootmm/data' alias in vite.config.ts and tsconfig.json. It lives outside
// the tsconfig include sets on purpose: app type-checking sees only the
// ambient declarations in packs/ootmm/src/ootmm.d.ts, never OoTMM sources.
//
// Since v33 upstream ships `@ootmm/data` as its own package again
// (packages/data, JSON built into packages/data/dist/lib/). The alias shadows
// that package for OoTMM's own sources too, so everything it exports is
// re-exported unchanged. On top of that, two exports the tracker relies on are
// rebuilt here:
// - POOL: upstream dropped `data-pool.json`; its successor `data-checks.json`
//   (CHECKS) is a flat list with game-prefixed locations and items, so it is
//   regrouped into the old per-game, unprefixed shape.
// - RAW_HINTS_DATA: `data-hints-raw.json` was replaced by `data-gossips.json`
//   (v31), whose records also carry game-prefixed location names.
import * as ComboRegionsMod from '../OoTMM/packages/generator/lib/combo/regions';
import { CHECKS, GOSSIPS } from '../OoTMM/packages/data/lib/index';

export * from '../OoTMM/packages/data/lib/index';

// tsx loads the generator sources as CommonJS (that package has no
// "type": "module"), which hides the named exports behind `default`; vite
// keeps them as ESM named exports. Normalize before re-exporting. The
// indirection through a parameter also keeps the bundler from statically
// flagging the `default` access as an undefined import.
const unwrapNamespace = <T>(mod: T): T =>
  (mod as { default?: T }).default ?? mod;

const comboRegions = unwrapNamespace(ComboRegionsMod);

export const regionName = (region: string): string =>
  comboRegions.regionName(region);

type Game = 'oot' | 'mm';

const stripGamePrefix = (game: Game, value: string, sep: string): string => {
  const prefix = `${game.toUpperCase()}${sep}`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

type PoolRecord = {
  location: string;
  type: string;
  scene: string;
  hint?: string;
  item: string;
};

const pool: Record<Game, PoolRecord[]> = { oot: [], mm: [] };

for (const check of CHECKS) {
  pool[check.game].push({
    location: stripGamePrefix(check.game, check.location, ' '),
    type: check.type,
    scene: stripGamePrefix(check.game, check.scene, '_'),
    hint: check.hint,
    item: stripGamePrefix(check.game, check.item, '_'),
  });
}

export const POOL = pool;

type GossipRecord = { game: Game; location: string };

const rawHints: Record<Game, { location: string }[]> = {
  oot: [],
  mm: [],
};

for (const gossip of GOSSIPS as GossipRecord[]) {
  rawHints[gossip.game].push({
    location: stripGamePrefix(gossip.game, gossip.location, ' '),
  });
}

export const RAW_HINTS_DATA = rawHints;
