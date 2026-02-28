import type { PiniaPluginContext } from 'pinia';

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
const VALID_REACHABILITY_FILTERS = new Set(['all', 'reachable', 'unreachable']);
const VALID_COLLECTION_FILTERS = new Set(['all', 'collected', 'uncollected']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((entry): entry is string => typeof entry === 'string'),
    ),
  );
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const next: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
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
      'isLocationsSidebarOpen',
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
    hydrate: (raw) => ({
      ...(typeof raw.activeTab === 'string' && VALID_TABS.has(raw.activeTab)
        ? { activeTab: raw.activeTab }
        : {}),
      ...(typeof raw.isLocationsSidebarOpen === 'boolean'
        ? { isLocationsSidebarOpen: raw.isLocationsSidebarOpen }
        : {}),
      ...(typeof raw.inventorySearchQuery === 'string'
        ? { inventorySearchQuery: raw.inventorySearchQuery }
        : {}),
      ...(typeof raw.inventorySelectedCategory === 'string'
        ? { inventorySelectedCategory: raw.inventorySelectedCategory }
        : {}),
      ...(typeof raw.locationsSearchQuery === 'string'
        ? { locationsSearchQuery: raw.locationsSearchQuery }
        : {}),
      ...(typeof raw.locationsSelectedCategory === 'string'
        ? { locationsSelectedCategory: raw.locationsSelectedCategory }
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
        ? { activeMapId: raw.activeMapId }
        : {}),
      ...(typeof raw.settingsSearchQuery === 'string'
        ? { settingsSearchQuery: raw.settingsSearchQuery }
        : {}),
    }),
  },
  'ootmm-session': {
    key: 'tlt:ootmm-session:v1',
    paths: [
      'inventoryById',
      'collectedLocationIds',
      'preCompletedDungeons',
      'songEvents',
      'shopPrices',
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
      ...(isPlainObject(raw.trackerSettings)
        ? { trackerSettings: raw.trackerSettings }
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
      const parsed = JSON.parse(raw) as unknown;
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
