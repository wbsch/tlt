import { defineStore } from 'pinia';
import { ref } from 'vue';

export type TrackerTab = 'inventory' | 'settings' | 'grid' | 'world' | 'tricks';
export type RightSidebarTab = 'locations' | 'entrances';
export type ReachabilityFilter = 'all' | 'reachable' | 'unreachable';
export type CollectionFilter = 'all' | 'collected' | 'uncollected';
export type EntranceMappingFilter = 'all' | 'mapped' | 'unmapped';
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 400;
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 400;

const VALID_TABS: TrackerTab[] = [
  'grid',
  'inventory',
  'world',
  'settings',
  'tricks',
];

export const useOoTMMUiStore = defineStore('ootmm-ui', () => {
  const activeTab = ref<TrackerTab>('grid');
  const isRightSidebarOpen = ref(true);
  const activeRightSidebarTab = ref<RightSidebarTab>('locations');
  const leftSidebarWidth = ref(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const rightSidebarWidth = ref(DEFAULT_RIGHT_SIDEBAR_WIDTH);

  const inventorySearchQuery = ref('');
  const inventorySelectedCategory = ref('all');

  const locationsSearchQuery = ref('');
  const locationsSelectedCategory = ref('all');
  const locationsReachabilityFilter = ref<ReachabilityFilter>('reachable');
  const locationsCollectionFilter = ref<CollectionFilter>('uncollected');
  const locationsShowUnshuffled = ref(true);
  const locationsShowGossipStones = ref(true);
  const entrancesReachabilityFilter = ref<ReachabilityFilter>('reachable');
  const entrancesMappingFilter = ref<EntranceMappingFilter>('all');
  const entrancesSearchQuery = ref('');

  const settingsSearchQuery = ref('');

  const isSpoilerDragActive = ref(false);
  const spoilerDragDepth = ref(0);
  const activeMapId = ref('');

  function setActiveTab(tab: TrackerTab) {
    if (!VALID_TABS.includes(tab)) {
      activeTab.value = 'grid';
      return;
    }
    activeTab.value = tab;
  }

  function toggleRightSidebarOpen() {
    isRightSidebarOpen.value = !isRightSidebarOpen.value;
  }

  function setActiveRightSidebarTab(tab: RightSidebarTab) {
    if (tab !== 'locations' && tab !== 'entrances') {
      activeRightSidebarTab.value = 'locations';
      return;
    }
    activeRightSidebarTab.value = tab;
  }

  function openRightSidebar(tab?: RightSidebarTab) {
    isRightSidebarOpen.value = true;
    if (tab) {
      setActiveRightSidebarTab(tab);
    }
  }

  function setSpoilerDragActive(active: boolean) {
    isSpoilerDragActive.value = active;
  }

  function setSpoilerDragDepth(depth: number) {
    spoilerDragDepth.value = Math.max(0, Math.floor(depth));
  }

  function setLeftSidebarWidth(width: number) {
    if (!Number.isFinite(width)) return;
    leftSidebarWidth.value = Math.floor(width);
  }

  function setRightSidebarWidth(width: number) {
    if (!Number.isFinite(width)) return;
    rightSidebarWidth.value = Math.floor(width);
  }

  function resetUiState() {
    activeTab.value = 'grid';
    isRightSidebarOpen.value = true;
    activeRightSidebarTab.value = 'locations';
    leftSidebarWidth.value = DEFAULT_LEFT_SIDEBAR_WIDTH;
    rightSidebarWidth.value = DEFAULT_RIGHT_SIDEBAR_WIDTH;

    inventorySearchQuery.value = '';
    inventorySelectedCategory.value = 'all';

    locationsSearchQuery.value = '';
    locationsSelectedCategory.value = 'all';
    locationsReachabilityFilter.value = 'reachable';
    locationsCollectionFilter.value = 'uncollected';
    locationsShowUnshuffled.value = true;
    locationsShowGossipStones.value = true;
    entrancesReachabilityFilter.value = 'reachable';
    entrancesMappingFilter.value = 'all';
    entrancesSearchQuery.value = '';

    settingsSearchQuery.value = '';

    isSpoilerDragActive.value = false;
    spoilerDragDepth.value = 0;
    activeMapId.value = '';
  }

  return {
    activeTab,
    isRightSidebarOpen,
    activeRightSidebarTab,
    inventorySearchQuery,
    inventorySelectedCategory,
    locationsSearchQuery,
    locationsSelectedCategory,
    locationsReachabilityFilter,
    locationsCollectionFilter,
    locationsShowUnshuffled,
    locationsShowGossipStones,
    entrancesReachabilityFilter,
    entrancesMappingFilter,
    entrancesSearchQuery,
    settingsSearchQuery,
    isSpoilerDragActive,
    spoilerDragDepth,
    leftSidebarWidth,
    rightSidebarWidth,
    setActiveTab,
    toggleRightSidebarOpen,
    setActiveRightSidebarTab,
    openRightSidebar,
    setSpoilerDragActive,
    setSpoilerDragDepth,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    resetUiState,
    activeMapId,
  };
});
