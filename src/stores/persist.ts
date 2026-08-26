import type { PiniaPluginContext } from 'pinia';
import { isSafeKey, safeJsonParse } from '@/utils/safeJson';
import { TRACKER_DEFAULT_SETTINGS } from '@packs/ootmm/data/settings';
import { DEFAULT_OOTMM_SETTINGS } from '@packs/ootmm/types/settings';
import { isValidCoopRoomCode } from '@packs/ootmm/utils/coopFlag';
import {
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
} from '@packs/ootmm/stores/ootmmUi';
import {
  synthesizeOotToMmItemsForInventory,
  synthesizeMmToOotItemsForInventory,
} from '@packs/ootmm/utils/spoilerSettingsMigration';
import { LATEST_STATE_VERSION, migrateStateToLatest } from '@/utils/migrations';

export type PersistConfig = {
  key: string;
  paths: string[];
  hydrate: (raw: Record<string, unknown>) => Record<string, unknown>;
  serialize?: (state: Record<string, unknown>) => Record<string, unknown>;
};

export type PersistStoreId = 'app' | 'ootmm-ui' | 'ootmm-session';

const VALID_PACK_IDS = new Set(['ootmm']);
const VALID_TABS = new Set([
  'grid',
  'inventory',
  'settings',
  'world',
  'tricks',
]);
const VALID_RIGHT_SIDEBAR_TABS = new Set(['locations', 'entrances']);
const VALID_REACHABILITY_FILTERS = new Set(['all', 'reachable', 'unreachable']);
const VALID_COLLECTION_FILTERS = new Set(['all', 'collected', 'uncollected']);
const VALID_ENTRANCE_MAPPING_FILTERS = new Set(['all', 'mapped', 'unmapped']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Strip `plando.entrances` from a settings object.
 *
 * `entranceOverrides` is the source of truth for user entrance mappings;
 * `plando.entrances` inside `trackerSettings` is a transient copy that the
 * tracker contaminates with self-mappings during initialization. Persisting
 * both is redundant, so we strip the derived copy.
 */
function stripPlandoEntrancesFromSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const plando = settings.plando;
  if (!plando || typeof plando !== 'object' || Array.isArray(plando)) {
    return settings;
  }
  const { entrances: _, ...rest } = plando as Record<string, unknown>;
  const result = { ...settings };
  if (Object.keys(rest).length > 0) {
    result.plando = rest;
  } else {
    delete result.plando;
  }
  return result;
}

/** Maximum length for persisted UI string values (search queries, etc.). */
const MAX_UI_STRING_LENGTH = 500;

/** Known setting keys from the tracker defaults — used as an allowlist. */
export const TRACKER_EXTRA_SETTINGS_KEYS = new Set([
  'startingItems',
  'junkLocations',
  'specialConds',
  'plando',
  'hints',
]);

/** Known tracker setting keys from defaults plus validated dynamic fields. */
const KNOWN_SETTINGS_KEYS = new Set([
  ...Object.keys(TRACKER_DEFAULT_SETTINGS),
  ...Object.keys(DEFAULT_OOTMM_SETTINGS),
  ...TRACKER_EXTRA_SETTINGS_KEYS,
]);

/**
 * Recursively strip dangerous keys from a JSON-safe value.
 * Returns only primitives, plain-object trees, and arrays.
 */
function deepSanitizeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepSanitizeJsonValue(entry));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!isSafeKey(key)) continue;
      out[key] = deepSanitizeJsonValue(entry);
    }
    return out;
  }
  // Drop functions, symbols, class instances, etc. that shouldn't be here.
  return undefined;
}

/**
 * Sanitize `trackerSettings`: only allow known tracker keys, including the
 * validated dynamic keys that OoTMM adds outside the static defaults
 * (`specialConds`, `plando`, spoiler-derived fields, etc.), and recursively
 * strip dangerous keys / non-JSON values from every value.
 */
function sanitizeSettingsObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // Version normalization (v30.1 → v31.0) happens in the migration registry
  // (`src/utils/migrations/legacy.ts`) before this runs; here we only filter
  // against known keys and recursively strip dangerous values.
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSafeKey(key)) continue;
    if (!KNOWN_SETTINGS_KEYS.has(key)) continue;
    safe[key] = deepSanitizeJsonValue(value);
  }
  return safe;
}

/** Clamp a string to MAX_UI_STRING_LENGTH. */
function safeUiString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, MAX_UI_STRING_LENGTH);
}

function safeOptionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_UI_STRING_LENGTH);
}

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 960;

function safeSidebarWidth(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  if (normalized < MIN_SIDEBAR_WIDTH || normalized > MAX_SIDEBAR_WIDTH) {
    return fallback;
  }
  if (normalized === 400 && fallback !== 400) {
    return fallback;
  }
  return normalized;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && isSafeKey(entry),
      ),
    ),
  );
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const next: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!isSafeKey(key)) continue;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0)
      continue;
    next[key] = Math.floor(count);
  }
  return next;
}

function nonNegativeNumberRecord(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const next: Record<string, number> = {};
  for (const [key, numericValue] of Object.entries(value)) {
    if (!isSafeKey(key)) continue;
    if (
      typeof numericValue !== 'number' ||
      !Number.isFinite(numericValue) ||
      numericValue < 0
    ) {
      continue;
    }
    next[key] = Math.floor(numericValue);
  }
  return next;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isSafeKey(key)) continue;
    if (typeof entry !== 'string' || !isSafeKey(entry)) continue;
    next[key] = entry;
  }
  return next;
}

