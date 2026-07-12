<script setup lang="ts">
import { computed } from 'vue';
import OoTMMSingleGrid from './OoTMMSingleGrid.vue';
import {
  isItemGridAliasRef,
  isItemGridEmptyRef,
  isItemGridMultiActivateRef,
  isItemGridOrRef,
  isItemGridSubmenuRef,
  resolveItemGridRef,
} from '../utils/itemGridRef';
import {
  EMPTY_GRID_ITEM_ID,
  type GridArray,
  type GridItemMultiActivation,
  type GridItemRefAlias,
  type GridItemSubmenuConfig,
  type GridSection,
  type ResolvedGridArray,
  type ResolvedGridNode,
} from './itemGridSchema';

// Import the grid layout JSON
import itemGridsData from '../data/itemGrids.json';

const props = defineProps<{
  inventory: Map<string, number>;
  availableItemIds?: Set<string>;
  itemMaxCounts?: Map<string, number>;
  settings?: Record<string, unknown> | null;
}>();

const emit = defineEmits<{
  'update:inventory': [Map<string, number>];
}>();

const grids = itemGridsData as Record<string, GridArray>;

const sharedGrid = computed(() => grids['item_grid_shared']);
const ootGrid = computed(() => grids['item_grid_tall_oot']);
const mmGrid = computed(() => grids['item_grid_tall_mm']);

const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_MULTI_ACTIVATE_PREFIX = '__grid_multi_activate__:';
const GRID_SUBMENU_PREFIX = '__grid_submenu__:';

interface RawGridItemSubmenuConfig {
  item: string;
  title?: string;
  submenu: unknown;
}

function makeGridRefAliasKey(ref: string): string {
  return `${GRID_REF_ALIAS_PREFIX}${ref}`;
}

function isGridRefAliasKey(value: string): boolean {
  return value.startsWith(GRID_REF_ALIAS_PREFIX);
}

function getGridRefFromAliasKey(value: string): string {
  return value.slice(GRID_REF_ALIAS_PREFIX.length);
}

function makeGridMultiActivateKey(
  item: string,
  activateAlso: string[],
): string {
  return `${GRID_MULTI_ACTIVATE_PREFIX}${item}::${activateAlso.join('|')}`;
}

function isGridMultiActivateKey(value: string): boolean {
  return value.startsWith(GRID_MULTI_ACTIVATE_PREFIX);
}

function makeGridSubmenuKey(ref: string): string {
  return `${GRID_SUBMENU_PREFIX}${ref}`;
}

function isGridSubmenuKey(value: string): boolean {
  return value.startsWith(GRID_SUBMENU_PREFIX);
}

function getGridSubmenuRefFromKey(value: string): string {
  return value.slice(GRID_SUBMENU_PREFIX.length);
}

function collectGridItemRefAliases(
  element: unknown,
  aliases: Record<string, GridItemRefAlias>,
) {
  if (!element || typeof element !== 'object') return;

  if (isItemGridAliasRef(element)) {
    aliases[element.ref] = {
      item: element.item,
      title: element.title,
    };
    return;
  }

  if (Array.isArray(element)) {
    for (const child of element) {
      collectGridItemRefAliases(child, aliases);
    }
    return;
  }

  const maybeRows = (element as { rows?: unknown }).rows;
  if (Array.isArray(maybeRows)) {
    for (const row of maybeRows) {
      collectGridItemRefAliases(row, aliases);
    }
  }

  const maybeContent = (element as { content?: unknown }).content;
  if (Array.isArray(maybeContent)) {
    for (const child of maybeContent) {
      collectGridItemRefAliases(child, aliases);
    }
  }

  const maybeItem = (element as { item?: unknown }).item;
  if (maybeItem !== undefined) {
    collectGridItemRefAliases(maybeItem, aliases);
  }
}

