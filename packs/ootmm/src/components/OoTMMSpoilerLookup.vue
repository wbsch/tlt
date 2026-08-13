<script setup lang="ts">
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { computed, ref } from 'vue';
import { ITEM_DATABASE } from '../data/items';
import { GI_ITEM_LIST } from '../data/giItems';
import { getRegionDisplayName } from '../data/regionNames';
import SpoilerSearchCombobox from './SpoilerSearchCombobox.vue';
import type { ResolvedSpoilerPlacement } from '../types';

const sessionStore = useOoTMMSessionStore();

// ── Mode state ──
type LookupMode = 'item' | 'location';
const mode = ref<LookupMode>('item');
const selectedItemId = ref('');
const selectedLocationId = ref('');

// ── Derived maps ──

/** All unique item IDs present in this seed's placements. */
const seedItemIds = computed(() => {
  const ids = new Set<string>();
  for (const p of sessionStore.spoilerPlacements) ids.add(p.itemId);
  return ids;
});

/** All unique location IDs present in this seed's placements. */
const seedLocationIds = computed(() => {
  const ids = new Set<string>();
  for (const p of sessionStore.spoilerPlacements) ids.add(p.locationId);
  return ids;
});

/** O(1) lookup: locationId → ResolvedSpoilerPlacement (first placement wins). */
const placementByLocationId = computed(() => {
  const map = new Map<string, ResolvedSpoilerPlacement>();
  for (const p of sessionStore.spoilerPlacements) {
    if (!map.has(p.locationId)) map.set(p.locationId, p);
  }
  return map;
});

/** Name lookup: itemId → name (ITEM_DATABASE → GI_ITEM_LIST → placement fallback). */
const itemNameById = computed(() => {
  const map = new Map<string, string>();
  for (const item of ITEM_DATABASE) map.set(item.id, item.name);
  for (const item of GI_ITEM_LIST) {
    if (!map.has(item.id)) map.set(item.id, item.name);
  }
  for (const p of sessionStore.spoilerPlacements) {
    if (!map.has(p.itemId)) map.set(p.itemId, p.itemName);
  }
  return map;
});

/** Icon lookup: itemId → icon emoji (from ITEM_DATABASE). */
const itemIconById = computed(() => {
  const map = new Map<string, string>();
  for (const item of ITEM_DATABASE) {
    if (item.icon) map.set(item.id, item.icon);
  }
  return map;
});

// ── Option lists (seed-only) ──

