<script setup lang="ts">
import {
  getGridItemIcon,
  getGridItemLinkedItemIds,
  getGridItemOverlay,
  getGridItemPreItemPoolToggleItemId,
  hasGridIconVariants,
  startsGridItemUndimmed,
  DEFAULT_ICON,
} from '../data/itemIcons';
import { getItemName } from '../data/items';

//Type definitions
interface GridItem {
  type: 'item';
  item: string;
  margin?: string;
  width?: number;
  height?: number;
  canvas_depth?: number;
  canvas_left?: number;
  canvas_top?: number;
}

interface GridCanvas {
  type: 'canvas';
  width: number;
  height: number;
  margin?: string;
  content: unknown[];
}

interface ItemGrid {
  type: 'itemgrid';
  h_alignment?: string;
  item_margin?: string;
  item_size?: number;
  scale?: number;
  rows: string[][];
}

interface GridArray {
  type: 'array';
  orientation: 'vertical' | 'horizontal';
  margin?: string;
  scale?: number;
  content: unknown[];
}

interface GridItemRefAlias {
  item: string;
  title?: string;
}

interface GridItemMultiActivation {
  item: string;
  title?: string;
  activateAlso: string[];
}

const props = defineProps<{
  inventory: Map<string, number>;
  grid: GridArray;
  gridItemRefs?: Record<string, GridItemRefAlias>;
  gridItemMultiActivations?: Record<string, GridItemMultiActivation>;
  labelItemIds?: string[];
  itemMaxCounts?: Map<string, number>;
  availableItemIds?: Set<string>;
  settings?: Record<string, unknown> | null;
}>();

const emit = defineEmits<{
  'update:inventory': [Map<string, number>];
}>();

function getItemCount(itemId: string): number {
  return props.inventory.get(itemId) || 0;
}

const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';
const GRID_MULTI_ACTIVATE_PREFIX = '__grid_multi_activate__:';

function isGridRefAliasKey(itemId: string): boolean {
  return itemId.startsWith(GRID_REF_ALIAS_PREFIX);
}

function getGridRefAlias(itemId: string): GridItemRefAlias | null {
  if (!isGridRefAliasKey(itemId)) return null;
  const ref = itemId.slice(GRID_REF_ALIAS_PREFIX.length);
  return props.gridItemRefs?.[ref] || null;
}

function isGridMultiActivateKey(itemId: string): boolean {
  return itemId.startsWith(GRID_MULTI_ACTIVATE_PREFIX);
}

function getGridMultiActivation(
  itemId: string,
): GridItemMultiActivation | null {
  if (!isGridMultiActivateKey(itemId)) return null;
  return props.gridItemMultiActivations?.[itemId] || null;
}

function getBaseItemId(itemId: string): string {
  const multiActivation = getGridMultiActivation(itemId);
  if (multiActivation) return multiActivation.item;
  return getGridRefAlias(itemId)?.item || itemId;
}

function getGridItemTitle(itemId: string): string {
  const multiActivation = getGridMultiActivation(itemId);
  if (multiActivation?.title) return multiActivation.title;

  const alias = getGridRefAlias(itemId);
  if (alias?.title) return alias.title;
  return getItemName(getBaseItemId(itemId));
}

function getAdditionalToggleItemIds(itemId: string): string[] {
  return getGridMultiActivation(itemId)?.activateAlso || [];
}

function changeItemCount(
  inventory: Map<string, number>,
  itemId: string,
  delta: number,
) {
  const current = inventory.get(itemId) || 0;
  const next = current + delta;
  if (next > 0) {
    inventory.set(itemId, next);
  } else {
    inventory.delete(itemId);
  }
}

const AUTO_SELECT_ON_OWNED_ITEM_IDS: Record<string, string> = {
  MM_BOTTLE_POTION_BLUE: 'MM_POTION_BLUE',
  MM_BOTTLE_POTION_RED: 'MM_POTION_RED',
  MM_BOTTLE_POTION_GREEN: 'MM_POTION_GREEN',
  OOT_BOTTLE_POTION_BLUE: 'OOT_POTION_BLUE',
  OOT_BOTTLE_POTION_RED: 'OOT_POTION_RED',
  OOT_BOTTLE_POTION_GREEN: 'OOT_POTION_GREEN',
  SHARED_BOTTLE_POTION_BLUE: 'SHARED_POTION_BLUE',
  SHARED_BOTTLE_POTION_RED: 'SHARED_POTION_RED',
  SHARED_BOTTLE_POTION_GREEN: 'SHARED_POTION_GREEN',
};

