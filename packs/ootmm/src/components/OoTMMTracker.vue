<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { TrackerPack } from '@/types/tracker';
import OoTMMInventory from './OoTMMInventory.vue';
import OoTMMLocations from './OoTMMLocations.vue';
import OoTMMSettings from './OoTMMSettings.vue';
import OoTMMItemGrid from './OoTMMItemGrid.vue';
import OoTMMWorld from './OoTMMWorld.vue';
import OoTMMMap from './OoTMMMap.vue';
import OoTMMTricks from './OoTMMTricks.vue';
import FairyLoader from '@/components/FairyLoader.vue';
import { SETTINGS_DEFINITIONS } from '../data/settings';
import { parseSpoilerLog } from '../utils/spoiler';
import { useLocationCodeLookup } from '../composables/useLocationCodeLookup';
import {
  matchesLocationBaseVisibility,
  isLocationVisibleInSidebar,
  type LocationVisibilityFilters,
} from '../utils/locationVisibility';
import {
  getSearchTerms,
  matchesNormalizedSearchTerms,
  normalizeSearchText,
} from '../utils/search';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore, type TrackerTab } from '../stores/ootmmUi';
import { OOTMM_MAP_DEFS } from '../data/maps';
import type { MapDef } from '../data/maps/types';
import * as ItemsMod from '@ootmm/core/items/index';
import * as NamesMod from '@ootmm/core/names';
import * as SettingsDataMod from '@ootmm/core/settings/data.js';
import { TRICKS } from '@ootmm/core/settings/tricks';

const props = defineProps<{
  tracker: TrackerPack;
}>();

type SettingsPanelHandle = {
  hasUnsavedChanges: () => boolean;
  getLocalSettingsSnapshot: () => Record<string, unknown>;
};

type DevDraftIssue = {
  markerIndex: number;
  message: string;
};

type DevMarkerSelectRequest = {
  markerIndex: number;
  nonce: number;
};

const resolveExport = <T,>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown };
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T);
};

type CoreSetting = {
  key?: string;
  name?: string;
  type?: string;
  values?: Array<{ name?: string; value?: unknown }>;
};

const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items');
const itemName = resolveExport<typeof NamesMod.itemName>(NamesMod, 'itemName');
const coreSettings = ((SettingsDataMod as { SETTINGS?: unknown[] })?.SETTINGS ??
  []) as CoreSetting[];
const settingsByKey = new Map<string, CoreSetting>(
  coreSettings
    .filter((setting) => typeof setting.key === 'string')
    .map((setting) => [setting.key as string, setting]),
);
const settingsByName = new Map<string, CoreSetting>(
  coreSettings
    .filter((setting) => typeof setting.name === 'string')
    .map((setting) => [setting.name as string, setting]),
);
const supportedSettingKeys = new Set(
  SETTINGS_DEFINITIONS.map((setting) => setting.key),
);
const itemNameToId = new Map<string, string>();
const ALL_TRICKS = TRICKS as Record<string, { name?: string }>;
const trickNameToKey = new Map<string, string>();

const normalizeName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

if (Items) {
  for (const item of Object.values(Items as Record<string, unknown>)) {
    const id = (item as { id?: string })?.id;
    if (!id) continue;
    const name = itemName ? itemName(id) : id;
    itemNameToId.set(normalizeName(name), id);
  }
}

for (const [key, trick] of Object.entries(ALL_TRICKS)) {
  if (!trick?.name) continue;
  trickNameToKey.set(normalizeName(trick.name), key);
}

const sessionStore = useOoTMMSessionStore();
const uiStore = useOoTMMUiStore();

const {
  inventoryMap: inventory,
  reachableLocationIdSet: reachableLocationIds,
  availableItemIdSet: availableItemIds,
  itemMaxCountsMap: itemMaxCounts,
  canComplete,
  trackerSettings,
  preCompletedDungeons,
  songEvents,
  collectedLocationIds,
  isApplyingSettings,
  preCompletedEnabled,
  canUndo,
  canRedo,
  allLocations,
} = storeToRefs(sessionStore);

const {
  activeTab,
  isLocationsSidebarOpen,
  isSpoilerDragActive,
  spoilerDragDepth,
  locationsSearchQuery,
  locationsSelectedCategory,
  locationsReachabilityFilter,
  locationsCollectionFilter,
  locationsShowUnshuffled,
  locationsShowGossipStones,
  activeMapId,
} = storeToRefs(uiStore);

const settingsRef = ref<SettingsPanelHandle | null>(null);
const isStatsCollapsed = ref(true);
const mapDefs = OOTMM_MAP_DEFS;
type SelectedGamesSetting = 'ootmm' | 'oot' | 'mm';
const DEFAULT_MAP_ID = 'oot_kokiri_forest';

// ensure there's a sensible active map id in the UI store
if (!activeMapId.value) {
  activeMapId.value = mapDefs.some((mapDef) => mapDef.id === DEFAULT_MAP_ID)
    ? DEFAULT_MAP_ID
    : (mapDefs[0]?.id ?? '');
}
const mapSelectorQuery = ref('');
const mapSelectorInputRef = ref<HTMLInputElement | null>(null);
const isMapSelectorOpen = ref(false);
const hasMapSelectorUserInput = ref(false);
const mapSelectorHighlightedIndex = ref(-1);
const isMapDevMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('devmode') === '1';
const isMapWarningsOpen = ref(false);
const mapWarnings = ref<DevDraftIssue[]>([]);
const mapWarningAnchorRef = ref<HTMLElement | null>(null);
const mapWarningPanelRef = ref<HTMLElement | null>(null);
const mapMarkerSelectRequest = ref<DevMarkerSelectRequest | null>(null);
const mapMarkerHoverIndex = ref<number | null>(null);
let mapMarkerSelectNonce = 0;

function resolveSelectedGamesSetting(value: unknown): SelectedGamesSetting {
  if (value === 'oot' || value === 'mm' || value === 'ootmm') {
    return value;
  }
  return 'ootmm';
}

function getMapGameFromId(mapId: string): 'oot' | 'mm' | null {
  if (mapId.startsWith('oot_')) return 'oot';
  if (mapId.startsWith('mm_')) return 'mm';
  return null;
}

function isMapVisibleForSelectedGames(
  mapDef: MapDef,
  selectedGames: SelectedGamesSetting,
): boolean {
  if (selectedGames === 'ootmm') return true;
  const mapGame = getMapGameFromId(mapDef.id);
  if (!mapGame) return true;
  return mapGame === selectedGames;
}

const selectedGamesSetting = computed<SelectedGamesSetting>(() =>
  resolveSelectedGamesSetting(trackerSettings.value?.games),
);
const selectableMapDefs = computed(() =>
  mapDefs.filter((mapDef) =>
    isMapVisibleForSelectedGames(mapDef, selectedGamesSetting.value),
  ),
);

