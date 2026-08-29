import type { PersistedStorePayload, StateMigration } from './index';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * v32.2 → v32.3 location renames (Great Bay Coast, MM).
 *
 * The OoTMM world graph keys its checks by their display names, so when v32.3
 * renamed the Great Bay Coast pot/rock checks the location ids changed too.
 * Persisted payloads that were saved against a v32.2 spoiler log therefore
 * still reference the old names and must be renamed on upgrade.
 *
 * Old → new, exactly as derived by comparing `locations.json` of v32.2 vs
 * v32.3 (same check, different name). Names are WITHOUT the `OOT `/`MM `
 * game prefix; see `renameLocationId` for the full id formats handled.
 */
export const LOCATION_RENAME_MAP: ReadonlyMap<string, string> = new Map([
  ['Great Bay Coast Pot Ledge 1', 'Great Bay Coast Pot Upper Cliffs 1'],
  ['Great Bay Coast Pot Ledge 2', 'Great Bay Coast Pot Upper Cliffs 2'],
  ['Great Bay Coast Pot Ledge 3', 'Great Bay Coast Pot Upper Cliffs 3'],
  ['Great Bay Coast Rock Ledge 1', 'Great Bay Coast Rock Cliffs 1'],
  ['Great Bay Coast Rock Ledge 2', 'Great Bay Coast Rock Cliffs 2'],
  ['Great Bay Coast Rock Ledge 3', 'Great Bay Coast Rock Cliffs 3'],
  ['Great Bay Coast Pot 01', 'Great Bay Coast Pot Ledge 1'],
  ['Great Bay Coast Pot 02', 'Great Bay Coast Pot 1'],
  ['Great Bay Coast Pot 03', 'Great Bay Coast Pot Lower Cliffs 3'],
  ['Great Bay Coast Pot 04', 'Great Bay Coast Pot Lower Cliffs 2'],
  ['Great Bay Coast Pot 05', 'Great Bay Coast Pot Platform 1'],
  ['Great Bay Coast Pot 06', 'Great Bay Coast Pot Platform 3'],
  ['Great Bay Coast Pot 07', 'Great Bay Coast Pot Platform 2'],
  ['Great Bay Coast Pot 08', 'Great Bay Coast Pot Ledge 2'],
  ['Great Bay Coast Pot 09', 'Great Bay Coast Pot 2'],
  ['Great Bay Coast Pot 10', 'Great Bay Coast Pot Lower Cliffs 4'],
  ['Great Bay Coast Pot 11', 'Great Bay Coast Pot Lower Cliffs 1'],
  ['Great Bay Coast Pot 12', 'Great Bay Coast Pot Platform 4'],
]);

/**
 * v30.1 → v31.0 location renames (Secret Shrine pots, MM).
 *
 * The pool CSV rename (OoTMM commit 5a0621a82, "Rename locations +
 * changelog") preserved the raw flag IDs exactly, so an old name identifies
 * the same physical check as its new name. States saved against a v30.1
 * world graph contain the old ids and must be renamed on upgrade — the same
 * silent-collected-loss problem as the Great Bay Coast renames, just from an
 * older version jump.
 *
 * Applied as part of the legacy v1 → v2 step (same v30.1 → v31.0 era as the
 * rest of that bundle's transforms); it was simply forgotten when the legacy
 * bundle was written.
 *
 * Old → new, exactly as derived by comparing `locations.json` of v30.1 vs
 * v31.0 (same check, different name).
 */
export const SECRET_SHRINE_RENAME_MAP: ReadonlyMap<string, string> = new Map([
  ['Secret Shrine Pot 1', 'Secret Shrine Pot Entrance 1'],
  ['Secret Shrine Pot 2', 'Secret Shrine Pot Entrance 2'],
  ['Secret Shrine Pot 3', 'Secret Shrine Pot Entrance 3'],
  ['Secret Shrine Pot 4', 'Secret Shrine Pot Underwater 1'],
  ['Secret Shrine Pot 5', 'Secret Shrine Pot Underwater 2'],
  ['Secret Shrine Pot 6', 'Secret Shrine Pot Underwater 3'],
  ['Secret Shrine Pot 7', 'Secret Shrine Pot Underwater 4'],
  ['Secret Shrine Pot 8', 'Secret Shrine Pot Underwater 5'],
  ['Secret Shrine Pot 9', 'Secret Shrine Pot Underwater 6'],
]);

