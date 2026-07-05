import { defineStore } from 'pinia';
import { isSafeKey } from '@/utils/safeJson';
import {
  clearPendingShareImportCheck,
  hasPendingShareImportCheck,
  publishShareStatusMessage,
  SHARE_PARTIAL_IMPORT_MESSAGE,
} from '@/utils/shareState';
import { computed, markRaw, nextTick, ref, watch } from 'vue';
import type { TrackerPack } from '@/types/tracker';
import { useSyncStatusStore } from '@/stores/syncStatus';
import { ITEM_DATABASE } from '../data/items';
import {
  ALL_SETTINGS_DEFINITIONS,
  TRACKER_DEFAULT_SETTINGS,
} from '../data/settings';
import { VANILLA_SONG_EVENTS } from '../data/song-events';
import {
  createOoTMMLocalSessionSync,
  OOTMM_LOCAL_SESSION_ID,
  type OoTMMSessionSyncConnection,
  type OoTMMSyncOperation,
  type OoTMMSyncOperationEnvelope,
} from './ootmmSessionSync';
import {
  createOoTMMRoomSessionSync,
  defaultRoomSyncUrl,
  type OoTMMRoomSnapshotEnvelope,
  type OoTMMRoomSyncConnection,
} from './ootmmRoomSync';
import {
  cleanupEntranceOverridesForSettings,
  computeCoupledReverse,
  filterEntranceOverridesForSettings,
  getActiveEntranceKeys,
  GAME_LINK_VANILLA_EXIT_MAPPING,
  INTERIOR_GAME_LINK_EXIT_KEYS,
  INTERIOR_GAME_LINK_SOURCE_KEYS,
} from '../utils/entranceRandomization';
import { getGridItemDefinedMaxCount } from '../data/itemIcons';
import { isValidCoopRoomCode } from '../utils/coopFlag';
import { getCrossWarpCounterpart } from '../utils/spoilerSettingsMigration';

const HISTORY_LIMIT = 200;
const VANILLA_SILVER_RUPEE_PREFIX = 'OOT_RUPEE_SILVER_';
const SHOP_PRICE_MODE_KEYS = [
  'priceOotShops',
  'priceOotScrubs',
  'priceOotMerchants',
  'priceMmShops',
  'priceMmTingle',
] as const;

type SessionSnapshot = {
  inventoryById: Record<string, number>;
  collectedLocationIds: string[];
  preCompletedDungeons: string[];
  songEvents: Record<string, number>;
  shopPrices: Record<string, number>;
  trackerSettings: Record<string, unknown>;
  entranceOverrides: Record<string, string>;
  hasImportedSpoilerLog: boolean;
  importedSpoilerLogVersion: string | null;
  junkLocationIds: string[];
};

type MutationOptions = {
  source?: 'local' | 'remote';
  recordHistory?: boolean;
};

const REMOTE_MUTATION_OPTIONS: MutationOptions = {
  source: 'remote',
  recordHistory: false,
};

const AUTOTRACKER_MUTATION_OPTIONS: MutationOptions = {
  source: 'remote',
  recordHistory: true,
};

function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map.entries());
}

function recordToMap(record: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(record).filter(([, count]) => count > 0));
}

function sanitizeInventoryRecord(
  record: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [itemId, count] of Object.entries(record)) {
    if (!isSafeKey(itemId)) continue;
    if (!Number.isFinite(count) || count <= 0) continue;
    next[itemId] = Math.floor(count);
  }
  return next;
}

function sanitizeNonNegativeNumberRecord(
  record: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!isSafeKey(key)) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    next[key] = Math.floor(numeric);
  }
  return next;
}

function setToArray<T>(set: Set<T>): T[] {
  return Array.from(set.values());
}

function mapNumberToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map.entries());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function areStringSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const values = new Set(a);
  for (const value of b) {
    if (!values.has(value)) return false;
  }
  return true;
}

function normalizeSpoilerLogVersion(
  version: string | null | undefined,
): string | null {
  if (typeof version !== 'string') return null;
  const normalized = version.trim();
  return normalized.length > 0 ? normalized : null;
}

function areSettingsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!areSettingsEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!areSettingsEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

function deepCloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCloneValue(entry));
  }
  if (value && typeof value === 'object') {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (!isSafeKey(key)) continue;
      cloned[key] = deepCloneValue(entry);
    }
    return cloned;
  }
  return value;
}

function cloneSettingsRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return deepCloneValue(value) as Record<string, unknown>;
}

function cloneSyncOperation(operation: OoTMMSyncOperation): OoTMMSyncOperation {
  return deepCloneValue(operation) as OoTMMSyncOperation;
}

// A room op stays queued from the moment it's published until the relay's
// echo acks its wire opId (see OoTMMRoomSyncConnection). wireOpId is null when
// the op hasn't been put on an open socket yet — or when the socket it was
// sent on died before the echo, in which case the next flush re-sends it
// under a fresh wire opId.
type PendingRoomOperation = {
  wireOpId: string | null;
  op: OoTMMSyncOperation;
};

// Two queued ops with the same key set the same piece of state, and every op
// is an absolute replace, so the newer one supersedes the older. Compacting
// keeps the queue bounded by the number of distinct fields touched while
// disconnected, and stops a replayed stale op from clobbering a newer edit.
function pendingRoomOpCompactionKey(op: OoTMMSyncOperation): string | null {
  switch (op.type) {
    case 'inventory.set_count':
      return `${op.type}:${op.itemId}`;
    case 'locations.set_collected':
      return `${op.type}:${op.locationId}`;
    case 'world.set_shop_price':
      return `${op.type}:${op.locationId}`;
    case 'world.set_entrance_override':
      return `${op.type}:${op.src}`;
    // A merge-patch, not an absolute replace: a newer patch doesn't carry the
    // older patch's keys, so earlier ones must survive and replay in order.
    case 'settings.patch_special_conds':
      return null;
    default:
      return op.type;
  }
}

function stripPlandoEntrances(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = cloneSettingsRecord(settings);
  const plando = normalized.plando;
  if (!plando || typeof plando !== 'object' || Array.isArray(plando)) {
    return normalized;
  }

  const { entrances: _stale, ...rest } = plando as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    normalized.plando = rest;
  } else {
    delete normalized.plando;
  }
  return normalized;
}

function isRandomizedShopPriceMode(mode: unknown): boolean {
  const normalized = String(mode ?? '');
  return normalized === 'random' || normalized === 'weighted';
}

function shouldResetInitializedShopPrices(
  previousSettings: Record<string, unknown>,
  nextSettings: Record<string, unknown>,
): boolean {
  return SHOP_PRICE_MODE_KEYS.some((key) => {
    const previousMode = previousSettings[key];
    const nextMode = nextSettings[key];
    return (
      isRandomizedShopPriceMode(nextMode) &&
      String(previousMode ?? '') !== String(nextMode ?? '')
    );
  });
}

function applyDefaultsForNewlyVisibleSettings(
  previousSettings: Record<string, unknown>,
  nextSettings: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...nextSettings };

  for (const def of ALL_SETTINGS_DEFINITIONS) {
    if (!def.cond) continue;

    let wasVisible = false;
    let isVisible = false;
    try {
      wasVisible = Boolean(def.cond(previousSettings));
      isVisible = Boolean(def.cond(normalized));
    } catch {
      continue;
    }

    if (wasVisible || !isVisible) continue;

    const previousValue = previousSettings[def.key];
    const nextValue = normalized[def.key];
    const isUnchanged = areSettingsEqual(previousValue, nextValue);
    if (!isUnchanged) continue;

    normalized[def.key] = deepCloneValue(def.default);
  }

  return normalized;
}

function createRandomSyncId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function getLocalSyncActorId(): string {
  if (typeof window === 'undefined') return createRandomSyncId();
  try {
    const existing = window.sessionStorage.getItem('tlt:sync:actor-id:v1');
    if (existing) return existing;
    const next = createRandomSyncId();
    window.sessionStorage.setItem('tlt:sync:actor-id:v1', next);
    return next;
  } catch {
    return createRandomSyncId();
  }
}