function collectGridMultiActivations(
  element: unknown,
  activations: Record<string, GridItemMultiActivation>,
) {
  if (!element || typeof element !== 'object') return;

  if (isItemGridMultiActivateRef(element)) {
    const key = makeGridMultiActivateKey(element.item, element.activateAlso);
    activations[key] = {
      item: element.item,
      title: element.title,
      activateAlso: element.activateAlso,
    };
    return;
  }

  if (Array.isArray(element)) {
    for (const child of element) {
      collectGridMultiActivations(child, activations);
    }
    return;
  }

  const maybeRows = (element as { rows?: unknown }).rows;
  if (Array.isArray(maybeRows)) {
    for (const row of maybeRows) {
      collectGridMultiActivations(row, activations);
    }
  }

  const maybeContent = (element as { content?: unknown }).content;
  if (Array.isArray(maybeContent)) {
    for (const child of maybeContent) {
      collectGridMultiActivations(child, activations);
    }
  }

  const maybeItem = (element as { item?: unknown }).item;
  if (maybeItem !== undefined) {
    collectGridMultiActivations(maybeItem, activations);
  }
}

function collectGridSubmenus(
  element: unknown,
  submenus: Record<string, RawGridItemSubmenuConfig>,
) {
  if (!element || typeof element !== 'object') return;

  if (isItemGridSubmenuRef(element)) {
    submenus[element.ref] = {
      item: element.item,
      title: element.title,
      submenu: element.submenu,
    };
    collectGridSubmenus(element.submenu, submenus);
    return;
  }

  if (Array.isArray(element)) {
    for (const child of element) {
      collectGridSubmenus(child, submenus);
    }
    return;
  }

  const maybeRows = (element as { rows?: unknown }).rows;
  if (Array.isArray(maybeRows)) {
    for (const row of maybeRows) {
      collectGridSubmenus(row, submenus);
    }
  }

  const maybeContent = (element as { content?: unknown }).content;
  if (Array.isArray(maybeContent)) {
    for (const child of maybeContent) {
      collectGridSubmenus(child, submenus);
    }
  }

  const maybeItem = (element as { item?: unknown }).item;
  if (maybeItem !== undefined) {
    collectGridSubmenus(maybeItem, submenus);
  }
}

const gridItemRefAliases = computed<Record<string, GridItemRefAlias>>(() => {
  const aliases: Record<string, GridItemRefAlias> = {};
  collectGridItemRefAliases(sharedGrid.value, aliases);
  collectGridItemRefAliases(ootGrid.value, aliases);
  collectGridItemRefAliases(mmGrid.value, aliases);
  return aliases;
});

const gridItemMultiActivations = computed<
  Record<string, GridItemMultiActivation>
>(() => {
  const activations: Record<string, GridItemMultiActivation> = {};
  collectGridMultiActivations(sharedGrid.value, activations);
  collectGridMultiActivations(ootGrid.value, activations);
  collectGridMultiActivations(mmGrid.value, activations);
  return activations;
});

const rawGridItemSubmenus = computed<Record<string, RawGridItemSubmenuConfig>>(
  () => {
    const submenus: Record<string, RawGridItemSubmenuConfig> = {};
    collectGridSubmenus(sharedGrid.value, submenus);
    collectGridSubmenus(ootGrid.value, submenus);
    collectGridSubmenus(mmGrid.value, submenus);
    return submenus;
  },
);

const hasOotItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true;
  for (const id of props.availableItemIds) {
    if (id.startsWith('OOT_') || id.startsWith('SHARED_')) return true;
  }
  return false;
});

const hasMmItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0) return true;
  for (const id of props.availableItemIds) {
    if (id.startsWith('MM_') || id.startsWith('SHARED_')) return true;
  }
  return false;
});

