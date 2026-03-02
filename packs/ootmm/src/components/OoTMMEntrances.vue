<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import { useDungeonEntrances } from '../composables/useDungeonEntrances';

const {
  sections,
  filteredEntrances,
  reachabilityStats,
  mappingStats,
  ootEntrances,
  mmEntrances,
  destinationOptionsForGame,
  getSelectedDestination,
  setSelectedDestination,
  clearAllOverrides,
  hasAnyOverrides,
} = useDungeonEntrances();

const uiStore = useOoTMMUiStore();
const { entrancesReachabilityFilter, entrancesMappingFilter } =
  storeToRefs(uiStore);

const dungeonSection = computed(
  () => sections.value.find((section) => section.kind === 'dungeon') ?? null,
);

function handleDestinationChange(srcKey: string, dstKey: string) {
  setSelectedDestination(srcKey, dstKey);
}
</script>

<template>
  <div class="entrances-panel">
    <div v-if="sections.length > 0" class="entrances-header">
      <h3 class="entrances-title">
        {{ dungeonSection?.title ?? 'Dungeon Entrances' }}
      </h3>
      <button
        v-if="hasAnyOverrides"
        type="button"
        class="clear-button"
        @click="clearAllOverrides"
      >
        Clear All
      </button>
    </div>

    <div v-if="sections.length > 0" class="entrances-filters">
      <div class="filters-label">Entrances</div>
      <div
        class="segment-group"
        role="group"
        aria-label="Entrance reachability filter"
      >
        <button
          class="segment"
          :class="{ active: entrancesReachabilityFilter === 'all' }"
          @click="entrancesReachabilityFilter = 'all'"
        >
          All ({{ reachabilityStats.total }})
        </button>
        <button
          class="segment"
          :class="{ active: entrancesReachabilityFilter === 'reachable' }"
          @click="entrancesReachabilityFilter = 'reachable'"
        >
          Reachable ({{ reachabilityStats.reachable }})
        </button>
        <button
          class="segment"
          :class="{ active: entrancesReachabilityFilter === 'unreachable' }"
          @click="entrancesReachabilityFilter = 'unreachable'"
        >
          Unreachable ({{ reachabilityStats.unreachable }})
        </button>
      </div>
      <div
        class="segment-group"
        role="group"
        aria-label="Entrance mapping filter"
      >
        <button
          class="segment"
          :class="{ active: entrancesMappingFilter === 'all' }"
          @click="entrancesMappingFilter = 'all'"
        >
          All ({{ mappingStats.total }})
        </button>
        <button
          class="segment"
          :class="{ active: entrancesMappingFilter === 'unmapped' }"
          @click="entrancesMappingFilter = 'unmapped'"
        >
          Unmapped ({{ mappingStats.unmapped }})
        </button>
        <button
          class="segment"
          :class="{ active: entrancesMappingFilter === 'mapped' }"
          @click="entrancesMappingFilter = 'mapped'"
        >
          Mapped ({{ mappingStats.mapped }})
        </button>
      </div>
    </div>

    <div v-if="sections.length === 0" class="no-entrances">
      <p>
        Enable Dungeon ER in Settings and select dungeon sub-types to configure
        entrance assignments.
      </p>
    </div>

    <div v-else-if="filteredEntrances.length === 0" class="no-entrances">
      <p>No entrances match the current filters.</p>
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

.entrances-filters {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.filters-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #9ca3af;
}

.segment-group {
  display: flex;
  border: 1px solid #374151;
  border-radius: 0.35rem;
  overflow: hidden;
}

.segment {
  flex: 1 1 0;
  border: 0;
  background: #1f2937;
  color: #d1d5db;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.3rem 0.35rem;
  cursor: pointer;
}

.segment + .segment {
  border-left: 1px solid #374151;
}

.segment:hover {
  background: #111827;
}

.segment.active {
  background: #1d4ed8;
  color: #eff6ff;
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
