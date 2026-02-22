import { defineStore } from 'pinia';
import { computed, markRaw, nextTick, ref } from 'vue';
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

const HISTORY_LIMIT = 200;
const VANILLA_SILVER_RUPEE_PREFIX = 'OOT_RUPEE_SILVER_';

type SessionSnapshot = {
  inventoryById: Record<string, number>;
  collectedLocationIds: string[];
  preCompletedDungeons: string[];
  songEvents: Record<string, number>;
  shopPrices: Record<string, number>;
  trackerSettings: Record<string, unknown>;
};

type MutationOptions = {
  source?: 'local' | 'remote';
  recordHistory?: boolean;
};

const REMOTE_MUTATION_OPTIONS: MutationOptions = {
  source: 'remote',
  recordHistory: false,
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

  const inventoryById = ref<Record<string, number>>({});
  const collectedLocationIds = ref<string[]>([]);
  const preCompletedDungeons = ref<string[]>([]);
  const autoCollectedPreCompletedLocationIds = ref<string[]>([]);
  const songEvents = ref<Record<string, number>>({});
  const shopPrices = ref<Record<string, number>>({});

  const trackerSettings = ref<Record<string, unknown>>({});
  const availableItemIds = ref<string[]>([]);
  const itemMaxCountsById = ref<Record<string, number>>({});

  const reachableLocationIds = ref<string[]>([]);
  const canComplete = ref(false);
  const statsExtra = ref<Record<string, unknown>>({});
  const locationsVersion = ref(0);
  const isApplyingSettings = ref(false);
  const undoHistory = ref<SessionSnapshot[]>([]);
  const redoHistory = ref<SessionSnapshot[]>([]);
  const isNavigatingHistory = ref(false);
  let syncConnection: OoTMMSessionSyncConnection | null = null;
  let remoteOperationQueue: Promise<void> = Promise.resolve();

  const inventoryMap = computed(() => recordToMap(inventoryById.value));
  const availableItemIdSet = computed(() => new Set(availableItemIds.value));
  const itemMaxCountsMap = computed(
    () => new Map(Object.entries(itemMaxCountsById.value)),
  );
  const reachableLocationIdSet = computed(
    () => new Set(reachableLocationIds.value),
  );
  const preCompletedEnabled = computed(() =>
    Boolean(trackerSettings.value?.preCompletedDungeons),
  );
  const canUndo = computed(() => undoHistory.value.length > 0);
  const canRedo = computed(() => redoHistory.value.length > 0);

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
    if (!syncConnection) return false;
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

  function publishSyncOperation(
    operation: OoTMMSyncOperation,
    options?: MutationOptions,
  ): void {
    if (!shouldPublishSync(options)) return;
    syncConnection?.publish(operation);
  }

  function captureSessionSnapshot(): SessionSnapshot {
    return {
      inventoryById: sanitizeInventoryRecord({ ...inventoryById.value }),
      collectedLocationIds: [...collectedLocationIds.value],
      preCompletedDungeons: [...preCompletedDungeons.value],
      songEvents: { ...songEvents.value },
      shopPrices: { ...shopPrices.value },
      trackerSettings: cloneSettingsRecord(trackerSettings.value),
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

  async function applyRemoteOperation(
    envelope: OoTMMSyncOperationEnvelope,
  ): Promise<void> {
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

    isNavigatingHistory.value = true;
    try {
      if (!currentTracker) {
        inventoryById.value = targetInventoryById;
        collectedLocationIds.value = targetCollectedLocationIds;
        preCompletedDungeons.value = targetPreCompletedDungeons;
        autoCollectedPreCompletedLocationIds.value = [];
        songEvents.value = targetSongEvents;
        shopPrices.value = targetShopPrices;
        trackerSettings.value = targetSettings;
        reachableLocationIds.value = [];
        canComplete.value = false;
        statsExtra.value = {};
        return true;
      }

      const requiresSettingsReinitialize = !areSettingsEqual(
        trackerSettings.value,
        targetSettings,
      );
      if (requiresSettingsReinitialize) {
        isApplyingSettings.value = true;
        try {
          await nextTick();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          currentTracker.reset();
          await currentTracker.initialize(targetSettings);
          trackerSettings.value = { ...currentTracker.getSettings() };
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
      autoCollectedPreCompletedLocationIds.value = [];
      songEvents.value = targetSongEvents;
      shopPrices.value = targetShopPrices;
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
  }

  async function attachTracker(nextTracker: TrackerPack) {
    clearHistory();
    tracker.value = markRaw(nextTracker) as TrackerPack;
    const persistedSettings = cloneSettingsRecord(trackerSettings.value);
    const hasPersistedSettings = Object.keys(persistedSettings).length > 0;
    const targetSettings = hasPersistedSettings
      ? persistedSettings
      : cloneSettingsRecord(TRACKER_DEFAULT_SETTINGS);
    const currentSettings = nextTracker.getSettings();
    const shouldReinitializeWithTargetSettings = !areSettingsEqual(
      targetSettings,
      currentSettings,
    );
    if (shouldReinitializeWithTargetSettings) {
      isApplyingSettings.value = true;
      try {
        await nextTick();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await nextTracker.initialize(targetSettings);
      } catch (error) {
        console.error('Failed to initialize tracker settings:', error);
      } finally {
        isApplyingSettings.value = false;
      }
    }
    trackerSettings.value = { ...nextTracker.getSettings() };
    availableItemIds.value = setToArray(
      nextTracker.getAvailableItemIds?.() ?? new Set<string>(),
    );
    itemMaxCountsById.value = mapNumberToRecord(
      nextTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
    );
    applyPreCompletedDungeons();
    applySongEvents();
    applyShopPrices();
  }

  function initializeFromTracker() {
    if (!tracker.value) return;
    trackerSettings.value = { ...tracker.value.getSettings() };
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
    const max = Math.max(1, itemMaxCountsById.value[itemId] ?? fallbackMax);
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

  function applySongEvents() {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setSongEvents) return;
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

  function applyShopPrices() {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setShopPrices) return;

    const isRandomizedMode = (mode: string) =>
      mode === 'random' || mode === 'weighted';
    const hasEditableShops = [
      trackerSettings.value?.priceOotShops,
      trackerSettings.value?.priceOotScrubs,
      trackerSettings.value?.priceOotMerchants,
      trackerSettings.value?.priceMmShops,
      trackerSettings.value?.priceMmTingle,
    ].some((mode) => isRandomizedMode(String(mode ?? '')));

    if (hasEditableShops && currentTracker.getShopPrices) {
      const trackerPrices = sanitizeNonNegativeNumberRecord(
        currentTracker.getShopPrices(),
      );
      shopPrices.value = sanitizeNonNegativeNumberRecord({
        ...trackerPrices,
        ...shopPrices.value,
      });
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
    trackerSettings.value = { ...currentTracker.getSettings() };
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
      await currentTracker.initialize(nextSettings);
      trackerSettings.value = { ...currentTracker.getSettings() };
      availableItemIds.value = setToArray(
        currentTracker.getAvailableItemIds?.() ?? new Set<string>(),
      );
      itemMaxCountsById.value = mapNumberToRecord(
        currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
      );
      applyPreCompletedDungeons();
      applySongEvents();
      applyShopPrices();
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
      canComplete.value = false;
      statsExtra.value = {};
      return;
    }
    const result = currentTracker.checkReachability(inventoryMap.value);
    reachableLocationIds.value = result.reachableLocationIds;
    canComplete.value = result.canComplete;
    statsExtra.value = result.extra ?? {};

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
    autoCollectedPreCompletedLocationIds.value = [];
    songEvents.value = {};
    shopPrices.value = {};

    if (!currentTracker) {
      trackerSettings.value = {};
      availableItemIds.value = [];
      itemMaxCountsById.value = {};
      reachableLocationIds.value = [];
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
      trackerSettings.value = { ...currentTracker.getSettings() };
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
        const maxCount = itemMaxCountsById.value[itemId] ?? 1;
        nextInventory[itemId] = Math.max(1, maxCount);
      }
    } else {
      for (const item of ITEM_DATABASE) {
        if ((item.category as string) === 'junk') continue;
        const maxCount = itemMaxCountsById.value[item.id] ?? item.maxCount ?? 1;
        nextInventory[item.id] = Math.max(1, maxCount);
      }
    }
    setInventoryFromMap(new Map(Object.entries(nextInventory)), options);
  }

  return {
    tracker,
    inventoryById,
    collectedLocationIds,
    preCompletedDungeons,
    songEvents,
    shopPrices,
    trackerSettings,
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
    preCompletedEnabled,
    allLocations,
    startLocalSessionSync,
    stopLocalSessionSync,
    attachTracker,
    initializeFromTracker,
    setInventoryFromMap,
    setInventoryCount,
    incrementItem,
    decrementItem,
    toggleItem,
    mergeInventoryCounts,
    toggleCollectedLocation,
    setCollectedLocationIds,
    setPreCompletedDungeons,
    setSongEvents,
    setShopPrices,
    setShopPriceForLocation,
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
