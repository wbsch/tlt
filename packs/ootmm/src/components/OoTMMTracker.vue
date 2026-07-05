<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  LocationInfo,
  TrackerLocationTraceResult,
  TrackerPack,
} from '@/types/tracker';
import { requestTrackerFaqOpen } from '@/utils/trackerFaq';
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
  getSpoilerLogPlayerOptions,
  isAutotrackingSupportedSpoilerVersion,
  parseSpoilerLog,
  type SpoilerLocationPlacement,
  type SpoilerLogData,
} from '../utils/spoiler';
import {
  hasLegacyKeys,
  normalizeSpoilerSettings,
  synthesizeCrossWarpItemsForInventory,
} from '../utils/spoilerSettingsMigration';
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
import type { MapDef } from '../data/maps/types';
import {
  getActiveEntranceKeys,
  getEdgeReverse,
} from '../utils/entranceRandomization';
import {
  resolveEntranceBoundCodes,
  normalizeMapCodeList,
} from '../utils/mapSelectorCounts';
import * as ItemsMod from '@ootmm/core/items/index';
import * as NamesMod from '@ootmm/core/names';
import * as SettingsDataMod from '@ootmm/core/settings/data';
import { TRICKS } from '@ootmm/core/settings/tricks';
import AutotrackerToggle from './AutotrackerToggle.vue';
import CoopPanel from './CoopPanel.vue';
import {
  buildCoopShareUrl,
  clearCoopAutoJoinCodeFromUrl,
  generateCoopRoomCode,
  getCoopAutoJoinCode,
  isCoopFeatureEnabled,
} from '../utils/coopFlag';
import {
  useAutotracker,
  type AutotrackerSyncPhase,
} from '../autotracker/useAutotracker';
import { resolveAutotrackerCheckToLocationIds } from '../autotracker/checkMapping';
import { translateAutotrackerItems } from '../autotracker/autotrackerMapping';
import {
  RAW_CHUNK_SPECS_BY_GAME,
  createRawAutotrackerParser,
  type RawAutotrackerCheck,
  type RawAutotrackerGame,
  type RawAutotrackerItem,
  type RawAutotrackerMessage,
} from '../autotracker/rawFrameParser';
import { OOT_SCENE_TO_MAP, MM_SCENE_TO_MAP } from '../autotracker/sceneToMap';
import {
  buildAutotrackerInventorySnapshot,
  mergeAutotrackerCollectedLocationsUpdate,
  mergeAutotrackerInventoryUpdate,
} from '../autotracker/mergeState';

const props = defineProps<{
  tracker: TrackerPack;
}>();

const AUTOTRACKER_RELEASES_LATEST_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest';
const AUTOTRACKER_WINDOWS_DOWNLOAD_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest/download/ootmm-autotracker-v0.2.1-windows-amd64.exe';
const AUTOTRACKER_LINUX_DOWNLOAD_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest/download/ootmm-autotracker-v0.2.1-linux-amd64';
const AUTOTRACKER_NOT_FOUND_WARNING_MESSAGE =
  'No autotracker was found. Please start the autotracker.';

type SettingsPanelHandle = {
  hasUnsavedChanges: () => boolean;
  getLocalSettingsSnapshot: () => Record<string, unknown>;
  openSpoilerFileDialog?: () => void;
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

type DeferredAutotrackerSpoilerWarnings = {
  warnings: SpoilerSettingWarning[];
  unknownSettings: SpoilerUnknownSetting[];
};

type AutotrackerStartMode = 'overwrite' | 'preserve';

type PendingAutotrackerInventoryUpdate = {
  inventory: Record<string, number>;
  phase: AutotrackerSyncPhase;
};

type AutotrackerToastKind = 'item' | 'location';

type AutotrackerToast = {
  id: number;
  kind: AutotrackerToastKind;
  message: string;
};

type DevTraceSelection = {
  checkId: string;
  label: string;
};

type AutotrackerDumpRequestedArea = {
  name: string;
  address: string;
  length: number;
};

type AutotrackerDumpRequestedAreas = {
  oot: AutotrackerDumpRequestedArea[];
  mm: AutotrackerDumpRequestedArea[];
};

type AutotrackerDumpRegion = {
  name: string;
  address: string;
  size: number;
  encoding: 'base64';
  data: string;
};

type AutotrackerDumpSummaryItem = {
  id: string;
  qty: number;
};

type AutotrackerDumpSummary = {
  valid: boolean;
  activeGame: string;
  saveIndex: number;
  items: AutotrackerDumpSummaryItem[];
  locations: string[];
};

type AutotrackerDumpFile = {
  schemaVersion: number;
  createdAt: string;
  summary: AutotrackerDumpSummary;
  rawFrame: {
    schemaVersion: string;
    sequence: number;
    refresh: boolean;
    diff: boolean;
  };
  requestedMemoryAreas: AutotrackerDumpRequestedAreas;
  regions: AutotrackerDumpRegion[];
};

const AUTOTRACKER_DUMP_SCHEMA_VERSION = 1;
const AUTOTRACKER_DUMP_TIMEOUT_MS = 5000;
const AUTOTRACKER_TOAST_DURATION_MS = 5000;
const MAX_AUTOTRACKER_TOASTS = 10;
const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';

type AutotrackerBottleSlotMapping = {
  autotrackerId: string;
  trackerItemId: string;
  gridRef: string;
  sharedGridRef?: string;
};

const SEPARATELY_TRACKED_BOTTLE_CONTENT_BASE_IDS: Record<string, string> = {
  OOT_BOTTLE_RUTO_LETTER: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLE_RUTO_LETTER: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLE_RUTO_LETTER: 'SHARED_BOTTLE_EMPTY',
  OOT_BOTTLED_GOLD_DUST: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLED_GOLD_DUST: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLED_GOLD_DUST: 'SHARED_BOTTLE_EMPTY',
};

const AUTOTRACKER_BOTTLE_SLOT_MAPPINGS: AutotrackerBottleSlotMapping[] = [
  {
    autotrackerId: 'OOT_BOTTLE_1',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'OOT_BOTTLE_2',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'OOT_BOTTLE_3',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'MM_BOTTLE_1',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'MM_BOTTLE_2',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'MM_BOTTLE_3',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'MM_BOTTLE_4',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle4',
    sharedGridRef: 'Shared_Bottle4',
  },
  {
    autotrackerId: 'MM_BOTTLE_5',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle5',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_1',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_2',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_3',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_4',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle4',
    sharedGridRef: 'Shared_Bottle4',
  },
];

const AUTOTRACKER_BOTTLE_SLOT_MAPPING_BY_ID = new Map(
  AUTOTRACKER_BOTTLE_SLOT_MAPPINGS.map((mapping) => [
    mapping.autotrackerId,
    mapping,
  ]),
);

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
const DUNGEON_REWARD_STATE_ITEM_IDS = new Set<string>(
  DUNGEON_REWARD_ITEM_IDS.flatMap((itemId) => {
    const stateItemId = getGridWheelOverlayStateItemId(itemId);
    return stateItemId ? [stateItemId] : [];
  }),
);
const SPOILER_REWARD_REGION_LABEL_BY_NAME = new Map<string, string>(
  DUNGEON_REWARD_REGION_LABELS.map(
    ({ regionName, labelItemId }): [string, string] => [
      normalizeName(regionName),
      labelItemId,
    ],
  ),
);
const SPOILER_REWARD_REGION_ALIASES = new Map<string, string>([
  [
    normalizeName('Inverted Stone Tower Temple'),
    normalizeName('Stone Tower Temple'),
  ],
  [
    normalizeName('Stone Tower Temple Inverted'),
    normalizeName('Stone Tower Temple'),
  ],
]);

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
const coopFlagEnabled = isCoopFeatureEnabled();
const { hasAvailableSections: hasAvailableEntranceSections, activeEntrances } =
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
  junkLocationIds,
  isApplyingSettings,
  preCompletedEnabled,
  canUndo,
  canRedo,
  allLocations,
  entranceOverrides,
  reachableEntranceIdSet,
  hasImportedSpoilerLog,
  importedSpoilerLogVersion,
  coopRoomCode,
  coopConnectionState,
} = storeToRefs(sessionStore);

// A link join (`#coop-room=CODE`) adopts the room's shared state and replaces
// local progress, so it must be explicitly confirmed before we connect.
// Auto-rejoin of a persisted room is a non-destructive reconnect to a room you
// were already in, so it is NOT gated by the prompt.
const linkJoinCode = coopFlagEnabled ? getCoopAutoJoinCode() : null;
const pendingLinkJoinCode = ref<string | null>(linkJoinCode);
const isCoopJoinConfirmOpen = ref(linkJoinCode !== null);
// Defer initializing the tracker from local state while we await the link-join
// decision or rejoin a persisted room — the modal/overlay covers the screen,
// and on confirm we adopt the room snapshot instead of the local state.
const isJoiningCoopRoom = ref(
  linkJoinCode !== null || coopRoomCode.value !== null,
);

function confirmCoopJoin() {
  const code = pendingLinkJoinCode.value;
  isCoopJoinConfirmOpen.value = false;
  pendingLinkJoinCode.value = null;
  if (!code) {
    isJoiningCoopRoom.value = false;
    return;
  }
  // isJoiningCoopRoom stays true so the "Joining…" overlay shows until the
  // room snapshot arrives and replaces local state.
  sessionStore.startRoomSync({ roomCode: code });
}

function cancelCoopJoin() {
  if (!isJoiningCoopRoom.value && !isCoopJoinConfirmOpen.value) return;
  isCoopJoinConfirmOpen.value = false;
  pendingLinkJoinCode.value = null;
  sessionStore.leaveRoom();
  // Hydrate the tracker from persisted local state so it's usable without coop.
  void sessionStore.attachTracker(props.tracker);
  isJoiningCoopRoom.value = false;
}

const isCoopActive = computed(() => coopRoomCode.value !== null);
const isCoopVisible = computed(
  () => coopFlagEnabled || coopRoomCode.value !== null,
);

