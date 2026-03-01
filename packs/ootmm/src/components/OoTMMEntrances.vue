<script setup lang="ts">
import { useDungeonEntrances } from '../composables/useDungeonEntrances';

const {
  activeEntrances,
  filteredEntrances,
  ootEntrances,
  mmEntrances,
  destinationOptionsForGame,
  getSelectedDestination,
  setSelectedDestination,
  clearAllOverrides,
  hasAnyOverrides,
} = useDungeonEntrances();

function handleDestinationChange(srcKey: string, dstKey: string) {
  setSelectedDestination(srcKey, dstKey);
}
</script>

<template>
  <div class="entrances-panel">
    <div class="entrances-header">
      <h3 class="entrances-title">Dungeon Entrances</h3>
      <button
        v-if="hasAnyOverrides"
        type="button"
        class="clear-button"
        @click="clearAllOverrides"
      >
        Clear All
      </button>
    </div>

    <div v-if="activeEntrances.length === 0" class="no-entrances">
      <p>
        Enable Dungeon ER in Settings and select dungeon sub-types to configure
        entrance assignments.
      </p>
    </div>

    <div v-else-if="filteredEntrances.length === 0" class="no-entrances">
      <p>No entrances match the current reachability filter.</p>
    </div>

    <div v-else class="entrances-list">
      <!-- OoT Entrances -->
      <template v-if="ootEntrances.length > 0">
        <div class="game-section-header">Ocarina of Time</div>
        <div
          v-for="entrance in ootEntrances"
          :key="entrance.key"
          class="entrance-row"
        >
          <label class="entrance-label" :title="entrance.key">
            {{ entrance.label }}
          </label>
          <select
            class="entrance-select"
            :value="getSelectedDestination(entrance.key)"
            @change="
              handleDestinationChange(
                entrance.key,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">— Not mapped —</option>
            <option
              v-for="dest in destinationOptionsForGame(
                entrance.game,
                entrance.key,
              )"
              :key="dest.value"
              :value="dest.value"
            >
              {{ dest.label
              }}{{
                dest.game === 'mm'
                  ? ' (MM)'
                  : dest.game === 'oot'
                    ? ' (OoT)'
                    : ''
              }}
            </option>
          </select>
        </div>
      </template>

      <!-- MM Entrances -->
      <template v-if="mmEntrances.length > 0">
        <div class="game-section-header">Majora's Mask</div>
        <div
          v-for="entrance in mmEntrances"
          :key="entrance.key"
          class="entrance-row"
        >
          <label class="entrance-label" :title="entrance.key">
            {{ entrance.label }}
          </label>
          <select
            class="entrance-select"
            :value="getSelectedDestination(entrance.key)"
            @change="
              handleDestinationChange(
                entrance.key,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">— Not mapped —</option>
            <option
              v-for="dest in destinationOptionsForGame(
                entrance.game,
                entrance.key,
              )"
              :key="dest.value"
              :value="dest.value"
            >
              {{ dest.label
              }}{{
                dest.game === 'mm'
                  ? ' (MM)'
                  : dest.game === 'oot'
                    ? ' (OoT)'
                    : ''
              }}
            </option>
          </select>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entrances-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0.75rem;
  color: #e5e7eb;
}

.entrances-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #404040;
}

.entrances-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e5e7eb;
}

.clear-button {
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  background: #4b2020;
  color: #f87171;
  border: 1px solid #7f1d1d;
  border-radius: 0.25rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.clear-button:hover {
  background: #6b2020;
  border-color: #991b1b;
}

.no-entrances {
  text-align: center;
  color: #9ca3af;
  font-size: 0.8rem;
  padding: 1rem;
}

.entrances-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.game-section-header {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  padding: 0.5rem 0 0.25rem;
  border-bottom: 1px solid #333;
}

.entrance-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.3rem 0;
}

.entrance-label {
  font-size: 0.75rem;
  color: #d1d5db;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entrance-select {
  width: 100%;
  padding: 0.3rem 0.4rem;
  font-size: 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  cursor: pointer;
  appearance: auto;
}

.entrance-select:focus {
  outline: 2px solid #60a5fa;
  outline-offset: -1px;
}

.entrance-select:hover {
  border-color: #6b7280;
}
</style>
