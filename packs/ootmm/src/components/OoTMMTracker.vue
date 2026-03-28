<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { TrackerLocationTraceResult, TrackerPack } from '@/types/tracker';
import OoTMMInventory from './OoTMMInventory.vue';
import OoTMMLocations from './OoTMMLocations.vue';
import OoTMMEntrances from './OoTMMEntrances.vue';
import OoTMMSettings from './OoTMMSettings.vue';
import OoTMMItemGrid from './OoTMMItemGrid.vue';
import OoTMMWorld from './OoTMMWorld.vue';
import OoTMMMap from './OoTMMMap.vue';
import OoTMMTricks from './OoTMMTricks.vue';
import FairyLoader from '@/components/FairyLoader.vue';
import {
  SETTINGS_DEFINITIONS,
  TRACKER_DEFAULT_SETTINGS,
} from '../data/settings';
import spoilerSettingsDefaultCheckExclude from '../data/spoilerSettingsDefaultCheckExclude.json';
import {
  DUNGEON_REWARD_ITEM_IDS,
  DUNGEON_REWARD_REGION_LABELS,
  FREE_REWARD_LABEL_ITEM_ID,
  getGridWheelOverlayStageForValue,
  getGridWheelOverlayStateItemId,
} from '../data/itemIcons';
import {
  parseSpoilerLog,
  type SpoilerLocationPlacement,
  type SpoilerLogData,
} from '../utils/spoiler';
import { useDungeonEntrances } from '../composables/useDungeonEntrances';
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
import {
  useOoTMMUiStore,
  type RightSidebarTab,
  type TrackerTab,
} from '../stores/ootmmUi';
import { OOTMM_MAP_DEFS } from '../data/maps';
import type { MapDef, MapSubmenuEntryDef } from '../data/maps/types';
import {
  getActiveEntranceKeys,
  normalizeTrackedEntranceKey,
  getTrackedEntranceKeysForBinding,
} from '../utils/entranceRandomization';
import * as ItemsMod from '@ootmm/core/items/index';
import * as NamesMod from '@ootmm/core/names';
import * as SettingsDataMod from '@ootmm/core/settings/data';
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

type DevMqMarkerMode = 'non-mq' | 'mq';

type SpoilerSettingWarning = {
  key: string;
  value: string;
  defaultValue: string;
};

type SpoilerUnknownSetting = {
  key: string;
  value: string;
};

type DevTraceSelection = {
  checkId: string;
  label: string;
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
const trackerDefaultSettingsByKey = TRACKER_DEFAULT_SETTINGS as Record<
  string,
  unknown
>;
const SPOILER_DEFAULT_CHECK_EXCLUDED_SETTINGS = new Set<string>(
  spoilerSettingsDefaultCheckExclude,
);

const normalizeName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const DUNGEON_REWARD_ITEM_ID_SET = new Set<string>(DUNGEON_REWARD_ITEM_IDS);
const SPOILER_REWARD_REGION_LABEL_BY_NAME = new Map<string, string>(
  DUNGEON_REWARD_REGION_LABELS.map(
    ({ regionName, labelItemId }): [string, string] => [
      normalizeName(regionName),
      labelItemId,
    ],
  ),
);

const TEMPLE_OF_TIME_MEDALLION_LOCATION_NAMES = new Set([
  normalizeName('OOT Temple of Time Medallion'),
  normalizeName('Temple of Time Medallion'),
]);

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
const { hasAvailableSections: hasAvailableEntranceSections } =
  useDungeonEntrances();

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
  entranceOverrides,
} = storeToRefs(sessionStore);

const {
  activeTab,
  isRightSidebarOpen,
  activeRightSidebarTab,
  leftSidebarWidth,
  rightSidebarWidth,
  isSpoilerDragActive,
  spoilerDragDepth,
  locationsSearchQuery,
  locationsSelectedCategory,
  locationsReachabilityFilter,
  locationsCollectionFilter,
  locationsShowUnshuffled,
  locationsShowGossipStones,
  entrancesReachabilityFilter,
  entrancesMappingFilter,
  activeMapId,
} = storeToRefs(uiStore);

const settingsRef = ref<SettingsPanelHandle | null>(null);
const isStatsCollapsed = ref(true);
const MOBILE_TRACKER_LAYOUT_QUERY = '(max-width: 900px)';
const isMobileTrackerLayout = ref(
  typeof window !== 'undefined' &&
    window.matchMedia(MOBILE_TRACKER_LAYOUT_QUERY).matches,
);
const statisticsCountsTooltip =
  'These counts exclude unshuffled tokens/fairies and gossip stones.';
const isSpoilerPlayerDialogOpen = ref(false);
const spoilerPlayerOptions = ref<number[]>([]);
const spoilerSelectedPlayer = ref<number | null>(null);
let spoilerPlayerDialogResolver: ((player: number | null) => void) | null =
  null;
const mapDefs = OOTMM_MAP_DEFS;
type SelectedGamesSetting = 'ootmm' | 'oot' | 'mm';
const RIGHT_SIDEBAR_TABS: Array<{ id: RightSidebarTab; label: string }> = [
  { id: 'locations', label: 'Locations' },
  { id: 'entrances', label: 'Entrances' },
];
const DEFAULT_MAP_ID = 'oot_kokiri_forest';

function getPreferredActiveMapId(availableMapDefs: readonly MapDef[]): string {
  if (availableMapDefs.length === 0) return '';
  return availableMapDefs.some((mapDef) => mapDef.id === DEFAULT_MAP_ID)
    ? DEFAULT_MAP_ID
    : availableMapDefs[0].id;
}