const activeMap = computed<MapDef | null>(() => {
  if (selectableMapDefs.value.length === 0) return null;
  return (
    selectableMapDefs.value.find((mapDef) => mapDef.id === activeMapId.value) ??
    selectableMapDefs.value[0]
  );
});
const collectedLocationIdSet = computed(
  () => new Set(collectedLocationIds.value),
);
const locationVisibilityFilters = computed<LocationVisibilityFilters>(() => ({
  searchQuery: locationsSearchQuery.value,
  selectedCategory: locationsSelectedCategory.value,
  reachabilityFilter: locationsReachabilityFilter.value,
  collectionFilter: locationsCollectionFilter.value,
  showUnshuffled: locationsShowUnshuffled.value,
  showGossipStones: locationsShowGossipStones.value,
}));
const sidebarStatsBaseFilters = computed<LocationVisibilityFilters>(() => ({
  searchQuery: '',
  selectedCategory: 'all',
  reachabilityFilter: 'all',
  collectionFilter: 'all',
  showUnshuffled: false,
  showGossipStones: false,
}));
const sidebarStats = computed(() => {
  let total = 0;
  let reachable = 0;
  let checked = 0;

  for (const location of allLocations.value) {
    if (!matchesLocationBaseVisibility(location, sidebarStatsBaseFilters.value))
      continue;
    total += 1;
    if (reachableLocationIds.value.has(location.id)) reachable += 1;
    if (collectedLocationIdSet.value.has(location.id)) checked += 1;
  }

  return {
    total,
    reachable,
    checked,
    remaining: total - checked,
  };
});
const mapLocationVisibilityFilters = computed<LocationVisibilityFilters>(
  () => ({
    ...locationVisibilityFilters.value,
    searchQuery: '',
    selectedCategory: 'all',
  }),
);
const visibleLocationIds = computed(() => {
  const visible = new Set<string>();
  for (const location of allLocations.value) {
    if (
      isLocationVisibleInSidebar(
        location,
        mapLocationVisibilityFilters.value,
        reachableLocationIds.value,
        collectedLocationIdSet.value,
      )
    ) {
      visible.add(location.id);
    }
  }
  return visible;
});
const allLocationsForCodeSearch = computed(
  () => props.tracker.getAllLocationsForCodeSearch?.() ?? allLocations.value,
);
const { resolveCodeToCheckIds: resolveMapSelectorCodeToCheckIds } =
  useLocationCodeLookup(
    computed(() =>
      allLocationsForCodeSearch.value.length > 0
        ? allLocationsForCodeSearch.value
        : allLocations.value,
    ),
    reachableLocationIds,
    collectedLocationIdSet,
  );

function normalizeMapCodeList(
  rawCodes: string | string[] | undefined,
): string[] {
  const rawList = Array.isArray(rawCodes) ? rawCodes : [rawCodes ?? ''];
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0);
}

function looksLikeLocationId(value: string): boolean {
  return /@\d+$/.test(value);
}

function addResolvedMapSelectorCode(checkIds: Set<string>, code: string): void {
  const resolved = resolveMapSelectorCodeToCheckIds(code);
  const candidateIds =
    resolved.length > 0 ? resolved : looksLikeLocationId(code) ? [code] : [];
  for (const checkId of candidateIds) {
    checkIds.add(checkId);
  }
}

const mapSelectorCheckIdsByMap = computed(() => {
  const byMap = new Map<string, Set<string>>();

  for (const mapDef of selectableMapDefs.value) {
    const checkIds = new Set<string>();
    for (const marker of mapDef.markers) {
      if (
        marker.type === 'submenu' &&
        Array.isArray(marker.markers) &&
        marker.markers.length > 0
      ) {
        for (const submenuEntry of marker.markers) {
          for (const code of normalizeMapCodeList(submenuEntry.codes)) {
            addResolvedMapSelectorCode(checkIds, code);
          }
        }
        continue;
      }
      for (const code of normalizeMapCodeList(marker.codes)) {
        addResolvedMapSelectorCode(checkIds, code);
      }
    }
    byMap.set(mapDef.id, checkIds);
  }

  return byMap;
});

const mapSelectorVisibleCountByMap = computed(() => {
  const byMap = new Map<string, number>();
  for (const mapDef of selectableMapDefs.value) {
    const checkIds = mapSelectorCheckIdsByMap.value.get(mapDef.id);
    if (!checkIds || checkIds.size === 0) {
      byMap.set(mapDef.id, 0);
      continue;
    }
    let visibleCount = 0;
    for (const checkId of checkIds) {
      if (visibleLocationIds.value.has(checkId)) {
        visibleCount += 1;
      }
    }
    byMap.set(mapDef.id, visibleCount);
  }
  return byMap;
});

function getMapSelectorVisibleCount(mapDef: MapDef): number {
  return mapSelectorVisibleCountByMap.value.get(mapDef.id) ?? 0;
}

function getMapSelectorLabel(mapDef: MapDef): string {
  return `${mapDef.title} (${getMapSelectorVisibleCount(mapDef)})`;
}

function syncMapSelectorQueryToActiveMap(): void {
  mapSelectorQuery.value = activeMap.value
    ? getMapSelectorLabel(activeMap.value)
    : '';
}
const trackerSpecialConds = computed<Record<string, unknown> | undefined>(
  () => {
    const raw = trackerSettings.value?.specialConds;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    return raw as Record<string, unknown>;
  },
);

const MAJOR_DUNGEONS = [
  { id: 'DT', label: 'Deku Tree', game: 'oot' as const },
  { id: 'DC', label: "Dodongo's Cavern", game: 'oot' as const },
  { id: 'JJ', label: "Jabu-Jabu's Belly", game: 'oot' as const },
  { id: 'Forest', label: 'Forest Temple', game: 'oot' as const },
  { id: 'Fire', label: 'Fire Temple', game: 'oot' as const },
  { id: 'Water', label: 'Water Temple', game: 'oot' as const },
  { id: 'Shadow', label: 'Shadow Temple', game: 'oot' as const },
  { id: 'Spirit', label: 'Spirit Temple', game: 'oot' as const },
  { id: 'WF', label: 'Woodfall Temple', game: 'mm' as const },
  { id: 'SH', label: 'Snowhead Temple', game: 'mm' as const },
  { id: 'GB', label: 'Great Bay Temple', game: 'mm' as const },
  { id: 'ST', label: 'Stone Tower Temple', game: 'mm' as const },
];