// Starting a fresh room is non-destructive locally, but it spins up a shared
// session others can join, so the COOP button (mirroring the AUTO toggle) opens
// an explanation modal first. Aborting must NOT create a room.
const isCoopStartConfirmOpen = ref(false);

function requestCoopStart() {
  if (isCoopActive.value || autotracker.enabled.value) return;
  isCoopStartConfirmOpen.value = true;
}

function cancelCoopStart() {
  isCoopStartConfirmOpen.value = false;
}

// Shown once, right after the user creates a room from the button (never on a
// link-join or auto-rejoin), so they can grab the invite URL before doing
// anything else. The same URL stays available via the "COPY COOP URL" button.
const isCoopCreatedOpen = ref(false);
// The URL is only meaningful once the relay has actually accepted us and
// established the room (coopConnectionState === 'connected'). Until then we show
// a spinner. Latched so a transient drop after success doesn't hide the URL.
const isCoopRoomCreated = ref(false);
const createdCoopShareUrl = ref('');
const isCoopShareUrlCopied = ref(false);
let coopShareUrlCopiedResetTimeout: number | null = null;

function confirmCoopStart() {
  isCoopStartConfirmOpen.value = false;
  // Re-check the guards: state can change while the modal is open.
  if (isCoopActive.value || autotracker.enabled.value) return;
  const roomCode = generateCoopRoomCode();
  sessionStore.startRoomSync({ roomCode });
  createdCoopShareUrl.value = buildCoopShareUrl(roomCode);
  isCoopShareUrlCopied.value = false;
  isCoopRoomCreated.value = false;
  isCoopCreatedOpen.value = true;
}

// Cancelling while the room is still being created backs all the way out, so a
// server that never accepts us doesn't leave a half-created room behind.
function cancelCoopCreation() {
  isCoopCreatedOpen.value = false;
  isCoopShareUrlCopied.value = false;
  leaveCoopRoom();
}

async function copyCreatedCoopUrl() {
  const url = createdCoopShareUrl.value;
  if (!url) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      isCoopShareUrlCopied.value = true;
      if (coopShareUrlCopiedResetTimeout !== null) {
        window.clearTimeout(coopShareUrlCopiedResetTimeout);
      }
      coopShareUrlCopiedResetTimeout = window.setTimeout(() => {
        isCoopShareUrlCopied.value = false;
        coopShareUrlCopiedResetTimeout = null;
      }, 2000);
      return;
    }
    window.prompt('Copy this coop URL:', url);
  } catch (error) {
    console.error('Failed to copy coop URL:', error);
    window.prompt('Copy this coop URL:', url);
  }
}

function closeCoopCreated() {
  isCoopCreatedOpen.value = false;
  isCoopShareUrlCopied.value = false;
  isCoopRoomCreated.value = false;
}

// Leaving stops syncing but keeps local progress; still confirmed so an
// accidental click on the COOP button can't drop you out of a shared session.
const isCoopLeaveConfirmOpen = ref(false);

function requestCoopLeave() {
  if (!isCoopActive.value) return;
  isCoopLeaveConfirmOpen.value = true;
}

function cancelCoopLeave() {
  isCoopLeaveConfirmOpen.value = false;
}

function confirmCoopLeave() {
  isCoopLeaveConfirmOpen.value = false;
  leaveCoopRoom();
}

// Auto and co-op are mutually exclusive (docs/coop-sync.md §7). The blocked
// button stays visually disabled, but clicking it anyway shouldn't be a silent
// dead-end: it opens a short ELI5 explainer instead. The reason picks which
// "turn the other one off first" line to show.
const mutexNoticeReason = ref<'coop-blocks-auto' | 'auto-blocks-coop' | null>(
  null,
);

const mutexNoticeMessage = computed(() => {
  switch (mutexNoticeReason.value) {
    case 'coop-blocks-auto':
      return "You're in a co-op room right now. Leave it first, then you can switch on autotracking.";
    case 'auto-blocks-coop':
      return 'Autotracking is on right now. Turn it off first, then you can start co-op.';
    default:
      return '';
  }
});

function showAutotrackerBlockedNotice() {
  mutexNoticeReason.value = 'coop-blocks-auto';
}

function showCoopBlockedNotice() {
  mutexNoticeReason.value = 'auto-blocks-coop';
}

function closeMutexNotice() {
  mutexNoticeReason.value = null;
}

const canUndoWithCoop = computed(() => canUndo.value && !isCoopActive.value);
const canRedoWithCoop = computed(() => canRedo.value && !isCoopActive.value);

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
const isAutotrackerSpoilerRequiredDialogOpen = ref(false);
const isAutotrackerSpoilerVersionWarningDialogOpen = ref(false);
const spoilerPlayerOptions = ref<number[]>([]);
const spoilerSelectedPlayer = ref<number | null>(null);
const autotrackerSpoilerFileInput = ref<HTMLInputElement | null>(null);
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
const spoilerAutotrackerWarningMessage = ref<string | null>(null);
const spoilerLegacyWarningMessage = ref<string | null>(null);
const autotrackerSpoilerVersionWarningMessage = ref<string | null>(null);
const deferredAutotrackerSpoilerWarnings =
  ref<DeferredAutotrackerSpoilerWarnings | null>(null);
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
const locationNamesById = computed(
  () =>
    new Map(
      allLocations.value.map((location): [string, string] => [
        location.id,
        location.name,
      ]),
    ),
);
const locationInfoById = computed(
  () =>
    new Map(
      allLocations.value.map((location): [string, LocationInfo] => [
        location.id,
        location,
      ]),
    ),
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

/** Synchronous callback for auto-map-switching on scene/game changes. */
function handleSceneChange(game: RawAutotrackerGame, sceneId: number): void {
  // Respect the auto-map-switch toggle setting.
  if (!trackerSettings.value?.autoMapSwitch) return;

  const mapForScene =
    game === 'OoT' ? OOT_SCENE_TO_MAP[sceneId] : MM_SCENE_TO_MAP[sceneId];
  if (!mapForScene) return;

  const isSelectable = selectableMapDefs.value.some(
    (m) => m.id === mapForScene,
  );
  if (isSelectable && mapForScene !== activeMapId.value) {
    activeMapId.value = mapForScene;
  }
}

// useAutotracker pushes inventory and collected locations back-to-back for the
// same delta. Buffer the inventory half so the store can record one undo step.
let pendingAutotrackerInventoryUpdate: PendingAutotrackerInventoryUpdate | null =
  null;

const autotracker = useAutotracker({
  availableItemIds: availableItemIds,
  itemMaxCounts: itemMaxCounts,
  childWalletsEnabled: computed(() =>
    Boolean(trackerSettings.value?.childWallets),
  ),
  onInventoryUpdate: (inventory, meta) => {
    pendingAutotrackerInventoryUpdate = {
      inventory: { ...inventory },
      phase: meta.phase,
    };
  },
  resolveCheckToLocationIds: (check) =>
    resolveAutotrackerCheckToLocationIds(
      check,
      resolveMapSelectorCodeToCheckIds,
    ),
  onCollectedLocationsUpdate: (locationIds, meta) => {
    applyPendingAutotrackerDelta(locationIds, meta.phase);
  },
  onSceneChange: handleSceneChange,
});

// Debug helpers – expose autotracker state for console testing
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__debugAt = {
    setOotScene: (id: number) => {
      autotracker.ootSceneId.value = id;
      handleSceneChange('OoT', id);
    },
    setMmScene: (id: number) => {
      autotracker.mmSceneId.value = id;
      handleSceneChange('MM', id);
    },
    setActiveGame: (g: 'OoT' | 'MM') => {
      autotracker.activeGame.value = g;
    },
    setEnabled: (v: boolean) => {
      autotracker.enabled.value = v;
    },
    getState: () => ({
      activeGame: autotracker.activeGame.value,
      ootSceneId: autotracker.ootSceneId.value,
      mmSceneId: autotracker.mmSceneId.value,
      enabled: autotracker.enabled.value,
      activeMapId: activeMapId.value,
    }),
    triggerSceneChange: (game: 'OoT' | 'MM', sceneId: number) => {
      autotracker.activeGame.value = game;
      if (game === 'OoT') autotracker.ootSceneId.value = sceneId;
      else autotracker.mmSceneId.value = sceneId;
      handleSceneChange(game, sceneId);
    },
  };
}

const isAutotrackerVersionWarningDismissed = ref(false);
const autotrackerConnectionWarningMessage = ref<string | null>(null);

const visibleAutotrackerInlineWarning = computed<
  | {
      kind: 'connection';
      message: string;
    }
  | {
      kind: 'version';
      message: string;
    }
  | null
>(() => {
  const connectionWarning = autotrackerConnectionWarningMessage.value?.trim();
  if (connectionWarning) {
    return {
      kind: 'connection',
      message: connectionWarning,
    };
  }

  if (isAutotrackerVersionWarningDismissed.value) {
    return null;
  }

  const versionWarning = autotracker.versionWarning.value?.trim();
  if (!versionWarning) {
    return null;
  }

  return {
    kind: 'version',
    message: versionWarning,
  };
});

watch(
  () => autotracker.versionWarning.value,
  (warning, previousWarning) => {
    if (warning !== previousWarning) {
      isAutotrackerVersionWarningDismissed.value = false;
    }

    if (warning) {
      autotrackerConnectionWarningMessage.value = null;
    }
  },
);

watch(
  () => autotracker.status.value,
  (status) => {
    if (status === 'connected') {
      autotrackerConnectionWarningMessage.value = null;
      return;
    }
  },
);

let autotrackerStartMode: AutotrackerStartMode = 'overwrite';
let autotrackerLastRemoteInventory: Record<string, number> | null = null;
let autotrackerLastRemoteCollectedLocationIds: Set<string> | null = null;
let pendingAutotrackerStartMode: AutotrackerStartMode | null = null;
let nextAutotrackerToastId = 0;
const autotrackerToastMessages = ref<AutotrackerToast[]>([]);
const autotrackerToastTimeouts = new Map<
  number,
  ReturnType<typeof setTimeout>
