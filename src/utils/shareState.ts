import { deflateRaw, Inflate } from 'pako';
import {
  PERSIST_CONFIGS,
  PERSIST_STORE_IDS,
  TRACKER_EXTRA_SETTINGS_KEYS,
  sanitizePersistedStateForStore,
  type PersistStoreId,
} from '@/stores/persist';
import type { SettingDefinition } from '@/types/tracker';
import { safeJsonParse } from '@/utils/safeJson';
import {
  ALL_SETTINGS_DEFINITIONS,
  TRACKER_DEFAULT_SETTINGS,
} from '@packs/ootmm/data/settings';
import { filterEntranceOverridesForSettings } from '@packs/ootmm/utils/entranceRandomization';
import * as TricksMod from '@ootmm/core/settings/tricks';

const SHARE_HASH_PARAM = 's';
const SHARE_PAYLOAD_PREFIX = 'v1.';
const SHARE_SCHEMA_VERSION = 1;
const SHARE_STATUS_SESSION_KEY = 'tlt:share-import-status:v1';
const SHARE_STATUS_DETAILS_SESSION_KEY = 'tlt:share-import-details:v1';
const SHARE_IMPORT_PENDING_SESSION_KEY = 'tlt:share-import-pending:v1';
const SHARE_IMPORT_CONFIRMATION_SESSION_KEY =
  'tlt:share-import-confirmation:v1';
export const SHARE_STATUS_EVENT_NAME = 'tlt:share-status';
export const SHARE_IMPORT_CONFIRMATION_EVENT_NAME =
  'tlt:share-import-confirmation';
export const SHARE_PARTIAL_IMPORT_MESSAGE =
  'Imported shared state; some invalid data was ignored.';
const SHARE_TOP_LEVEL_KEYS = new Set(['v', 'stores']);
const SHARE_STORE_IDS = new Set<string>(PERSIST_STORE_IDS);
const resolveInteropModule = (mod: unknown): Record<string, unknown> => {
  const modRecord = mod as Record<string, unknown>;
  const defaultValue = Object.prototype.hasOwnProperty.call(
    modRecord,
    'default',
  )
    ? modRecord['default']
    : undefined;
  if (defaultValue && typeof defaultValue === 'object') {
    return defaultValue as Record<string, unknown>;
  }

  const moduleExportsValue = Object.prototype.hasOwnProperty.call(
    modRecord,
    'module.exports',
  )
    ? modRecord['module.exports']
    : undefined;
  if (moduleExportsValue && typeof moduleExportsValue === 'object') {
    return moduleExportsValue as Record<string, unknown>;
  }

  return modRecord;
};
/**
 * Maximum allowed size for decompressed share payloads (512 KiB).
 * A normal full-state export is typically 5-15 KiB; this limit prevents
 * decompression bombs.
 */
const MAX_INFLATED_SIZE = 512 * 1024;
/**
 * Cheap pre-check before base64 decode/inflate. Legitimate payloads are far
 * smaller than this; oversize hashes are rejected before decompression work.
 */
const MAX_ENCODED_PAYLOAD_LENGTH = 128 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const tricksModule = resolveInteropModule(TricksMod);
const IMPORT_CONFIRM_MESSAGE =
  'A shared tracker URL was detected. Importing it will replace your current local tracker progress. Continue?';

type PersistedStoresSnapshot = Partial<
  Record<PersistStoreId, Record<string, unknown>>
>;

export type ShareImportIssue = {
  path: string;
  reason: string;
  received?: unknown;
  imported?: unknown;
};

export type ShareStatusPayload = {
  message: string;
  issues?: ShareImportIssue[];
};

export type ShareImportConfirmationPayload = {
  message: string;
};

type SharePayloadDecodeResult = {
  snapshot: PersistedSnapshot;
  partial: boolean;
  issues: ShareImportIssue[];
};

type MultiSelectValue = {
  type: 'all' | 'none' | 'specific';
  values?: unknown[];
};

export type PersistedSnapshot = {
  v: number;
  stores: PersistedStoresSnapshot;
};

export type ShareStateImportResult =
  | 'none'
  | 'imported'
  | 'partial'
  | 'skipped'
  | 'invalid';

export type ShareStateImportHandlingResult =
  | ShareStateImportResult
  | 'confirmation-required';

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

