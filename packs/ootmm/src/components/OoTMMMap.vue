<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import type { LocationInfo } from '@/types/tracker';
import {
  resolveDayComboOverlayImage,
  resolveDigitImage,
  resolveMasterQuestLabelImage,
  resolveMapImage,
  resolveMarkerImage,
  resolveOverlayImage,
} from '../data/maps/assets';
import OoTMMMapDevEditor from './OoTMMMapDevEditor.vue';
import {
  formatLocationDisplayName,
  stripWorldSuffix,
  useLocationCodeLookup,
} from '../composables/useLocationCodeLookup';
import {
  useDungeonEntrances,
  type DungeonEntranceEntry,
} from '../composables/useDungeonEntrances';
import { OOTMM_MAP_DEFS } from '../data/maps';
import { matchesMapSettingsVisibility } from '../utils/mapSettingsVisibility';
import type {
  MapDef,
  MapDungeonEntranceMenuDef,
  MapMarkerDef,
  MapMarkerOverlay,
  MapMarkerSettingsVisibility,
  MapPopupEntry,
  MapPopupPayload,
  MapSubmenuEntryDef,
} from '../data/maps/types';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const WHEEL_ZOOM_FACTOR = 1.1;
const MARKER_SIZE = 16;
const MARKER_PANEL_GAP = 2;
const HOVER_POPUP_CLOSE_DELAY_MS = 160;
const MAP_POPUP_WIDTH = 260;
const MAP_POPUP_HEIGHT = 230;
const SUBMENU_PANEL_WIDTH = 320;
const SUBMENU_PANEL_HEIGHT = 220;
const MASTER_QUEST_LABEL_COORDS = { x: 613, y: 70 } as const;
const MQ_DUNGEON_CODE_BY_MAP_ID: Record<string, string> = {
  oot_deku_tree: 'DT',
  oot_dodongos_cavern: 'DC',
  oot_jabu_jabu: 'JJ',
  oot_forest_temple: 'Forest',
  oot_fire_temple: 'Fire',
  oot_water_temple: 'Water',
  oot_shadow_temple: 'Shadow',
  oot_spirit_temple: 'Spirit',
  oot_bottom_of_the_well: 'BotW',
  oot_ice_cavern: 'IC',
  oot_gerudo_training_ground: 'GTG',
  oot_ganons_castle: 'Ganon',
};

type OverlayRender = {
  key: string;
  src: string;
  wide: boolean;
};

type PopupAttributeChip = OverlayRender & {
  label: string;
};

const POPUP_ATTRIBUTE_LABELS: Record<string, string> = {
  child: 'Child',
  adult: 'Adult',
  jp_only: 'JP only',
  na_only: 'NA only',
  day1: 'Day 1',
  day2: 'Day 2',
  day3: 'Day 3',
  'day1+day2': 'Days 1-2',
  'day1+day3': 'Days 1-3',
  'day2+day3': 'Days 2-3',
  night: 'Night',
  day: 'Day',
  clear_state: 'Clear state',
  cursed_state: 'Cursed state',
  broken: 'Broken',
};

type MarkerRenderState = {
  overlays: MapMarkerOverlay[];
  codeList: string[];
  allCheckIds: string[];
  reachableCheckIds: string[];
  reachableUncheckedCheckIds: string[];
  reachableUncheckedCount: number;
  checkedCount: number;
  popupEntries: MapPopupEntry[];
  topLeftOverlays: OverlayRender[];
  bottomLeftOverlays: OverlayRender[];
  topRightOverlays: OverlayRender[];
  countDigitImages: string[];
  isVisible: boolean;
};

type CheckMarkerRuntime = {
  type: 'check';
  id: string;
  markerIndex: number;
  coords: [number, number];
  image: string;
} & MarkerRenderState;

type SubmenuEntryRuntime = MarkerRenderState & {
  id: string;
  parentMarkerId: string;
  image: string;
};

type SubmenuMarkerRuntime = {
  type: 'submenu';
  id: string;
  markerIndex: number;
  coords: [number, number];
  image: string;
  overlays: MapMarkerOverlay[];
  topLeftOverlays: OverlayRender[];
  bottomLeftOverlays: OverlayRender[];
  topRightOverlays: OverlayRender[];
  countDigitImages: string[];
  entranceEntries: EntranceMenuEntryRuntime[];
  submenuMarkers: SubmenuEntryRuntime[];
  allSubmenuCodeList: string[];
  isVisible: boolean;
};

type EntranceMenuEntryRuntime = {
  key: string;
  label: string;
  game: 'oot' | 'mm';
};

type EntranceMenuMarkerRuntime = {
  type: 'entrance-menu';
  id: string;
  markerIndex: number;
  coords: [number, number];
  image: string;
  overlays: MapMarkerOverlay[];
  topLeftOverlays: OverlayRender[];
  bottomLeftOverlays: OverlayRender[];
  topRightOverlays: OverlayRender[];
  countDigitImages: string[];
  entranceEntries: EntranceMenuEntryRuntime[];
  submenuMarkers: SubmenuEntryRuntime[];
  isVisible: boolean;
};

type MarkerRuntime =
  | CheckMarkerRuntime
  | SubmenuMarkerRuntime
  | EntranceMenuMarkerRuntime;

type SubmenuEntryHostRuntime = {
  submenuMarkers: SubmenuEntryRuntime[];
};

type PopupMarkerRuntime = {
  id: string;
  image: string;
  topLeftOverlays: OverlayRender[];
  bottomLeftOverlays: OverlayRender[];
  topRightOverlays: OverlayRender[];
  checkedCount: number;
  reachableUncheckedCount: number;
  popupEntries: MapPopupEntry[];
  reachableUncheckedCheckIds: string[];
};

type MapPopupState = {
  markerId: string | null;
  hoverMarkerId: string | null;
  pinned: boolean;
  isHovered: boolean;
  layoutReady: boolean;
  position: { left: number; top: number } | null;
};

type SubmenuPopupState = {
  markerId: string | null;
  hoverMarkerId: string | null;
  pinned: boolean;
  isHovered: boolean;
  layoutReady: boolean;
  position: { left: number; top: number } | null;
};

type SubmenuPanelState = {
  markerId: string | null;
  hoverMarkerId: string | null;
  pinned: boolean;
  isHovered: boolean;
  layoutReady: boolean;
  position: { left: number; top: number } | null;
  frozenWidth: number | null;
  frozenHeight: number | null;
  frozenScale: number | null;
};

type DevDraftIssue = {
  markerIndex: number;
  message: string;
};

const props = withDefaults(
  defineProps<{
    activeMap: MapDef | null;
    reachableIds: Set<string>;
    collectedIds: Set<string>;
    visibleLocationIds?: Set<string> | null;
    allLocations?: LocationInfo[];
    allLocationsForCodeSearch?: LocationInfo[];
    settings?: Record<string, unknown> | null;
    devMode?: boolean;
    devShowUnmappedOnly?: boolean;
    devMqMarkerMode?: 'non-mq' | 'mq';
    devMarkerSelectRequest?: { markerIndex: number; nonce: number } | null;
    devMarkerHoverIndex?: number | null;
  }>(),
  {
    visibleLocationIds: null,
    allLocations: () => [],
    allLocationsForCodeSearch: () => [],
    settings: null,
    devMode: false,
    devShowUnmappedOnly: false,
    devMqMarkerMode: 'non-mq',
    devMarkerSelectRequest: null,
    devMarkerHoverIndex: null,
  },
);

const emit = defineEmits<{
  (e: 'toggle-collected', checkId: string): void;
  (e: 'mark-all-reachable', checkIds: string[]): void;
  (e: 'open-popup', markerId: string): void;
  (e: 'close-popup'): void;
  (e: 'dev-warnings-change', warnings: DevDraftIssue[]): void;
}>();

const viewportRef = ref<HTMLDivElement | null>(null);
const popupRef = ref<HTMLDivElement | null>(null);
const submenuPanelRef = ref<HTMLDivElement | null>(null);
const submenuPopupRef = ref<HTMLDivElement | null>(null);

const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const isDragging = ref(false);
const mapPopup = ref<MapPopupState>({
  markerId: null,
  hoverMarkerId: null,
  pinned: false,
  isHovered: false,
  layoutReady: false,
  position: null,
});
const submenuPanel = ref<SubmenuPanelState>({
  markerId: null,
  hoverMarkerId: null,
  pinned: false,
  isHovered: false,
  layoutReady: false,
  position: null,
  frozenWidth: null,
  frozenHeight: null,
  frozenScale: null,
});
const submenuPopup = ref<SubmenuPopupState>({
  markerId: null,
  hoverMarkerId: null,
  pinned: false,
  isHovered: false,
  layoutReady: false,
  position: null,
});

const devDraftMap = ref<MapDef | null>(null);
const devSelectedMarkerIndex = ref<number | null>(null);

const activePointers = new Map<number, { x: number; y: number }>();
let lastDragPoint: { x: number; y: number } | null = null;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let hoverPopupCloseTimer: ReturnType<typeof setTimeout> | null = null;
let submenuHoverPopupCloseTimer: ReturnType<typeof setTimeout> | null = null;
let submenuPanelCloseTimer: ReturnType<typeof setTimeout> | null = null;

const renderMapDef = computed<MapDef | null>(() =>
  props.devMode ? (devDraftMap.value ?? props.activeMap) : props.activeMap,
);
const isDevMode = computed(() => props.devMode);

function looksLikeLocationId(value: string): boolean {
  return /@\d+$/.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function markerCodeList(marker: MapMarkerDef): string[] {
  const rawCodes = marker.codes ?? '';
  const rawList = Array.isArray(rawCodes) ? rawCodes : [rawCodes];
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0);
}

function submenuEntryCodeList(marker: MapSubmenuEntryDef): string[] {
  const rawList = Array.isArray(marker.codes) ? marker.codes : [marker.codes];
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0);
}

function markerRuntimeCodeList(marker: MarkerRuntime): string {
  const direct = (marker as { codeList?: string[] }).codeList;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.join('|');
  }

  const submenu = (marker as { allSubmenuCodeList?: string[] })
    .allSubmenuCodeList;
  if (Array.isArray(submenu) && submenu.length > 0) {
    return submenu.join('|');
  }

  return '';
}

function submenuRuntimeCodeList(marker: SubmenuEntryRuntime): string {
  return Array.isArray(marker.codeList) ? marker.codeList.join('|') : '';
}

function normalizeEntranceIdList(
  value: string[] | undefined,
  markerDef: MapMarkerDef,
): string[] {
  const configured = Array.isArray(value) ? value : [];
  if (configured.length > 0) {
    return configured
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => id.length > 0);
  }

  return markerCodeList(markerDef);
}

function mergeVisibleWhen(
  parent: MapMarkerSettingsVisibility | undefined,
  child: MapMarkerSettingsVisibility | undefined,
): MapMarkerSettingsVisibility | undefined {
  if (!parent) return child;
  if (!child) return parent;
  return { and: [parent, child] };
}

function cloneSubmenuEntry(entry: MapSubmenuEntryDef): MapSubmenuEntryDef {
  return {
    image: entry.image,
    overlays: entry.overlays ? [...entry.overlays] : undefined,
    codes: Array.isArray(entry.codes) ? [...entry.codes] : entry.codes,
    visibleWhen: entry.visibleWhen,
  };
}

