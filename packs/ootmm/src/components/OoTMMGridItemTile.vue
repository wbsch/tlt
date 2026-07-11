<script setup lang="ts">
import { inject, onBeforeUnmount, ref, computed } from 'vue';
import type { StyleValue } from 'vue';
import { itemGridRenderContextKey } from './itemGridSchema';
import OoTMMGridNode from './OoTMMGridNode.vue';

const props = defineProps<{
  itemId: string;
  style?: StyleValue;
  canvasItem?: boolean;
}>();

const injectedContext = inject(itemGridRenderContextKey);

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

let longPressTimer: number | null = null;
let longPressPointerId: number | null = null;
let longPressStartX = 0;
let longPressStartY = 0;
let suppressNextClick = false;
let suppressNextContextMenu = false;
let suppressionResetTimer: number | null = null;

if (!injectedContext) {
  throw new Error('OoTMMGridItemTile requires item grid render context');
}

const context = injectedContext;

const gridItemRef = ref<HTMLElement | null>(null);

const submenuPanelStyle = computed(() => {
  if (!context.isSubmenuOpen(props.itemId) || !gridItemRef.value) {
    return undefined;
  }
  const rect = gridItemRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  // Estimate ~350px for the panel (header + padding + ~6 rows × ~40px)
  const fitsBelow = spaceBelow >= 300;
  const style: Record<string, string> = {
    position: 'fixed',
    left: '16px',
    right: 'auto',
    zIndex: '9999',
  };
  if (fitsBelow) {
    style.top = `${rect.bottom + 8}px`;
  } else {
    style.bottom = `${window.innerHeight - rect.top + 8}px`;
  }
  return style;
});

function clearLongPressState(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressPointerId = null;
}

function scheduleSuppressionReset(): void {
  if (suppressionResetTimer !== null) {
    window.clearTimeout(suppressionResetTimer);
  }

  suppressionResetTimer = window.setTimeout(() => {
    suppressNextClick = false;
    suppressNextContextMenu = false;
    suppressionResetTimer = null;
  }, 1000);
}

function stopSuppressionReset(): void {
  if (suppressionResetTimer !== null) {
    window.clearTimeout(suppressionResetTimer);
    suppressionResetTimer = null;
  }
}