function buildIssueReason(received: unknown, imported: unknown): string {
  if (imported === undefined) {
    return 'Ignored invalid or unsupported field.';
  }
  if (Array.isArray(received) || Array.isArray(imported)) {
    return 'Adjusted collection during import.';
  }
  return 'Adjusted value during import.';
}

function areEquivalentShareImportValues(
  path: string,
  received: unknown,
  imported: unknown,
): boolean {
  if (deepEqual(received, imported)) return true;

  return (
    path === 'stores.ootmm-session.entranceOverrides' &&
    isPlainObject(received) &&
    Object.keys(received).length === 0 &&
    (imported === undefined ||
      (isPlainObject(imported) && Object.keys(imported).length === 0))
  );
}

function pushShareImportIssue(
  issues: ShareImportIssue[],
  issue: ShareImportIssue,
): void {
  issues.push(issue);
}

function collectShareImportIssues(
  path: string,
  received: unknown,
  imported: unknown,
  issues: ShareImportIssue[],
): void {
  if (areEquivalentShareImportValues(path, received, imported)) return;

  if (isPlainObject(received)) {
    if (!isPlainObject(imported)) {
      pushShareImportIssue(issues, {
        path,
        reason: buildIssueReason(received, imported),
        received,
        ...(imported !== undefined ? { imported } : {}),
      });
      return;
    }

    for (const [key, value] of Object.entries(received)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(imported, key)) {
        if (areEquivalentShareImportValues(nextPath, value, undefined)) {
          continue;
        }
        pushShareImportIssue(issues, {
          path: nextPath,
          reason: 'Ignored invalid or unsupported field.',
          received: value,
        });
        continue;
      }
      collectShareImportIssues(nextPath, value, imported[key], issues);
    }
    return;
  }

  pushShareImportIssue(issues, {
    path,
    reason: buildIssueReason(received, imported),
    received,
    ...(imported !== undefined ? { imported } : {}),
  });
}

function sanitizeShareImportIssues(value: unknown): ShareImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    if (typeof entry.path !== 'string' || typeof entry.reason !== 'string') {
      return [];
    }
    return [
      {
        path: entry.path,
        reason: entry.reason,
        ...(Object.prototype.hasOwnProperty.call(entry, 'received')
          ? { received: entry.received }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(entry, 'imported')
          ? { imported: entry.imported }
          : {}),
      },
    ];
  });
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

  for (const [key, value] of Object.entries(diff)) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
    if (!TRACKER_EXTRA_SETTINGS_KEYS.has(key)) continue;
    merged[key] = structuredClone(value);
  }

  // Only known default keys and validated dynamic tracker keys are accepted —
  // unexpected keys from the payload are intentionally discarded.
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

