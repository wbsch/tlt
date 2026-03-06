<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { ITEM_DATABASE } from '../data/items';
import type { OoTMMItem } from '../types';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import { matchesSearchTerms } from '../utils/search';
import { selectSearchInputText } from '../utils/input';

const props = defineProps<{
  inventory: Map<string, number>;
  availableItemIds?: Set<string>;
  itemMaxCounts?: Map<string, number>;
}>();

const emit = defineEmits<{
  'update:inventory': [Map<string, number>];
}>();

const uiStore = useOoTMMUiStore();
const {
  inventorySearchQuery: searchQuery,
  inventorySelectedCategory: selectedCategory,
} = storeToRefs(uiStore);

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
];

type InventorySectionKey =
  | 'equipment'
  | 'song'
  | 'mask'
  | 'quest'
  | 'key'
  | 'dungeon'
  | 'token'
  | 'soul-boss'
  | 'soul-enemy'
  | 'soul-npc'
  | 'soul-animal'
  | 'soul-misc'
  | 'consumable'
  | 'trap'
  | 'misc';

type InventorySection = {
  key: InventorySectionKey;
  label: string;
  order: number;
};

type SectionedItem = {
  item: OoTMMItem;
  section: InventorySection;
};

const SECTION_DEFINITIONS: Record<InventorySectionKey, InventorySection> = {
  equipment: { key: 'equipment', label: 'Equipment', order: 1 },
  song: { key: 'song', label: 'Songs', order: 2 },
  mask: { key: 'mask', label: 'Masks', order: 3 },
  quest: { key: 'quest', label: 'Quest', order: 4 },
  key: { key: 'key', label: 'Keys', order: 5 },
  dungeon: { key: 'dungeon', label: 'Dungeon', order: 6 },
  token: { key: 'token', label: 'Tokens', order: 7 },
  'soul-boss': { key: 'soul-boss', label: 'Boss Souls', order: 8 },
  'soul-enemy': { key: 'soul-enemy', label: 'Enemy Souls', order: 9 },
  'soul-npc': { key: 'soul-npc', label: 'NPC Souls', order: 10 },
  'soul-animal': { key: 'soul-animal', label: 'Animal Souls', order: 11 },
  'soul-misc': { key: 'soul-misc', label: 'Misc Souls', order: 12 },
  consumable: { key: 'consumable', label: 'Consumables', order: 13 },
  trap: { key: 'trap', label: 'Traps', order: 14 },
  misc: { key: 'misc', label: 'Misc', order: 15 },
};

const GAME_ORDER: Record<OoTMMItem['game'], number> = {
  shared: 0,
  oot: 1,
  mm: 2,
};

const CATEGORY_SECTION_MAP: Record<
  Exclude<OoTMMItem['category'], 'soul'>,
  InventorySectionKey
> = {
  equipment: 'equipment',
  consumable: 'consumable',
  key: 'key',
  song: 'song',
  mask: 'mask',
  trade: 'quest',
  bottle: 'misc',
  event: 'misc',
  misc: 'misc',
  quest: 'quest',
  trap: 'trap',
  dungeon: 'dungeon',
  token: 'token',
};

function compareItems(left: OoTMMItem, right: OoTMMItem): number {
  const byName = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
  });
  if (byName !== 0) return byName;

  const byGame = GAME_ORDER[left.game] - GAME_ORDER[right.game];
  if (byGame !== 0) return byGame;

  return left.id.localeCompare(right.id);
}

function getSoulSection(itemId: string): InventorySection {
  const soulGroup = itemId.match(/^(?:OOT|MM|SHARED)_SOUL_([^_]+)_/)?.[1];
  switch (soulGroup) {
    case 'BOSS':
      return SECTION_DEFINITIONS['soul-boss'];
    case 'ENEMY':
      return SECTION_DEFINITIONS['soul-enemy'];
    case 'NPC':
      return SECTION_DEFINITIONS['soul-npc'];
    case 'ANIMAL':
      return SECTION_DEFINITIONS['soul-animal'];
    case 'MISC':
      return SECTION_DEFINITIONS['soul-misc'];
    default:
      return SECTION_DEFINITIONS['soul-misc'];
  }
}

