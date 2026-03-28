<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import { useDungeonEntrances } from '../composables/useDungeonEntrances';
import type { DungeonEntranceEntry } from '../composables/useDungeonEntrances';
import { selectSearchInputText } from '../utils/input';
import { matchesSearchTerms } from '../utils/search';

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
  const sections = [
    {
      id: 'oot',
      title: 'Ocarina of Time',
      entries: ootEntrances.value,
    },
    {
      id: 'mm',
      title: "Majora's Mask",
      entries: mmEntrances.value,
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      emphasizeSeparation: section.id === 'mm' && hasOotEntrances,
      pools: POOL_SECTIONS.map((pool) => ({
        ...pool,
        entries: section.entries.filter((entry) => entry.pool === pool.id),
      })).filter((pool) => pool.entries.length > 0),
    }))
    .filter((section) => section.pools.length > 0);
});

// --- Searchable destination dropdown logic ---

type DestOption = {
  value: string;
  label: string;
  game: 'oot' | 'mm';
  pool: string;
};

const openDropdownKey = ref<string | null>(null);
const dropdownQuery = ref('');
const dropdownHighlightedIndex = ref(-1);
const dropdownInputRefs = ref<Record<string, HTMLInputElement | null>>({});

function getFilteredDestOptions(
  entrance: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
): DestOption[] {
  const opts = destinationOptionsForEntrance(entrance);
  const query = dropdownQuery.value;
  if (!query.trim()) return opts;
  return opts.filter((opt) =>
    matchesSearchTerms([opt.label, opt.game === 'mm' ? 'MM' : 'OoT'], query),
  );
}

function getDisplayValue(
  srcKey: string,
  entrance: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
): string {
  const dst = getSelectedDestination(srcKey);
  if (!dst) return '';
  const opts = destinationOptionsForEntrance(entrance);
  const opt = opts.find((o) => o.value === dst);
  if (!opt) return '';
  const suffix =
    opt.game === 'mm' ? ' (MM)' : opt.game === 'oot' ? ' (OoT)' : '';
  return opt.label + suffix;
}

function openDropdown(srcKey: string) {
  openDropdownKey.value = srcKey;
  dropdownHighlightedIndex.value = -1;
}

function closeDropdown() {
  openDropdownKey.value = null;
  dropdownQuery.value = '';
  dropdownHighlightedIndex.value = -1;
}

function handleDropdownFocus(srcKey: string) {
  dropdownQuery.value = '';
  openDropdown(srcKey);
}

function handleDropdownClick(srcKey: string) {
  dropdownQuery.value = '';
  openDropdown(srcKey);
  dropdownInputRefs.value[srcKey]?.select();
}

function handleDropdownBlur() {
  closeDropdown();
}

function handleDropdownInput(srcKey: string) {
  openDropdown(srcKey);
  dropdownHighlightedIndex.value = 0;
}

function handleDropdownOptionClick(srcKey: string, destValue: string) {
  setSelectedDestination(srcKey, destValue);
  closeDropdown();
}

function handleClearMapping(srcKey: string) {
  setSelectedDestination(srcKey, '');
  closeDropdown();
}

function handleDropdownKeydown(
  event: KeyboardEvent,
  srcKey: string,
  entrance: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
) {
  const opts = getFilteredDestOptions(entrance);

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (openDropdownKey.value !== srcKey) {
      openDropdown(srcKey);
      return;
    }
    if (opts.length === 0) return;
    dropdownHighlightedIndex.value =
      dropdownHighlightedIndex.value < 0
        ? 0
        : (dropdownHighlightedIndex.value + 1) % opts.length;
    scrollHighlightedIntoView(srcKey);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (openDropdownKey.value !== srcKey) {
      openDropdown(srcKey);
      return;
    }
    if (opts.length === 0) return;
    dropdownHighlightedIndex.value =
      dropdownHighlightedIndex.value < 0
        ? opts.length - 1
        : (dropdownHighlightedIndex.value - 1 + opts.length) % opts.length;
    scrollHighlightedIntoView(srcKey);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (opts.length === 0) {
      closeDropdown();
      return;
    }
    const idx =
      dropdownHighlightedIndex.value >= 0 ? dropdownHighlightedIndex.value : 0;
    const selectedOpt = opts[idx];
    if (selectedOpt) {
      setSelectedDestination(srcKey, selectedOpt.value);
    }
    closeDropdown();
    dropdownInputRefs.value[srcKey]?.blur();
    return;
  }

  if (event.key === 'Tab') {
    if (openDropdownKey.value !== srcKey) return;
    if (opts.length > 0) {
      const idx =
        dropdownHighlightedIndex.value >= 0
          ? dropdownHighlightedIndex.value
          : 0;
      const selectedOpt = opts[idx];
      if (selectedOpt) {
        setSelectedDestination(srcKey, selectedOpt.value);
      }
    }
    closeDropdown();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeDropdown();
    dropdownInputRefs.value[srcKey]?.blur();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!dropdownQuery.value && getSelectedDestination(srcKey)) {
      setSelectedDestination(srcKey, '');
    }
  }
}

