import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { TrackerPack } from '@/types/tracker';
import { createOoTMMTracker } from '@packs/ootmm';

type AvailablePack = {
  id: string;
  name: string;
  description: string;
};

export const useAppStore = defineStore('app', () => {
  const availablePacks = ref<AvailablePack[]>([
    {
      id: 'ootmm',
      name: 'OoTMM',
      description: "Ocarina of Time / Majora's Mask Randomizer",
    },
  ]);
  const selectedPackId = ref('ootmm');
  const currentPack = ref<TrackerPack | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

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