const ENTRANCE_SUBMENU_ENTRIES_BY_ID = (() => {
  const byId = new Map<string, MapSubmenuEntryDef[]>();

  for (const mapDef of OOTMM_MAP_DEFS) {
    for (const markerDef of mapDef.markers) {
      if (markerDef.type !== 'submenu') continue;
      if (!markerDef.entranceMenu) continue;
      if (!Array.isArray(markerDef.markers) || markerDef.markers.length === 0) {
        continue;
      }

      const entranceIds = normalizeEntranceIdList(
        markerDef.entranceMenu.entranceIds,
        markerDef,
      );
      if (entranceIds.length === 0) continue;

      const normalizedEntries = markerDef.markers.map((entry) => ({
        ...cloneSubmenuEntry(entry),
        visibleWhen: mergeVisibleWhen(markerDef.visibleWhen, entry.visibleWhen),
      }));

      for (const entranceId of entranceIds) {
        const existing = byId.get(entranceId);
        if (existing) {
          existing.push(...normalizedEntries.map(cloneSubmenuEntry));
        } else {
          byId.set(entranceId, normalizedEntries.map(cloneSubmenuEntry));
        }
      }
    }
  }

  return byId;
})();

function submenuEntriesForEntranceId(entranceId: string): MapSubmenuEntryDef[] {
  const explicit = ENTRANCE_SUBMENU_ENTRIES_BY_ID.get(entranceId);
  if (explicit && explicit.length > 0) {
    return explicit.map(cloneSubmenuEntry);
  }
  return [];
}

const { resolveCodeToCheckIds } = useLocationCodeLookup(
  computed(() =>
    props.allLocationsForCodeSearch.length > 0
      ? props.allLocationsForCodeSearch
      : props.allLocations,
  ),
  computed(() => props.reachableIds),
  computed(() => props.collectedIds),
);

const {
  activeEntrances: activeDungeonEntrances,
  filteredEntrances: filteredDungeonEntrances,
  destinationOptionsForGame,
  getSelectedDestination,
  setSelectedDestination,
} = useDungeonEntrances();

function hasResolvedLocationCode(codeList: string[]): boolean {
  return codeList.some((code) => resolveCodeToCheckIds(code).length > 0);
}

function resolveAssignedCheckIdsForCode(code: string): string[] {
  const resolved = resolveCodeToCheckIds(code);
  return resolved.length > 0
    ? resolved
    : looksLikeLocationId(code)
      ? [code]
      : [];
}

function isMqLocationId(checkId: string): boolean {
  const normalized = stripWorldSuffix(checkId).trim().toLowerCase();
  return normalized.startsWith('mq ') || normalized.startsWith('oot mq ');
}

function markerHasMqLocation(codeList: string[]): boolean {
  return codeList.some((code) =>
    resolveAssignedCheckIdsForCode(code).some((checkId) =>
      isMqLocationId(checkId),
    ),
  );
}

function toNormalizedStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );
}

function isMqSelectedForMap(mapId: string, mqSettingRaw: unknown): boolean {
  const dungeonCode = MQ_DUNGEON_CODE_BY_MAP_ID[mapId];
  if (!dungeonCode) return false;
  if (mqSettingRaw === 'all') return true;
  if (mqSettingRaw === 'none' || mqSettingRaw == null) return false;

  if (typeof mqSettingRaw !== 'object' || Array.isArray(mqSettingRaw)) {
    return false;
  }

  const mqSetting = mqSettingRaw as {
    type?: unknown;
    values?: unknown;
    set?: unknown;
    unset?: unknown;
  };
  const mode = typeof mqSetting.type === 'string' ? mqSetting.type : '';

  if (mode === 'all') return true;
  if (mode === 'none') return false;
  if (mode === 'specific') {
    return toNormalizedStringSet(mqSetting.values).has(dungeonCode);
  }
  if (mode === 'random-mixed') {
    if (toNormalizedStringSet(mqSetting.set).has(dungeonCode)) return true;
    if (toNormalizedStringSet(mqSetting.unset).has(dungeonCode)) return false;
  }
  return false;
}

const devUnmappedCheckMarkerIndices = computed(() => {
  const indices = new Set<number>();
  const mapDef = props.activeMap;
  if (!mapDef) return indices;

  mapDef.markers.forEach((marker, markerIndex) => {
    if (marker.type === 'submenu') return;
    if (!hasResolvedLocationCode(markerCodeList(marker))) {
      indices.add(markerIndex);
    }
  });

  return indices;
});

const devMqCheckMarkerIndices = computed(() => {
  const indices = new Set<number>();
  const mapDef = props.activeMap;
  if (!mapDef) return indices;

  mapDef.markers.forEach((marker, markerIndex) => {
    if (marker.type === 'submenu') return;
    if (markerHasMqLocation(markerCodeList(marker))) {
      indices.add(markerIndex);
    }
  });

  return indices;
});

const devUnmappedSubmenuIndicesByMarker = computed(() => {
  const byMarker = new Map<number, Set<number>>();
  const mapDef = props.activeMap;
  if (!mapDef) return byMarker;

  mapDef.markers.forEach((marker, markerIndex) => {
    if (marker.type !== 'submenu') return;
    const submenuIndices = new Set<number>();
    (marker.markers ?? []).forEach((submenuEntry, submenuIndex) => {
      if (!hasResolvedLocationCode(submenuEntryCodeList(submenuEntry))) {
        submenuIndices.add(submenuIndex);
      }
    });
    if (submenuIndices.size > 0) {
      byMarker.set(markerIndex, submenuIndices);
    }
  });

  return byMarker;
});

const devMqSubmenuIndicesByMarker = computed(() => {
  const byMarker = new Map<number, Set<number>>();
  const mapDef = props.activeMap;
  if (!mapDef) return byMarker;

  mapDef.markers.forEach((marker, markerIndex) => {
    if (marker.type !== 'submenu') return;
    const submenuIndices = new Set<number>();
    (marker.markers ?? []).forEach((submenuEntry, submenuIndex) => {
      if (markerHasMqLocation(submenuEntryCodeList(submenuEntry))) {
        submenuIndices.add(submenuIndex);
      }
    });
    if (submenuIndices.size > 0) {
      byMarker.set(markerIndex, submenuIndices);
    }
  });

  return byMarker;
});

function syncPointerState(): void {
  if (activePointers.size < 2) {
    pinchStartDistance = 0;
  }

  if (activePointers.size === 1) {
    const [remaining] = Array.from(activePointers.values());
    isDragging.value = true;
    lastDragPoint = { x: remaining.x, y: remaining.y };
    return;
  }

  isDragging.value = false;
  lastDragPoint = null;

  if (activePointers.size >= 2) {
    beginPinch();
  }
}

function clampPanForScale(
  nextScale: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const mapDef = renderMapDef.value;
  const viewport = viewportRef.value;
  if (!mapDef || !viewport) {
    return { x, y };
  }

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  const scaledWidth = mapDef.width * nextScale;
  const scaledHeight = mapDef.height * nextScale;

  const nextX =
    scaledWidth <= viewportWidth
      ? (viewportWidth - scaledWidth) / 2
      : clamp(x, viewportWidth - scaledWidth, 0);
  const nextY =
    scaledHeight <= viewportHeight
      ? (viewportHeight - scaledHeight) / 2
      : clamp(y, viewportHeight - scaledHeight, 0);

  return { x: nextX, y: nextY };
}

function fitMapToViewport(): void {
  const mapDef = renderMapDef.value;
  const viewport = viewportRef.value;
  if (!mapDef || !viewport) {
    return;
  }

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return;
  }

  const containScale = Math.min(
    viewportWidth / mapDef.width,
    viewportHeight / mapDef.height,
  );
  const nextScale = clamp(containScale, MIN_SCALE, MAX_SCALE);
  const centeredX = (viewportWidth - mapDef.width * nextScale) / 2;
  const centeredY = (viewportHeight - mapDef.height * nextScale) / 2;
  const bounded = clampPanForScale(nextScale, centeredX, centeredY);
  scale.value = nextScale;
  panX.value = bounded.x;
  panY.value = bounded.y;
}

function applyScaleAtClientPoint(
  nextScaleRaw: number,
  clientX: number,
  clientY: number,
): void {
  const viewport = viewportRef.value;
  const mapDef = renderMapDef.value;
  if (!viewport || !mapDef) {
    return;
  }

  const nextScale = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE);
  const rect = viewport.getBoundingClientRect();
  const anchorX = clientX - rect.left;
  const anchorY = clientY - rect.top;

  const mapX = (anchorX - panX.value) / scale.value;
  const mapY = (anchorY - panY.value) / scale.value;
  const projectedX = anchorX - mapX * nextScale;
  const projectedY = anchorY - mapY * nextScale;
  const bounded = clampPanForScale(nextScale, projectedX, projectedY);

  scale.value = nextScale;
  panX.value = bounded.x;
  panY.value = bounded.y;
}

function beginPinch(): void {
  const pointers = Array.from(activePointers.values());
  if (pointers.length < 2) {
    pinchStartDistance = 0;
    return;
  }
  const [first, second] = pointers;
  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  if (distance <= 0) {
    pinchStartDistance = 0;
    return;
  }
  pinchStartDistance = distance;
  pinchStartScale = scale.value;
}

function buildTopLeftOverlays(overlays: MapMarkerOverlay[]): OverlayRender[] {
  const result: OverlayRender[] = [];
  const has = new Set(overlays);

  for (const single of ['child', 'adult', 'jp_only', 'na_only'] as const) {
    if (!has.has(single)) continue;
    result.push({
      key: single,
      src: resolveOverlayImage(single),
      wide: single === 'jp_only' || single === 'na_only',
    });
  }

  const dayOverlays = (['day1', 'day2', 'day3'] as const).filter((day) =>
    has.has(day),
  );
  if (dayOverlays.length === 1) {
    const onlyDay = dayOverlays[0];
    result.push({
      key: onlyDay,
      src: resolveOverlayImage(onlyDay),
      wide: false,
    });
  } else if (dayOverlays.length === 2) {
    const combo = resolveDayComboOverlayImage(dayOverlays[0], dayOverlays[1]);
    if (combo) {
      result.push({
        key: dayOverlays.join('+'),
        src: combo,
        wide: true,
      });
    }
  }

  return result;
}

function buildBottomLeftOverlays(
  overlays: MapMarkerOverlay[],
): OverlayRender[] {
  const result: OverlayRender[] = [];
  const has = new Set(overlays);
  for (const item of ['night', 'day'] as const) {
    if (!has.has(item)) continue;
    result.push({
      key: item,
      src: resolveOverlayImage(item),
      wide: false,
    });
  }
  return result;
}

function buildTopRightOverlays(overlays: MapMarkerOverlay[]): OverlayRender[] {
  const result: OverlayRender[] = [];
  const has = new Set(overlays);
  for (const item of ['broken', 'clear_state', 'cursed_state'] as const) {
    if (!has.has(item)) continue;
    result.push({
      key: item,
      src: resolveOverlayImage(item),
      wide: false,
    });
  }
  return result;
}

function popupAttributeLabel(key: string): string {
  const mapped = POPUP_ATTRIBUTE_LABELS[key];
  if (mapped) return mapped;
  return key.replace(/_/g, ' ');
}

function buildPopupAttributeChips(
  topLeftOverlays: OverlayRender[],
  bottomLeftOverlays: OverlayRender[],
  topRightOverlays: OverlayRender[],
): PopupAttributeChip[] {
  return [...topLeftOverlays, ...bottomLeftOverlays, ...topRightOverlays].map(
    (overlay) => ({
      ...overlay,
      label: popupAttributeLabel(overlay.key),
    }),
  );
}

