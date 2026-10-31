<script setup lang="ts">
import { computed, inject } from 'vue';
import {
  itemGridRenderContextKey,
  type ResolvedItemList,
} from './itemGridSchema';

defineOptions({
  name: 'OoTMMGridItemList',
});

const props = defineProps<{
  node: ResolvedItemList;
  parentScale: number;
}>();

const context = inject(itemGridRenderContextKey);

if (!context) {
  throw new Error('OoTMMGridItemList requires item grid render context');
}

const listStyle = computed(() => {
  const margin = context.parseMargin(props.node.margin);
  return {
    margin: `${margin.y}px ${margin.x}px`,
  };
});

const iconSize = computed(() => `${20 * props.parentScale}px`);
</script>

<template>
  <div class="item-list" :style="listStyle">
    <div
      v-for="(itemId, idx) in node.items"
      :key="`${itemId}-${idx}`"
      class="item-list-row"
      :class="context.getGridItemClasses(itemId)"
      :data-grid-item-id="itemId"
      :title="context.getGridItemTitle(itemId)"
      @click="context.toggleItem(itemId)"
      @contextmenu.prevent="context.decrementItem(itemId, $event)"
    >
      <img
        :src="context.getIconSrc(itemId)"
        :alt="itemId"
        class="item-list-icon"
        :class="{ disabled: context.isItemIconDisabled(itemId) }"
        :style="{ width: iconSize, height: iconSize }"
        @error="context.handleImageError"
      />
      <span class="item-list-name">{{ context.getGridItemTitle(itemId) }}</span>
      <span
        v-if="context.shouldShowItemCount(itemId)"
        class="item-list-count"
        >{{ context.getGridItemCount(itemId) }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.item-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  box-sizing: border-box;
}

.item-list-row:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}

.item-list-row.owned {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.item-list-row.owned:hover {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(16, 185, 129, 0.5);
}

.item-list-icon {
  flex: 0 0 auto;
  object-fit: contain;
  image-rendering: pixelated;
}

.item-list-icon.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.item-list-row.owned > .item-list-icon {
  filter: none;
}

.item-list-name {
  min-width: 0;
  overflow: hidden;
  color: #e5e5e5;
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-list-row:not(.owned) > .item-list-name {
  color: rgba(229, 229, 229, 0.7);
}

.item-list-count {
  flex: 0 0 auto;
  margin-left: auto;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
</style>
