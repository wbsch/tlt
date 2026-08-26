import { describe, expect, it } from 'vitest';
import {
  LATEST_STATE_VERSION,
  STATE_MIGRATIONS,
  migrateStateToLatest,
} from '@/utils/migrations';
import {
  PERSIST_CONFIGS,
  removePersistedPayload,
  resolvePersistedPayload,
  sanitizePersistedStateForStore,
} from '@/stores/persist';

describe('migration registry', () => {
  it('has exactly one step today and LATEST_STATE_VERSION === 2', () => {
    expect(STATE_MIGRATIONS).toHaveLength(1);
    expect(STATE_MIGRATIONS[0].version).toBe(1);
    expect(LATEST_STATE_VERSION).toBe(2);
  });

  it('applies steps whose version is >= fromVersion (chaining)', () => {
    // v1 → runs the single 1→2 step.
    const migrated = migrateStateToLatest(
      { trackerSettings: { crossWarpOot: true } },
      1,
    );
    expect(migrated.trackerSettings).toMatchObject({
      songMinuetMm: true,
    });
    expect(
      (migrated.trackerSettings as Record<string, unknown>).crossWarpOot,
    ).toBeUndefined();
  });

  it('runs no steps for an already-latest payload', () => {
    const input = { trackerSettings: { songMinuetMm: true } };
    const migrated = migrateStateToLatest(input, LATEST_STATE_VERSION);
    expect(migrated).toBe(input);
  });

  it('runs no steps for a future version (never migrates down)', () => {
    const input = { trackerSettings: { crossWarpOot: true } };
    const migrated = migrateStateToLatest(input, LATEST_STATE_VERSION + 1);
    expect(migrated).toBe(input);
    expect(
      (migrated.trackerSettings as Record<string, unknown>).crossWarpOot,
    ).toBe(true);
  });

  it('is idempotent', () => {
    const state = {
      entranceOverrides: {
        OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      },
      trackerSettings: { crossWarpOot: true },
      inventoryById: { MM_SONG_GORON: 1 },
    };
    const once = migrateStateToLatest({ ...state }, 1);
    const twice = migrateStateToLatest({ ...once }, 1);
    expect(twice).toEqual(once);
  });
});

describe('sanitizePersistedStateForStore (migration + hydrate)', () => {
  it('treats a payload without a `v` field as version 1 and migrates it', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: { sunSongMm: true },
    });
    expect(result.trackerSettings).toMatchObject({ songSunMm: true });
  });

  it('captures the cross-warp synthesis flag before M2 deletes the legacy key', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: { crossWarpOot: true },
      inventoryById: { OOT_SONG_TP_FOREST: 1 },
    });
    // Flag captured by the migration, synthesis run by the hydrate.
    expect(result.needsLegacyCrossWarpOotSynthesis).toBe(true);
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.MM_SONG_TP_FOREST).toBe(1);
  });

  it('folds a persisted full Goron Lullaby into the half stage 2 (M3)', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: { progressiveGoronLullabyMm: 'progressive' },
      inventoryById: { MM_SONG_GORON: 1 },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.MM_SONG_GORON_HALF).toBe(2);
    expect(inventory.MM_SONG_GORON).toBeUndefined();
  });

  it('migrates the old ER structure to the new ER structure (M1)', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {},
      entranceOverrides: {
        OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      },
    });
    expect(result.entranceOverrides).toEqual({
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    });
  });

  it('skips M1 in decoupled ER mode', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: { erDecoupled: true },
      entranceOverrides: {
        OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      },
    });
    expect(result.entranceOverrides).toEqual({
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
    });
  });

  it('merges the ui sidebar flags into isRightSidebarOpen (ootmm-ui)', () => {
    const result = sanitizePersistedStateForStore('ootmm-ui', {
      isEntrancesSidebarOpen: true,
    });
    expect(result.isRightSidebarOpen).toBe(true);
    expect(result.activeRightSidebarTab).toBe('entrances');
    expect(result).not.toHaveProperty('isEntrancesSidebarOpen');
    expect(result).not.toHaveProperty('isLocationsSidebarOpen');
  });
});

describe('storage key migration', () => {
  it('reads a legacy :v1 key, migrates, writes the versionless key, and removes the legacy key', () => {
    const legacyKey = `${PERSIST_CONFIGS['ootmm-session'].key}:v1`;
    window.localStorage.setItem(
      legacyKey,
      JSON.stringify({ trackerSettings: { sunSongMm: true } }),
    );

    const resolved = resolvePersistedPayload('ootmm-session');
    expect(resolved).not.toBeNull();
    expect((resolved as Record<string, unknown>).trackerSettings).toMatchObject(
      { songSunMm: true },
    );

    // Legacy key removed; versionless key written with the current version.
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
    const versionless = JSON.parse(
      window.localStorage.getItem(PERSIST_CONFIGS['ootmm-session'].key) ?? '{}',
    ) as Record<string, unknown>;
    expect(versionless.v).toBe(LATEST_STATE_VERSION);
    expect(versionless.trackerSettings).toMatchObject({ songSunMm: true });
  });

  it('uses the versionless key as-is when it is already present', () => {
    const key = PERSIST_CONFIGS['ootmm-session'].key;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: LATEST_STATE_VERSION,
        trackerSettings: { mode: 'open' },
      }),
    );

    const resolved = resolvePersistedPayload('ootmm-session');
    expect(resolved).toEqual({
      v: LATEST_STATE_VERSION,
      trackerSettings: { mode: 'open' },
    });
  });

  it('removes a lingering legacy :v1 key even when the versionless key already exists', () => {
    const key = PERSIST_CONFIGS['ootmm-session'].key;
    const legacyKey = `${key}:v1`;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: LATEST_STATE_VERSION,
        trackerSettings: { mode: 'open' },
      }),
    );
    // Stale legacy key left behind (e.g. by a hot-reload that wrote the
    // versionless key before the legacy key was cleaned up).
    window.localStorage.setItem(
      legacyKey,
      JSON.stringify({ trackerSettings: { sunSongMm: true } }),
    );

    const resolved = resolvePersistedPayload('ootmm-session');

    // Versionless payload wins; legacy key is removed (no duplication).
    expect(resolved).toEqual({
      v: LATEST_STATE_VERSION,
      trackerSettings: { mode: 'open' },
    });
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });

  it('removePersistedPayload removes both versionless and legacy keys', () => {
    const key = PERSIST_CONFIGS['ootmm-session'].key;
    const legacyKey = `${key}:v1`;
    window.localStorage.setItem(key, '{}');
    window.localStorage.setItem(legacyKey, '{}');

    removePersistedPayload('ootmm-session');

    expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });
});