function concatByteChunks(
  chunks: Uint8Array[],
  totalLength: number,
): Uint8Array {
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function inflateRawWithLimit(compressed: Uint8Array): Uint8Array {
  const inflator = new Inflate({ raw: true, chunkSize: 32 * 1024 });
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  inflator.onData = (chunk: Uint8Array | string) => {
    const bytes =
      chunk instanceof Uint8Array ? chunk : textEncoder.encode(String(chunk));
    totalLength += bytes.byteLength;
    if (totalLength > MAX_INFLATED_SIZE) {
      throw new Error(
        `Share payload too large after decompression: ${totalLength} bytes (max ${MAX_INFLATED_SIZE})`,
      );
    }
    chunks.push(bytes);
  };

  try {
    inflator.push(compressed, true);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to inflate share payload');
  }

  if (inflator.err) {
    throw new Error(inflator.msg || 'Failed to inflate share payload');
  }

  return concatByteChunks(chunks, totalLength);
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

function findMatchingOptionValue(
  options: NonNullable<SettingDefinition['options']>,
  raw: unknown,
): unknown | undefined {
  return options.find((option) => deepEqual(option.value, raw))?.value;
}

function resolveSettingBound(
  bound: SettingDefinition['min'] | SettingDefinition['max'],
  settings: Record<string, unknown>,
): number | undefined {
  if (typeof bound === 'number' && Number.isFinite(bound)) {
    return bound;
  }
  if (typeof bound === 'function') {
    const resolved = bound(settings);
    return typeof resolved === 'number' && Number.isFinite(resolved)
      ? resolved
      : undefined;
  }
  return undefined;
}

function getDefaultSettingValue(def: SettingDefinition): unknown {
  return structuredClone(def.default);
}

function normalizeImportedMultiSelectValue(
  def: SettingDefinition,
  raw: unknown,
): MultiSelectValue {
  const defaultValue = getDefaultSettingValue(def) as MultiSelectValue;
  const options = def.options ?? [];

  if (raw === 'all' || raw === 'none') {
    return { type: raw };
  }

  if (!isPlainObject(raw)) {
    return defaultValue;
  }

  const mode = raw.type;
  if (mode === 'all' || mode === 'none') {
    return { type: mode };
  }
  if (mode !== 'specific' || !Array.isArray(raw.values)) {
    return defaultValue;
  }

  const values: unknown[] = [];
  for (const entry of raw.values) {
    const matched = findMatchingOptionValue(options, entry);
    if (matched === undefined) continue;
    if (values.some((existing) => deepEqual(existing, matched))) continue;
    values.push(structuredClone(matched));
  }

  return { type: 'specific', values };
}

function normalizeImportedSettingValue(
  def: SettingDefinition,
  raw: unknown,
  normalizedSettings: Record<string, unknown>,
): unknown {
  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : getDefaultSettingValue(def);

    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return getDefaultSettingValue(def);
      }
      const min = resolveSettingBound(def.min, normalizedSettings);
      const max = resolveSettingBound(def.max, normalizedSettings);
      let next = raw;
      if (typeof min === 'number') {
        next = Math.max(next, min);
      }
      if (typeof max === 'number') {
        next = Math.min(next, max);
      }
      return next;
    }

    case 'select': {
      const options = def.options ?? [];
      const matched = findMatchingOptionValue(options, raw);
      if (matched !== undefined) {
        return structuredClone(matched);
      }

      const defaultMatched = findMatchingOptionValue(options, def.default);
      if (defaultMatched !== undefined) {
        return structuredClone(defaultMatched);
      }

      return options.length > 0
        ? structuredClone(options[0].value)
        : getDefaultSettingValue(def);
    }

    case 'multi-select':
      return normalizeImportedMultiSelectValue(def, raw);

    default:
      return getDefaultSettingValue(def);
  }
}

function normalizeImportedTrackerSettings(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const def of ALL_SETTINGS_DEFINITIONS) {
    const nextValue = Object.prototype.hasOwnProperty.call(raw, def.key)
      ? raw[def.key]
      : TRACKER_DEFAULT_SETTINGS[def.key];
    normalized[def.key] = normalizeImportedSettingValue(
      def,
      nextValue,
      normalized,
    );
  }

  for (const extraKey of TRACKER_EXTRA_SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, extraKey)) continue;
    normalized[extraKey] = structuredClone(raw[extraKey]);
  }

  const rawTricks = Object.prototype.hasOwnProperty.call(raw, 'tricks')
    ? raw.tricks
    : TRACKER_DEFAULT_SETTINGS.tricks;
  const validTrickKeys = new Set(
    Object.keys(
      ((tricksModule as { TRICKS?: unknown }).TRICKS ?? {}) as Record<
        string,
        unknown
      >,
    ),
  );
  const shouldValidateTricks = validTrickKeys.size > 0;
  normalized.tricks = Array.isArray(rawTricks)
    ? Array.from(
        new Set(
          rawTricks
            .filter(
              (entry): entry is string =>
                typeof entry === 'string' &&
                (!shouldValidateTricks || validTrickKeys.has(entry)),
            )
            .sort(),
        ),
      )
    : [];

  return normalized;
}

