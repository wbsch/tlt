import type { PiniaPluginContext } from 'pinia';
import { isSafeKey, safeJsonParse } from '@/utils/safeJson';
import { TRACKER_DEFAULT_SETTINGS } from '@packs/ootmm/data/settings';

export type PersistConfig = {
  key: string;
  paths: string[];
  hydrate: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export type PersistStoreId = 'app' | 'ootmm-ui' | 'ootmm-session';

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Maximum length for persisted UI string values (search queries, etc.). */
const MAX_UI_STRING_LENGTH = 500;

/** Known setting keys from the tracker defaults — used as an allowlist. */
const KNOWN_SETTINGS_KEYS = new Set(Object.keys(TRACKER_DEFAULT_SETTINGS));

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
 * Sanitize `trackerSettings`: only allow keys present in
 * TRACKER_DEFAULT_SETTINGS, and recursively strip dangerous keys / non-JSON
 * values from every value.
 */
function sanitizeSettingsObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
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
    if (typeof entry !== 'string') continue;
    next[key] = entry;
  }
  return next;
}

export const PERSIST_CONFIGS: Record<PersistStoreId, PersistConfig> = {
  app: {
    key: 'tlt:app:v1',
    paths: ['selectedPackId'],
    hydrate: (raw) => ({
      ...(typeof raw.selectedPackId === 'string'
        ? { selectedPackId: raw.selectedPackId }
        : {}),
    }),
  },
  'ootmm-ui': {
    key: 'tlt:ootmm-ui:v1',
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
        ...(typeof raw.activeMapId === 'string'
          ? { activeMapId: safeUiString(raw.activeMapId) }
          : {}),
        ...(typeof raw.settingsSearchQuery === 'string'
          ? { settingsSearchQuery: safeUiString(raw.settingsSearchQuery) }
          : {}),
      };

      if (typeof raw.isRightSidebarOpen === 'boolean') {
        next.isRightSidebarOpen = raw.isRightSidebarOpen;
      } else if (
        raw.isEntrancesSidebarOpen === false &&
        raw.isLocationsSidebarOpen === false
      ) {
        next.isRightSidebarOpen = false;
      } else if (
        typeof raw.isEntrancesSidebarOpen === 'boolean' ||
        typeof raw.isLocationsSidebarOpen === 'boolean'
      ) {
        next.isRightSidebarOpen =
          raw.isEntrancesSidebarOpen === true ||
          raw.isLocationsSidebarOpen === true;
      }

      if (
        typeof raw.activeRightSidebarTab === 'string' &&
        VALID_RIGHT_SIDEBAR_TABS.has(raw.activeRightSidebarTab)
      ) {
        next.activeRightSidebarTab = raw.activeRightSidebarTab;
      } else if (raw.isEntrancesSidebarOpen === true) {
        next.activeRightSidebarTab = 'entrances';
      } else if (raw.isLocationsSidebarOpen === true) {
        next.activeRightSidebarTab = 'locations';
      }

      return next;
    },
  },
  'ootmm-session': {
    key: 'tlt:ootmm-session:v1',
    paths: [
      'inventoryById',
      'collectedLocationIds',
      'preCompletedDungeons',
      'songEvents',
      'shopPrices',
      'entranceOverrides',
      'trackerSettings',
    ],
    hydrate: (raw) => ({
      ...(isPlainObject(raw.inventoryById)
        ? { inventoryById: numberRecord(raw.inventoryById) }
        : {}),
      ...(Array.isArray(raw.collectedLocationIds)
        ? { collectedLocationIds: stringArray(raw.collectedLocationIds) }
        : {}),
      ...(Array.isArray(raw.preCompletedDungeons)
        ? { preCompletedDungeons: stringArray(raw.preCompletedDungeons) }
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
      ...(isPlainObject(raw.trackerSettings)
        ? { trackerSettings: sanitizeSettingsObject(raw.trackerSettings) }
        : {}),
    }),
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
): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  return PERSIST_CONFIGS[storeId].hydrate(raw);
}

export function piniaLocalStoragePlugin({ store }: PiniaPluginContext) {
  if (typeof window === 'undefined') return;
  if (!isPersistStoreId(store.$id)) return;
  const config = PERSIST_CONFIGS[store.$id];

  try {
    const raw = window.localStorage.getItem(config.key);
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (isPlainObject(parsed)) {
        // config.hydrate validates and returns a safe partial state update.
        // TypeScript can't verify this matches the exact store type statically,
        // but the hydrate function ensures type safety at runtime.
        // @ts-expect-error - Pinia's $patch typing doesn't allow generic Record<string, unknown>
        store.$patch(config.hydrate(parsed));
      }
    }
  } catch (error) {
    console.warn(`[Persist] Failed to hydrate "${store.$id}":`, error);
  }

  store.$subscribe(
    (_mutation, state) => {
      try {
        const next = pickPersistedState(
          state as Record<string, unknown>,
          config.paths,
        );
        window.localStorage.setItem(config.key, JSON.stringify(next));
      } catch (error) {
        console.warn(`[Persist] Failed to persist "${store.$id}":`, error);
      }
    },
    { detached: true },
  );
}