// ensure there's a sensible active map id in the UI store
if (!activeMapId.value) {
  activeMapId.value = getPreferredActiveMapId(mapDefs);
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
const showDevUnmappedChecksOnly = ref(false);
const devMqMarkerMode = ref<DevMqMarkerMode>('non-mq');
const isDevTraceSelectMode = ref(false);
const devTraceResult = ref<TrackerLocationTraceResult | null>(null);
const isSpoilerSettingsWarningDialogOpen = ref(false);
const spoilerSettingsWarnings = ref<SpoilerSettingWarning[]>([]);
const spoilerUnknownSettings = ref<SpoilerUnknownSetting[]>([]);
let mapMarkerSelectNonce = 0;
let mobileTrackerLayoutQuery: MediaQueryList | null = null;

const isRightSidebarVisible = computed(
  () => isMobileTrackerLayout.value || isRightSidebarOpen.value,
);
const MIN_LEFT_SIDEBAR_WIDTH = 280;
const MIN_RIGHT_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 960;
const MIN_MAP_PANEL_WIDTH = 360;

type SidebarResizeSide = 'left' | 'right';
type ActiveSidebarResize = {
  side: SidebarResizeSide;
  pointerId: number;
  startClientX: number;
  startWidth: number;
};

const activeSidebarResize = ref<ActiveSidebarResize | null>(null);

function getSidebarMinWidth(side: SidebarResizeSide): number {
  return side === 'left' ? MIN_LEFT_SIDEBAR_WIDTH : MIN_RIGHT_SIDEBAR_WIDTH;
}

function getSidebarMaxWidth(side: SidebarResizeSide): number {
  if (typeof window === 'undefined') {
    return MAX_SIDEBAR_WIDTH;
  }

  const viewportWidth = Math.max(window.innerWidth, 0);
  const oppositeWidth =
    side === 'left'
      ? isMobileTrackerLayout.value || !isRightSidebarVisible.value
        ? 0
        : rightSidebarWidth.value
      : isMobileTrackerLayout.value
        ? 0
        : leftSidebarWidth.value;
  const available = viewportWidth - oppositeWidth - MIN_MAP_PANEL_WIDTH;

  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(getSidebarMinWidth(side), available),
  );
}

function clampSidebarWidth(width: number, side: SidebarResizeSide): number {
  const min = getSidebarMinWidth(side);
  const max = getSidebarMaxWidth(side);
  const normalized = Math.floor(width);
  return Math.min(Math.max(normalized, min), max);
}

const leftSidebarWidthPx = computed(() =>
  clampSidebarWidth(leftSidebarWidth.value, 'left'),
);
const rightSidebarWidthPx = computed(() =>
  clampSidebarWidth(rightSidebarWidth.value, 'right'),
);
const leftSidebarStyle = computed<Record<string, string> | undefined>(() => {
  if (isMobileTrackerLayout.value) return undefined;
  const width = `${leftSidebarWidthPx.value}px`;
  return {
    width,
    flex: `0 0 ${width}`,
  };
});
const rightSidebarStyle = computed<Record<string, string> | undefined>(() => {
  if (isMobileTrackerLayout.value) return undefined;
  if (!isRightSidebarVisible.value) {
    return {
      width: '0px',
      flex: '0 0 0px',
    };
  }
  const width = `${rightSidebarWidthPx.value}px`;
  return {
    width,
    flex: `0 0 ${width}`,
  };
});

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
const availableRightSidebarTabs = computed(() =>
  RIGHT_SIDEBAR_TABS.filter(
    (tab) => tab.id === 'locations' || hasAvailableEntranceSections.value,
  ),
);
const shouldShowRightSidebarTabs = computed(
  () => availableRightSidebarTabs.value.length > 1,
);
const activeVisibleRightSidebarTab = computed<RightSidebarTab>(() =>
  activeRightSidebarTab.value === 'entrances' &&
  !hasAvailableEntranceSections.value
    ? 'locations'
    : activeRightSidebarTab.value,
);
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

// Static lookup: entrance ID → check codes from map marker definitions.
// For each entrance with markers on a map, stores the codes of checks
// behind that entrance.
const ENTRANCE_CHECK_CODES_BY_ID: ReadonlyMap<string, MapSubmenuEntryDef[]> =
  (() => {
    const byId = new Map<string, MapSubmenuEntryDef[]>();
    for (const mapDef of OOTMM_MAP_DEFS) {
      for (const markerDef of mapDef.markers) {
        if (markerDef.type !== 'submenu' || !markerDef.entranceMenu) continue;
        if (!Array.isArray(markerDef.markers) || markerDef.markers.length === 0)
          continue;
        const entranceIds = (markerDef.entranceMenu.entranceIds ?? [])
          .map((id) => normalizeTrackedEntranceKey(id.trim()))
          .filter((id) => id.length > 0);
        if (entranceIds.length === 0) continue;
        const entries: MapSubmenuEntryDef[] = markerDef.markers.map((e) => ({
          image: e.image,
          overlays: e.overlays,
          codes: e.codes,
          visibleWhen: e.visibleWhen,
        }));
        for (const entranceId of entranceIds) {
          for (const bindingId of getTrackedEntranceKeysForBinding(
            entranceId,
          )) {
            const existing = byId.get(bindingId);
            if (existing) {
              existing.push(...entries);
            } else {
              byId.set(bindingId, [...entries]);
            }
          }
        }
      }
    }
    return byId;
  })();