function handleClick(itemId: string, event: MouseEvent): void {
  if (suppressNextClick) {
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  context.toggleItem(itemId);
}

function handleContextMenu(itemId: string, event: MouseEvent): void {
  if (suppressNextContextMenu) {
    suppressNextContextMenu = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  context.decrementItem(itemId, event);
}

function handlePointerDown(itemId: string, event: PointerEvent): void {
  if (event.pointerType !== 'touch') {
    return;
  }
  if (!context.hasWheelOverlayMenu(itemId)) {
    return;
  }

  clearLongPressState();
  longPressPointerId = event.pointerId;
  longPressStartX = event.clientX;
  longPressStartY = event.clientY;
  longPressTimer = window.setTimeout(() => {
    suppressNextClick = true;
    suppressNextContextMenu = true;
    scheduleSuppressionReset();
    context.openWheelOverlayMenu(itemId);
    longPressTimer = null;
  }, LONG_PRESS_DURATION_MS);
}

function handlePointerMove(event: PointerEvent): void {
  if (event.pointerId !== longPressPointerId) {
    return;
  }

  if (
    Math.abs(event.clientX - longPressStartX) > LONG_PRESS_MOVE_TOLERANCE_PX ||
    Math.abs(event.clientY - longPressStartY) > LONG_PRESS_MOVE_TOLERANCE_PX
  ) {
    clearLongPressState();
  }
}

function handlePointerEnd(event: PointerEvent): void {
  if (event.pointerId !== longPressPointerId) {
    return;
  }

  clearLongPressState();
}

onBeforeUnmount(() => {
  stopSuppressionReset();
  clearLongPressState();
});
</script>

<template>
  <div
    ref="gridItemRef"
    class="grid-item"
    :class="[
      context.getGridItemClasses(props.itemId),
      {
        'canvas-item': props.canvasItem,
        'grid-item-submenu': context.isSubmenuItem(props.itemId),
        'grid-item-wheel-menu': context.hasWheelOverlayMenu(props.itemId),
        'grid-item-wheel-menu-open': context.isWheelOverlayMenuOpen(
          props.itemId,
        ),
      },
    ]"
    :style="props.style"
    :data-grid-item-id="props.itemId"
    :title="
      context.isEmptyGridItem(props.itemId)
        ? undefined
        : context.getGridItemTitle(props.itemId)
    "
    @click="handleClick(props.itemId, $event)"
    @contextmenu="handleContextMenu(props.itemId, $event)"
    @wheel="context.handleItemWheel(props.itemId, $event)"
    @pointerdown="handlePointerDown(props.itemId, $event)"
    @pointermove="handlePointerMove($event)"
    @pointerup="handlePointerEnd($event)"
    @pointercancel="handlePointerEnd($event)"
    @pointerleave="handlePointerEnd($event)"
  >
    <span v-if="context.getItemTextLabel(props.itemId)" class="item-text-label">
      {{ context.getItemTextLabel(props.itemId) }}
    </span>
    <img
      v-else-if="!context.isEmptyGridItem(props.itemId)"
      :src="context.getIconSrc(props.itemId)"
      :alt="props.itemId"
      class="item-icon"
      :class="{ disabled: context.isItemIconDisabled(props.itemId) }"
      @error="context.handleImageError"
    />
    <span
      v-if="
        context.getGridIconBadge(props.itemId) &&
        !context.isSubmenuItem(props.itemId)
      "
      class="item-icon-badge"
      :class="{ disabled: context.isItemIconDisabled(props.itemId) }"
    >
      {{ context.getGridIconBadge(props.itemId) }}
    </span>
    <span
      v-if="context.getOverlayText(props.itemId)"
      class="item-overlay item-text-label item-overlay-text-label item-count-overlay-label"
      :class="{
        'item-overlay-text-label-maxed': context.isOverlayMaxed(props.itemId),
        disabled: context.isItemIconDisabled(props.itemId),
      }"
    >
      {{ context.getOverlayText(props.itemId) }}
    </span>
    <img
      v-else-if="context.getOverlaySrc(props.itemId)"
      :src="context.getOverlaySrc(props.itemId) as string"
      :alt="`${props.itemId} overlay`"
      class="item-overlay"
      :class="{ disabled: context.isItemIconDisabled(props.itemId) }"
      @error="context.handleOverlayError"
    />
    <span
      v-if="context.getWheelOverlayText(props.itemId)"
      class="item-overlay item-wheel-overlay item-text-label item-wheel-text-label"
      :class="{ disabled: context.isItemIconDisabled(props.itemId) }"
    >
      {{ context.getWheelOverlayText(props.itemId) }}
    </span>
    <img
      v-else-if="context.getWheelOverlaySrc(props.itemId)"
      :src="context.getWheelOverlaySrc(props.itemId) as string"
      :alt="`${props.itemId} wheel overlay`"
      class="item-overlay item-wheel-overlay"
      :class="{ disabled: context.isItemIconDisabled(props.itemId) }"
      @error="context.handleOverlayError"
    />
    <span v-if="context.shouldShowItemCount(props.itemId)" class="item-count">{{
      context.getGridItemCount(props.itemId)
    }}</span>
    <div v-if="context.isSubmenuItem(props.itemId)" class="submenu-indicator">
      ▼
    </div>
    <Teleport to="body">
      <div
        v-if="context.isWheelOverlayMenuOpen(props.itemId)"
        class="wheel-menu-sheet"
        :data-testid="`grid-wheel-menu-${props.itemId}`"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
        @contextmenu.stop.prevent
        @wheel.stop
      >
        <div
          class="wheel-menu-sheet__backdrop"
          @click.stop="context.closeWheelOverlayMenu()"
        />
        <div class="wheel-menu-sheet__panel">
          <div class="wheel-menu-panel">
            <div class="wheel-menu-panel__header">
              <span class="wheel-menu-panel__title">Choose dungeon</span>
            </div>
            <div class="wheel-menu-panel__options">
              <button
                v-for="option in context.getWheelOverlayMenuOptions(
                  props.itemId,
                )"
                :key="`mobile-${option.stage}`"
                type="button"
                class="wheel-menu-option"
                :class="{
                  'wheel-menu-option-active':
                    context.getWheelOverlayStage(props.itemId) === option.stage,
                  'wheel-menu-option-none': option.stage === 0,
                }"
                :data-testid="`grid-wheel-option-${props.itemId}-${option.stage}`"
                @click.stop="
                  context.setWheelOverlayStage(props.itemId, option.stage)
                "
              >
                <span class="wheel-menu-option__preview">
                  <span
                    v-if="option.label"
                    class="wheel-menu-option__label item-text-label"
                  >
                    {{ option.label }}
                  </span>
                  <img
                    v-else-if="option.iconSrc"
                    :src="option.iconSrc"
                    :alt="option.title"
                    class="wheel-menu-option__icon"
                    @error="context.handleOverlayError"
                  />
                  <span v-else class="wheel-menu-option__empty">None</span>
                </span>
                <span class="wheel-menu-option__title">{{ option.title }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <div
      v-if="context.isWheelOverlayMenuOpen(props.itemId)"
      class="wheel-menu-panel wheel-menu-panel-inline"
      @click.stop
      @mousedown.stop
      @pointerdown.stop
      @contextmenu.stop.prevent
      @wheel.stop
    >
      <div class="wheel-menu-panel__header">
        <span class="wheel-menu-panel__title">Choose dungeon</span>
      </div>
      <div class="wheel-menu-panel__options">
        <button
          v-for="option in context.getWheelOverlayMenuOptions(props.itemId)"
          :key="option.stage"
          type="button"
          class="wheel-menu-option"
          :class="{
            'wheel-menu-option-active':
              context.getWheelOverlayStage(props.itemId) === option.stage,
            'wheel-menu-option-none': option.stage === 0,
          }"
          :data-testid="`grid-wheel-option-${props.itemId}-${option.stage}`"
          @click.stop="context.setWheelOverlayStage(props.itemId, option.stage)"
        >
          <span class="wheel-menu-option__preview">
            <span
              v-if="option.label"
              class="wheel-menu-option__label item-text-label"
            >
              {{ option.label }}
            </span>
            <img
              v-else-if="option.iconSrc"
              :src="option.iconSrc"
              :alt="option.title"
              class="wheel-menu-option__icon"
              @error="context.handleOverlayError"
            />
            <span v-else class="wheel-menu-option__empty">None</span>
          </span>
          <span class="wheel-menu-option__title">{{ option.title }}</span>
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="
          context.isSubmenuItem(props.itemId) &&
          context.isSubmenuOpen(props.itemId)
        "
        class="submenu-panel"
        :style="submenuPanelStyle"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
        @contextmenu.stop.prevent
        @wheel.stop
      >
        <div class="submenu-panel__header">
          <span class="submenu-panel__title">{{
            context.getGridItemTitle(props.itemId)
          }}</span>
        </div>
        <OoTMMGridNode
          v-if="context.getSubmenuNode(props.itemId)"
          :node="
            context.getSubmenuNode(props.itemId) as NonNullable<
              ReturnType<typeof context.getSubmenuNode>
            >
          "
          :parent-scale="1"
        />
      </div>
    </Teleport>
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