function buildMarkerRenderState(
  markerId: string,
  codeList: string[],
  overlays: MapMarkerOverlay[],
  countUsesDigits: boolean,
  visibleWhen: MapMarkerDef['visibleWhen'] | MapSubmenuEntryDef['visibleWhen'],
): MarkerRenderState {
  const popupEntries: MapPopupEntry[] = [];
  const resolvedCheckIds = new Set<string>();

  codeList.forEach((code, codeIndex) => {
    const resolved = resolveCodeToCheckIds(code);
    const candidateIds =
      resolved.length > 0 ? resolved : looksLikeLocationId(code) ? [code] : [];

    if (candidateIds.length === 0) {
      popupEntries.push({
        id: `${markerId}:${codeIndex}:missing`,
        code,
        checkId: null,
        isReachable: false,
        isChecked: false,
      });
      return;
    }

    candidateIds.forEach((checkId, candidateIndex) => {
      resolvedCheckIds.add(checkId);
      popupEntries.push({
        id: `${markerId}:${codeIndex}:${candidateIndex}`,
        code,
        checkId,
        isReachable: props.reachableIds.has(checkId),
        isChecked: props.collectedIds.has(checkId),
      });
    });
  });

  const allCheckIdsRaw = Array.from(resolvedCheckIds);
  const allCheckIds =
    props.devMode || !props.visibleLocationIds
      ? allCheckIdsRaw
      : allCheckIdsRaw.filter((checkId) =>
          props.visibleLocationIds?.has(checkId),
        );
  const popupEntriesForDisplay =
    props.devMode || !props.visibleLocationIds
      ? popupEntries
      : popupEntries.filter(
          (entry) =>
            entry.checkId && props.visibleLocationIds?.has(entry.checkId),
        );
  const reachableCheckIds = allCheckIds.filter((checkId) =>
    props.reachableIds.has(checkId),
  );
  const checkedCount = allCheckIds.filter((checkId) =>
    props.collectedIds.has(checkId),
  ).length;
  const reachableUncheckedCheckIds = allCheckIds.filter(
    (checkId) =>
      props.reachableIds.has(checkId) && !props.collectedIds.has(checkId),
  );
  const reachableUncheckedCount = reachableUncheckedCheckIds.length;
  const filteredCount = allCheckIds.length;
  const countDigitImages =
    countUsesDigits && filteredCount > 1
      ? String(filteredCount)
          .split('')
          .map((digit) => resolveDigitImage(digit))
      : [];
  const settingsVisible = matchesMapSettingsVisibility(
    visibleWhen,
    props.settings,
  );

  return {
    overlays,
    codeList,
    allCheckIds,
    reachableCheckIds,
    reachableUncheckedCheckIds,
    reachableUncheckedCount,
    checkedCount,
    popupEntries: popupEntriesForDisplay,
    topLeftOverlays: buildTopLeftOverlays(overlays),
    bottomLeftOverlays: buildBottomLeftOverlays(overlays),
    topRightOverlays: buildTopRightOverlays(overlays),
    countDigitImages,
    isVisible: props.devMode ? true : settingsVisible && allCheckIds.length > 0,
  };
}

function markerPopupPayload(marker: PopupMarkerRuntime): MapPopupPayload {
  const title =
    marker.popupEntries.length === 1
      ? formatLocationDisplayName(marker.popupEntries[0].code)
      : `${marker.popupEntries.length} checks`;
  const uncollectedCheckIds = marker.popupEntries
    .filter((entry) => entry.checkId && !entry.isChecked)
    .map((entry) => entry.checkId as string);

  return {
    markerId: marker.id,
    title,
    entries: marker.popupEntries,
    canMarkAll: uncollectedCheckIds.length > 0,
    markAllAffectsReachableOnly: false,
  };
}

function entranceDestinationLabel(entry: {
  label: string;
  game: 'oot' | 'mm';
}): string {
  return `${entry.label}${entry.game === 'mm' ? ' (MM)' : ' (OoT)'}`;
}

function resolveEntranceMenuIds(
  markerDef: MapMarkerDef,
  menuDef: MapDungeonEntranceMenuDef,
): string[] {
  return normalizeEntranceIdList(menuDef.entranceIds, markerDef);
}

function toEntranceMenuEntry(
  entry: DungeonEntranceEntry,
): EntranceMenuEntryRuntime {
  return {
    key: entry.key,
    label: entry.label,
    game: entry.game,
  };
}

function resolveMappedDestinationEntranceId(
  sourceEntranceId: string,
  activeEntranceById: Map<string, DungeonEntranceEntry>,
): string | null {
  if (!activeEntranceById.has(sourceEntranceId)) {
    return sourceEntranceId;
  }

  const selectedDestination = getSelectedDestination(sourceEntranceId).trim();
  return selectedDestination.length > 0 ? selectedDestination : null;
}

function resolveBoundSubmenuEntryDefs(
  markerEntranceIds: string[],
  activeEntranceById: Map<string, DungeonEntranceEntry>,
): MapSubmenuEntryDef[] {
  return markerEntranceIds.flatMap((sourceEntranceId) => {
    const mappedDestination = resolveMappedDestinationEntranceId(
      sourceEntranceId,
      activeEntranceById,
    );
    if (!mappedDestination) {
      return [];
    }
    return submenuEntriesForEntranceId(mappedDestination);
  });
}

function buildSubmenuRuntimeEntries(
  parentMarkerId: string,
  submenuEntryDefs: MapSubmenuEntryDef[],
): SubmenuEntryRuntime[] {
  return submenuEntryDefs.map((submenuMarkerDef, submenuIndex) => {
    const submenuMarkerId = `${parentMarkerId}:submenu:${submenuIndex}`;
    const codeList = submenuEntryCodeList(submenuMarkerDef);
    const submenuOverlays = submenuMarkerDef.overlays ?? [];
    const state = buildMarkerRenderState(
      submenuMarkerId,
      codeList,
      submenuOverlays,
      Array.isArray(submenuMarkerDef.codes),
      submenuMarkerDef.visibleWhen,
    );
    return {
      ...state,
      id: submenuMarkerId,
      parentMarkerId,
      image: submenuMarkerDef.image,
    };
  });
}

const markerViewModels = computed<MarkerRuntime[]>(() => {
  const mapDef = renderMapDef.value;
  if (!mapDef) {
    return [];
  }
  const isDevUnmappedFilterActive = props.devMode && props.devShowUnmappedOnly;
  const showMqMarkersOnly = props.devMode && props.devMqMarkerMode === 'mq';

  return mapDef.markers.map((markerDef, markerIndex) => {
    const markerId = `${mapDef.id}:${markerIndex}`;
    const overlays = markerDef.overlays ?? [];
    const markerType =
      markerDef.type === 'submenu'
        ? 'submenu'
        : markerDef.type === 'entrance-menu'
          ? 'entrance-menu'
          : 'check';

    if (markerType === 'entrance-menu') {
      const menuDef = markerDef.entranceMenu;
      const entranceIds = menuDef
        ? resolveEntranceMenuIds(markerDef, menuDef)
        : markerCodeList(markerDef);
      const activeById = new Map(
        activeDungeonEntrances.value.map((entry) => [entry.key, entry]),
      );
      const filteredById = new Map(
        filteredDungeonEntrances.value.map((entry) => [entry.key, entry]),
      );
      const activeEntries = entranceIds
        .map((id) => activeById.get(id))
        .filter((entry): entry is DungeonEntranceEntry => Boolean(entry));
      const visibleEntries = entranceIds
        .map((id) => filteredById.get(id))
        .filter((entry): entry is DungeonEntranceEntry => Boolean(entry))
        .map(toEntranceMenuEntry);
      const submenuMarkersRaw =
        !props.devMode && entranceIds.length > 0
          ? resolveBoundSubmenuEntryDefs(entranceIds, activeById)
          : [];
      const submenuMarkers = buildSubmenuRuntimeEntries(
        markerId,
        submenuMarkersRaw,
      ).filter((marker) => marker.isVisible);
      const settingsVisible = matchesMapSettingsVisibility(
        markerDef.visibleWhen,
        props.settings,
      );

      return {
        type: 'entrance-menu',
        id: markerId,
        markerIndex,
        coords: markerDef.coords,
        image: markerDef.image,
        overlays,
        topLeftOverlays: buildTopLeftOverlays(overlays),
        bottomLeftOverlays: buildBottomLeftOverlays(overlays),
        topRightOverlays: buildTopRightOverlays(overlays),
        countDigitImages:
          visibleEntries.length > 1
            ? String(visibleEntries.length)
                .split('')
                .map((digit) => resolveDigitImage(digit))
            : [],
        entranceEntries: visibleEntries,
        submenuMarkers,
        isVisible:
          settingsVisible &&
          activeEntries.length > 0 &&
          (visibleEntries.length > 0 || submenuMarkers.length > 0),
      };
    }

    if (markerType === 'submenu') {
      const submenuSourceEntranceIds = markerDef.entranceMenu
        ? resolveEntranceMenuIds(markerDef, markerDef.entranceMenu)
        : [];
      const hasEntranceBinding = submenuSourceEntranceIds.length > 0;
      const activeEntranceById = new Map(
        activeDungeonEntrances.value.map((entry) => [entry.key, entry]),
      );
      const filteredEntranceById = new Map(
        filteredDungeonEntrances.value.map((entry) => [entry.key, entry]),
      );
      const activeSubmenuEntrances = submenuSourceEntranceIds
        .map((entranceId) => activeEntranceById.get(entranceId))
        .filter((entry): entry is DungeonEntranceEntry => Boolean(entry));
      const visibleSubmenuEntrances = submenuSourceEntranceIds
        .map((entranceId) => filteredEntranceById.get(entranceId))
        .filter((entry): entry is DungeonEntranceEntry => Boolean(entry));
      const staticSubmenuMarkersRaw = markerDef.markers ?? [];
      const boundSubmenuMarkersRaw =
        !props.devMode &&
        hasEntranceBinding &&
        submenuSourceEntranceIds.length > 0
          ? resolveBoundSubmenuEntryDefs(
              submenuSourceEntranceIds,
              activeEntranceById,
            )
          : [];
      const submenuMarkersRaw = props.devMode
        ? staticSubmenuMarkersRaw
        : hasEntranceBinding
          ? boundSubmenuMarkersRaw
          : staticSubmenuMarkersRaw;
      const submenuMarkers = buildSubmenuRuntimeEntries(
        markerId,
        submenuMarkersRaw,
      );
      const unresolvedSubmenuIndices = isDevUnmappedFilterActive
        ? devUnmappedSubmenuIndicesByMarker.value.get(markerIndex)
        : null;
      const mqSubmenuIndices =
        devMqSubmenuIndicesByMarker.value.get(markerIndex);
      const visibleSubmenuMarkers = props.devMode
        ? submenuMarkers.filter((_marker, submenuIndex) => {
            const matchesUnmappedFilter =
              !isDevUnmappedFilterActive ||
              Boolean(unresolvedSubmenuIndices?.has(submenuIndex));
            const isMqMarker = Boolean(mqSubmenuIndices?.has(submenuIndex));
            const matchesMqFilter = showMqMarkersOnly
              ? isMqMarker
              : !isMqMarker;
            return matchesUnmappedFilter && matchesMqFilter;
          })
        : submenuMarkers.filter((marker) => marker.isVisible);
      const visibleSubmenuCheckIds = new Set<string>();
      visibleSubmenuMarkers.forEach((marker) => {
        marker.allCheckIds.forEach((checkId) =>
          visibleSubmenuCheckIds.add(checkId),
        );
      });
      const countDigitImages =
        visibleSubmenuCheckIds.size > 1
          ? String(visibleSubmenuCheckIds.size)
              .split('')
              .map((digit) => resolveDigitImage(digit))
          : [];
      const settingsVisible = matchesMapSettingsVisibility(
        markerDef.visibleWhen,
        props.settings,
      );
      const hasVisibleChecks = visibleSubmenuMarkers.length > 0;
      const hasVisibleEntrances =
        submenuSourceEntranceIds.length === 0
          ? false
          : activeSubmenuEntrances.length === 0
            ? false
            : visibleSubmenuEntrances.length > 0;

      return {
        type: 'submenu',
        id: markerId,
        markerIndex,
        coords: markerDef.coords,
        image: markerDef.image,
        overlays,
        topLeftOverlays: buildTopLeftOverlays(overlays),
        bottomLeftOverlays: buildBottomLeftOverlays(overlays),
        topRightOverlays: buildTopRightOverlays(overlays),
        countDigitImages,
        entranceEntries: visibleSubmenuEntrances.map(toEntranceMenuEntry),
        submenuMarkers: visibleSubmenuMarkers,
        allSubmenuCodeList: visibleSubmenuMarkers.flatMap(
          (marker) => marker.codeList,
        ),
        isVisible: settingsVisible && (hasVisibleChecks || hasVisibleEntrances),
      };
    }

    const codeList = markerCodeList(markerDef);
    const state = buildMarkerRenderState(
      markerId,
      codeList,
      overlays,
      Array.isArray(markerDef.codes),
      markerDef.visibleWhen,
    );
    const isDevVisible =
      (!isDevUnmappedFilterActive ||
        devUnmappedCheckMarkerIndices.value.has(markerIndex)) &&
      (showMqMarkersOnly
        ? devMqCheckMarkerIndices.value.has(markerIndex)
        : !devMqCheckMarkerIndices.value.has(markerIndex));
    return {
      ...state,
      type: 'check',
      id: markerId,
      markerIndex,
      coords: markerDef.coords,
      image: markerDef.image,
      isVisible: props.devMode ? isDevVisible : state.isVisible,
    };
  });
});