const LABEL_VISIBLE_ITEM_MAP: Record<string, string[]> = {
  oot_foresttemple_label: [
    'OOT_SMALL_KEY_FOREST',
    'OOT_KEY_RING_FOREST',
    'OOT_BOSS_KEY_FOREST',
  ],
  oot_firetemple_label: [
    'OOT_SMALL_KEY_FIRE',
    'OOT_KEY_RING_FIRE',
    'OOT_BOSS_KEY_FIRE',
  ],
  oot_watertemple_label: [
    'OOT_SMALL_KEY_WATER',
    'OOT_KEY_RING_WATER',
    'OOT_BOSS_KEY_WATER',
  ],
  oot_spirittemple_label: [
    'OOT_SMALL_KEY_SPIRIT',
    'OOT_KEY_RING_SPIRIT',
    'OOT_BOSS_KEY_SPIRIT',
  ],
  oot_spirittemple_silver_label: [
    'OOT_RUPEE_SILVER_SPIRIT_CHILD',
    'OOT_POUCH_SILVER_SPIRIT_CHILD',
    'OOT_RUPEE_SILVER_SPIRIT_SUN',
    'OOT_POUCH_SILVER_SPIRIT_SUN',
    'OOT_RUPEE_SILVER_SPIRIT_BOULDERS',
    'OOT_POUCH_SILVER_SPIRIT_BOULDERS',
    'OOT_RUPEE_SILVER_SPIRIT_LOBBY',
    'OOT_POUCH_SILVER_SPIRIT_LOBBY',
    'OOT_RUPEE_SILVER_SPIRIT_ADULT',
    'OOT_POUCH_SILVER_SPIRIT_ADULT',
  ],
  oot_shadowtemple_label: [
    'OOT_SMALL_KEY_SHADOW',
    'OOT_KEY_RING_SHADOW',
    'OOT_BOSS_KEY_SHADOW',
  ],
  oot_shadowtemple_silver_label: [
    'OOT_RUPEE_SILVER_SHADOW_SCYTHE',
    'OOT_POUCH_SILVER_SHADOW_SCYTHE',
    'OOT_RUPEE_SILVER_SHADOW_PIT',
    'OOT_POUCH_SILVER_SHADOW_PIT',
    'OOT_RUPEE_SILVER_SHADOW_SPIKES',
    'OOT_POUCH_SILVER_SHADOW_SPIKES',
    'OOT_RUPEE_SILVER_SHADOW_BLADES',
    'OOT_POUCH_SILVER_SHADOW_BLADES',
  ],
  oot_ganoncastle_label: [
    'OOT_SMALL_KEY_GANON',
    'OOT_KEY_RING_GANON',
    'OOT_BOSS_KEY_GANON',
  ],
  oot_ganoncastle_silver_label: [
    'OOT_RUPEE_SILVER_GANON_SPIRIT',
    'OOT_POUCH_SILVER_GANON_SPIRIT',
    'OOT_RUPEE_SILVER_GANON_LIGHT',
    'OOT_POUCH_SILVER_GANON_LIGHT',
    'OOT_RUPEE_SILVER_GANON_FIRE',
    'OOT_POUCH_SILVER_GANON_FIRE',
    'OOT_RUPEE_SILVER_GANON_FOREST',
    'OOT_POUCH_SILVER_GANON_FOREST',
  ],
  oot_gerudotraining_label: ['OOT_SMALL_KEY_GTG', 'OOT_KEY_RING_GTG'],
  oot_gerudotraining_silver_label: [
    'OOT_RUPEE_SILVER_GTG_SLOPES',
    'OOT_POUCH_SILVER_GTG_SLOPES',
    'OOT_RUPEE_SILVER_GTG_LAVA',
    'OOT_POUCH_SILVER_GTG_LAVA',
    'OOT_RUPEE_SILVER_GTG_WATER',
    'OOT_POUCH_SILVER_GTG_WATER',
  ],
  oot_gerudofortress_label: ['OOT_SMALL_KEY_GF', 'OOT_KEY_RING_GF'],
  oot_well_label: ['OOT_SMALL_KEY_BOTW', 'OOT_KEY_RING_BOTW'],
  oot_well_silver_label: ['OOT_RUPEE_SILVER_BOTW', 'OOT_POUCH_SILVER_BOTW'],
  oot_chestgame_label: ['OOT_SMALL_KEY_TCG', 'OOT_KEY_RING_TCG'],
  oot_dc_label: ['OOT_RUPEE_SILVER_DC', 'OOT_POUCH_SILVER_DC'],
  oot_ice_label: [
    'OOT_RUPEE_SILVER_IC_SCYTHE',
    'OOT_POUCH_SILVER_IC_SCYTHE',
    'OOT_RUPEE_SILVER_IC_BLOCK',
    'OOT_POUCH_SILVER_IC_BLOCK',
  ],
  mm_woodfall_label: [
    'MM_SMALL_KEY_WF',
    'MM_KEY_RING_WF',
    'MM_BOSS_KEY_WF',
    'MM_STRAY_FAIRY_WF',
  ],
  mm_snowhead_label: [
    'MM_SMALL_KEY_SH',
    'MM_KEY_RING_SH',
    'MM_BOSS_KEY_SH',
    'MM_STRAY_FAIRY_SH',
  ],
  mm_greatbay_label: [
    'MM_SMALL_KEY_GB',
    'MM_KEY_RING_GB',
    'MM_BOSS_KEY_GB',
    'MM_STRAY_FAIRY_GB',
  ],
  mm_stonetower_label: [
    'MM_SMALL_KEY_ST',
    'MM_KEY_RING_ST',
    'MM_BOSS_KEY_ST',
    'MM_STRAY_FAIRY_ST',
  ],

  // Rusty Keys – OoT section labels
  oot_rusty_market_label: ['OOT_RUSTY_KEY_TREASURE_CHEST_GAME'],
  oot_rusty_ranch_label: ['OOT_RUSTY_KEY_RANCH_STABLE'],
  oot_rusty_outside_label: ['OOT_RUSTY_KEY_LABORATORY'],
  oot_rusty_kakariko_label: ['OOT_RUSTY_KEY_GRAVEYARD'],

  // Rusty Keys – MM section labels
  mm_rusty_town_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_swamp_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_inn_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_ikana_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_mtn_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_bay_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
  mm_rusty_ranch_label: ['MM_RUSTY_KEY_TOURIST_INFORMATION'],
};