watch(
  selectableMapDefs,
  (availableMapDefs) => {
    if (availableMapDefs.length === 0) {
      activeMapId.value = '';
      return;
    }
    if (availableMapDefs.some((mapDef) => mapDef.id === activeMapId.value)) {
      return;
    }
    activeMapId.value = availableMapDefs[0].id;
  },
  { immediate: true },
);

watch(
  () => props.tracker,
  (nextTracker) => {
    sessionStore.attachTracker(nextTracker);
  },
  { immediate: true },
);

watch(
  preCompletedEnabled,
  () => {
    sessionStore.applyPreCompletedDungeons();
  },
  { immediate: true },
);

watch(
  () => trackerSettings.value?.songEventsShuffleOot,
  () => {
    sessionStore.applySongEvents();
  },
  { immediate: true },
);

watch(
  () => [
    trackerSettings.value?.priceOotShops,
    trackerSettings.value?.priceMmShops,
    trackerSettings.value?.priceOotScrubs,
    trackerSettings.value?.priceOotMerchants,
    trackerSettings.value?.priceMmTingle,
  ],
  () => {
    sessionStore.applyShopPrices();
  },
  { immediate: true },
);

function syncMapSelectorToActiveMap() {
  syncMapSelectorQueryToActiveMap();
  hasMapSelectorUserInput.value = false;
  mapSelectorHighlightedIndex.value = -1;
}

function getMapSelectorMatches(rawQuery: string): MapDef[] {
  const query = normalizeSearchText(rawQuery);
  const terms = getSearchTerms(rawQuery);
  if (terms.length === 0) return selectableMapDefs.value;

  const exactMatches: MapDef[] = [];
  const prefixMatches: MapDef[] = [];
  const fuzzyMatches: MapDef[] = [];

  for (const mapDef of selectableMapDefs.value) {
    const mapId = normalizeSearchText(mapDef.id);
    const mapTitle = normalizeSearchText(mapDef.title);
    if (!matchesNormalizedSearchTerms([mapId, mapTitle], terms)) {
      continue;
    }
    if (mapId === query || mapTitle === query) {
      exactMatches.push(mapDef);
      continue;
    }
    if (mapId.startsWith(query) || mapTitle.startsWith(query)) {
      prefixMatches.push(mapDef);
      continue;
    }
    if (mapId.includes(query) || mapTitle.includes(query)) {
      fuzzyMatches.push(mapDef);
    }
  }

  return [...exactMatches, ...prefixMatches, ...fuzzyMatches];
}

function compareMapSelectorMapsByVisibleCount(a: MapDef, b: MapDef): number {
  const aCount = getMapSelectorVisibleCount(a);
  const bCount = getMapSelectorVisibleCount(b);
  const aIsZero = aCount === 0;
  const bIsZero = bCount === 0;

  if (aIsZero && bIsZero) {
    return a.title.localeCompare(b.title);
  }

  if (aIsZero) return 1;
  if (bIsZero) return -1;

  if (aCount !== bCount) {
    return bCount - aCount;
  }

  return a.title.localeCompare(b.title);
}

const filteredMapSelectorMaps = computed(() => {
  const maps =
    isMapSelectorOpen.value && !hasMapSelectorUserInput.value
      ? selectableMapDefs.value
      : getMapSelectorMatches(mapSelectorQuery.value);

  return [...maps].sort(compareMapSelectorMapsByVisibleCount);
});
const mapSelectorFirstZeroCountIndex = computed(() =>
  filteredMapSelectorMaps.value.findIndex(
    (mapDef) => getMapSelectorVisibleCount(mapDef) === 0,
  ),
);

function isMapSelectorFirstZeroCountOption(
  index: number,
  mapDef: MapDef,
): boolean {
  return (
    getMapSelectorVisibleCount(mapDef) === 0 &&
    index === mapSelectorFirstZeroCountIndex.value
  );
}

const activeMapSelectorOptionId = computed(() => {
  if (
    !isMapSelectorOpen.value ||
    mapSelectorHighlightedIndex.value < 0 ||
    mapSelectorHighlightedIndex.value >= filteredMapSelectorMaps.value.length
  ) {
    return undefined;
  }
  return getMapSelectorOptionId(mapSelectorHighlightedIndex.value);
});

function getMapSelectorOptionId(index: number): string {
  return `map-selector-option-${index}`;
}

function openMapSelector() {
  isMapSelectorOpen.value = true;
  const maps = filteredMapSelectorMaps.value;
  if (maps.length === 0) {
    mapSelectorHighlightedIndex.value = -1;
    return;
  }
  const activeIndex = maps.findIndex(
    (mapDef) => mapDef.id === activeMapId.value,
  );
  mapSelectorHighlightedIndex.value = activeIndex >= 0 ? activeIndex : 0;
}

function closeMapSelector(options?: { syncInput?: boolean }) {
  const shouldSyncInput = options?.syncInput ?? true;
  isMapSelectorOpen.value = false;
  if (shouldSyncInput) {
    syncMapSelectorToActiveMap();
  }
}

function setMapSelectorHighlight(index: number) {
  const mapCount = filteredMapSelectorMaps.value.length;
  if (mapCount === 0) {
    mapSelectorHighlightedIndex.value = -1;
    return;
  }
  mapSelectorHighlightedIndex.value = Math.min(
    Math.max(index, 0),
    mapCount - 1,
  );
}

function selectMapFromSelector(mapDef: MapDef, options?: { close?: boolean }) {
  activeMapId.value = mapDef.id;
  mapSelectorQuery.value = getMapSelectorLabel(mapDef);
  hasMapSelectorUserInput.value = false;
  const shouldClose = options?.close ?? true;
  if (shouldClose) {
    isMapSelectorOpen.value = false;
  }
  const selectedIndex = filteredMapSelectorMaps.value.findIndex(
    (candidate) => candidate.id === mapDef.id,
  );
  mapSelectorHighlightedIndex.value = selectedIndex >= 0 ? selectedIndex : -1;
}

function findMapForSelectorQuery(rawQuery: string): MapDef | null {
  const query = normalizeSearchText(rawQuery);
  if (!query) return null;

  const byIdExact = selectableMapDefs.value.find(
    (mapDef) => normalizeSearchText(mapDef.id) === query,
  );
  if (byIdExact) return byIdExact;

  const byTitleExact = selectableMapDefs.value.find(
    (mapDef) => normalizeSearchText(mapDef.title) === query,
  );
  if (byTitleExact) return byTitleExact;

  const fuzzyMatches = getMapSelectorMatches(rawQuery);
  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null;
}

function commitMapSelectorSelection() {
  const maps = filteredMapSelectorMaps.value;
  if (maps.length === 0) {
    closeMapSelector();
    return;
  }
  const highlightedIndex = mapSelectorHighlightedIndex.value;
  const selectedMap =
    highlightedIndex >= 0 && highlightedIndex < maps.length
      ? maps[highlightedIndex]
      : maps[0];
  selectMapFromSelector(selectedMap);
}