const markerById = computed(
  () => new Map(markerViewModels.value.map((marker) => [marker.id, marker])),
);
const visibleMarkers = computed(() =>
  markerViewModels.value.filter((marker) => marker.isVisible),
);

const popupMarker = computed<CheckMarkerRuntime | null>(() => {
  if (!mapPopup.value.markerId) return null;
  const marker = markerById.value.get(mapPopup.value.markerId);
  return marker && marker.type === 'check' ? marker : null;
});

const activePanelMarker = computed<
  SubmenuMarkerRuntime | EntranceMenuMarkerRuntime | null
>(() => {
  if (!submenuPanel.value.markerId) return null;
  const marker = markerById.value.get(submenuPanel.value.markerId);
  return marker &&
    (marker.type === 'submenu' || marker.type === 'entrance-menu')
    ? marker
    : null;
});

const activeSubmenuEntryHost = computed<SubmenuEntryHostRuntime | null>(() => {
  const marker = activePanelMarker.value;
  if (!marker) return null;
  return marker.submenuMarkers.length > 0 ? marker : null;
});

const activeSubmenuPopupMarker = computed<SubmenuEntryRuntime | null>(() => {
  if (!submenuPopup.value.markerId) return null;
  const submenu = activeSubmenuEntryHost.value;
  if (!submenu) return null;
  return (
    submenu.submenuMarkers.find(
      (marker) => marker.id === submenuPopup.value.markerId,
    ) ?? null
  );
});

const activePopup = computed<MapPopupPayload | null>(() => {
  const marker = popupMarker.value;
  if (!marker || props.devMode) return null;
  return markerPopupPayload(marker);
});

const activeSubmenuPopup = computed<MapPopupPayload | null>(() => {
  const marker = activeSubmenuPopupMarker.value;
  if (!marker || props.devMode) return null;
  return markerPopupPayload(marker);
});

const activePopupAttributeChips = computed<PopupAttributeChip[]>(() => {
  const marker = popupMarker.value;
  if (!marker) return [];
  return buildPopupAttributeChips(
    marker.topLeftOverlays,
    marker.bottomLeftOverlays,
    marker.topRightOverlays,
  );
});

const activeSubmenuPopupAttributeChips = computed<PopupAttributeChip[]>(() => {
  const marker = activeSubmenuPopupMarker.value;
  if (!marker) return [];
  return buildPopupAttributeChips(
    marker.topLeftOverlays,
    marker.bottomLeftOverlays,
    marker.topRightOverlays,
  );
});

const sceneStyle = computed(() => {
  const mapDef = renderMapDef.value;
  if (!mapDef) return {};
  return {
    width: `${mapDef.width}px`,
    height: `${mapDef.height}px`,
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  };
});

const showMasterQuestLabel = computed(() => {
  const mapDef = renderMapDef.value;
  if (!mapDef) return false;
  return isMqSelectedForMap(mapDef.id, props.settings?.mqDungeons);
});

const masterQuestLabelStyle = computed<Record<string, string>>(() => ({
  left: `${MASTER_QUEST_LABEL_COORDS.x}px`,
  top: `${MASTER_QUEST_LABEL_COORDS.y}px`,
}));

function markerStyle(marker: MarkerRuntime): Record<string, string> {
  return {
    left: `${marker.coords[0]}px`,
    top: `${marker.coords[1]}px`,
  };
}

function panelSize(
  element: HTMLElement | null,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  return {
    width: element?.offsetWidth ?? fallbackWidth,
    height: element?.offsetHeight ?? fallbackHeight,
  };
}

function scaledMarkerPanelGap(): number {
  return MARKER_PANEL_GAP * scale.value;
}

function calculateAnchoredPanelPosition(
  markerCoords: [number, number],
  panelElement: HTMLElement | null,
  fallbackWidth: number,
  fallbackHeight: number,
): { left: number; top: number } | null {
  const viewport = viewportRef.value;
  if (!viewport) return null;

  const { width: popupWidth, height: popupHeight } = panelSize(
    panelElement,
    fallbackWidth,
    fallbackHeight,
  );
  const markerX = markerCoords[0] * scale.value + panX.value;
  const markerY = markerCoords[1] * scale.value + panY.value;
  const markerHalfSize = MARKER_SIZE * scale.value * 0.5;
  const markerGap = scaledMarkerPanelGap();
  const maxX = Math.max(8, viewport.clientWidth - popupWidth - 8);
  const maxY = Math.max(8, viewport.clientHeight - popupHeight - 8);
  const rightSideLeft = markerX + markerHalfSize + markerGap;
  const leftSideLeft = markerX - markerHalfSize - popupWidth - markerGap;
  const left = leftSideLeft >= 8 ? leftSideLeft : clamp(rightSideLeft, 8, maxX);
  const top = clamp(markerY - popupHeight * 0.5, 8, maxY);

  return { left, top };
}

function calculateMapPopupPosition(): { left: number; top: number } | null {
  const marker = popupMarker.value;
  if (!marker) return null;
  return calculateAnchoredPanelPosition(
    marker.coords,
    popupRef.value,
    MAP_POPUP_WIDTH,
    MAP_POPUP_HEIGHT,
  );
}

function calculateSubmenuPanelPosition(): { left: number; top: number } | null {
  const marker = activePanelMarker.value;
  if (!marker) return null;

  const frozenScale = submenuPanel.value.frozenScale;
  const hasFrozenScale = frozenScale !== null && frozenScale > 0;
  const sizeScaleFactor = hasFrozenScale ? scale.value / frozenScale : 1;
  const predictedWidth =
    (submenuPanel.value.frozenWidth ?? SUBMENU_PANEL_WIDTH) * sizeScaleFactor;
  const predictedHeight =
    (submenuPanel.value.frozenHeight ?? SUBMENU_PANEL_HEIGHT) * sizeScaleFactor;
  const usePredictedSize =
    submenuPanel.value.frozenWidth !== null && hasFrozenScale;

  return calculateAnchoredPanelPosition(
    marker.coords,
    usePredictedSize ? null : submenuPanelRef.value,
    predictedWidth,
    predictedHeight,
  );
}

function calculateSubmenuPopupPosition(): { left: number; top: number } | null {
  const marker = activeSubmenuPopupMarker.value;
  const panel = submenuPanelRef.value;
  const viewport = viewportRef.value;
  if (!marker || !panel || !submenuPopup.value.markerId || !viewport)
    return null;

  const targetButton = panel.querySelectorAll<HTMLElement>(
    '[data-submenu-marker-id]',
  );
  const markerButton = Array.from(targetButton).find(
    (button) => button.dataset.submenuMarkerId === submenuPopup.value.markerId,
  );
  if (!markerButton) return null;

  const { width: popupWidth, height: popupHeight } = panelSize(
    submenuPopupRef.value,
    MAP_POPUP_WIDTH,
    MAP_POPUP_HEIGHT,
  );
  const viewportRect = viewport.getBoundingClientRect();
  const markerRect = markerButton.getBoundingClientRect();
  const markerCenterX =
    markerRect.left - viewportRect.left + markerRect.width / 2;
  const markerTop = markerRect.top - viewportRect.top;
  const markerBottom = markerRect.bottom - viewportRect.top;
  const maxX = Math.max(8, viewport.clientWidth - popupWidth - 8);
  const maxY = Math.max(8, viewport.clientHeight - popupHeight - 8);
  const centeredLeft = markerCenterX - popupWidth * 0.5;
  const markerGap = scaledMarkerPanelGap();
  const belowTop = markerBottom + markerGap;
  const aboveTop = markerTop - popupHeight - markerGap;
  const top = belowTop <= maxY ? belowTop : clamp(aboveTop, 8, maxY);
  const left = clamp(centeredLeft, 8, maxX);
  return { left, top };
}

function updateMapPopupPosition(): void {
  mapPopup.value.position = calculateMapPopupPosition();
}

function updateSubmenuPanelPosition(): void {
  submenuPanel.value.position = calculateSubmenuPanelPosition();
}

function updateSubmenuPopupPosition(): void {
  submenuPopup.value.position = calculateSubmenuPopupPosition();
}