const labelItemIds = Object.keys(LABEL_VISIBLE_ITEM_MAP);

function isLabelItemId(itemId: string): boolean {
  return labelItemIds.includes(itemId);
}

function isItemVisible(itemId: string): boolean {
  if (isGridMultiActivateKey(itemId)) {
    const config = gridItemMultiActivations.value[itemId];
    return config ? isItemVisible(config.item) : false;
  }

  const alias = gridItemRefAliases.value[itemId];
  if (alias) {
    return isItemVisible(alias.item);
  }

  if (!props.availableItemIds || props.availableItemIds.size === 0) return true;
  const visibleItems = LABEL_VISIBLE_ITEM_MAP[itemId];
  if (visibleItems) {
    for (const visibleItemId of visibleItems) {
      if (props.availableItemIds.has(visibleItemId)) return true;
    }
    return false;
  }
  if (props.availableItemIds.has(itemId)) return true;
  if (itemId.startsWith('mm_')) return hasMmItems.value;
  if (itemId.startsWith('oot_')) return hasOotItems.value;
  return false;
}

function resolveVisibleItemRef(itemRef: unknown): string | null {
  if (isItemGridEmptyRef(itemRef)) {
    return EMPTY_GRID_ITEM_ID;
  }

  if (isItemGridSubmenuRef(itemRef)) {
    return filteredGridItemSubmenus.value[itemRef.ref]
      ? makeGridSubmenuKey(itemRef.ref)
      : null;
  }

  if (isItemGridMultiActivateRef(itemRef)) {
    if (!isItemVisible(itemRef.item)) return null;
    return makeGridMultiActivateKey(itemRef.item, itemRef.activateAlso);
  }

  if (isItemGridAliasRef(itemRef)) {
    if (!isItemVisible(itemRef.item)) return null;
    return makeGridRefAliasKey(itemRef.ref);
  }

  if (typeof itemRef === 'string') {
    if (isGridSubmenuKey(itemRef)) {
      const ref = getGridSubmenuRefFromKey(itemRef);
      return filteredGridItemSubmenus.value[ref] ? itemRef : null;
    }

    if (isGridRefAliasKey(itemRef)) {
      const ref = getGridRefFromAliasKey(itemRef);
      const alias = gridItemRefAliases.value[ref];
      return alias && isItemVisible(alias.item) ? itemRef : null;
    }

    if (rawGridItemSubmenus.value[itemRef]) {
      return filteredGridItemSubmenus.value[itemRef]
        ? makeGridSubmenuKey(itemRef)
        : null;
    }

    const alias = gridItemRefAliases.value[itemRef];
    if (alias) {
      return isItemVisible(alias.item) ? makeGridRefAliasKey(itemRef) : null;
    }
  }

  return resolveItemGridRef(
    itemRef,
    (candidate: string) => (isItemVisible(candidate) ? candidate : null),
    () => EMPTY_GRID_ITEM_ID,
  );
}