export const PERSIST_CONFIGS: Record<PersistStoreId, PersistConfig> = {
  app: {
    key: 'tlt:app',
    paths: ['selectedPackId'],
    hydrate: (raw) => ({
      ...(typeof raw.selectedPackId === 'string' &&
      VALID_PACK_IDS.has(raw.selectedPackId)
        ? { selectedPackId: raw.selectedPackId }
        : {}),
    }),
  },
  'ootmm-ui': {
    key: 'tlt:ootmm-ui',
    paths: [
      'activeTab',
      'isRightSidebarOpen',
      'activeRightSidebarTab',
      'inventorySearchQuery',
      'inventorySelectedCategory',
      'locationsSearchQuery',
      'locationsSelectedCategory',
      'locationsReachabilityFilter',
      'locationsCollectionFilter',
      'locationsShowUnshuffled',
      'locationsShowGossipStones',
      'entrancesReachabilityFilter',
      'entrancesMappingFilter',
      'leftSidebarWidth',
      'rightSidebarWidth',
      'activeMapId',
      'settingsSearchQuery',
    ],
    hydrate: (raw) => {
      const next: Record<string, unknown> = {
        ...(typeof raw.activeTab === 'string' && VALID_TABS.has(raw.activeTab)
          ? { activeTab: raw.activeTab }
          : {}),
        ...(typeof raw.inventorySearchQuery === 'string'
          ? { inventorySearchQuery: safeUiString(raw.inventorySearchQuery) }
          : {}),
        ...(typeof raw.inventorySelectedCategory === 'string'
          ? {
              inventorySelectedCategory: safeUiString(
                raw.inventorySelectedCategory,
              ),
            }
          : {}),
        ...(typeof raw.locationsSearchQuery === 'string'
          ? { locationsSearchQuery: safeUiString(raw.locationsSearchQuery) }
          : {}),
        ...(typeof raw.locationsSelectedCategory === 'string'
          ? {
              locationsSelectedCategory: safeUiString(
                raw.locationsSelectedCategory,
              ),
            }
          : {}),
        ...(typeof raw.locationsReachabilityFilter === 'string' &&
        VALID_REACHABILITY_FILTERS.has(raw.locationsReachabilityFilter)
          ? { locationsReachabilityFilter: raw.locationsReachabilityFilter }
          : {}),
        ...(typeof raw.locationsCollectionFilter === 'string' &&
        VALID_COLLECTION_FILTERS.has(raw.locationsCollectionFilter)
          ? { locationsCollectionFilter: raw.locationsCollectionFilter }
          : {}),
        ...(typeof raw.locationsShowUnshuffled === 'boolean'
          ? { locationsShowUnshuffled: raw.locationsShowUnshuffled }
          : {}),
        ...(typeof raw.locationsShowGossipStones === 'boolean'
          ? { locationsShowGossipStones: raw.locationsShowGossipStones }
          : {}),
        ...(typeof raw.entrancesReachabilityFilter === 'string' &&
        VALID_REACHABILITY_FILTERS.has(raw.entrancesReachabilityFilter)
          ? { entrancesReachabilityFilter: raw.entrancesReachabilityFilter }
          : {}),
        ...(typeof raw.entrancesMappingFilter === 'string' &&
        VALID_ENTRANCE_MAPPING_FILTERS.has(raw.entrancesMappingFilter)
          ? { entrancesMappingFilter: raw.entrancesMappingFilter }
          : {}),
        ...(typeof raw.leftSidebarWidth === 'number'
          ? {
              leftSidebarWidth: safeSidebarWidth(
                raw.leftSidebarWidth,
                DEFAULT_LEFT_SIDEBAR_WIDTH,
              ),
            }
          : {}),
        ...(typeof raw.rightSidebarWidth === 'number'
          ? {
              rightSidebarWidth: safeSidebarWidth(
                raw.rightSidebarWidth,
                DEFAULT_RIGHT_SIDEBAR_WIDTH,
              ),
            }
          : {}),
        ...(typeof raw.activeMapId === 'string'
          ? { activeMapId: safeUiString(raw.activeMapId) }
          : {}),
        ...(typeof raw.settingsSearchQuery === 'string'
          ? { settingsSearchQuery: safeUiString(raw.settingsSearchQuery) }
          : {}),
      };

      // The `isEntrancesSidebarOpen` / `isLocationsSidebarOpen` → `isRightSidebarOpen`
      // merge runs in the migration registry before hydration; here we only
      // validate the already-merged fields.
      if (typeof raw.isRightSidebarOpen === 'boolean') {
        next.isRightSidebarOpen = raw.isRightSidebarOpen;
      }

      if (
        typeof raw.activeRightSidebarTab === 'string' &&
        VALID_RIGHT_SIDEBAR_TABS.has(raw.activeRightSidebarTab)
      ) {
        next.activeRightSidebarTab = raw.activeRightSidebarTab;
      }

      return next;
    },
  },
  'ootmm-session': {
    key: 'tlt:ootmm-session',
    paths: [
      'inventoryById',
      'collectedLocationIds',
      'preCompletedDungeons',
      'junkLocationIds',
      'songEvents',
      'shopPrices',
      'entranceOverrides',
      'trackerSettings',
      'hasImportedSpoilerLog',
      'importedSpoilerLogVersion',
      'needsLegacyCrossWarpOotSynthesis',
      'needsLegacyCrossWarpMmSynthesis',
      'spoilerFishItemIds',
      'coopRoomCode',
    ],
    hydrate: (raw) => {
      const inventory: Record<string, number> = isPlainObject(raw.inventoryById)
        ? numberRecord(raw.inventoryById)
        : {};

      const trackerSettings = isPlainObject(raw.trackerSettings)
        ? stripPlandoEntrancesFromSettings(
            sanitizeSettingsObject(raw.trackerSettings),
          )
        : {};

      // Synthesize cross-game counterpart items for CrossWarp (OoT↔MM songs)
      // based on already-normalized (v31.0) settings. The decision whether to
      // synthesize is captured by the migration registry from the legacy
      // `crossWarpOot` / `crossWarpMm` keys and carried forward as the
      // `needsLegacyCrossWarp*Synthesis` flags (see Decision 2).
      if (
        Object.keys(inventory).length > 0 &&
        Object.keys(trackerSettings).length > 0
      ) {
        if (raw.needsLegacyCrossWarpOotSynthesis === true) {
          synthesizeOotToMmItemsForInventory(
            inventory,
            trackerSettings as Record<string, unknown>,
          );
        }
        if (raw.needsLegacyCrossWarpMmSynthesis === true) {
          synthesizeMmToOotItemsForInventory(
            inventory,
            trackerSettings as Record<string, unknown>,
          );
        }
      }

      return {
        ...(Object.keys(inventory).length > 0
          ? { inventoryById: inventory }
          : {}),
        ...(Array.isArray(raw.collectedLocationIds)
          ? { collectedLocationIds: stringArray(raw.collectedLocationIds) }
          : {}),
        ...(Array.isArray(raw.preCompletedDungeons)
          ? { preCompletedDungeons: stringArray(raw.preCompletedDungeons) }
          : {}),
        ...(Array.isArray(raw.junkLocationIds)
          ? { junkLocationIds: stringArray(raw.junkLocationIds) }
          : {}),
        ...(isPlainObject(raw.songEvents)
          ? { songEvents: nonNegativeNumberRecord(raw.songEvents) }
          : {}),
        ...(isPlainObject(raw.shopPrices)
          ? { shopPrices: nonNegativeNumberRecord(raw.shopPrices) }
          : {}),
        ...(isPlainObject(raw.entranceOverrides)
          ? { entranceOverrides: stringRecord(raw.entranceOverrides) }
          : {}),
        ...(Object.keys(trackerSettings).length > 0 ? { trackerSettings } : {}),
        ...(typeof raw.hasImportedSpoilerLog === 'boolean'
          ? { hasImportedSpoilerLog: raw.hasImportedSpoilerLog }
          : {}),
        ...(typeof raw.needsLegacyCrossWarpOotSynthesis === 'boolean'
          ? {
              needsLegacyCrossWarpOotSynthesis:
                raw.needsLegacyCrossWarpOotSynthesis,
            }
          : {}),
        ...(typeof raw.needsLegacyCrossWarpMmSynthesis === 'boolean'
          ? {
              needsLegacyCrossWarpMmSynthesis:
                raw.needsLegacyCrossWarpMmSynthesis,
            }
          : {}),
        ...(Array.isArray(raw.spoilerFishItemIds)
          ? { spoilerFishItemIds: stringArray(raw.spoilerFishItemIds) }
          : {}),
        ...(safeOptionalString(raw.importedSpoilerLogVersion) !== undefined
          ? {
              importedSpoilerLogVersion: safeOptionalString(
                raw.importedSpoilerLogVersion,
              ),
            }
          : {}),
        ...(() => {
          const coopRoomCode = safeOptionalString(raw.coopRoomCode);
          return typeof coopRoomCode === 'string' &&
            isValidCoopRoomCode(coopRoomCode)
            ? { coopRoomCode }
            : {};
        })(),
      };
    },
    serialize: (picked) => {
      if (!isPlainObject(picked.trackerSettings)) return picked;
      return {
        ...picked,
        trackerSettings: stripPlandoEntrancesFromSettings(
          picked.trackerSettings as Record<string, unknown>,
        ),
      };
    },
  },
};

