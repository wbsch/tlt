import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { TrackerPack } from '@/types/tracker';
import { createOoTMMTracker } from '@packs/ootmm';

type AvailablePack = {
  id: string;
  name: string;
  description: string;
};

const APP_STORAGE_KEY = 'tlt:app:v1';

type PersistedAppState = {
  selectedPackId?: string;
};

function loadPersistedAppState(): PersistedAppState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedAppState;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    console.warn('[App Store] Failed to load persisted state:', error);
    return {};
  }
}

function persistAppState(state: PersistedAppState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[App Store] Failed to persist state:', error);
  }
}

export const useAppStore = defineStore('app', () => {
  const persistedState = loadPersistedAppState();
  const availablePacks = ref<AvailablePack[]>([
    {
      id: 'ootmm',
      name: 'OoTMM',
      description: "Ocarina of Time / Majora's Mask Randomizer",
    },
  ]);
  const selectedPackId = ref(persistedState.selectedPackId ?? 'ootmm');
  const currentPack = ref<TrackerPack | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  watch(selectedPackId, (packId) => {
    persistAppState({ selectedPackId: packId });
  });

  async function loadPack(packId: string) {
    isLoading.value = true;
    error.value = null;
    selectedPackId.value = packId;

    try {
      if (packId === 'ootmm') {
        currentPack.value = await createOoTMMTracker();
      } else {
        currentPack.value = null;
        error.value = `Unknown tracker pack: ${packId}`;
      }
    } catch (e) {
      currentPack.value = null;
      error.value = `Failed to load tracker pack: ${e instanceof Error ? e.message : String(e)}`;
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  }

  async function initialize() {
    await loadPack(selectedPackId.value);
  }

  return {
    availablePacks,
    selectedPackId,
    currentPack,
    isLoading,
    error,
    loadPack,
    initialize,
  };
});
