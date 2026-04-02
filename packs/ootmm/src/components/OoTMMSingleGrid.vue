<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import {
  getGridItemIcon,
  getGridItemLinkedItemIds,
  getGridItemOverlay,
  getGridItemAutoSelectItemIds,
  getGridTextLabel,
  getGridWheelOverlay,
  getGridWheelOverlayValue,
  getGridWheelOverlayStage,
  getGridWheelOverlayStageCount,
  getGridWheelOverlayStateItemId,
  hasGridIconVariants,
  startsGridItemUndimmed,
  DEFAULT_ICON,
} from '../data/itemIcons';
import { getItemName } from '../data/items';
import OoTMMGridNode from './OoTMMGridNode.vue';
import {
  EMPTY_GRID_ITEM_ID,
  itemGridRenderContextKey,
  type GridArray,
  type GridCanvas,
  type GridItem,
  type GridItemMultiActivation,
  type GridItemRefAlias,
  type GridItemSubmenuConfig,
  type GridSection,
  type ResolvedGridArray,
  type ResolvedGridNode,
} from './itemGridSchema';

const props = defineProps<{
  inventory: Map<string, number>;
  grid: ResolvedGridArray;
  gridItemRefs?: Record<string, GridItemRefAlias>;
  gridItemMultiActivations?: Record<string, GridItemMultiActivation>;
  gridItemSubmenus?: Record<string, GridItemSubmenuConfig>;
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
const GRID_SUBMENU_PREFIX = '__grid_submenu__:';

const openSubmenuItemId = ref<string | null>(null);

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

function isGridSubmenuKey(itemId: string): boolean {
  return itemId.startsWith(GRID_SUBMENU_PREFIX);
}

function getGridSubmenu(itemId: string): GridItemSubmenuConfig | null {
  if (!isGridSubmenuKey(itemId)) return null;
  const ref = itemId.slice(GRID_SUBMENU_PREFIX.length);
  return props.gridItemSubmenus?.[ref] || null;
}

function isSubmenuItem(itemId: string): boolean {
  return Boolean(getGridSubmenu(itemId));
}

function isSubmenuOpen(itemId: string): boolean {
  return openSubmenuItemId.value === itemId;
}

function closeSubmenu() {
  openSubmenuItemId.value = null;
}

function toggleSubmenu(itemId: string) {
  openSubmenuItemId.value = openSubmenuItemId.value === itemId ? null : itemId;
}

function getGridMultiActivation(
  itemId: string,
): GridItemMultiActivation | null {
  if (!isGridMultiActivateKey(itemId)) return null;
  return props.gridItemMultiActivations?.[itemId] || null;
}

function isEmptyGridItem(itemId: string): boolean {
  return itemId === EMPTY_GRID_ITEM_ID;
}

function getBaseItemId(itemId: string): string {
  if (isEmptyGridItem(itemId)) return itemId;
  const submenu = getGridSubmenu(itemId);
  if (submenu) return submenu.item;
  const multiActivation = getGridMultiActivation(itemId);
  if (multiActivation) return multiActivation.item;
  return getGridRefAlias(itemId)?.item || itemId;
}

function getGridItemTitle(itemId: string): string {
  if (isEmptyGridItem(itemId)) return '';
  const submenu = getGridSubmenu(itemId);
  if (submenu?.title) return submenu.title;
  const multiActivation = getGridMultiActivation(itemId);
  if (multiActivation?.title) return multiActivation.title;

  const alias = getGridRefAlias(itemId);
  if (alias?.title) return alias.title;
  return getItemName(getBaseItemId(itemId));
}

function getAdditionalToggleItemIds(itemId: string): string[] {
  return getGridMultiActivation(itemId)?.activateAlso || [];
}

function collectNodeItemIds(node: ResolvedGridNode, itemIds: Set<string>) {
  if (node.type === 'item') {
    itemIds.add(node.item);
    return;
  }

  if (node.type === 'canvas') {
    for (const child of node.content) {
      itemIds.add(child.item);
    }
    return;
  }

  if (node.type === 'itemgrid') {
    for (const row of node.rows) {
      for (const childItemId of row) {
        itemIds.add(childItemId);
      }
    }
    return;
  }

  for (const child of node.content) {
    collectNodeItemIds(child, itemIds);
  }
}

function getSubmenuNode(itemId: string): ResolvedGridNode | null {
  return getGridSubmenu(itemId)?.submenu || null;
}

function getSubmenuOwnedCount(itemId: string): number {
  const submenu = getGridSubmenu(itemId);
  if (!submenu) return 0;

  const itemIds = new Set<string>();
  collectNodeItemIds(submenu.submenu, itemIds);

  let ownedCount = 0;
  for (const childItemId of itemIds) {
    if (isEmptyGridItem(childItemId) || isLabelItem(childItemId)) {
      continue;
    }

    if (getGridItemCount(childItemId) > 0) {
      ownedCount += 1;
    }
  }

  return ownedCount;
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
  if (isEmptyGridItem(itemId)) return 0;
  if (getGridSubmenu(itemId)) {
    return getSubmenuOwnedCount(itemId);
  }
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
  if (isEmptyGridItem(itemId)) return 0;
  if (getGridSubmenu(itemId)) return 1;
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

function setAutoSelectedItems(
  itemIds: string[] | null,
  active: boolean,
  inventory: Map<string, number>,
) {
  if (!itemIds || itemIds.length === 0) return;

  for (const itemId of itemIds) {
    if (active) {
      inventory.set(itemId, 1);
    } else {
      inventory.delete(itemId);
    }
  }
}

function isItemOwnedForGrid(itemId: string): boolean {
  return hasItem(itemId);
}

function isLabelItem(itemId: string): boolean {
  if (isEmptyGridItem(itemId)) return false;
  if (!props.labelItemIds || props.labelItemIds.length === 0) return false;

  const baseItemId = getBaseItemId(itemId);
  return (
    props.labelItemIds.includes(itemId) ||
    props.labelItemIds.includes(baseItemId)
  );
}

function isItemHighlightedForGrid(itemId: string): boolean {
  if (isEmptyGridItem(itemId)) return false;
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
  if (isEmptyGridItem(itemId)) return;
  if (isLabelItem(itemId)) return;
  if (getGridSubmenu(itemId)) {
    toggleSubmenu(itemId);
    return;
  }

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

  const autoSelectItemIds = getGridItemAutoSelectItemIds(baseItemId, {
    maxCount: max,
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });

  if (max <= 1) {
    if (current > 0) {
      newInventory.delete(baseItemId);
      setAutoSelectedItems(autoSelectItemIds, false, newInventory);
      setAdditionalToggleItems(itemId, false, newInventory);
    } else {
      newInventory.set(baseItemId, 1);
      setAutoSelectedItems(autoSelectItemIds, true, newInventory);
      setAdditionalToggleItems(itemId, true, newInventory);
    }
    emitInventoryUpdate(newInventory);
    return;
  }

  if (current < max) {
    newInventory.set(baseItemId, current + 1);
    setAutoSelectedItems(autoSelectItemIds, true, newInventory);
    setAdditionalToggleItems(itemId, true, newInventory);
  } else {
    // at or above max: wrap around to 0 (remove the item)
    newInventory.delete(baseItemId);
    setAutoSelectedItems(autoSelectItemIds, false, newInventory);
    setAdditionalToggleItems(itemId, false, newInventory);
  }

  emitInventoryUpdate(newInventory);
}

function decrementItem(itemId: string, event: MouseEvent) {
  event.preventDefault();
  if (isEmptyGridItem(itemId)) return;
  if (isLabelItem(itemId)) return;
  if (getGridSubmenu(itemId)) {
    return;
  }

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

  const autoSelectItemIds = getGridItemAutoSelectItemIds(baseItemId, {
    maxCount: max,
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });

  if (current > 1) {
    newInventory.set(baseItemId, current - 1);
    setAutoSelectedItems(autoSelectItemIds, true, newInventory);
    setAdditionalToggleItems(itemId, true, newInventory);
  } else if (current === 1) {
    newInventory.delete(baseItemId);
    setAutoSelectedItems(autoSelectItemIds, false, newInventory);
    setAdditionalToggleItems(itemId, false, newInventory);
  } else {
    // current is 0: wrap to max
    newInventory.set(baseItemId, max);
    setAutoSelectedItems(autoSelectItemIds, true, newInventory);
    setAdditionalToggleItems(itemId, true, newInventory);
  }
  emitInventoryUpdate(newInventory);
}

function parseMargin(
  margin?: string,
  defaultX = 1,
  defaultY = defaultX,
): { x: number; y: number } {
  if (!margin) return { x: defaultX, y: defaultY };
  const [x, y] = margin.split(',').map(Number);
  return { x: x || defaultX, y: y || defaultY };
}

function getIconSrc(itemId: string): string {
  if (isEmptyGridItem(itemId)) return '';
  const baseItemId = getBaseItemId(itemId);
  return getGridItemIcon(baseItemId, getGridItemCount(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function getItemTextLabel(itemId: string): string | null {
  if (isEmptyGridItem(itemId)) return null;
  return getGridTextLabel(getBaseItemId(itemId));
}

function getOverlaySrc(itemId: string): string | null {
  if (isEmptyGridItem(itemId)) return null;
  const baseItemId = getBaseItemId(itemId);
  return getGridItemOverlay(baseItemId, getGridItemCount(itemId), {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function getWheelOverlaySrc(itemId: string): string | null {
  if (isEmptyGridItem(itemId)) return null;
  const baseItemId = getBaseItemId(itemId);
  return getGridWheelOverlay(baseItemId, {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
}

function getWheelOverlayText(itemId: string): string | null {
  if (isEmptyGridItem(itemId)) return null;
  const baseItemId = getBaseItemId(itemId);
  const overlayValue = getGridWheelOverlayValue(baseItemId, {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
  return overlayValue ? getGridTextLabel(overlayValue) : null;
}

function handleItemWheel(itemId: string, event: WheelEvent) {
  if (isEmptyGridItem(itemId)) return;
  if (getGridSubmenu(itemId)) return;
  const baseItemId = getBaseItemId(itemId);
  const stageCount = getGridWheelOverlayStageCount(baseItemId);
  const stateItemId = getGridWheelOverlayStateItemId(baseItemId);

  if (!stateItemId || stageCount <= 0 || event.deltaY === 0) {
    return;
  }

  event.preventDefault();

  const currentStage = getGridWheelOverlayStage(baseItemId, {
    maxCount: getItemMaxCount(itemId),
    availableItemIds: props.availableItemIds,
    inventory: props.inventory,
    settings: props.settings,
  });
  const cycleLength = stageCount + 1;
  const direction = event.deltaY > 0 ? 1 : -1;
  const nextStage =
    (((currentStage + direction) % cycleLength) + cycleLength) % cycleLength;

  const newInventory = new Map(props.inventory);
  if (nextStage > 0) {
    newInventory.set(stateItemId, nextStage);
  } else {
    newInventory.delete(stateItemId);
  }

  emitInventoryUpdate(newInventory);
}

function shouldShowItemCount(itemId: string): boolean {
  if (isEmptyGridItem(itemId)) return false;
  if (getGridSubmenu(itemId)) return false;
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
  if (isEmptyGridItem(itemId)) return false;
  if (getGridSubmenu(itemId)) return false;
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
    'empty-slot': isEmptyGridItem(itemId),
    owned: isItemHighlightedForGrid(itemId),
    'label-item': isLabelItem(itemId),
    'submenu-item': isSubmenuItem(itemId),
    'submenu-open': isSubmenuOpen(itemId),
  };
}

function handleDocumentMouseDown(event: MouseEvent) {
  if (!openSubmenuItemId.value) {
    return;
  }

  const target = event.target;
  if (target instanceof Element && target.closest('.grid-item-submenu')) {
    return;
  }

  closeSubmenu();
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSubmenu();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
});

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

function getSectionStyle(element: GridSection) {
  const margin = parseMargin(element.margin);
  const padding = parseMargin(element.padding, 10, 10);

  return {
    margin: `${margin.y}px ${margin.x}px`,
    padding: `${padding.y}px ${padding.x}px`,
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

provide(itemGridRenderContextKey, {
  parseMargin: (margin?: string) => parseMargin(margin),
  getArrayStyle,
  getSectionStyle,
  getItemStyle,
  getCanvasStyle,
  getGridItemStyle,
  getGridItemClasses,
  getGridItemTitle,
  isEmptyGridItem,
  isSubmenuItem,
  isSubmenuOpen,
  getSubmenuNode,
  toggleItem,
  decrementItem,
  handleItemWheel,
  getIconSrc,
  getItemTextLabel,
  getOverlaySrc,
  getWheelOverlaySrc,
  getWheelOverlayText,
  isItemIconDisabled,
  shouldShowItemCount,
  getGridItemCount,
  handleImageError,
  handleOverlayError,
});
</script>

<template>
  <div class="single-grid-root">
    <OoTMMGridNode :node="grid" :parent-scale="1" />
  </div>
</template>