function shouldKeepHiddenGridSlot(itemRef: unknown): boolean {
  if (isItemGridEmptyRef(itemRef)) {
    return true;
  }

  if (isItemGridSubmenuRef(itemRef)) {
    return false;
  }

  if (isItemGridAliasRef(itemRef) || isItemGridMultiActivateRef(itemRef)) {
    return isLabelItemId(itemRef.item);
  }

  if (typeof itemRef === 'string') {
    if (isGridSubmenuKey(itemRef) || rawGridItemSubmenus.value[itemRef]) {
      return false;
    }

    if (isGridRefAliasKey(itemRef)) {
      const ref = getGridRefFromAliasKey(itemRef);
      const alias = gridItemRefAliases.value[ref];
      return alias ? isLabelItemId(alias.item) : false;
    }

    const alias = gridItemRefAliases.value[itemRef];
    if (alias) {
      return isLabelItemId(alias.item);
    }

    return isLabelItemId(itemRef);
  }

  if (isItemGridOrRef(itemRef)) {
    return itemRef.or.some((candidate) => shouldKeepHiddenGridSlot(candidate));
  }

  return false;
}

function filterGridRow(row: unknown[]): string[] {
  return row
    .map((itemRef: unknown) => {
      const itemId = resolveVisibleItemRef(itemRef);
      if (itemId) {
        return itemId;
      }

      return shouldKeepHiddenGridSlot(itemRef) ? EMPTY_GRID_ITEM_ID : null;
    })
    .filter((itemId: string | null): itemId is string => Boolean(itemId));
}

function filterGridElement(element: unknown): unknown | null {
  if (!element || typeof element !== 'object') return element;
  if ((element as { type?: string }).type === 'item') {
    const itemId = resolveVisibleItemRef((element as { item?: unknown }).item);
    if (!itemId) return null;
    return { ...element, item: itemId };
  }
  if ((element as { type?: string }).type === 'canvas') {
    const content = ((element as { content?: unknown[] }).content || [])
      .map((child: unknown) => filterGridElement(child))
      .filter(Boolean);
    if (content.length === 0) return null;
    return { ...element, content };
  }
  if ((element as { type?: string }).type === 'itemgrid') {
    const rows = ((element as { rows?: unknown[][] }).rows || [])
      .map((row: unknown[]) => filterGridRow(row))
      .filter(
        (row: string[]) =>
          row.length > 0 && row.some((itemId) => itemId !== EMPTY_GRID_ITEM_ID),
      );
    if (rows.length === 0) return null;
    return { ...element, rows };
  }
  if ((element as { type?: string }).type === 'array') {
    const content = ((element as { content?: unknown[] }).content || [])
      .map((child: unknown) => filterGridElement(child))
      .filter(Boolean);
    if (content.length === 0) return null;
    return { ...element, content };
  }
  if ((element as { type?: string }).type === 'section') {
    const content = ((element as GridSection).content || [])
      .map((child: unknown) => filterGridElement(child))
      .filter(Boolean);
    if (content.length === 0) return null;
    return { ...element, content };
  }
  return element;
}