function handleMapSelectorFocus() {
  hasMapSelectorUserInput.value = false;
}

function handleMapSelectorClick() {
  hasMapSelectorUserInput.value = false;
  openMapSelector();
  mapSelectorInputRef.value?.select();
}

function handleMapSelectorBlur() {
  closeMapSelector();
}

function handleMapSelectorInput() {
  hasMapSelectorUserInput.value = true;
  openMapSelector();
  setMapSelectorHighlight(0);
  const match = findMapForSelectorQuery(mapSelectorQuery.value);
  if (!match) return;
  activeMapId.value = match.id;
  const exactMatchIndex = filteredMapSelectorMaps.value.findIndex(
    (mapDef) => mapDef.id === match.id,
  );
  if (exactMatchIndex >= 0) {
    mapSelectorHighlightedIndex.value = exactMatchIndex;
  }
}

function handleMapSelectorOptionClick(mapDef: MapDef) {
  selectMapFromSelector(mapDef);
}

function handleMapSelectorKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isMapSelectorOpen.value) {
      openMapSelector();
      return;
    }
    const maps = filteredMapSelectorMaps.value;
    if (maps.length === 0) return;
    const nextIndex =
      mapSelectorHighlightedIndex.value < 0
        ? 0
        : (mapSelectorHighlightedIndex.value + 1) % maps.length;
    setMapSelectorHighlight(nextIndex);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isMapSelectorOpen.value) {
      openMapSelector();
      return;
    }
    const maps = filteredMapSelectorMaps.value;
    if (maps.length === 0) return;
    const nextIndex =
      mapSelectorHighlightedIndex.value < 0
        ? maps.length - 1
        : (mapSelectorHighlightedIndex.value - 1 + maps.length) % maps.length;
    setMapSelectorHighlight(nextIndex);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    commitMapSelectorSelection();
    return;
  }

  if (event.key === 'Tab') {
    if (!isMapSelectorOpen.value) return;
    if (filteredMapSelectorMaps.value.length === 0) return;
    commitMapSelectorSelection();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMapSelector();
  }
}

watch(
  () => activeMap.value?.id,
  () => {
    if (isMapSelectorOpen.value) return;
    syncMapSelectorToActiveMap();
  },
  { immediate: true },
);

const activeMapVisibleCount = computed(() => {
  const mapDef = activeMap.value;
  if (!mapDef) return 0;
  return mapSelectorVisibleCountByMap.value.get(mapDef.id) ?? 0;
});

watch(activeMapVisibleCount, () => {
  if (hasMapSelectorUserInput.value) return;
  syncMapSelectorQueryToActiveMap();
});

watch(filteredMapSelectorMaps, (maps) => {
  if (maps.length === 0) {
    mapSelectorHighlightedIndex.value = -1;
    return;
  }
  if (
    mapSelectorHighlightedIndex.value < 0 ||
    mapSelectorHighlightedIndex.value >= maps.length
  ) {
    mapSelectorHighlightedIndex.value = 0;
  }
});

function fillInventory() {
  sessionStore.fillInventoryForDebugActivateAll();
}

function handleMapToggleCollected(checkId: string) {
  sessionStore.toggleCollectedLocation(checkId);
}

function handleMapMarkAllReachable(checkIds: string[]) {
  if (checkIds.length === 0) return;
  const next = new Set(collectedLocationIds.value);
  for (const checkId of checkIds) {
    next.add(checkId);
  }
  sessionStore.setCollectedLocationIds(Array.from(next));
}

function handleMapPopupOpen() {}

function handleMapPopupClose() {}

function toggleMapWarningsPanel() {
  if (mapWarnings.value.length === 0) return;
  if (isMapWarningsOpen.value) {
    closeMapWarningsPanel();
    return;
  }
  isMapWarningsOpen.value = true;
}

function closeMapWarningsPanel() {
  isMapWarningsOpen.value = false;
  mapMarkerHoverIndex.value = null;
}

function handleMapWarningsChange(warnings: DevDraftIssue[]) {
  mapWarnings.value = warnings;
  if (warnings.length === 0) {
    closeMapWarningsPanel();
  }
}

function focusMapWarningMarker(markerIndex: number) {
  mapMarkerSelectNonce += 1;
  mapMarkerSelectRequest.value = { markerIndex, nonce: mapMarkerSelectNonce };
  closeMapWarningsPanel();
}

function setHoveredMapWarningMarker(markerIndex: number | null) {
  mapMarkerHoverIndex.value = markerIndex;
}

function handleMapWarningGlobalPointerDown(event: PointerEvent) {
  if (!isMapWarningsOpen.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (
    mapWarningAnchorRef.value?.contains(target) ||
    mapWarningPanelRef.value?.contains(target)
  ) {
    return;
  }
  closeMapWarningsPanel();
}

async function undo() {
  if (isApplyingSettings.value || !canUndo.value) return;
  await sessionStore.undo();
}

async function redo() {
  if (isApplyingSettings.value || !canRedo.value) return;
  await sessionStore.redo();
}

function handleInventoryChange(newInventory: Map<string, number>) {
  sessionStore.setInventoryFromMap(newInventory);
}

async function handleSettingsChange(newSettings: Record<string, unknown>) {
  await sessionStore.applySettings(newSettings);
}

function applySpecialCondsPatch(patch: Record<string, unknown>) {
  sessionStore.applySpecialCondsPatch(patch);
}

function coerceSettingValue(raw: unknown, def?: CoreSetting) {
  if (!def) return raw;

  if (def.type === 'set') {
    if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as { type?: string }).type === 'string'
    ) {
      return raw;
    }
    if (Array.isArray(raw)) {
      return { type: 'specific', values: raw };
    }
    if (typeof raw === 'string') {
      return { type: raw };
    }
    return raw;
  }

  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }

  if (def.type === 'number') {
    if (typeof raw === 'number') return raw;
    const num = Number(raw);
    return Number.isNaN(num) ? raw : num;
  }

  return raw;
}

function coerceWorldFlagValue(raw: unknown, def?: CoreSetting) {
  if (!def || def.type !== 'set') {
    return raw;
  }

  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { type?: string }).type === 'specific' &&
    Array.isArray((raw as { values?: unknown[] }).values)
  ) {
    const lookup = new Map(def.values?.map((v) => [v.name, v.value]) ?? []);
    const values = (raw as { values?: string[] }).values
      ?.map((name) => lookup.get(name))
      .filter(Boolean);
    return { type: 'specific', values };
  }

  if (typeof raw === 'string') {
    return { type: raw };
  }

  return raw;
}

