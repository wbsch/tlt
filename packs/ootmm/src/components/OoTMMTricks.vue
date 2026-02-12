<script setup lang="ts">
import { ref, computed } from 'vue'
import { TRICKS } from '@ootmm/core/settings/tricks'

const props = defineProps<{
  settings: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:settings': [Record<string, unknown>]
}>()

type Trick = {
  game: 'oot' | 'mm'
  name: string
  glitch?: boolean
  tooltip?: string
  linkVideo?: string
  linkText?: string
}

const ALL_TRICKS = TRICKS as Record<string, Trick>

const searchQuery = ref('')
const selectedGame = ref<'all' | 'oot' | 'mm'>('all')
const showGlitches = ref(false)

const enabledTricks = computed(() => {
  const tricks = props.settings.tricks
  if (Array.isArray(tricks)) {
    return new Set(tricks as string[])
  }
  return new Set<string>()
})

const filteredTricks = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  
  return Object.entries(ALL_TRICKS)
    .filter(([key, trick]) => {
      // Filter by game
      if (selectedGame.value !== 'all' && trick.game !== selectedGame.value) {
        return false
      }
      
      // Filter glitches if not shown
      if (trick.glitch && !showGlitches.value) {
        return false
      }
      
      // Filter by search query
      if (query) {
        const nameMatch = trick.name.toLowerCase().includes(query)
        const keyMatch = key.toLowerCase().includes(query)
        const tooltipMatch = trick.tooltip?.toLowerCase().includes(query) || false
        return nameMatch || keyMatch || tooltipMatch
      }
      
      return true
    })
    .sort((a, b) => {
      // Sort glitches to the bottom
      if (a[1].glitch !== b[1].glitch) {
        return a[1].glitch ? 1 : -1
      }
      // Then sort by name
      return a[1].name.localeCompare(b[1].name)
    })
})

const ootTricksCount = computed(() => {
  return Object.values(ALL_TRICKS).filter(t => t.game === 'oot').length
})

const mmTricksCount = computed(() => {
  return Object.values(ALL_TRICKS).filter(t => t.game === 'mm').length
})

const enabledTricksCount = computed(() => {
  return enabledTricks.value.size
})

function toggleTrick(trickKey: string) {
  const currentTricks = Array.isArray(props.settings.tricks) 
    ? [...(props.settings.tricks as string[])] 
    : []
  
  const index = currentTricks.indexOf(trickKey)
  if (index >= 0) {
    currentTricks.splice(index, 1)
  } else {
    currentTricks.push(trickKey)
  }
  
  emit('update:settings', {
    ...props.settings,
    tricks: currentTricks
  })
}

function enableAll() {
  const allTrickKeys = filteredTricks.value.map(([key]) => key)
  const currentTricks = Array.isArray(props.settings.tricks) 
    ? [...(props.settings.tricks as string[])] 
    : []
  
  const tricksSet = new Set([...currentTricks, ...allTrickKeys])
  
  emit('update:settings', {
    ...props.settings,
    tricks: Array.from(tricksSet)
  })
}

function disableAll() {
  const allTrickKeys = new Set(filteredTricks.value.map(([key]) => key))
  const currentTricks = Array.isArray(props.settings.tricks) 
    ? [...(props.settings.tricks as string[])] 
    : []
  
  const tricksSet = currentTricks.filter(key => !allTrickKeys.has(key))
  
  emit('update:settings', {
    ...props.settings,
    tricks: tricksSet
  })
}

defineExpose({
  hasUnsavedChanges: () => false,
  getLocalSettingsSnapshot: () => props.settings
})
</script>