function syncAutoSelectedItemIds(inventory: Map<string, number>) {
  for (const [sourceItemId, targetItemId] of Object.entries(
    AUTO_SELECT_ON_OWNED_ITEM_IDS,
  )) {
    if ((inventory.get(sourceItemId) || 0) > 0) {
      if ((inventory.get(targetItemId) || 0) <= 0) {
        inventory.set(targetItemId, 1);
      }
    } else {
      inventory.delete(targetItemId);
    }
  }
}

function emitInventoryUpdate(inventory: Map<string, number>) {
  syncAutoSelectedItemIds(inventory);
  emit('update:inventory', inventory);
}

function getLinkedItemIds(itemId: string): string[] | null {
  const baseItemId = getBaseItemId(itemId);
  const linkedItemIds = getGridItemLinkedItemIds(baseItemId, {
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });

  if (!isGridRefAliasKey(itemId)) {
    return linkedItemIds;
  }

  const logicalLinkedItemIds =
    linkedItemIds && linkedItemIds.length > 0 ? linkedItemIds : [baseItemId];

  return logicalLinkedItemIds.map(
    (linkedItemId) => `${GRID_REF_STATE_PREFIX}${itemId}:${linkedItemId}`,
  );
}

function getLogicalLinkedItemIds(itemId: string): string[] | null {
  if (!isGridRefAliasKey(itemId)) {
    return getLinkedItemIds(itemId);
  }

  const baseItemId = getBaseItemId(itemId);
  const linkedItemIds = getGridItemLinkedItemIds(baseItemId, {
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });

  if (linkedItemIds && linkedItemIds.length > 0) {
    return linkedItemIds;
  }

  return [baseItemId];
}

function getGridItemCount(itemId: string): number {
  const linkedItemIds = getLinkedItemIds(itemId);
  if (!linkedItemIds || linkedItemIds.length === 0) {
    let maxCount = getItemCount(getBaseItemId(itemId));
    for (const additionalItemId of getAdditionalToggleItemIds(itemId)) {
      const count = getItemCount(additionalItemId);
      if (count > maxCount) {
        maxCount = count;
      }
    }
    return maxCount;
  }

  for (let i = linkedItemIds.length - 1; i >= 0; i--) {
    if ((props.inventory.get(linkedItemIds[i]) || 0) > 0) {
      return i + 1;
    }
  }

  return 0;
}

function getItemMaxCount(itemId: string): number {
  const linkedItemIds = getLinkedItemIds(itemId);
  if (linkedItemIds && linkedItemIds.length > 0) {
    return linkedItemIds.length;
  }
  const max = props.itemMaxCounts?.get(itemId);
  return max && max > 0 ? max : 1;
}

function hasItem(itemId: string): boolean {
  return getGridItemCount(itemId) > 0;
}

function applyLinkedItemLevel(
  linkedItemIds: string[],
  level: number,
  inventory: Map<string, number>,
) {
  for (const linkedItemId of linkedItemIds) {
    inventory.delete(linkedItemId);
  }

  if (level > 0) {
    const activeItemId = linkedItemIds[level - 1];
    if (activeItemId) {
      inventory.set(activeItemId, 1);
    }
  }
}

function applyGridRefLinkedItemLevel(
  itemId: string,
  linkedItemIds: string[],
  level: number,
  inventory: Map<string, number>,
) {
  const previousLevel = getGridItemCount(itemId);
  const logicalLinkedItemIds = getLogicalLinkedItemIds(itemId);

  applyLinkedItemLevel(linkedItemIds, level, inventory);

  if (!logicalLinkedItemIds || logicalLinkedItemIds.length === 0) {
    return;
  }

  const previousLogicalItemId =
    previousLevel > 0 ? logicalLinkedItemIds[previousLevel - 1] : null;
  const nextLogicalItemId = level > 0 ? logicalLinkedItemIds[level - 1] : null;

  if (previousLogicalItemId && previousLogicalItemId !== nextLogicalItemId) {
    changeItemCount(inventory, previousLogicalItemId, -1);
  }

  if (nextLogicalItemId && nextLogicalItemId !== previousLogicalItemId) {
    changeItemCount(inventory, nextLogicalItemId, 1);
  }
}

