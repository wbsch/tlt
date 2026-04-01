<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import { useDungeonEntrances } from '../composables/useDungeonEntrances';
import EntranceDestinationCombobox from './EntranceDestinationCombobox.vue';
import { selectSearchInputText } from '../utils/input';

const {
  sections,
  filteredEntrances,
  reachabilityStats,
  mappingStats,
  ootEntrances,
  mmEntrances,
  destinationOptionsForEntrance,
  getSelectedDestination,
  setSelectedDestination,
  clearAllOverrides,
  hasAnyOverrides,
  filteredExitEntries,
  getExitSelectedDestination,
  setExitDestination,
  destinationOptionsForExit,
} = useDungeonEntrances();

const uiStore = useOoTMMUiStore();
const {
  entrancesReachabilityFilter,
  entrancesMappingFilter,
  entrancesSearchQuery: searchQuery,
} = storeToRefs(uiStore);

const trackedSection = computed(
  () => sections.value.find((section) => section.kind === 'tracked') ?? null,
);

const POOL_SECTIONS = [
  { id: 'dungeon', title: 'Dungeons' },
  { id: 'grotto', title: 'Grottos' },
  { id: 'interior', title: 'Interiors' },
] as const;

const groupedEntrances = computed(() => {
  const hasOotEntrances = ootEntrances.value.length > 0;
  const ootExits = filteredExitEntries.value.filter((e) => e.game === 'oot');
  const mmExits = filteredExitEntries.value.filter((e) => e.game === 'mm');
  const sections = [
    {
      id: 'oot',
      title: 'Ocarina of Time',
      entries: ootEntrances.value,
      exits: ootExits,
    },
    {
      id: 'mm',
      title: "Majora's Mask",
      entries: mmEntrances.value,
      exits: mmExits,
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      emphasizeSeparation: section.id === 'mm' && hasOotEntrances,
      pools: POOL_SECTIONS.map((pool) => ({
        ...pool,
        entries: section.entries.filter((entry) => entry.pool === pool.id),
        exits: section.exits.filter((exit) => exit.pool === pool.id),
      })).filter((pool) => pool.entries.length > 0 || pool.exits.length > 0),
    }))
    .filter((section) => section.pools.length > 0);
});
</script>

<template>
  <div class="entrances-panel">
    <div v-if="sections.length > 0" class="entrances-header">
      <h3 class="entrances-title">
        {{ trackedSection?.title ?? 'Entrances' }}
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
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search entrances..."
        class="search-input"
        @focus="selectSearchInputText"
        @click="selectSearchInputText"
      />

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
        Enable Dungeon ER, Grotto Shuffle, or Interiors Shuffle in Settings to
        configure entrance assignments.
      </p>
    </div>

    <div
      v-else-if="
        filteredEntrances.length === 0 && filteredExitEntries.length === 0
      "
      class="no-entrances"
    >
      <p>No entrances match the current filters.</p>
    </div>

    <div v-else class="entrances-list">
      <section
        v-for="section in groupedEntrances"
        :key="section.id"
        class="game-section"
        :class="[
          `game-section-${section.id}`,
          { 'game-section-emphasis': section.emphasizeSeparation },
        ]"
      >
        <div
          class="game-section-header"
          :class="[
            `game-section-header-${section.id}`,
            { 'game-section-header-emphasis': section.emphasizeSeparation },
          ]"
        >
          <span class="game-section-title">{{ section.title }}</span>
        </div>

        <div
          v-for="pool in section.pools"
          :key="`${section.id}-${pool.id}`"
          class="pool-section"
        >
          <div class="pool-section-header">
            <span>{{ pool.title }}</span>
            <span class="pool-section-count">{{ pool.entries.length }}</span>
          </div>

          <div
            v-for="entrance in pool.entries"
            :key="entrance.key"
            class="entrance-row"
          >
            <label class="entrance-label" :title="entrance.key">
              {{ entrance.displayLabel }}
            </label>
            <EntranceDestinationCombobox
              :dropdown-id="`dest-listbox-${entrance.key}`"
              :options="destinationOptionsForEntrance(entrance)"
              :model-value="getSelectedDestination(entrance.key)"
              @update:model-value="setSelectedDestination(entrance.key, $event)"
            />
          </div>

          <template v-if="pool.exits.length > 0">
            <div class="exit-section-header">Exits</div>
            <div
              v-for="exit in pool.exits"
              :key="exit.key"
              class="entrance-row exit-row"
            >
              <label
                class="entrance-label exit-label"
                :title="exit.sourceEntranceKey"
              >
                {{ exit.label }}
              </label>
              <EntranceDestinationCombobox
                :dropdown-id="`exit-dest-listbox-${exit.key}`"
                :options="destinationOptionsForExit(exit)"
                :model-value="getExitSelectedDestination(exit.key)"
                @update:model-value="setExitDestination(exit.key, $event)"
              />
            </div>
          </template>
        </div>
      </section>
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

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1f2937;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #f3f4f6;
  font-size: 0.875rem;
  margin-bottom: 0.35rem;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
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
  gap: 0.8rem;
}

.game-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.game-section-emphasis {
  margin-top: 0.2rem;
  padding-top: 0.8rem;
  border-top: 2px solid #f59e0b;
}

.game-section-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 0 0.2rem;
  border: 0;
  border-bottom: 1px solid #374151;
  border-radius: 0;
}

.game-section-header-oot {
  color: #cbd5e1;
}

.game-section-header-mm {
  color: #fde68a;
}

.game-section-header-emphasis {
  border-bottom-color: rgb(245 158 11 / 0.5);
}

.game-section-title {
  min-width: 0;
}

.pool-section {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.pool-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.1rem 0.15rem;
  border-bottom: 1px solid #253041;
  color: #9ca3af;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pool-section-count {
  color: #6b7280;
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

.exit-section-header {
  font-size: 0.7rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 0.4rem;
  margin-bottom: 0.15rem;
}

.exit-label {
  color: #9ca3af;
}
</style>
