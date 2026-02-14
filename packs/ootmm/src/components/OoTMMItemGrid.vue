<script setup lang="ts">
import { computed } from 'vue'
import OoTMMSingleGrid from './OoTMMSingleGrid.vue'
import { resolveItemGridRef } from '../utils/itemGridRef'

// Import the grid layout JSON
import itemGridsData from '../../../../item_grids.json'

interface GridArray {
  type: 'array'
  orientation: 'vertical' | 'horizontal'
  margin?: string
  scale?: number
  content: unknown[]
}

const props = defineProps<{
  inventory: Map<string, number>
  availableItemIds?: Set<string>
  itemMaxCounts?: Map<string, number>
}>()

const emit = defineEmits<{
  'update:inventory': [Map<string, number>]
}>()

const grids = itemGridsData as Record<string, GridArray>

const sharedGrid = computed(() => grids['item_grid_shared'])
const ootGrid = computed(() => grids['item_grid_tall_oot'])
const mmGrid = computed(() => grids['item_grid_tall_mm'])

const hasOotItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true
  for (const id of props.availableItemIds) {
    if (id.startsWith('OOT_') || id.startsWith('SHARED_')) return true
  }
  return false
})

const hasMmItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true
  for (const id of props.availableItemIds) {
    if (id.startsWith('MM_') || id.startsWith('SHARED_')) return true
  }
  return false
})

const LABEL_KEY_MAP: Record<string, string[]> = {
  oot_foresttemple_label: ['OOT_SMALL_KEY_FOREST', 'OOT_KEY_RING_FOREST', 'OOT_BOSS_KEY_FOREST'],
  oot_firetemple_label: ['OOT_SMALL_KEY_FIRE', 'OOT_KEY_RING_FIRE', 'OOT_BOSS_KEY_FIRE'],
  oot_watertemple_label: ['OOT_SMALL_KEY_WATER', 'OOT_KEY_RING_WATER', 'OOT_BOSS_KEY_WATER'],
  oot_spirittemple_label: [
    'OOT_SMALL_KEY_SPIRIT',
    'OOT_KEY_RING_SPIRIT',
    'OOT_BOSS_KEY_SPIRIT',
    'OOT_RUPEE_SILVER_SPIRIT_CHILD',
    'OOT_POUCH_SILVER_SPIRIT_CHILD',
    'OOT_RUPEE_SILVER_SPIRIT_SUN',
    'OOT_POUCH_SILVER_SPIRIT_SUN',
    'OOT_RUPEE_SILVER_SPIRIT_BOULDERS',
    'OOT_POUCH_SILVER_SPIRIT_BOULDERS',
  ],
  oot_shadowtemple_label: [
    'OOT_SMALL_KEY_SHADOW',
    'OOT_KEY_RING_SHADOW',
    'OOT_BOSS_KEY_SHADOW',
    'OOT_RUPEE_SILVER_SHADOW_SCYTHE',
    'OOT_POUCH_SILVER_SHADOW_SCYTHE',
    'OOT_RUPEE_SILVER_SHADOW_PIT',
    'OOT_POUCH_SILVER_SHADOW_PIT',
    'OOT_RUPEE_SILVER_SHADOW_SPIKES',
    'OOT_POUCH_SILVER_SHADOW_SPIKES',
  ],
  oot_ganoncastle_label: [
    'OOT_SMALL_KEY_GANON',
    'OOT_KEY_RING_GANON',
    'OOT_BOSS_KEY_GANON',
    'OOT_RUPEE_SILVER_GANON_SPIRIT',
    'OOT_POUCH_SILVER_GANON_SPIRIT',
    'OOT_RUPEE_SILVER_GANON_LIGHT',
    'OOT_POUCH_SILVER_GANON_LIGHT',
    'OOT_RUPEE_SILVER_GANON_FIRE',
    'OOT_POUCH_SILVER_GANON_FIRE',
    'OOT_RUPEE_SILVER_GANON_FOREST',
    'OOT_POUCH_SILVER_GANON_FOREST',
  ],
  oot_gerudotraining_label: [
    'OOT_SMALL_KEY_GTG',
    'OOT_KEY_RING_GTG',
    'OOT_RUPEE_SILVER_GTG_SLOPES',
    'OOT_POUCH_SILVER_GTG_SLOPES',
    'OOT_RUPEE_SILVER_GTG_LAVA',
    'OOT_POUCH_SILVER_GTG_LAVA',
    'OOT_RUPEE_SILVER_GTG_WATER',
    'OOT_POUCH_SILVER_GTG_WATER',
  ],
  oot_gerudofortress_label: ['OOT_SMALL_KEY_GF', 'OOT_KEY_RING_GF'],
  oot_well_label: [
    'OOT_SMALL_KEY_BOTW',
    'OOT_KEY_RING_BOTW',
    'OOT_RUPEE_SILVER_BOTW',
    'OOT_POUCH_SILVER_BOTW',
  ],
  oot_chestgame_label: ['OOT_SMALL_KEY_TCG', 'OOT_KEY_RING_TCG'],
  oot_ice_label: [
    'OOT_RUPEE_SILVER_IC_SCYTHE',
    'OOT_POUCH_SILVER_IC_SCYTHE',
    'OOT_RUPEE_SILVER_IC_BLOCK',
    'OOT_POUCH_SILVER_IC_BLOCK',
  ],
  mm_woodfall_label: ['MM_SMALL_KEY_WF', 'MM_KEY_RING_WF', 'MM_BOSS_KEY_WF'],
  mm_snowhead_label: ['MM_SMALL_KEY_SH', 'MM_KEY_RING_SH', 'MM_BOSS_KEY_SH'],
  mm_greatbay_label: ['MM_SMALL_KEY_GB', 'MM_KEY_RING_GB', 'MM_BOSS_KEY_GB'],
  mm_stonetower_label: ['MM_SMALL_KEY_ST', 'MM_KEY_RING_ST', 'MM_BOSS_KEY_ST'],
}

