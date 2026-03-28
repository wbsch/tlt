<script setup lang="ts">
import { inject } from 'vue';
import type { StyleValue } from 'vue';
import { itemGridRenderContextKey } from './itemGridSchema';

defineProps<{
  itemId: string;
  style?: StyleValue;
  canvasItem?: boolean;
}>();

const context = inject(itemGridRenderContextKey);

if (!context) {
  throw new Error('OoTMMGridItemTile requires item grid render context');
}
</script>

<template>
  <div
    class="grid-item"
    :class="[context.getGridItemClasses(itemId), { 'canvas-item': canvasItem }]"
    :style="style"
    :title="
      context.isEmptyGridItem(itemId)
        ? undefined
        : context.getGridItemTitle(itemId)
    "
    @click="context.toggleItem(itemId)"
    @contextmenu="context.decrementItem(itemId, $event)"
    @wheel="context.handleItemWheel(itemId, $event)"
  >
    <span
      v-if="context.getItemTextLabel(itemId)"
      class="item-text-label"
    >
      {{ context.getItemTextLabel(itemId) }}
    </span>
    <img
      v-else-if="!context.isEmptyGridItem(itemId)"
      :src="context.getIconSrc(itemId)"
      :alt="itemId"
      class="item-icon"
      :class="{ disabled: context.isItemIconDisabled(itemId) }"
      @error="context.handleImageError"
    />
    <img
      v-if="context.getOverlaySrc(itemId)"
      :src="context.getOverlaySrc(itemId) as string"
      :alt="`${itemId} overlay`"
      class="item-overlay"
      :class="{ disabled: context.isItemIconDisabled(itemId) }"
      @error="context.handleOverlayError"
    />
    <span
      v-if="context.getWheelOverlayText(itemId)"
      class="item-overlay item-wheel-overlay item-text-label item-wheel-text-label"
    >
      {{ context.getWheelOverlayText(itemId) }}
    </span>
    <img
      v-else-if="context.getWheelOverlaySrc(itemId)"
      :src="context.getWheelOverlaySrc(itemId) as string"
      :alt="`${itemId} wheel overlay`"
      class="item-overlay item-wheel-overlay"
      :class="{ disabled: context.isItemIconDisabled(itemId) }"
      @error="context.handleOverlayError"
    />
    <span v-if="context.shouldShowItemCount(itemId)" class="item-count">{{
      context.getGridItemCount(itemId)
    }}</span>
  </div>
</template>

<style scoped>
.grid-item {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  border-radius: 4px;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid transparent;
  box-sizing: border-box;
}

.grid-item:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  z-index: 2;
}

.grid-item.owned {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.grid-item.empty-slot {
  cursor: default;
  background: transparent;
  border-color: transparent;
}

.grid-item.empty-slot:hover {
  background: transparent;
  border-color: transparent;
  z-index: auto;
}

.grid-item.label-item {
  cursor: default;
}

.grid-item.label-item:hover {
  z-index: auto;
}

.grid-item.canvas-item {
  background: transparent;
  border: none;
}

.grid-item.canvas-item:hover {
  background: rgba(59, 130, 246, 0.2);
}

.grid-item.canvas-item.label-item:hover {
  background: transparent;
}

.item-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  transition:
    transform 0.15s ease,
    filter 0.15s ease;
  transform-origin: center;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.item-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
  z-index: 1;
}

.item-wheel-overlay {
  z-index: 2;
}

.item-text-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2px;
  color: #f7edd3;
  font-size: 9px;
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: 0.02em;
  text-align: center;
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.95),
    1px -1px 0 rgba(0, 0, 0, 0.95),
    -1px 1px 0 rgba(0, 0, 0, 0.95),
    1px 1px 0 rgba(0, 0, 0, 0.95);
  box-sizing: border-box;
  user-select: none;
  pointer-events: none;
}

.item-wheel-text-label {
  position: absolute;
  inset: 0;
}

.grid-item:hover .item-icon,
.grid-item:focus-visible .item-icon,
.grid-item:focus .item-icon {
  will-change: transform;
  transform: translateZ(0) scale(1.12);
}

.grid-item.label-item:hover .item-icon,
.grid-item.label-item:focus-visible .item-icon,
.grid-item.label-item:focus .item-icon {
  will-change: auto;
  transform: translateZ(0);
}

.item-icon.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.item-overlay.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.grid-item.owned .item-icon {
  filter: none;
}

.item-count {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 2px;
  min-width: 14px;
  text-align: center;
  z-index: 3;
}
</style>