function getSectionForItem(item: OoTMMItem): InventorySection {
  if (item.category === 'soul') {
    return getSoulSection(item.id);
  }
  return SECTION_DEFINITIONS[CATEGORY_SECTION_MAP[item.category]];
}

const filteredItems = computed(() => {
  return ITEM_DATABASE.filter((item) => {
    const matchesSearch = matchesSearchTerms([item.name], searchQuery.value);
    const matchesCategory =
      selectedCategory.value === 'all' ||
      item.category === selectedCategory.value;
    const matchesAvailability =
      !props.availableItemIds ||
      props.availableItemIds.size === 0 ||
      props.availableItemIds.has(item.id);
    return matchesSearch && matchesCategory && matchesAvailability;
  });
});

const groupedItems = computed(() => {
  const sections = new Map<InventorySectionKey, SectionedItem[]>();
  for (const item of filteredItems.value) {
    const section = getSectionForItem(item);
    const existing = sections.get(section.key);
    if (existing) {
      existing.push({ item, section });
    } else {
      sections.set(section.key, [{ item, section }]);
    }
  }

  return Array.from(sections.values())
    .map((itemsInSection) => ({
      section: itemsInSection[0].section,
      items: itemsInSection.map(({ item }) => item).sort(compareItems),
    }))
    .sort((left, right) => left.section.order - right.section.order);
});

function getItemCount(itemId: string): number {
  return props.inventory.get(itemId) || 0;
}

function getItemMaxCount(itemId: string, fallback?: number): number {
  return props.itemMaxCounts?.get(itemId) ?? fallback ?? 1;
}

function incrementItem(itemId: string) {
  const item = ITEM_DATABASE.find((i) => i.id === itemId);
  if (!item) return;

  const newInventory = new Map(props.inventory);
  const current = newInventory.get(itemId) || 0;
  const max = getItemMaxCount(itemId, item.maxCount);

  if (current < max) {
    newInventory.set(itemId, current + 1);
    emit('update:inventory', newInventory);
  }
}

function decrementItem(itemId: string) {
  const newInventory = new Map(props.inventory);
  const current = newInventory.get(itemId) || 0;

  if (current > 0) {
    if (current === 1) {
      newInventory.delete(itemId);
    } else {
      newInventory.set(itemId, current - 1);
    }
    emit('update:inventory', newInventory);
  }
}

function toggleItem(itemId: string) {
  const current = getItemCount(itemId);
  if (current > 0) {
    const newInventory = new Map(props.inventory);
    newInventory.delete(itemId);
    emit('update:inventory', newInventory);
  } else {
    incrementItem(itemId);
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
        @focus="selectSearchInputText"
        @click="selectSearchInputText"
      />

      <select v-model="selectedCategory" class="category-select">
        <option v-for="cat in categories" :key="cat.value" :value="cat.value">
          {{ cat.label }}
        </option>
      </select>
    </div>

    <div class="inventory-grid">
      <div
        v-for="group in groupedItems"
        :key="group.section.key"
        class="inventory-section"
      >
        <div class="inventory-section-header">
          {{ group.section.label }}
        </div>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="item-card"
          :data-testid="`inventory-item-card-${item.id}`"
          :class="{
            owned: getItemCount(item.id) > 0,
            [`category-${item.category}`]: true,
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
          <div
            v-if="getItemMaxCount(item.id, item.maxCount) > 1"
            class="item-count"
          >
            <button
              :disabled="getItemCount(item.id) === 0"
              class="count-btn"
              @click.stop="decrementItem(item.id)"
            >
              −
            </button>
            <span class="count-value">{{ getItemCount(item.id) }}</span>
            <button
              :disabled="
                getItemCount(item.id) >= getItemMaxCount(item.id, item.maxCount)
              "
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
  gap: 1rem;
}

.inventory-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inventory-section-header {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9ca3af;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #404040;
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