const filteredOotGrid = computed(() => {
  return ootGrid.value
    ? (filterGridElement(ootGrid.value) as ResolvedGridArray | null)
    : null;
});

const filteredGridItemSubmenus = computed<
  Record<string, GridItemSubmenuConfig>
>(() => {
  const submenus: Record<string, GridItemSubmenuConfig> = {};

  for (const [ref, config] of Object.entries(rawGridItemSubmenus.value)) {
    const submenu = filterGridElement(config.submenu);
    if (!submenu) {
      continue;
    }

    submenus[ref] = {
      item: config.item,
      title: config.title,
      submenu: submenu as ResolvedGridNode,
    };
  }

  return submenus;
});

const filteredSharedGrid = computed(() => {
  return sharedGrid.value
    ? (filterGridElement(sharedGrid.value) as ResolvedGridArray | null)
    : null;
});

const filteredMmGrid = computed(() => {
  return mmGrid.value
    ? (filterGridElement(mmGrid.value) as ResolvedGridArray | null)
    : null;
});

const hasSharedSettingItems = computed(() => {
  if (!props.availableItemIds || props.availableItemIds.size === 0)
    return false;
  return Boolean(filteredSharedGrid.value);
});

function handleInventoryUpdate(newInventory: Map<string, number>) {
  emit('update:inventory', newInventory);
}
</script>

<template>
  <div class="item-grid-container">
    <div class="dual-grid-wrapper">
      <!-- Shared Items Grid -->
      <div
        v-if="hasSharedSettingItems && filteredSharedGrid"
        class="single-grid"
      >
        <div class="grid-header">Shared Items</div>
        <OoTMMSingleGrid
          :inventory="inventory"
          :grid="filteredSharedGrid"
          :grid-item-refs="gridItemRefAliases"
          :grid-item-multi-activations="gridItemMultiActivations"
          :grid-item-submenus="filteredGridItemSubmenus"
          :label-item-ids="labelItemIds"
          :item-max-counts="itemMaxCounts"
          :available-item-ids="availableItemIds"
          :settings="settings"
          @update:inventory="handleInventoryUpdate"
        />
      </div>

      <!-- OoT Grid -->
      <div v-if="filteredOotGrid" class="single-grid">
        <div class="grid-header">Ocarina of Time</div>
        <OoTMMSingleGrid
          :inventory="inventory"
          :grid="filteredOotGrid"
          :grid-item-refs="gridItemRefAliases"
          :grid-item-multi-activations="gridItemMultiActivations"
          :grid-item-submenus="filteredGridItemSubmenus"
          :label-item-ids="labelItemIds"
          :item-max-counts="itemMaxCounts"
          :available-item-ids="availableItemIds"
          :settings="settings"
          @update:inventory="handleInventoryUpdate"
        />
      </div>

      <!-- MM Grid -->
      <div v-if="filteredMmGrid" class="single-grid">
        <div class="grid-header">Majora's Mask</div>
        <OoTMMSingleGrid
          :inventory="inventory"
          :grid="filteredMmGrid"
          :grid-item-refs="gridItemRefAliases"
          :grid-item-multi-activations="gridItemMultiActivations"
          :grid-item-submenus="filteredGridItemSubmenus"
          :label-item-ids="labelItemIds"
          :item-max-counts="itemMaxCounts"
          :available-item-ids="availableItemIds"
          :settings="settings"
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
  max-height: 100%;
  flex: 1;
}

.dual-grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: flex-start;
  align-items: stretch;
}

.single-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.grid-header {
  font-size: 16px;
  font-weight: bold;
  color: #e5e5e5;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
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
