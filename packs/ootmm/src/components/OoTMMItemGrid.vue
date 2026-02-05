<script setup lang="ts">
import { computed } from 'vue'
import OoTMMSingleGrid from './OoTMMSingleGrid.vue'

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

const sharedItemIds = [
  'SHARED_BOW',
  'SHARED_BOMB_BAG',
  'SHARED_BOMBCHU',
  'SHARED_MAGIC_UPGRADE',
  'SHARED_ARROW_FIRE',
  'SHARED_ARROW_ICE',
  'SHARED_ARROW_LIGHT',
  'SHARED_HOOKSHOT',
  'SHARED_LENS',
  'SHARED_OCARINA',
  'SHARED_SWORD',
  'SHARED_SHIELD',
  'SHARED_HAMMER',
  'SHARED_STRENGTH',
  'SHARED_SCALE',
  'SHARED_SPIN_UPGRADE',
  'SHARED_BOOTS_IRON',
  'SHARED_BOOTS_HOVER',
  'SHARED_MASK_GORON',
  'SHARED_TUNIC_GORON',
  'SHARED_MASK_ZORA',
  'SHARED_TUNIC_ZORA',
  'SHARED_MASK_BUNNY',
  'SHARED_MASK_KEATON',
  'SHARED_MASK_TRUTH',
  'SHARED_MASK_BLAST',
  'SHARED_MASK_STONE',
  'SHARED_SONG_EPONA',
  'SHARED_SONG_STORMS',
  'SHARED_SONG_TIME',
  'SHARED_SONG_SUN',
  'SHARED_SONG_EMPTINESS',
  'SHARED_WALLET',
  'SHARED_HEART_CONTAINER',
  'SHARED_HEART_PIECE',
  'SHARED_STONE_OF_AGONY',
  'SHARED_SKELETON_KEY',
  'SHARED_SPELL_FIRE',
  'SHARED_SPELL_WIND',
  'SHARED_SPELL_LOVE',
  'SHARED_NUT_UPGRADE',
  'SHARED_STICK_UPGRADE',
  'SHARED_BUTTON_A',
  'SHARED_BUTTON_C_DOWN',
  'SHARED_BUTTON_C_LEFT',
  'SHARED_BUTTON_C_RIGHT',
  'SHARED_BUTTON_C_UP',
  'SHARED_BOTTLE_EMPTY',
  'SHARED_BOTTLE_POTION_RED',
  'SHARED_BOTTLED_GOLD_DUST',
  'SHARED_BOTTLE_CHATEAU',
  'SHARED_BOTTLE_MILK',
  'SHARED_BOTTLE_RUTO_LETTER',
]

const hasSharedSettingItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return false
  for (const id of sharedItemIds) {
    if (props.availableItemIds.has(id)) return true
  }
  return false
})

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

function isItemVisible(itemId: string): boolean {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true
  if (props.availableItemIds.has(itemId)) return true
  if (itemId.startsWith('mm_')) return hasMmItems.value
  if (itemId.startsWith('oot_')) return hasOotItems.value
  return false
}

function filterGridElement(element: unknown): unknown | null {
  if (!element || typeof element !== 'object') return element
  if ((element as { type?: string }).type === 'item') {
    return isItemVisible((element as { item?: string }).item) ? element : null
  }
  if ((element as { type?: string }).type === 'canvas') {
    const content = ((element as { content?: unknown[] }).content || []).filter((child: unknown) => {
      return (child as { type?: string })?.type !== 'item' || isItemVisible((child as { item?: string }).item)
    })
    if (content.length === 0) return null
    return { ...element, content }
  }
  if ((element as { type?: string }).type === 'itemgrid') {
    const rows = ((element as { rows?: string[][] }).rows || [])
      .map((row: string[]) => row.filter((itemId: string) => isItemVisible(itemId)))
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