const itemOptions = computed(() =>
  Array.from(seedItemIds.value)
    .map((id) => ({
      value: id,
      label: itemNameById.value.get(id) ?? id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

const locationOptions = computed(() =>
  Array.from(seedLocationIds.value)
    .map((id) => ({
      value: id,
      label: placementByLocationId.value.get(id)?.locationName ?? id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

// ── Results ──

const foundLocations = computed(() => {
  if (!selectedItemId.value) return [];
  const locationIds =
    sessionStore.spoilerItemToLocationIds[selectedItemId.value] ?? [];
  return locationIds.map((locId) => {
    const placement = placementByLocationId.value.get(locId);
    return {
      id: locId,
      name: placement?.locationName ?? locId,
      region: regionDisplayFor(locId),
    };
  });
});

const foundItemId = computed(() => {
  if (!selectedLocationId.value) return null;
  return sessionStore.spoilerLocationToItemId[selectedLocationId.value] ?? null;
});

const foundItemName = computed(() => {
  if (!foundItemId.value) return null;
  return itemNameById.value.get(foundItemId.value) ?? foundItemId.value;
});

const foundItemIcon = computed(() => {
  if (!foundItemId.value) return null;
  return itemIconById.value.get(foundItemId.value) ?? null;
});

const selectedItemName = computed(() => {
  if (!selectedItemId.value) return null;
  return itemNameById.value.get(selectedItemId.value) ?? selectedItemId.value;
});

const selectedItemIcon = computed(() => {
  if (!selectedItemId.value) return null;
  return itemIconById.value.get(selectedItemId.value) ?? null;
});

const selectedLocationName = computed(() => {
  if (!selectedLocationId.value) return null;
  return (
    placementByLocationId.value.get(selectedLocationId.value)?.locationName ??
    selectedLocationId.value
  );
});

const totalPlacements = computed(() => sessionStore.spoilerPlacements.length);
const hasDebug = computed(() =>
  new URLSearchParams(window.location.search).has('debug'),
);

/** Display name for the tracker-derived hint region of a location, if any. */
function regionDisplayFor(locationId: string): string | undefined {
  const region = sessionStore.regionLocationMap.get(locationId);
  return region ? getRegionDisplayName(region) : undefined;
}

// ── Actions ──

function switchMode(newMode: LookupMode) {
  mode.value = newMode;
  selectedItemId.value = '';
  selectedLocationId.value = '';
}
</script>

<template>
  <div class="spoiler-lookup">
    <!-- Placements-count summary (preserved from stub) -->
    <p v-if="totalPlacements > 0" class="spoiler-summary">
      {{ totalPlacements }} item placements loaded.
    </p>

    <!-- Mode toggle -->
    <div class="spoiler-lookup__mode-toggle">
      <button :class="{ active: mode === 'item' }" @click="switchMode('item')">
        Look up Item
      </button>
      <button
        :class="{ active: mode === 'location' }"
        @click="switchMode('location')"
      >
        Look up Location
      </button>
    </div>

    <!-- Combobox -->
    <SpoilerSearchCombobox
      v-if="mode === 'item'"
      key="item-combobox"
      v-model="selectedItemId"
      :options="itemOptions"
      placeholder="Search items..."
    />
    <SpoilerSearchCombobox
      v-else
      key="location-combobox"
      v-model="selectedLocationId"
      :options="locationOptions"
      placeholder="Search locations..."
    />

    <!-- Results: Item mode -->
    <div v-if="mode === 'item' && selectedItemId" class="spoiler-result">
      <div class="spoiler-result__header">
        <span v-if="selectedItemIcon" class="spoiler-result__item-icon">{{
          selectedItemIcon
        }}</span>
        <strong>{{ selectedItemName }}</strong>
      </div>
      <p class="spoiler-result__label">Found at:</p>
      <ul class="spoiler-result__locations">
        <li v-for="loc in foundLocations" :key="loc.id">
          {{ loc.name }}
          <span v-if="loc.region" class="spoiler-result__region"
            >({{ loc.region }})</span
          >
        </li>
      </ul>
      <p v-if="foundLocations.length === 0" class="spoiler-result__empty">
        This item is not placed at any known location (check may be starting
        inventory or junk).
      </p>
    </div>

    <!-- Results: Location mode -->
    <div
      v-if="mode === 'location' && selectedLocationId"
      class="spoiler-result"
    >
      <div class="spoiler-result__header">
        <strong>{{ selectedLocationName }}</strong>
      </div>
      <p class="spoiler-result__label">Contains:</p>
      <p v-if="foundItemName" class="spoiler-result__item">
        <span v-if="foundItemIcon" class="spoiler-result__item-icon">{{
          foundItemIcon
        }}</span>
        {{ foundItemName }}
      </p>
      <p v-else class="spoiler-result__empty">
        No spoiler data for this location.
      </p>
    </div>

    <!-- Debug table (preserved) -->
    <table v-if="hasDebug && totalPlacements > 0" class="debug-table">
      <thead>
        <tr>
          <th>Location</th>
          <th>Item</th>
          <th>Region</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in sessionStore.spoilerPlacements" :key="i">
          <td>{{ p.locationName }} ({{ p.locationId }})</td>
          <td>{{ p.itemName }} ({{ p.itemId }})</td>
          <td>{{ regionDisplayFor(p.locationId) ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.spoiler-lookup {
  padding: 12px;
}
.spoiler-summary {
  margin: 0 0 8px;
  font-size: 0.85em;
  color: #888;
}

/* ── Mode toggle ── */
.spoiler-lookup__mode-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 8px;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  overflow: hidden;
  width: fit-content;
}

.spoiler-lookup__mode-toggle button {
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.spoiler-lookup__mode-toggle button:not(:last-child) {
  border-right: 1px solid #4b5563;
}

.spoiler-lookup__mode-toggle button:hover {
  background: #1f2937;
  color: #e5e7eb;
}

.spoiler-lookup__mode-toggle button.active {
  background: #1f2937;
  color: #60a5fa;
}

/* ── Results ── */
.spoiler-result {
  margin-top: 10px;
  padding: 8px;
  background: #111827;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
}

.spoiler-result__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 6px;
  color: #e5e7eb;
  font-size: 0.85rem;
}

.spoiler-result__item-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.spoiler-result__label {
  margin: 0 0 4px;
  font-size: 0.72rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.spoiler-result__locations {
  list-style: none;
  margin: 0;
  padding: 0;
}

.spoiler-result__locations li {
  padding: 2px 0;
  font-size: 0.78rem;
  color: #d1d5db;
}

.spoiler-result__region {
  color: #6b7280;
  font-size: 0.7rem;
}

.spoiler-result__item {
  margin: 0;
  font-size: 0.85rem;
  color: #93c5fd;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.spoiler-result__empty {
  margin: 0;
  font-size: 0.75rem;
  color: #6b7280;
  font-style: italic;
}

/* ── Debug table ── */
.debug-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75em;
  margin-top: 12px;
}
.debug-table th,
.debug-table td {
  border: 1px solid #4b5563;
  padding: 3px 6px;
  text-align: left;
  color: #9ca3af;
}
.debug-table th {
  background: #1f2937;
  font-weight: 600;
  color: #d1d5db;
}
</style>
