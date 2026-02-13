<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { defineAsyncComponent } from 'vue';
import { useAppStore } from './stores/app';

const appStore = useAppStore();
const { availablePacks, selectedPackId, currentPack, isLoading, error } =
  storeToRefs(appStore);

const packComponents: Record<
  string,
  ReturnType<typeof defineAsyncComponent>
> = {
  ootmm: defineAsyncComponent(
    () => import('@packs/ootmm/components/OoTMMTracker.vue'),
  ),
};

function getPackComponent(packId: string) {
  return packComponents[packId] ?? null;
}

function resetTrackerState() {
  const resetFn = (
    window as Window & { __TLT_RESET_TRACKER_STATE__?: () => void }
  ).__TLT_RESET_TRACKER_STATE__;
  if (typeof resetFn === 'function') {
    resetFn();
    return;
  }
  window.localStorage.clear();
  window.location.reload();
}

function debugActivateAll() {
  const debugFn = (
    window as Window & { __TLT_DEBUG_ACTIVATE_ALL__?: () => void }
  ).__TLT_DEBUG_ACTIVATE_ALL__;
  if (typeof debugFn === 'function') {
    debugFn();
  }
}

onMounted(() => {
  appStore.initialize();
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>The Last Tracker</h1>

      <div class="header-actions">
        <div class="pack-selector">
          <label for="pack-select">Tracker Pack:</label>
          <select
            id="pack-select"
            v-model="selectedPackId"
            :disabled="isLoading"
            @change="appStore.loadPack(selectedPackId)"
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
        <button
          type="button"
          class="debug-activate-all-button"
          @click="debugActivateAll"
        >
          Debug: Activate All
        </button>
        <button type="button" class="reset-button" @click="resetTrackerState">
          RESET TRACKER STATE
        </button>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.pack-selector label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.reset-button {
  background: #7f1d1d;
  border: 1px solid #fca5a5;
  font-size: 0.75rem;
  font-weight: 700;
}

.reset-button:hover {
  background: #991b1b;
}

.debug-activate-all-button {
  background: #444;
  border: 1px solid #666;
  font-size: 0.75rem;
  font-weight: 700;
}

.debug-activate-all-button:hover {
  background: #555;
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

  .header-actions {
    width: 100%;
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
