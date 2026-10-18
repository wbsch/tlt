import {
  migrateLegacyClocksSetting,
  splitLegacyStartingAgeSetting,
} from '@packs/ootmm/utils/spoilerSettingsMigration';
import type { PersistedStorePayload, StateMigration } from './index';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * v3 → v4: OoTMM v33.0 settings changes.
 *
 * - `startingAge` → `startingAgeOot` + `startingAgeMm`: OoTMM v33.0 split
 *   the single starting age into one setting per game.
 * - `clocks` → `clocksMm`: OoTMM v33.0 split the single clocks toggle into a
 *   per-game setting. The old key only controlled MM, so its value maps to
 *   `clocksMm`.
 *
 * Persisted tracker settings that still carry an old key must be upgraded,
 * otherwise the value is dropped by the settings allowlist and the tracker
 * silently falls back to the default.
 *
 * The transforms themselves live next to the other legacy settings mappings
 * in `packs/ootmm/src/utils/spoilerSettingsMigration.ts`, because imported
 * spoiler logs need the exact same changes (applied by
 * `normalizeSpoilerSettings`). The step is safe to run against payloads that
 * were already (partially) upgraded. Field-guarded: a payload without either
 * legacy key passes through unchanged.
 */
export const v3ToV4SettingsChanges: StateMigration = {
  version: 3,
  up(state) {
    const settings = state.trackerSettings;
    if (!isPlainObject(settings)) return state;

    const withSplitAge = splitLegacyStartingAgeSetting(settings);
    const nextSettings = migrateLegacyClocksSetting(withSplitAge);
    // The helpers return the same reference when there is no legacy key.
    if (nextSettings === settings) return state;

    const next: PersistedStorePayload = { ...state };
    next.trackerSettings = nextSettings;
    return next;
  },
};