function popupStyle(): Record<string, string> {
  if (!mapPopup.value.position) {
    return {
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  }

  return {
    left: `${mapPopup.value.position.left}px`,
    top: `${mapPopup.value.position.top}px`,
    visibility: mapPopup.value.layoutReady ? 'visible' : 'hidden',
    pointerEvents: mapPopup.value.layoutReady ? 'auto' : 'none',
  };
}

function submenuPanelStyle(): Record<string, string> {
  const markerSize = MARKER_SIZE * scale.value;
  const overlaySize = 8 * scale.value;
  const overlayWideSize = 12 * scale.value;
  const digitWidth = 6 * scale.value;
  const digitHeight = 8 * scale.value;
  const cornerOffset = -2 * scale.value;
  const cornerGap = Math.max(1, scale.value);

  const sizeScaleFactor =
    submenuPanel.value.frozenScale && submenuPanel.value.frozenScale > 0
      ? scale.value / submenuPanel.value.frozenScale
      : 1;

  if (!submenuPanel.value.position) {
    return {
      visibility: 'hidden',
      pointerEvents: 'none',
      '--submenu-marker-size': `${markerSize}px`,
      '--submenu-overlay-size': `${overlaySize}px`,
      '--submenu-overlay-wide-size': `${overlayWideSize}px`,
      '--submenu-digit-width': `${digitWidth}px`,
      '--submenu-digit-height': `${digitHeight}px`,
      '--submenu-corner-offset': `${cornerOffset}px`,
      '--submenu-corner-gap': `${cornerGap}px`,
      ...(submenuPanel.value.frozenWidth !== null
        ? { width: `${submenuPanel.value.frozenWidth * sizeScaleFactor}px` }
        : {}),
      ...(submenuPanel.value.frozenHeight !== null
        ? { height: `${submenuPanel.value.frozenHeight * sizeScaleFactor}px` }
        : {}),
    };
  }

  return {
    left: `${submenuPanel.value.position.left}px`,
    top: `${submenuPanel.value.position.top}px`,
    visibility: submenuPanel.value.layoutReady ? 'visible' : 'hidden',
    pointerEvents: submenuPanel.value.layoutReady ? 'auto' : 'none',
    '--submenu-marker-size': `${markerSize}px`,
    '--submenu-overlay-size': `${overlaySize}px`,
    '--submenu-overlay-wide-size': `${overlayWideSize}px`,
    '--submenu-digit-width': `${digitWidth}px`,
    '--submenu-digit-height': `${digitHeight}px`,
    '--submenu-corner-offset': `${cornerOffset}px`,
    '--submenu-corner-gap': `${cornerGap}px`,
    ...(submenuPanel.value.frozenWidth !== null
      ? { width: `${submenuPanel.value.frozenWidth * sizeScaleFactor}px` }
      : {}),
    ...(submenuPanel.value.frozenHeight !== null
      ? { height: `${submenuPanel.value.frozenHeight * sizeScaleFactor}px` }
      : {}),
  };
}

function submenuPopupStyle(): Record<string, string> {
  if (!submenuPopup.value.position) {
    return {
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  }

  return {
    left: `${submenuPopup.value.position.left}px`,
    top: `${submenuPopup.value.position.top}px`,
    visibility: submenuPopup.value.layoutReady ? 'visible' : 'hidden',
    pointerEvents: submenuPopup.value.layoutReady ? 'auto' : 'none',
  };
}

function clearHoverPopupCloseTimer(): void {
  if (hoverPopupCloseTimer === null) return;
  clearTimeout(hoverPopupCloseTimer);
  hoverPopupCloseTimer = null;
}

function scheduleHoverPopupClose(): void {
  if (mapPopup.value.pinned || mapPopup.value.isHovered) return;
  clearHoverPopupCloseTimer();
  hoverPopupCloseTimer = setTimeout(() => {
    if (
      mapPopup.value.pinned ||
      mapPopup.value.isHovered ||
      mapPopup.value.hoverMarkerId
    )
      return;
    closePopup();
  }, HOVER_POPUP_CLOSE_DELAY_MS);
}

function openPopup(markerId: string, options?: { pinned?: boolean }): void {
  const shouldPin = Boolean(options?.pinned);
  if (shouldPin) {
    mapPopup.value.pinned = true;
  }
  clearHoverPopupCloseTimer();
  if (mapPopup.value.markerId === markerId) return;
  mapPopup.value.markerId = markerId;
  mapPopup.value.layoutReady = false;
  emit('open-popup', markerId);
}

function closePopup(): void {
  clearHoverPopupCloseTimer();
  const hadPopup = Boolean(mapPopup.value.markerId);
  mapPopup.value.hoverMarkerId = null;
  mapPopup.value.isHovered = false;
  mapPopup.value.pinned = false;
  mapPopup.value.layoutReady = false;
  mapPopup.value.position = null;
  mapPopup.value.markerId = null;
  if (hadPopup) emit('close-popup');
}

function clearSubmenuHoverPopupCloseTimer(): void {
  if (submenuHoverPopupCloseTimer === null) return;
  clearTimeout(submenuHoverPopupCloseTimer);
  submenuHoverPopupCloseTimer = null;
}

function scheduleSubmenuHoverPopupClose(): void {
  if (submenuPopup.value.pinned || submenuPopup.value.isHovered) return;
  clearSubmenuHoverPopupCloseTimer();
  submenuHoverPopupCloseTimer = setTimeout(() => {
    if (
      submenuPopup.value.pinned ||
      submenuPopup.value.isHovered ||
      submenuPopup.value.hoverMarkerId
    ) {
      return;
    }
    closeSubmenuPopup();
  }, HOVER_POPUP_CLOSE_DELAY_MS);
}

function clearSubmenuPanelCloseTimer(): void {
  if (submenuPanelCloseTimer === null) return;
  clearTimeout(submenuPanelCloseTimer);
  submenuPanelCloseTimer = null;
}

function scheduleSubmenuPanelClose(): void {
  if (
    submenuPanel.value.pinned ||
    submenuPanel.value.isHovered ||
    submenuPopup.value.pinned ||
    submenuPopup.value.isHovered
  ) {
    return;
  }
  clearSubmenuPanelCloseTimer();
  submenuPanelCloseTimer = setTimeout(() => {
    if (
      submenuPanel.value.pinned ||
      submenuPanel.value.isHovered ||
      submenuPanel.value.hoverMarkerId ||
      submenuPopup.value.pinned ||
      submenuPopup.value.isHovered
    ) {
      return;
    }
    closeSubmenuPanel();
  }, HOVER_POPUP_CLOSE_DELAY_MS);
}

function openSubmenuPanel(
  markerId: string,
  options?: { pinned?: boolean },
): void {
  closePopup();
  const shouldPin = Boolean(options?.pinned);
  if (shouldPin) {
    submenuPanel.value.pinned = true;
  }
  clearSubmenuPanelCloseTimer();
  if (submenuPanel.value.markerId !== markerId) {
    submenuPanel.value.frozenWidth = null;
    submenuPanel.value.frozenHeight = null;
    submenuPanel.value.frozenScale = null;
  }
  if (submenuPanel.value.markerId === markerId) return;
  submenuPanel.value.markerId = markerId;
  submenuPanel.value.layoutReady = false;
  submenuPanel.value.position = null;
  closeSubmenuPopup();
}

function closeSubmenuPanel(): void {
  clearSubmenuPanelCloseTimer();
  closeSubmenuPopup();
  submenuPanel.value.markerId = null;
  submenuPanel.value.hoverMarkerId = null;
  submenuPanel.value.pinned = false;
  submenuPanel.value.isHovered = false;
  submenuPanel.value.layoutReady = false;
  submenuPanel.value.position = null;
  submenuPanel.value.frozenWidth = null;
  submenuPanel.value.frozenHeight = null;
  submenuPanel.value.frozenScale = null;
}

function openSubmenuPopup(
  markerId: string,
  options?: { pinned?: boolean },
): void {
  const shouldPin = Boolean(options?.pinned);
  if (shouldPin) {
    submenuPopup.value.pinned = true;
  }
  clearSubmenuHoverPopupCloseTimer();
  if (submenuPopup.value.markerId === markerId) return;
  submenuPopup.value.markerId = markerId;
  submenuPopup.value.layoutReady = false;
}

function closeSubmenuPopup(): void {
  clearSubmenuHoverPopupCloseTimer();
  submenuPopup.value.hoverMarkerId = null;
  submenuPopup.value.isHovered = false;
  submenuPopup.value.pinned = false;
  submenuPopup.value.layoutReady = false;
  submenuPopup.value.position = null;
  submenuPopup.value.markerId = null;
}

function handleMarkerClick(marker: MarkerRuntime): void {
  if (props.devMode) {
    devSelectedMarkerIndex.value = marker.markerIndex;
    closePopup();
    closeSubmenuPanel();
    return;
  }
  if (marker.type === 'submenu' || marker.type === 'entrance-menu') {
    openSubmenuPanel(marker.id, { pinned: true });
    return;
  }
  // If this marker has reachable, unchecked checks, mark them checked on click.
  // Works for single and multiple location markers.
  if (
    marker.reachableUncheckedCheckIds &&
    marker.reachableUncheckedCheckIds.length > 0
  ) {
    const ids = Array.from(new Set(marker.reachableUncheckedCheckIds));
    emit('mark-all-reachable', ids);
    return;
  }

  mapPopup.value.hoverMarkerId = marker.id;
  openPopup(marker.id, { pinned: true });
}

function handleMarkerHoverStart(marker: MarkerRuntime): void {
  if (props.devMode) return;
  if (marker.type === 'submenu' || marker.type === 'entrance-menu') {
    if (submenuPanel.value.pinned) return;
    submenuPanel.value.hoverMarkerId = marker.id;
    openSubmenuPanel(marker.id);
    return;
  }
  if (mapPopup.value.pinned) return;
  mapPopup.value.hoverMarkerId = marker.id;
  openPopup(marker.id);
}

function handleMarkerHoverEnd(markerId: string): void {
  const marker = markerById.value.get(markerId);
  if (marker?.type === 'submenu' || marker?.type === 'entrance-menu') {
    if (submenuPanel.value.pinned) return;
    if (submenuPanel.value.hoverMarkerId === markerId) {
      submenuPanel.value.hoverMarkerId = null;
    }
    scheduleSubmenuPanelClose();
    return;
  }

  if (mapPopup.value.pinned) return;
  if (mapPopup.value.hoverMarkerId === markerId) {
    mapPopup.value.hoverMarkerId = null;
  }
  scheduleHoverPopupClose();
}

function handlePopupHoverStart(): void {
  if (props.devMode) return;
  mapPopup.value.isHovered = true;
  clearHoverPopupCloseTimer();
}

function handlePopupHoverEnd(): void {
  if (props.devMode || mapPopup.value.pinned) return;
  mapPopup.value.isHovered = false;
  scheduleHoverPopupClose();
}

function handleSubmenuMarkerClick(marker: SubmenuEntryRuntime): void {
  if (marker.reachableUncheckedCheckIds.length > 0) {
    const ids = Array.from(new Set(marker.reachableUncheckedCheckIds));
    emit('mark-all-reachable', ids);
    return;
  }

  submenuPopup.value.hoverMarkerId = marker.id;
  openSubmenuPopup(marker.id, { pinned: true });
}

function handleSubmenuMarkerHoverStart(marker: SubmenuEntryRuntime): void {
  if (props.devMode || submenuPopup.value.pinned) return;
  submenuPopup.value.hoverMarkerId = marker.id;
  openSubmenuPopup(marker.id);
}

function handleSubmenuMarkerHoverEnd(markerId: string): void {
  if (submenuPopup.value.pinned) return;
  if (submenuPopup.value.hoverMarkerId === markerId) {
    submenuPopup.value.hoverMarkerId = null;
  }
  scheduleSubmenuHoverPopupClose();
}

function handleSubmenuPopupHoverStart(): void {
  if (props.devMode) return;
  submenuPopup.value.isHovered = true;
  clearSubmenuHoverPopupCloseTimer();
  clearSubmenuPanelCloseTimer();
}

function handleSubmenuPopupHoverEnd(): void {
  if (props.devMode || submenuPopup.value.pinned) return;
  submenuPopup.value.isHovered = false;
  scheduleSubmenuHoverPopupClose();
  scheduleSubmenuPanelClose();
}

function handleSubmenuPanelHoverStart(): void {
  if (props.devMode) return;
  submenuPanel.value.isHovered = true;
  clearSubmenuPanelCloseTimer();
}

function handleSubmenuPanelHoverEnd(): void {
  if (props.devMode || submenuPanel.value.pinned) return;
  submenuPanel.value.isHovered = false;
  scheduleSubmenuPanelClose();
}

function handleSubmenuPanelFocusIn(): void {
  if (props.devMode) return;
  submenuPanel.value.isHovered = true;
  clearSubmenuPanelCloseTimer();
}

function handleSubmenuPanelFocusOut(event: FocusEvent): void {
  if (props.devMode || submenuPanel.value.pinned) return;
  const panel = submenuPanelRef.value;
  const nextTarget = event.relatedTarget as Node | null;
  if (panel && nextTarget && panel.contains(nextTarget)) {
    return;
  }
  if (panel?.matches(':hover')) {
    submenuPanel.value.isHovered = true;
    clearSubmenuPanelCloseTimer();
    return;
  }
  submenuPanel.value.isHovered = false;
  scheduleSubmenuPanelClose();
}

function handlePopupEntryClick(entry: MapPopupEntry): void {
  if (!entry.checkId) return;
  emit('toggle-collected', entry.checkId);
}

function popupUncheckedCheckIds(popup: MapPopupPayload): string[] {
  return popup.entries
    .filter((entry) => entry.checkId && !entry.isChecked)
    .map((entry) => entry.checkId as string);
}

function handlePopupMarkAllChecks(popup: MapPopupPayload): void {
  const ids = Array.from(new Set(popupUncheckedCheckIds(popup)));
  if (ids.length === 0) return;
  emit('mark-all-reachable', ids);
}

function getEntranceDestinationOptions(entry: EntranceMenuEntryRuntime) {
  return destinationOptionsForGame(entry.game, entry.key);
}

function getEntranceDestinationValue(srcKey: string): string {
  return getSelectedDestination(srcKey);
}

function handleEntranceDestinationChange(srcKey: string, dstKey: string): void {
  setSelectedDestination(srcKey, dstKey);
}

function handleWheel(event: WheelEvent): void {
  // If the wheel event occurred over the popup, allow the browser to scroll the popup list
  const popupEl = popupRef.value;
  if (
    popupEl &&
    event.target instanceof Node &&
    popupEl.contains(event.target)
  ) {
    return;
  }
  const submenuPanelEl = submenuPanelRef.value;
  if (
    submenuPanelEl &&
    event.target instanceof Node &&
    submenuPanelEl.contains(event.target)
  ) {
    if ((activePanelMarker.value?.entranceEntries.length ?? 0) === 0) {
      return;
    }
  }
  const submenuPopupEl = submenuPopupRef.value;
  if (
    submenuPopupEl &&
    event.target instanceof Node &&
    submenuPopupEl.contains(event.target)
  ) {
    return;
  }

  if (!renderMapDef.value) return;
  if (event.cancelable) event.preventDefault();
  const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
  applyScaleAtClientPoint(scale.value * factor, event.clientX, event.clientY);
}

function handlePointerDown(event: PointerEvent): void {
  if (!renderMapDef.value) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  const target = event.target as HTMLElement | null;
  if (
    target?.closest('.map-marker') ||
    target?.closest('.map-popup') ||
    target?.closest('.map-submenu-panel') ||
    target?.closest('.map-dev-editor')
  ) {
    return;
  }

  if (event.cancelable) {
    event.preventDefault();
  }
  const viewport = viewportRef.value;
  if (viewport && !viewport.hasPointerCapture(event.pointerId)) {
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors; drag still works while pointer remains over the viewport.
    }
  }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  syncPointerState();

  closePopup();
  closeSubmenuPanel();
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return;
  if (event.cancelable) {
    event.preventDefault();
  }

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size >= 2) {
    if (pinchStartDistance <= 0) {
      beginPinch();
    }
    if (pinchStartDistance <= 0) {
      return;
    }
    const pointers = Array.from(activePointers.values());
    const [first, second] = pointers;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    if (distance > 0) {
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      applyScaleAtClientPoint(
        pinchStartScale * (distance / pinchStartDistance),
        centerX,
        centerY,
      );
    }
    return;
  }

  if (!isDragging.value || !lastDragPoint || !renderMapDef.value) return;

  const deltaX = event.clientX - lastDragPoint.x;
  const deltaY = event.clientY - lastDragPoint.y;
  const bounded = clampPanForScale(
    scale.value,
    panX.value + deltaX,
    panY.value + deltaY,
  );
  panX.value = bounded.x;
  panY.value = bounded.y;
  lastDragPoint = { x: event.clientX, y: event.clientY };
}

