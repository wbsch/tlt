<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { TrackerPack } from './types/tracker';

// Import tracker packs
import { createOoTMMTracker } from '@packs/ootmm';

const availablePacks = ref<{ id: string; name: string; description: string }[]>(
  [
    {
      id: 'ootmm',
      name: 'OoTMM',
      description: "Ocarina of Time / Majora's Mask Randomizer",
    },
  ],
);

const selectedPackId = ref<string>('ootmm');
const currentPack = ref<TrackerPack | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

async function loadPack(packId: string) {
  isLoading.value = true;
  error.value = null;

  try {
    // Load the selected pack
    if (packId === 'ootmm') {
      currentPack.value = await createOoTMMTracker();
    }
  } catch (e) {
    error.value = `Failed to load tracker pack: ${e instanceof Error ? e.message : String(e)}`;
    console.error(e);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadPack(selectedPackId.value);
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>The Last Tracker</h1>

      <div class="pack-selector">
        <label for="pack-select">Tracker Pack:</label>
        <select
          id="pack-select"
          v-model="selectedPackId"
          :disabled="isLoading"
          @change="loadPack(selectedPackId)"
        >
          <option
            v-for="pack in availablePacks"
            :key="pack.id"
            :value="pack.id"
          >
            {{ pack.name }}
          </option>
        </select>
      </div>
    </header>

    <main class="app-main">
      <div v-if="isLoading" class="loading">Loading tracker...</div>

      <div v-else-if="error" class="error">
        {{ error }}
      </div>

      <component
        :is="getPackComponent(selectedPackId)"
        v-else-if="currentPack"
        :tracker="currentPack"
      />
    </main>
  </div>
</template>

<script lang="ts">
import { defineAsyncComponent } from 'vue';

function getPackComponent(packId: string) {
  if (packId === 'ootmm') {
    return defineAsyncComponent(
      () => import('@packs/ootmm/components/OoTMMTracker.vue'),
    );
  }
  return null;
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  background: #2a2a2a;
  padding: 1rem 2rem;
  border-bottom: 2px solid #404040;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.pack-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pack-selector label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.app-main {
  flex: 1;
  overflow: hidden;
}

.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 1.125rem;
}

.error {
  color: #ef4444;
}

@media (max-width: 700px) {
  .app-header {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
  }

  .pack-selector {
    width: 100%;
  }

  .pack-selector select {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 900px) {
  .app-main {
    overflow-y: auto;
  }
}
</style>