>();

function resetAutotrackerMergeState() {
  autotrackerLastRemoteInventory = null;
  autotrackerLastRemoteCollectedLocationIds = null;
  pendingAutotrackerInventoryUpdate = null;
}

function deactivateAutotracker() {
  clearPendingAutotrackerStartRequest();
  autotrackerConnectionWarningMessage.value = null;
  resetAutotrackerMergeState();
  autotracker.destroy();
}

function activateAutotracker(mode: AutotrackerStartMode) {
  if (autotracker.enabled.value) {
    return;
  }

  autotrackerStartMode = mode;
  autotrackerConnectionWarningMessage.value = null;
  resetAutotrackerMergeState();
  autotracker.enabled.value = true;
}

function clearPendingAutotrackerStartRequest() {
  pendingAutotrackerStartMode = null;
  closeAutotrackerSpoilerRequiredDialog();
  closeAutotrackerSpoilerVersionWarningDialog();
}

function clearAutotrackerToastTimeout(toastId: number) {
  const timeoutId = autotrackerToastTimeouts.get(toastId);
  if (timeoutId === undefined) {
    return;
  }

  clearTimeout(timeoutId);
  autotrackerToastTimeouts.delete(toastId);
}

function clearAutotrackerToasts() {
  for (const timeoutId of autotrackerToastTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  autotrackerToastTimeouts.clear();
  autotrackerToastMessages.value = [];
}

function enqueueAutotrackerToast(kind: AutotrackerToastKind, message: string) {
  const toast: AutotrackerToast = {
    id: nextAutotrackerToastId,
    kind,
    message,
  };
  nextAutotrackerToastId += 1;

  const nextToasts = [toast, ...autotrackerToastMessages.value];
  if (nextToasts.length > MAX_AUTOTRACKER_TOASTS) {
    for (const removedToast of nextToasts.slice(MAX_AUTOTRACKER_TOASTS)) {
      clearAutotrackerToastTimeout(removedToast.id);
    }
  }
  autotrackerToastMessages.value = nextToasts.slice(0, MAX_AUTOTRACKER_TOASTS);

  const timeoutId = setTimeout(() => {
    autotrackerToastTimeouts.delete(toast.id);
    autotrackerToastMessages.value = autotrackerToastMessages.value.filter(
      (entry) => entry.id !== toast.id,
    );
  }, AUTOTRACKER_TOAST_DURATION_MS);

  autotrackerToastTimeouts.set(toast.id, timeoutId);
}

function shouldShowAutotrackerItemToast(itemId: string): boolean {
  if (itemId.startsWith(GRID_REF_ALIAS_PREFIX)) {
    return false;
  }

  if (itemId.startsWith(GRID_REF_STATE_PREFIX)) {
    return false;
  }

  if (DUNGEON_REWARD_STATE_ITEM_IDS.has(itemId)) {
    return false;
  }

  return availableItemIds.value.has(itemId);
}

function getAutotrackerItemToastMessage(itemId: string, gainedCount: number) {
  const label = itemName ? itemName(itemId) : itemId;
  return gainedCount > 1
    ? `Autotracked item: ${label} (+${gainedCount})`
    : `Autotracked item: ${label}`;
}

function getAutotrackerLocationToastMessage(locationId: string) {
  const label = locationNamesById.value.get(locationId) ?? locationId;
  return `Autotracked location: ${label}`;
}

function queueAutotrackerInventoryToasts(
  currentInventory: Map<string, number>,
  nextInventory: Map<string, number>,
  phase: AutotrackerSyncPhase,
) {
  if (phase !== 'live') {
    return;
  }

  for (const [itemId, nextCount] of nextInventory) {
    if (!shouldShowAutotrackerItemToast(itemId)) {
      continue;
    }

    const currentCount = currentInventory.get(itemId) ?? 0;
    if (nextCount <= currentCount) {
      continue;
    }

    enqueueAutotrackerToast(
      'item',
      getAutotrackerItemToastMessage(itemId, nextCount - currentCount),
    );
  }
}

function queueAutotrackerLocationToasts(
  currentLocationIds: readonly string[],
  nextLocationIds: string[],
  phase: AutotrackerSyncPhase,
) {
  if (phase !== 'live') {
    return;
  }

  const currentLocationIdSet = new Set(currentLocationIds);
  for (const locationId of nextLocationIds) {
    if (currentLocationIdSet.has(locationId)) {
      continue;
    }

    const locationInfo = locationInfoById.value.get(locationId);
    if (
      locationInfo &&
      !matchesLocationBaseVisibility(
        locationInfo,
        locationVisibilityFilters.value,
      )
    ) {
      continue;
    }

    enqueueAutotrackerToast(
      'location',
      getAutotrackerLocationToastMessage(locationId),
    );
  }
}

function closeAutotrackerSpoilerRequiredDialog() {
  isAutotrackerSpoilerRequiredDialogOpen.value = false;
}

function closeAutotrackerSpoilerVersionWarningDialog() {
  isAutotrackerSpoilerVersionWarningDialogOpen.value = false;
  autotrackerSpoilerVersionWarningMessage.value = null;
}

function setDeferredAutotrackerSpoilerWarnings(
  warnings: SpoilerSettingWarning[],
  unknownSettings: SpoilerUnknownSetting[],
) {
  deferredAutotrackerSpoilerWarnings.value =
    warnings.length > 0 || unknownSettings.length > 0
      ? {
          warnings: [...warnings],
          unknownSettings: [...unknownSettings],
        }
      : null;
}

function clearDeferredAutotrackerSpoilerWarnings() {
  deferredAutotrackerSpoilerWarnings.value = null;
}

function openSpoilerSettingsWarningDialog(options: {
  warnings?: SpoilerSettingWarning[];
  unknownSettings?: SpoilerUnknownSetting[];
  autotrackerWarningMessage?: string | null;
}) {
  const {
    warnings = [],
    unknownSettings = [],
    autotrackerWarningMessage = null,
  } = options;

  spoilerSettingsWarnings.value = [...warnings];
  spoilerUnknownSettings.value = [...unknownSettings];
  spoilerAutotrackerWarningMessage.value = autotrackerWarningMessage;
  isSpoilerSettingsWarningDialogOpen.value = true;
}

function openAutotrackerSpoilerVersionWarningDialog(
  message: string,
  warnings: SpoilerSettingWarning[] = [],
  unknownSettings: SpoilerUnknownSetting[] = [],
) {
  closeSpoilerSettingsWarningDialog();
  setDeferredAutotrackerSpoilerWarnings(warnings, unknownSettings);
  autotrackerSpoilerVersionWarningMessage.value = message;
  isAutotrackerSpoilerVersionWarningDialogOpen.value = true;
}

function showDeferredAutotrackerSpoilerWarnings() {
  const deferredWarnings = deferredAutotrackerSpoilerWarnings.value;
  clearDeferredAutotrackerSpoilerWarnings();
  if (!deferredWarnings) {
    return;
  }

  openSpoilerSettingsWarningDialog({
    warnings: deferredWarnings.warnings,
    unknownSettings: deferredWarnings.unknownSettings,
  });
}

function requestAutotrackerSpoilerUpload(mode: AutotrackerStartMode) {
  pendingAutotrackerStartMode = mode;
  isAutotrackerSpoilerRequiredDialogOpen.value = true;
}

function canStartAutotracker(mode: AutotrackerStartMode): boolean {
  if (!hasImportedSpoilerLog.value) {
    requestAutotrackerSpoilerUpload(mode);
    return false;
  }

  if (!isAutotrackingSupportedSpoilerVersion(importedSpoilerLogVersion.value)) {
    pendingAutotrackerStartMode = mode;
    openAutotrackerSpoilerVersionWarningDialog(
      getUnsupportedSpoilerVersionMessage(importedSpoilerLogVersion.value),
    );
    return false;
  }

  return true;
}

async function startAutotracker(mode: AutotrackerStartMode) {
  autotrackerConnectionWarningMessage.value = null;

  // Mutually exclusive with coop (docs/coop-sync.md §7). Central guard so the
  // overflow "Overwrite current state" path is covered too, not just the toggle.
  if (isCoopActive.value) {
    return;
  }

  if (!canStartAutotracker(mode)) {
    return;
  }

  clearPendingAutotrackerStartRequest();
  activateAutotracker(mode);

  const hasActiveAutotracker = await autotracker.probeAvailability();
  if (!autotracker.enabled.value || hasActiveAutotracker) {
    return;
  }

  autotrackerConnectionWarningMessage.value =
    AUTOTRACKER_NOT_FOUND_WARNING_MESSAGE;
}

function startAutotrackerOverwriteMode() {
  void startAutotracker('overwrite');
}

function dismissAutotrackerVersionWarning() {
  isAutotrackerVersionWarningDismissed.value = true;
}

function dismissAutotrackerInlineWarning() {
  if (visibleAutotrackerInlineWarning.value?.kind === 'connection') {
    autotrackerConnectionWarningMessage.value = null;
    return;
  }

  dismissAutotrackerVersionWarning();
}

function openAutotrackerFaq() {
  requestTrackerFaqOpen();
}

function setAutotrackerInventoryCount(
  inventoryMap: Map<string, number>,
  itemId: string,
  count: number,
) {
  if (count > 0) {
    inventoryMap.set(itemId, count);
  } else {
    inventoryMap.delete(itemId);
  }
}

function preserveDungeonRewardOverlayStateItems(
  nextInventory: Map<string, number>,
): Map<string, number> {
  const preserved = new Map(nextInventory);
  for (const stateItemId of DUNGEON_REWARD_STATE_ITEM_IDS) {
    const currentCount = inventory.value.get(stateItemId) ?? 0;
    setAutotrackerInventoryCount(preserved, stateItemId, currentCount);
  }
  return preserved;
}

function resolveAutotrackerInventoryUpdate(
  remoteInventory: Record<string, number>,
  _phase: AutotrackerSyncPhase,
): Map<string, number> | null {
  const previousRemoteInventory = autotrackerLastRemoteInventory;
  const nextRemoteInventory = { ...remoteInventory };
  autotrackerLastRemoteInventory = nextRemoteInventory;

  if (!previousRemoteInventory) {
    if (autotrackerStartMode !== 'overwrite') {
      return null;
    }

    return preserveDungeonRewardOverlayStateItems(
      buildAutotrackerInventorySnapshot(
        nextRemoteInventory,
        itemMaxCounts.value,
        DUNGEON_REWARD_STATE_ITEM_IDS,
      ),
    );
  }

  return preserveDungeonRewardOverlayStateItems(
    mergeAutotrackerInventoryUpdate({
      currentInventory: inventory.value,
      previousRemoteInventory,
      nextRemoteInventory,
      itemMaxCounts: itemMaxCounts.value,
      excludedItemIds: DUNGEON_REWARD_STATE_ITEM_IDS,
    }),
  );
}

function resolveAutotrackerCollectedLocationsUpdate(
  locationIds: string[],
  _phase: AutotrackerSyncPhase,
): string[] | null {
  const previousRemoteCollectedLocationIds =
    autotrackerLastRemoteCollectedLocationIds;
  const nextRemoteCollectedLocationIds = new Set(locationIds);
  autotrackerLastRemoteCollectedLocationIds = nextRemoteCollectedLocationIds;

  if (!previousRemoteCollectedLocationIds) {
    if (autotrackerStartMode !== 'overwrite') {
      return null;
    }

    // Ensure junk locations from the spoiler log are never set to uncollected
    // during an overwrite, since the autotracker does not track them separately.
    const protectedIds = new Set(locationIds);
    for (const id of junkLocationIds.value) {
      protectedIds.add(id);
    }

    // Also ensure pre-completed dungeon locations remain collected.
    const preCompletedLocationIds =
      props.tracker.getPreCompletedLocationIds?.() ?? [];
    for (const id of preCompletedLocationIds) {
      protectedIds.add(id);
    }

    return Array.from(protectedIds);
  }

  return mergeAutotrackerCollectedLocationsUpdate({
    currentCollectedLocationIds: collectedLocationIds.value,
    previousRemoteCollectedLocationIds,
    nextRemoteCollectedLocationIds,
  });
}

function applyPendingAutotrackerDelta(
  locationIds: string[],
  phase: AutotrackerSyncPhase,
) {
  const pendingInventoryUpdate = pendingAutotrackerInventoryUpdate;
  pendingAutotrackerInventoryUpdate = null;
  if (!pendingInventoryUpdate) {
    return;
  }

  const nextInventory = resolveAutotrackerInventoryUpdate(
    pendingInventoryUpdate.inventory,
    pendingInventoryUpdate.phase,
  );
  const nextCollectedLocationIds = resolveAutotrackerCollectedLocationsUpdate(
    locationIds,
    phase,
  );

  if (!nextInventory || !nextCollectedLocationIds) {
    return;
  }

  queueAutotrackerLocationToasts(
    collectedLocationIds.value,
    nextCollectedLocationIds,
    phase,
  );
  queueAutotrackerInventoryToasts(
    inventory.value,
    nextInventory,
    pendingInventoryUpdate.phase,
  );

  sessionStore.applyAutotrackerDelta(nextInventory, nextCollectedLocationIds);
}

function updateAutoMapSwitch(enabled: boolean) {
  trackerSettings.value = {
    ...trackerSettings.value,
    autoMapSwitch: enabled,
  };

  // When toggled ON, immediately jump to the current scene's map.
  if (enabled) {
    // Reset the autotracker's scene-tracking key so that the next raw
    // frame unconditionally triggers notifySceneChange. Otherwise,
    // lastTrackedSceneKey from before the toggle may silently suppress
    // all future scene-change callbacks.
    autotracker.resetSceneTracking();

    const game = autotracker.activeGame.value;
    if (game) {
      const sceneId =
        game === 'OoT'
          ? autotracker.ootSceneId.value
          : autotracker.mmSceneId.value;
      handleSceneChange(game, sceneId);
    }
  }
}

function handleAutotrackerEnabledUpdate(nextEnabled: boolean) {
  if (!nextEnabled) {
    deactivateAutotracker();
    return;
  }

  // Coop and autotracking are mutually exclusive (docs/coop-sync.md §7). The
  // toggle is disabled in a room, but guard here too: coop can auto-join on
  // load, so don't rely on the disabled attribute alone. Bail before the
  // auto-map-switch side effect.
  if (isCoopActive.value) {
    return;
  }

  // When autotracking is enabled, automatically enable auto-map-switch.
  if (!trackerSettings.value?.autoMapSwitch) {
    updateAutoMapSwitch(true);
  }

  void startAutotracker('preserve');
}

watch(
  hasImportedSpoilerLog,
  (nextHasImportedSpoilerLog) => {
    if (nextHasImportedSpoilerLog || !autotracker.enabled.value) {
      return;
    }

    deactivateAutotracker();
  },
  { flush: 'sync' },
);

function getUnsupportedSpoilerAutotrackerMessage(
  ootmmVersion: string | null | undefined,
): string {
  const normalizedVersion = ootmmVersion?.trim();
  const versionLabel =
    normalizedVersion && normalizedVersion.length > 0
      ? normalizedVersion
      : 'an unknown version';
  return `An active autotracker was detected, but autotracking is only supported for OoTMM spoiler logs from version 30.1. This spoiler log reports ${versionLabel}.`;
}

function getUnsupportedSpoilerVersionMessage(
  ootmmVersion: string | null | undefined,
): string {
  const normalizedVersion = ootmmVersion?.trim();
  const versionLabel =
    normalizedVersion && normalizedVersion.length > 0
      ? normalizedVersion
      : 'an unknown version';
  return `Autotracking is only supported for OoTMM spoiler logs from version 30.1. This spoiler log reports ${versionLabel}.`;
}

async function maybeStartAutotrackerFromSpoiler(
  parsed: SpoilerLogData,
): Promise<string | null> {
  if (autotracker.enabled.value) {
    return null;
  }

  const hasActiveAutotracker = await autotracker.probeAvailability();
  if (!hasActiveAutotracker) {
    return null;
  }

  if (!isAutotrackingSupportedSpoilerVersion(parsed.ootmmVersion)) {
    return getUnsupportedSpoilerAutotrackerMessage(parsed.ootmmVersion);
  }

  activateAutotracker('preserve');
  return null;
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
  const overrides = entranceOverrides.value;
  const activeEntranceKeys = getActiveEntranceKeys(
    (trackerSettings.value ?? {}) as Record<string, unknown>,
  );

  for (const mapDef of selectableMapDefs.value) {
    const checkIds = new Set<string>();
    for (const marker of mapDef.markers) {
      if (marker.type === 'submenu') {
        const markerEntranceIds = marker.entranceMenu?.entranceIds ?? [];
        const hasEntranceBinding = markerEntranceIds.length > 0;

        if (hasEntranceBinding) {
          for (const code of resolveEntranceBoundCodes(
            markerEntranceIds,
            overrides,
            activeEntranceKeys,
          )) {
            addResolvedMapSelectorCode(checkIds, code);
          }
        } else {
          // No ER or no entrance binding – use static codes
          for (const submenuEntry of marker.markers ?? []) {
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

// Build map: mapId → Set of active entrance keys present on that map's markers
const mapSelectorEntranceIdsByMap = computed(() => {
  const byMap = new Map<string, Set<string>>();
  const activeKeys = getActiveEntranceKeys(
    (trackerSettings.value ?? {}) as Record<string, unknown>,
  );
  if (activeKeys.size === 0) return byMap;

  for (const mapDef of selectableMapDefs.value) {
    const entranceIds = new Set<string>();
    for (const marker of mapDef.markers) {
      if (
        marker.type === 'submenu' &&
        marker.entranceMenu &&
        Array.isArray(marker.entranceMenu.entranceIds)
      ) {
        for (const srcId of marker.entranceMenu.entranceIds) {
          const trimmed = srcId.trim();
          if (trimmed && activeKeys.has(trimmed)) {
            entranceIds.add(trimmed);
          }
        }
      }
    }
    byMap.set(mapDef.id, entranceIds);
  }
  return byMap;
});

// Count visible map entrance entries, filtered by reachability + mapping settings
// and respecting per-marker display mode.
const mapSelectorVisibleEntranceCountByMap = computed(() => {
  const byMap = new Map<string, number>();
  const entrancesByMap = mapSelectorEntranceIdsByMap.value;
  if (entrancesByMap.size === 0) return byMap;

  const reachFilter = entrancesReachabilityFilter.value;
  const mapFilter = entrancesMappingFilter.value;
  const reachableSet = reachableEntranceIdSet.value;
  const activeKeys = getActiveEntranceKeys(
    (trackerSettings.value ?? {}) as Record<string, unknown>,
  );

  const passesFilters = (key: string): boolean => {
    const isMapped = (entranceOverrides.value[key] ?? '').trim().length > 0;
    const passesMapping =
      mapFilter === 'all' ||
      (mapFilter === 'mapped' && isMapped) ||
      (mapFilter === 'unmapped' && !isMapped);
    if (!passesMapping) return false;

    const isReachable = reachableSet.has(key);
    return (
      reachFilter === 'all' ||
      (reachFilter === 'reachable' && isReachable) ||
      (reachFilter === 'unreachable' && !isReachable)
    );
  };

  for (const mapDef of selectableMapDefs.value) {
    const entranceIds = entrancesByMap.get(mapDef.id);
    if (!entranceIds || entranceIds.size === 0) {
      byMap.set(mapDef.id, 0);
      continue;
    }

    let count = 0;

    for (const marker of mapDef.markers) {
      if (
        marker.type !== 'submenu' ||
        !marker.entranceMenu ||
        !Array.isArray(marker.entranceMenu.entranceIds)
      ) {
        continue;
      }

      const displayMode = marker.entranceMenu.display ?? 'both';
      const showsEntrances = displayMode !== 'exits';
      const showsExits = displayMode !== 'entrances';
      if (!showsEntrances && !showsExits) continue;

      const markerEntranceIds = new Set<string>();
      for (const srcId of marker.entranceMenu.entranceIds) {
        const trimmed = srcId.trim();
        if (trimmed && activeKeys.has(trimmed)) {
          markerEntranceIds.add(trimmed);
        }
      }

      for (const entranceId of markerEntranceIds) {
        if (showsEntrances && passesFilters(entranceId)) {
          count += 1;
        }

        // For display: "exits", count the partner (reverse) key.
        const partnerKey = getEdgeReverse(entranceId);
        if (showsExits && partnerKey && passesFilters(partnerKey)) {
          count += 1;
        }
      }
    }

    byMap.set(mapDef.id, count);
  }
  return byMap;
});

const hasAnyActiveEntrances = computed(() => activeEntrances.value.length > 0);

function getMapSelectorVisibleCount(mapDef: MapDef): number {
  return mapSelectorVisibleCountByMap.value.get(mapDef.id) ?? 0;
}

function getMapSelectorVisibleEntranceCount(mapDef: MapDef): number {
  return mapSelectorVisibleEntranceCountByMap.value.get(mapDef.id) ?? 0;
}

function getMapSelectorLabel(mapDef: MapDef): string {
  const checkCount = getMapSelectorVisibleCount(mapDef);
  if (!hasAnyActiveEntrances.value) {
    return `${mapDef.title} (${checkCount})`;
  }
  const entranceCount = getMapSelectorVisibleEntranceCount(mapDef);
  return `${mapDef.title} (${checkCount} / ${entranceCount})`;
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
    sessionStore.attachTracker(nextTracker, {
      deferInit: isJoiningCoopRoom.value,
    });
  },
  { immediate: true },
);

watch(coopConnectionState, (state) => {
  if (state === 'connected' && isJoiningCoopRoom.value) {
    isJoiningCoopRoom.value = false;
  }
  // Flip the "room created" modal from its spinner to the share URL only once
  // the relay has actually accepted the connection and seeded the room.
  if (state === 'connected' && isCoopCreatedOpen.value) {
    isCoopRoomCreated.value = true;
  }
});

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
  () => trackerSettings.value?.songEventsShuffleMm,
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

function isMapAboveSeparator(mapDef: MapDef): boolean {
  if (getMapSelectorVisibleCount(mapDef) > 0) return true;
  if (
    hasAnyActiveEntrances.value &&
    getMapSelectorVisibleEntranceCount(mapDef) > 0
  )
    return true;
  return false;
}

function compareMapSelectorMapsByVisibleCount(a: MapDef, b: MapDef): number {
  const aCount = getMapSelectorVisibleCount(a);
  const bCount = getMapSelectorVisibleCount(b);
  const aAbove = isMapAboveSeparator(a);
  const bAbove = isMapAboveSeparator(b);

  if (aAbove && !bAbove) return -1;
  if (!aAbove && bAbove) return 1;

  if (!aAbove && !bAbove) {
    return a.title.localeCompare(b.title);
  }

  // Both above separator – sort by check count (entrances don't affect sort)
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
const mapSelectorFirstBelowSeparatorIndex = computed(() =>
  filteredMapSelectorMaps.value.findIndex(
    (mapDef) => !isMapAboveSeparator(mapDef),
  ),
);

function isMapSelectorFirstZeroCountOption(
  index: number,
  mapDef: MapDef,
): boolean {
  return (
    !isMapAboveSeparator(mapDef) &&
    index === mapSelectorFirstBelowSeparatorIndex.value
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
  mapSelectorInputRef.value?.blur();
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
    const shouldBlur = isMapSelectorOpen.value || hasMapSelectorUserInput.value;
    closeMapSelector();
    if (shouldBlur) {
      mapSelectorInputRef.value?.blur();
    }
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

const activeMapVisibleEntranceCount = computed(() => {
  const mapDef = activeMap.value;
  if (!mapDef) return 0;
  return mapSelectorVisibleEntranceCountByMap.value.get(mapDef.id) ?? 0;
});

watch([activeMapVisibleCount, activeMapVisibleEntranceCount], () => {
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

function formatHexAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, '0')}`;
}

function makeGridRefStateKey(mapping: AutotrackerBottleSlotMapping): string {
  return `${GRID_REF_STATE_PREFIX}${GRID_REF_ALIAS_PREFIX}${mapping.gridRef}:${mapping.trackerItemId}`;
}

function isSharedBottleMode(availableIds: Set<string>): boolean {
  return (
    availableIds.has('SHARED_BOTTLE_EMPTY') &&
    !availableIds.has('OOT_BOTTLE_EMPTY') &&
    !availableIds.has('MM_BOTTLE_EMPTY')
  );
}

function makeSharedGridRefStateKey(
  mapping: AutotrackerBottleSlotMapping,
): string | null {
  if (!mapping.sharedGridRef) {
    return null;
  }

  return `${GRID_REF_STATE_PREFIX}${GRID_REF_ALIAS_PREFIX}${mapping.sharedGridRef}:SHARED_BOTTLE_EMPTY`;
}

function buildTrackerInventoryRecord(
  liveState: Map<string, number>,
  availableIds: Set<string>,
): Record<string, number> {
  const record: Record<string, number> = {};
  const sharedBottleMode = isSharedBottleMode(availableIds);
  const bottleCounts = new Map<string, number>();
  const sharedBottleGridRefStates = new Set<string>();
  const separatelyTrackedBottleContentCounts = new Map<string, number>();

  for (const [id, qty] of liveState) {
    if (qty <= 0) {
      continue;
    }

    const separateBottleContentBaseItemId =
      SEPARATELY_TRACKED_BOTTLE_CONTENT_BASE_IDS[id];
    if (separateBottleContentBaseItemId) {
      separatelyTrackedBottleContentCounts.set(
        separateBottleContentBaseItemId,
        (separatelyTrackedBottleContentCounts.get(
          separateBottleContentBaseItemId,
        ) ?? 0) + qty,
      );
    }

    const bottleSlotMapping = AUTOTRACKER_BOTTLE_SLOT_MAPPING_BY_ID.get(id);
    if (!bottleSlotMapping) {
      record[id] = qty;
      continue;
    }

    if (sharedBottleMode) {
      const sharedGridRefStateKey =
        makeSharedGridRefStateKey(bottleSlotMapping);
      if (sharedGridRefStateKey) {
        record[sharedGridRefStateKey] = 1;
        sharedBottleGridRefStates.add(sharedGridRefStateKey);
      }
      continue;
    }

    record[makeGridRefStateKey(bottleSlotMapping)] = 1;
    bottleCounts.set(
      bottleSlotMapping.trackerItemId,
      (bottleCounts.get(bottleSlotMapping.trackerItemId) ?? 0) + 1,
    );
  }

  if (sharedBottleGridRefStates.size > 0) {
    record.SHARED_BOTTLE_EMPTY =
      (record.SHARED_BOTTLE_EMPTY ?? 0) + sharedBottleGridRefStates.size;
  }

  for (const [itemId, count] of bottleCounts) {
    record[itemId] = (record[itemId] ?? 0) + count;
  }

  for (const [baseItemId, count] of separatelyTrackedBottleContentCounts) {
    if (count <= 0) {
      continue;
    }

    const currentBottleCount = record[baseItemId] ?? 0;
    const suppressedCount = Math.min(currentBottleCount, count);
    if (suppressedCount <= 0) {
      continue;
    }

    if (currentBottleCount === suppressedCount) {
      delete record[baseItemId];
    } else {
      record[baseItemId] = currentBottleCount - suppressedCount;
    }

    const matchingGridRefStateKeys = Object.keys(record).filter(
      (key) =>
        key.startsWith(GRID_REF_STATE_PREFIX) && key.endsWith(`:${baseItemId}`),
    );

    for (const key of matchingGridRefStateKeys.slice(-suppressedCount)) {
      delete record[key];
    }
  }

  return record;
}

function buildLiveInventoryFromRawItems(
  rawItems: RawAutotrackerItem[],
): Record<string, number> {
  const rawState = new Map<string, number>();

  for (const { id, qty } of rawItems) {
    if (qty > 0) {
      rawState.set(id, qty);
    }
  }

  const translated = translateAutotrackerItems(
    Array.from(rawState, ([id, qty]) => ({ id, qty })),
    availableItemIds.value,
    itemMaxCounts.value,
    {
      childWalletsEnabled: Boolean(trackerSettings.value?.childWallets),
    },
  );

  return buildTrackerInventoryRecord(
    new Map(Object.entries(translated).filter(([, qty]) => qty > 0)),
    availableItemIds.value,
  );
}

function formatAutotrackerDumpTimestamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function buildAutotrackerDumpRequestedAreas(): AutotrackerDumpRequestedAreas {
  const mapSpecs = (
    specs: typeof RAW_CHUNK_SPECS_BY_GAME.oot,
  ): AutotrackerDumpRequestedArea[] =>
    specs.map((spec) => ({
      name: spec.name,
      address: formatHexAddress(spec.address),
      length: spec.length,
    }));

  return {
    oot: mapSpecs(RAW_CHUNK_SPECS_BY_GAME.oot),
    mm: mapSpecs(RAW_CHUNK_SPECS_BY_GAME.mm),
  };
}

function buildAutotrackerDumpHandshake(): string {
  return JSON.stringify({
    type: 'handshake',
    features: ['raw'],
    flags: {
      protocol: 'raw',
    },
    memoryAreas: {
      oot: RAW_CHUNK_SPECS_BY_GAME.oot,
      mm: RAW_CHUNK_SPECS_BY_GAME.mm,
    },
  });
}

function buildFallbackRemoteLocationIds(
  checks: RawAutotrackerCheck[],
): string[] {
  const locationIds = new Set<string>();

  for (const check of checks) {
    if (!check.checked) {
      continue;
    }

    const resolved = resolveAutotrackerCheckToLocationIds(
      check,
      resolveMapSelectorCodeToCheckIds,
    );
    for (const locationId of resolved) {
      if (!locationId) {
        continue;
      }
      locationIds.add(locationId);
    }
  }

  return Array.from(locationIds).sort((left, right) =>
    left.localeCompare(right),
  );
}

function buildAutotrackerDumpSummary(
  rawSnapshot: RawAutotrackerMessage,
): AutotrackerDumpSummary | null {
  const parser = createRawAutotrackerParser();
  const parsed = parser.parse(rawSnapshot);
  if (!parsed) {
    return null;
  }

  const remoteInventory =
    autotrackerLastRemoteInventory ??
    buildLiveInventoryFromRawItems(parsed.items);
  const locations = autotrackerLastRemoteCollectedLocationIds
    ? Array.from(autotrackerLastRemoteCollectedLocationIds)
    : buildFallbackRemoteLocationIds(parsed.checks);

  return {
    valid: true,
    activeGame: rawSnapshot.game,
    saveIndex: rawSnapshot.saveIndex >>> 0,
    items: Object.entries(remoteInventory)
      .map(([id, qty]) => ({ id, qty }))
      .filter(({ qty }) => qty > 0)
      .sort((left, right) => left.id.localeCompare(right.id)),
    locations: locations.sort((left, right) => left.localeCompare(right)),
  };
}

function requestAutotrackerRawSnapshot(
  wsUrl: string,
  timeoutMs = AUTOTRACKER_DUMP_TIMEOUT_MS,
): Promise<RawAutotrackerMessage> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (
      callback: (value?: RawAutotrackerMessage | Error) => void,
      value?: RawAutotrackerMessage | Error,
    ) => {
      if (settled) {
        return;
      }
      settled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }

      callback(value);
    };

    timeoutId = setTimeout(() => {
      finish(
        (error) => reject(error as Error),
        new Error('Timed out waiting for autotracker snapshot'),
      );
    }, timeoutMs);

    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      finish(
        (err) => reject(err as Error),
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    socket.onopen = () => {
      socket?.send(buildAutotrackerDumpHandshake());
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as
          | RawAutotrackerMessage
          | { type?: string };

        if (payload.type !== 'raw') {
          return;
        }

        const rawPayload = payload as RawAutotrackerMessage;

        finish(
          (message) => resolve(message as RawAutotrackerMessage),
          rawPayload,
        );
      } catch (error) {
        finish(
          (err) => reject(err as Error),
          error instanceof Error
            ? error
            : new Error('Failed to parse autotracker snapshot payload'),
        );
      }
    };

    socket.onerror = () => {
      finish(
        (error) => reject(error as Error),
        new Error('Autotracker websocket error while requesting snapshot'),
      );
    };

    socket.onclose = () => {
      finish(
        (error) => reject(error as Error),
        new Error('Autotracker websocket closed before snapshot arrived'),
      );
    };
  });
}

async function exportAutotrackerDump(): Promise<boolean> {
  const rawSnapshot = await requestAutotrackerRawSnapshot(
    autotracker.url.value,
  );
  const summary = buildAutotrackerDumpSummary(rawSnapshot);
  if (!summary) {
    return false;
  }

  try {
    const snapshot: AutotrackerDumpFile = {
      schemaVersion: AUTOTRACKER_DUMP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      summary,
      rawFrame: {
        schemaVersion: rawSnapshot.schemaVersion,
        sequence: rawSnapshot.sequence,
        refresh: rawSnapshot.refresh,
        diff: rawSnapshot.diff,
      },
      requestedMemoryAreas: buildAutotrackerDumpRequestedAreas(),
      regions: rawSnapshot.chunks.map((chunk) => ({
        name: chunk.name,
        address: formatHexAddress(chunk.address),
        size: chunk.length,
        encoding: 'base64',
        data: typeof chunk.data === 'string' ? chunk.data : '',
      })),
    };

    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `autotracker-snapshot-${formatAutotrackerDumpTimestamp(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to export autotracker dump:', error);
    return false;
  }
}

function resetTrackerState() {
  if (isCoopActive.value) {
    sessionStore.leaveRoom();
  }
  deactivateAutotracker();
  uiStore.resetUiState();
  activeMapId.value = getPreferredActiveMapId(selectableMapDefs.value);
  void sessionStore.resetSessionStateToDefaults();
}

function leaveCoopRoom() {
  sessionStore.leaveRoom();
}

function handleMapToggleCollected(checkId: string) {
  sessionStore.toggleCollectedLocation(checkId);
}

function handleMapMarkAllReachable(checkIds: string[]) {
  if (checkIds.length === 0) return;
  // Additive bulk collect: emit granular collects so a coop peer's concurrent
  // collect isn't clobbered by a whole-list set_ids replace.
  sessionStore.collectLocationIds(checkIds);
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
  if (isApplyingSettings.value || !canUndoWithCoop.value) return;
  await sessionStore.undo();
}

async function redo() {
  if (isApplyingSettings.value || !canRedoWithCoop.value) return;
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
  spoilerAutotrackerWarningMessage.value = null;
  spoilerLegacyWarningMessage.value = null;
}

function cancelAutotrackerSpoilerRequiredDialog() {
  clearPendingAutotrackerStartRequest();
  clearDeferredAutotrackerSpoilerWarnings();
}

function cancelAutotrackerSpoilerVersionWarningDialog() {
  clearPendingAutotrackerStartRequest();
  showDeferredAutotrackerSpoilerWarnings();
}

function openAutotrackerSpoilerFileDialog() {
  if (isApplyingSettings.value) return;
  autotrackerSpoilerFileInput.value?.click();
}

async function onAutotrackerSpoilerFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    closeAutotrackerSpoilerRequiredDialog();
    closeAutotrackerSpoilerVersionWarningDialog();
    await handleSpoilerFile(file);
  }
  input.value = '';
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

/**
 * Builds a combined starting items map from the spoiler log's explicit
 * Starting Items section plus any items found in the POCKET region of the
 * Location List for the selected player's world.
 */
function buildCombinedStartingItems(
  parsed: SpoilerLogData,
  selectedPlayer?: number,
): Record<string, number> {
  const combined: Record<string, number> = { ...parsed.startingItems };

  const targetWorld = selectedPlayer ?? 1;

  for (const placement of parsed.locationPlacements) {
    if (!placement.region) continue;

    const normalizedRegion = normalizeName(
      placement.region.replace(/^world\s+\d+\s+/i, ''),
    );
    if (normalizedRegion !== 'pocket') continue;

    // In multiworld the world field is set; only take items for the selected player.
    // In single-player the world field is undefined, and we always include them.
    if (
      placement.world !== undefined &&
      !Number.isNaN(placement.world) &&
      placement.world !== targetWorld
    ) {
      continue;
    }

    const itemName = placement.item;
    if (!itemName) continue;

    combined[itemName] = (combined[itemName] ?? 0) + 1;
  }

  return combined;
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
  const normalized = normalizeName(region.replace(/^world\s+\d+\s+/i, ''));
  return SPOILER_REWARD_REGION_ALIASES.get(normalized) ?? normalized;
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
  const resolvedIds: string[] = [];
  for (const locName of junkLocations) {
    const ids = byName.get(normalizeName(locName));
    if (!ids) {
      console.warn('[OoTMM Tracker] Junk location not found:', locName);
      continue;
    }
    for (const id of ids) {
      resolvedIds.push(id);
    }
  }
  // Additive bulk collect (granular ops); see handleMapMarkAllReachable.
  sessionStore.collectLocationIds(resolvedIds);
  // Publish junk ids through the store so they sync to coop peers / other tabs
  // (whole-list replace; see setJunkLocationIds) instead of a local-only ref write.
  sessionStore.setJunkLocationIds(resolvedIds);
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

async function applySpoilerLog(text: string, selectedPlayer?: number) {
  if (isApplyingSettings.value) return false;
  const parsed = parseSpoilerLog(text, { player: selectedPlayer });

  // Normalize legacy settings keys (v30.1 → v31.0) before applying.
  // (Legacy detection / warning message is handled in handleSpoilerFile.)
  const normalizedSettings = normalizeSpoilerSettings(parsed.settings);

  const settingsPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(normalizedSettings)) {
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

  const combinedStartingItems = buildCombinedStartingItems(
    parsed,
    selectedPlayer,
  );

  // When Clocks Shuffle is enabled and Progressive Clocks is set to
  // Ascending or Descending, mark the corresponding clock as a starting
  // item. The progressiveClocks setting itself is not whitelisted since
  // it's irrelevant for logic — this is only about the starting item.
  if (nextSettings.clocks === true) {
    const progClocks = String(
      parsed.settings.progressiveClocks ?? '',
    ).toLowerCase();
    if (progClocks === 'ascending') {
      combinedStartingItems['Clock (Day 1)'] = Math.max(
        combinedStartingItems['Clock (Day 1)'] ?? 0,
        1,
      );
    } else if (progClocks === 'descending') {
      combinedStartingItems['Clock (Night 3)'] = Math.max(
        combinedStartingItems['Clock (Night 3)'] ?? 0,
        1,
      );
    }
  }

  if (Object.keys(combinedStartingItems).length > 0) {
    applyStartingItems(combinedStartingItems);
  }

  applySpoilerRewardAssignments(parsed, nextSettings, selectedPlayer);

  // Synthesize cross-game counterpart items for CrossWarp (OoT↔MM songs)
  // based on normalized settings. This ensures that e.g. MM_SONG_TP_FOREST
  // is present when OOT_SONG_TP_FOREST is a starting item and songMinuetMm
  // is enabled (either natively or via legacy crossWarpOot normalization).
  const currentInventory = { ...sessionStore.inventoryById };
  if (synthesizeCrossWarpItemsForInventory(currentInventory, nextSettings)) {
    sessionStore.setInventoryFromMap(new Map(Object.entries(currentInventory)));
  }

  if (parsed.junkLocations.length > 0) {
    applyJunkLocations(parsed.junkLocations);
  }

  return true;
}

async function handleSpoilerFile(file: File) {
  if (!file) return;
  const requestedAutotrackerMode = pendingAutotrackerStartMode;
  let shouldClearPendingAutotrackerStartRequest =
    requestedAutotrackerMode !== null;
  try {
    const text = await file.text();
    const parsed = parseSpoilerLog(text);
    const playerOptions = getSpoilerLogPlayerOptions(parsed);
    closeSpoilerSettingsWarningDialog();

    // Normalize legacy settings (v30.1 keys → v31.0) before checking
    // for unknown settings, so old keys like crossWarpOot, sunSongMm etc.
    // are translated to their v31.0 equivalents and don't appear as
    // "unknown" in the warning dialog.
    const hasLegacy = hasLegacyKeys(parsed.settings);
    const normalizedSettings = normalizeSpoilerSettings(parsed.settings);
    if (hasLegacy) {
      spoilerLegacyWarningMessage.value =
        'This spoiler log contains settings from an older or mixed OoTMM version. ' +
        'The settings have been converted to v31.0 equivalents as best as possible.';
    }

    const warnings = collectSpoilerSettingsWarnings(normalizedSettings);
    const unknownSettings = collectSpoilerUnknownSettings(normalizedSettings);
    let selectedPlayer: number | undefined;

    if (playerOptions.length > 1) {
      const selected = await requestSpoilerStartingItemsPlayer(playerOptions);
      if (selected === null) {
        return;
      }
      selectedPlayer = selected;
    }

    const didApplySpoiler = await applySpoilerLog(text, selectedPlayer);
    if (!didApplySpoiler) {
      return;
    }

    sessionStore.setSpoilerLogImportState(true, parsed.ootmmVersion ?? null);

    if (requestedAutotrackerMode) {
      if (isAutotrackingSupportedSpoilerVersion(parsed.ootmmVersion)) {
        await startAutotracker(requestedAutotrackerMode);
        clearDeferredAutotrackerSpoilerWarnings();
        spoilerAutotrackerWarningMessage.value = null;
      } else {
        openAutotrackerSpoilerVersionWarningDialog(
          getUnsupportedSpoilerVersionMessage(parsed.ootmmVersion),
          warnings,
          unknownSettings,
        );
        shouldClearPendingAutotrackerStartRequest = false;
        return;
      }
    } else {
      clearDeferredAutotrackerSpoilerWarnings();
      spoilerAutotrackerWarningMessage.value =
        await maybeStartAutotrackerFromSpoiler(parsed);
    }

    if (
      spoilerAutotrackerWarningMessage.value ||
      spoilerLegacyWarningMessage.value ||
      warnings.length > 0 ||
      unknownSettings.length > 0
    ) {
      openSpoilerSettingsWarningDialog({
        warnings,
        unknownSettings,
        autotrackerWarningMessage: spoilerAutotrackerWarningMessage.value,
      });
    }
  } finally {
    if (requestedAutotrackerMode && shouldClearPendingAutotrackerStartRequest) {
      clearPendingAutotrackerStartRequest();
    }
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
  // A link join awaits explicit confirmation (the modal is already open) and is
  // not auto-connected here. Drop the code from the URL so a reload doesn't
  // silently re-trigger the prompt.
  if (pendingLinkJoinCode.value) {
    clearCoopAutoJoinCodeFromUrl();
  } else if (sessionStore.coopRoomCode) {
    // Reconnect to a room we were already in (non-destructive).
    sessionStore.startRoomSync({ roomCode: sessionStore.coopRoomCode });
  }
  const windowWithHandlers = window as Window & {
    __TLT_DEBUG_ACTIVATE_ALL__?: () => void;
    __TLT_DEBUG_DUMP_AUTOTRACKER__?: () => boolean | Promise<boolean>;
    __TLT_RESET_TRACKER_STATE__?: () => void;
    __TLT_LEAVE_COOP__?: () => void;
  };
  windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__ = fillInventory;
  windowWithHandlers.__TLT_DEBUG_DUMP_AUTOTRACKER__ = exportAutotrackerDump;
  windowWithHandlers.__TLT_RESET_TRACKER_STATE__ = resetTrackerState;
  windowWithHandlers.__TLT_LEAVE_COOP__ = leaveCoopRoom;
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
    __TLT_DEBUG_DUMP_AUTOTRACKER__?: () => boolean | Promise<boolean>;
    __TLT_RESET_TRACKER_STATE__?: () => void;
    __TLT_LEAVE_COOP__?: () => void;
  };
  if (windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__ === fillInventory) {
    delete windowWithHandlers.__TLT_DEBUG_ACTIVATE_ALL__;
  }
  if (
    windowWithHandlers.__TLT_DEBUG_DUMP_AUTOTRACKER__ === exportAutotrackerDump
  ) {
    delete windowWithHandlers.__TLT_DEBUG_DUMP_AUTOTRACKER__;
  }
  if (windowWithHandlers.__TLT_RESET_TRACKER_STATE__ === resetTrackerState) {
    delete windowWithHandlers.__TLT_RESET_TRACKER_STATE__;
  }
  if (windowWithHandlers.__TLT_LEAVE_COOP__ === leaveCoopRoom) {
    delete windowWithHandlers.__TLT_LEAVE_COOP__;
  }
  clearAutotrackerToasts();
  if (coopShareUrlCopiedResetTimeout !== null) {
    window.clearTimeout(coopShareUrlCopiedResetTimeout);
    coopShareUrlCopiedResetTimeout = null;
  }
  autotracker.destroy();
  sessionStore.stopLocalSessionSync();
  sessionStore.stopRoomSync();
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
    <input
      ref="autotrackerSpoilerFileInput"
      type="file"
      accept=".txt"
      class="spoiler-input"
      hidden
      @change="onAutotrackerSpoilerFileSelected"
    />
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
      v-if="isCoopJoinConfirmOpen"
      class="spoiler-player-dialog-overlay"
      data-testid="coop-join-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-join-confirm-title"
      aria-describedby="coop-join-confirm-description"
    >
      <div class="spoiler-player-dialog" data-testid="coop-join-confirm-modal">
        <h2 id="coop-join-confirm-title" class="spoiler-player-dialog-title">
          Join co-op room?
        </h2>
        <p
          id="coop-join-confirm-description"
          class="spoiler-player-dialog-text"
        >
          Joining this room replaces your current tracker state with the room's
          shared state. This can't be undone.
        </p>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            data-testid="coop-join-confirm-cancel-button"
            @click="cancelCoopJoin"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            data-testid="coop-join-confirm-apply-button"
            @click="confirmCoopJoin"
          >
            Join &amp; Replace
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="isCoopStartConfirmOpen"
      class="spoiler-player-dialog-overlay"
      data-testid="coop-start-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-start-confirm-title"
      aria-describedby="coop-start-confirm-description"
    >
      <div class="spoiler-player-dialog" data-testid="coop-start-confirm-modal">
        <h2 id="coop-start-confirm-title" class="spoiler-player-dialog-title">
          Start a co-op room?
        </h2>
        <p
          id="coop-start-confirm-description"
          class="spoiler-player-dialog-text"
        >
          Opens a new shared room you can invite others to:
        </p>
        <ul class="spoiler-player-dialog-list">
          <li>
            Items, locations and settings sync live with everyone who joins.
          </li>
          <li>Your current tracker becomes the room's starting state.</li>
          <li>Autotracking is off while you're in a room.</li>
          <li>You can leave anytime; cancelling creates no room.</li>
        </ul>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            data-testid="coop-start-confirm-cancel-button"
            @click="cancelCoopStart"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            data-testid="coop-start-confirm-apply-button"
            @click="confirmCoopStart"
          >
            Start co-op
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="isCoopCreatedOpen"
      class="spoiler-player-dialog-overlay"
      data-testid="coop-created-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-created-title"
    >
      <div class="spoiler-player-dialog" data-testid="coop-created-modal">
        <template v-if="isCoopRoomCreated">
          <h2 id="coop-created-title" class="spoiler-player-dialog-title">
            Co-op room created
          </h2>
          <p class="spoiler-player-dialog-text">
            Share this link to invite others to your room:
          </p>
          <input
            class="coop-created-url"
            data-testid="coop-created-url"
            :value="createdCoopShareUrl"
            readonly
            @focus="($event.target as HTMLInputElement).select()"
          />
          <p class="spoiler-player-dialog-text coop-created-hint">
            You can copy it again anytime with the
            <strong>COPY COOP URL</strong> button.
          </p>
          <div class="spoiler-player-dialog-actions">
            <button
              type="button"
              class="history-button"
              data-testid="coop-created-copy-button"
              @click="copyCreatedCoopUrl"
            >
              {{ isCoopShareUrlCopied ? 'Copied!' : 'Copy URL' }}
            </button>
            <button
              type="button"
              class="history-button"
              data-testid="coop-created-done-button"
              @click="closeCoopCreated"
            >
              Done
            </button>
          </div>
        </template>
        <template v-else>
          <h2 id="coop-created-title" class="spoiler-player-dialog-title">
            Creating your room…
          </h2>
          <div class="coop-created-creating" data-testid="coop-created-spinner">
            <FairyLoader
              size="sm"
              label="Setting up your room…"
              subtitle="Waiting for the server to accept the connection."
            />
          </div>
          <div class="spoiler-player-dialog-actions">
            <button
              type="button"
              class="history-button"
              data-testid="coop-created-cancel-button"
              @click="cancelCoopCreation"
            >
              Cancel
            </button>
          </div>
        </template>
      </div>
    </div>
    <div
      v-if="isCoopLeaveConfirmOpen"
      class="spoiler-player-dialog-overlay"
      data-testid="coop-leave-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-leave-confirm-title"
      aria-describedby="coop-leave-confirm-description"
    >
      <div class="spoiler-player-dialog" data-testid="coop-leave-confirm-modal">
        <h2 id="coop-leave-confirm-title" class="spoiler-player-dialog-title">
          Leave the co-op room?
        </h2>
        <p
          id="coop-leave-confirm-description"
          class="spoiler-player-dialog-text"
        >
          You'll stop syncing with the room and go back to tracking solo. Your
          current progress stays exactly as it is. Others can keep playing in
          the room without you.
        </p>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            data-testid="coop-leave-confirm-cancel-button"
            @click="cancelCoopLeave"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            data-testid="coop-leave-confirm-apply-button"
            @click="confirmCoopLeave"
          >
            Leave room
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="mutexNoticeReason !== null"
      class="spoiler-player-dialog-overlay"
      data-testid="coop-auto-mutex-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-auto-mutex-title"
      aria-describedby="coop-auto-mutex-description"
    >
      <div class="spoiler-player-dialog" data-testid="coop-auto-mutex-modal">
        <h2 id="coop-auto-mutex-title" class="spoiler-player-dialog-title">
          Auto and co-op can't both be on
        </h2>
        <p id="coop-auto-mutex-description" class="spoiler-player-dialog-text">
          {{ mutexNoticeMessage }}
        </p>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            data-testid="coop-auto-mutex-dismiss-button"
            @click="closeMutexNotice"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="isJoiningCoopRoom && !isCoopJoinConfirmOpen"
      class="applying-overlay"
      data-testid="joining-coop-overlay"
      role="status"
      aria-live="polite"
    >
      <div class="applying-overlay__content joining-coop-overlay__content">
        <FairyLoader
          size="sm"
          label="Joining co-op room..."
          :subtitle="coopRoomCode ? `Room ${coopRoomCode}` : ''"
        />
        <button
          type="button"
          class="history-button"
          data-testid="joining-coop-cancel-button"
          @click="cancelCoopJoin"
        >
          Cancel
        </button>
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
      v-if="isAutotrackerSpoilerRequiredDialogOpen"
      class="spoiler-player-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="autotracker-spoiler-required-title"
    >
      <div class="spoiler-player-dialog">
        <h2
          id="autotracker-spoiler-required-title"
          class="spoiler-player-dialog-title"
        >
          Spoiler log required
        </h2>
        <p class="spoiler-player-dialog-text">
          Autotracking only works with a spoiler log. Upload a spoiler log to
          start autotracking.
        </p>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            @click="cancelAutotrackerSpoilerRequiredDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings"
            @click="openAutotrackerSpoilerFileDialog"
          >
            Upload Spoiler Log
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="isAutotrackerSpoilerVersionWarningDialogOpen"
      class="spoiler-player-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="autotracker-spoiler-version-warning-title"
      data-testid="autotracker-spoiler-version-warning-dialog"
    >
      <div class="spoiler-player-dialog spoiler-settings-warning-dialog">
        <h2
          id="autotracker-spoiler-version-warning-title"
          class="spoiler-player-dialog-title"
        >
          Unsupported spoiler log version
        </h2>
        <p class="spoiler-player-dialog-text">
          {{ autotrackerSpoilerVersionWarningMessage }}
        </p>
        <div class="spoiler-player-dialog-actions">
          <button
            type="button"
            class="history-button"
            data-testid="autotracker-spoiler-version-warning-cancel"
            @click="cancelAutotrackerSpoilerVersionWarningDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings"
            data-testid="autotracker-spoiler-version-warning-upload"
            @click="openAutotrackerSpoilerFileDialog"
          >
            Upload New Spoiler Log
          </button>
        </div>
      </div>
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
          Choose which player this tracker should be filled for.
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
          v-if="spoilerAutotrackerWarningMessage"
          class="spoiler-player-dialog-text"
        >
          {{ spoilerAutotrackerWarningMessage }}
        </p>
        <p
          v-if="spoilerLegacyWarningMessage"
          class="spoiler-player-dialog-text spoiler-legacy-warning"
        >
          {{ spoilerLegacyWarningMessage }}
        </p>
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
    <div
      v-if="autotrackerToastMessages.length > 0"
      class="autotracker-toast-stack"
      role="status"
      aria-live="polite"
    >
      <div
        v-for="toast in autotrackerToastMessages"
        :key="toast.id"
        class="autotracker-toast"
        :class="`autotracker-toast--${toast.kind}`"
      >
        {{ toast.message }}
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
        <div class="history-controls">
          <div class="history-actions">
            <button
              type="button"
              class="history-button"
              :disabled="isApplyingSettings || !canUndoWithCoop"
              :title="
                isCoopActive
                  ? 'Undo is disabled while coop is active'
                  : undefined
              "
              @click="undo"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              class="history-button"
              :disabled="isApplyingSettings || !canRedoWithCoop"
              :title="
                isCoopActive
                  ? 'Redo is disabled while coop is active'
                  : undefined
              "
              @click="redo"
            >
              Redo ↷
            </button>
            <Teleport to="#auto-header-slot">
              <AutotrackerToggle
                :status="autotracker.status.value"
                :enabled="autotracker.enabled.value"
                :last-error="autotracker.lastError.value"
                :warning-message="autotracker.versionWarning.value"
                :coop-active="isCoopActive"
                @update:enabled="handleAutotrackerEnabledUpdate"
                @start-overwrite="startAutotrackerOverwriteMode"
                @blocked="showAutotrackerBlockedNotice"
              />
            </Teleport>
            <Teleport to="#coop-header-slot">
              <CoopPanel
                v-if="isCoopVisible"
                :autotracker-active="autotracker.enabled.value"
                @request-start="requestCoopStart"
                @request-leave="requestCoopLeave"
                @blocked="showCoopBlockedNotice"
              />
            </Teleport>
          </div>
          <label
            v-if="autotracker.enabled.value"
            class="auto-map-switch"
            data-testid="auto-map-switch"
          >
            <input
              type="checkbox"
              class="auto-map-switch-input"
              :checked="Boolean(trackerSettings?.autoMapSwitch)"
              @change="
                updateAutoMapSwitch(($event.target as HTMLInputElement).checked)
              "
            />
            <span class="auto-map-switch-label">Auto-Switch Map</span>
          </label>
          <div
            v-if="visibleAutotrackerInlineWarning"
            class="autotracker-inline-warning"
            data-testid="autotracker-inline-warning"
          >
            <button
              type="button"
              class="autotracker-inline-warning-close"
              aria-label="Dismiss autotracker warning"
              data-testid="autotracker-inline-warning-close"
              @click="dismissAutotrackerInlineWarning"
            >
              ×
            </button>
            <p class="autotracker-inline-warning-text">
              <template
                v-if="visibleAutotrackerInlineWarning.kind === 'connection'"
              >
                {{ visibleAutotrackerInlineWarning.message }}
                You can find more information about autotracking in the
                <a
                  href="#"
                  class="autotracker-inline-warning-link"
                  data-testid="autotracker-inline-warning-faq-link"
                  @click.prevent="openAutotrackerFaq"
                >
                  FAQs </a
                >.
              </template>
              <template v-else>
                {{ visibleAutotrackerInlineWarning.message }}
                Updated version for
                <a
                  class="autotracker-inline-warning-link"
                  :href="AUTOTRACKER_WINDOWS_DOWNLOAD_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Windows</a
                >
                and
                <a
                  class="autotracker-inline-warning-link"
                  :href="AUTOTRACKER_LINUX_DOWNLOAD_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Linux</a
                >. Other versions see
                <a
                  class="autotracker-inline-warning-link"
                  :href="AUTOTRACKER_RELEASES_LATEST_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Github</a
                >.
              </template>
            </p>
          </div>
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
                      <span class="map-selector-option-count">
                        <template v-if="hasAnyActiveEntrances">
                          ({{ getMapSelectorVisibleCount(mapDef) }} /
                          {{ getMapSelectorVisibleEntranceCount(mapDef) }})
                        </template>
                        <template v-else>
                          ({{ getMapSelectorVisibleCount(mapDef) }})
                        </template>
                      </span>
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

.joining-coop-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
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

.autotracker-toast-stack {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  width: min(40rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
  z-index: 12;
}

.autotracker-toast {
  width: fit-content;
  max-width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid #4b5563;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.94);
  color: #f9fafb;
  font-size: 0.82rem;
  line-height: 1.35;
  text-align: center;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
}

.autotracker-toast--item {
  border-color: rgba(34, 197, 94, 0.45);
}

.autotracker-toast--location {
  border-color: rgba(96, 165, 250, 0.45);
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

.spoiler-player-dialog-list {
  margin: 0;
  padding-left: 1.1rem;
  color: #cbd5e1;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.coop-created-url {
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #111827;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}

.coop-created-hint {
  font-size: 0.78rem;
  opacity: 0.85;
}

.coop-created-creating {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;
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
  width: 410px;
  flex: 0 0 410px;
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

.history-controls {
  margin-top: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.history-actions {
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

.autotracker-inline-warning {
  position: relative;
  padding: 0.6rem 2rem 0.6rem 0.75rem;
  border: 1px solid #8a6d1f;
  border-radius: 0.35rem;
  background: #3a2f08;
  color: #ffe08a;
}

.autotracker-inline-warning-text {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.4;
}

.autotracker-inline-warning-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 0.12em;
}

.autotracker-inline-warning-link:focus-visible {
  outline: 2px solid #fcd34d;
  outline-offset: 2px;
  border-radius: 0.12rem;
}

.autotracker-inline-warning-close {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #ffe08a;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.autotracker-inline-warning-close:hover {
  background: rgba(255, 224, 138, 0.12);
}

.autotracker-inline-warning-close:focus-visible {
  outline: 2px solid #fcd34d;
  outline-offset: 2px;
}

.auto-map-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  user-select: none;
}

.auto-map-switch-input {
  flex-shrink: 0;
  width: 0.85rem;
  height: 0.85rem;
  cursor: pointer;
  accent-color: #4fc3f7;
}

.auto-map-switch-label {
  font-size: 0.7rem;
  line-height: 1.15;
  color: #d4d4d4;
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