function handlePointerEnd(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  syncPointerState();
}

function handleLostPointerCapture(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  syncPointerState();
}

function handleWindowBlur(): void {
  closePopup();
  closeSubmenuPanel();
  if (activePointers.size === 0) return;
  activePointers.clear();
  syncPointerState();
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (props.devMode) {
    devSelectedMarkerIndex.value = null;
    return;
  }
  if (submenuPopup.value.markerId) {
    closeSubmenuPopup();
    return;
  }
  if (submenuPanel.value.markerId) {
    closeSubmenuPanel();
    return;
  }
  closePopup();
}

function handleDevWarningsChange(value: DevDraftIssue[]): void {
  emit('dev-warnings-change', value);
}

watch(
  [() => props.activeMap?.id, () => props.devMode],
  async () => {
    closePopup();
    closeSubmenuPanel();
    if (!props.devMode) {
      devDraftMap.value = null;
      devSelectedMarkerIndex.value = null;
      emit('dev-warnings-change', []);
    }
    await nextTick();
    fitMapToViewport();
  },
  { immediate: true },
);

watch(
  () => renderMapDef.value?.id,
  async () => {
    await nextTick();
    fitMapToViewport();
  },
);

watch(
  () => devDraftMap.value?.markers.length,
  (length) => {
    if (devSelectedMarkerIndex.value === null || !length) return;
    if (devSelectedMarkerIndex.value >= length) {
      devSelectedMarkerIndex.value = null;
    }
  },
);

watch(
  () => props.devMarkerSelectRequest?.nonce,
  () => {
    const request = props.devMarkerSelectRequest;
    if (!props.devMode || !request) return;
    devSelectedMarkerIndex.value = request.markerIndex;
  },
);

watch(markerViewModels, () => {
  if (mapPopup.value.hoverMarkerId) {
    const hoveredMarker = markerById.value.get(mapPopup.value.hoverMarkerId);
    if (!hoveredMarker || !hoveredMarker.isVisible) {
      mapPopup.value.hoverMarkerId = null;
    }
  }

  if (submenuPopup.value.hoverMarkerId) {
    const submenuMarker = activeSubmenuEntryHost.value?.submenuMarkers.find(
      (marker) => marker.id === submenuPopup.value.hoverMarkerId,
    );
    if (!submenuMarker || !submenuMarker.isVisible) {
      submenuPopup.value.hoverMarkerId = null;
    }
  }

  if (props.devMode) return;

  const activeMarkerId = mapPopup.value.markerId;
  if (activeMarkerId) {
    const marker = markerById.value.get(activeMarkerId);
    if (!marker || !marker.isVisible || marker.type !== 'check') {
      closePopup();
    }
  }

  const activeSubmenuId = submenuPanel.value.markerId;
  if (activeSubmenuId) {
    const marker = markerById.value.get(activeSubmenuId);
    if (
      !marker ||
      (marker.type !== 'submenu' && marker.type !== 'entrance-menu')
    ) {
      closeSubmenuPanel();
    }
  }

  const activeSubmenuPopupId = submenuPopup.value.markerId;
  if (activeSubmenuPopupId) {
    const submenuMarker = activeSubmenuEntryHost.value?.submenuMarkers.find(
      (marker) => marker.id === activeSubmenuPopupId,
    );
    if (!submenuMarker || !submenuMarker.isVisible) {
      closeSubmenuPopup();
    }
  }
});

watch(
  () => mapPopup.value.markerId,
  async (markerId, previousMarkerId) => {
    if (!markerId) {
      mapPopup.value.layoutReady = false;
      mapPopup.value.position = null;
      return;
    }

    if (markerId !== previousMarkerId) {
      mapPopup.value.layoutReady = false;
    }

    await nextTick();
    updateMapPopupPosition();
    mapPopup.value.layoutReady = true;
  },
);

watch(
  () => submenuPanel.value.markerId,
  async (markerId, previousMarkerId) => {
    if (!markerId) {
      submenuPanel.value.layoutReady = false;
      submenuPanel.value.position = null;
      submenuPanel.value.frozenWidth = null;
      submenuPanel.value.frozenHeight = null;
      submenuPanel.value.frozenScale = null;
      return;
    }

    if (markerId !== previousMarkerId) {
      submenuPanel.value.layoutReady = false;
    }

    await nextTick();
    const panelMarker = markerById.value.get(markerId);
    const shouldFreezePanelSize =
      panelMarker?.type === 'submenu' &&
      panelMarker.entranceEntries.length === 0;

    if (shouldFreezePanelSize) {
      if (submenuPanel.value.frozenWidth === null) {
        submenuPanel.value.frozenWidth =
          submenuPanelRef.value?.offsetWidth ?? null;
      }
      if (submenuPanel.value.frozenHeight === null) {
        submenuPanel.value.frozenHeight =
          submenuPanelRef.value?.offsetHeight ?? null;
      }
      if (submenuPanel.value.frozenScale === null) {
        submenuPanel.value.frozenScale = scale.value;
      }
    } else {
      submenuPanel.value.frozenWidth = null;
      submenuPanel.value.frozenHeight = null;
      submenuPanel.value.frozenScale = null;
    }

    updateSubmenuPanelPosition();
    submenuPanel.value.layoutReady = true;
  },
);

watch(
  () => submenuPopup.value.markerId,
  async (markerId, previousMarkerId) => {
    if (!markerId) {
      submenuPopup.value.layoutReady = false;
      submenuPopup.value.position = null;
      return;
    }

    if (markerId !== previousMarkerId) {
      submenuPopup.value.layoutReady = false;
    }

    await nextTick();
    updateSubmenuPopupPosition();
    submenuPopup.value.layoutReady = true;
  },
);

watch([scale, panX, panY, () => renderMapDef.value?.id], () => {
  if (mapPopup.value.markerId) {
    updateMapPopupPosition();
  }
  if (submenuPanel.value.markerId) {
    updateSubmenuPanelPosition();
    if (submenuPopup.value.markerId) {
      updateSubmenuPopupPosition();
    }
  }
});

watch(activePopup, async (popup) => {
  if (!popup || !mapPopup.value.pinned) return;
  await nextTick();
  const target = popupRef.value?.querySelector<HTMLElement>(
    'button:not(:disabled)',
  );
  target?.focus();
});

watch(activeSubmenuPopup, async (popup) => {
  if (!popup || !submenuPopup.value.pinned) return;
  await nextTick();
  const target = submenuPopupRef.value?.querySelector<HTMLElement>(
    'button:not(:disabled)',
  );
  target?.focus();
});

watch(activeSubmenuEntryHost, async (submenuMarker) => {
  if (!submenuMarker || !submenuPopup.value.markerId) return;
  await nextTick();
  updateSubmenuPopupPosition();
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  window.addEventListener('keydown', handleEscapeKey);
  window.addEventListener('blur', handleWindowBlur);
  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      const bounded = clampPanForScale(scale.value, panX.value, panY.value);
      panX.value = bounded.x;
      panY.value = bounded.y;
      if (mapPopup.value.markerId) {
        updateMapPopupPosition();
      }
      if (submenuPanel.value.markerId) {
        updateSubmenuPanelPosition();
      }
      if (submenuPopup.value.markerId) {
        updateSubmenuPopupPosition();
      }
    });
    resizeObserver.observe(viewportRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscapeKey);
  window.removeEventListener('blur', handleWindowBlur);
  clearHoverPopupCloseTimer();
  clearSubmenuHoverPopupCloseTimer();
  clearSubmenuPanelCloseTimer();
  resizeObserver?.disconnect();
  resizeObserver = null;
  activePointers.clear();
  syncPointerState();
});
</script>

