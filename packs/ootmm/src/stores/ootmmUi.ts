import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type TrackerTab = 'inventory' | 'settings' | 'grid' | 'world';
export type ReachabilityFilter = 'all' | 'reachable' | 'unreachable';
export type CollectionFilter = 'all' | 'collected' | 'uncollected';

const VALID_TABS: TrackerTab[] = ['grid', 'inventory', 'settings', 'world'];
const UI_STORAGE_KEY = 'tlt:ootmm-ui:v1';

type PersistedUiState = {
  activeTab?: TrackerTab;
  isLocationsSidebarOpen?: boolean;
  inventorySearchQuery?: string;
  inventorySelectedCategory?: string;
  locationsSearchQuery?: string;
  locationsSelectedCategory?: string;
  locationsReachabilityFilter?: ReachabilityFilter;
  locationsCollectionFilter?: CollectionFilter;
  locationsShowUnshuffled?: boolean;
  settingsSearchQuery?: string;
};

function loadPersistedUiState(): PersistedUiState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedUiState;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    console.warn('[OoTMM UI Store] Failed to load persisted state:', error);
    return {};
  }
}

function persistUiState(state: PersistedUiState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[OoTMM UI Store] Failed to persist state:', error);
  }
}

export const useOoTMMUiStore = defineStore('ootmm-ui', () => {
  const persistedState = loadPersistedUiState();

  const activeTab = ref<TrackerTab>(
    persistedState.activeTab && VALID_TABS.includes(persistedState.activeTab)
      ? persistedState.activeTab
      : 'grid',
  );
  const isLocationsSidebarOpen = ref(
    persistedState.isLocationsSidebarOpen ?? true,
  );

  const inventorySearchQuery = ref(persistedState.inventorySearchQuery ?? '');
  const inventorySelectedCategory = ref(
    persistedState.inventorySelectedCategory ?? 'all',
  );

  const locationsSearchQuery = ref(persistedState.locationsSearchQuery ?? '');
  const locationsSelectedCategory = ref(
    persistedState.locationsSelectedCategory ?? 'all',
  );
  const locationsReachabilityFilter = ref<ReachabilityFilter>(
    persistedState.locationsReachabilityFilter ?? 'all',
  );
  const locationsCollectionFilter = ref<CollectionFilter>(
    persistedState.locationsCollectionFilter ?? 'all',
  );
  const locationsShowUnshuffled = ref(
    persistedState.locationsShowUnshuffled ?? false,
  );

  const settingsSearchQuery = ref(persistedState.settingsSearchQuery ?? '');

  const isSpoilerDragActive = ref(false);
  const spoilerDragDepth = ref(0);

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
    locationsReachabilityFilter.value = 'all';
    locationsCollectionFilter.value = 'all';
    locationsShowUnshuffled.value = false;

    settingsSearchQuery.value = '';

    isSpoilerDragActive.value = false;
    spoilerDragDepth.value = 0;
  }

  watch(
    () => ({
      activeTab: activeTab.value,
      isLocationsSidebarOpen: isLocationsSidebarOpen.value,
      inventorySearchQuery: inventorySearchQuery.value,
      inventorySelectedCategory: inventorySelectedCategory.value,
      locationsSearchQuery: locationsSearchQuery.value,
      locationsSelectedCategory: locationsSelectedCategory.value,
      locationsReachabilityFilter: locationsReachabilityFilter.value,
      locationsCollectionFilter: locationsCollectionFilter.value,
      locationsShowUnshuffled: locationsShowUnshuffled.value,
      settingsSearchQuery: settingsSearchQuery.value,
    }),
    (state) => {
      persistUiState(state);
    },
    { deep: true },
  );

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
    settingsSearchQuery,
    isSpoilerDragActive,
    spoilerDragDepth,
    setActiveTab,
    toggleLocationsSidebarOpen,
    setSpoilerDragActive,
    setSpoilerDragDepth,
    resetUiState,
  };
});