export const PERSIST_STORE_IDS = Object.keys(
  PERSIST_CONFIGS,
) as PersistStoreId[];

function pickPersistedState(
  state: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const path of paths) {
    if (Object.prototype.hasOwnProperty.call(state, path)) {
      picked[path] = state[path];
    }
  }
  return picked;
}

export function isPersistStoreId(value: string): value is PersistStoreId {
  return Object.prototype.hasOwnProperty.call(PERSIST_CONFIGS, value);
}

export function sanitizePersistedStateForStore(
  storeId: PersistStoreId,
  raw: unknown,
  fromVersion?: number,
): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  const version =
    typeof fromVersion === 'number'
      ? fromVersion
      : typeof raw.v === 'number' && raw.v >= 1
        ? raw.v
        : 1; // legacy payload without a version field

  let migrated = raw;
  try {
    migrated = migrateStateToLatest(raw, version);
  } catch {
    // Migration failed silently — hydrate the un-migrated payload. This
    // prevents a migration bug from breaking the entire session hydration.
    migrated = raw;
  }
  return PERSIST_CONFIGS[storeId].hydrate(migrated);
}

/** Legacy storage key suffix used before the `:v1` key migration. */
const LEGACY_STORAGE_KEY_SUFFIX = ':v1';

/**
 * Resolve the persisted payload for a store from localStorage, centralizing
 * the storage-key lookup so every read path agrees.
 *
 * The v1→v2 upgrade dropped the `:v1` suffix from storage keys. Reads resolve
 * in this order:
 *   1. versionless key present → use as-is (already migrated);
 *   2. legacy `:v1` key present → read, run the payload migration, write to the
 *      versionless key with `v: LATEST_STATE_VERSION`, then remove the legacy key.
 *
 * In BOTH branches the legacy `:v1` key is removed once the versionless key is
 * available, so the one-time key migration is idempotent and self-healing: even
 * if the versionless key was written first (e.g. by a hot-reload during
 * development, or by `applySnapshotToLocalStorage`), a subsequent read clears
 * the stale `:v1` key rather than leaving the store duplicated.
 *
 * Returns the resolved payload (possibly migrated) or `null` when nothing is
 * stored. The returned payload is NOT hydrated — that is the caller's job via
 * `sanitizePersistedStateForStore`.
 */