function normalizeImportedSnapshot(
  snapshot: PersistedSnapshot,
): SharePayloadDecodeResult {
  let partial = false;
  const stores: PersistedStoresSnapshot = { ...snapshot.stores };
  const session = stores['ootmm-session'];

  if (session) {
    const normalizedSession: Record<string, unknown> = { ...session };
    const rawSettings = isPlainObject(session.trackerSettings)
      ? (session.trackerSettings as Record<string, unknown>)
      : null;

    if (rawSettings) {
      const normalizedSettings = normalizeImportedTrackerSettings(rawSettings);
      if (!deepEqual(rawSettings, normalizedSettings)) {
        partial = true;
      }
      normalizedSession.trackerSettings = normalizedSettings;

      if (isPlainObject(session.entranceOverrides)) {
        const filtered = filterEntranceOverridesForSettings(
          session.entranceOverrides as Record<string, string>,
          normalizedSettings,
        );
        if (!deepEqual(session.entranceOverrides, filtered)) {
          partial = true;
        }
        if (Object.keys(filtered).length > 0) {
          normalizedSession.entranceOverrides = filtered;
        } else {
          delete normalizedSession.entranceOverrides;
        }
      }
    } else if (isPlainObject(session.entranceOverrides)) {
      partial = true;
      delete normalizedSession.entranceOverrides;
    }

    stores['ootmm-session'] = normalizedSession;
  }

  return {
    snapshot: {
      ...snapshot,
      stores,
    },
    partial,
    issues: [],
  };
}

function persistShareStatus(payload: ShareStatusPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SHARE_STATUS_SESSION_KEY, payload.message);
    if (payload.issues && payload.issues.length > 0) {
      window.sessionStorage.setItem(
        SHARE_STATUS_DETAILS_SESSION_KEY,
        JSON.stringify(payload.issues),
      );
    } else {
      window.sessionStorage.removeItem(SHARE_STATUS_DETAILS_SESSION_KEY);
    }
  } catch {
    // Ignore sessionStorage failures; import itself should still succeed.
  }
}

function clearShareStatusMessage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SHARE_STATUS_SESSION_KEY);
    window.sessionStorage.removeItem(SHARE_STATUS_DETAILS_SESSION_KEY);
  } catch {
    // Ignore sessionStorage failures; import itself should still succeed.
  }
}

function dispatchShareStatus(payload: ShareStatusPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SHARE_STATUS_EVENT_NAME, {
      detail: payload,
    }),
  );
}

function persistShareImportConfirmation(message: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SHARE_IMPORT_CONFIRMATION_SESSION_KEY,
      message,
    );
  } catch {
    // Ignore sessionStorage failures; import flow should still continue.
  }
}

export function clearPendingShareImportConfirmation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SHARE_IMPORT_CONFIRMATION_SESSION_KEY);
  } catch {
    // Ignore sessionStorage failures; import flow should still continue.
  }
}

function dispatchShareImportConfirmation(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ShareImportConfirmationPayload>(
      SHARE_IMPORT_CONFIRMATION_EVENT_NAME,
      {
        detail: { message },
      },
    ),
  );
}

export function requestShareImportConfirmation(
  message: string = IMPORT_CONFIRM_MESSAGE,
): void {
  persistShareImportConfirmation(message);
  dispatchShareImportConfirmation(message);
}

export function consumeShareImportConfirmationMessage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const message = window.sessionStorage.getItem(
      SHARE_IMPORT_CONFIRMATION_SESSION_KEY,
    );
    if (!message) return null;
    window.sessionStorage.removeItem(SHARE_IMPORT_CONFIRMATION_SESSION_KEY);
    return message;
  } catch {
    return null;
  }
}

function markPendingShareImportCheck(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SHARE_IMPORT_PENDING_SESSION_KEY, '1');
  } catch {
    // Ignore sessionStorage failures; post-init validation is best effort.
  }
}

export function hasPendingShareImportCheck(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.sessionStorage.getItem(SHARE_IMPORT_PENDING_SESSION_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function clearPendingShareImportCheck(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SHARE_IMPORT_PENDING_SESSION_KEY);
  } catch {
    // Ignore sessionStorage failures; import itself should still succeed.
  }
}

export function publishShareStatus(payload: ShareStatusPayload | string): void {
  const normalized =
    typeof payload === 'string' ? { message: payload } : payload;
  persistShareStatus(normalized);
  dispatchShareStatus(normalized);
}

export function publishShareStatusMessage(message: string): void {
  publishShareStatus(message);
}

export function consumeShareStatus(): ShareStatusPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const message = window.sessionStorage.getItem(SHARE_STATUS_SESSION_KEY);
    if (!message) return null;
    window.sessionStorage.removeItem(SHARE_STATUS_SESSION_KEY);

    const rawIssues = window.sessionStorage.getItem(
      SHARE_STATUS_DETAILS_SESSION_KEY,
    );
    window.sessionStorage.removeItem(SHARE_STATUS_DETAILS_SESSION_KEY);

    const issues = rawIssues
      ? sanitizeShareImportIssues(safeJsonParse(rawIssues))
      : [];
    return issues.length > 0 ? { message, issues } : { message };
  } catch {
    return null;
  }
}

