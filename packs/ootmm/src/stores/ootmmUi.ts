import { defineStore } from 'pinia';
import { ref } from 'vue';

export type TrackerTab = 'inventory' | 'settings' | 'grid' | 'world' | 'tricks';
export type ReachabilityFilter = 'all' | 'reachable' | 'unreachable';
export type CollectionFilter = 'all' | 'collected' | 'uncollected';

const VALID_TABS: TrackerTab[] = ['grid', 'inventory', 'world', 'settings', 'tricks'];

export const useOoTMMUiStore = defineStore('ootmm-ui', () => {
  const activeTab = ref<TrackerTab>('grid');
  const isLocationsSidebarOpen = ref(true);

  const inventorySearchQuery = ref('');
  const inventorySelectedCategory = ref('all');

  const locationsSearchQuery = ref('');
  const locationsSelectedCategory = ref('all');
  const locationsReachabilityFilter = ref<ReachabilityFilter>('reachable');
  const locationsCollectionFilter = ref<CollectionFilter>('uncollected');
  const locationsShowUnshuffled = ref(true);
  const locationsShowGossipStones = ref(true);

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

  function toggleLocationsSidebarOpen() {
    isLocationsSidebarOpen.value = !isLocationsSidebarOpen.value;
  }

  function setSpoilerDragActive(active: boolean) {
    isSpoilerDragActive.value = active;
  }

  function setSpoilerDragDepth(depth: number) {
    spoilerDragDepth.value = Math.max(0, Math.floor(depth));
  }

  function resetUiState() {
    activeTab.value = 'grid';
    isLocationsSidebarOpen.value = true;

    inventorySearchQuery.value = '';
    inventorySelectedCategory.value = 'all';

    locationsSearchQuery.value = '';
    locationsSelectedCategory.value = 'all';
    locationsReachabilityFilter.value = 'reachable';
    locationsCollectionFilter.value = 'uncollected';
    locationsShowUnshuffled.value = true;
    locationsShowGossipStones.value = true;

    settingsSearchQuery.value = '';

    isSpoilerDragActive.value = false;
    spoilerDragDepth.value = 0;
    activeMapId.value = '';
  }

  return {
    activeTab,
    isLocationsSidebarOpen,
    inventorySearchQuery,
    inventorySelectedCategory,
    locationsSearchQuery,
    locationsSelectedCategory,
    locationsReachabilityFilter,
    locationsCollectionFilter,
    locationsShowUnshuffled,
    locationsShowGossipStones,
    settingsSearchQuery,
    isSpoilerDragActive,
    spoilerDragDepth,
    setActiveTab,
    toggleLocationsSidebarOpen,
    setSpoilerDragActive,
    setSpoilerDragDepth,
    resetUiState,
    activeMapId,
  };
});