export function resolvePersistedPayload(
  storeId: PersistStoreId,
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const config = PERSIST_CONFIGS[storeId];
  const legacyKey = `${config.key}${LEGACY_STORAGE_KEY_SUFFIX}`;

  const raw = window.localStorage.getItem(config.key);
  if (raw) {
    const parsed = safeJsonParse(raw);
    // The versionless key is authoritative; any lingering legacy key is stale
    // and must be removed so it can never be re-read as "schema version 1".
    window.localStorage.removeItem(legacyKey);
    return isPlainObject(parsed) ? parsed : null;
  }

  const legacyRaw = window.localStorage.getItem(legacyKey);
  if (legacyRaw) {
    const parsed = safeJsonParse(legacyRaw);
    if (!isPlainObject(parsed)) {
      window.localStorage.removeItem(legacyKey);
      return null;
    }
    const migrated = migrateStateToLatest(parsed, 1);
    window.localStorage.setItem(
      config.key,
      JSON.stringify({ v: LATEST_STATE_VERSION, ...migrated }),
    );
    window.localStorage.removeItem(legacyKey);
    return migrated;
  }

  return null;
}

/**
 * Remove a store's persisted payload from localStorage, covering both the
 * versionless key and the legacy `:v1` key. Used by share import / preset
 * flows that clear existing local state before applying a snapshot.
 */
export function removePersistedPayload(storeId: PersistStoreId): void {
  if (typeof window === 'undefined') return;
  const config = PERSIST_CONFIGS[storeId];
  window.localStorage.removeItem(config.key);
  window.localStorage.removeItem(`${config.key}${LEGACY_STORAGE_KEY_SUFFIX}`);
}

export function piniaLocalStoragePlugin({ store }: PiniaPluginContext) {
  if (typeof window === 'undefined') return;
  if (!isPersistStoreId(store.$id)) return;
  const config = PERSIST_CONFIGS[store.$id];

  try {
    const resolved = resolvePersistedPayload(store.$id);
    if (resolved) {
      // config.hydrate validates and returns a safe partial state update.
      // TypeScript can't verify this matches the exact store type statically,
      // but the hydrate function ensures type safety at runtime.
      // @ts-expect-error - Pinia's $patch typing doesn't allow generic Record<string, unknown>
      store.$patch(sanitizePersistedStateForStore(store.$id, resolved));
    }
  } catch (error) {
    console.warn(`[Persist] Failed to hydrate "${store.$id}":`, error);
  }

  store.$subscribe(
    (_mutation, state) => {
      try {
        let next = pickPersistedState(
          state as Record<string, unknown>,
          config.paths,
        );
        if (config.serialize) {
          next = config.serialize(next);
        }
        window.localStorage.setItem(
          config.key,
          JSON.stringify({ v: LATEST_STATE_VERSION, ...next }),
        );
      } catch (error) {
        console.warn(`[Persist] Failed to persist "${store.$id}":`, error);
      }
    },
    { detached: true },
  );
}
