import { splitLegacyStartingAgeSetting } from '@packs/ootmm/utils/spoilerSettingsMigration';
import type { PersistedStorePayload, StateMigration } from './index';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * v3 → v4: `startingAge` → `startingAgeOot` + `startingAgeMm`.
 *
 * OoTMM v33.0 split the single `startingAge` setting into one setting per
 * game (`startingAgeOot`, `startingAgeMm`). Persisted tracker settings that
 * still carry the old key must be upgraded, otherwise the value is dropped by
 * the settings allowlist and both games silently fall back to their defaults.
 *
 * The transform itself lives next to the other legacy settings mappings in
 * `packs/ootmm/src/utils/spoilerSettingsMigration.ts`, because imported
 * spoiler logs need the exact same split (applied by
 * `normalizeSpoilerSettings`). The legacy value is copied to BOTH new settings
 * (the old setting applied to both games). Explicitly present new keys win, so
 * the step is safe to run against payloads that were already (partially)
 * upgraded. Field-guarded: a payload without `trackerSettings.startingAge`
 * passes through unchanged.
 */
export const v3ToV4StartingAgeSplit: StateMigration = {
  version: 3,
  up(state) {
    const settings = state.trackerSettings;
    if (!isPlainObject(settings)) return state;

    const nextSettings = splitLegacyStartingAgeSetting(settings);
    // The helper returns the same reference when there is no legacy key.
    if (nextSettings === settings) return state;

    const next: PersistedStorePayload = { ...state };
    next.trackerSettings = nextSettings;
    return next;
  },
};
