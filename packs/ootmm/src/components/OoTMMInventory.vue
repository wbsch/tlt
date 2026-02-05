<script setup lang="ts">
import { computed } from 'vue'
import { ITEM_DATABASE } from '../data/items'
import { useSessionState } from '../composables/useSessionState'

const props = defineProps<{
  inventory: Map<string, number>
  availableItemIds?: Set<string>
  itemMaxCounts?: Map<string, number>
}>()

const emit = defineEmits<{
  'update:inventory': [Map<string, number>]
}>()

const searchQuery = useSessionState('inventory.searchQuery', '')
const selectedCategory = useSessionState<string>('inventory.selectedCategory', 'all')

const categories = [
  { value: 'all', label: 'All Items' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'song', label: 'Songs' },
  { value: 'mask', label: 'Masks' },
  { value: 'key', label: 'Keys' },
  { value: 'consumable', label: 'Consumables' },
  { value: 'quest', label: 'Quest' },
  { value: 'dungeon', label: 'Dungeon' },
  { value: 'token', label: 'Tokens' },
  { value: 'soul', label: 'Souls' },
  { value: 'trap', label: 'Traps' },
  { value: 'misc', label: 'Misc' },
]

const filteredItems = computed(() => {
  return ITEM_DATABASE.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
    const matchesAvailability = !props.availableItemIds || props.availableItemIds.size === 0 || props.availableItemIds.has(item.id)
    return matchesSearch && matchesCategory && matchesAvailability
  })
})

function getItemCount(itemId: string): number {
  return props.inventory.get(itemId) || 0
}

function getItemMaxCount(itemId: string, fallback?: number): number {
  return props.itemMaxCounts?.get(itemId) ?? fallback ?? 1
}

function incrementItem(itemId: string) {
  const item = ITEM_DATABASE.find(i => i.id === itemId)
  if (!item) return
  
  const newInventory = new Map(props.inventory)
  const current = newInventory.get(itemId) || 0
  const max = getItemMaxCount(itemId, item.maxCount)
  
  if (current < max) {
    newInventory.set(itemId, current + 1)
    emit('update:inventory', newInventory)
  }
}

function decrementItem(itemId: string) {
  const newInventory = new Map(props.inventory)
  const current = newInventory.get(itemId) || 0
  
  if (current > 0) {
    if (current === 1) {
      newInventory.delete(itemId)
    } else {
      newInventory.set(itemId, current - 1)
    }
    emit('update:inventory', newInventory)
  }
}

function toggleItem(itemId: string) {
  const current = getItemCount(itemId)
  if (current > 0) {
    const newInventory = new Map(props.inventory)
    newInventory.delete(itemId)
    emit('update:inventory', newInventory)
  } else {
    incrementItem(itemId)
  }
}
</script>

<template>
  <div class="inventory-panel">
    <div class="inventory-filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search items..."
        class="search-input"
      />
      
      <select v-model="selectedCategory" class="category-select">
        <option v-for="cat in categories" :key="cat.value" :value="cat.value">
          {{ cat.label }}
        </option>
      </select>
    </div>

    <div class="inventory-grid">
      <div
        v-for="(item, index) in filteredItems"
        :key="`${item.id}-${index}`"
        class="item-card"
        :class="{ 
          owned: getItemCount(item.id) > 0,
          [`category-${item.category}`]: true 
        }"
        @click="toggleItem(item.id)"
      >
        <div class="item-icon">
          {{ item.icon || '📦' }}
        </div>
        <div class="item-info">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-game">{{ item.game.toUpperCase() }}</div>
        </div>
        <div v-if="getItemMaxCount(item.id, item.maxCount) > 1" class="item-count">
          <button 
            :disabled="getItemCount(item.id) === 0"
            class="count-btn"
            @click.stop="decrementItem(item.id)"
          >
            −
          </button>
          <span class="count-value">{{ getItemCount(item.id) }}</span>
          <button 
            :disabled="getItemCount(item.id) >= getItemMaxCount(item.id, item.maxCount)"
            class="count-btn"
            @click.stop="incrementItem(item.id)"
          >
            +
          </button>
        </div>
        <div v-else class="item-checkbox">
          {{ getItemCount(item.id) > 0 ? '✓' : '' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.inventory-filters {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-bottom: 1px solid #404040;
}

.search-input {
  width: 100%;
}

.category-select {
  width: 100%;
}

.inventory-grid {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #1a1a1a;
  border: 2px solid #404040;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
}

.item-card:hover {
  border-color: #3b82f6;
  background: #252525;
}

.item-card.owned {
  border-color: #10b981;
  background: #1a3a2e;
}

.item-icon {
  font-size: 1.5rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.item-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.item-game {
  font-size: 0.75rem;
  color: #9ca3af;
}

.item-count {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.count-btn {
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.count-value {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 600;
}

.item-checkbox {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: #10b981;
}
</style>