.grid-item-wheel-menu-open {
  z-index: 55;
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

.item-overlay-text-label {
  padding: 0 1px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.05em;
  --item-overlay-stroke-color: rgba(0, 0, 0, 0.98);
  text-shadow:
    -1px -1px 0 var(--item-overlay-stroke-color),
    1px -1px 0 var(--item-overlay-stroke-color),
    -1px 1px 0 var(--item-overlay-stroke-color),
    1px 1px 0 var(--item-overlay-stroke-color),
    0 1px 0 var(--item-overlay-stroke-color);
  -webkit-text-stroke: 1px var(--item-overlay-stroke-color);
  paint-order: stroke fill;
}

.item-count-overlay-label {
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 1px 1px 0;
  font-size: 13px;
  text-align: right;
}

.item-overlay-text-label-maxed {
  color: #2fb84f;
  --item-overlay-stroke-color: rgba(0, 0, 0, 0.98);
}

.item-overlay-text-label.disabled {
  filter: grayscale(100%) brightness(0.4);
}

.item-wheel-text-label {
  z-index: 2;
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

.item-icon-badge {
  position: absolute;
  bottom: 1px;
  left: 0;
  right: 0;
  text-align: center;
  color: #f7edd3;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.95),
    1px -1px 0 rgba(0, 0, 0, 0.95),
    -1px 1px 0 rgba(0, 0, 0, 0.95),
    1px 1px 0 rgba(0, 0, 0, 0.95);
  pointer-events: none;
  user-select: none;
  z-index: 3;
  transform-origin: bottom center;
  transform: translateZ(0);
  transition: transform 0.15s ease;
}

.grid-item:hover > .item-icon-badge,
.grid-item:focus-visible > .item-icon-badge,
.grid-item:focus > .item-icon-badge {
  will-change: transform;
  transform: translateZ(0) scale(1.12);
}

.grid-item.label-item:hover > .item-icon-badge,
.grid-item.label-item:focus-visible > .item-icon-badge,
.grid-item.label-item:focus > .item-icon-badge {
  will-change: auto;
  transform: translateZ(0);
}

.item-icon-badge.disabled {
  filter: grayscale(100%) brightness(0.4);
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
  bottom: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.88);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  z-index: 4;
  pointer-events: none;
}

.submenu-panel {
  min-width: 360px;
  max-width: min(420px, calc(100vw - 32px));
  max-height: min(480px, calc(100vh - 100px));
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(244, 214, 89, 0.35);
  background: linear-gradient(180deg, rgb(31, 36, 47), rgb(17, 20, 28));
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  cursor: default;
  overflow-y: auto;
  isolation: isolate;
}

.wheel-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 24px));
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background-color: rgb(17, 20, 28);
  background-image: linear-gradient(180deg, rgb(31, 36, 47), rgb(17, 20, 28));
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  z-index: 45;
  cursor: default;
  overflow-y: auto;
  overscroll-behavior: contain;
  isolation: isolate;
  contain: paint;
}

.wheel-menu-sheet {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.wheel-menu-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(7, 11, 19, 0.78);
}

.wheel-menu-sheet__panel {
  position: relative;
  width: min(100%, 420px);
  max-height: min(70vh, calc(100vh - 24px));
  z-index: 1;
}

.wheel-menu-sheet__panel > .wheel-menu-panel {
  position: relative;
  top: auto;
  right: auto;
  min-width: 0;
  max-width: none;
  max-height: inherit;
}

.wheel-menu-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.wheel-menu-panel__title {
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wheel-menu-panel__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wheel-menu-option {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgb(19, 28, 45);
  color: #f8fafc;
  text-align: left;
}

.wheel-menu-option-active {
  border-color: rgba(96, 165, 250, 0.65);
  background: rgb(30, 41, 59);
}

.wheel-menu-option__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 6px;
  background: rgb(12, 18, 31);
  overflow: hidden;
}

.wheel-menu-option__label {
  font-size: 8px;
}

.wheel-menu-option__icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.wheel-menu-option__empty {
  color: rgba(226, 232, 240, 0.75);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wheel-menu-option__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
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

  .wheel-menu-panel-inline {
    display: none;
  }

  .wheel-menu-sheet {
    display: flex;
  }
}
</style>
