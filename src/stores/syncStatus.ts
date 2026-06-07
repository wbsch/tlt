import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export const useSyncStatusStore = defineStore('sync-status', () => {
  const otherTabCount = ref(0);
  const coopPeerCount = ref(0);
  const isCoopRoomActive = ref(false);
  const coopRoomCode = ref<string | null>(null);
  const lastSyncAt = ref<number | null>(null);

  const hasOtherTabsOpen = computed(() => otherTabCount.value > 0);
  const hasCoopPeers = computed(() => coopPeerCount.value > 0);
  const connectedTabCount = computed(() => otherTabCount.value + 1);
  const hasAnyPeers = computed(
    () => hasOtherTabsOpen.value || hasCoopPeers.value,
  );

  function setOtherTabCount(count: number) {
    if (!Number.isFinite(count)) {
      otherTabCount.value = 0;
      return;
    }
    otherTabCount.value = Math.max(0, Math.floor(count));
  }

  function setCoopPeerCount(count: number) {
    if (!Number.isFinite(count)) {
      coopPeerCount.value = 0;
      return;
    }
    coopPeerCount.value = Math.max(0, Math.floor(count));
  }

  function setCoopRoomActive(active: boolean) {
    isCoopRoomActive.value = Boolean(active);
  }

  function setCoopRoomCode(code: string | null) {
    coopRoomCode.value =
      typeof code === 'string' && code.length > 0 ? code : null;
  }

  function markSyncReceived() {
    lastSyncAt.value = Date.now();
  }

  function resetSyncStatus() {
    otherTabCount.value = 0;
    coopPeerCount.value = 0;
    isCoopRoomActive.value = false;
    coopRoomCode.value = null;
    lastSyncAt.value = null;
  }

  return {
    otherTabCount,
    coopPeerCount,
    isCoopRoomActive,
    coopRoomCode,
    lastSyncAt,
    hasOtherTabsOpen,
    hasCoopPeers,
    hasAnyPeers,
    connectedTabCount,
    setOtherTabCount,
    setCoopPeerCount,
    setCoopRoomActive,
    setCoopRoomCode,
    markSyncReceived,
    resetSyncStatus,
  };
});
