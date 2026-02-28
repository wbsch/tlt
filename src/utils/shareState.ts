import { deflateRaw, inflateRaw } from 'pako';
import {
  PERSIST_CONFIGS,
  PERSIST_STORE_IDS,
  sanitizePersistedStateForStore,
  type PersistStoreId,
} from '@/stores/persist';
import { safeJsonParse } from '@/utils/safeJson';
import { TRACKER_DEFAULT_SETTINGS } from '@packs/ootmm/data/settings';

const SHARE_HASH_PARAM = 's';
const SHARE_PAYLOAD_PREFIX = 'v1.';
const SHARE_SCHEMA_VERSION = 1;
/**
 * Maximum allowed size for decompressed share payloads (512 KiB).
 * A normal full-state export is typically 5-15 KiB; this limit prevents
 * decompression bombs.
 */
const MAX_INFLATED_SIZE = 512 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const IMPORT_CONFIRM_MESSAGE =
  'A shared tracker URL was detected. Importing it will replace your current local tracker progress. Continue?';

type PersistedStoresSnapshot = Partial<
  Record<PersistStoreId, Record<string, unknown>>
>;

export type PersistedSnapshot = {
  v: number;
  stores: PersistedStoresSnapshot;
};

export type ShareStateImportResult =
  | 'none'
  | 'imported'
  | 'skipped'
  | 'invalid';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function diffSettingsFromDefaults(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!deepEqual(value, TRACKER_DEFAULT_SETTINGS[key])) {
      diff[key] = value;
    }
  }
  return diff;
}

function mergeSettingsWithDefaults(
  diff: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(TRACKER_DEFAULT_SETTINGS)) {
    merged[key] = Object.prototype.hasOwnProperty.call(diff, key)
      ? diff[key]
      : structuredClone(value);
  }
  // Only known default keys are accepted — unknown keys from the payload are
  // intentionally discarded to prevent injection of unexpected properties.
  return merged;
}

function byteArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToByteArray(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasObjectEntries(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function hasArrayEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function normalizeSnapshot(snapshot: PersistedSnapshot): PersistedSnapshot {
  const stores: PersistedStoresSnapshot = {};
  for (const storeId of PERSIST_STORE_IDS) {
    const sanitized = sanitizePersistedStateForStore(
      storeId,
      snapshot.stores?.[storeId] ?? {},
    );
    if (Object.keys(sanitized).length > 0) {
      stores[storeId] = sanitized;
    }
  }
  return {
    v: SHARE_SCHEMA_VERSION,
    stores,
  };
}

function toHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export function parseSharePayloadFromLocationHash(hash: string): string | null {
  const params = toHashParams(hash);
  const payload = params.get(SHARE_HASH_PARAM);
  if (!payload) return null;
  const trimmed = payload.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function clearSharePayloadFromCurrentUrl(): void {
  if (typeof window === 'undefined') return;
  const params = toHashParams(window.location.hash);
  if (!params.has(SHARE_HASH_PARAM)) return;
  params.delete(SHARE_HASH_PARAM);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

export function collectPersistedStateFromLocalStorage(): PersistedSnapshot {
  if (typeof window === 'undefined') {
    return {
      v: SHARE_SCHEMA_VERSION,
      stores: {},
    };
  }

  const stores: PersistedStoresSnapshot = {};
  for (const storeId of PERSIST_STORE_IDS) {
    const storageKey = PERSIST_CONFIGS[storeId].key;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) continue;

    try {
      const parsed = safeJsonParse(raw);
      const sanitized = sanitizePersistedStateForStore(storeId, parsed);
      if (Object.keys(sanitized).length > 0) {
        stores[storeId] = sanitized;
      }
    } catch (error) {
      console.warn(
        `[Share] Failed to read persisted state for "${storeId}":`,
        error,
      );
    }
  }

  return {
    v: SHARE_SCHEMA_VERSION,
    stores,
  };
}

export function stripCollectedLocations(
  snapshot: PersistedSnapshot,
): PersistedSnapshot {
  const stores = { ...snapshot.stores };
  if (stores['ootmm-session']) {
    const session = { ...stores['ootmm-session'] };
    delete session.collectedLocationIds;
    stores['ootmm-session'] = session;
  }
  return { ...snapshot, stores };
}

function diffSnapshotSettings(snapshot: PersistedSnapshot): PersistedSnapshot {
  const stores = { ...snapshot.stores };
  const session = stores['ootmm-session'];
  if (session && isPlainObject(session.trackerSettings)) {
    stores['ootmm-session'] = {
      ...session,
      trackerSettings: diffSettingsFromDefaults(
        session.trackerSettings as Record<string, unknown>,
      ),
    };
  }
  return { ...snapshot, stores };
}

function expandSnapshotSettings(
  snapshot: PersistedSnapshot,
): PersistedSnapshot {
  const stores = { ...snapshot.stores };
  const session = stores['ootmm-session'];
  if (session && isPlainObject(session.trackerSettings)) {
    stores['ootmm-session'] = {
      ...session,
      trackerSettings: mergeSettingsWithDefaults(
        session.trackerSettings as Record<string, unknown>,
      ),
    };
  }
  return { ...snapshot, stores };
}

export function encodeSnapshotToHashPayload(
  snapshot: PersistedSnapshot,
): string {
  const normalized = normalizeSnapshot(snapshot);
  const diffed = diffSnapshotSettings(normalized);
  const jsonBytes = textEncoder.encode(
    JSON.stringify(diffed, (_, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    ),
  );
  const compressed = deflateRaw(jsonBytes);
  return `${SHARE_PAYLOAD_PREFIX}${byteArrayToBase64Url(compressed)}`;
}

export function decodeHashPayloadToSnapshot(
  payload: string,
): PersistedSnapshot {
  if (!payload.startsWith(SHARE_PAYLOAD_PREFIX)) {
    throw new Error('Unsupported share payload prefix');
  }

  const encoded = payload.slice(SHARE_PAYLOAD_PREFIX.length);
  if (!encoded) {
    throw new Error('Missing encoded share payload body');
  }

  const compressed = base64UrlToByteArray(encoded);
  const inflated = inflateRaw(compressed);
  const inflatedBytes =
    inflated instanceof Uint8Array
      ? inflated
      : textEncoder.encode(String(inflated));
  if (inflatedBytes.byteLength > MAX_INFLATED_SIZE) {
    throw new Error(
      `Share payload too large after decompression: ${inflatedBytes.byteLength} bytes (max ${MAX_INFLATED_SIZE})`,
    );
  }
  const decodedJson = textDecoder.decode(inflatedBytes);
  const parsed = safeJsonParse(decodedJson);
  if (!isPlainObject(parsed)) {
    throw new Error('Share payload is not an object');
  }
  if (parsed.v !== SHARE_SCHEMA_VERSION) {
    throw new Error('Unsupported share schema version');
  }
  if (!isPlainObject(parsed.stores)) {
    throw new Error('Share payload stores are invalid');
  }

  const snapshot: PersistedSnapshot = {
    v: SHARE_SCHEMA_VERSION,
    stores: {},
  };
  for (const storeId of PERSIST_STORE_IDS) {
    const storeRaw = parsed.stores[storeId];
    const sanitized = sanitizePersistedStateForStore(storeId, storeRaw);
    if (Object.keys(sanitized).length > 0) {
      snapshot.stores[storeId] = sanitized;
    }
  }

  return expandSnapshotSettings(snapshot);
}

export function applySnapshotToLocalStorage(snapshot: PersistedSnapshot): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeSnapshot(snapshot);

  for (const storeId of PERSIST_STORE_IDS) {
    const key = PERSIST_CONFIGS[storeId].key;
    const value = normalized.stores[storeId];
    if (value && Object.keys(value).length > 0) {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(key);
    }
  }
}

export function hasMeaningfulLocalState(): boolean {
  if (typeof window === 'undefined') return false;
  const sessionStoreId: PersistStoreId = 'ootmm-session';
  const sessionKey = PERSIST_CONFIGS[sessionStoreId].key;
  const raw = window.localStorage.getItem(sessionKey);
  if (!raw) return false;

  try {
    const parsed = safeJsonParse(raw);
    const session = sanitizePersistedStateForStore(sessionStoreId, parsed);
    return (
      hasObjectEntries(session.inventoryById) ||
      hasArrayEntries(session.collectedLocationIds) ||
      hasArrayEntries(session.preCompletedDungeons) ||
      hasObjectEntries(session.songEvents) ||
      hasObjectEntries(session.shopPrices)
    );
  } catch {
    return false;
  }
}

export function buildShareUrl(currentUrl: URL, payload: string): string {
  const next = new URL(currentUrl.toString());
  const params = new URLSearchParams();
  params.set(SHARE_HASH_PARAM, payload);
  next.hash = params.toString();
  return next.toString();
}

export function importShareStateFromCurrentUrl(
  confirmOverwrite: (message: string) => boolean = (message) =>
    window.confirm(message),
): ShareStateImportResult {
  if (typeof window === 'undefined') return 'none';
  const payload = parseSharePayloadFromLocationHash(window.location.hash);
  if (!payload) return 'none';

  let snapshot: PersistedSnapshot;
  try {
    snapshot = decodeHashPayloadToSnapshot(payload);
  } catch (error) {
    console.warn('[Share] Ignoring invalid share payload:', error);
    clearSharePayloadFromCurrentUrl();
    return 'invalid';
  }

  const shouldOverwrite = !hasMeaningfulLocalState()
    ? true
    : confirmOverwrite(IMPORT_CONFIRM_MESSAGE);
  if (!shouldOverwrite) {
    clearSharePayloadFromCurrentUrl();
    return 'skipped';
  }

  applySnapshotToLocalStorage(snapshot);
  clearSharePayloadFromCurrentUrl();
  return 'imported';
}