/**
 * Rename a single location reference using the given map.
 *
 * Handles the id formats that appear in persisted payloads:
 * - `"MM Secret Shrine Pot 1"` (junkLocations, plando.locations keys)
 * - `"MM Secret Shrine Pot 1@0"` (collectedLocationIds / junkLocationIds;
 *   the `@world` suffix is preserved, including in multiworld)
 *
 * Names without a game prefix are matched too (defensive). Exact-name matching
 * only — a map key is never a substring match, so `Pot 1` cannot touch
 * `Pot 10` etc.
 */
export function renameLocationId(
  value: string,
  map: ReadonlyMap<string, string> = LOCATION_RENAME_MAP,
): string {
  const worldMatch = /@\d+$/.exec(value);
  const base = worldMatch ? value.slice(0, worldMatch.index) : value;
  const prefixMatch = /^(?:OOT|MM)\s+/i.exec(base);
  const bareName = prefixMatch ? base.slice(prefixMatch[0].length) : base;
  const renamed = map.get(bareName);
  if (!renamed) return value;
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const suffix = worldMatch ? worldMatch[0] : '';
  return `${prefix}${renamed}${suffix}`;
}

/**
 * Rename location references in the persisted payload using the given map.
 *
 * Touches only fields that can contain location references:
 * - `collectedLocationIds` / `junkLocationIds` (full ids, `name@world`)
 * - `trackerSettings.junkLocations` (raw ids, `name`)
 * - `trackerSettings.plando.locations` (object keyed by location id)
 *
 * Field-guarded: stores that do not carry these fields (`app`, `ootmm-ui`)
 * pass through unchanged.
 */
export function renameLocationFields(
  state: PersistedStorePayload,
  map: ReadonlyMap<string, string>,
): PersistedStorePayload {
  const next: PersistedStorePayload = { ...state };

  if (Array.isArray(next.collectedLocationIds)) {
    next.collectedLocationIds = renameStringArray(
      next.collectedLocationIds,
      map,
    );
  }
  if (Array.isArray(next.junkLocationIds)) {
    next.junkLocationIds = renameStringArray(next.junkLocationIds, map);
  }

  if (isPlainObject(next.trackerSettings)) {
    const trackerSettings: Record<string, unknown> = {
      ...next.trackerSettings,
    };
    if (Array.isArray(trackerSettings.junkLocations)) {
      trackerSettings.junkLocations = renameStringArray(
        trackerSettings.junkLocations,
        map,
      );
    }
    if (isPlainObject(trackerSettings.plando)) {
      const plando: Record<string, unknown> = { ...trackerSettings.plando };
      if (isPlainObject(plando.locations)) {
        plando.locations = renameRecordKeys(plando.locations, map);
      }
      trackerSettings.plando = plando;
    }
    next.trackerSettings = trackerSettings;
  }

  return next;
}

/**
 * v2 → v3: Great Bay Coast renames (v32.2 → v32.3).
 *
 * NOTE on idempotency: two map entries form a rename chain (`Pot 01` →
 * `Pot Ledge 1` → `Upper Cliffs 1`), so a second application of this step
 * would over-rename a payload that was already migrated. This is safe in
 * practice because the migration chain gate (`v` field) ensures each step
 * runs exactly once per payload — the step only ever sees pre-rename data.
 */
export const v2ToV3LocationRenames: StateMigration = {
  version: 2,
  up(state) {
    return renameLocationFields(state, LOCATION_RENAME_MAP);
  },
};

function renameStringArray(
  values: unknown,
  map: ReadonlyMap<string, string>,
): unknown {
  if (!Array.isArray(values)) return values;
  let changed = false;
  const next = values.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const renamed = renameLocationId(entry, map);
    if (renamed !== entry) changed = true;
    return renamed;
  });
  return changed ? next : values;
}

function renameRecordKeys(
  record: unknown,
  map: ReadonlyMap<string, string>,
): unknown {
  if (!isPlainObject(record)) return record;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const renamed = renameLocationId(key, map);
    if (renamed !== key) changed = true;
    next[renamed] = entry;
  }
  return changed ? next : record;
}
