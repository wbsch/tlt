// Bridge to the OoTMM randomizer's data exports, wired up as the
// '@ootmm/data' alias in vite.config.ts and tsconfig.json. It lives outside
// the tsconfig include sets on purpose: app type-checking sees only the
// ambient declarations in packs/ootmm/src/ootmm.d.ts, never OoTMM sources.
//
// Upstream merged `@ootmm/data` into `@ootmm/core` (v31) and replaced
// `data-hints-raw.json` with `data-gossips.json`, whose records carry
// game-prefixed location names, so RAW_HINTS_DATA is rebuilt here in the old
// per-game, unprefixed shape.
import * as CoreDataMod from '../OoTMM/packages/core/src/data/data';
import GOSSIPS from '../OoTMM/packages/core/dist/data-gossips.json';

// tsx loads the OoTMM sources as CommonJS (upstream has no "type": "module"),
// which hides the named exports behind `default`; vite keeps them as ESM
// named exports. Normalize before re-exporting. The indirection through a
// parameter also keeps the bundler from statically flagging the `default`
// access as an undefined import.
const unwrapNamespace = <T>(mod: T): T =>
  (mod as { default?: T }).default ?? mod;

const coreData = unwrapNamespace(CoreDataMod);

export const WORLD = coreData.WORLD;
export const SCENES = coreData.SCENES;
export const NPC = coreData.NPC;
export const REGIONS = coreData.REGIONS;
export const HINTS = coreData.HINTS;
export const RAW_GI = coreData.RAW_GI;
export const RAW_DRAWGI = coreData.RAW_DRAWGI;
export const FILES = coreData.FILES;
export const MACROS = coreData.MACROS;
export const POOL = coreData.POOL;
export const ENTRANCES = coreData.ENTRANCES;
export type {
  Entrance,
  EntranceData,
} from '../OoTMM/packages/core/src/data/data';

type GossipRecord = { game: 'oot' | 'mm'; location: string };

const rawHints: Record<'oot' | 'mm', { location: string }[]> = {
  oot: [],
  mm: [],
};

for (const gossip of GOSSIPS as GossipRecord[]) {
  const prefix = `${gossip.game.toUpperCase()} `;
  rawHints[gossip.game].push({
    location: gossip.location.startsWith(prefix)
      ? gossip.location.slice(prefix.length)
      : gossip.location,
  });
}

export const RAW_HINTS_DATA = rawHints;