<template>
  <div
    ref="viewportRef"
    class="ootmm-map"
    :class="{ 'is-dragging': isDragging }"
    @wheel="handleWheel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @lostpointercapture="handleLostPointerCapture"
    @dragstart.prevent
    @selectstart.prevent
  >
    <div v-if="!renderMapDef" class="ootmm-map__empty">
      No active map selected.
    </div>

    <template v-else>
      <div class="ootmm-map__scene" :style="sceneStyle">
        <img
          class="ootmm-map__image"
          :src="resolveMapImage(renderMapDef.image)"
          :width="renderMapDef.width"
          :height="renderMapDef.height"
          :alt="renderMapDef.title"
          draggable="false"
        />
        <img
          v-if="showMasterQuestLabel"
          class="ootmm-map__mq-label"
          :src="resolveMasterQuestLabelImage()"
          :style="masterQuestLabelStyle"
          alt="Master Quest selected"
          draggable="false"
        />

        <button
          v-for="marker in visibleMarkers"
          :key="marker.id"
          type="button"
          class="map-marker"
          :data-code-list="markerRuntimeCodeList(marker)"
          :class="{
            'is-selected':
              isDevMode && devSelectedMarkerIndex === marker.markerIndex,
            'is-hovered-by-warning':
              isDevMode && props.devMarkerHoverIndex === marker.markerIndex,
          }"
          :style="markerStyle(marker)"
          :aria-label="
            marker.type === 'submenu'
              ? `Submenu marker: ${marker.submenuMarkers.length} markers`
              : marker.type === 'entrance-menu'
                ? `Entrance menu marker: ${marker.entranceEntries.length} entries`
                : `Map marker: ${marker.codeList.join(', ')}`
          "
          @pointerdown.stop
          @click.stop="handleMarkerClick(marker)"
          @mouseenter="handleMarkerHoverStart(marker)"
          @mouseleave="handleMarkerHoverEnd(marker.id)"
          @focus="handleMarkerHoverStart(marker)"
          @blur="handleMarkerHoverEnd(marker.id)"
        >
          <img
            class="map-marker__icon"
            :src="resolveMarkerImage(marker.image)"
            alt=""
            draggable="false"
          />

          <span
            v-if="marker.topLeftOverlays.length > 0"
            class="map-marker__corner map-marker__corner--top-left"
          >
            <img
              v-for="overlay in marker.topLeftOverlays"
              :key="overlay.key"
              class="map-marker__overlay"
              :class="{ 'map-marker__overlay--wide': overlay.wide }"
              :src="overlay.src"
              alt=""
              draggable="false"
            />
          </span>

          <span
            v-if="marker.bottomLeftOverlays.length > 0"
            class="map-marker__corner map-marker__corner--bottom-left"
          >
            <img
              v-for="overlay in marker.bottomLeftOverlays"
              :key="overlay.key"
              class="map-marker__overlay"
              :src="overlay.src"
              alt=""
              draggable="false"
            />
          </span>

          <span
            v-if="marker.topRightOverlays.length > 0"
            class="map-marker__corner map-marker__corner--top-right"
          >
            <img
              v-for="overlay in marker.topRightOverlays"
              :key="`top-right:${overlay.key}`"
              class="map-marker__overlay"
              :src="overlay.src"
              alt=""
              draggable="false"
            />
          </span>

          <span
            v-if="marker.countDigitImages.length > 0"
            class="map-marker__corner map-marker__corner--bottom-right"
          >
            <img
              v-for="(digitImage, index) in marker.countDigitImages"
              :key="`${marker.id}:digit:${index}`"
              class="map-marker__digit"
              :src="digitImage"
              alt=""
              draggable="false"
            />
          </span>
        </button>
      </div>

      <div
        v-if="activePanelMarker"
        ref="submenuPanelRef"
        class="map-submenu-panel"
        role="dialog"
        aria-modal="false"
        :aria-label="`Submenu panel: ${activePanelMarker.entranceEntries.length} entrances, ${activePanelMarker.submenuMarkers.length} checks`"
        :style="submenuPanelStyle()"
        @pointerdown.stop
        @mouseenter="handleSubmenuPanelHoverStart"
        @mouseleave="handleSubmenuPanelHoverEnd"
        @focusin="handleSubmenuPanelFocusIn"
        @focusout="handleSubmenuPanelFocusOut"
      >
        <div
          v-if="activePanelMarker.submenuMarkers.length > 0"
          class="map-submenu-panel__grid"
        >
          <button
            v-for="submenuMarker in activePanelMarker.submenuMarkers"
            :key="submenuMarker.id"
            type="button"
            class="map-submenu-marker"
            :data-submenu-marker-id="submenuMarker.id"
            :data-code-list="submenuRuntimeCodeList(submenuMarker)"
            :aria-label="`Submenu marker: ${submenuMarker.codeList.join(', ')}`"
            @click="handleSubmenuMarkerClick(submenuMarker)"
            @mouseenter="handleSubmenuMarkerHoverStart(submenuMarker)"
            @mouseleave="handleSubmenuMarkerHoverEnd(submenuMarker.id)"
            @focus="handleSubmenuMarkerHoverStart(submenuMarker)"
            @blur="handleSubmenuMarkerHoverEnd(submenuMarker.id)"
          >
            <img
              class="map-marker__icon"
              :src="resolveMarkerImage(submenuMarker.image)"
              alt=""
              draggable="false"
            />
            <span
              v-if="submenuMarker.topLeftOverlays.length > 0"
              class="map-marker__corner map-marker__corner--top-left"
            >
              <img
                v-for="overlay in submenuMarker.topLeftOverlays"
                :key="overlay.key"
                class="map-marker__overlay"
                :class="{ 'map-marker__overlay--wide': overlay.wide }"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="submenuMarker.bottomLeftOverlays.length > 0"
              class="map-marker__corner map-marker__corner--bottom-left"
            >
              <img
                v-for="overlay in submenuMarker.bottomLeftOverlays"
                :key="`submenu-entry-bottom:${overlay.key}`"
                class="map-marker__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="submenuMarker.topRightOverlays.length > 0"
              class="map-marker__corner map-marker__corner--top-right"
            >
              <img
                v-for="overlay in submenuMarker.topRightOverlays"
                :key="`submenu-top-right:${overlay.key}`"
                class="map-marker__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="submenuMarker.countDigitImages.length > 0"
              class="map-marker__corner map-marker__corner--bottom-right"
            >
              <img
                v-for="(digitImage, index) in submenuMarker.countDigitImages"
                :key="`${submenuMarker.id}:digit:${index}`"
                class="map-marker__digit"
                :src="digitImage"
                alt=""
                draggable="false"
              />
            </span>
          </button>
        </div>

        <div
          v-if="
            activePanelMarker.submenuMarkers.length > 0 &&
            activePanelMarker.entranceEntries.length > 0
          "
          class="map-submenu-panel__divider"
          aria-hidden="true"
        ></div>

        <div
          v-if="activePanelMarker.entranceEntries.length > 0"
          class="map-entrance-menu"
        >
          <div
            v-for="entry in activePanelMarker.entranceEntries"
            :key="entry.key"
            class="map-entrance-menu__row"
          >
            <label class="map-entrance-menu__label" :title="entry.key">
              {{ entry.label }}
            </label>
            <select
              class="map-entrance-menu__select"
              :value="getEntranceDestinationValue(entry.key)"
              @change="
                handleEntranceDestinationChange(
                  entry.key,
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">— Not mapped —</option>
              <option
                v-for="dest in getEntranceDestinationOptions(entry)"
                :key="dest.value"
                :value="dest.value"
              >
                {{ entranceDestinationLabel(dest) }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div
        v-if="activeSubmenuPopup && activeSubmenuPopupMarker"
        ref="submenuPopupRef"
        class="map-popup map-submenu-popup"
        role="dialog"
        aria-modal="false"
        :aria-label="activeSubmenuPopup.title"
        :style="submenuPopupStyle()"
        @pointerdown.stop
        @mouseenter="handleSubmenuPopupHoverStart"
        @mouseleave="handleSubmenuPopupHoverEnd"
        @focusin="handleSubmenuPopupHoverStart"
        @focusout="handleSubmenuPopupHoverEnd"
      >
        <header class="map-popup__header">
          <div class="map-popup__icon">
            <img
              class="map-popup__base"
              :src="resolveMarkerImage(activeSubmenuPopupMarker.image)"
              alt=""
              draggable="false"
            />
            <span
              v-if="activeSubmenuPopupMarker.topLeftOverlays.length > 0"
              class="map-popup__corner map-popup__corner--top-left"
            >
              <img
                v-for="overlay in activeSubmenuPopupMarker.topLeftOverlays"
                :key="`submenu-popup:${overlay.key}`"
                class="map-popup__overlay"
                :class="{ 'map-popup__overlay--wide': overlay.wide }"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="activeSubmenuPopupMarker.bottomLeftOverlays.length > 0"
              class="map-popup__corner map-popup__corner--bottom-left"
            >
              <img
                v-for="overlay in activeSubmenuPopupMarker.bottomLeftOverlays"
                :key="`submenu-popup-bottom:${overlay.key}`"
                class="map-popup__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="activeSubmenuPopupMarker.topRightOverlays.length > 0"
              class="map-popup__corner map-popup__corner--top-right"
            >
              <img
                v-for="overlay in activeSubmenuPopupMarker.topRightOverlays"
                :key="`submenu-popup-top:${overlay.key}`"
                class="map-popup__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
          </div>
          <div class="map-popup__titles">
            <h3>{{ activeSubmenuPopup.title }}</h3>
            <p>
              {{ activeSubmenuPopupMarker.checkedCount }} checked /
              {{ activeSubmenuPopupMarker.reachableUncheckedCount }} reachable
              unchecked
            </p>
          </div>
          <button
            type="button"
            class="map-popup__close"
            aria-label="Close popup"
            @click="closeSubmenuPopup"
          >
            ×
          </button>
        </header>

        <div
          v-if="activeSubmenuPopupAttributeChips.length > 0"
          class="map-popup__attributes"
          aria-label="Attributes"
        >
          <span
            v-for="attribute in activeSubmenuPopupAttributeChips"
            :key="`submenu-popup-attribute:${attribute.key}`"
            class="map-popup__attribute-chip"
            :aria-label="`Attribute: ${attribute.label}`"
          >
            <img
              class="map-popup__attribute-icon"
              :class="{ 'map-popup__attribute-icon--wide': attribute.wide }"
              :src="attribute.src"
              alt=""
              draggable="false"
            />
            <span class="map-popup__attribute-label">{{
              attribute.label
            }}</span>
          </span>
        </div>

        <div class="map-popup__entries">
          <button
            v-for="entry in activeSubmenuPopup.entries"
            :key="entry.id"
            type="button"
            class="map-popup__entry"
            :title="formatLocationDisplayName(entry.code)"
            :class="{
              'is-reachable': entry.isReachable,
              'is-checked': entry.isChecked,
            }"
            :disabled="!entry.checkId"
            @click="handlePopupEntryClick(entry)"
          >
            <span class="map-popup__entry-name">{{
              formatLocationDisplayName(entry.code)
            }}</span>
            <span
              class="map-popup__entry-check"
              :class="{
                'is-reachable': entry.isReachable,
                'is-checked': entry.isChecked,
              }"
              aria-hidden="true"
              >{{ entry.isChecked ? '✓' : '' }}</span
            >
          </button>
        </div>

        <footer class="map-popup__footer">
          <button
            type="button"
            class="map-popup__mark-all"
            :disabled="popupUncheckedCheckIds(activeSubmenuPopup).length === 0"
            @click="handlePopupMarkAllChecks(activeSubmenuPopup)"
          >
            Mark all checks as collected
          </button>
          <p class="map-popup__hint">Includes currently unreachable checks.</p>
        </footer>
      </div>

      <div
        v-if="activePopup && popupMarker"
        ref="popupRef"
        class="map-popup"
        role="dialog"
        aria-modal="false"
        :aria-label="activePopup.title"
        :style="popupStyle()"
        @pointerdown.stop
        @mouseenter="handlePopupHoverStart"
        @mouseleave="handlePopupHoverEnd"
        @focusin="handlePopupHoverStart"
        @focusout="handlePopupHoverEnd"
      >
        <header class="map-popup__header">
          <div class="map-popup__icon">
            <img
              class="map-popup__base"
              :src="resolveMarkerImage(popupMarker.image)"
              alt=""
              draggable="false"
            />
            <span
              v-if="popupMarker.topLeftOverlays.length > 0"
              class="map-popup__corner map-popup__corner--top-left"
            >
              <img
                v-for="overlay in popupMarker.topLeftOverlays"
                :key="`popup:${overlay.key}`"
                class="map-popup__overlay"
                :class="{ 'map-popup__overlay--wide': overlay.wide }"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="popupMarker.bottomLeftOverlays.length > 0"
              class="map-popup__corner map-popup__corner--bottom-left"
            >
              <img
                v-for="overlay in popupMarker.bottomLeftOverlays"
                :key="`popup-bottom:${overlay.key}`"
                class="map-popup__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
            <span
              v-if="popupMarker.topRightOverlays.length > 0"
              class="map-popup__corner map-popup__corner--top-right"
            >
              <img
                v-for="overlay in popupMarker.topRightOverlays"
                :key="`popup-top:${overlay.key}`"
                class="map-popup__overlay"
                :src="overlay.src"
                alt=""
                draggable="false"
              />
            </span>
          </div>
          <div class="map-popup__titles">
            <h3>{{ activePopup.title }}</h3>
            <p>
              {{ popupMarker.checkedCount }} checked /
              {{ popupMarker.reachableUncheckedCount }} reachable unchecked
            </p>
          </div>
          <button
            type="button"
            class="map-popup__close"
            aria-label="Close popup"
            @click="closePopup"
          >
            ×
          </button>
        </header>

        <div
          v-if="activePopupAttributeChips.length > 0"
          class="map-popup__attributes"
          aria-label="Attributes"
        >
          <span
            v-for="attribute in activePopupAttributeChips"
            :key="`popup-attribute:${attribute.key}`"
            class="map-popup__attribute-chip"
            :aria-label="`Attribute: ${attribute.label}`"
          >
            <img
              class="map-popup__attribute-icon"
              :class="{ 'map-popup__attribute-icon--wide': attribute.wide }"
              :src="attribute.src"
              alt=""
              draggable="false"
            />
            <span class="map-popup__attribute-label">{{
              attribute.label
            }}</span>
          </span>
        </div>

        <div class="map-popup__entries">
          <button
            v-for="entry in activePopup.entries"
            :key="entry.id"
            type="button"
            class="map-popup__entry"
            :title="formatLocationDisplayName(entry.code)"
            :class="{
              'is-reachable': entry.isReachable,
              'is-checked': entry.isChecked,
            }"
            :disabled="!entry.checkId"
            @click="handlePopupEntryClick(entry)"
          >
            <span class="map-popup__entry-name">{{
              formatLocationDisplayName(entry.code)
            }}</span>
            <span
              class="map-popup__entry-check"
              :class="{
                'is-reachable': entry.isReachable,
                'is-checked': entry.isChecked,
              }"
              aria-hidden="true"
              >{{ entry.isChecked ? '✓' : '' }}</span
            >
          </button>
        </div>

        <footer class="map-popup__footer">
          <button
            type="button"
            class="map-popup__mark-all"
            :disabled="popupUncheckedCheckIds(activePopup).length === 0"
            @click="handlePopupMarkAllChecks(activePopup)"
          >
            Mark all checks as collected
          </button>
          <p class="map-popup__hint">Includes currently unreachable checks.</p>
        </footer>
      </div>

      <OoTMMMapDevEditor
        v-if="isDevMode"
        :active-map="props.activeMap"
        :all-locations="props.allLocations"
        :all-locations-for-code-search="props.allLocationsForCodeSearch"
        :reachable-ids="props.reachableIds"
        :collected-ids="props.collectedIds"
        :selected-marker-index="devSelectedMarkerIndex"
        @update:draft-map="devDraftMap = $event"
        @update:selected-marker-index="devSelectedMarkerIndex = $event"
        @warnings-change="handleDevWarningsChange"
      />
    </template>
  </div>
