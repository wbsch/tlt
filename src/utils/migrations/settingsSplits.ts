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
 * The legacy value is copied to BOTH new settings (the old setting applied to
 * both games). Explicitly present new keys win, so the step is safe to run
 * against payloads that were already (partially) upgraded. Field-guarded: a
 * payload without `trackerSettings.startingAge` passes through unchanged.
 */
export const v3ToV4StartingAgeSplit: StateMigration = {
  version: 3,
  up(state) {
    const settings = state.trackerSettings;
    if (!isPlainObject(settings)) return state;
    if (!Object.prototype.hasOwnProperty.call(settings, 'startingAge')) {
      return state;
    }

    const legacyAge = settings.startingAge;
    const nextSettings: Record<string, unknown> = { ...settings };

    if (typeof legacyAge === 'string') {
      if (nextSettings.startingAgeOot === undefined) {
        nextSettings.startingAgeOot = legacyAge;
      }
      if (nextSettings.startingAgeMm === undefined) {
        nextSettings.startingAgeMm = legacyAge;
      }
    }

    delete nextSettings.startingAge;

    const next: PersistedStorePayload = { ...state };
    next.trackerSettings = nextSettings;
    return next;
  },
};
