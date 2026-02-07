<script setup lang="ts">
import { computed } from 'vue'
import type { LocationInfo } from '@/types/tracker'
import { useSessionState } from '../composables/useSessionState'

const props = defineProps<{
  locations: LocationInfo[]
  reachableIds: Set<string>
}>()

const searchQuery = useSessionState('locations.searchQuery', '')
const selectedCategory = useSessionState<string>('locations.selectedCategory', 'all')
const reachabilityFilter = useSessionState<'all' | 'reachable' | 'unreachable'>(
  'locations.reachabilityFilter',
  'all'
)
const showUnshuffled = useSessionState<boolean>('locations.showUnshuffled', false)
const collectionFilter = useSessionState<'all' | 'collected' | 'uncollected'>(
  'locations.collectionFilter',
  'all'
)
const collectedIds = useSessionState<string[]>('locations.collectedIds', [])

const collectedIdSet = computed(() => new Set(collectedIds.value))

const categories = computed(() => {
  const cats = new Set<string>()
  props.locations.forEach(loc => cats.add(loc.category))
  return [
    { value: 'all', label: 'All Categories' },
    ...Array.from(cats).sort().map(cat => ({
      value: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1)
    }))
  ]
})

const baseFilteredLocations = computed(() => {
  return props.locations.filter(loc => {
    const matchesShuffle = showUnshuffled.value || loc.isShuffled !== false
    const matchesSearch = loc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesCategory = selectedCategory.value === 'all' || loc.category === selectedCategory.value
    return matchesShuffle && matchesSearch && matchesCategory
  })
})



const collectionScopedLocations = computed(() => {
  return baseFilteredLocations.value.filter(loc => {
    if (reachabilityFilter.value === 'reachable') {
      return props.reachableIds.has(loc.id)
    }
    if (reachabilityFilter.value === 'unreachable') {
      return !props.reachableIds.has(loc.id)
    }
    return true
  })
})

const filteredLocations = computed(() => {
  return baseFilteredLocations.value.filter(loc => {
    const matchesReachability = reachabilityFilter.value === 'all'
      || (reachabilityFilter.value === 'reachable' && props.reachableIds.has(loc.id))
      || (reachabilityFilter.value === 'unreachable' && !props.reachableIds.has(loc.id))
    const matchesCollection = collectionFilter.value === 'all'
      || (collectionFilter.value === 'collected' && collectedIdSet.value.has(loc.id))
      || (collectionFilter.value === 'uncollected' && !collectedIdSet.value.has(loc.id))
    return matchesReachability && matchesCollection
  })
})

