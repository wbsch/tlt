<script setup lang="ts">
import { computed, ref } from 'vue';
import { ITEM_DATABASE } from '../data/items';
import { GI_ITEM_LIST } from '../data/giItems';
import { getItemIcon } from '../data/itemIcons';
import itemGrids from '../data/itemGrids.json';
import { collectAllGridItemIds } from '../utils/itemGridRef';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    includeJunk?: boolean;
  }>(),
  {
    includeJunk: true,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const searchQuery = ref('');
const isOpen = ref(false);

/** Set of all item IDs referenced in the item grid layouts. */
const allGridItemIds = computed(() => collectAllGridItemIds(itemGrids));

/** Items that appear in the Item Grid (deduplicated, first appearance only for progressive) */
const gridItems = computed(() => {
  const gridIds = allGridItemIds.value;
  const seenIds = new Set<string>();
  const items: Array<{ id: string; name: string; iconPath: string | null }> =
    [];

  // First pass: GI_ITEM_LIST for the ordering
  for (const gi of GI_ITEM_LIST) {
    if (seenIds.has(gi.id) || !gridIds.has(gi.id)) continue;
    seenIds.add(gi.id);
    const iconPath = getItemIcon(gi.id);
    items.push({ id: gi.id, name: gi.name, iconPath });
  }

  // Add any ITEM_DATABASE items not in GI_ITEM_LIST
  for (const item of ITEM_DATABASE) {
    if (seenIds.has(item.id) || !gridIds.has(item.id)) continue;
    seenIds.add(item.id);
    const iconPath = getItemIcon(item.id);
    items.push({ id: item.id, name: item.name, iconPath });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
});

const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return gridItems.value;
  const q = searchQuery.value.toLowerCase();
  return gridItems.value.filter(
    (item) =>
      item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
  );
});

function selectItem(itemId: string) {
  emit('update:modelValue', itemId);
  isOpen.value = false;
  searchQuery.value = '';
}

function selectJunk() {
  emit('update:modelValue', 'JUNK');
  isOpen.value = false;
  searchQuery.value = '';
}

function toggleOpen() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    searchQuery.value = '';
  }
}

function handleClear() {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="hint-item-picker">
    <div class="hint-item-picker__selected" @click="toggleOpen">
      <template v-if="modelValue && modelValue !== 'JUNK'">
        <img
          v-if="modelValue && getItemIcon(modelValue)"
          :src="getItemIcon(modelValue)"
          class="hint-item-picker__icon"
          alt=""
        />
        <span class="hint-item-picker__name">{{
          gridItems.find((i) => i.id === modelValue)?.name ?? modelValue
        }}</span>
      </template>
      <template v-else-if="modelValue === 'JUNK'">
        <img
          src="/images/crossed_out.png"
          class="hint-item-picker__icon"
          alt=""
        />
        <span class="hint-item-picker__name">Junk</span>
      </template>
      <span v-else class="hint-item-picker__placeholder">Select item...</span>
      <span
        v-if="modelValue"
        class="hint-item-picker__clear"
        @click.stop="handleClear"
        >&times;</span
      >
    </div>

    <div v-if="isOpen" class="hint-item-picker__dropdown">
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="search"
        class="hint-item-picker__search"
        placeholder="Search items..."
        autofocus
      />
      <div class="hint-item-picker__grid">
        <!-- Junk option -->
        <button
          v-if="includeJunk"
          class="hint-item-picker__grid-item"
          :class="{ selected: modelValue === 'JUNK' }"
          @click="selectJunk"
          title="Junk"
        >
          <img
            src="/images/crossed_out.png"
            class="hint-item-picker__icon"
            alt="Junk"
          />
          <span class="hint-item-picker__grid-label">Junk</span>
        </button>

        <button
          v-for="item in filteredItems"
          :key="item.id"
          class="hint-item-picker__grid-item"
          :class="{ selected: modelValue === item.id }"
          @click="selectItem(item.id)"
          :title="item.name"
        >
          <img
            v-if="item.iconPath"
            :src="item.iconPath"
            class="hint-item-picker__icon"
            :alt="item.name"
          />
          <span
            v-else
            class="hint-item-picker__icon hint-item-picker__icon--fallback"
            >?</span
          >
          <span class="hint-item-picker__grid-label">{{ item.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-item-picker {
  position: relative;
  font-size: 0.85rem;
}

.hint-item-picker__selected {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  background: #2a2a2a;
  min-height: 32px;
}

.hint-item-picker__selected:hover {
  border-color: #777;
}

.hint-item-picker__placeholder {
  color: #888;
  font-style: italic;
}

.hint-item-picker__name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint-item-picker__clear {
  color: #888;
  cursor: pointer;
  font-size: 1.1em;
  padding: 0 2px;
}

.hint-item-picker__clear:hover {
  color: #ccc;
}

.hint-item-picker__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 4px;
  margin-top: 2px;
  max-height: 300px;
  display: flex;
  flex-direction: column;
}

.hint-item-picker__search {
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-bottom: 1px solid #444;
  background: #333;
  color: #ddd;
  outline: none;
  box-sizing: border-box;
}

.hint-item-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 4px;
  padding: 6px;
  overflow-y: auto;
  max-height: 250px;
}

.hint-item-picker__grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: #ccc;
  font-size: 0.75rem;
  transition: background 0.1s;
}

.hint-item-picker__grid-item:hover {
  background: #3a3a3a;
  border-color: #666;
}

.hint-item-picker__grid-item.selected {
  background: #2a4a6a;
  border-color: #4a8ac0;
}

.hint-item-picker__icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.hint-item-picker__icon--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333;
  border-radius: 4px;
  font-size: 1rem;
}

.hint-item-picker__grid-label {
  text-align: center;
  word-break: break-word;
  line-height: 1.1;
}
</style>