function applyStartingItems(startingItems: Record<string, number>) {
  const nextById: Record<string, number> = {};
  for (const [name, count] of Object.entries(startingItems)) {
    if (!count || count <= 0) continue;
    const itemId = itemNameToId.get(normalizeName(name));
    if (!itemId) {
      console.warn('[OoTMM Tracker] Unknown starting item:', name);
      continue;
    }
    nextById[itemId] = Math.max(nextById[itemId] ?? 0, count);
  }
  sessionStore.mergeInventoryCounts(nextById);
}

function applyJunkLocations(junkLocations: string[]) {
  if (junkLocations.length === 0) return;
  const locations = allLocations.value;
  const byName = new Map<string, string[]>();
  for (const loc of locations) {
    const key = normalizeName(loc.name);
    const existing = byName.get(key) ?? [];
    existing.push(loc.id);
    byName.set(key, existing);
  }
  const next = new Set(collectedLocationIds.value);
  for (const locName of junkLocations) {
    const ids = byName.get(normalizeName(locName));
    if (!ids) {
      console.warn('[OoTMM Tracker] Junk location not found:', locName);
      continue;
    }
    for (const id of ids) {
      next.add(id);
    }
  }
  sessionStore.setCollectedLocationIds(Array.from(next));
}

async function applySpoilerLog(text: string) {
  if (isApplyingSettings.value) return;
  const parsed = parseSpoilerLog(text);
  const settingsPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.settings)) {
    if (!supportedSettingKeys.has(key)) continue;
    const def = settingsByKey.get(key);
    settingsPatch[key] = coerceSettingValue(value, def);
  }

  for (const [name, value] of Object.entries(parsed.worldFlags)) {
    const def = settingsByName.get(name);
    const settingKey = def?.key;
    if (typeof settingKey !== 'string' || !supportedSettingKeys.has(settingKey))
      continue;
    settingsPatch[settingKey] = coerceWorldFlagValue(value, def);
  }

  if (parsed.tricks) {
    const parsedTrickKeys: string[] = [];
    const unknownTricks: string[] = [];
    for (const trickName of parsed.tricks) {
      const key = trickNameToKey.get(normalizeName(trickName));
      if (key) {
        parsedTrickKeys.push(key);
      } else {
        unknownTricks.push(trickName);
      }
    }
    if (unknownTricks.length > 0) {
      console.warn(
        '[OoTMM Tracker] Unknown tricks in spoiler log:',
        unknownTricks,
      );
    }
    settingsPatch.tricks = Array.from(new Set(parsedTrickKeys));
  }

  const nextSettings = { ...trackerSettings.value, ...settingsPatch };
  if (Object.keys(parsed.specialConds).length > 0) {
    nextSettings.specialConds = parsed.specialConds;
  }

  if (
    Object.keys(settingsPatch).length > 0 ||
    Object.keys(parsed.specialConds).length > 0
  ) {
    await handleSettingsChange(nextSettings);
  }

  if (parsed.preCompletedDungeons.length > 0) {
    sessionStore.setPreCompletedDungeons(
      Array.from(new Set(parsed.preCompletedDungeons)),
    );
  }

  if (Object.keys(parsed.startingItems).length > 0) {
    applyStartingItems(parsed.startingItems);
  }

  if (parsed.junkLocations.length > 0) {
    applyJunkLocations(parsed.junkLocations);
  }
}

async function handleSpoilerFile(file: File) {
  if (!file) return;
  const text = await file.text();
  await applySpoilerLog(text);
}

