import { deflateRaw } from 'pako';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const textEncoder = new TextEncoder();

const STORAGE_KEYS = {
  app: 'tlt:app:v1',
  ui: 'tlt:ootmm-ui:v1',
  session: 'tlt:ootmm-session:v1',
} as const;

const SHARE_STATUS_SESSION_KEY = 'tlt:share-import-status:v1';
const SHARE_IMPORT_PENDING_SESSION_KEY = 'tlt:share-import-pending:v1';

type ShareStateModule = typeof import('@/utils/shareState');

type Snapshot = {
  v: number;
  stores: Record<string, Record<string, unknown>>;
};

let shareState: ShareStateModule;

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function makeCompressedPayload(value: unknown): string {
  const jsonBytes = textEncoder.encode(JSON.stringify(value));
  return `v1.${encodeBase64Url(deflateRaw(jsonBytes))}`;
}

function makeCompressedPayloadFromRawJson(json: string): string {
  return `v1.${encodeBase64Url(deflateRaw(textEncoder.encode(json)))}`;
}

function writeStore(
  storageKey: string,
  value: Record<string, unknown> | undefined,
): void {
  if (!value) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function seedRepresentativeLocalState(): void {
  writeStore(STORAGE_KEYS.app, {
    selectedPackId: 'ootmm',
  });
  writeStore(STORAGE_KEYS.ui, {
    activeTab: 'settings',
    isRightSidebarOpen: true,
    activeRightSidebarTab: 'entrances',
    inventorySearchQuery: 'bomb',
    leftSidebarWidth: 320,
  });
  writeStore(STORAGE_KEYS.session, {
    inventoryById: {
      ITEM_ALPHA: 2,
      ITEM_BETA: 1,
    },
    collectedLocationIds: ['Check One', 'Check Two'],
    preCompletedDungeons: ['Dungeon One'],
    songEvents: {
      SONG_EVENT_ALPHA: 1,
    },
    shopPrices: {
      SHOP_ALPHA: 45,
    },
  });
}

function readPersistedStore(
  storageKey: string,
): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(storageKey);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeAll(async () => {
  shareState = await import('@/utils/shareState');
});

describe('shareState', () => {
  it('roundtrips a representative persisted snapshot through encode/decode/apply', () => {
    seedRepresentativeLocalState();

    const initialSnapshot = shareState.collectPersistedStateFromLocalStorage();
    const payload = shareState.encodeSnapshotToHashPayload(initialSnapshot);
    const parsedPayload = shareState.parseSharePayloadFromLocationHash(
      `#s=${payload}`,
    );
    expect(parsedPayload).toBe(payload);

    window.localStorage.clear();

    const decoded = shareState.decodeHashPayloadToSnapshot(payload);
    expect(decoded.partial).toBe(false);

    shareState.applySnapshotToLocalStorage(decoded.snapshot);

    expect(shareState.collectPersistedStateFromLocalStorage()).toEqual(
      initialSnapshot,
    );
  });

  it('strips collected locations without changing other snapshot data', () => {
    seedRepresentativeLocalState();

    const snapshot = shareState.collectPersistedStateFromLocalStorage();
    const stripped = shareState.stripCollectedLocations(snapshot);

    expect(snapshot.stores['ootmm-session']?.collectedLocationIds).toEqual([
      'Check One',
      'Check Two',
    ]);
    expect(
      stripped.stores['ootmm-session']?.collectedLocationIds,
    ).toBeUndefined();
    expect({
      ...stripped.stores['ootmm-session'],
      collectedLocationIds:
        snapshot.stores['ootmm-session']?.collectedLocationIds,
    }).toEqual(snapshot.stores['ootmm-session']);
  });

  it('imports a valid shared hash into empty local state without prompting', () => {
    seedRepresentativeLocalState();
    const snapshot = shareState.collectPersistedStateFromLocalStorage();
    const payload = shareState.encodeSnapshotToHashPayload(snapshot);
    const confirmOverwrite = vi.fn(() => true);

    window.localStorage.clear();
    window.history.replaceState(null, '', `/#s=${payload}`);

    expect(shareState.importShareStateFromCurrentUrl(confirmOverwrite)).toBe(
      'imported',
    );
    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(shareState.collectPersistedStateFromLocalStorage()).toEqual(
      snapshot,
    );
  });

  it('prompts before overwriting meaningful local state and imports on confirm', () => {
    seedRepresentativeLocalState();
    const existingSnapshot = shareState.collectPersistedStateFromLocalStorage();
    const payload = makeCompressedPayload({
      v: 1,
      stores: {
        app: {
          selectedPackId: 'ootmm',
        },
        'ootmm-ui': {
          activeTab: 'inventory',
        },
      },
    });
    const confirmOverwrite = vi.fn(() => true);

    window.history.replaceState(null, '', `/#s=${payload}`);

    expect(shareState.importShareStateFromCurrentUrl(confirmOverwrite)).toBe(
      'imported',
    );
    expect(confirmOverwrite).toHaveBeenCalledOnce();
    expect(existingSnapshot).not.toEqual(
      shareState.collectPersistedStateFromLocalStorage(),
    );
    expect(readPersistedStore(STORAGE_KEYS.ui)).toMatchObject({
      activeTab: 'inventory',
    });
  });

  it('preserves existing local state when overwrite is canceled', () => {
    seedRepresentativeLocalState();
    const existingSnapshot = shareState.collectPersistedStateFromLocalStorage();
    const payload = makeCompressedPayload({
      v: 1,
      stores: {
        app: {
          selectedPackId: 'ootmm',
        },
      },
    });
    const confirmOverwrite = vi.fn(() => false);

    window.history.replaceState(null, '', `/#s=${payload}`);

    expect(shareState.importShareStateFromCurrentUrl(confirmOverwrite)).toBe(
      'skipped',
    );
    expect(confirmOverwrite).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
    expect(shareState.collectPersistedStateFromLocalStorage()).toEqual(
      existingSnapshot,
    );
  });

  it('marks partial imports, publishes the warning, and sets the pending check flag', () => {
    const payload = makeCompressedPayload({
      v: 1,
      ignoredTopLevel: true,
      stores: {
        app: {
          selectedPackId: 'evil-pack',
        },
        'ootmm-session': {
          trackerSettings: {
            games: { bad: true },
            players: 'oops',
            specialConds: {
              BRIDGE: {
                count: 999,
                stones: 'bad',
              },
            },
          },
          entranceOverrides: {
            NOT_A_REAL_ENTRANCE: 'ALSO_NOT_REAL',
          },
        },
        'not-a-real-store': {
          injected: true,
        },
      },
    });

    window.history.replaceState(null, '', `/#s=${payload}`);

    expect(shareState.importShareStateFromCurrentUrl()).toBe('partial');
    expect(window.location.hash).toBe('');
    expect(shareState.hasPendingShareImportCheck()).toBe(true);
    expect(shareState.consumeShareStatusMessage()).toBe(
      shareState.SHARE_PARTIAL_IMPORT_MESSAGE,
    );
    expect(readPersistedStore(STORAGE_KEYS.app)).toBeNull();
    expect(readPersistedStore(STORAGE_KEYS.session)).toMatchObject({
      trackerSettings: {
        games: 'ootmm',
        players: 1,
      },
    });
    expect(
      readPersistedStore(STORAGE_KEYS.session)?.entranceOverrides,
    ).toBeUndefined();
  });

  it('sanitizes known stores and marks the payload partial when store fields are invalid', () => {
    const decoded = shareState.decodeHashPayloadToSnapshot(
      makeCompressedPayload({
        v: 1,
        stores: {
          app: {
            selectedPackId: 'evil-pack',
          },
          'ootmm-ui': {
            activeTab: 'invalid-tab',
            inventorySearchQuery: 'a'.repeat(800),
            leftSidebarWidth: 20,
          },
          'ootmm-session': {
            inventoryById: {
              GOOD_ITEM: 2,
              BAD_ITEM: -1,
            },
            collectedLocationIds: ['Check One', 'Check One', 5],
            preCompletedDungeons: ['Dungeon One', null],
            songEvents: {
              GOOD_SONG: 2,
              BAD_SONG: -1,
            },
            shopPrices: {
              GOOD_SHOP: 10,
              BAD_SHOP: -2,
            },
          },
        },
      }),
    );

    expect(decoded.partial).toBe(true);
    expect(decoded.snapshot).toEqual({
      v: 1,
      stores: {
        'ootmm-ui': {
          inventorySearchQuery: 'a'.repeat(500),
          leftSidebarWidth: 400,
        },
        'ootmm-session': {
          inventoryById: {
            GOOD_ITEM: 2,
          },
          collectedLocationIds: ['Check One'],
          preCompletedDungeons: ['Dungeon One'],
          songEvents: {
            GOOD_SONG: 2,
          },
          shopPrices: {
            GOOD_SHOP: 10,
          },
        },
      },
    } satisfies Snapshot);
  });

  it.each([
    ['unsupported prefix', 'v2.anything', /Unsupported share payload prefix/],
    ['empty encoded body', 'v1.', /Missing encoded share payload body/],
    [
      'invalid base64',
      'v1.!!!!',
      /Invalid character|Failed to inflate share payload/i,
    ],
    [
      'invalid deflate bytes',
      `v1.${encodeBase64Url(Uint8Array.from([0, 1, 2, 3, 4]))}`,
      /Failed to inflate share payload|incorrect header check|invalid/i,
    ],
    ['invalid JSON', makeCompressedPayloadFromRawJson('{bad json'), /JSON/],
    [
      'non-object top level',
      makeCompressedPayload('not-an-object'),
      /not an object/,
    ],
    [
      'unsupported schema version',
      makeCompressedPayload({ v: 2, stores: {} }),
      /Unsupported share schema version/,
    ],
    [
      'invalid stores',
      makeCompressedPayload({ v: 1, stores: 'oops' }),
      /stores are invalid/,
    ],
    [
      'encoded payload length limit',
      `v1.${'a'.repeat(131073)}`,
      /Encoded share payload too large/,
    ],
    [
      'inflated payload size limit',
      makeCompressedPayload({
        v: 1,
        stores: {
          'ootmm-session': {
            trackerSettings: {
              HUGE: {
                note: 'x'.repeat(600_000),
              },
            },
          },
        },
      }),
      /Share payload too large after decompression/,
    ],
  ])('rejects %s', (_label, payload, errorPattern) => {
    expect(() => shareState.decodeHashPayloadToSnapshot(payload)).toThrow(
      errorPattern,
    );
  });

  it('clears pending import state, share status, hash, and preserves data when import payload is invalid', () => {
    seedRepresentativeLocalState();
    const existingSnapshot = shareState.collectPersistedStateFromLocalStorage();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    window.sessionStorage.setItem(SHARE_STATUS_SESSION_KEY, 'stale status');
    window.sessionStorage.setItem(SHARE_IMPORT_PENDING_SESSION_KEY, '1');
    window.history.replaceState(null, '', '/#s=v1.!!!!');

    expect(shareState.importShareStateFromCurrentUrl()).toBe('invalid');
    expect(window.location.hash).toBe('');
    expect(shareState.hasPendingShareImportCheck()).toBe(false);
    expect(shareState.consumeShareStatusMessage()).toBeNull();
    expect(shareState.collectPersistedStateFromLocalStorage()).toEqual(
      existingSnapshot,
    );
  });
});
