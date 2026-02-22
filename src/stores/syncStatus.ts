import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export const useSyncStatusStore = defineStore('sync-status', () => {
  const otherTabCount = ref(0);
  const lastSyncAt = ref<number | null>(null);

  const hasOtherTabsOpen = computed(() => otherTabCount.value > 0);
  const connectedTabCount = computed(() => otherTabCount.value + 1);

  function setOtherTabCount(count: number) {
    if (!Number.isFinite(count)) {
      otherTabCount.value = 0;
      return;
    }
    otherTabCount.value = Math.max(0, Math.floor(count));
  }

  function markSyncReceived() {
    lastSyncAt.value = Date.now();
  }

  function resetSyncStatus() {
    otherTabCount.value = 0;
    lastSyncAt.value = null;
  }

  return {
    otherTabCount,
    lastSyncAt,
    hasOtherTabsOpen,
    connectedTabCount,
    setOtherTabCount,
    markSyncReceived,
    resetSyncStatus,
  };
});
