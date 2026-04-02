<script setup lang="ts">
import { inject } from 'vue';
import type { StyleValue } from 'vue';
import { itemGridRenderContextKey } from './itemGridSchema';
import OoTMMGridNode from './OoTMMGridNode.vue';

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
    :class="[
      context.getGridItemClasses(itemId),
      {
        'canvas-item': canvasItem,
        'grid-item-submenu': context.isSubmenuItem(itemId),
      },
    ]"
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
    <div v-if="context.isSubmenuItem(itemId)" class="submenu-indicator">
      <span class="submenu-indicator__dot"></span>
      <span class="submenu-indicator__dot"></span>
      <span class="submenu-indicator__dot"></span>
      <span class="submenu-indicator__dot"></span>
    </div>
    <div
      v-if="context.isSubmenuItem(itemId) && context.isSubmenuOpen(itemId)"
      class="submenu-panel"
      @click.stop
      @mousedown.stop
      @contextmenu.stop.prevent
      @wheel.stop
    >
      <div class="submenu-panel__header">
        <span class="submenu-panel__title">{{ context.getGridItemTitle(itemId) }}</span>
      </div>
      <OoTMMGridNode
        v-if="context.getSubmenuNode(itemId)"
        :node="context.getSubmenuNode(itemId) as NonNullable<ReturnType<typeof context.getSubmenuNode>>"
        :parent-scale="1"
      />
    </div>
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

.grid-item.submenu-item {
  background:
    linear-gradient(180deg, rgba(244, 214, 89, 0.18), rgba(0, 0, 0, 0.32)),
    rgba(0, 0, 0, 0.3);
  border-color: rgba(244, 214, 89, 0.32);
  box-shadow: inset 0 0 0 1px rgba(255, 248, 220, 0.08);
}

.grid-item.submenu-item:hover,
.grid-item.submenu-open {
  background:
    linear-gradient(180deg, rgba(244, 214, 89, 0.24), rgba(59, 130, 246, 0.2)),
    rgba(0, 0, 0, 0.36);
  border-color: rgba(244, 214, 89, 0.56);
}

.grid-item.submenu-open {
  z-index: 50;
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

.grid-item:hover > .item-icon,
.grid-item:focus-visible > .item-icon,
.grid-item:focus > .item-icon {
  will-change: transform;
  transform: translateZ(0) scale(1.12);
}

.grid-item.label-item:hover > .item-icon,
.grid-item.label-item:focus-visible > .item-icon,
.grid-item.label-item:focus > .item-icon {
  will-change: auto;
  transform: translateZ(0);
}

.item-icon.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.item-overlay.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.grid-item.owned > .item-icon {
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

.submenu-indicator {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  grid-template-columns: repeat(2, 3px);
  gap: 1px;
  padding: 2px;
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.16);
  z-index: 4;
  pointer-events: none;
}

.submenu-indicator__dot {
  width: 3px;
  height: 3px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.82);
}

.submenu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 360px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(244, 214, 89, 0.35);
  background:
    linear-gradient(180deg, rgb(31, 36, 47), rgb(17, 20, 28));
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  z-index: 40;
  cursor: default;
  overflow: hidden;
  isolation: isolate;
}

.submenu-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.submenu-panel__title {
  color: #f7edd3;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

@media (max-width: 700px) {
  .submenu-panel {
    right: auto;
    left: 0;
    min-width: 300px;
  }
}
</style>