function setAdditionalToggleItems(
  itemId: string,
  active: boolean,
  inventory: Map<string, number>,
) {
  const additionalItemIds = getAdditionalToggleItemIds(itemId);
  if (additionalItemIds.length === 0) return;

  for (const additionalItemId of additionalItemIds) {
    if (active) {
      inventory.set(additionalItemId, 1);
    } else {
      inventory.delete(additionalItemId);
    }
  }
}

function isItemOwnedForGrid(itemId: string): boolean {
  if (hasItem(itemId)) return true;

  const baseItemId = getBaseItemId(itemId);

  const preItemPoolToggleItemId = getGridItemPreItemPoolToggleItemId(
    baseItemId,
    {
      maxCount: getItemMaxCount(itemId),
      availableItemIds: props.availableItemIds,
      inventory: props.inventory,
      settings: props.settings,
    },
  );

  return preItemPoolToggleItemId
    ? (props.inventory.get(preItemPoolToggleItemId) || 0) > 0
    : false;
}

function isLabelItem(itemId: string): boolean {
  if (!props.labelItemIds || props.labelItemIds.length === 0) return false;

  const baseItemId = getBaseItemId(itemId);
  return (
    props.labelItemIds.includes(itemId) ||
    props.labelItemIds.includes(baseItemId)
  );
}