export const useOoTMMSessionStore = defineStore('ootmm-session', () => {
  const syncStatusStore = useSyncStatusStore();
  const tracker = ref<TrackerPack | null>(null);

  function injectEntranceOverridesIntoSettings(
    settings: Record<string, unknown>,
    overrides: Record<string, string>,
  ): Record<string, unknown> {
    // Always strip stale plando.entrances from trackerSettings (the tracker
    // contaminates them with self-mappings during initialization). Then only
    // re-add overrides the user has explicitly set.
    const existingPlando = (settings.plando as Record<string, unknown>) ?? {};
    const { entrances: _stale, ...cleanPlando } = existingPlando;

    const isErActive = getActiveEntranceKeys(settings).size > 0;
    const normalizedOverrides = filterEntranceOverridesForSettings(
      overrides,
      settings,
    );
    const hasOverrides =
      isErActive && Object.keys(normalizedOverrides).length > 0;
    return {
      ...settings,
      plando: {
        ...cleanPlando,
        ...(hasOverrides ? { entrances: { ...normalizedOverrides } } : {}),
      },
    };
  }

  const inventoryById = ref<Record<string, number>>({});
  const collectedLocationIds = ref<string[]>([]);
  const preCompletedDungeons = ref<string[]>([]);
  const junkLocationIds = ref<string[]>([]);
  const autoCollectedPreCompletedLocationIds = ref<string[]>([]);
  const songEvents = ref<Record<string, number>>({});
  const shopPrices = ref<Record<string, number>>({});
  const entranceOverrides = ref<Record<string, string>>({});

  const trackerSettings = ref<Record<string, unknown>>({});

  /**
   * Keys that are tracker-only (not from the OoTMM core) and must be
   * preserved across tracker re-initializations.
   */
  const TRACKER_ONLY_SETTING_KEYS = new Set<string>(['autoMapSwitch']);

  /**
   * Preserve tracker-only keys when applying settings from the tracker.
   * Looks in the previous trackerSettings first, and if not found there,
   * falls back to the `applyContext` (the settings that were sent to the
   * tracker). This ensures newly added tracker-only settings survive the
   * first apply even when not yet present in trackerSettings.
   */
  function preserveTrackerOnlySettings(
    raw: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...raw };
    for (const key of TRACKER_ONLY_SETTING_KEYS) {
      if (key in trackerSettings.value) {
        merged[key] = trackerSettings.value[key];
      } else if (context && key in context) {
        merged[key] = context[key];
      }
    }
    return merged;
  }

  const hasImportedSpoilerLog = ref(false);
  const importedSpoilerLogVersion = ref<string | null>(null);
  const availableItemIds = ref<string[]>([]);
  const itemMaxCountsById = ref<Record<string, number>>({});

  const reachableLocationIds = ref<string[]>([]);
  const reachableEntranceIds = ref<string[]>([]);
  const canComplete = ref(false);
  const statsExtra = ref<Record<string, unknown>>({});
  const locationsVersion = ref(0);
  const isApplyingSettings = ref(false);
  const undoHistory = ref<SessionSnapshot[]>([]);
  const redoHistory = ref<SessionSnapshot[]>([]);
  const isNavigatingHistory = ref(false);
  let syncConnection: OoTMMSessionSyncConnection | null = null;
  let roomConnection: OoTMMRoomSyncConnection | null = null;
  let remoteOperationQueue: Promise<void> = Promise.resolve();
  let pendingRoomOperations: PendingRoomOperation[] = [];
  let pendingRoomReplayQueue: Promise<void> = Promise.resolve();
  let roomSyncGeneration = 0;
  const coopRoomCode = ref<string | null>(null);
  const coopPeerCount = ref(0);
  const coopConnectionState = ref<
    'idle' | 'connecting' | 'connected' | 'disconnected'
  >('idle');

  const inventoryMap = computed(() => recordToMap(inventoryById.value));
  const availableItemIdSet = computed(() => new Set(availableItemIds.value));
  function getEffectiveItemMaxCount(itemId: string, fallbackMax = 1): number {
    const definedMaxCount =
      getGridItemDefinedMaxCount(itemId, {
        availableItemIds: availableItemIdSet.value,
        inventory: inventoryMap.value,
        settings: trackerSettings.value,
      }) ?? 0;

    return Math.max(
      1,
      fallbackMax,
      itemMaxCountsById.value[itemId] ?? 0,
      definedMaxCount,
    );
  }

  const itemMaxCountsMap = computed(() => {
    const next = new Map(Object.entries(itemMaxCountsById.value));
    const itemIds = new Set<string>([
      ...availableItemIds.value,
      ...Object.keys(itemMaxCountsById.value),
      ...Object.keys(inventoryById.value),
    ]);

    for (const itemId of itemIds) {
      next.set(itemId, getEffectiveItemMaxCount(itemId));
    }

    return next;
  });
  const reachableLocationIdSet = computed(
    () => new Set(reachableLocationIds.value),
  );
  const reachableEntranceIdSet = computed(
    () => new Set(reachableEntranceIds.value),
  );
  const preCompletedEnabled = computed(() =>
    Boolean(trackerSettings.value?.preCompletedDungeons),
  );
  // Undo/redo is disabled while in a coop room: it republishes the entire
  // snapshot as authoritative ops, which would clobber concurrent peer edits.
  const canUndo = computed(
    () => coopRoomCode.value === null && undoHistory.value.length > 0,
  );
  const canRedo = computed(
    () => coopRoomCode.value === null && redoHistory.value.length > 0,
  );

  const allLocations = computed(() => {
    void locationsVersion.value;
    return tracker.value?.getAllLocations() ?? [];
  });

  function shouldRecordHistory(options?: MutationOptions): boolean {
    if (typeof options?.recordHistory === 'boolean') {
      return options.recordHistory;
    }
    return options?.source !== 'remote';
  }

  function shouldPublishSync(options?: MutationOptions): boolean {
    if (!syncConnection && !roomConnection) return false;
    return options?.source !== 'remote';
  }

  function captureSnapshotForMutation(
    options?: MutationOptions,
  ): SessionSnapshot | null {
    if (!shouldRecordHistory(options)) return null;
    return captureSessionSnapshot();
  }

  function recordHistoryFromSnapshot(snapshot: SessionSnapshot | null): void {
    if (!snapshot) return;
    recordHistoryEntry(snapshot);
  }

  function trackPendingRoomOperation(
    operation: OoTMMSyncOperation,
  ): PendingRoomOperation {
    const key = pendingRoomOpCompactionKey(operation);
    if (key !== null) {
      pendingRoomOperations = pendingRoomOperations.filter(
        (entry) => pendingRoomOpCompactionKey(entry.op) !== key,
      );
    }
    const entry: PendingRoomOperation = {
      wireOpId: null,
      op: cloneSyncOperation(operation),
    };
    pendingRoomOperations.push(entry);
    return entry;
  }

  function handleRoomOperationAck(wireOpId: string): void {
    pendingRoomOperations = pendingRoomOperations.filter(
      (entry) => entry.wireOpId !== wireOpId,
    );
  }

  function flushPendingRoomOperations(): void {
    if (
      !roomConnection ||
      coopConnectionState.value !== 'connected' ||
      pendingRoomOperations.length === 0
    ) {
      return;
    }

    const activeConnection = roomConnection;
    const activeRoomCode = coopRoomCode.value;
    const activeGeneration = roomSyncGeneration;
    // Entries stay in pendingRoomOperations until their echo acks them, so an
    // aborted or failed replay needs no re-queue bookkeeping — whatever wasn't
    // acked is still there for the next flush.
    const entries = [...pendingRoomOperations];

    pendingRoomReplayQueue = pendingRoomReplayQueue
      .then(async () => {
        for (const [replayIndex, entry] of entries.entries()) {
          if (roomSyncGeneration !== activeGeneration) return;
          if (
            roomConnection !== activeConnection ||
            coopConnectionState.value !== 'connected'
          ) {
            return;
          }
          // Acked or superseded (compacted away by a newer same-field edit)
          // while earlier entries were replaying.
          if (!pendingRoomOperations.includes(entry)) continue;

          // Re-apply locally first: the reconnect snapshot may have reverted
          // this edit. Ops are idempotent, so re-applying one the room already
          // folded in is harmless.
          await applyRemoteOperation({
            schema: 1,
            sessionId: activeRoomCode ?? '',
            opId: `pending-room:${Date.now()}:${replayIndex}`,
            actorId: getLocalSyncActorId(),
            lamport: 0,
            ts: Date.now(),
            op: entry.op,
          });
          if (roomSyncGeneration !== activeGeneration) return;
          if (roomConnection !== activeConnection) return;
          entry.wireOpId = activeConnection.publish(entry.op);
        }
      })
      .catch((error) => {
        console.error('[OoTMM Sync] Failed to replay queued room ops:', error);
      });
  }

  function publishSyncOperation(
    operation: OoTMMSyncOperation,
    options?: MutationOptions,
  ): void {
    if (!shouldPublishSync(options)) return;
    syncConnection?.publish(operation);
    // `session.reset_defaults` is intentionally never a room op: the relay has
    // no reset op (it would drop the connection), and resetting exits coop only
    // through the UI's confirmation modal — never silently from the store.
    if (operation.type === 'session.reset_defaults' || !roomConnection) return;
    // Track before sending, and keep the entry queued until the relay's echo
    // acks it. A send onto a CLOSING socket, a socket that dies with the op in
    // flight, and a server killed before persisting the op all leave the entry
    // unacked, so the reconnect flush replays it on top of the room snapshot.
    const entry = trackPendingRoomOperation(operation);
    entry.wireOpId = roomConnection.publish(operation);
  }

  function publishSnapshotAsOps(snapshot: SessionSnapshot): void {
    if (!shouldPublishSync()) return;
    // Never replay a whole snapshot into a coop room: it would overwrite every
    // peer's concurrent edits with this client's full state. Undo/redo (the
    // only callers) are already disabled in coop via canUndo/canRedo, but guard
    // here too so the invariant doesn't depend on those computeds.
    if (coopRoomCode.value !== null) return;
    publishSyncOperation({
      type: 'settings.apply',
      settings: cloneSettingsRecord(snapshot.trackerSettings),
    });
    publishSyncOperation({
      type: 'world.set_entrance_overrides',
      overrides: { ...snapshot.entranceOverrides },
    });
    publishSyncOperation({
      type: 'world.set_precompleted',
      ids: [...snapshot.preCompletedDungeons],
    });
    publishSyncOperation({
      type: 'world.set_song_events',
      events: { ...snapshot.songEvents },
    });
    publishSyncOperation({
      type: 'world.set_shop_prices',
      prices: { ...snapshot.shopPrices },
    });
    publishSyncOperation({
      type: 'inventory.set_full',
      inventoryById: { ...snapshot.inventoryById },
    });
    publishSyncOperation({
      type: 'locations.set_ids',
      ids: [...snapshot.collectedLocationIds],
    });
    publishSyncOperation({
      type: 'locations.set_junk_ids',
      ids: [...snapshot.junkLocationIds],
    });
    publishSyncOperation({
      type: 'session.set_spoiler_log_state',
      imported: snapshot.hasImportedSpoilerLog,
      ootmmVersion: snapshot.importedSpoilerLogVersion,
    });
  }

  function captureSessionSnapshot(): SessionSnapshot {
    return {
      inventoryById: sanitizeInventoryRecord({ ...inventoryById.value }),
      collectedLocationIds: [...collectedLocationIds.value],
      preCompletedDungeons: [...preCompletedDungeons.value],
      junkLocationIds: [...junkLocationIds.value],
      songEvents: { ...songEvents.value },
      shopPrices: { ...shopPrices.value },
      trackerSettings: cloneSettingsRecord(trackerSettings.value),
      entranceOverrides: { ...entranceOverrides.value },
      hasImportedSpoilerLog: hasImportedSpoilerLog.value,
      importedSpoilerLogVersion: importedSpoilerLogVersion.value,
    };
  }

  function applyVanillaSilverRupeeCounts(counts: Record<string, number>) {
    const next = { ...inventoryById.value };
    let changed = false;

    for (const itemId of Object.keys(next)) {
      if (itemId.startsWith(VANILLA_SILVER_RUPEE_PREFIX)) {
        delete next[itemId];
        changed = true;
      }
    }

    for (const [itemId, count] of Object.entries(counts)) {
      if (!itemId.startsWith(VANILLA_SILVER_RUPEE_PREFIX)) continue;
      const safeCount = Math.floor(Number(count));
      if (safeCount > 0) {
        next[itemId] = safeCount;
        changed = true;
      }
    }

    if (changed) {
      inventoryById.value = sanitizeInventoryRecord(next);
    }
  }

  function snapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
    return areSettingsEqual(a, b);
  }

  function clearHistory() {
    undoHistory.value = [];
    redoHistory.value = [];
  }

  // Remote operations must not be applied while a *local* settings-apply is
  // re-initializing the tracker: several handlers (special-conds, song events,
  // shop prices, even a nested settings.apply) intentionally no-op while
  // isApplyingSettings is true, so an op processed in that window would be
  // silently dropped and this client would diverge from the room. Defer such
  // ops until the window closes, then apply them in their original order.
  let settingsApplyIdleWaiters: Array<() => void> = [];
  watch(
    isApplyingSettings,
    (applying) => {
      if (applying || settingsApplyIdleWaiters.length === 0) return;
      const waiters = settingsApplyIdleWaiters;
      settingsApplyIdleWaiters = [];
      for (const resolve of waiters) resolve();
    },
    { flush: 'sync' },
  );

  function whenSettingsApplyIdle(): Promise<void> {
    if (!isApplyingSettings.value) return Promise.resolve();
    return new Promise<void>((resolve) => {
      settingsApplyIdleWaiters.push(resolve);
    });
  }

  async function applyRemoteOperation(
    envelope: OoTMMSyncOperationEnvelope,
  ): Promise<void> {
    // A remote op may be dequeued while a local applySettings holds the tracker
    // mid-reinitialization; wait it out so the op is applied, not dropped.
    await whenSettingsApplyIdle();
    switch (envelope.op.type) {
      case 'inventory.set_full': {
        setInventoryFromMap(
          new Map(Object.entries(envelope.op.inventoryById)),
          REMOTE_MUTATION_OPTIONS,
        );
        return;
      }
      case 'inventory.set_count': {
        setInventoryCount(
          envelope.op.itemId,
          envelope.op.count,
          REMOTE_MUTATION_OPTIONS,
        );
        return;
      }
      case 'locations.set_collected': {
        const next = new Set(collectedLocationIds.value);
        if (envelope.op.collected) {
          next.add(envelope.op.locationId);
        } else {
          next.delete(envelope.op.locationId);
        }
        setCollectedLocationIds(Array.from(next), REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'locations.set_ids': {
        setCollectedLocationIds(envelope.op.ids, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'locations.set_junk_ids': {
        setJunkLocationIds(envelope.op.ids, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'world.set_precompleted': {
        setPreCompletedDungeons(envelope.op.ids, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'world.set_song_events': {
        setSongEvents(envelope.op.events, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'world.set_shop_prices': {
        setShopPrices(envelope.op.prices, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'world.set_shop_price': {
        const price = envelope.op.price;
        if (price === null) {
          setShopPriceForLocation(
            envelope.op.locationId,
            Number.NaN,
            REMOTE_MUTATION_OPTIONS,
          );
        } else {
          setShopPriceForLocation(
            envelope.op.locationId,
            price,
            REMOTE_MUTATION_OPTIONS,
          );
        }
        return;
      }
      case 'settings.apply': {
        await applySettings(envelope.op.settings, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'settings.patch_special_conds': {
        applySpecialCondsPatch(envelope.op.patch, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'world.set_entrance_override': {
        setEntranceOverride(
          envelope.op.src,
          envelope.op.dst,
          REMOTE_MUTATION_OPTIONS,
        );
        return;
      }
      case 'world.set_entrance_overrides': {
        setEntranceOverrides(envelope.op.overrides, REMOTE_MUTATION_OPTIONS);
        return;
      }
      case 'session.set_spoiler_log_state': {
        setSpoilerLogImportState(
          envelope.op.imported,
          envelope.op.ootmmVersion,
          REMOTE_MUTATION_OPTIONS,
        );
        return;
      }
      case 'session.reset_defaults': {
        await resetSessionStateToDefaults(REMOTE_MUTATION_OPTIONS);
      }
    }
  }

  function enqueueRemoteOperation(envelope: OoTMMSyncOperationEnvelope): void {
    remoteOperationQueue = remoteOperationQueue
      .then(() => applyRemoteOperation(envelope))
      .catch((error) => {
        console.error('[OoTMM Sync] Failed to apply remote operation:', error);
      });
  }

  // Run snapshot import on the same queue as remote ops so the two can never
  // interleave at await points (e.g. a stale op still draining when a reconnect
  // snapshot lands). The snapshot is chained last, so it stays authoritative.
  function enqueueRoomSnapshot(
    snapshot: OoTMMRoomSnapshotEnvelope,
  ): Promise<void> {
    remoteOperationQueue = remoteOperationQueue
      .then(() => applyRoomSnapshot(snapshot))
      .catch((error) => {
        console.error('[OoTMM Sync] Failed to apply room snapshot:', error);
      });
    return remoteOperationQueue;
  }

  function startLocalSessionSync(sessionId = OOTMM_LOCAL_SESSION_ID): void {
    if (typeof window === 'undefined') return;
    if (syncConnection) return;

    syncConnection = createOoTMMLocalSessionSync({
      sessionId,
      actorId: getLocalSyncActorId(),
      callbacks: {
        onRemoteOperation: enqueueRemoteOperation,
        onPresenceChange: (peerCount) => {
          syncStatusStore.setOtherTabCount(peerCount);
        },
        onRemoteActivity: () => {
          syncStatusStore.markSyncReceived();
        },
      },
    });
  }

  function stopLocalSessionSync(): void {
    if (!syncConnection) return;
    syncConnection.disconnect();
    syncConnection = null;
    syncStatusStore.resetSyncStatus();
  }

  function captureRoomSnapshotEnvelope(
    roomId: string,
  ): OoTMMRoomSnapshotEnvelope {
    return {
      protocolSchema: 1,
      stateSchema: 1,
      stateType: 'ootmm-session',
      sessionId: roomId,
      baselineSeq: 0,
      capturedAt: Date.now(),
      state: {
        inventoryById: sanitizeInventoryRecord({ ...inventoryById.value }),
        collectedLocationIds: [...collectedLocationIds.value],
        junkLocationIds: [...junkLocationIds.value],
        preCompletedDungeons: [...preCompletedDungeons.value],
        songEvents: { ...songEvents.value },
        shopPrices: { ...shopPrices.value },
        trackerSettings: cloneSettingsRecord(trackerSettings.value),
        entranceOverrides: { ...entranceOverrides.value },
        hasImportedSpoilerLog: hasImportedSpoilerLog.value,
        importedSpoilerLogVersion: importedSpoilerLogVersion.value,
      },
    };
  }

  async function applyRoomSnapshot(
    snapshot: OoTMMRoomSnapshotEnvelope,
  ): Promise<void> {
    const state = snapshot.state;
    if (state.trackerSettings && typeof state.trackerSettings === 'object') {
      await applySettings(state.trackerSettings, REMOTE_MUTATION_OPTIONS);
    }
    setEntranceOverrides(
      state.entranceOverrides ?? {},
      REMOTE_MUTATION_OPTIONS,
    );
    setPreCompletedDungeons(
      state.preCompletedDungeons ?? [],
      REMOTE_MUTATION_OPTIONS,
    );
    setSongEvents(state.songEvents ?? {}, REMOTE_MUTATION_OPTIONS);
    setShopPrices(state.shopPrices ?? {}, REMOTE_MUTATION_OPTIONS);
    setInventoryFromMap(
      new Map(Object.entries(state.inventoryById ?? {})),
      REMOTE_MUTATION_OPTIONS,
    );
    setCollectedLocationIds(
      state.collectedLocationIds ?? [],
      REMOTE_MUTATION_OPTIONS,
    );
    setJunkLocationIds(state.junkLocationIds ?? [], REMOTE_MUTATION_OPTIONS);
    setSpoilerLogImportState(
      Boolean(state.hasImportedSpoilerLog),
      state.importedSpoilerLogVersion ?? null,
      REMOTE_MUTATION_OPTIONS,
    );
  }

  function startRoomSync(options: { roomCode: string; url?: string }): void {
    if (typeof window === 'undefined') return;
    const trimmed = options.roomCode.trim();
    if (!isValidCoopRoomCode(trimmed)) return;
    if (roomConnection) stopRoomSync();
    roomSyncGeneration += 1;
    pendingRoomOperations = [];

    // Room mode is server-authoritative: don't also run the local cross-tab
    // broadcast, or the same edit reaches other tabs twice (via BroadcastChannel
    // and via the relay) under two different opIds. Same-browser tabs still sync
    // through the relay, each as its own peer.
    stopLocalSessionSync();

    coopRoomCode.value = trimmed;
    coopConnectionState.value = 'connecting';
    coopPeerCount.value = 0;
    syncStatusStore.setCoopRoomActive(true);
    syncStatusStore.setCoopRoomCode(trimmed);

    roomConnection = createOoTMMRoomSessionSync({
      url: options.url ?? defaultRoomSyncUrl(),
      roomId: trimmed,
      roomKey: trimmed,
      actorId: getLocalSyncActorId(),
      captureSeedSnapshot: () => captureRoomSnapshotEnvelope(trimmed),
      callbacks: {
        onRemoteOperation: enqueueRemoteOperation,
        onSnapshot: enqueueRoomSnapshot,
        onOperationAck: handleRoomOperationAck,
        onPresenceChange: (peerCount) => {
          coopPeerCount.value = peerCount;
          syncStatusStore.setCoopPeerCount(peerCount);
        },
        onRemoteActivity: () => {
          syncStatusStore.markSyncReceived();
        },
        onConnectionChange: (state) => {
          coopConnectionState.value = state;
          if (state === 'connected') {
            flushPendingRoomOperations();
          }
        },
      },
    });
  }

  function stopRoomSync(): void {
    if (!roomConnection) return;
    roomConnection.disconnect();
    roomConnection = null;
    roomSyncGeneration += 1;
    pendingRoomOperations = [];
    coopPeerCount.value = 0;
    coopConnectionState.value = 'idle';
    syncStatusStore.setCoopPeerCount(0);
    syncStatusStore.setCoopRoomActive(false);
    // Resume local cross-tab sync now that we're no longer room-authoritative.
    startLocalSessionSync();
  }

  function leaveRoom(): void {
    stopRoomSync();
    coopRoomCode.value = null;
    syncStatusStore.setCoopRoomCode(null);
  }

  function pushUndoSnapshot(snapshot: SessionSnapshot) {
    const next = [...undoHistory.value, snapshot];
    if (next.length > HISTORY_LIMIT) {
      next.splice(0, next.length - HISTORY_LIMIT);
    }
    undoHistory.value = next;
  }

  function pushRedoSnapshot(snapshot: SessionSnapshot) {
    const next = [...redoHistory.value, snapshot];
    if (next.length > HISTORY_LIMIT) {
      next.splice(0, next.length - HISTORY_LIMIT);
    }
    redoHistory.value = next;
  }

  function recordHistoryEntry(previousSnapshot: SessionSnapshot) {
    if (isNavigatingHistory.value) return;
    const currentSnapshot = captureSessionSnapshot();
    if (snapshotsEqual(previousSnapshot, currentSnapshot)) return;
    pushUndoSnapshot(previousSnapshot);
    redoHistory.value = [];
  }

  async function restoreSnapshot(snapshot: SessionSnapshot): Promise<boolean> {
    if (isApplyingSettings.value) return false;
    const currentTracker = tracker.value;

    const targetInventoryById = sanitizeInventoryRecord({
      ...snapshot.inventoryById,
    });
    const targetCollectedLocationIds = uniqueStrings(
      snapshot.collectedLocationIds,
    );
    const targetPreCompletedDungeons = uniqueStrings(
      snapshot.preCompletedDungeons,
    );
    const targetSongEvents = { ...snapshot.songEvents };
    const targetShopPrices = sanitizeNonNegativeNumberRecord({
      ...snapshot.shopPrices,
    });
    const targetSettings = cloneSettingsRecord(snapshot.trackerSettings);
    const targetEntranceOverrides = snapshot.entranceOverrides
      ? { ...snapshot.entranceOverrides }
      : {};
    const targetHasImportedSpoilerLog = Boolean(snapshot.hasImportedSpoilerLog);
    const targetImportedSpoilerLogVersion = targetHasImportedSpoilerLog
      ? normalizeSpoilerLogVersion(snapshot.importedSpoilerLogVersion)
      : null;

    isNavigatingHistory.value = true;
    try {
      if (!currentTracker) {
        inventoryById.value = targetInventoryById;
        collectedLocationIds.value = targetCollectedLocationIds;
        preCompletedDungeons.value = targetPreCompletedDungeons;
        junkLocationIds.value = targetHasImportedSpoilerLog
          ? uniqueStrings(snapshot.junkLocationIds ?? [])
          : [];
        autoCollectedPreCompletedLocationIds.value = [];
        songEvents.value = targetSongEvents;
        shopPrices.value = targetShopPrices;
        trackerSettings.value = targetSettings;
        entranceOverrides.value = targetEntranceOverrides;
        hasImportedSpoilerLog.value = targetHasImportedSpoilerLog;
        importedSpoilerLogVersion.value = targetImportedSpoilerLogVersion;
        reachableLocationIds.value = [];
        reachableEntranceIds.value = [];
        canComplete.value = false;
        statsExtra.value = {};
        return true;
      }

      const requiresSettingsReinitialize =
        !areSettingsEqual(trackerSettings.value, targetSettings) ||
        !areSettingsEqual(entranceOverrides.value, targetEntranceOverrides);
      if (requiresSettingsReinitialize) {
        isApplyingSettings.value = true;
        try {
          await nextTick();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          currentTracker.reset();
          const settingsWithEntrances = injectEntranceOverridesIntoSettings(
            targetSettings,
            targetEntranceOverrides,
          );
          await currentTracker.initialize(settingsWithEntrances);
          trackerSettings.value = preserveTrackerOnlySettings(
            { ...currentTracker.getSettings() },
            targetSettings,
          );
          availableItemIds.value = setToArray(
            currentTracker.getAvailableItemIds?.() ?? new Set<string>(),
          );
          itemMaxCountsById.value = mapNumberToRecord(
            currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
          );
          locationsVersion.value += 1;
        } finally {
          isApplyingSettings.value = false;
        }
      } else {
        trackerSettings.value = cloneSettingsRecord(targetSettings);
      }

      preCompletedDungeons.value = targetPreCompletedDungeons;
      junkLocationIds.value = targetHasImportedSpoilerLog
        ? uniqueStrings(snapshot.junkLocationIds ?? [])
        : [];
      autoCollectedPreCompletedLocationIds.value = [];
      songEvents.value = targetSongEvents;
      shopPrices.value = targetShopPrices;
      entranceOverrides.value = targetEntranceOverrides;
      hasImportedSpoilerLog.value = targetHasImportedSpoilerLog;
      importedSpoilerLogVersion.value = targetImportedSpoilerLogVersion;
      applyPreCompletedDungeons();
      applySongEvents();
      applyShopPrices();
      inventoryById.value = targetInventoryById;
      collectedLocationIds.value = targetCollectedLocationIds;
      recomputeReachability();
      return true;
    } catch (error) {
      console.error('Failed to restore undo/redo snapshot:', error);
      return false;
    } finally {
      isNavigatingHistory.value = false;
    }
  }

  async function undo() {
    if (!canUndo.value || isApplyingSettings.value) return;
    const targetSnapshot = undoHistory.value[undoHistory.value.length - 1];
    if (!targetSnapshot) return;
    const currentSnapshot = captureSessionSnapshot();
    const restored = await restoreSnapshot(targetSnapshot);
    if (!restored) return;
    undoHistory.value = undoHistory.value.slice(0, -1);
    pushRedoSnapshot(currentSnapshot);
    publishSnapshotAsOps(targetSnapshot);
  }

  async function redo() {
    if (!canRedo.value || isApplyingSettings.value) return;
    const targetSnapshot = redoHistory.value[redoHistory.value.length - 1];
    if (!targetSnapshot) return;
    const currentSnapshot = captureSessionSnapshot();
    const restored = await restoreSnapshot(targetSnapshot);
    if (!restored) return;
    redoHistory.value = redoHistory.value.slice(0, -1);
    pushUndoSnapshot(currentSnapshot);
    publishSnapshotAsOps(targetSnapshot);
  }

  async function attachTracker(
    nextTracker: TrackerPack,
    options?: { deferInit?: boolean },
  ) {
    clearHistory();
    tracker.value = markRaw(nextTracker) as TrackerPack;
    if (options?.deferInit) {
      // Caller (coop auto-join) will drive initialize() via the room snapshot's
      // applySettings, so skip the persisted-state init to avoid a double init.
      return;
    }
    const shouldCheckImportedShareSettings = hasPendingShareImportCheck();
    const persistedSettings = cloneSettingsRecord(trackerSettings.value);
    const hasPersistedSettings = Object.keys(persistedSettings).length > 0;
    const targetSettings = hasPersistedSettings
      ? persistedSettings
      : cloneSettingsRecord(TRACKER_DEFAULT_SETTINGS);
    const currentSettings = nextTracker.getSettings();
    const shouldReinitializeWithTargetSettings =
      !areSettingsEqual(targetSettings, currentSettings) ||
      Object.keys(entranceOverrides.value).length > 0;
    if (shouldReinitializeWithTargetSettings) {
      isApplyingSettings.value = true;
      const settingsWithEntrances = injectEntranceOverridesIntoSettings(
        targetSettings,
        entranceOverrides.value,
      );
      try {
        await nextTick();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await nextTracker.initialize(settingsWithEntrances);
      } catch (error) {
        console.error('Failed to initialize tracker settings:', error);
        let recoveredWithEntrances = false;

        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            nextTracker.reset();
            await nextTracker.initialize(settingsWithEntrances);
            recoveredWithEntrances = true;
            break;
          } catch (retryError) {
            console.warn(
              `Retry ${attempt + 1} failed to initialize tracker settings with persisted entrance overrides:`,
              retryError,
            );
          }
        }

        if (!recoveredWithEntrances) {
          console.error(
            'Failed to recover tracker settings with persisted entrance overrides.',
          );
          try {
            nextTracker.reset();
            await nextTracker.initialize(targetSettings);
            if (Object.keys(entranceOverrides.value).length > 0) {
              scheduleReinitializeForEntrances();
            }
          } catch (fallbackError) {
            console.error(
              'Failed to recover tracker settings after initialization error:',
              fallbackError,
            );
          }
        }
      } finally {
        isApplyingSettings.value = false;
      }
    }
    trackerSettings.value = preserveTrackerOnlySettings(
      { ...nextTracker.getSettings() },
      targetSettings,
    );
    if (shouldCheckImportedShareSettings) {
      const importedSettings = stripPlandoEntrances(targetSettings);
      const canonicalSettings = stripPlandoEntrances(trackerSettings.value);
      if (!areSettingsEqual(importedSettings, canonicalSettings)) {
        publishShareStatusMessage(SHARE_PARTIAL_IMPORT_MESSAGE);
      }
      clearPendingShareImportCheck();
    }
    availableItemIds.value = setToArray(
      nextTracker.getAvailableItemIds?.() ?? new Set<string>(),
    );
    itemMaxCountsById.value = mapNumberToRecord(
      nextTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
    );
    applyPreCompletedDungeons();
    applySongEvents();
    applyShopPrices();
    recomputeReachability();
  }

  function initializeFromTracker() {
    if (!tracker.value) return;
    trackerSettings.value = preserveTrackerOnlySettings({
      ...tracker.value.getSettings(),
    });
    availableItemIds.value = setToArray(
      tracker.value.getAvailableItemIds?.() ?? new Set<string>(),
    );
    itemMaxCountsById.value = mapNumberToRecord(
      tracker.value.getItemMaxCounts?.() ?? new Map<string, number>(),
    );
    recomputeReachability();
  }

  function setInventoryFromMap(
    newInventory: Map<string, number>,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    inventoryById.value = sanitizeInventoryRecord(mapToRecord(newInventory));
    recomputeReachability();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'inventory.set_full',
        inventoryById: { ...inventoryById.value },
      },
      options,
    );
  }

  function setInventoryCount(
    itemId: string,
    count: number,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    const next = { ...inventoryById.value };
    const safeCount = Math.max(0, Math.floor(count));
    if (safeCount > 0) {
      next[itemId] = safeCount;

      // Synthesize cross-game counterpart item if applicable
      // (OoT↔MM CrossWarp songs)
      const counterpart = getCrossWarpCounterpart(
        itemId,
        trackerSettings.value as Record<string, unknown>,
      );
      if (counterpart && !next[counterpart]) {
        next[counterpart] = 1;
      }
    } else {
      delete next[itemId];
    }
    inventoryById.value = sanitizeInventoryRecord(next);
    recomputeReachability();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'inventory.set_count',
        itemId,
        count: inventoryById.value[itemId] ?? 0,
      },
      options,
    );
  }

  function incrementItem(
    itemId: string,
    fallbackMax = 1,
    options?: MutationOptions,
  ) {
    const current = inventoryById.value[itemId] ?? 0;
    const max = getEffectiveItemMaxCount(itemId, fallbackMax);
    if (current >= max) return;
    setInventoryCount(itemId, current + 1, options);
  }

  function decrementItem(itemId: string, options?: MutationOptions) {
    const current = inventoryById.value[itemId] ?? 0;
    if (current <= 0) return;
    setInventoryCount(itemId, current - 1, options);
  }

  function toggleItem(
    itemId: string,
    fallbackMax = 1,
    options?: MutationOptions,
  ) {
    const current = inventoryById.value[itemId] ?? 0;
    if (current > 0) {
      setInventoryCount(itemId, 0, options);
      return;
    }
    incrementItem(itemId, fallbackMax, options);
  }

  function mergeInventoryCounts(
    countsById: Record<string, number>,
    options?: MutationOptions,
  ) {
    const next = new Map(inventoryMap.value);
    for (const [itemId, count] of Object.entries(countsById)) {
      if (count <= 0) continue;
      const current = next.get(itemId) ?? 0;
      next.set(itemId, Math.max(current, Math.floor(count)));
    }
    setInventoryFromMap(next, options);
  }

  function applyAutotrackerDelta(
    newInventory: Map<string, number>,
    ids: string[],
    options: MutationOptions = AUTOTRACKER_MUTATION_OPTIONS,
  ) {
    const nextInventoryById = sanitizeInventoryRecord(
      mapToRecord(newInventory),
    );
    const nextCollectedLocationIds = uniqueStrings(ids);
    const inventoryChanged = !areSettingsEqual(
      inventoryById.value,
      nextInventoryById,
    );
    const collectedLocationsChanged = !areStringSetsEqual(
      collectedLocationIds.value,
      nextCollectedLocationIds,
    );

    if (!inventoryChanged && !collectedLocationsChanged) {
      return;
    }

    const previousSnapshot = captureSnapshotForMutation(options);

    if (inventoryChanged) {
      inventoryById.value = nextInventoryById;
      recomputeReachability();
    }

    if (collectedLocationsChanged) {
      collectedLocationIds.value = nextCollectedLocationIds;
    }

    recordHistoryFromSnapshot(previousSnapshot);

    if (inventoryChanged) {
      publishSyncOperation(
        {
          type: 'inventory.set_full',
          inventoryById: { ...inventoryById.value },
        },
        options,
      );
    }

    if (collectedLocationsChanged) {
      publishSyncOperation(
        {
          type: 'locations.set_ids',
          ids: [...collectedLocationIds.value],
        },
        options,
      );
    }
  }

  function toggleCollectedLocation(
    locationId: string,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    const next = new Set(collectedLocationIds.value);
    let collected = false;
    if (next.has(locationId)) {
      next.delete(locationId);
    } else {
      next.add(locationId);
      collected = true;
    }
    collectedLocationIds.value = Array.from(next);
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'locations.set_collected',
        locationId,
        collected,
      },
      options,
    );
  }

  function setCollectedLocationIds(ids: string[], options?: MutationOptions) {
    const previousSnapshot = captureSnapshotForMutation(options);
    collectedLocationIds.value = uniqueStrings(ids);
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'locations.set_ids',
        ids: [...collectedLocationIds.value],
      },
      options,
    );
  }

  // Junk locations are derived from a spoiler-log import (one player imports the
  // log; the resolved ids are a whole-list batch, not concurrently edited
  // per-id), so a whole-list replace op is fine here — unlike collectLocationIds
  // which must stay granular to avoid clobbering peers' concurrent collects.
  function setJunkLocationIds(ids: string[], options?: MutationOptions) {
    const next = uniqueStrings(ids);
    if (areStringSetsEqual(junkLocationIds.value, next)) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    junkLocationIds.value = next;
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'locations.set_junk_ids',
        ids: [...junkLocationIds.value],
      },
      options,
    );
  }

  // Additively mark locations collected, emitting a granular `locations.
  // set_collected` per newly-added id. Use this for "mark all reachable"-style
  // bulk *adds*: emitting `locations.set_ids` (a whole-list replace) would
  // clobber a peer's concurrent collect at the relay (lost update), whereas
  // granular collects merge and converge.
  function collectLocationIds(ids: string[], options?: MutationOptions) {
    const next = new Set(collectedLocationIds.value);
    const added: string[] = [];
    for (const id of ids) {
      if (!id || next.has(id)) continue;
      next.add(id);
      added.push(id);
    }
    if (added.length === 0) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    collectedLocationIds.value = Array.from(next);
    recordHistoryFromSnapshot(previousSnapshot);
    for (const id of added) {
      publishSyncOperation(
        {
          type: 'locations.set_collected',
          locationId: id,
          collected: true,
        },
        options,
      );
    }
  }

  function setPreCompletedDungeons(ids: string[], options?: MutationOptions) {
    const previousSnapshot = captureSnapshotForMutation(options);
    preCompletedDungeons.value = uniqueStrings(ids);
    applyPreCompletedDungeons();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_precompleted',
        ids: [...preCompletedDungeons.value],
      },
      options,
    );
  }

  function setSongEvents(
    events: Record<string, number>,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    songEvents.value = { ...events };
    applySongEvents();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_song_events',
        events: { ...songEvents.value },
      },
      options,
    );
  }

  function setShopPrices(
    prices: Record<string, number>,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    shopPrices.value = sanitizeNonNegativeNumberRecord({ ...prices });
    applyShopPrices();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_shop_prices',
        prices: { ...shopPrices.value },
      },
      options,
    );
  }

  function setShopPriceForLocation(
    locationId: string,
    price: number,
    options?: MutationOptions,
  ) {
    if (!locationId) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    const next = { ...shopPrices.value };
    const safePrice = Math.max(0, Math.floor(Number(price)));
    if (!Number.isFinite(safePrice)) {
      delete next[locationId];
    } else {
      next[locationId] = safePrice;
    }
    shopPrices.value = sanitizeNonNegativeNumberRecord(next);
    applyShopPrices();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_shop_price',
        locationId,
        price: Number.isFinite(safePrice) ? safePrice : null,
      },
      options,
    );
  }

  function setEntranceOverride(
    src: string,
    dst: string | null,
    options?: MutationOptions,
  ) {
    if (!src) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    const next = { ...entranceOverrides.value };
    const decoupled = Boolean(trackerSettings.value?.erDecoupled);

    // Coupling is re-derived per client, but the relay stores single edges and
    // has no coupling concept. Mirror the coupled partner edge to the relay as a
    // second op so its per-key snapshot stays consistent — otherwise a coupled
    // *delete* issued from the reverse side leaves the forward edge alive in the
    // snapshot and a late joiner re-couples a pair every live peer deleted.
    let partnerOp: { src: string; dst: string | null } | null = null;

    if (dst === null || dst === '') {
      // Also remove the coupled reverse entry before deleting src.
      const oldDst = entranceOverrides.value[src];
      if (oldDst && !decoupled) {
        const partner = computeCoupledReverse(src, oldDst);
        if (partner && next[partner.reverseSrc] !== undefined) {
          delete next[partner.reverseSrc];
          partnerOp = { src: partner.reverseSrc, dst: null };
        }
      }
      delete next[src];
    } else {
      next[src] = dst;
      // Idempotent coupling: set the reverse edge if not already correct.
      // Skip entirely when decoupled.
      if (!decoupled) {
        const partner = computeCoupledReverse(src, dst);
        if (partner) {
          const existingPartnerDst = next[partner.reverseSrc];
          if (existingPartnerDst !== partner.reverseDst) {
            next[partner.reverseSrc] = partner.reverseDst;
          }
          partnerOp = { src: partner.reverseSrc, dst: partner.reverseDst };
        }
      }
    }

    entranceOverrides.value = next;
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_entrance_override',
        src,
        dst,
      },
      options,
    );
    if (partnerOp) {
      publishSyncOperation(
        {
          type: 'world.set_entrance_override',
          src: partnerOp.src,
          dst: partnerOp.dst,
        },
        options,
      );
    }
    scheduleReinitializeForEntrances();
  }

  function setEntranceOverrides(
    overrides: Record<string, string>,
    options?: MutationOptions,
  ) {
    const previousSnapshot = captureSnapshotForMutation(options);
    const decoupled = Boolean(trackerSettings.value?.erDecoupled);

    let result: Record<string, string>;
    if (decoupled) {
      // No coupling — use overrides as-is.
      result = { ...overrides };
    } else {
      // Fill in missing reverse edges in-place (idempotent).
      const coupled = { ...overrides };
      for (const [src, dst] of Object.entries(overrides)) {
        const partner = computeCoupledReverse(src, dst);
        if (partner && !(partner.reverseSrc in coupled)) {
          coupled[partner.reverseSrc] = partner.reverseDst;
        }
      }
      result = coupled;
    }
    entranceOverrides.value = result;
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'world.set_entrance_overrides',
        overrides: { ...overrides },
      },
      options,
    );
    scheduleReinitializeForEntrances();
  }

  function setSpoilerLogImportState(
    imported: boolean,
    ootmmVersion: string | null,
    options?: MutationOptions,
  ) {
    const normalizedImported = Boolean(imported);
    const normalizedVersion = normalizedImported
      ? normalizeSpoilerLogVersion(ootmmVersion)
      : null;

    if (
      hasImportedSpoilerLog.value === normalizedImported &&
      importedSpoilerLogVersion.value === normalizedVersion
    ) {
      return;
    }

    const previousSnapshot = captureSnapshotForMutation(options);
    hasImportedSpoilerLog.value = normalizedImported;
    importedSpoilerLogVersion.value = normalizedVersion;
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'session.set_spoiler_log_state',
        imported: normalizedImported,
        ootmmVersion: normalizedVersion,
      },
      options,
    );
  }

  let reinitEntrancesTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReinitializeForEntrances() {
    if (reinitEntrancesTimer !== null) clearTimeout(reinitEntrancesTimer);
    reinitEntrancesTimer = setTimeout(() => {
      reinitEntrancesTimer = null;
      reinitializeForEntrances();
    }, 350);
  }

  async function reinitializeForEntrances() {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    if (!currentTracker) return;

    isApplyingSettings.value = true;
    try {
      await nextTick();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      currentTracker.reset();
      const settingsWithEntrances = injectEntranceOverridesIntoSettings(
        trackerSettings.value,
        entranceOverrides.value,
      );
      await currentTracker.initialize(settingsWithEntrances);
      trackerSettings.value = preserveTrackerOnlySettings({
        ...currentTracker.getSettings(),
      });
      availableItemIds.value = setToArray(
        currentTracker.getAvailableItemIds?.() ?? new Set<string>(),
      );
      itemMaxCountsById.value = mapNumberToRecord(
        currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
      );
      applyPreCompletedDungeons();
      // Force song events and shop prices to be applied even though
      // isApplyingSettings is true.  During entrance reinitialization
      // the tracker is fully initialized and the UI state is stable,
      // so the usual race-condition concerns for reload do not apply.
      // Skipping these calls corrupts the pathfinder state because
      // applyPreCompletedDungeons already replaces the pathfinder (with
      // empty starting items), and without applySongEvents the worlds'
      // songEvents and the pathfinder reference are left stale.
      applySongEvents(true);
      applyShopPrices(true);
      recomputeReachability();
    } catch (error) {
      console.error('Failed to reinitialize for entrance overrides:', error);
    } finally {
      isApplyingSettings.value = false;
    }
  }

  function applyPreCompletedDungeons() {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setPreCompletedDungeons) return;
    const selected = preCompletedEnabled.value
      ? preCompletedDungeons.value
      : [];
    currentTracker.setPreCompletedDungeons(selected);

    const previousAuto = new Set(autoCollectedPreCompletedLocationIds.value);
    const nextCollected = new Set(collectedLocationIds.value);
    previousAuto.forEach((locationId) => nextCollected.delete(locationId));

    const nextAuto = new Set(
      currentTracker.getPreCompletedLocationIds?.() ?? [],
    );
    nextAuto.forEach((locationId) => nextCollected.add(locationId));

    autoCollectedPreCompletedLocationIds.value = Array.from(nextAuto);
    collectedLocationIds.value = Array.from(nextCollected);

    locationsVersion.value += 1;
    recomputeReachability();
  }

  function applySongEvents(forceDuringSettingsApply = false) {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setSongEvents) return;
    if (isApplyingSettings.value && !forceDuringSettingsApply) {
      // During tracker re-initialization, immediate UI watchers can fire before
      // the tracker is fully initialized with persisted settings/state.
      // Skipping here avoids out-of-order song-event application that can
      // clobber persisted UI state on reload.
      return;
    }
    const songEventsShuffleOot = Boolean(
      trackerSettings.value?.songEventsShuffleOot,
    );

    if (songEventsShuffleOot && Object.keys(songEvents.value).length === 0) {
      // Initialize with vanilla defaults from OoTMM core
      const vanillaDefaults: Record<string, number> = {};
      VANILLA_SONG_EVENTS.forEach((songId, eventId) => {
        vanillaDefaults[eventId] = songId;
      });
      songEvents.value = vanillaDefaults;
    }

    const events = songEventsShuffleOot ? songEvents.value : {};
    currentTracker.setSongEvents(events);
    recomputeReachability();
  }

  function applyShopPrices(
    forceDuringSettingsApply = false,
    resetInitializedPrices = false,
  ) {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setShopPrices) return;
    if (isApplyingSettings.value && !forceDuringSettingsApply) {
      // Same race as above: avoid applying/merging prices while settings are
      // still being re-applied during initialization.
      return;
    }

    const hasEditableShops = SHOP_PRICE_MODE_KEYS.some((key) =>
      isRandomizedShopPriceMode(trackerSettings.value?.[key]),
    );

    if (hasEditableShops && currentTracker.getShopPrices) {
      const trackerPrices = sanitizeNonNegativeNumberRecord(
        currentTracker.getShopPrices(),
      );
      const initializedPrices = Object.fromEntries(
        Object.keys(trackerPrices).map((locationId) => [locationId, 0]),
      );
      shopPrices.value = sanitizeNonNegativeNumberRecord(
        resetInitializedPrices
          ? {
              ...shopPrices.value,
              ...initializedPrices,
            }
          : {
              ...initializedPrices,
              ...shopPrices.value,
            },
      );
    }

    const prices = hasEditableShops ? shopPrices.value : {};
    currentTracker.setShopPrices(prices);
    recomputeReachability();
  }

  function applySpecialCondsPatch(
    patch: Record<string, unknown>,
    options?: MutationOptions,
  ) {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setSpecialConds) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    currentTracker.setSpecialConds(patch);
    trackerSettings.value = preserveTrackerOnlySettings({
      ...currentTracker.getSettings(),
    });
    recomputeReachability();
    recordHistoryFromSnapshot(previousSnapshot);
    publishSyncOperation(
      {
        type: 'settings.patch_special_conds',
        patch: { ...patch },
      },
      options,
    );
  }

  async function applySettings(
    newSettings: Record<string, unknown>,
    options?: MutationOptions,
  ) {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    if (!currentTracker) return;
    const previousSnapshot = captureSnapshotForMutation(options);
    let didApply = false;
    const nextSettings = applyDefaultsForNewlyVisibleSettings(
      trackerSettings.value,
      { ...newSettings },
    );
    const resetInitializedShopPrices = shouldResetInitializedShopPrices(
      trackerSettings.value,
      nextSettings,
    );
    const nextEntranceOverrides = cleanupEntranceOverridesForSettings(
      entranceOverrides.value,
      nextSettings,
    );

    isApplyingSettings.value = true;
    const overlayStartTime = performance.now();
    const minTotalOverlayDurationMs = 100;
    // Keep the overlay around briefly after the work finishes so UI and tests
    // can reliably observe the "applying" state even when initialization blocks.
    const postApplyOverlayDurationMs = options?.source === 'remote' ? 0 : 150;
    try {
      await nextTick();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      currentTracker.reset();
      const settingsWithEntrances = injectEntranceOverridesIntoSettings(
        nextSettings,
        nextEntranceOverrides,
      );
      await currentTracker.initialize(settingsWithEntrances);
      trackerSettings.value = preserveTrackerOnlySettings(
        { ...currentTracker.getSettings() },
        nextSettings,
      );
      entranceOverrides.value = nextEntranceOverrides;
      availableItemIds.value = setToArray(
        currentTracker.getAvailableItemIds?.() ?? new Set<string>(),
      );
      itemMaxCountsById.value = mapNumberToRecord(
        currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
      );
      applyPreCompletedDungeons();
      // Explicitly apply these once the tracker is initialized with the new
      // settings, even though isApplyingSettings is still true.
      applySongEvents(true);
      applyShopPrices(true, resetInitializedShopPrices);
      recomputeReachability();
      didApply = true;
    } catch (error) {
      console.error('Failed to apply settings:', error);
    } finally {
      const elapsed = performance.now() - overlayStartTime;
      if (elapsed < minTotalOverlayDurationMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, minTotalOverlayDurationMs - elapsed),
        );
      }
      if (postApplyOverlayDurationMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, postApplyOverlayDurationMs),
        );
      }
      isApplyingSettings.value = false;
    }
    if (didApply) {
      recordHistoryFromSnapshot(previousSnapshot);
      publishSyncOperation(
        {
          type: 'settings.apply',
          settings: cloneSettingsRecord(trackerSettings.value),
        },
        options,
      );
    }
  }

  function recomputeReachability() {
    const currentTracker = tracker.value;
    if (!currentTracker) {
      reachableLocationIds.value = [];
      reachableEntranceIds.value = [];
      canComplete.value = false;
      statsExtra.value = {};
      return;
    }
    const result = currentTracker.checkReachability(inventoryMap.value);
    reachableLocationIds.value = result.reachableLocationIds;
    canComplete.value = result.canComplete;
    statsExtra.value = result.extra ?? {};

    // Extract reachable entrance IDs from the extra data.
    const entranceIds = (
      result.extra as { reachableEntranceIds?: string[] } | undefined
    )?.reachableEntranceIds;
    reachableEntranceIds.value = entranceIds ?? [];

    // Skip vanilla silver rupee auto-tracking while settings are being applied.
    // During tracker re-initialization (e.g. on reload), watches fire before
    // the tracker has been re-initialized with persisted settings, so the
    // tracker still uses defaults (silverRupeeShuffle: 'vanilla') and would
    // incorrectly clear manually-set silver rupee counts from inventory.
    if (isApplyingSettings.value) return;

    const autoCounts = (
      result.extra as
        | { vanillaSilverRupeeCounts?: Record<string, number> }
        | undefined
    )?.vanillaSilverRupeeCounts;
    if (autoCounts && typeof autoCounts === 'object') {
      applyVanillaSilverRupeeCounts(autoCounts);
    }
  }

  async function resetSessionStateToDefaults(options?: MutationOptions) {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    const previousSnapshot = captureSnapshotForMutation(options);
    let didReset = false;

    inventoryById.value = {};
    collectedLocationIds.value = [];
    preCompletedDungeons.value = [];
    junkLocationIds.value = [];
    autoCollectedPreCompletedLocationIds.value = [];
    songEvents.value = {};
    shopPrices.value = {};
    entranceOverrides.value = {};
    hasImportedSpoilerLog.value = false;
    importedSpoilerLogVersion.value = null;

    if (!currentTracker) {
      trackerSettings.value = {};
      availableItemIds.value = [];
      itemMaxCountsById.value = {};
      reachableLocationIds.value = [];
      reachableEntranceIds.value = [];
      canComplete.value = false;
      statsExtra.value = {};
      didReset = true;
      if (didReset) {
        recordHistoryFromSnapshot(previousSnapshot);
        publishSyncOperation({ type: 'session.reset_defaults' }, options);
      }
      return;
    }

    isApplyingSettings.value = true;
    try {
      await nextTick();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      currentTracker.reset();
      await currentTracker.initialize({});
      trackerSettings.value = preserveTrackerOnlySettings({
        ...currentTracker.getSettings(),
      });
      availableItemIds.value = setToArray(
        currentTracker.getAvailableItemIds?.() ?? new Set<string>(),
      );
      itemMaxCountsById.value = mapNumberToRecord(
        currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
      );
      locationsVersion.value += 1;
      applyPreCompletedDungeons();
      didReset = true;
    } catch (error) {
      console.error('Failed to reset tracker state:', error);
      initializeFromTracker();
    } finally {
      isApplyingSettings.value = false;
    }
    if (didReset) {
      recordHistoryFromSnapshot(previousSnapshot);
      publishSyncOperation({ type: 'session.reset_defaults' }, options);
    }
  }

  function fillInventoryForDebugActivateAll(options?: MutationOptions) {
    const nextInventory: Record<string, number> = {};
    if (availableItemIds.value.length > 0) {
      for (const itemId of availableItemIds.value) {
        const maxCount = getEffectiveItemMaxCount(itemId);
        nextInventory[itemId] = Math.max(1, maxCount);
      }
    } else {
      for (const item of ITEM_DATABASE) {
        if ((item.category as string) === 'junk') continue;
        const maxCount = getEffectiveItemMaxCount(item.id, item.maxCount ?? 1);
        nextInventory[item.id] = Math.max(1, maxCount);
      }
    }

    const nextEntranceOverrides = {
      ...cleanupEntranceOverridesForSettings(
        entranceOverrides.value,
        trackerSettings.value,
      ),
    };
    const activeEntranceKeys = getActiveEntranceKeys(trackerSettings.value);
    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const vanillaGameLinkMapping =
      GAME_LINK_VANILLA_EXIT_MAPPING[gamesMode] ?? {};

    for (const key of activeEntranceKeys) {
      if (nextEntranceOverrides[key]) continue;

      if (
        INTERIOR_GAME_LINK_EXIT_KEYS.has(key) ||
        INTERIOR_GAME_LINK_SOURCE_KEYS.has(key)
      ) {
        const vanillaDestination = vanillaGameLinkMapping[key];
        if (vanillaDestination) {
          nextEntranceOverrides[key] = vanillaDestination;
        }
        continue;
      }

      nextEntranceOverrides[key] = key;
    }

    setInventoryFromMap(new Map(Object.entries(nextInventory)), options);
    if (Object.keys(nextEntranceOverrides).length > 0) {
      setEntranceOverrides(nextEntranceOverrides, options);
    }
  }

  return {
    tracker,
    inventoryById,
    collectedLocationIds,
    preCompletedDungeons,
    junkLocationIds,
    songEvents,
    shopPrices,
    entranceOverrides,
    trackerSettings,
    hasImportedSpoilerLog,
    importedSpoilerLogVersion,
    availableItemIds,
    itemMaxCountsById,
    reachableLocationIds,
    canComplete,
    statsExtra,
    locationsVersion,
    isApplyingSettings,
    canUndo,
    canRedo,
    undoHistory,
    redoHistory,
    inventoryMap,
    availableItemIdSet,
    itemMaxCountsMap,
    reachableLocationIdSet,
    reachableEntranceIdSet,
    preCompletedEnabled,
    allLocations,
    startLocalSessionSync,
    stopLocalSessionSync,
    startRoomSync,
    stopRoomSync,
    leaveRoom,
    coopRoomCode,
    coopPeerCount,
    coopConnectionState,
    attachTracker,
    initializeFromTracker,
    setInventoryFromMap,
    setInventoryCount,
    incrementItem,
    decrementItem,
    toggleItem,
    mergeInventoryCounts,
    applyAutotrackerDelta,
    toggleCollectedLocation,
    setCollectedLocationIds,
    setJunkLocationIds,
    collectLocationIds,
    setPreCompletedDungeons,
    setSongEvents,
    setShopPrices,
    setShopPriceForLocation,
    setEntranceOverride,
    setEntranceOverrides,
    setSpoilerLogImportState,
    applyPreCompletedDungeons,
    applySongEvents,
    applyShopPrices,
    applySpecialCondsPatch,
    applySettings,
    undo,
    redo,
    clearHistory,
    recomputeReachability,
    resetSessionStateToDefaults,
    fillInventoryForDebugActivateAll,
  };
});
