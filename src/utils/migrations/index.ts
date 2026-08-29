import { legacyV1ToV2 } from './legacy';
import { v2ToV3LocationRenames } from './locationRenames';

/**
 * A single persisted store payload. Store payloads are plain JSON objects:
 * both the localStorage (Pinia) surface and each entry in a share snapshot's
 * `stores` map fit this shape.
 */
export type PersistedStorePayload = Record<string, unknown>;

/**
 * One migration step in the ordered version chain.
 *
 * A step upgrades a payload from `version` to `version + 1`. Steps are ordered
 * ascending by `version`, so running every step whose `version >= fromVersion`
 * upgrades a payload from `fromVersion` to the latest version without ever
 * skipping a step (the database A→B→C pattern).
 */
export type StateMigration = {
  /** The version this step upgrades *from*. Produces `version + 1`. */
  version: number;
  /** Idempotent, field-guarded transform of a single store payload. */
  up: (state: PersistedStorePayload) => PersistedStorePayload;
};

/**
 * Ordered migration steps, ascending by `version`. Every step must be
 * field-guarded so the same chain is safe to run against any store
 * (app / ootmm-ui / ootmm-session).
 */
export const STATE_MIGRATIONS: readonly StateMigration[] = [
  legacyV1ToV2,
  v2ToV3LocationRenames,
];

/**
 * The current (latest) schema version for persisted state payloads.
 *
 * Derived from the chain length: version 1 payloads have no `v` field and
 * predate the registry; each migration step adds one version.
 */
export const LATEST_STATE_VERSION = 1 + STATE_MIGRATIONS.length;

/**
 * Upgrade a store payload from `fromVersion` to the latest version by applying
 * every migration step whose `version >= fromVersion`, in ascending order.
 *
 * Never skips a step. `fromVersion` values above the latest version apply no
 * migration (the caller is responsible for rejecting future versions before
 * this point). Returns the same reference when nothing migrates.
 */
export function migrateStateToLatest(
  state: PersistedStorePayload,
  fromVersion: number,
): PersistedStorePayload {
  let current = state;
  for (const migration of STATE_MIGRATIONS) {
    if (migration.version >= fromVersion) {
      current = migration.up(current);
    }
  }
  return current;
}