const groupedLocations = computed(() => {
  const groups = new Map<string, LocationInfo[]>()
  
  filteredLocations.value.forEach(loc => {
    const area = loc.area
    if (!groups.has(area)) {
      groups.set(area, [])
    }
    groups.get(area)!.push(loc)
  })
  
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

const stats = computed(() => {
  const total = baseFilteredLocations.value.length
  const reachable = baseFilteredLocations.value.filter(loc => props.reachableIds.has(loc.id)).length
  const unreachable = total - reachable
  return { total, reachable, unreachable }
})

const collectionStats = computed(() => {
  const total = collectionScopedLocations.value.length
  const collected = collectionScopedLocations.value.filter(loc => collectedIdSet.value.has(loc.id)).length
  const uncollected = total - collected
  return { total, collected, uncollected }
})

function toggleCollected(id: string) {
  const next = new Set(collectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  collectedIds.value = Array.from(next)
}
</script>

<template>
  <div class="locations-panel">
    <div class="locations-filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search locations..."
        class="search-input"
      />
      
      <select v-model="selectedCategory" class="category-select">
        <option v-for="cat in categories" :key="cat.value" :value="cat.value">
          {{ cat.label }}
        </option>
      </select>

      <div class="segment-group" role="group" aria-label="Reachability filter">
        <button
          class="segment"
          :class="{ active: reachabilityFilter === 'all' }"
          @click="reachabilityFilter = 'all'"
        >
          All ({{ stats.total }})
        </button>
        <button
          class="segment"
          :class="{ active: reachabilityFilter === 'reachable' }"
          @click="reachabilityFilter = 'reachable'"
        >
          Reachable ({{ stats.reachable }})
        </button>
        <button
          class="segment"
          :class="{ active: reachabilityFilter === 'unreachable' }"
          @click="reachabilityFilter = 'unreachable'"
        >
          Unreachable ({{ stats.unreachable }})
        </button>
      </div>

      <div class="segment-group" role="group" aria-label="Collection filter">
        <button
          class="segment"
          :class="{ active: collectionFilter === 'all' }"
          @click="collectionFilter = 'all'"
        >
          All ({{ collectionStats.total }})
        </button>
        <button
          class="segment"
          :class="{ active: collectionFilter === 'collected' }"
          @click="collectionFilter = 'collected'"
        >
          Collected ({{ collectionStats.collected }})
        </button>
        <button
          class="segment"
          :class="{ active: collectionFilter === 'uncollected' }"
          @click="collectionFilter = 'uncollected'"
        >
          Uncollected ({{ collectionStats.uncollected }})
        </button>
      </div>
    </div>

    <div class="shuffle-toggle">
      <label class="shuffle-toggle-label">
        <input v-model="showUnshuffled" type="checkbox" />
        <span>Show unshuffled locations</span>
      </label>
    </div>

    <div class="locations-list">
      <div v-for="[area, locs] in groupedLocations" :key="area" class="location-group">
        <h3 class="area-name">{{ area }}</h3>
        <div class="locations">
          <div
            v-for="loc in locs"
            :key="loc.id"
            class="location-item"
            :class="{ 
              reachable: reachableIds.has(loc.id),
              collected: collectedIdSet.has(loc.id),
              [`category-${loc.category}`]: true
            }"
            role="button"
            tabindex="0"
            :aria-pressed="collectedIdSet.has(loc.id)"
            @click="toggleCollected(loc.id)"
            @keydown.enter.prevent="toggleCollected(loc.id)"
            @keydown.space.prevent="toggleCollected(loc.id)"
          >
            <div class="location-status">
              <span v-if="reachableIds.has(loc.id)" class="status-dot reachable"></span>
              <span v-else class="status-dot unreachable"></span>
              <span v-if="collectedIdSet.has(loc.id)" class="status-check">✓</span>
            </div>
            <div class="location-info">
              <div class="location-name">{{ loc.name }}</div>
              <div class="location-category">{{ loc.category }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="groupedLocations.length === 0" class="empty-state">
        <p>No locations match your filters</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.locations-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.locations-filters {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-bottom: 1px solid #404040;
}

.shuffle-toggle {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #404040;
}

.shuffle-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #e5e7eb;
}

.shuffle-toggle-label input {
  accent-color: #10b981;
}

.search-input,
.category-select {
  width: 100%;
}

.segment-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.25rem;
}

.segment {
  padding: 0.5rem 0.75rem;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.85rem;
  transition: all 0.15s ease;
}

.segment:hover {
  background: #252525;
}

.segment.active {
  background: #10b9811a;
  border-color: #10b981;
  color: #d1fae5;
  box-shadow: 0 0 0 1px #10b98133;
}

.locations-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.location-group {
  margin-bottom: 1.5rem;
}

.area-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #404040;
}

.locations {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.location-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 0.25rem;
  border-left: 3px solid #404040;
  transition: all 0.2s;
}

.location-item.reachable {
  border-left-color: #10b981;
  background: #1a2e26;
}

.location-item.collected {
  border-left-color: #3b82f6;
  background: #1a2233;
}

.location-item:hover {
  background: #252525;
}

.location-item:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.location-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.status-dot.reachable {
  background: #10b981;
  box-shadow: 0 0 4px #10b981;
}

.status-dot.unreachable {
  background: #6b7280;
}

.status-check {
  font-size: 0.75rem;
  color: #60a5fa;
  font-weight: 700;
}

.location-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.location-name {
  font-size: 0.875rem;
}

.location-category {
  font-size: 0.75rem;
  color: #9ca3af;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #6b7280;
  text-align: center;
}

@media (max-width: 700px) {
  .segment-group {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .segment-group {
    grid-template-columns: 1fr;
  }
}
</style>