function addEntranceBoundCodes(
  checkIds: Set<string>,
  markerEntranceIds: string[],
  activeKeys: Set<string>,
  overrides: Record<string, string>,
): void {
  for (const srcId of markerEntranceIds) {
    const normalizedSrc = normalizeTrackedEntranceKey(srcId.trim());
    if (!activeKeys.has(normalizedSrc)) continue;
    const dstId = overrides[normalizedSrc];
    if (!dstId) continue; // Unmapped entrance – checks unreachable
    const dstEntries = ENTRANCE_CHECK_CODES_BY_ID.get(dstId);
    if (!dstEntries) continue;
    for (const entry of dstEntries) {
      for (const code of normalizeMapCodeList(entry.codes)) {
        addResolvedMapSelectorCode(checkIds, code);
      }
    }
  }
}

const mapSelectorCheckIdsByMap = computed(() => {
  const byMap = new Map<string, Set<string>>();
  const activeKeys = getActiveEntranceKeys(
    (trackerSettings.value ?? {}) as Record<string, unknown>,
  );
  const overrides = entranceOverrides.value;
  const isErActive = activeKeys.size > 0;

  for (const mapDef of selectableMapDefs.value) {
    const checkIds = new Set<string>();
    for (const marker of mapDef.markers) {
      if (
        marker.type === 'submenu' &&
        Array.isArray(marker.markers) &&
        marker.markers.length > 0
      ) {
        const markerEntranceIds = marker.entranceMenu?.entranceIds ?? [];
        const hasEntranceBinding = markerEntranceIds.length > 0;

        if (hasEntranceBinding && isErActive) {
          // Resolve codes from the mapped destination entrance
          addEntranceBoundCodes(
            checkIds,
            markerEntranceIds,
            activeKeys,
            overrides,
          );
        } else {
          // No ER or no entrance binding – use static codes
          for (const submenuEntry of marker.markers) {
            for (const code of normalizeMapCodeList(submenuEntry.codes)) {
              addResolvedMapSelectorCode(checkIds, code);
            }
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
    activeMapId.value = getPreferredActiveMapId(availableMapDefs);
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

watch(
  () => hasAvailableEntranceSections.value,
  (hasEntrances, hadEntrances) => {
    if (hasEntrances && !hadEntrances) {
      uiStore.openRightSidebar('entrances');
      return;
    }

    if (
      !hasEntrances &&
      hadEntrances &&
      activeRightSidebarTab.value === 'entrances'
    ) {
      uiStore.setActiveRightSidebarTab('locations');
    }
  },
);

watch(
  [() => hasAvailableEntranceSections.value, activeRightSidebarTab],
  ([hasEntrances, currentTab]) => {
    if (!hasEntrances && currentTab === 'entrances') {
      uiStore.setActiveRightSidebarTab('locations');
    }
  },
  { immediate: true },
);

function fillInventory() {
  sessionStore.fillInventoryForDebugActivateAll();
}

function resetTrackerState() {
  uiStore.resetUiState();
  activeMapId.value = getPreferredActiveMapId(selectableMapDefs.value);
  void sessionStore.resetSessionStateToDefaults();
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

function toggleDevTraceSelectMode() {
  isDevTraceSelectMode.value = !isDevTraceSelectMode.value;
}

function clearDevTraceResult() {
  devTraceResult.value = null;
}

function handleMapDevCheckSelect(selection: DevTraceSelection) {
  isDevTraceSelectMode.value = false;
  if (typeof props.tracker.traceLocationPath !== 'function') {
    devTraceResult.value = {
      checkId: selection.checkId,
      checkName: selection.label,
      reachable: false,
      totalReachableLocations: 0,
      checkAreaNames: [],
      areaPath: null,
      message: 'Trace output is not supported by the active tracker pack.',
    };
    return;
  }

  devTraceResult.value = props.tracker.traceLocationPath(
    selection.checkId,
    inventory.value,
  );
}

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

function syncSidebarResizeStyles(active: boolean) {
  if (typeof document === 'undefined') return;
  document.body.style.cursor = active ? 'col-resize' : '';
  document.body.style.userSelect = active ? 'none' : '';
}

function stopSidebarResize() {
  if (!activeSidebarResize.value) return;
  activeSidebarResize.value = null;
  syncSidebarResizeStyles(false);
}

function startSidebarResize(side: SidebarResizeSide, event: PointerEvent) {
  if (isMobileTrackerLayout.value) return;
  if (side === 'right' && !isRightSidebarVisible.value) return;

  event.preventDefault();
  const startWidth =
    side === 'left' ? leftSidebarWidthPx.value : rightSidebarWidthPx.value;

  activeSidebarResize.value = {
    side,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startWidth,
  };
  syncSidebarResizeStyles(true);
}

function handleSidebarResizePointerMove(event: PointerEvent) {
  const active = activeSidebarResize.value;
  if (!active || active.pointerId !== event.pointerId) return;

  event.preventDefault();
  const deltaX = event.clientX - active.startClientX;
  const nextWidth =
    active.side === 'left'
      ? active.startWidth + deltaX
      : active.startWidth - deltaX;
  const clamped = clampSidebarWidth(nextWidth, active.side);

  if (active.side === 'left') {
    uiStore.setLeftSidebarWidth(clamped);
  } else {
    uiStore.setRightSidebarWidth(clamped);
  }
}

function handleSidebarResizePointerUp(event: PointerEvent) {
  const active = activeSidebarResize.value;
  if (!active || active.pointerId !== event.pointerId) return;
  stopSidebarResize();
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

function normalizeComparableSettingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableSettingValue(entry));
  }
  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    for (const [key, entry] of entries) {
      normalized[key] = normalizeComparableSettingValue(entry);
    }
    return normalized;
  }
  return value;
}

function areSettingValuesEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeComparableSettingValue(left)) ===
    JSON.stringify(normalizeComparableSettingValue(right))
  );
}

function formatSpoilerSettingValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectSpoilerSettingsWarnings(
  settings: Record<string, string | number | boolean>,
): SpoilerSettingWarning[] {
  const warnings: SpoilerSettingWarning[] = [];

  for (const [key, rawValue] of Object.entries(settings)) {
    if (!settingsByKey.has(key)) continue;
    if (supportedSettingKeys.has(key)) continue;
    if (SPOILER_DEFAULT_CHECK_EXCLUDED_SETTINGS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(trackerDefaultSettingsByKey, key))
      continue;

    const defaultValue = trackerDefaultSettingsByKey[key];
    const coercedValue = coerceSettingValue(rawValue, settingsByKey.get(key));
    if (areSettingValuesEqual(coercedValue, defaultValue)) continue;

    warnings.push({
      key,
      value: formatSpoilerSettingValue(coercedValue),
      defaultValue: formatSpoilerSettingValue(defaultValue),
    });
  }

  warnings.sort((left, right) => left.key.localeCompare(right.key));
  return warnings;
}

function collectSpoilerUnknownSettings(
  settings: Record<string, string | number | boolean>,
): SpoilerUnknownSetting[] {
  const unknown: SpoilerUnknownSetting[] = [];

  for (const [key, rawValue] of Object.entries(settings)) {
    if (settingsByKey.has(key)) continue;
    unknown.push({
      key,
      value: formatSpoilerSettingValue(rawValue),
    });
  }

  unknown.sort((left, right) => left.key.localeCompare(right.key));
  return unknown;
}

function closeSpoilerSettingsWarningDialog() {
  isSpoilerSettingsWarningDialogOpen.value = false;
  spoilerSettingsWarnings.value = [];
  spoilerUnknownSettings.value = [];
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

function getSpoilerSelectedPlayer(selectedPlayer?: number): number {
  return selectedPlayer ?? 1;
}

function shouldImportSpoilerDungeonRewards(
  effectiveSettings: Record<string, unknown>,
): boolean {
  return (
    String(effectiveSettings.dungeonRewardShuffle ?? '') === 'dungeonBlueWarps'
  );
}

function normalizeSpoilerRegionName(region?: string): string {
  if (!region) return '';
  return normalizeName(region.replace(/^world\s+\d+\s+/i, ''));
}

function getSpoilerRewardOverlayItemId(
  placement: SpoilerLocationPlacement,
  effectiveSettings: Record<string, unknown>,
): string | null {
  if (!shouldImportSpoilerDungeonRewards(effectiveSettings)) {
    return null;
  }

  if (
    TEMPLE_OF_TIME_MEDALLION_LOCATION_NAMES.has(
      normalizeName(placement.location),
    )
  ) {
    return FREE_REWARD_LABEL_ITEM_ID;
  }

  return (
    SPOILER_REWARD_REGION_LABEL_BY_NAME.get(
      normalizeSpoilerRegionName(placement.region),
    ) || null
  );
}

function buildSpoilerRewardOverlayStateCounts(
  parsed: SpoilerLogData,
  effectiveSettings: Record<string, unknown>,
  selectedPlayer?: number,
): Record<string, number> {
  const nextCounts: Record<string, number> = {};
  if (!shouldImportSpoilerDungeonRewards(effectiveSettings)) {
    return nextCounts;
  }

  const targetPlayer = getSpoilerSelectedPlayer(selectedPlayer);

  const assignOverlay = (itemId: string, overlayItemId: string) => {
    const stateItemId = getGridWheelOverlayStateItemId(itemId);
    const stage = getGridWheelOverlayStageForValue(itemId, overlayItemId);
    if (!stateItemId || stage <= 0) return;
    nextCounts[stateItemId] = stage;
  };

  for (const [itemName, count] of Object.entries(parsed.startingItems)) {
    if (!count || count <= 0) continue;
    const itemId = itemNameToId.get(normalizeName(itemName));
    if (!itemId || !DUNGEON_REWARD_ITEM_ID_SET.has(itemId)) continue;
    assignOverlay(itemId, FREE_REWARD_LABEL_ITEM_ID);
  }

  for (const placement of parsed.locationPlacements) {
    if (
      typeof placement.itemPlayer === 'number' &&
      placement.itemPlayer !== targetPlayer
    ) {
      continue;
    }

    const itemId = itemNameToId.get(normalizeName(placement.item));
    if (!itemId || !DUNGEON_REWARD_ITEM_ID_SET.has(itemId)) continue;

    const overlayItemId = getSpoilerRewardOverlayItemId(
      placement,
      effectiveSettings,
    );
    if (!overlayItemId) continue;

    assignOverlay(itemId, overlayItemId);
  }

  return nextCounts;
}

function applySpoilerRewardAssignments(
  parsed: SpoilerLogData,
  effectiveSettings: Record<string, unknown>,
  selectedPlayer?: number,
) {
  const nextInventory = new Map(inventory.value);

  for (const rewardItemId of DUNGEON_REWARD_ITEM_ID_SET) {
    const stateItemId = getGridWheelOverlayStateItemId(rewardItemId);
    if (!stateItemId) continue;
    nextInventory.delete(stateItemId);
  }

  const nextCounts = buildSpoilerRewardOverlayStateCounts(
    parsed,
    effectiveSettings,
    selectedPlayer,
  );
  for (const [stateItemId, count] of Object.entries(nextCounts)) {
    nextInventory.set(stateItemId, count);
  }

  sessionStore.setInventoryFromMap(nextInventory);
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

function requestSpoilerStartingItemsPlayer(players: number[]) {
  spoilerPlayerOptions.value = [...players];
  spoilerSelectedPlayer.value = players[0] ?? null;
  isSpoilerPlayerDialogOpen.value = true;

  return new Promise<number | null>((resolve) => {
    spoilerPlayerDialogResolver = resolve;
  });
}

function resolveSpoilerStartingItemsPlayer(player: number | null) {
  if (!spoilerPlayerDialogResolver) return;
  const resolver = spoilerPlayerDialogResolver;
  spoilerPlayerDialogResolver = null;
  isSpoilerPlayerDialogOpen.value = false;
  spoilerPlayerOptions.value = [];
  spoilerSelectedPlayer.value = null;
  resolver(player);
}

function confirmSpoilerStartingItemsPlayer() {
  if (spoilerSelectedPlayer.value === null) return;
  resolveSpoilerStartingItemsPlayer(spoilerSelectedPlayer.value);
}

function cancelSpoilerStartingItemsPlayer() {
  resolveSpoilerStartingItemsPlayer(null);
}

async function applySpoilerLog(text: string, startingItemsPlayer?: number) {
  if (isApplyingSettings.value) return;
  const parsed = parseSpoilerLog(text, { startingItemsPlayer });
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

  applySpoilerRewardAssignments(parsed, nextSettings, startingItemsPlayer);

  if (parsed.junkLocations.length > 0) {
    applyJunkLocations(parsed.junkLocations);
  }
}

async function handleSpoilerFile(file: File) {
  if (!file) return;
  const text = await file.text();
  const parsed = parseSpoilerLog(text);
  closeSpoilerSettingsWarningDialog();
  const warnings = collectSpoilerSettingsWarnings(parsed.settings);
  const unknownSettings = collectSpoilerUnknownSettings(parsed.settings);
  let selectedPlayer: number | undefined;

  if (parsed.startingItemsPlayers.length > 1) {
    const selected = await requestSpoilerStartingItemsPlayer(
      parsed.startingItemsPlayers,
    );
    if (selected === null) {
      return;
    }
    selectedPlayer = selected;
  }

  await applySpoilerLog(text, selectedPlayer);

  if (warnings.length > 0 || unknownSettings.length > 0) {
    spoilerSettingsWarnings.value = warnings;
    spoilerUnknownSettings.value = unknownSettings;
    isSpoilerSettingsWarningDialogOpen.value = true;
  }
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

function handleMobileTrackerLayoutChange(event: MediaQueryListEvent) {
  isMobileTrackerLayout.value = event.matches;
  if (event.matches) {
    stopSidebarResize();
  }
}

onMounted(() => {
  sessionStore.startLocalSessionSync();
  const windowWithHandlers = window as Window & {
    __TLT_DEBUG_ACTIVATE_ALL__?: () => void;
    __TLT_RESET_TRACKER_STATE__?: () => void;
  };
  windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__ = fillInventory;
  windowWithHandlers.__TLT_RESET_TRACKER_STATE__ = resetTrackerState;
  mobileTrackerLayoutQuery = window.matchMedia(MOBILE_TRACKER_LAYOUT_QUERY);
  isMobileTrackerLayout.value = mobileTrackerLayoutQuery.matches;
  mobileTrackerLayoutQuery.addEventListener(
    'change',
    handleMobileTrackerLayoutChange,
  );
  window.addEventListener('keydown', handleGlobalUndoRedoKeydown);
  window.addEventListener('pointerdown', handleMapWarningGlobalPointerDown);
  window.addEventListener('pointermove', handleSidebarResizePointerMove, {
    passive: false,
  });
  window.addEventListener('pointerup', handleSidebarResizePointerUp);
  window.addEventListener('pointercancel', handleSidebarResizePointerUp);
  window.addEventListener('blur', stopSidebarResize);
});

onBeforeUnmount(() => {
  const windowWithHandlers = window as Window & {
    __TLT_DEBUG_ACTIVATE_ALL__?: () => void;
    __TLT_RESET_TRACKER_STATE__?: () => void;
  };
  if (windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__ === fillInventory) {
    delete windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__;
  }
  if (windowWithHandlers.__TLT_RESET_TRACKER_STATE__ === resetTrackerState) {
    delete windowWithHandlers.__TLT_RESET_TRACKER_STATE__;
  }
  sessionStore.stopLocalSessionSync();
  mobileTrackerLayoutQuery?.removeEventListener(
    'change',
    handleMobileTrackerLayoutChange,
  );
  mobileTrackerLayoutQuery = null;
  if (spoilerPlayerDialogResolver) {
    const resolver = spoilerPlayerDialogResolver;
    spoilerPlayerDialogResolver = null;
    resolver(null);
  }
  stopSidebarResize();
  window.removeEventListener('keydown', handleGlobalUndoRedoKeydown);
  window.removeEventListener('pointerdown', handleMapWarningGlobalPointerDown);
  window.removeEventListener('pointermove', handleSidebarResizePointerMove);
  window.removeEventListener('pointerup', handleSidebarResizePointerUp);
  window.removeEventListener('pointercancel', handleSidebarResizePointerUp);
  window.removeEventListener('blur', stopSidebarResize);
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
    <div
      v-if="isSpoilerPlayerDialogOpen"
      class="spoiler-player-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spoiler-player-dialog-title"
    >
      <div class="spoiler-player-dialog">
        <h2
          id="spoiler-player-dialog-title"
          class="spoiler-player-dialog-title"
        >
          Multiworld detected
        </h2>
        <p class="spoiler-player-dialog-text">
          Choose which player's Starting Items should be applied.
        </p>
        <label class="spoiler-player-dialog-label" for="spoiler-player-select"
          >Player</label
        >
        <select
          id="spoiler-player-select"
          v-model.number="spoilerSelectedPlayer"
          class="spoiler-player-dialog-select"
        >
          <option
            v-for="player in spoilerPlayerOptions"
            :key="player"
            :value="player"
          >
            Player {{ player }}
          </option>
        </select>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            @click="cancelSpoilerStartingItemsPlayer"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            :disabled="spoilerSelectedPlayer === null"
            @click="confirmSpoilerStartingItemsPlayer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="isSpoilerSettingsWarningDialogOpen"
      class="spoiler-player-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spoiler-settings-warning-title"
    >
      <div class="spoiler-player-dialog spoiler-settings-warning-dialog">
        <h2
          id="spoiler-settings-warning-title"
          class="spoiler-player-dialog-title"
        >
          Spoiler log warning
        </h2>
        <p
          v-if="spoilerUnknownSettings.length > 0"
          class="spoiler-player-dialog-text"
        >
          These settings are not known in the randomizer version used by this
          tracker and were fully ignored:
        </p>
        <ul
          v-if="spoilerUnknownSettings.length > 0"
          class="spoiler-settings-warning-list"
        >
          <li
            v-for="setting in spoilerUnknownSettings"
            :key="setting.key"
            class="spoiler-settings-warning-item"
          >
            <span class="spoiler-settings-warning-key">{{ setting.key }}</span>
            <span class="spoiler-settings-warning-values"
              >Spoiler: {{ setting.value }}</span
            >
          </li>
        </ul>
        <p
          v-if="spoilerSettingsWarnings.length > 0"
          class="spoiler-player-dialog-text"
        >
          These settings are not supported and were reset to defaults:
        </p>
        <ul
          v-if="spoilerSettingsWarnings.length > 0"
          class="spoiler-settings-warning-list"
        >
          <li
            v-for="warning in spoilerSettingsWarnings"
            :key="warning.key"
            class="spoiler-settings-warning-item"
          >
            <span class="spoiler-settings-warning-key">{{ warning.key }}</span>
            <span class="spoiler-settings-warning-values"
              >Spoiler: {{ warning.value }} · Default:
              {{ warning.defaultValue }}</span
            >
          </li>
        </ul>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            @click="closeSpoilerSettingsWarningDialog"
          >
            OK
          </button>
        </div>
      </div>
    </div>
    <div class="tracker-sidebar" :style="leftSidebarStyle">
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
            <span class="stats-collapse-title" :title="statisticsCountsTooltip"
              >Statistics</span
            >
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
          @load-spoiler-log="handleSpoilerFile"
        />

        <OoTMMTricks
          v-if="activeTab === 'tricks'"
          ref="settingsRef"
          :settings="trackerSettings"
          :is-applying-settings="isApplyingSettings"
          @update:settings="handleSettingsChange"
        />
      </div>
      <div
        v-if="!isMobileTrackerLayout"
        class="sidebar-resizer sidebar-resizer-left"
        :class="{ 'is-active': activeSidebarResize?.side === 'left' }"
        role="separator"
        aria-label="Resize left sidebar"
        aria-orientation="vertical"
        @pointerdown="startSidebarResize('left', $event)"
      />
    </div>

    <div class="tracker-main">
      <div class="map-panel">
        <div class="map-shell">
          <div
            v-if="selectableMapDefs.length > 1 || isMapDevMode"
            class="map-toolbar"
            :class="{ 'has-entrance-filters': hasAvailableEntranceSections }"
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
              <div class="map-toolbar-filter-section">
                <span class="map-toolbar-filter-label">Locations</span>
                <div
                  class="map-filter-group"
                  role="group"
                  aria-label="Location reachability filter"
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
                      'is-active':
                        locationsReachabilityFilter === 'unreachable',
                    }"
                    @click="locationsReachabilityFilter = 'unreachable'"
                  >
                    Unreachable
                  </button>
                </div>

                <div
                  class="map-filter-group"
                  role="group"
                  aria-label="Location collection filter"
                >
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active': locationsCollectionFilter === 'all',
                    }"
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
                v-if="hasAvailableEntranceSections"
                class="map-toolbar-filter-section"
              >
                <span class="map-toolbar-filter-label">Entrances</span>
                <div
                  class="map-filter-group"
                  role="group"
                  aria-label="Entrance reachability filter"
                >
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active': entrancesReachabilityFilter === 'all',
                    }"
                    @click="entrancesReachabilityFilter = 'all'"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active': entrancesReachabilityFilter === 'reachable',
                    }"
                    @click="entrancesReachabilityFilter = 'reachable'"
                  >
                    Reachable
                  </button>
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active':
                        entrancesReachabilityFilter === 'unreachable',
                    }"
                    @click="entrancesReachabilityFilter = 'unreachable'"
                  >
                    Unreachable
                  </button>
                </div>

                <div
                  class="map-filter-group"
                  role="group"
                  aria-label="Entrance mapping filter"
                >
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{ 'is-active': entrancesMappingFilter === 'all' }"
                    @click="entrancesMappingFilter = 'all'"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active': entrancesMappingFilter === 'unmapped',
                    }"
                    @click="entrancesMappingFilter = 'unmapped'"
                  >
                    Unmapped
                  </button>
                  <button
                    type="button"
                    class="map-filter-button"
                    :class="{
                      'is-active': entrancesMappingFilter === 'mapped',
                    }"
                    @click="entrancesMappingFilter = 'mapped'"
                  >
                    Mapped
                  </button>
                </div>
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
              class="map-filter-group"
              role="group"
              aria-label="Dev map filters"
            >
              <button
                type="button"
                class="map-filter-button"
                :class="{ 'is-active': showDevUnmappedChecksOnly }"
                @click="showDevUnmappedChecksOnly = !showDevUnmappedChecksOnly"
              >
                Missing Locations
              </button>
            </div>
            <div
              v-if="isMapDevMode"
              class="map-filter-group"
              role="group"
              aria-label="Dev MQ filters"
            >
              <button
                type="button"
                class="map-filter-button"
                :class="{ 'is-active': devMqMarkerMode === 'non-mq' }"
                @click="devMqMarkerMode = 'non-mq'"
              >
                Non-MQ
              </button>
              <button
                type="button"
                class="map-filter-button"
                :class="{ 'is-active': devMqMarkerMode === 'mq' }"
                @click="devMqMarkerMode = 'mq'"
              >
                MQ
              </button>
            </div>
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
            <div
              v-if="isMapDevMode"
              class="map-filter-group map-filter-group--trace"
              role="group"
              aria-label="Dev trace controls"
            >
              <button
                type="button"
                class="map-filter-button"
                :class="{ 'is-active': isDevTraceSelectMode }"
                data-testid="dev-trace-select-button"
                @click="toggleDevTraceSelectMode"
              >
                {{ isDevTraceSelectMode ? 'Cancel Trace' : 'Trace Check' }}
              </button>
              <button
                v-if="devTraceResult"
                type="button"
                class="map-filter-button"
                data-testid="dev-trace-clear-button"
                @click="clearDevTraceResult"
              >
                Clear Trace
              </button>
            </div>
          </div>
          <div
            v-if="isMapDevMode && (isDevTraceSelectMode || devTraceResult)"
            class="map-trace-panel"
            data-testid="dev-trace-panel"
          >
            <p
              v-if="isDevTraceSelectMode"
              class="map-trace-panel__status"
              data-testid="dev-trace-status"
            >
              Click a map check to trace its route with the current tracker
              state.
            </p>
            <div
              v-if="devTraceResult"
              class="map-trace-panel__result"
              data-testid="dev-trace-result"
            >
              <h3>{{ devTraceResult.checkName }}</h3>
              <p
                class="map-trace-panel__summary"
                :class="{
                  'is-unreachable': !devTraceResult.reachable,
                }"
                data-testid="dev-trace-summary"
              >
                {{
                  devTraceResult.reachable
                    ? 'Reachable with the current tracker state.'
                    : 'Unreachable with the current tracker state.'
                }}
              </p>
              <p
                v-if="devTraceResult.checkAreaNames.length > 0"
                class="map-trace-panel__areas"
              >
                Target area:
                {{ devTraceResult.checkAreaNames.join(', ') }}
              </p>
              <ol
                v-if="
                  devTraceResult.areaPath && devTraceResult.areaPath.length > 0
                "
                class="map-trace-panel__path"
                data-testid="dev-trace-path"
              >
                <li
                  v-for="(areaName, index) in devTraceResult.areaPath"
                  :key="`${devTraceResult.checkId}:path:${index}`"
                >
                  {{ areaName }}
                </li>
              </ol>
              <p
                v-else-if="devTraceResult.message"
                class="map-trace-panel__message"
              >
                {{ devTraceResult.message }}
              </p>
              <p class="map-trace-panel__meta">
                Reachable checks right now:
                {{ devTraceResult.totalReachableLocations }}
              </p>
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
            :settings="trackerSettings"
            :dev-mode="isMapDevMode"
            :dev-check-pick-mode="isDevTraceSelectMode"
            :dev-show-unmapped-only="showDevUnmappedChecksOnly"
            :dev-mq-marker-mode="devMqMarkerMode"
            :dev-marker-select-request="mapMarkerSelectRequest"
            :dev-marker-hover-index="mapMarkerHoverIndex"
            @toggle-collected="handleMapToggleCollected"
            @mark-all-reachable="handleMapMarkAllReachable"
            @open-popup="handleMapPopupOpen"
            @close-popup="handleMapPopupClose"
            @dev-warnings-change="handleMapWarningsChange"
            @dev-check-select="handleMapDevCheckSelect"
          />
        </div>
      </div>

      <aside
        class="right-sidebar"
        :class="{ collapsed: !isRightSidebarVisible }"
        :style="rightSidebarStyle"
      >
        <button
          v-if="!isMobileTrackerLayout"
          class="right-sidebar-toggle"
          type="button"
          data-testid="right-sidebar-toggle"
          :aria-expanded="isRightSidebarVisible"
          aria-controls="right-sidebar-panel"
          aria-label="Toggle right sidebar"
          @click="uiStore.toggleRightSidebarOpen()"
        >
          <span class="toggle-icon">{{
            isRightSidebarOpen ? '>>' : '<<'
          }}</span>
        </button>
        <div class="right-sidebar-clip">
          <div
            id="right-sidebar-panel"
            class="right-sidebar-content"
            :aria-hidden="!isRightSidebarVisible"
          >
            <div v-if="shouldShowRightSidebarTabs" class="right-sidebar-tabs">
              <button
                v-for="tab in availableRightSidebarTabs"
                :key="tab.id"
                type="button"
                :data-testid="`right-sidebar-tab-${tab.id}`"
                :class="{ active: activeVisibleRightSidebarTab === tab.id }"
                @click="uiStore.setActiveRightSidebarTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            </div>

            <div class="right-sidebar-body">
              <OoTMMLocations
                v-if="activeVisibleRightSidebarTab === 'locations'"
                class="map-locations"
                :locations="allLocations"
                :reachable-ids="reachableLocationIds"
              />

              <OoTMMEntrances
                v-else-if="activeVisibleRightSidebarTab === 'entrances'"
                class="map-entrances"
              />
            </div>
          </div>
        </div>
        <div
          v-if="!isMobileTrackerLayout && isRightSidebarVisible"
          class="sidebar-resizer sidebar-resizer-right"
          :class="{ 'is-active': activeSidebarResize?.side === 'right' }"
          role="separator"
          aria-label="Resize right sidebar"
          aria-orientation="vertical"
          @pointerdown="startSidebarResize('right', $event)"
        />
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

