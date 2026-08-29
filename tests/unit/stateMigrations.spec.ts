import { describe, expect, it } from 'vitest';
import {
  LATEST_STATE_VERSION,
  STATE_MIGRATIONS,
  migrateStateToLatest,
} from '@/utils/migrations';
import {
  SECRET_SHRINE_RENAME_MAP,
  renameLocationFields,
} from '@/utils/migrations/locationRenames';
import {
  PERSIST_CONFIGS,
  removePersistedPayload,
  resolvePersistedPayload,
  sanitizePersistedStateForStore,
} from '@/stores/persist';

describe('migration registry', () => {
  it('has two steps today and LATEST_STATE_VERSION === 3', () => {
    expect(STATE_MIGRATIONS).toHaveLength(2);
    expect(STATE_MIGRATIONS.map((step) => step.version)).toEqual([1, 2]);
    expect(LATEST_STATE_VERSION).toBe(3);
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

describe('v2 → v3 location renames', () => {
  it('renames collectedLocationIds entries (id@world form)', () => {
    const migrated = migrateStateToLatest(
      {
        collectedLocationIds: [
          'MM Great Bay Coast Pot 01@0',
          'MM Great Bay Coast Pot Ledge 1@0',
          'MM Great Bay Coast Rock Ledge 3@0',
          'MM Great Bay Coast Pot 12@2',
        ],
      },
      2,
    );
    expect(migrated.collectedLocationIds).toEqual([
      'MM Great Bay Coast Pot Ledge 1@0',
      'MM Great Bay Coast Pot Upper Cliffs 1@0',
      'MM Great Bay Coast Rock Cliffs 3@0',
      'MM Great Bay Coast Pot Platform 4@2',
    ]);
  });

  it('renames junkLocationIds entries', () => {
    const migrated = migrateStateToLatest(
      { junkLocationIds: ['MM Great Bay Coast Pot 06@0'] },
      2,
    );
    expect(migrated.junkLocationIds).toEqual([
      'MM Great Bay Coast Pot Platform 3@0',
    ]);
  });

  it('renames trackerSettings.junkLocations entries', () => {
    const migrated = migrateStateToLatest(
      {
        trackerSettings: {
          junkLocations: [
            'MM Great Bay Coast Pot 02',
            'MM Great Bay Coast Pot 09',
          ],
        },
      },
      2,
    );
    expect(
      (migrated.trackerSettings as Record<string, unknown>).junkLocations,
    ).toEqual(['MM Great Bay Coast Pot 1', 'MM Great Bay Coast Pot 2']);
  });

  it('renames trackerSettings.plando.locations keys', () => {
    const migrated = migrateStateToLatest(
      {
        trackerSettings: {
          plando: {
            locations: {
              'MM Great Bay Coast Pot 03': 'OOT_KOKIRI_SWORD',
              'MM Great Bay Coast Pot 10': null,
            },
          },
        },
      },
      2,
    );
    expect(
      (migrated.trackerSettings as Record<string, unknown>).plando,
    ).toEqual({
      locations: {
        'MM Great Bay Coast Pot Lower Cliffs 3': 'OOT_KOKIRI_SWORD',
        'MM Great Bay Coast Pot Lower Cliffs 4': null,
      },
    });
  });

  it('leaves unrelated ids and fields untouched', () => {
    const input = {
      collectedLocationIds: [
        'MM Pinnacle Rock Pot 03@0',
        'OOT Deku Tree Slingshot Chest@0',
      ],
      junkLocationIds: ['MM Great Bay Coast Rock Sand 1@0'],
      preCompletedDungeons: ['OOT Deku Tree'],
      songEvents: { 'OOT Song of Time': 1 },
      trackerSettings: {
        junkLocations: ['MM Great Bay Coast Fisherman Grotto Grass 01'],
        specialConds: { BRIDGE: { type: 'medallions', count: 6 } },
      },
    };
    const migrated = migrateStateToLatest(input, 2);
    expect(migrated).toEqual(input);
  });

  it('skips the step for payloads already at version 3', () => {
    const input = {
      collectedLocationIds: ['MM Great Bay Coast Pot Ledge 1@0'],
    };
    const migrated = migrateStateToLatest(input, 3);
    expect(migrated).toBe(input);
  });

  it('migrates a v2 payload through the store hydration', () => {
    const result = sanitizePersistedStateForStore(
      'ootmm-session',
      {
        collectedLocationIds: ['MM Great Bay Coast Pot 05@0'],
        trackerSettings: { junkLocations: ['MM Great Bay Coast Pot 11'] },
      },
      2,
    );
    expect(result.collectedLocationIds).toEqual([
      'MM Great Bay Coast Pot Platform 1@0',
    ]);
    expect(result.trackerSettings).toMatchObject({
      junkLocations: ['MM Great Bay Coast Pot Lower Cliffs 1'],
    });
  });
});

describe('Secret Shrine renames (legacy v1 → v2)', () => {
  it('renames collectedLocationIds entries (id@world form)', () => {
    const migrated = renameLocationFields(
      {
        collectedLocationIds: [
          'MM Secret Shrine Pot 1@0',
          'MM Secret Shrine Pot 4@0',
          'MM Secret Shrine Pot 9@2',
        ],
      },
      SECRET_SHRINE_RENAME_MAP,
    );
    expect(migrated.collectedLocationIds).toEqual([
      'MM Secret Shrine Pot Entrance 1@0',
      'MM Secret Shrine Pot Underwater 1@0',
      'MM Secret Shrine Pot Underwater 6@2',
    ]);
  });

  it('renames junkLocationIds entries', () => {
    const migrated = renameLocationFields(
      { junkLocationIds: ['MM Secret Shrine Pot 6@0'] },
      SECRET_SHRINE_RENAME_MAP,
    );
    expect(migrated.junkLocationIds).toEqual([
      'MM Secret Shrine Pot Underwater 3@0',
    ]);
  });

  it('renames trackerSettings.junkLocations entries', () => {
    const migrated = renameLocationFields(
      {
        trackerSettings: {
          junkLocations: ['MM Secret Shrine Pot 2', 'MM Secret Shrine Pot 8'],
        },
      },
      SECRET_SHRINE_RENAME_MAP,
    );
    expect(
      (migrated.trackerSettings as Record<string, unknown>).junkLocations,
    ).toEqual([
      'MM Secret Shrine Pot Entrance 2',
      'MM Secret Shrine Pot Underwater 5',
    ]);
  });

  it('renames trackerSettings.plando.locations keys', () => {
    const migrated = renameLocationFields(
      {
        trackerSettings: {
          plando: {
            locations: {
              'MM Secret Shrine Pot 3': 'OOT_KOKIRI_SWORD',
              'MM Secret Shrine Pot 7': null,
            },
          },
        },
      },
      SECRET_SHRINE_RENAME_MAP,
    );
    expect(
      (migrated.trackerSettings as Record<string, unknown>).plando,
    ).toEqual({
      locations: {
        'MM Secret Shrine Pot Entrance 3': 'OOT_KOKIRI_SWORD',
        'MM Secret Shrine Pot Underwater 4': null,
      },
    });
  });

  it('leaves unrelated ids and fields untouched', () => {
    const input = {
      collectedLocationIds: [
        'MM Great Bay Coast Pot Upper Cliffs 1@0',
        'MM Pinnacle Rock Pot 03@0',
        'OOT Deku Tree Slingshot Chest@0',
      ],
      junkLocationIds: ['MM Secret Shrine Rupee 01@0'],
      preCompletedDungeons: ['OOT Deku Tree'],
      songEvents: { 'OOT Song of Time': 1 },
      trackerSettings: {
        junkLocations: ['MM Great Bay Coast Pot 1'],
        specialConds: { BRIDGE: { type: 'medallions', count: 6 } },
      },
    };
    const migrated = renameLocationFields(input, SECRET_SHRINE_RENAME_MAP);
    expect(migrated).toEqual(input);
  });

  it('is idempotent (no rename chains in the map)', () => {
    const state = {
      collectedLocationIds: ['MM Secret Shrine Pot 5@0'],
      trackerSettings: {
        junkLocations: ['MM Secret Shrine Pot 1'],
      },
    };
    const once = renameLocationFields(state, SECRET_SHRINE_RENAME_MAP);
    const twice = renameLocationFields(once, SECRET_SHRINE_RENAME_MAP);
    expect(twice).toEqual(once);
  });

  it('runs inside the legacy v1 → v2 step for versionless payloads', () => {
    const migrated = migrateStateToLatest(
      {
        collectedLocationIds: ['MM Secret Shrine Pot 4@0'],
        trackerSettings: {
          junkLocations: ['MM Secret Shrine Pot 1'],
        },
      },
      1,
    );
    expect(migrated.collectedLocationIds).toEqual([
      'MM Secret Shrine Pot Underwater 1@0',
    ]);
    expect(
      (migrated.trackerSettings as Record<string, unknown>).junkLocations,
    ).toEqual(['MM Secret Shrine Pot Entrance 1']);
  });

  it('applies both rename sets (GBC + Secret Shrine) to a versionless payload', () => {
    const migrated = migrateStateToLatest(
      {
        collectedLocationIds: [
          'MM Great Bay Coast Pot 01@0',
          'MM Secret Shrine Pot 4@0',
        ],
      },
      1,
    );
    expect(migrated.collectedLocationIds).toEqual([
      'MM Great Bay Coast Pot Ledge 1@0',
      'MM Secret Shrine Pot Underwater 1@0',
    ]);
  });

  it('does not rename Secret Shrine names for v2+ payloads (step 1 is skipped)', () => {
    // The v1 → v2 step was never released, so no payload carries a v2/v3
    // stamp together with v30.1-era Secret Shrine ids — versionless payloads
    // are the only source of those ids. A v2 payload therefore keeps them.
    const migrated = migrateStateToLatest(
      { collectedLocationIds: ['MM Secret Shrine Pot 1@0'] },
      2,
    );
    expect(migrated.collectedLocationIds).toEqual(['MM Secret Shrine Pot 1@0']);
  });

  it('collapses to one entry when old AND new names are both present (versionless)', () => {
    // Scenario: a v30.1-era payload (old ids) was re-marked under the new
    // names in a newer tracker, so the array holds both. M4 renames the old
    // entry onto the new name (transient duplicate); the ootmm-session
    // hydrate dedupes via `stringArray` (Set), so the store ends up with a
    // single entry and the check stays marked collected exactly once.
    const result = sanitizePersistedStateForStore('ootmm-session', {
      collectedLocationIds: [
        'MM Secret Shrine Pot 1@0',
        'MM Secret Shrine Pot Entrance 1@0',
      ],
    });
    expect(result.collectedLocationIds).toEqual([
      'MM Secret Shrine Pot Entrance 1@0',
    ]);
  });

  it('leaves a stale old-name entry inert in an already-v3 payload', () => {
    // Scenario: the state was saved by a pre-fix version that had already
    // written v:3 (new names) while the old-name entry survived un-renamed.
    // No step runs for v3 payloads, so the stale entry stays — but it never
    // resolves against the current world graph and is invisible in the UI;
    // the check is shown collected via the new-name entry. Harmless dead
    // weight, and any later re-save (setCollectedLocationIds/uniqueStrings)
    // can still collapse it.
    const input = {
      collectedLocationIds: [
        'MM Secret Shrine Pot 1@0',
        'MM Secret Shrine Pot Entrance 1@0',
      ],
    };
    const migrated = migrateStateToLatest(input, 3);
    expect(migrated).toBe(input);
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