function scrollHighlightedIntoView(srcKey: string) {
  nextTick(() => {
    const listbox = document.getElementById(`dest-listbox-${srcKey}`);
    if (!listbox) return;
    const highlighted = listbox.querySelector('.is-highlighted');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });
}

function setDropdownInputRef(srcKey: string, el: unknown) {
  dropdownInputRefs.value[srcKey] = el as HTMLInputElement | null;
}
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

    <div v-else-if="filteredEntrances.length === 0" class="no-entrances">
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
              {{ entrance.label }}
            </label>
            <div class="entrance-select-wrap">
              <input
                :ref="(el) => setDropdownInputRef(entrance.key, el)"
                :value="
                  openDropdownKey === entrance.key
                    ? dropdownQuery
                    : getDisplayValue(entrance.key, entrance)
                "
                class="entrance-select-input"
                :class="{
                  'has-value':
                    !!getSelectedDestination(entrance.key) &&
                    openDropdownKey !== entrance.key,
                }"
                type="text"
                :placeholder="
                  getSelectedDestination(entrance.key) ? '' : '— Not mapped —'
                "
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="openDropdownKey === entrance.key"
                :aria-controls="`dest-listbox-${entrance.key}`"
                @focus="handleDropdownFocus(entrance.key)"
                @click="handleDropdownClick(entrance.key)"
                @input="
                  dropdownQuery = ($event.target as HTMLInputElement).value;
                  handleDropdownInput(entrance.key);
                "
                @blur="handleDropdownBlur()"
                @keydown="handleDropdownKeydown($event, entrance.key, entrance)"
              />
              <button
                v-if="
                  getSelectedDestination(entrance.key) &&
                  openDropdownKey !== entrance.key
                "
                class="entrance-select-clear"
                type="button"
                tabindex="-1"
                title="Clear mapping"
                @mousedown.prevent
                @click="handleClearMapping(entrance.key)"
              >
                ×
              </button>
              <ul
                v-if="openDropdownKey === entrance.key"
                :id="`dest-listbox-${entrance.key}`"
                class="entrance-dest-options"
                role="listbox"
              >
                <li
                  v-for="(dest, index) in getFilteredDestOptions(entrance)"
                  :key="dest.value"
                  class="entrance-dest-option"
                  :class="{
                    'is-highlighted': index === dropdownHighlightedIndex,
                  }"
                  role="option"
                  :aria-selected="index === dropdownHighlightedIndex"
                  @mousedown.prevent
                  @click="handleDropdownOptionClick(entrance.key, dest.value)"
                >
                  <span class="entrance-dest-option-label">{{
                    dest.label
                  }}</span>
                  <span class="entrance-dest-option-game">{{
                    dest.game === 'mm'
                      ? '(MM)'
                      : dest.game === 'oot'
                        ? '(OoT)'
                        : ''
                  }}</span>
                </li>
                <li
                  v-if="getFilteredDestOptions(entrance).length === 0"
                  class="entrance-dest-empty"
                >
                  No destinations found
                </li>
              </ul>
            </div>
          </div>
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

.entrance-select-wrap {
  position: relative;
  width: 100%;
}

.entrance-select-input {
  width: 100%;
  padding: 0.3rem 1.5rem 0.3rem 0.4rem;
  font-size: 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  cursor: text;
  box-sizing: border-box;
}

.entrance-select-input::placeholder {
  color: #6b7280;
}

.entrance-select-input.has-value {
  color: #93c5fd;
}

.entrance-select-input:focus {
  outline: 2px solid #60a5fa;
  outline-offset: -1px;
}

.entrance-select-input:hover {
  border-color: #6b7280;
}

.entrance-select-clear {
  position: absolute;
  right: 0.2rem;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: #9ca3af;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
}

.entrance-select-clear:hover {
  color: #f87171;
}

.entrance-dest-options {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  position: absolute;
  top: calc(100% + 0.2rem);
  left: 0;
  right: 0;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #111827;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.45);
  max-height: min(16rem, 45vh);
  overflow-y: auto;
  z-index: 16;
}

.entrance-dest-option {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0.4rem;
  border-radius: 0.25rem;
  cursor: pointer;
}

.entrance-dest-option:hover,
.entrance-dest-option.is-highlighted {
  background: #1f2937;
}

.entrance-dest-option-label {
  color: #e5e7eb;
  font-size: 0.75rem;
  min-width: 0;
}

.entrance-dest-option-game {
  color: #93c5fd;
  font-size: 0.65rem;
  white-space: nowrap;
}

.entrance-dest-empty {
  color: #9ca3af;
  font-size: 0.72rem;
  padding: 0.3rem 0.4rem;
}
</style>