function isItemHighlightedForGrid(itemId: string): boolean {
  if (isLabelItem(itemId)) return true;
  if (isItemOwnedForGrid(itemId)) return true;
  return startsGridItemUndimmed(getBaseItemId(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function toggleItem(itemId: string) {
  if (isLabelItem(itemId)) return;

  const newInventory = new Map(props.inventory);
  const current = getGridItemCount(itemId);
  const max = getItemMaxCount(itemId);
  const linkedItemIds = getLinkedItemIds(itemId);
  const baseItemId = getBaseItemId(itemId);

  if (linkedItemIds && linkedItemIds.length > 0) {
    let nextLevel = 0;
    if (current < max) {
      nextLevel = current + 1;
      if (isGridRefAliasKey(itemId)) {
        applyGridRefLinkedItemLevel(
          itemId,
          linkedItemIds,
          nextLevel,
          newInventory,
        );
      } else {
        applyLinkedItemLevel(linkedItemIds, nextLevel, newInventory);
      }
    } else {
      if (isGridRefAliasKey(itemId)) {
        applyGridRefLinkedItemLevel(itemId, linkedItemIds, 0, newInventory);
      } else {
        applyLinkedItemLevel(linkedItemIds, 0, newInventory);
      }
    }
    setAdditionalToggleItems(itemId, nextLevel > 0, newInventory);
    emitInventoryUpdate(newInventory);
    return;
  }

  const preItemPoolToggleItemId = getGridItemPreItemPoolToggleItemId(
    baseItemId,
    {
      maxCount: max,
      availableItemIds: props.availableItemIds,
      inventory: props.inventory,
      settings: props.settings,
    },
  );
  const preItemPoolToggleActive = preItemPoolToggleItemId
    ? (newInventory.get(preItemPoolToggleItemId) || 0) > 0
    : false;

  if (preItemPoolToggleItemId) {
    if (current <= 0 && !preItemPoolToggleActive) {
      newInventory.set(preItemPoolToggleItemId, 1);
      setAdditionalToggleItems(itemId, false, newInventory);
      emitInventoryUpdate(newInventory);
      return;
    }

    if (current < max) {
      newInventory.set(baseItemId, current + 1);
      newInventory.set(preItemPoolToggleItemId, 1);
      setAdditionalToggleItems(itemId, true, newInventory);
    } else {
      newInventory.delete(baseItemId);
      newInventory.delete(preItemPoolToggleItemId);
      setAdditionalToggleItems(itemId, false, newInventory);
    }

    emitInventoryUpdate(newInventory);
    return;
  }

  if (max <= 1) {
    if (current > 0) {
      newInventory.delete(baseItemId);
      setAdditionalToggleItems(itemId, false, newInventory);
    } else {
      newInventory.set(baseItemId, 1);
      setAdditionalToggleItems(itemId, true, newInventory);
    }
    emitInventoryUpdate(newInventory);
    return;
  }

  if (current < max) {
    newInventory.set(baseItemId, current + 1);
    setAdditionalToggleItems(itemId, true, newInventory);
  } else {
    // at or above max: wrap around to 0 (remove the item)
    newInventory.delete(baseItemId);
    setAdditionalToggleItems(itemId, false, newInventory);
  }

  emitInventoryUpdate(newInventory);
}

function decrementItem(itemId: string, event: MouseEvent) {
  event.preventDefault();
  if (isLabelItem(itemId)) return;

  const newInventory = new Map(props.inventory);
  const current = getGridItemCount(itemId);
  const max = getItemMaxCount(itemId);
  const linkedItemIds = getLinkedItemIds(itemId);
  const baseItemId = getBaseItemId(itemId);

  if (linkedItemIds && linkedItemIds.length > 0) {
    let nextLevel = max;
    if (current > 0) {
      nextLevel = current - 1;
      if (isGridRefAliasKey(itemId)) {
        applyGridRefLinkedItemLevel(
          itemId,
          linkedItemIds,
          nextLevel,
          newInventory,
        );
      } else {
        applyLinkedItemLevel(linkedItemIds, nextLevel, newInventory);
      }
    } else {
      if (isGridRefAliasKey(itemId)) {
        applyGridRefLinkedItemLevel(itemId, linkedItemIds, max, newInventory);
      } else {
        applyLinkedItemLevel(linkedItemIds, max, newInventory);
      }
    }
    setAdditionalToggleItems(itemId, nextLevel > 0, newInventory);
    emitInventoryUpdate(newInventory);
    return;
  }

  const preItemPoolToggleItemId = getGridItemPreItemPoolToggleItemId(
    baseItemId,
    {
      maxCount: max,
      availableItemIds: props.availableItemIds,
      inventory: props.inventory,
      settings: props.settings,
    },
  );
  const preItemPoolToggleActive = preItemPoolToggleItemId
    ? (newInventory.get(preItemPoolToggleItemId) || 0) > 0
    : false;

  if (preItemPoolToggleItemId) {
    if (current > 1) {
      newInventory.set(baseItemId, current - 1);
      newInventory.set(preItemPoolToggleItemId, 1);
      setAdditionalToggleItems(itemId, true, newInventory);
    } else if (current === 1) {
      newInventory.delete(baseItemId);
      newInventory.set(preItemPoolToggleItemId, 1);
      setAdditionalToggleItems(itemId, false, newInventory);
    } else if (preItemPoolToggleActive) {
      newInventory.delete(preItemPoolToggleItemId);
      setAdditionalToggleItems(itemId, false, newInventory);
    } else {
      newInventory.set(baseItemId, max);
      newInventory.set(preItemPoolToggleItemId, 1);
      setAdditionalToggleItems(itemId, true, newInventory);
    }
    emitInventoryUpdate(newInventory);
    return;
  }

  if (current > 1) {
    newInventory.set(baseItemId, current - 1);
    setAdditionalToggleItems(itemId, true, newInventory);
  } else if (current === 1) {
    newInventory.delete(baseItemId);
    setAdditionalToggleItems(itemId, false, newInventory);
  } else {
    // current is 0: wrap to max
    newInventory.set(baseItemId, max);
    setAdditionalToggleItems(itemId, true, newInventory);
  }
  emitInventoryUpdate(newInventory);
}

function parseMargin(margin?: string): { x: number; y: number } {
  if (!margin) return { x: 1, y: 1 };
  const [x, y] = margin.split(',').map(Number);
  return { x: x || 1, y: y || 1 };
}

function getIconSrc(itemId: string): string {
  const baseItemId = getBaseItemId(itemId);
  return getGridItemIcon(baseItemId, getGridItemCount(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function getOverlaySrc(itemId: string): string | null {
  const baseItemId = getBaseItemId(itemId);
  return getGridItemOverlay(baseItemId, getGridItemCount(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function shouldShowItemCount(itemId: string): boolean {
  return (
    getGridItemCount(itemId) > 1 &&
    !hasGridIconVariants(getBaseItemId(itemId), {
      maxCount: getItemMaxCount(itemId),
      availableItemIds: props.availableItemIds,
      inventory: props.inventory,
      settings: props.settings,
    })
  );
}

function isItemIconDisabled(itemId: string): boolean {
  if (isLabelItem(itemId)) return false;
  if (hasItem(itemId)) return false;
  return !startsGridItemUndimmed(getBaseItemId(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function getGridItemClasses(itemId: string) {
  return {
    owned: isItemHighlightedForGrid(itemId),
    'label-item': isLabelItem(itemId),
  };
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  if (img.src !== DEFAULT_ICON) {
    img.src = DEFAULT_ICON;
  }
}

function handleOverlayError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}

function getArrayStyle(element: GridArray) {
  const margin = parseMargin(element.margin);
  return {
    margin: `${margin.y}px ${margin.x}px`,
  };
}

function getItemStyle(element: GridItem, parentScale: number) {
  const margin = parseMargin(element.margin);
  const width = (element.width || 32) * parentScale;
  const height = (element.height || 32) * parentScale;

  const style: Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
    margin: `${margin.y}px ${margin.x}px`,
  };

  if (element.canvas_left !== undefined) {
    style.position = 'absolute';
    style.left = `${element.canvas_left * parentScale}px`;
    style.top = `${(element.canvas_top || 0) * parentScale}px`;
  }

  return style;
}

function getCanvasStyle(element: GridCanvas, parentScale: number) {
  const margin = parseMargin(element.margin);
  const width = element.width * parentScale;
  const height = element.height * parentScale;

  return {
    width: `${width}px`,
    height: `${height}px`,
    margin: `${margin.y}px ${margin.x}px`,
    position: 'relative' as const,
  };
}

function getGridItemStyle(
  itemMargin: { x: number; y: number },
  itemSize: number,
) {
  return {
    width: `${itemSize}px`,
    height: `${itemSize}px`,
    margin: `${itemMargin.y}px ${itemMargin.x}px`,
  };
}

function getEffectiveScale(element: unknown, parentScale: number): number {
  return ((element as { scale?: number }).scale || 1) * parentScale;
}

function elementType(element: unknown): string | undefined {
  const maybeType = (element as { type?: unknown })?.type;
  return typeof maybeType === 'string' ? maybeType : undefined;
}
</script>

<template>
  <div
    class="grid-array"
    :class="grid.orientation"
    :style="getArrayStyle(grid)"
  >
    <template v-for="(child, idx) in grid.content" :key="idx">
      <!-- ItemGrid (rows of items) -->
      <div v-if="elementType(child) === 'itemgrid'" class="item-grid">
        <div
          v-for="(row, rowIdx) in (child as ItemGrid).rows"
          :key="rowIdx"
          class="item-row"
        >
          <div
            v-for="(itemId, colIdx) in row"
            :key="colIdx"
            class="grid-item"
            :class="getGridItemClasses(itemId)"
            :style="
              getGridItemStyle(
                parseMargin((child as ItemGrid).item_margin),
                ((child as ItemGrid).item_size || 32) *
                  getEffectiveScale(child, grid.scale || 1),
              )
            "
            :title="getGridItemTitle(itemId)"
            @click="toggleItem(itemId)"
            @contextmenu="decrementItem(itemId, $event)"
          >
            <img
              :src="getIconSrc(itemId)"
              :alt="itemId"
              class="item-icon"
              :class="{ disabled: isItemIconDisabled(itemId) }"
              @error="handleImageError"
            />
            <img
              v-if="getOverlaySrc(itemId)"
              :src="getOverlaySrc(itemId) as string"
              :alt="`${itemId} overlay`"
              class="item-overlay"
              :class="{ disabled: isItemIconDisabled(itemId) }"
              @error="handleOverlayError"
            />
            <span v-if="shouldShowItemCount(itemId)" class="item-count">{{
              getGridItemCount(itemId)
            }}</span>
          </div>
        </div>
      </div>

      <!-- Nested array -->
      <div
        v-else-if="elementType(child) === 'array'"
        class="grid-array"
        :class="(child as GridArray).orientation"
        :style="getArrayStyle(child as GridArray)"
      >
        <template
          v-for="(grandchild, gIdx) in (child as GridArray).content"
          :key="gIdx"
        >
          <!-- Level 2 itemgrid -->
          <div v-if="elementType(grandchild) === 'itemgrid'" class="item-grid">
            <div
              v-for="(row, rowIdx) in (grandchild as ItemGrid).rows"
              :key="rowIdx"
              class="item-row"
            >
              <div
                v-for="(itemId, colIdx) in row"
                :key="colIdx"
                class="grid-item"
                :class="getGridItemClasses(itemId)"
                :style="
                  getGridItemStyle(
                    parseMargin((grandchild as ItemGrid).item_margin),
                    ((grandchild as ItemGrid).item_size || 32) *
                      getEffectiveScale(
                        grandchild,
                        getEffectiveScale(child, grid.scale || 1),
                      ),
                  )
                "
                :title="getGridItemTitle(itemId)"
                @click="toggleItem(itemId)"
                @contextmenu="decrementItem(itemId, $event)"
              >
                <img
                  :src="getIconSrc(itemId)"
                  :alt="itemId"
                  class="item-icon"
                  :class="{ disabled: isItemIconDisabled(itemId) }"
                  @error="handleImageError"
                />
                <img
                  v-if="getOverlaySrc(itemId)"
                  :src="getOverlaySrc(itemId) as string"
                  :alt="`${itemId} overlay`"
                  class="item-overlay"
                  :class="{ disabled: isItemIconDisabled(itemId) }"
                  @error="handleOverlayError"
                />
                <span v-if="shouldShowItemCount(itemId)" class="item-count">{{
                  getGridItemCount(itemId)
                }}</span>
              </div>
            </div>
          </div>

          <!-- Level 2 nested array -->
          <div
            v-else-if="elementType(grandchild) === 'array'"
            class="grid-array"
            :class="(grandchild as GridArray).orientation"
            :style="getArrayStyle(grandchild as GridArray)"
          >
            <template
              v-for="(ggchild, ggIdx) in (grandchild as GridArray).content"
              :key="ggIdx"
            >
              <!-- Level 3 item -->
              <div
                v-if="elementType(ggchild) === 'item'"
                class="grid-item"
                :class="getGridItemClasses((ggchild as GridItem).item)"
                :style="
                  getItemStyle(
                    ggchild as GridItem,
                    getEffectiveScale(
                      grandchild,
                      getEffectiveScale(child, grid.scale || 1),
                    ),
                  )
                "
                :title="getGridItemTitle((ggchild as GridItem).item)"
                @click="toggleItem((ggchild as GridItem).item)"
                @contextmenu="decrementItem((ggchild as GridItem).item, $event)"
              >
                <img
                  :src="getIconSrc((ggchild as GridItem).item)"
                  :alt="(ggchild as GridItem).item"
                  class="item-icon"
                  :class="{
                    disabled: isItemIconDisabled((ggchild as GridItem).item),
                  }"
                  @error="handleImageError"
                />
                <img
                  v-if="getOverlaySrc((ggchild as GridItem).item)"
                  :src="getOverlaySrc((ggchild as GridItem).item) as string"
                  :alt="`${(ggchild as GridItem).item} overlay`"
                  class="item-overlay"
                  :class="{
                    disabled: isItemIconDisabled((ggchild as GridItem).item),
                  }"
                  @error="handleOverlayError"
                />
                <span
                  v-if="shouldShowItemCount((ggchild as GridItem).item)"
                  class="item-count"
                  >{{ getGridItemCount((ggchild as GridItem).item) }}</span
                >
              </div>

              <!-- Level 3 canvas -->
              <div
                v-else-if="elementType(ggchild) === 'canvas'"
                class="grid-canvas"
                :style="
                  getCanvasStyle(
                    ggchild as GridCanvas,
                    getEffectiveScale(
                      grandchild,
                      getEffectiveScale(child, grid.scale || 1),
                    ),
                  )
                "
              >
                <div
                  v-for="(canvasChild, cIdx) in (ggchild as GridCanvas).content"
                  :key="cIdx"
                  class="grid-item canvas-item"
                  :class="getGridItemClasses((canvasChild as GridItem).item)"
                  :style="
                    getItemStyle(
                      canvasChild as GridItem,
                      getEffectiveScale(
                        grandchild,
                        getEffectiveScale(child, grid.scale || 1),
                      ),
                    )
                  "
                  :title="getGridItemTitle((canvasChild as GridItem).item)"
                  @click="toggleItem((canvasChild as GridItem).item)"
                  @contextmenu="
                    decrementItem((canvasChild as GridItem).item, $event)
                  "
                >
                  <img
                    :src="getIconSrc((canvasChild as GridItem).item)"
                    :alt="(canvasChild as GridItem).item"
                    class="item-icon"
                    :class="{
                      disabled: isItemIconDisabled(
                        (canvasChild as GridItem).item,
                      ),
                    }"
                    @error="handleImageError"
                  />
                  <img
                    v-if="getOverlaySrc((canvasChild as GridItem).item)"
                    :src="
                      getOverlaySrc((canvasChild as GridItem).item) as string
                    "
                    :alt="`${(canvasChild as GridItem).item} overlay`"
                    class="item-overlay"
                    :class="{
                      disabled: isItemIconDisabled(
                        (canvasChild as GridItem).item,
                      ),
                    }"
                    @error="handleOverlayError"
                  />
                  <span
                    v-if="shouldShowItemCount((canvasChild as GridItem).item)"
                    class="item-count"
                    >{{
                      getGridItemCount((canvasChild as GridItem).item)
                    }}</span
                  >
                </div>
              </div>

              <!-- Level 3 nested array (for deeper nesting) -->
              <div
                v-else-if="elementType(ggchild) === 'array'"
                class="grid-array"
                :class="(ggchild as GridArray).orientation"
                :style="getArrayStyle(ggchild as GridArray)"
              >
                <template
                  v-for="(gggchild, gggIdx) in (ggchild as GridArray).content"
                  :key="gggIdx"
                >
                  <div
                    v-if="elementType(gggchild) === 'item'"
                    class="grid-item"
                    :class="getGridItemClasses((gggchild as GridItem).item)"
                    :style="
                      getItemStyle(
                        gggchild as GridItem,
                        getEffectiveScale(
                          ggchild,
                          getEffectiveScale(
                            grandchild,
                            getEffectiveScale(child, grid.scale || 1),
                          ),
                        ),
                      )
                    "
                    :title="getGridItemTitle((gggchild as GridItem).item)"
                    @click="toggleItem((gggchild as GridItem).item)"
                    @contextmenu="
                      decrementItem((gggchild as GridItem).item, $event)
                    "
                  >
                    <img
                      :src="getIconSrc((gggchild as GridItem).item)"
                      :alt="(gggchild as GridItem).item"
                      class="item-icon"
                      :class="{
                        disabled: isItemIconDisabled(
                          (gggchild as GridItem).item,
                        ),
                      }"
                      @error="handleImageError"
                    />
                    <img
                      v-if="getOverlaySrc((gggchild as GridItem).item)"
                      :src="
                        getOverlaySrc((gggchild as GridItem).item) as string
                      "
                      :alt="`${(gggchild as GridItem).item} overlay`"
                      class="item-overlay"
                      :class="{
                        disabled: isItemIconDisabled(
                          (gggchild as GridItem).item,
                        ),
                      }"
                      @error="handleOverlayError"
                    />
                    <span
                      v-if="shouldShowItemCount((gggchild as GridItem).item)"
                      class="item-count"
                      >{{ getGridItemCount((gggchild as GridItem).item) }}</span
                    >
                  </div>
                </template>
              </div>
            </template>
          </div>

          <!-- Level 2 item -->
          <div
            v-else-if="elementType(grandchild) === 'item'"
            class="grid-item"
            :class="getGridItemClasses((grandchild as GridItem).item)"
            :style="
              getItemStyle(
                grandchild as GridItem,
                getEffectiveScale(child, grid.scale || 1),
              )
            "
            :title="getGridItemTitle((grandchild as GridItem).item)"
            @click="toggleItem((grandchild as GridItem).item)"
            @contextmenu="decrementItem((grandchild as GridItem).item, $event)"
          >
            <img
              :src="getIconSrc((grandchild as GridItem).item)"
              :alt="(grandchild as GridItem).item"
              class="item-icon"
              :class="{
                disabled: isItemIconDisabled((grandchild as GridItem).item),
              }"
              @error="handleImageError"
            />
            <img
              v-if="getOverlaySrc((grandchild as GridItem).item)"
              :src="getOverlaySrc((grandchild as GridItem).item) as string"
              :alt="`${(grandchild as GridItem).item} overlay`"
              class="item-overlay"
              :class="{
                disabled: isItemIconDisabled((grandchild as GridItem).item),
              }"
              @error="handleOverlayError"
            />
            <span
              v-if="shouldShowItemCount((grandchild as GridItem).item)"
              class="item-count"
              >{{ getGridItemCount((grandchild as GridItem).item) }}</span
            >
          </div>

          <!-- Level 2 canvas -->
          <div
            v-else-if="elementType(grandchild) === 'canvas'"
            class="grid-canvas"
            :style="
              getCanvasStyle(
                grandchild as GridCanvas,
                getEffectiveScale(child, grid.scale || 1),
              )
            "
          >
            <div
              v-for="(canvasChild, cIdx) in (grandchild as GridCanvas).content"
              :key="cIdx"
              class="grid-item canvas-item"
              :class="getGridItemClasses((canvasChild as GridItem).item)"
              :style="
                getItemStyle(
                  canvasChild as GridItem,
                  getEffectiveScale(child, grid.scale || 1),
                )
              "
              :title="getGridItemTitle((canvasChild as GridItem).item)"
              @click="toggleItem((canvasChild as GridItem).item)"
              @contextmenu="
                decrementItem((canvasChild as GridItem).item, $event)
              "
            >
              <img
                :src="getIconSrc((canvasChild as GridItem).item)"
                :alt="(canvasChild as GridItem).item"
                class="item-icon"
                :class="{
                  disabled: isItemIconDisabled((canvasChild as GridItem).item),
                }"
                @error="handleImageError"
              />
              <img
                v-if="getOverlaySrc((canvasChild as GridItem).item)"
                :src="getOverlaySrc((canvasChild as GridItem).item) as string"
                :alt="`${(canvasChild as GridItem).item} overlay`"
                class="item-overlay"
                :class="{
                  disabled: isItemIconDisabled((canvasChild as GridItem).item),
                }"
                @error="handleOverlayError"
              />
              <span
                v-if="shouldShowItemCount((canvasChild as GridItem).item)"
                class="item-count"
                >{{ getGridItemCount((canvasChild as GridItem).item) }}</span
              >
            </div>
          </div>
        </template>
      </div>

      <!-- Single item at root level -->
      <div
        v-else-if="elementType(child) === 'item'"
        class="grid-item"
        :class="getGridItemClasses((child as GridItem).item)"
        :style="getItemStyle(child as GridItem, grid.scale || 1)"
        :title="getGridItemTitle((child as GridItem).item)"
        @click="toggleItem((child as GridItem).item)"
        @contextmenu="decrementItem((child as GridItem).item, $event)"
      >
        <img
          :src="getIconSrc((child as GridItem).item)"
          :alt="(child as GridItem).item"
          class="item-icon"
          :class="{ disabled: isItemIconDisabled((child as GridItem).item) }"
          @error="handleImageError"
        />
        <img
          v-if="getOverlaySrc((child as GridItem).item)"
          :src="getOverlaySrc((child as GridItem).item) as string"
          :alt="`${(child as GridItem).item} overlay`"
          class="item-overlay"
          :class="{ disabled: isItemIconDisabled((child as GridItem).item) }"
          @error="handleOverlayError"
        />
        <span
          v-if="shouldShowItemCount((child as GridItem).item)"
          class="item-count"
          >{{ getGridItemCount((child as GridItem).item) }}</span
        >
      </div>

      <!-- Canvas at root level -->
      <div
        v-else-if="elementType(child) === 'canvas'"
        class="grid-canvas"
        :style="getCanvasStyle(child as GridCanvas, grid.scale || 1)"
      >
        <div
          v-for="(canvasChild, cIdx) in (child as GridCanvas).content"
          :key="cIdx"
          class="grid-item canvas-item"
          :class="getGridItemClasses((canvasChild as GridItem).item)"
          :style="getItemStyle(canvasChild as GridItem, grid.scale || 1)"
          :title="getGridItemTitle((canvasChild as GridItem).item)"
          @click="toggleItem((canvasChild as GridItem).item)"
          @contextmenu="decrementItem((canvasChild as GridItem).item, $event)"
        >
          <img
            :src="getIconSrc((canvasChild as GridItem).item)"
            :alt="(canvasChild as GridItem).item"
            class="item-icon"
            :class="{
              disabled: isItemIconDisabled((canvasChild as GridItem).item),
            }"
            @error="handleImageError"
          />
          <img
            v-if="getOverlaySrc((canvasChild as GridItem).item)"
            :src="getOverlaySrc((canvasChild as GridItem).item) as string"
            :alt="`${(canvasChild as GridItem).item} overlay`"
            class="item-overlay"
            :class="{
              disabled: isItemIconDisabled((canvasChild as GridItem).item),
            }"
            @error="handleOverlayError"
          />
          <span
            v-if="shouldShowItemCount((canvasChild as GridItem).item)"
            class="item-count"
            >{{ getGridItemCount((canvasChild as GridItem).item) }}</span
          >
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.grid-array {
  display: flex;
}

.grid-array.vertical {
  flex-direction: column;
}

.grid-array.horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
}

.item-grid {
  display: flex;
  flex-direction: column;
}

.item-row {
  display: flex;
  flex-direction: row;
}

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
}

.grid-canvas {
  display: block;
  position: relative;
}
</style>