<template>
  <div class="tricks-panel">
    <div class="tricks-header">
      <h2>Tricks & Glitches</h2>
      <p class="tricks-description">
        Enable tricks and glitches to allow the logic to expect more advanced techniques.
        Enabled: {{ enabledTricksCount }} / {{ Object.keys(ALL_TRICKS).length }}
      </p>
    </div>

    <div class="tricks-filters">
      <div class="filter-row">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search tricks..."
          class="search-input"
        />
        
        <div class="filter-group">
          <label class="filter-label">Game:</label>
          <select v-model="selectedGame" class="filter-select">
            <option value="all">All ({{ Object.keys(ALL_TRICKS).length }})</option>
            <option value="oot">OoT ({{ ootTricksCount }})</option>
            <option value="mm">MM ({{ mmTricksCount }})</option>
          </select>
        </div>

        <label class="checkbox-label">
          <input v-model="showGlitches" type="checkbox" />
          <span>Show Glitches</span>
        </label>
      </div>

      <div class="bulk-actions">
        <button type="button" class="bulk-button" @click="enableAll">
          Enable All Filtered
        </button>
        <button type="button" class="bulk-button" @click="disableAll">
          Disable All Filtered
        </button>
      </div>
    </div>

    <div class="tricks-list">
      <div
        v-for="[key, trick] in filteredTricks"
        :key="key"
        class="trick-item"
        :class="{ 
          enabled: enabledTricks.has(key),
          glitch: trick.glitch 
        }"
      >
        <label class="trick-label">
          <input
            type="checkbox"
            :checked="enabledTricks.has(key)"
            @change="toggleTrick(key)"
          />
          <div class="trick-content">
            <div class="trick-header-row">
              <span class="trick-name">{{ trick.name }}</span>
              <span class="trick-game-badge" :class="trick.game">
                {{ trick.game.toUpperCase() }}
              </span>
              <span v-if="trick.glitch" class="glitch-badge">GLITCH</span>
            </div>
            <p v-if="trick.tooltip" class="trick-tooltip">
              {{ trick.tooltip }}
            </p>
            <div v-if="trick.linkVideo || trick.linkText" class="trick-links">
              <a
                v-if="trick.linkVideo"
                :href="trick.linkVideo"
                target="_blank"
                rel="noopener noreferrer"
                class="trick-link"
                @click.stop
              >
                📹 Video Guide
              </a>
              <a
                v-if="trick.linkText"
                :href="trick.linkText"
                target="_blank"
                rel="noopener noreferrer"
                class="trick-link"
                @click.stop
              >
                📄 Text Guide
              </a>
            </div>
          </div>
        </label>
      </div>

      <div v-if="filteredTricks.length === 0" class="no-results">
        No tricks found matching your filters.
      </div>
    </div>
  </div>
</template>

<style scoped>
.tricks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tricks-header {
  padding: 1rem;
  border-bottom: 1px solid #404040;
}

.tricks-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #e5e7eb;
}

.tricks-description {
  margin: 0;
  font-size: 0.875rem;
  color: #9ca3af;
}

.tricks-filters {
  padding: 1rem;
  border-bottom: 1px solid #404040;
  background: #1f2937;
}

.filter-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.filter-select {
  padding: 0.5rem;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #e5e7eb;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.bulk-actions {
  display: flex;
  gap: 0.5rem;
}

.bulk-button {
  padding: 0.5rem 0.75rem;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.bulk-button:hover {
  background: #4b5563;
}

.tricks-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.trick-item {
  margin-bottom: 0.5rem;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
}

.trick-item:hover {
  background: #111827;
  border-color: #4b5563;
}

.trick-item.enabled {
  background: #1e3a5f;
  border-color: #3b82f6;
}

.trick-item.glitch {
  border-left: 3px solid #dc2626;
}

.trick-label {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.trick-label input[type="checkbox"] {
  margin-top: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;
}

.trick-content {
  flex: 1;
  min-width: 0;
}

.trick-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.trick-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: #f3f4f6;
}

.trick-game-badge {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.trick-game-badge.oot {
  background: #065f46;
  color: #d1fae5;
}

.trick-game-badge.mm {
  background: #7c2d12;
  color: #fed7aa;
}

.glitch-badge {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
  background: #7f1d1d;
  color: #fecaca;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.trick-tooltip {
  margin: 0.5rem 0 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #d1d5db;
}

.trick-links {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.trick-link {
  font-size: 0.75rem;
  color: #60a5fa;
  text-decoration: none;
  transition: color 0.2s ease;
}

.trick-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.no-results {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
}
</style>