function hasFilePayload(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function onSpoilerDragEnter(event: DragEvent) {
  if (!hasFilePayload(event)) return;
  event.preventDefault();
  spoilerDragDepth.value += 1;
  isSpoilerDragActive.value = true;
}

function onSpoilerDragLeave(event: DragEvent) {
  if (!hasFilePayload(event)) return;
  event.preventDefault();
  spoilerDragDepth.value = Math.max(0, spoilerDragDepth.value - 1);
  if (spoilerDragDepth.value === 0) {
    isSpoilerDragActive.value = false;
  }
}

function onSpoilerDragOver(event: DragEvent) {
  if (!hasFilePayload(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  isSpoilerDragActive.value = true;
}

async function onSpoilerDrop(event: DragEvent) {
  if (!hasFilePayload(event)) return;
  event.preventDefault();
  spoilerDragDepth.value = 0;
  isSpoilerDragActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    await handleSpoilerFile(file);
  }
}

async function requestTabSwitch(nextTab: TrackerTab) {
  if (activeTab.value === nextTab) return;
  if (isApplyingSettings.value) return;

  if (activeTab.value === 'settings' || activeTab.value === 'tricks') {
    const settingsHandle = settingsRef.value;
    if (settingsHandle?.hasUnsavedChanges()) {
      await handleSettingsChange(settingsHandle.getLocalSettingsSnapshot());
    }
  }

  uiStore.setActiveTab(nextTab);
}

function toggleStatsCollapsed() {
  isStatsCollapsed.value = !isStatsCollapsed.value;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function handleGlobalUndoRedoKeydown(event: KeyboardEvent) {
  if (isApplyingSettings.value) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  if (isEditableTarget(event.target)) return;

  const key = event.key.toLowerCase();
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
  if (!isUndo && !isRedo) return;

  event.preventDefault();
  if (isUndo) {
    void undo();
    return;
  }
  void redo();
}

onMounted(() => {
  const windowWithDebug = window as Window & {
    __TLT_DEBUG_ACTIVATE_ALL__?: () => void;
  };
  windowWithDebug.__TLT_DEBUG_ACTIVATE_ALL__ = fillInventory;
  window.addEventListener('keydown', handleGlobalUndoRedoKeydown);
  window.addEventListener('pointerdown', handleMapWarningGlobalPointerDown);
});

onBeforeUnmount(() => {
  const windowWithDebug = window as Window & {
    __TLT_DEBUG_ACTIVATE_ALL__?: () => void;
  };
  if (windowWithDebug.__TLT_DEBUG_ACTIVATE_ALL__ === fillInventory) {
    delete windowWithDebug.__TLT_DEBUG_ACTIVATE_ALL__;
  }
  window.removeEventListener('keydown', handleGlobalUndoRedoKeydown);
  window.removeEventListener('pointerdown', handleMapWarningGlobalPointerDown);
});
</script>

<template>
  <div
    class="ootmm-tracker"
    :class="{ 'drag-active': isSpoilerDragActive }"
    @dragenter="onSpoilerDragEnter"
    @dragover="onSpoilerDragOver"
    @dragleave="onSpoilerDragLeave"
    @drop="onSpoilerDrop"
  >
    <div
      v-if="isApplyingSettings"
      class="applying-overlay"
      data-testid="applying-settings-overlay"
      role="status"
      aria-live="polite"
    >
      <div class="applying-overlay__content">
        <FairyLoader
          size="sm"
          label="Applying settings..."
          subtitle="Recalculating tracker logic"
        />
      </div>
    </div>
    <div
      v-if="isSpoilerDragActive"
      class="spoiler-drop-overlay"
      role="status"
      aria-live="polite"
    >
      <div class="spoiler-drop-content">Drop spoiler log to load</div>
    </div>
    <div class="tracker-sidebar">
      <div class="stats-panel" :class="{ 'is-collapsed': isStatsCollapsed }">
        <div class="stats-header">
          <button
            type="button"
            class="stats-collapse-toggle"
            :aria-expanded="!isStatsCollapsed"
            aria-controls="stats-panel-content"
            @click="toggleStatsCollapsed"
          >
            <span class="stats-collapse-icon" aria-hidden="true">{{
              isStatsCollapsed ? '▸' : '▾'
            }}</span>
            <span class="stats-collapse-title">Statistics</span>
            <span v-if="isStatsCollapsed" class="stats-collapse-summary">
              {{ sidebarStats.reachable }} / {{ sidebarStats.total }}
            </span>
          </button>
        </div>
        <div
          v-if="!isStatsCollapsed"
          id="stats-panel-content"
          class="stats-grid"
        >
          <div class="stat-item">
            <span class="stat-label">Reachable:</span>
            <span class="stat-value" data-testid="stats-reachable-value">
              {{ sidebarStats.reachable }} / {{ sidebarStats.total }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Checked:</span>
            <span class="stat-value" data-testid="stats-checked-value">{{
              sidebarStats.checked
            }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Remaining:</span>
            <span class="stat-value" data-testid="stats-remaining-value">{{
              sidebarStats.remaining
            }}</span>
          </div>
          <div class="stat-item goal" :class="{ complete: canComplete }">
            <span class="stat-label">Goal:</span>
            <span class="stat-value">{{
              canComplete ? '✓ Ready' : '✗ Not Ready'
            }}</span>
          </div>
        </div>
        <div class="history-actions">
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings || !canUndo"
            @click="undo"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings || !canRedo"
            @click="redo"
          >
            Redo ↷
          </button>
        </div>
      </div>

      <div class="tabs">
        <button
          :class="{ active: activeTab === 'grid' }"
          data-testid="tab-items"
          @click="requestTabSwitch('grid')"
        >
          Items
        </button>
        <button
          :class="{ active: activeTab === 'inventory' }"
          data-testid="tab-inventory"
          @click="requestTabSwitch('inventory')"
        >
          All Items
        </button>
        <button
          :class="{ active: activeTab === 'world' }"
          data-testid="tab-world"
          @click="requestTabSwitch('world')"
        >
          World
        </button>
        <button
          :class="{ active: activeTab === 'settings' }"
          data-testid="tab-settings"
          @click="requestTabSwitch('settings')"
        >
          Settings
        </button>
        <button
          :class="{ active: activeTab === 'tricks' }"
          data-testid="tab-tricks"
          @click="requestTabSwitch('tricks')"
        >
          Tricks & Glitches
        </button>
      </div>

      <div class="tab-content">
        <OoTMMItemGrid
          v-if="activeTab === 'grid'"
          :inventory="inventory"
          :grid-id="'item_grid_tall_oot'"
          :available-item-ids="availableItemIds"
          :item-max-counts="itemMaxCounts"
          :settings="trackerSettings"
          @update:inventory="handleInventoryChange"
        />

        <OoTMMInventory
          v-if="activeTab === 'inventory'"
          :inventory="inventory"
          :available-item-ids="availableItemIds"
          :item-max-counts="itemMaxCounts"
          @update:inventory="handleInventoryChange"
        />

        <OoTMMWorld
          v-if="activeTab === 'world'"
          :enabled="preCompletedEnabled"
          :dungeons="MAJOR_DUNGEONS"
          :selected="preCompletedDungeons"
          :settings="trackerSettings"
          :song-events="songEvents"
          @update:selected="sessionStore.setPreCompletedDungeons($event)"
          @update:song-events="sessionStore.setSongEvents($event)"
        />

        <OoTMMSettings
          v-if="activeTab === 'settings'"
          ref="settingsRef"
          :settings="trackerSettings"
          :special-conds="trackerSpecialConds"
          :is-applying-settings="isApplyingSettings"
          @update:settings="handleSettingsChange"
          @update:special-conds="applySpecialCondsPatch"
          @load-spoiler-log="handleSpoilerFile"
        />

        <OoTMMTricks
          v-if="activeTab === 'tricks'"
          ref="settingsRef"
          :settings="trackerSettings"
          @update:settings="handleSettingsChange"
        />
      </div>
    </div>

    <div class="tracker-main">
      <div class="map-panel">
        <div class="map-shell">
          <div
            v-if="selectableMapDefs.length > 1 || isMapDevMode"
            class="map-toolbar"
          >
            <template v-if="selectableMapDefs.length > 1">
              <div class="map-selector-combobox">
                <label class="map-toolbar-label" for="map-selector">Map</label>
                <div class="map-selector-input-wrap">
                  <input
                    id="map-selector"
                    ref="mapSelectorInputRef"
                    v-model="mapSelectorQuery"
                    class="map-toolbar-combobox"
                    type="text"
                    placeholder="Search map by name or id"
                    autocomplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-label="Map selector"
                    aria-controls="map-selector-listbox"
                    :aria-expanded="isMapSelectorOpen"
                    :aria-activedescendant="activeMapSelectorOptionId"
                    @focus="handleMapSelectorFocus"
                    @click="handleMapSelectorClick"
                    @input="handleMapSelectorInput"
                    @blur="handleMapSelectorBlur"
                    @keydown="handleMapSelectorKeydown"
                  />
                  <ul
                    v-if="isMapSelectorOpen"
                    id="map-selector-listbox"
                    class="map-selector-options"
                    role="listbox"
                    aria-label="Map options"
                  >
                    <li
                      v-for="(mapDef, index) in filteredMapSelectorMaps"
                      :id="getMapSelectorOptionId(index)"
                      :key="mapDef.id"
                      class="map-selector-option"
                      :class="{
                        'is-highlighted': index === mapSelectorHighlightedIndex,
                        'is-zero-separator': isMapSelectorFirstZeroCountOption(
                          index,
                          mapDef,
                        ),
                      }"
                      role="option"
                      :aria-selected="index === mapSelectorHighlightedIndex"
                      @mousedown.prevent
                      @click="handleMapSelectorOptionClick(mapDef)"
                    >
                      <span class="map-selector-option-title">{{
                        mapDef.title
                      }}</span>
                      <span class="map-selector-option-count"
                        >({{ getMapSelectorVisibleCount(mapDef) }})</span
                      >
                    </li>
                    <li
                      v-if="filteredMapSelectorMaps.length === 0"
                      class="map-selector-empty"
                    >
                      No maps found
                    </li>
                  </ul>
                </div>
              </div>
            </template>
            <span v-else class="map-toolbar-label">
              {{ activeMap ? getMapSelectorLabel(activeMap) : 'Map' }}
            </span>

            <div class="map-toolbar-filters">
              <div
                class="map-filter-group"
                role="group"
                aria-label="Reachability filter"
              >
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{
                    'is-active': locationsReachabilityFilter === 'all',
                  }"
                  @click="locationsReachabilityFilter = 'all'"
                >
                  All
                </button>
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{
                    'is-active': locationsReachabilityFilter === 'reachable',
                  }"
                  @click="locationsReachabilityFilter = 'reachable'"
                >
                  Reachable
                </button>
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{
                    'is-active': locationsReachabilityFilter === 'unreachable',
                  }"
                  @click="locationsReachabilityFilter = 'unreachable'"
                >
                  Unreachable
                </button>
              </div>

              <div
                class="map-filter-group"
                role="group"
                aria-label="Collection filter"
              >
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{ 'is-active': locationsCollectionFilter === 'all' }"
                  @click="locationsCollectionFilter = 'all'"
                >
                  All
                </button>
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{
                    'is-active': locationsCollectionFilter === 'collected',
                  }"
                  @click="locationsCollectionFilter = 'collected'"
                >
                  Collected
                </button>
                <button
                  type="button"
                  class="map-filter-button"
                  :class="{
                    'is-active': locationsCollectionFilter === 'uncollected',
                  }"
                  @click="locationsCollectionFilter = 'uncollected'"
                >
                  Uncollected
                </button>
              </div>
            </div>

            <div
              class="map-toolbar-toggles"
              role="group"
              aria-label="Location visibility toggles"
            >
              <label class="map-toolbar-toggle-label">
                <input v-model="locationsShowUnshuffled" type="checkbox" />
                <span>Unshuffled Tokens/Fairies</span>
              </label>
              <label class="map-toolbar-toggle-label">
                <input v-model="locationsShowGossipStones" type="checkbox" />
                <span>Gossip Stones</span>
              </label>
            </div>

            <span v-if="isMapDevMode" class="map-toolbar-dev">DEV MODE</span>
            <div
              v-if="isMapDevMode"
              ref="mapWarningAnchorRef"
              class="map-toolbar-warning-wrap"
            >
              <button
                type="button"
                class="map-toolbar-warning-anchor"
                :class="{
                  'is-open': isMapWarningsOpen,
                  'has-warnings': mapWarnings.length > 0,
                }"
                :disabled="mapWarnings.length === 0"
                @click.stop="toggleMapWarningsPanel"
              >
                WARNINGS ({{ mapWarnings.length }})
              </button>
              <div
                v-if="isMapWarningsOpen"
                ref="mapWarningPanelRef"
                class="map-toolbar-warning-panel"
                role="dialog"
                aria-label="Map warnings"
                @mouseleave="setHoveredMapWarningMarker(null)"
              >
                <ul>
                  <li
                    v-for="(warning, index) in mapWarnings"
                    :key="`toolbar-warning:${warning.markerIndex}:${index}`"
                  >
                    <button
                      type="button"
                      class="map-toolbar-warning-item"
                      @mouseenter="
                        setHoveredMapWarningMarker(warning.markerIndex)
                      "
                      @focus="setHoveredMapWarningMarker(warning.markerIndex)"
                      @click="focusMapWarningMarker(warning.markerIndex)"
                    >
                      Marker #{{ warning.markerIndex + 1 }}:
                      {{ warning.message }}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <OoTMMMap
            class="map-view"
            :active-map="activeMap"
            :reachable-ids="reachableLocationIds"
            :collected-ids="collectedLocationIdSet"
            :all-locations="allLocations"
            :all-locations-for-code-search="allLocationsForCodeSearch"
            :visible-location-ids="visibleLocationIds"
            :dev-mode="isMapDevMode"
            :dev-marker-select-request="mapMarkerSelectRequest"
            :dev-marker-hover-index="mapMarkerHoverIndex"
            @toggle-collected="handleMapToggleCollected"
            @mark-all-reachable="handleMapMarkAllReachable"
            @open-popup="handleMapPopupOpen"
            @close-popup="handleMapPopupClose"
            @dev-warnings-change="handleMapWarningsChange"
          />
        </div>
      </div>

      <aside
        class="locations-sidebar"
        :class="{ collapsed: !isLocationsSidebarOpen }"
      >
        <button
          class="locations-toggle"
          type="button"
          :aria-expanded="isLocationsSidebarOpen"
          aria-controls="map-locations-panel"
          @click="isLocationsSidebarOpen = !isLocationsSidebarOpen"
        >
          <span class="toggle-text">Locations</span>
          <span class="toggle-icon">{{
            isLocationsSidebarOpen ? '>>' : '<<'
          }}</span>
        </button>
        <div class="locations-clip">
          <div
            id="map-locations-panel"
            class="locations-content"
            :aria-hidden="!isLocationsSidebarOpen"
          >
            <OoTMMLocations
              class="map-locations"
              :locations="allLocations"
              :reachable-ids="reachableLocationIds"
            />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ootmm-tracker {
  display: flex;
  height: 100%;
  background: #1a1a1a;
  position: relative;
}

.applying-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  color: #f3f4f6;
  text-align: center;
}

.applying-overlay__content {
  background: rgba(31, 41, 55, 0.9);
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  min-width: 220px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
}

.spoiler-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.12);
  border: 2px dashed #60a5fa;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 15;
  pointer-events: none;
}

