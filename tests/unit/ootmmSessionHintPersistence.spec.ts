import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';
import {
  sanitizePersistedStateForStore,
  PERSIST_CONFIGS,
} from '@/stores/persist';
import { createEmptyHintTrackerState } from '../../packs/ootmm/src/data/hintTypes';

describe('ootmm session hint persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const MOCK_HINTS_TEXT = [
    'Path',
    '  Way of the Hero:',
    '    OOT_KOKIRI_FOREST - WOTH',
    '    OOT_LOST_WOODS - WOTH',
    '',
    'Always/Sometimes:',
    '  OOT_FROGS_FINAL: Bow',
    '  OOT_FROGS_STORMS: Junk',
    '',
    'Region:',
    '  OOT_KOKIRI_FOREST: Kokiri Sword',
    '',
    'Foolish:',
    '  OOT_KAKARIKO',
    '',
    'Moon:',
    '  OOT_LON_LON: Bombs',
  ].join('\n');

  const MOCK_HINT_TRACKER = {
    pathHints: [{ region: 'OOT_KOKIRI_FOREST', subType: 'woth' as const }],
    alwaysSometimesHints: [{ location: 'OOT_FROGS_FINAL', itemId: 'OOT_BOW' }],
    regionHints: [{ region: 'OOT_KOKIRI_FOREST', itemId: 'OOT_KOKIRI_SWORD' }],
    foolishHints: [{ region: 'OOT_KAKARIKO' }],
    moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
  };

  const MOCK_PROTECTED_LOCATION_IDS = [
    'OOT_FROGS_1',
    'OOT_FROGS_2',
    'OOT_FROGS_3',
  ];

  // ── Hydration tests ──

  it('hydrates hintsText from persisted state', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintsText: MOCK_HINTS_TEXT,
      }),
    ).toEqual({
      hintsText: MOCK_HINTS_TEXT,
    });
  });

  it('does not truncate long hintsText to 500 chars', () => {
    const longText = '  Line A\n'.repeat(200); // ~1800 chars
    const hydrated = sanitizePersistedStateForStore('ootmm-session', {
      hintsText: longText,
    });
    expect(hydrated.hintsText).toBe(longText);
    expect((hydrated.hintsText as string).length).toBeGreaterThan(500);
  });

  it('hydrates null hintsText as null', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintsText: null,
      }),
    ).toEqual({
      hintsText: null,
    });
  });

  it('ignores non-string hintsText', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintsText: 42,
      }),
    ).toEqual({});
  });

  it('hydrates hintTracker from persisted state', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintTracker: MOCK_HINT_TRACKER,
      }),
    ).toEqual({
      hintTracker: {
        pathHints: [{ region: 'OOT_KOKIRI_FOREST', subType: 'woth' }],
        alwaysSometimesHints: [
          { location: 'OOT_FROGS_FINAL', itemId: 'OOT_BOW' },
        ],
        regionHints: [
          { region: 'OOT_KOKIRI_FOREST', itemId: 'OOT_KOKIRI_SWORD' },
        ],
        foolishHints: [{ region: 'OOT_KAKARIKO' }],
        moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
      },
    });
  });

  it('sanitizes invalid entries in hintTracker', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintTracker: {
          pathHints: [
            { region: 'OOT_KOKIRI_FOREST', subType: 'woth' },
            { region: '', subType: 'woth' }, // empty region
            { subType: 'woth' }, // missing region
            { region: 42, subType: 'woth' }, // non-string region
          ],
          alwaysSometimesHints: 'not-an-array',
          regionHints: null,
          foolishHints: [
            { region: 'OOT_KAKARIKO' },
            { region: 0 }, // non-string region
          ],
          moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
        },
      }),
    ).toEqual({
      hintTracker: {
        pathHints: [{ region: 'OOT_KOKIRI_FOREST', subType: 'woth' }],
        alwaysSometimesHints: [],
        regionHints: [],
        foolishHints: [{ region: 'OOT_KAKARIKO' }],
        moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
      },
    });
  });

  it('hydrates empty hintTracker as empty arrays', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintTracker: {},
      }),
    ).toEqual({
      hintTracker: {
        pathHints: [],
        alwaysSometimesHints: [],
        regionHints: [],
        foolishHints: [],
        moonHints: [],
      },
    });
  });

  it('hydrates hintProtectedLocationIds from persisted state', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintProtectedLocationIds: MOCK_PROTECTED_LOCATION_IDS,
      }),
    ).toEqual({
      hintProtectedLocationIds: MOCK_PROTECTED_LOCATION_IDS,
    });
  });

  it('ignores non-array hintProtectedLocationIds', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hintProtectedLocationIds: 'not-an-array',
      }),
    ).toEqual({});
  });

  // ── Round-trip (serialize → hydrate) tests ──

  it('round-trips hintsText through serialize and hydrate', () => {
    const config = PERSIST_CONFIGS['ootmm-session'];
    const picked = { hintsText: MOCK_HINTS_TEXT };
    const serialized = config.serialize?.(picked) ?? picked;
    const raw = JSON.parse(JSON.stringify(serialized));
    const hydrated = config.hydrate(raw);
    expect(hydrated.hintsText).toBe(MOCK_HINTS_TEXT);
  });

  it('round-trips hintTracker through serialize and hydrate', () => {
    const config = PERSIST_CONFIGS['ootmm-session'];
    const picked = { hintTracker: MOCK_HINT_TRACKER };
    const serialized = config.serialize?.(picked) ?? picked;
    const raw = JSON.parse(JSON.stringify(serialized));
    const hydrated = config.hydrate(raw);
    expect(hydrated.hintTracker).toEqual({
      pathHints: [{ region: 'OOT_KOKIRI_FOREST', subType: 'woth' }],
      alwaysSometimesHints: [
        { location: 'OOT_FROGS_FINAL', itemId: 'OOT_BOW' },
      ],
      regionHints: [
        { region: 'OOT_KOKIRI_FOREST', itemId: 'OOT_KOKIRI_SWORD' },
      ],
      foolishHints: [{ region: 'OOT_KAKARIKO' }],
      moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
    });
  });

  // ── Store integration tests ──

  it('restores hint data after store reset and undo', async () => {
    const sessionStore = useOoTMMSessionStore();

    // Set hint data
    sessionStore.setHintsText(MOCK_HINTS_TEXT);
    sessionStore.addPathHint(MOCK_HINT_TRACKER.pathHints[0]);
    sessionStore.addAlwaysSometimesHint(
      MOCK_HINT_TRACKER.alwaysSometimesHints[0],
    );
    sessionStore.addRegionHint(MOCK_HINT_TRACKER.regionHints[0]);
    sessionStore.addFoolishHint(MOCK_HINT_TRACKER.foolishHints[0]);
    sessionStore.addMoonHint(MOCK_HINT_TRACKER.moonHints[0]);
    sessionStore.addHintProtectedLocationIds(MOCK_PROTECTED_LOCATION_IDS);

    expect(sessionStore.hintsText).toBe(MOCK_HINTS_TEXT);
    expect(sessionStore.hintTracker.pathHints).toHaveLength(1);
    expect(sessionStore.hintTracker.alwaysSometimesHints).toHaveLength(1);
    expect(sessionStore.hintTracker.regionHints).toHaveLength(1);
    expect(sessionStore.hintTracker.foolishHints).toHaveLength(1);
    expect(sessionStore.hintTracker.moonHints).toHaveLength(1);
    expect(sessionStore.hintProtectedLocationIds).toEqual(
      MOCK_PROTECTED_LOCATION_IDS,
    );

    // Reset
    await sessionStore.resetSessionStateToDefaults();

    expect(sessionStore.hintsText).toBeNull();
    expect(sessionStore.hintTracker).toEqual(createEmptyHintTrackerState());
    expect(sessionStore.hintProtectedLocationIds).toEqual([]);

    // Undo should restore hint data
    await sessionStore.undo();

    expect(sessionStore.hintsText).toBe(MOCK_HINTS_TEXT);
    expect(sessionStore.hintTracker.pathHints).toHaveLength(1);
    expect(sessionStore.hintTracker.alwaysSometimesHints).toHaveLength(1);
    expect(sessionStore.hintTracker.regionHints).toHaveLength(1);
    expect(sessionStore.hintTracker.foolishHints).toHaveLength(1);
    expect(sessionStore.hintTracker.moonHints).toHaveLength(1);
    expect(sessionStore.hintProtectedLocationIds).toEqual(
      MOCK_PROTECTED_LOCATION_IDS,
    );
  });

  it('restores hintTracker after undo of individual mutations', async () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.addPathHint({ region: 'OOT_KOKIRI_FOREST', subType: 'woth' });
    sessionStore.addPathHint({ region: 'OOT_LOST_WOODS', subType: 'woth' });
    expect(sessionStore.hintTracker.pathHints).toHaveLength(2);

    await sessionStore.undo();
    expect(sessionStore.hintTracker.pathHints).toHaveLength(1);
    expect(sessionStore.hintTracker.pathHints[0].region).toBe(
      'OOT_KOKIRI_FOREST',
    );

    await sessionStore.undo();
    expect(sessionStore.hintTracker.pathHints).toHaveLength(0);

    await sessionStore.redo();
    expect(sessionStore.hintTracker.pathHints).toHaveLength(1);

    await sessionStore.redo();
    expect(sessionStore.hintTracker.pathHints).toHaveLength(2);
  });

  it('simulates page-reload round-trip via persist config', () => {
    const config = PERSIST_CONFIGS['ootmm-session'];
    const sessionStore = useOoTMMSessionStore();

    // Set hint data
    sessionStore.setHintsText(MOCK_HINTS_TEXT);
    sessionStore.addPathHint(MOCK_HINT_TRACKER.pathHints[0]);
    sessionStore.addAlwaysSometimesHint(
      MOCK_HINT_TRACKER.alwaysSometimesHints[0],
    );
    sessionStore.addRegionHint(MOCK_HINT_TRACKER.regionHints[0]);
    sessionStore.addFoolishHint(MOCK_HINT_TRACKER.foolishHints[0]);
    sessionStore.addMoonHint(MOCK_HINT_TRACKER.moonHints[0]);
    sessionStore.addHintProtectedLocationIds(MOCK_PROTECTED_LOCATION_IDS);

    // Simulate what the persist plugin does: pick paths & serialize
    const state = sessionStore.$state as Record<string, unknown>;
    const paths = config.paths.filter(
      (p) =>
        p === 'hintsText' ||
        p === 'hintTracker' ||
        p === 'hintProtectedLocationIds',
    );
    const picked: Record<string, unknown> = {};
    for (const path of paths) {
      if (path in state) {
        picked[path] = state[path];
      }
    }
    const serialized = config.serialize?.(picked) ?? picked;
    const raw = JSON.parse(JSON.stringify(serialized));

    // Simulate what the persist plugin does on init: hydrate & $patch
    const hydrated = config.hydrate(raw);

    expect(hydrated.hintsText).toBe(MOCK_HINTS_TEXT);
    expect(hydrated.hintTracker).toEqual({
      pathHints: [{ region: 'OOT_KOKIRI_FOREST', subType: 'woth' }],
      alwaysSometimesHints: [
        { location: 'OOT_FROGS_FINAL', itemId: 'OOT_BOW' },
      ],
      regionHints: [
        { region: 'OOT_KOKIRI_FOREST', itemId: 'OOT_KOKIRI_SWORD' },
      ],
      foolishHints: [{ region: 'OOT_KAKARIKO' }],
      moonHints: [{ region: 'OOT_LON_LON', itemId: 'OOT_BOMBS' }],
    });
    expect(hydrated.hintProtectedLocationIds).toEqual(
      MOCK_PROTECTED_LOCATION_IDS,
    );
  });

  it('counts work from persisted hintsText after hydration', () => {
    const config = PERSIST_CONFIGS['ootmm-session'];
    const hydrated = config.hydrate({
      hintsText: MOCK_HINTS_TEXT,
      hintTracker: MOCK_HINT_TRACKER,
    });

    // After hydration, parseSpoilerHints should produce counts
    // This validates that the full hintsText survives hydration without truncation
    expect(hydrated.hintsText).toBe(MOCK_HINTS_TEXT);

    // The hintTracker should have the expected structure
    const tracker = hydrated.hintTracker as Record<string, unknown>;
    expect(Array.isArray(tracker.pathHints)).toBe(true);
    expect(Array.isArray(tracker.alwaysSometimesHints)).toBe(true);
    expect(Array.isArray(tracker.regionHints)).toBe(true);
    expect(Array.isArray(tracker.foolishHints)).toBe(true);
    expect(Array.isArray(tracker.moonHints)).toBe(true);
  });
});