.spoiler-player-dialog-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.spoiler-player-dialog {
  width: min(420px, calc(100vw - 2rem));
  background: rgba(31, 41, 55, 0.98);
  border: 1px solid #4b5563;
  border-radius: 0.75rem;
  padding: 1rem;
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.spoiler-player-dialog-title {
  margin: 0;
  font-size: 1rem;
}

.spoiler-player-dialog-text {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.85rem;
}

.spoiler-player-dialog-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}

.spoiler-player-dialog-select {
  width: 100%;
}

.spoiler-player-dialog-actions {
  margin-top: 0.25rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

.spoiler-settings-warning-dialog {
  max-height: min(70vh, 620px);
}

.spoiler-settings-warning-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: min(42vh, 360px);
  overflow-y: auto;
}

.spoiler-settings-warning-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #111827;
}

.spoiler-settings-warning-key {
  font-size: 0.76rem;
  font-weight: 700;
  color: #e5e7eb;
}

.spoiler-settings-warning-values {
  font-size: 0.74rem;
  color: #cbd5e1;
  line-height: 1.3;
  word-break: break-word;
}

.tracker-sidebar {
  position: relative;
  width: 400px;
  flex: 0 0 400px;
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
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.68rem 0.4rem;
  background: transparent;
  border-radius: 0;
  font-size: 0.78rem;
  line-height: 1.1;
  white-space: normal;
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

.map-toolbar.has-entrance-filters .map-selector-combobox {
  min-width: min(380px, 100%);
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

.map-toolbar-filter-section {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.map-toolbar-filter-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
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

.map-filter-group--trace {
  margin-left: auto;
}

.map-trace-panel {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.7rem 0.8rem;
  border-bottom: 1px solid #374151;
  background: #0b1220;
}

.map-trace-panel__status,
.map-trace-panel__summary,
.map-trace-panel__areas,
.map-trace-panel__message,
.map-trace-panel__meta {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.map-trace-panel__status,
.map-trace-panel__meta {
  color: #93c5fd;
}

.map-trace-panel__result {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.map-trace-panel__result h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #f8fafc;
}

.map-trace-panel__summary {
  color: #bbf7d0;
  font-weight: 600;
}

.map-trace-panel__summary.is-unreachable {
  color: #fca5a5;
}

.map-trace-panel__areas {
  color: #cbd5e1;
}

.map-trace-panel__path {
  margin: 0;
  padding-left: 1.25rem;
  color: #e5e7eb;
  font-size: 0.78rem;
  line-height: 1.45;
}

.map-trace-panel__message {
  color: #fcd34d;
}

.map-view {
  flex: 1;
  min-height: 0;
}

.right-sidebar {
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

.right-sidebar.collapsed {
  width: 0;
  flex: 0 0 0;
  border-left: none;
}

.right-sidebar-clip {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.right-sidebar-toggle {
  position: absolute;
  top: 12px;
  left: 0;
  transform: translateX(calc(-100% + 4px));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  padding: 0.4rem 0.55rem;
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
  z-index: 9;
}

.right-sidebar-toggle:hover {
  background: #333;
  border-color: #4b5563;
}

.right-sidebar-toggle:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.toggle-icon {
  font-weight: 700;
}

.right-sidebar-content {
  position: absolute;
  inset: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.right-sidebar.collapsed .right-sidebar-content {
  visibility: hidden;
  pointer-events: none;
}

.right-sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #404040;
}

.right-sidebar-tabs button {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border-radius: 0;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.right-sidebar-tabs button:hover {
  background: #333;
}

.right-sidebar-tabs button.active {
  background: #1a1a1a;
  border-bottom: 2px solid #3b82f6;
}

.right-sidebar-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.map-entrances,
.map-locations {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  touch-action: none;
  z-index: 7;
}

.sidebar-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(96, 165, 250, 0.2);
  transition: background 0.12s ease;
}

.sidebar-resizer:hover::before,
.sidebar-resizer.is-active::before {
  background: rgba(96, 165, 250, 0.9);
}

.sidebar-resizer-left {
  right: -6px;
}

.sidebar-resizer-right {
  left: -6px;
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

  .right-sidebar {
    width: 100%;
    flex: 0 0 auto;
    border-left: none;
    border-top: 2px solid #404040;
  }

  .right-sidebar.collapsed {
    width: 100%;
    flex: 0 0 0;
    border-top: none;
  }

  .right-sidebar-toggle {
    left: 12px;
    top: -16px;
    border-radius: 0.5rem;
    transform: none;
  }

  .right-sidebar-content {
    position: relative;
    width: 100%;
  }

  .right-sidebar-tabs {
    flex-wrap: wrap;
  }

  .right-sidebar-tabs button {
    flex: 1 1 50%;
  }

  .sidebar-resizer {
    display: none;
  }
}

@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .tabs button {
    flex: 1 1 100%;
  }

  .right-sidebar-tabs button {
    flex: 1 1 100%;
  }

  /* Ensure the map container grows on small screens so the Locations panel stacks below it */
  .map-panel,
  .map-view {
    min-height: max(360px, 50vh);
  }
}
</style>
