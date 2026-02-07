import { defineStore } from 'pinia';
import { computed, markRaw, nextTick, ref } from 'vue';
import type { TrackerPack } from '@/types/tracker';
import { ITEM_DATABASE } from '../data/items';

function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map.entries());
}

function recordToMap(record: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(record).filter(([, count]) => count > 0));
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

export const useOoTMMSessionStore = defineStore('ootmm-session', () => {
  const tracker = ref<TrackerPack | null>(null);

  const inventoryById = ref<Record<string, number>>({});
  const collectedLocationIds = ref<string[]>([]);
  const preCompletedDungeons = ref<string[]>([]);

  const trackerSettings = ref<Record<string, unknown>>({});
  const availableItemIds = ref<string[]>([]);
  const itemMaxCountsById = ref<Record<string, number>>({});

  const reachableLocationIds = ref<string[]>([]);
  const canComplete = ref(false);
  const statsExtra = ref<Record<string, unknown>>({});
  const locationsVersion = ref(0);
  const isApplyingSettings = ref(false);

  const inventoryMap = computed(() => recordToMap(inventoryById.value));
  const availableItemIdSet = computed(() => new Set(availableItemIds.value));
  const itemMaxCountsMap = computed(() => new Map(Object.entries(itemMaxCountsById.value)));
  const reachableLocationIdSet = computed(() => new Set(reachableLocationIds.value));
  const preCompletedEnabled = computed(() => Boolean(trackerSettings.value?.preCompletedDungeons));

  const allLocations = computed(() => {
    void locationsVersion.value;
    return tracker.value?.getAllLocations() ?? [];
  });

  const shuffledLocations = computed(() => {
    return allLocations.value.filter((location) => location.isShuffled !== false);
  });

  const stats = computed(() => {
    const total = shuffledLocations.value.length;
    const reachable = shuffledLocations.value.filter((location) =>
      reachableLocationIdSet.value.has(location.id),
    ).length;
    const checked = 0;
    return {
      total,
      reachable,
      checked,
      remaining: total - checked,
    };
  });

  function attachTracker(nextTracker: TrackerPack) {
    tracker.value = markRaw(nextTracker) as TrackerPack;
    trackerSettings.value = { ...nextTracker.getSettings() };
    availableItemIds.value = setToArray(nextTracker.getAvailableItemIds?.() ?? new Set<string>());
    itemMaxCountsById.value = mapNumberToRecord(nextTracker.getItemMaxCounts?.() ?? new Map<string, number>());
    recomputeReachability();
  }

  function initializeFromTracker() {
    if (!tracker.value) return;
    trackerSettings.value = { ...tracker.value.getSettings() };
    availableItemIds.value = setToArray(tracker.value.getAvailableItemIds?.() ?? new Set<string>());
    itemMaxCountsById.value = mapNumberToRecord(tracker.value.getItemMaxCounts?.() ?? new Map<string, number>());
    recomputeReachability();
  }

  function setInventoryFromMap(newInventory: Map<string, number>) {
    inventoryById.value = mapToRecord(newInventory);
    recomputeReachability();
  }

  function setInventoryCount(itemId: string, count: number) {
    const next = { ...inventoryById.value };
    const safeCount = Math.max(0, Math.floor(count));
    if (safeCount > 0) {
      next[itemId] = safeCount;
    } else {
      delete next[itemId];
    }
    inventoryById.value = next;
    recomputeReachability();
  }

  function incrementItem(itemId: string, fallbackMax = 1) {
    const current = inventoryById.value[itemId] ?? 0;
    const max = Math.max(1, itemMaxCountsById.value[itemId] ?? fallbackMax);
    if (current >= max) return;
    setInventoryCount(itemId, current + 1);
  }

  function decrementItem(itemId: string) {
    const current = inventoryById.value[itemId] ?? 0;
    if (current <= 0) return;
    setInventoryCount(itemId, current - 1);
  }

  function toggleItem(itemId: string, fallbackMax = 1) {
    const current = inventoryById.value[itemId] ?? 0;
    if (current > 0) {
      setInventoryCount(itemId, 0);
      return;
    }
    incrementItem(itemId, fallbackMax);
  }

  function mergeInventoryCounts(countsById: Record<string, number>) {
    const next = new Map(inventoryMap.value);
    for (const [itemId, count] of Object.entries(countsById)) {
      if (count <= 0) continue;
      const current = next.get(itemId) ?? 0;
      next.set(itemId, Math.max(current, Math.floor(count)));
    }
    setInventoryFromMap(next);
  }

  function toggleCollectedLocation(locationId: string) {
    const next = new Set(collectedLocationIds.value);
    if (next.has(locationId)) {
      next.delete(locationId);
    } else {
      next.add(locationId);
    }
    collectedLocationIds.value = Array.from(next);
  }

  function setCollectedLocationIds(ids: string[]) {
    collectedLocationIds.value = uniqueStrings(ids);
  }

  function setPreCompletedDungeons(ids: string[]) {
    preCompletedDungeons.value = uniqueStrings(ids);
    applyPreCompletedDungeons();
  }

  function applyPreCompletedDungeons() {
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setPreCompletedDungeons) return;
    const selected = preCompletedEnabled.value ? preCompletedDungeons.value : [];
    currentTracker.setPreCompletedDungeons(selected);
    locationsVersion.value += 1;
    recomputeReachability();
  }

  function applySpecialCondsPatch(patch: Record<string, unknown>) {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    if (!currentTracker || !currentTracker.setSpecialConds) return;
    currentTracker.setSpecialConds(patch);
    trackerSettings.value = { ...currentTracker.getSettings() };
    recomputeReachability();
  }

  async function applySettings(newSettings: Record<string, unknown>) {
    if (isApplyingSettings.value) return;
    const currentTracker = tracker.value;
    if (!currentTracker) return;

    currentTracker.reset();
    isApplyingSettings.value = true;
    try {
      await nextTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await currentTracker.initialize(newSettings);
      trackerSettings.value = { ...currentTracker.getSettings() };
      availableItemIds.value = setToArray(currentTracker.getAvailableItemIds?.() ?? new Set<string>());
      itemMaxCountsById.value = mapNumberToRecord(
        currentTracker.getItemMaxCounts?.() ?? new Map<string, number>(),
      );
      applyPreCompletedDungeons();
      recomputeReachability();
    } catch (error) {
      console.error('Failed to apply settings:', error);
    } finally {
      isApplyingSettings.value = false;
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
  }

  function fillInventoryForDebugActivateAll() {
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
    inventoryById.value = nextInventory;
    recomputeReachability();
  }

  return {
    tracker,
    inventoryById,
    collectedLocationIds,
    preCompletedDungeons,
    trackerSettings,
    availableItemIds,
    itemMaxCountsById,
    reachableLocationIds,
    canComplete,
    statsExtra,
    locationsVersion,
    isApplyingSettings,
    inventoryMap,
    availableItemIdSet,
    itemMaxCountsMap,
    reachableLocationIdSet,
    preCompletedEnabled,
    allLocations,
    shuffledLocations,
    stats,
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
    applyPreCompletedDungeons,
    applySpecialCondsPatch,
    applySettings,
    recomputeReachability,
    fillInventoryForDebugActivateAll,
  };
});