</template>

<style scoped>
.ootmm-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: #111827;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}

.ootmm-map img {
  -webkit-user-drag: none;
}

.ootmm-map.is-dragging {
  cursor: grabbing;
}

.ootmm-map__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.9rem;
}

.ootmm-map__scene {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
}

.ootmm-map__image {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
  image-rendering: pixelated;
}

.ootmm-map__mq-label {
  position: absolute;
  transform: translate(-50%, -50%);
  display: block;
  pointer-events: none;
  user-select: none;
}

.map-marker {
  position: absolute;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 1;
}

.map-marker:hover,
.map-marker:focus,
.map-marker:focus-visible {
  z-index: 2;
}

.map-marker:hover .map-marker__icon,
.map-marker:hover .map-marker__overlay,
.map-marker:hover .map-marker__digit,
.map-marker:focus .map-marker__icon,
.map-marker:focus .map-marker__overlay,
.map-marker:focus .map-marker__digit,
.map-marker:focus-visible .map-marker__icon,
.map-marker:focus-visible .map-marker__overlay,
.map-marker:focus-visible .map-marker__digit {
  animation: map-marker-active-shimmer 1.1s ease-in-out infinite;
}

.map-marker:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 1px;
}

.map-marker.is-selected {
  filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.9));
}

.map-marker.is-hovered-by-warning {
  filter: drop-shadow(0 0 3px rgba(96, 165, 250, 0.95));
}

.map-marker__icon {
  width: 16px;
  height: 16px;
  display: block;
  image-rendering: pixelated;
}

.map-marker__corner {
  position: absolute;
  display: inline-flex;
  gap: 1px;
  pointer-events: none;
}

.map-marker__corner--top-left {
  top: -2px;
  left: -2px;
}

.map-marker__corner--bottom-left {
  bottom: -2px;
  left: -2px;
}

.map-marker__corner--top-right {
  top: -2px;
  right: -2px;
}

.map-marker__corner--bottom-right {
  right: -2px;
  bottom: -2px;
}

.map-marker__overlay {
  width: 8px;
  height: 8px;
  image-rendering: pixelated;
}

.map-marker__overlay--wide {
  width: 12px;
}

.map-marker__digit {
  width: 6px;
  height: 8px;
  image-rendering: pixelated;
}

@keyframes map-marker-active-shimmer {
  0%,
  100% {
    filter: brightness(1) drop-shadow(0 0 0 rgba(255, 255, 255, 0));
  }
  50% {
    filter: brightness(1.32) drop-shadow(0 0 2px rgba(255, 255, 255, 0.45));
  }
}

.map-popup {
  position: absolute;
  width: 260px;
  max-height: calc(100% - 16px);
  display: flex;
  flex-direction: column;
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  color: #e2e8f0;
  z-index: 10;
  cursor: default;
}

.map-submenu-panel {
  position: absolute;
  --submenu-marker-size: 16px;
  --submenu-overlay-size: 8px;
  --submenu-overlay-wide-size: 12px;
  --submenu-digit-width: 6px;
  --submenu-digit-height: 8px;
  --submenu-corner-offset: -2px;
  --submenu-corner-gap: 1px;
  width: fit-content;
  max-width: none;
  max-height: none;
  display: flex;
  flex-direction: column;
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  color: #e2e8f0;
  z-index: 11;
  overflow: visible;
  cursor: default;
}

.map-submenu-panel__grid {
  position: relative;
  padding: 0.45rem;
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: max(0px, calc(var(--submenu-corner-offset) * -2));
  overflow: hidden;
}

.map-submenu-panel__divider {
  height: 1px;
  margin: 0 0.5rem;
  background: #1e293b;
}

.map-submenu-marker {
  position: relative;
  width: var(--submenu-marker-size);
  height: var(--submenu-marker-size);
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  flex: 0 0 auto;
}

.map-submenu-marker .map-marker__icon {
  width: var(--submenu-marker-size);
  height: var(--submenu-marker-size);
}

.map-submenu-marker .map-marker__corner {
  gap: var(--submenu-corner-gap);
}

.map-submenu-marker .map-marker__corner--top-left {
  top: var(--submenu-corner-offset);
  left: var(--submenu-corner-offset);
}

.map-submenu-marker .map-marker__corner--bottom-left {
  bottom: var(--submenu-corner-offset);
  left: var(--submenu-corner-offset);
}

.map-submenu-marker .map-marker__corner--top-right {
  top: var(--submenu-corner-offset);
  right: var(--submenu-corner-offset);
}

.map-submenu-marker .map-marker__corner--bottom-right {
  right: var(--submenu-corner-offset);
  bottom: var(--submenu-corner-offset);
}

.map-submenu-marker .map-marker__overlay {
  width: var(--submenu-overlay-size);
  height: var(--submenu-overlay-size);
}

.map-submenu-marker .map-marker__overlay--wide {
  width: var(--submenu-overlay-wide-size);
}

.map-submenu-marker .map-marker__digit {
  width: var(--submenu-digit-width);
  height: var(--submenu-digit-height);
}

.map-submenu-marker:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 1px;
}

.map-entrance-menu {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem;
  min-width: 300px;
}

.map-entrance-menu__row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.map-entrance-menu__label {
  font-size: 0.75rem;
  color: #d1d5db;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-entrance-menu__select {
  width: 100%;
  padding: 0.3rem 0.4rem;
  font-size: 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  cursor: pointer;
  appearance: auto;
}

.map-entrance-menu__select:focus {
  outline: 2px solid #60a5fa;
  outline-offset: -1px;
}

.map-entrance-menu__select:hover {
  border-color: #6b7280;
}

.map-submenu-popup {
  z-index: 12;
}

.map-popup__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid #1e293b;
}

.map-popup__icon {
  position: relative;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.map-popup__base {
  width: 16px;
  height: 16px;
}

.map-popup__corner {
  position: absolute;
  display: inline-flex;
  gap: 1px;
  pointer-events: none;
}

.map-popup__corner--top-left {
  top: -2px;
  left: -2px;
}

.map-popup__corner--bottom-left {
  bottom: -2px;
  left: -2px;
}

.map-popup__corner--top-right {
  top: -2px;
  right: -2px;
}

.map-popup__overlay {
  width: 8px;
  height: 8px;
  image-rendering: pixelated;
}

.map-popup__overlay--wide {
  width: 12px;
}

.map-popup__titles {
  min-width: 0;
  flex: 1;
}

.map-popup__titles h3 {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.map-popup__titles p {
  margin: 0.1rem 0 0;
  font-size: 0.68rem;
  color: #94a3b8;
}

.map-popup__close {
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: 1px solid #334155;
  border-radius: 4px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 1rem;
  line-height: 1;
}

.map-popup__attributes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid #1e293b;
}

.map-popup__attribute-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  padding: 0.16rem 0.36rem 0.16rem 0.25rem;
  border: 1px solid #334155;
  border-radius: 999px;
  background: #0b1220;
  color: #cbd5e1;
  font-size: 0.64rem;
  line-height: 1.2;
}

.map-popup__attribute-icon {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  image-rendering: pixelated;
}

.map-popup__attribute-icon--wide {
  width: 12px;
}

.map-popup__attribute-label {
  white-space: nowrap;
}

.map-popup__entries {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.map-popup button {
  cursor: pointer;
}

.map-popup__entry {
  width: 100%;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
  color: #cbd5e1;
  padding: 0.35rem 0.45rem;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.map-popup__entry.is-reachable {
  border-color: #0f766e;
}

.map-popup__entry.is-checked {
  border-color: #2563eb;
  background: #0f1f39;
}

.map-popup__entry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.map-popup__entry-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
}

.map-popup__entry-check {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 1px solid #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  line-height: 1;
  color: #64748b;
  background: #0b1220;
}

.map-popup__entry-check.is-reachable {
  border-color: #14b8a6;
  color: #5eead4;
  background: #042f2e;
}

.map-popup__entry-check.is-checked {
  border-color: #60a5fa;
  color: #bfdbfe;
  background: #102746;
}

.map-popup__footer {
  border-top: 1px solid #1e293b;
  padding: 0.35rem 0.5rem 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.map-popup__mark-all {
  width: 100%;
  padding: 0.35rem 0.45rem;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid #0f766e;
  border-radius: 6px;
  background: #022c22;
  color: #d1fae5;
}

.map-popup__mark-all:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.map-popup__hint {
  font-size: 0.64rem;
  color: #94a3b8;
  line-height: 1.2;
}

@media (max-width: 600px) {
  /* Increase minimum map height on narrow viewports so the map remains usable on phones */
  .ootmm-map {
    min-height: max(360px, 50vh);
  }

  .map-popup {
    width: 240px;
  }

  .map-submenu-panel {
    width: 280px;
  }
}
</style>