function isItemVisible(itemId: string): boolean {
  if (itemId === 'OOT_SWORD_MASTER') return true
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true
  const labelKeys = LABEL_KEY_MAP[itemId]
  if (labelKeys) {
    for (const keyId of labelKeys) {
      if (props.availableItemIds.has(keyId)) return true
    }
    return false
  }
  if (props.availableItemIds.has(itemId)) return true
  if (itemId.startsWith('mm_')) return hasMmItems.value
  if (itemId.startsWith('oot_')) return hasOotItems.value
  return false
}

function isLabelItem(itemId: string): boolean {
  return Boolean(LABEL_KEY_MAP[itemId])
}

function resolveVisibleItemRef(itemRef: unknown): string | null {
  return resolveItemGridRef(itemRef, (candidate: string) => isItemVisible(candidate))
}

function filterGridRow(row: unknown[]): string[] {
  const visible = row
    .map((itemRef: unknown) => resolveVisibleItemRef(itemRef))
    .filter((itemId: string | null): itemId is string => Boolean(itemId))
  // Don't show rows that only contain labels
  if (visible.length > 0 && visible.every((itemId: string) => isLabelItem(itemId))) {
    return []
  }
  return visible
}

function filterGridElement(element: unknown): unknown | null {
  if (!element || typeof element !== 'object') return element
  if ((element as { type?: string }).type === 'item') {
    const itemId = resolveVisibleItemRef((element as { item?: unknown }).item)
    if (!itemId) return null
    return { ...element, item: itemId }
  }
  if ((element as { type?: string }).type === 'canvas') {
    const content = ((element as { content?: unknown[] }).content || [])
      .map((child: unknown) => filterGridElement(child))
      .filter(Boolean)
    if (content.length === 0) return null
    return { ...element, content }
  }
  if ((element as { type?: string }).type === 'itemgrid') {
    const rows = ((element as { rows?: unknown[][] }).rows || [])
      .map((row: unknown[]) => filterGridRow(row))
      .filter((row: string[]) => row.length > 0)
    if (rows.length === 0) return null
    return { ...element, rows }
  }
  if ((element as { type?: string }).type === 'array') {
    const content = ((element as { content?: unknown[] }).content || [])
      .map((child: unknown) => filterGridElement(child))
      .filter(Boolean)
    if (content.length === 0) return null
    return { ...element, content }
  }
  return element
}

const filteredOotGrid = computed(() => {
  return ootGrid.value ? (filterGridElement(ootGrid.value) as GridArray | null) : null
})

const filteredSharedGrid = computed(() => {
  return sharedGrid.value ? (filterGridElement(sharedGrid.value) as GridArray | null) : null
})

const filteredMmGrid = computed(() => {
  return mmGrid.value ? (filterGridElement(mmGrid.value) as GridArray | null) : null
})

const hasSharedSettingItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return false
  return Boolean(filteredSharedGrid.value)
})

function handleInventoryUpdate(newInventory: Map<string, number>) {
  emit('update:inventory', newInventory)
}
</script>

<template>
  <div class="item-grid-container">
    <div class="dual-grid-wrapper">
      <!-- Shared Items Grid -->
      <div v-if="hasSharedSettingItems && filteredSharedGrid" class="single-grid">
        <div class="grid-header">Shared Items</div>
        <OoTMMSingleGrid
          :inventory="inventory"
          :grid="filteredSharedGrid"
          :item-max-counts="itemMaxCounts"
          @update:inventory="handleInventoryUpdate"
        />
      </div>

      <!-- OoT Grid -->
      <div v-if="filteredOotGrid" class="single-grid">
        <div class="grid-header">Ocarina of Time</div>
        <OoTMMSingleGrid 
          :inventory="inventory"
          :grid="filteredOotGrid"
          :item-max-counts="itemMaxCounts"
          @update:inventory="handleInventoryUpdate"
        />
      </div>
      
      <!-- MM Grid -->
      <div v-if="filteredMmGrid" class="single-grid">
        <div class="grid-header">Majora's Mask</div>
        <OoTMMSingleGrid 
          :inventory="inventory"
          :grid="filteredMmGrid"
          :item-max-counts="itemMaxCounts"
          @update:inventory="handleInventoryUpdate"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-grid-container {
  padding: 8px;
  background: #1a1a1a;
  overflow: auto;
}

.dual-grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: flex-start;
  align-items: flex-start;
}

.single-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grid-header {
  font-size: 16px;
  font-weight: bold;
  color: #e5e5e5;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  text-align: center;
}

@media (max-width: 700px) {
  .item-grid-container {
    padding: 6px;
  }

  .grid-header {
    font-size: 14px;
  }
}
</style>