export function consumeShareStatusMessage(): string | null {
  return consumeShareStatus()?.message ?? null;
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
): SharePayloadDecodeResult {
  if (!payload.startsWith(SHARE_PAYLOAD_PREFIX)) {
    throw new Error('Unsupported share payload prefix');
  }

  const encoded = payload.slice(SHARE_PAYLOAD_PREFIX.length);
  if (!encoded) {
    throw new Error('Missing encoded share payload body');
  }
  if (encoded.length > MAX_ENCODED_PAYLOAD_LENGTH) {
    throw new Error(
      `Encoded share payload too large: ${encoded.length} chars (max ${MAX_ENCODED_PAYLOAD_LENGTH})`,
    );
  }

  const inflatedBytes = inflateRawWithLimit(base64UrlToByteArray(encoded));
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

  const issues: ShareImportIssue[] = [];

  for (const key of Object.keys(parsed)) {
    if (SHARE_TOP_LEVEL_KEYS.has(key)) continue;
    pushShareImportIssue(issues, {
      path: key,
      reason: 'Ignored unknown top-level field.',
      received: parsed[key],
    });
  }

  for (const key of Object.keys(parsed.stores)) {
    if (SHARE_STORE_IDS.has(key)) continue;
    pushShareImportIssue(issues, {
      path: `stores.${key}`,
      reason: 'Ignored unknown persisted store.',
      received: parsed.stores[key],
    });
  }

  const snapshot: PersistedSnapshot = {
    v: SHARE_SCHEMA_VERSION,
    stores: {},
  };
  for (const storeId of PERSIST_STORE_IDS) {
    const storeRaw = parsed.stores[storeId];
    if (storeRaw !== undefined && !isPlainObject(storeRaw)) {
      pushShareImportIssue(issues, {
        path: `stores.${storeId}`,
        reason: 'Ignored invalid store payload.',
        received: storeRaw,
      });
      continue;
    }

    const sanitized = sanitizePersistedStateForStore(storeId, storeRaw);
    if (Object.keys(sanitized).length > 0) {
      snapshot.stores[storeId] = sanitized;
    }
  }

  const expanded = expandSnapshotSettings(snapshot);
  const normalized = normalizeImportedSnapshot(expanded);

  for (const storeId of PERSIST_STORE_IDS) {
    const storeRaw = parsed.stores[storeId];
    if (storeRaw === undefined || !isPlainObject(storeRaw)) continue;
    collectShareImportIssues(
      `stores.${storeId}`,
      storeRaw,
      normalized.snapshot.stores[storeId] ?? {},
      issues,
    );
  }

  return {
    snapshot: normalized.snapshot,
    partial: issues.length > 0,
    issues,
  };
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

function handleInvalidShareImport(error: unknown): ShareStateImportResult {
  console.warn('[Share] Ignoring invalid share payload:', error);
  clearPendingShareImportCheck();
  clearShareStatusMessage();
  clearPendingShareImportConfirmation();
  clearSharePayloadFromCurrentUrl();
  return 'invalid';
}

function finalizeShareStateImport(
  decoded: SharePayloadDecodeResult,
): ShareStateImportResult {
  clearPendingShareImportConfirmation();
  applySnapshotToLocalStorage(decoded.snapshot);
  markPendingShareImportCheck();
  if (decoded.partial) {
    publishShareStatus({
      message: SHARE_PARTIAL_IMPORT_MESSAGE,
      issues: decoded.issues,
    });
  } else {
    clearShareStatusMessage();
  }
  clearSharePayloadFromCurrentUrl();
  return decoded.partial ? 'partial' : 'imported';
}

export function handleShareStateImportFromCurrentUrl(): ShareStateImportHandlingResult {
  if (typeof window === 'undefined') return 'none';
  const payload = parseSharePayloadFromLocationHash(window.location.hash);
  if (!payload) return 'none';

  let decoded: SharePayloadDecodeResult;
  try {
    decoded = decodeHashPayloadToSnapshot(payload);
  } catch (error) {
    return handleInvalidShareImport(error);
  }

  if (hasMeaningfulLocalState()) {
    requestShareImportConfirmation();
    return 'confirmation-required';
  }

  return finalizeShareStateImport(decoded);
}

export function importShareStateFromCurrentUrl(
  confirmOverwrite: (message: string) => boolean = (message) =>
    window.confirm(message),
): ShareStateImportResult {
  if (typeof window === 'undefined') return 'none';
  const payload = parseSharePayloadFromLocationHash(window.location.hash);
  if (!payload) return 'none';

  let decoded: SharePayloadDecodeResult;
  try {
    decoded = decodeHashPayloadToSnapshot(payload);
  } catch (error) {
    return handleInvalidShareImport(error);
  }

  const shouldOverwrite = !hasMeaningfulLocalState()
    ? true
    : confirmOverwrite(IMPORT_CONFIRM_MESSAGE);
  if (!shouldOverwrite) {
    clearPendingShareImportCheck();
    clearShareStatusMessage();
    clearPendingShareImportConfirmation();
    clearSharePayloadFromCurrentUrl();
    return 'skipped';
  }

  return finalizeShareStateImport(decoded);
}

// ---------------------------------------------------------------------------
// Preset state loading from JSON config
// ---------------------------------------------------------------------------

/**
 * Path (relative to the app root) to the JSON file that maps preset keys to
 * shared state payloads. This file is served as a static asset from `public/`.
 */
const SHARED_STATES_CONFIG_PATH = '/shared-states.json';

/**
 * Load a preset shared state from the JSON config and apply it directly to
 * localStorage without any confirmation dialog, then clean up the URL.
 *
 * Expected URL format:  http://localhost:5173/?preset=<key>
 *
 * @returns `true` if a preset was found and applied, `false` otherwise.
 */
export async function handlePresetImportFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const presetKey = params.get('preset');
  if (!presetKey) return false;

  let config: Record<string, string>;
  try {
    const response = await fetch(SHARED_STATES_CONFIG_PATH);
    if (!response.ok) {
      console.warn(
        `[Share] Failed to load preset config: ${response.status} ${response.statusText}`,
      );
      return false;
    }
    config = (await response.json()) as Record<string, string>;
  } catch (error) {
    console.warn('[Share] Failed to load shared states config:', error);
    return false;
  }

  const rawPayload = config[presetKey];
  if (typeof rawPayload !== 'string' || rawPayload.length === 0) {
    console.warn(
      `[Share] Preset "${presetKey}" not found or empty in shared states config`,
    );
    return false;
  }

  // The payload can be either "#s=v1.XXXX…" or just "s=v1.XXXX…"
  const hashContent = rawPayload.startsWith('#')
    ? rawPayload.slice(1)
    : rawPayload;
  const hashParams = new URLSearchParams(hashContent);
  const encodedPayload = hashParams.get(SHARE_HASH_PARAM);
  if (!encodedPayload) {
    console.warn(
      `[Share] Preset "${presetKey}" does not contain a valid share payload`,
    );
    return false;
  }

  let decoded: SharePayloadDecodeResult;
  try {
    decoded = decodeHashPayloadToSnapshot(encodedPayload);
  } catch (error) {
    console.warn(
      `[Share] Failed to decode preset "${presetKey}" payload:`,
      error,
    );
    return false;
  }

  // Clear any existing local state before applying the preset
  for (const storeId of PERSIST_STORE_IDS) {
    const key = PERSIST_CONFIGS[storeId].key;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore localStorage errors
    }
  }

  applySnapshotToLocalStorage(decoded.snapshot);

  // Show any import issues via the status bar / Import Details modal
  if (decoded.partial && decoded.issues.length > 0) {
    publishShareStatus({
      message: SHARE_PARTIAL_IMPORT_MESSAGE,
      issues: decoded.issues,
    });
  } else {
    clearShareStatusMessage();
  }

  // Clean up the URL: remove the `preset` param and any hash
  params.delete('preset');
  const newSearch = params.toString();
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
  window.history.replaceState(window.history.state, '', newUrl);

  console.log(`[Share] Preset "${presetKey}" loaded successfully`);
  return true;
}