.spoiler-drop-content {
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid #3b82f6;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  color: #e5e7eb;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tracker-sidebar {
  width: 400px;
  background: #2a2a2a;
  border-right: 2px solid #404040;
  display: flex;
  flex-direction: column;
}

.stats-panel {
  padding: 1rem;
  border-bottom: 1px solid #404040;
}

.stats-panel.is-collapsed .stats-header {
  margin-bottom: 0;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.stats-collapse-toggle {
  border: none;
  border-radius: 0.35rem;
  padding: 0.2rem 0.35rem;
  margin: -0.2rem -0.35rem;
  background: transparent;
  color: #d1d5db;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
  min-width: 0;
}

.stats-collapse-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
}

.stats-collapse-toggle:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.stats-collapse-icon {
  font-size: 0.8rem;
  color: #9ca3af;
  width: 0.7rem;
}

.stats-collapse-title {
  font-size: 0.875rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-collapse-summary {
  font-size: 0.9rem;
  color: #f3f4f6;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 0.25rem;
}

.stat-item.goal {
  grid-column: 1 / -1;
}

.stat-item.goal.complete {
  background: #065f46;
}

.stat-label {
  font-size: 0.75rem;
  color: #9ca3af;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
}

.history-actions {
  margin-top: 0.55rem;
  display: flex;
  gap: 0.45rem;
}

.history-button {
  flex: 1;
  padding: 0.4rem 0.5rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #404040;
}

.tabs button {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border-radius: 0;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.tabs button:hover {
  background: #333;
}

.tabs button.active {
  background: #1a1a1a;
  border-bottom: 2px solid #3b82f6;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

.tracker-main {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

.map-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.map-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.map-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #374151;
  background: #111827;
}

.map-selector-combobox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: min(420px, 100%);
  flex-wrap: nowrap;
}

.map-toolbar-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}

.map-toolbar-combobox {
  width: 100%;
  max-width: 100%;
}

.map-selector-input-wrap {
  position: relative;
  width: min(340px, 100%);
  max-width: 100%;
}

.map-selector-options {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #111827;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.45);
  max-height: min(20rem, 55vh);
  overflow-y: auto;
  z-index: 16;
}

.map-selector-option {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.35rem 0.45rem;
  border-radius: 0.25rem;
  cursor: pointer;
}

.map-selector-option:hover,
.map-selector-option.is-highlighted {
  background: #1f2937;
}

.map-selector-option.is-zero-separator {
  margin-top: 0.3rem;
  padding-top: 0.6rem;
  border-top: 1px solid #374151;
}

.map-selector-option-title {
  color: #e5e7eb;
  font-size: 0.8rem;
  min-width: 0;
}

.map-selector-option-count {
  color: #93c5fd;
  font-size: 0.7rem;
  white-space: nowrap;
}

.map-selector-empty {
  color: #9ca3af;
  font-size: 0.75rem;
  padding: 0.35rem 0.45rem;
}

.map-toolbar-dev {
  padding: 0.2rem 0.45rem;
  border-radius: 0.35rem;
  border: 1px solid #dc2626;
  background: #450a0a;
  color: #fecaca;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.map-toolbar-filters {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.map-filter-group {
  display: inline-flex;
  border: 1px solid #4b5563;
  border-radius: 0.4rem;
  overflow: hidden;
}

.map-filter-button {
  border: none;
  border-radius: 0;
  background: #1f2937;
  color: #cbd5e1;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  padding: 0.3rem 0.5rem;
  text-transform: uppercase;
}

.map-filter-button + .map-filter-button {
  border-left: 1px solid #374151;
}

.map-filter-button:hover {
  background: #111827;
}

.map-filter-button.is-active {
  background: #1d4ed8;
  color: #eff6ff;
}

.map-toolbar-toggles {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.map-toolbar-toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #cbd5e1;
  font-size: 0.72rem;
  white-space: nowrap;
}

.map-toolbar-toggle-label input {
  accent-color: #10b981;
}

.map-toolbar-warning-anchor {
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}

.map-toolbar-warning-anchor:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.map-toolbar-warning-anchor.has-warnings {
  border-color: #a16207;
  background: #422006;
  color: #fde68a;
}

.map-toolbar-warning-anchor.is-open {
  border-color: #f59e0b;
  background: #78350f;
  color: #fef3c7;
}

.map-toolbar-warning-wrap {
  position: relative;
}

.map-toolbar-warning-panel {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: auto;
  width: min(760px, calc(100vw - 1rem));
  max-height: min(55vh, 520px);
  overflow-y: auto;
  border-radius: 0.45rem;
  border: 1px solid #a16207;
  background: #1c1917;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
  z-index: 12;
  padding: 0.45rem;
}

.map-toolbar-warning-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.map-toolbar-warning-item {
  width: 100%;
  border: 1px solid #57534e;
  border-radius: 0.35rem;
  background: #292524;
  color: #fde68a;
  text-align: left;
  font-size: 0.72rem;
  line-height: 1.3;
  white-space: normal;
  word-break: break-word;
  padding: 0.3rem 0.4rem;
  cursor: pointer;
}

.map-toolbar-warning-item:hover {
  background: #3f3b36;
}

.map-view {
  flex: 1;
  min-height: 0;
}

.locations-sidebar {
  position: relative;
  width: 400px;
  flex: 0 0 400px;
  background: #2a2a2a;
  border-left: 2px solid #404040;
  display: flex;
  flex-direction: column;
  transition:
    width 0.2s ease,
    flex-basis 0.2s ease;
  overflow: visible;
}

.locations-sidebar.collapsed {
  width: 0;
  flex: 0 0 0;
  border-left: none;
}

.locations-clip {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.locations-toggle {
  position: absolute;
  top: 12px;
  left: 0;
  transform: translateX(calc(-100% + 4px));
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 0.5rem 0 0 0.5rem;
  color: #e5e7eb;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.locations-toggle:hover {
  background: #333;
  border-color: #4b5563;
}

.locations-toggle:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.toggle-icon {
  font-weight: 700;
}

.locations-content {
  position: absolute;
  inset: 0;
  width: 400px;
  display: flex;
  flex-direction: column;
}

.locations-sidebar.collapsed .locations-content {
  visibility: hidden;
  pointer-events: none;
}

.map-locations {
  flex: 1;
  min-height: 0;
}

@media (max-width: 900px) {
  .ootmm-tracker {
    flex-direction: column;
    height: auto;
  }

  .tracker-sidebar {
    width: 100%;
    flex: 0 0 auto;
  }

  .tracker-main {
    flex: 0 0 auto;
    min-height: 220px;
    border-top: 2px solid #404040;
    flex-direction: column;
  }

  .tabs {
    flex-wrap: wrap;
  }

  .tabs button {
    flex: 1 1 50%;
  }

  .map-selector-combobox {
    flex-wrap: wrap;
  }

  .map-selector-input-wrap {
    width: 100%;
  }

  .map-panel,
  .map-view {
    min-height: max(360px, 50vh);
  }

  .locations-sidebar {
    width: 100%;
    flex: 0 0 auto;
    border-left: none;
    border-top: 2px solid #404040;
  }

  .locations-sidebar.collapsed {
    width: 100%;
    flex: 0 0 0;
    border-top: none;
  }

  .locations-toggle {
    left: 12px;
    top: -16px;
    border-radius: 0.5rem;
    transform: none;
  }

  .locations-content {
    position: relative;
    width: 100%;
  }
}

@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .tabs button {
    flex: 1 1 100%;
  }

  /* Ensure the map container grows on small screens so the Locations panel stacks below it */
  .map-panel,
  .map-view {
    min-height: max(360px, 50vh);
  }
}
</style>
