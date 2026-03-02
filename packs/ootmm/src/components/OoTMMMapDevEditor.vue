<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';
import type { LocationInfo } from '@/types/tracker';
import { MAP_ICON_INDEX } from '../data/maps/mapIconIndex';
import {
  normalizeCode,
  stripWorldSuffix,
  useLocationCodeLookup,
} from '../composables/useLocationCodeLookup';
import type {
  MapDef,
  MapMarkerDef,
  MapMarkerOverlay,
  MapMarkerSettingsVisibility,
  MapSubmenuEntryDef,
} from '../data/maps/types';
import {
  getSearchTerms,
  matchesNormalizedSearchTerms,
  normalizeSearchText,
} from '../utils/search';
import { selectSearchInputText } from '../utils/input';

const LOCATION_SEARCH_LIMIT = 80;

const MAP_MARKER_OVERLAYS: MapMarkerOverlay[] = [
  'child',
  'adult',
  'jp_only',
  'na_only',
  'day1',
  'day2',
  'day3',
  'night',
  'day',
  'clear_state',
  'cursed_state',
  'broken',
];

type DraftIssue = {
  markerIndex: number;
  message: string;
};

const props = withDefaults(
  defineProps<{
    activeMap: MapDef | null;
    allLocations?: LocationInfo[];
    allLocationsForCodeSearch?: LocationInfo[];
    reachableIds: Set<string>;
    collectedIds: Set<string>;
    selectedMarkerIndex: number | null;
  }>(),
  {
    allLocations: () => [],
    allLocationsForCodeSearch: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:draft-map', value: MapDef | null): void;
  (e: 'update:selected-marker-index', value: number | null): void;
  (e: 'warnings-change', value: DraftIssue[]): void;
}>();

const draftMap = ref<MapDef | null>(null);
const codeSearchQuery = ref('');
const manualCodeInput = ref('');
const copyStatus = ref<'idle' | 'ok' | 'error'>('idle');
const editorRef = ref<HTMLElement | null>(null);
const panelPosition = ref<{ left: number; top: number } | null>(null);
const isDraggingPanel = ref(false);
const markerIconQuery = ref('');
const markerIconInputRef = ref<HTMLInputElement | null>(null);
const isMarkerIconSelectorOpen = ref(false);
const markerIconHighlightedIndex = ref(-1);

let copyStatusTimer: number | null = null;
let panelDragPointerId: number | null = null;
let panelDragOffsetX = 0;
let panelDragOffsetY = 0;

const mapIconNames = [...MAP_ICON_INDEX].sort((a, b) => a.localeCompare(b));
const mapIconNameSet = new Set<string>(mapIconNames);

function cloneVisibleWhen(
  value: MapMarkerSettingsVisibility | undefined,
): MapMarkerSettingsVisibility | undefined {
  if (!value) return undefined;
  return {
    settings: value.settings
      ? Object.fromEntries(
          Object.entries(value.settings).map(([key, expected]) => [
            key,
            Array.isArray(expected) ? [...expected] : expected,
          ]),
        )
      : undefined,
    and: value.and?.map(
      (entry) => cloneVisibleWhen(entry) as MapMarkerSettingsVisibility,
    ),
    or: value.or?.map(
      (entry) => cloneVisibleWhen(entry) as MapMarkerSettingsVisibility,
    ),
  };
}

function cloneSubmenuEntry(entry: MapSubmenuEntryDef): MapSubmenuEntryDef {
  return {
    image: entry.image,
    overlays: entry.overlays ? [...entry.overlays] : undefined,
    codes: Array.isArray(entry.codes) ? [...entry.codes] : entry.codes,
    visibleWhen: cloneVisibleWhen(entry.visibleWhen),
  };
}

function cloneMarker(marker: MapMarkerDef): MapMarkerDef {
  return {
    coords: [marker.coords[0], marker.coords[1]],
    image: marker.image,
    type: marker.type,
    overlays: marker.overlays ? [...marker.overlays] : undefined,
    codes: Array.isArray(marker.codes) ? [...marker.codes] : marker.codes,
    markers: marker.markers?.map((entry) => cloneSubmenuEntry(entry)),
    entranceMenu: marker.entranceMenu
      ? { entranceIds: [...marker.entranceMenu.entranceIds] }
      : undefined,
    visibleWhen: cloneVisibleWhen(marker.visibleWhen),
  };
}

function cloneMapDef(mapDef: MapDef): MapDef {
  return {
    id: mapDef.id,
    title: mapDef.title,
    image: mapDef.image,
    width: mapDef.width,
    height: mapDef.height,
    markers: mapDef.markers.map((marker) => cloneMarker(marker)),
  };
}

function formatOverlayLabel(overlay: MapMarkerOverlay): string {
  return overlay.replace(/_/g, ' ');
}

function markerCodeList(marker: MapMarkerDef): string[] {
  const rawCodes = marker.codes ?? '';
  const rawList = Array.isArray(rawCodes) ? rawCodes : [rawCodes];
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0);
}

function normalizeLocationCode(value: string): string {
  return normalizeCode(stripWorldSuffix(value));
}

function assignMarkerCodes(marker: MapMarkerDef, nextCodes: string[]): void {
  if (marker.type === 'submenu' || marker.type === 'entrance-menu') {
    return;
  }
  const cleaned = nextCodes
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (cleaned.length === 0) {
    marker.codes = '';
    return;
  }
  marker.codes = cleaned.length === 1 ? cleaned[0] : cleaned;
}

function findDuplicateCodes(values: string[]): string[] {
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeCode(value);
    if (!normalized) continue;
    if (seen.has(normalized)) {
      duplicates.add(normalized);
    } else {
      seen.add(normalized);
    }
  }
  return Array.from(duplicates);
}

function setCopyStatus(status: 'idle' | 'ok' | 'error'): void {
  copyStatus.value = status;
  if (copyStatusTimer !== null) {
    window.clearTimeout(copyStatusTimer);
    copyStatusTimer = null;
  }
  if (status === 'idle') return;
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.value = 'idle';
    copyStatusTimer = null;
  }, 1800);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPanelContainer(): HTMLElement | null {
  return editorRef.value?.parentElement ?? null;
}

function clampPanelPosition(
  left: number,
  top: number,
): { left: number; top: number } {
  const panel = editorRef.value;
  const container = getPanelContainer();
  if (!panel || !container) {
    return { left, top };
  }

  const maxLeft = Math.max(0, container.clientWidth - panel.offsetWidth);
  const maxTop = Math.max(0, container.clientHeight - panel.offsetHeight);
  return {
    left: clamp(left, 0, maxLeft),
    top: clamp(top, 0, maxTop),
  };
}

function ensurePanelPosition(): { left: number; top: number } | null {
  if (panelPosition.value) {
    return panelPosition.value;
  }
  const panel = editorRef.value;
  const container = getPanelContainer();
  if (!panel || !container) {
    return null;
  }
  const panelRect = panel.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const nextPosition = clampPanelPosition(
    panelRect.left - containerRect.left,
    panelRect.top - containerRect.top,
  );
  panelPosition.value = nextPosition;
  return nextPosition;
}

const editorStyle = computed<CSSProperties | undefined>(() => {
  if (!panelPosition.value) return undefined;
  return {
    left: `${panelPosition.value.left}px`,
    top: `${panelPosition.value.top}px`,
    right: 'auto',
  };
});

function handleHeaderPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  const panel = editorRef.value;
  const container = getPanelContainer();
  const position = ensurePanelPosition();
  if (!panel || !container || !position) return;

  if (event.cancelable) {
    event.preventDefault();
  }

  const containerRect = container.getBoundingClientRect();
  panelDragPointerId = event.pointerId;
  panelDragOffsetX = event.clientX - containerRect.left - position.left;
  panelDragOffsetY = event.clientY - containerRect.top - position.top;
  isDraggingPanel.value = true;

  if (!panel.hasPointerCapture(event.pointerId)) {
    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors; drag still works while pointer remains over the panel.
    }
  }
}

function handleEditorPointerMove(event: PointerEvent): void {
  if (!isDraggingPanel.value || panelDragPointerId !== event.pointerId) return;

  const container = getPanelContainer();
  if (!container) return;

  if (event.cancelable) {
    event.preventDefault();
  }

  const containerRect = container.getBoundingClientRect();
  panelPosition.value = clampPanelPosition(
    event.clientX - containerRect.left - panelDragOffsetX,
    event.clientY - containerRect.top - panelDragOffsetY,
  );
}

function stopPanelDrag(pointerId: number): void {
  if (panelDragPointerId !== pointerId) return;
  panelDragPointerId = null;
  panelDragOffsetX = 0;
  panelDragOffsetY = 0;
  isDraggingPanel.value = false;
}

function handleEditorPointerEnd(event: PointerEvent): void {
  stopPanelDrag(event.pointerId);
}

function handleEditorLostPointerCapture(event: PointerEvent): void {
  stopPanelDrag(event.pointerId);
}

function emitDraftMap(): void {
  emit('update:draft-map', draftMap.value);
}

function resetDraftFromActiveMap(): void {
  draftMap.value = props.activeMap ? cloneMapDef(props.activeMap) : null;
  codeSearchQuery.value = '';
  manualCodeInput.value = '';
  isMarkerIconSelectorOpen.value = false;
  markerIconHighlightedIndex.value = -1;
  markerIconQuery.value = '';
  setCopyStatus('idle');
  emitDraftMap();
}

const { locationIndex, resolveCodeToCheckIds } = useLocationCodeLookup(
  computed(() =>
    props.allLocationsForCodeSearch.length > 0
      ? props.allLocationsForCodeSearch
      : props.allLocations,
  ),
  computed(() => props.reachableIds),
  computed(() => props.collectedIds),
);

const selectedDraftMarker = computed<MapMarkerDef | null>(() => {
  if (!draftMap.value || props.selectedMarkerIndex === null) return null;
  return draftMap.value.markers[props.selectedMarkerIndex] ?? null;
});

const selectedMarkerCodeList = computed(() =>
  selectedDraftMarker.value ? markerCodeList(selectedDraftMarker.value) : [],
);

const selectedMarkerCodeSet = computed(() => {
  const values = new Set<string>();
  selectedMarkerCodeList.value.forEach((code) => {
    const normalized = normalizeCode(code);
    if (normalized) values.add(normalized);
    const normalizedBase = normalizeLocationCode(code);
    if (normalizedBase) values.add(normalizedBase);
  });
  return values;
});

const selectedMarkerDuplicateCodes = computed(() =>
  findDuplicateCodes(selectedMarkerCodeList.value),
);

const selectedMarkerUnresolvedCodes = computed(() => {
  return selectedMarkerCodeList.value.filter(
    (code) => resolveCodeToCheckIds(code).length === 0,
  );
});

const selectedMarkerHasUnsupportedCodeEditing = computed(
  () =>
    selectedDraftMarker.value?.type === 'submenu' ||
    selectedDraftMarker.value?.type === 'entrance-menu',
);

const selectedMarkerUnsupportedCodeEditingMessage = computed(() => {
  const markerType = selectedDraftMarker.value?.type;
  if (markerType === 'submenu') {
    return 'Submenu markers use nested marker lists. Editing nested submenu markers is not supported in dev mode yet.';
  }
  if (markerType === 'entrance-menu') {
    return 'Entrance-menu markers use shuffled entrance lists. Editing entrance-menu entries is not supported in dev mode yet.';
  }
  return '';
});

const selectedMarkerImageUnknown = computed(() => {
  const marker = selectedDraftMarker.value;
  if (!marker) return false;
  const image = marker.image.trim();
  if (!image) return true;
  return !mapIconNameSet.has(image);
});

function getMarkerIconSuggestions(rawQuery: string): string[] {
  const query = normalizeSearchText(rawQuery);
  const terms = getSearchTerms(rawQuery);
  if (terms.length === 0) return mapIconNames;

  const exactMatches: string[] = [];
  const prefixMatches: string[] = [];
  const fuzzyMatches: string[] = [];

  for (const icon of mapIconNames) {
    const normalized = normalizeSearchText(icon);
    if (!matchesNormalizedSearchTerms([normalized], terms)) {
      continue;
    }
    if (normalized === query) {
      exactMatches.push(icon);
      continue;
    }
    if (normalized.startsWith(query)) {
      prefixMatches.push(icon);
      continue;
    }
    if (normalized.includes(query)) {
      fuzzyMatches.push(icon);
    }
  }

  return [...exactMatches, ...prefixMatches, ...fuzzyMatches];
}

const markerIconSuggestions = computed(() =>
  getMarkerIconSuggestions(markerIconQuery.value),
);
const activeMarkerIconOptionId = computed(() => {
  if (
    !isMarkerIconSelectorOpen.value ||
    markerIconHighlightedIndex.value < 0 ||
    markerIconHighlightedIndex.value >= markerIconSuggestions.value.length
  ) {
    return undefined;
  }
  return getMarkerIconOptionId(markerIconHighlightedIndex.value);
});

function getMarkerIconOptionId(index: number): string {
  return `marker-icon-option-${index}`;
}

function findMarkerIconForQuery(rawQuery: string): string | null {
  const query = normalizeSearchText(rawQuery);
  if (!query) return null;

  const exactMatch = mapIconNames.find(
    (icon) => normalizeSearchText(icon) === query,
  );
  if (exactMatch) return exactMatch;

  const matches = getMarkerIconSuggestions(rawQuery);
  return matches.length === 1 ? matches[0] : null;
}

function syncMarkerIconQueryFromSelection() {
  markerIconQuery.value = selectedDraftMarker.value?.image ?? '';
  markerIconHighlightedIndex.value = -1;
}

function openMarkerIconSelector() {
  isMarkerIconSelectorOpen.value = true;
  const suggestions = markerIconSuggestions.value;
  if (suggestions.length === 0) {
    markerIconHighlightedIndex.value = -1;
    return;
  }
  const activeImage = selectedDraftMarker.value?.image.trim() ?? '';
  const activeIndex = suggestions.findIndex((icon) => icon === activeImage);
  markerIconHighlightedIndex.value = activeIndex >= 0 ? activeIndex : 0;
}

function closeMarkerIconSelector(options?: { syncInput?: boolean }) {
  const shouldSyncInput = options?.syncInput ?? true;
  isMarkerIconSelectorOpen.value = false;
  if (shouldSyncInput) {
    syncMarkerIconQueryFromSelection();
  }
}

function setMarkerIconHighlight(index: number) {
  const suggestionCount = markerIconSuggestions.value.length;
  if (suggestionCount === 0) {
    markerIconHighlightedIndex.value = -1;
    return;
  }
  markerIconHighlightedIndex.value = Math.min(
    Math.max(index, 0),
    suggestionCount - 1,
  );
}

function selectMarkerIcon(icon: string, options?: { close?: boolean }) {
  markerIconQuery.value = icon;
  setSelectedMarkerImage(icon);
  const shouldClose = options?.close ?? true;
  if (shouldClose) {
    isMarkerIconSelectorOpen.value = false;
  }
  const selectedIndex = markerIconSuggestions.value.findIndex(
    (candidate) => candidate === icon,
  );
  markerIconHighlightedIndex.value = selectedIndex >= 0 ? selectedIndex : -1;
}

function commitMarkerIconSelection() {
  const suggestions = markerIconSuggestions.value;
  if (suggestions.length === 0) {
    closeMarkerIconSelector();
    return;
  }
  const highlightedIndex = markerIconHighlightedIndex.value;
  const selectedIcon =
    highlightedIndex >= 0 && highlightedIndex < suggestions.length
      ? suggestions[highlightedIndex]
      : suggestions[0];
  selectMarkerIcon(selectedIcon);
}

function handleMarkerIconFocus() {
  openMarkerIconSelector();
  markerIconInputRef.value?.select();
}

function handleMarkerIconClick() {
  openMarkerIconSelector();
  markerIconInputRef.value?.select();
}

function handleMarkerIconBlur() {
  closeMarkerIconSelector();
}

function handleMarkerIconInput(value: string) {
  markerIconQuery.value = value;
  setSelectedMarkerImage(value);
  openMarkerIconSelector();
  setMarkerIconHighlight(0);
  const match = findMarkerIconForQuery(value);
  if (!match) return;
  const exactMatchIndex = markerIconSuggestions.value.findIndex(
    (icon) => icon === match,
  );
  if (exactMatchIndex >= 0) {
    markerIconHighlightedIndex.value = exactMatchIndex;
  }
}

function handleMarkerIconOptionClick(icon: string) {
  selectMarkerIcon(icon);
}

function handleMarkerIconKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isMarkerIconSelectorOpen.value) {
      openMarkerIconSelector();
      return;
    }
    const suggestions = markerIconSuggestions.value;
    if (suggestions.length === 0) return;
    const nextIndex =
      markerIconHighlightedIndex.value < 0
        ? 0
        : (markerIconHighlightedIndex.value + 1) % suggestions.length;
    setMarkerIconHighlight(nextIndex);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isMarkerIconSelectorOpen.value) {
      openMarkerIconSelector();
      return;
    }
    const suggestions = markerIconSuggestions.value;
    if (suggestions.length === 0) return;
    const nextIndex =
      markerIconHighlightedIndex.value < 0
        ? suggestions.length - 1
        : (markerIconHighlightedIndex.value - 1 + suggestions.length) %
          suggestions.length;
    setMarkerIconHighlight(nextIndex);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    commitMarkerIconSelection();
    return;
  }

  if (event.key === 'Tab') {
    if (!isMarkerIconSelectorOpen.value) return;
    if (markerIconSuggestions.value.length === 0) return;
    commitMarkerIconSelection();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMarkerIconSelector();
  }
}

const locationSearchResults = computed(() => {
  const terms = getSearchTerms(codeSearchQuery.value);
  const filtered = (
    terms.length === 0
      ? locationIndex.value
      : locationIndex.value.filter((entry) =>
          matchesNormalizedSearchTerms(
            [entry.normalizedId, entry.normalizedBaseId, entry.normalizedName],
            terms,
          ),
        )
  ).filter(
    (entry) =>
      !selectedMarkerCodeSet.value.has(entry.normalizedId) &&
      !selectedMarkerCodeSet.value.has(entry.normalizedBaseId),
  );
  return filtered.slice(0, LOCATION_SEARCH_LIMIT);
});

function addLocationCode(locationId: string): void {
  const baseCode = stripWorldSuffix(locationId);
  addCodeToSelectedMarker(baseCode);
}

const draftErrors = computed<DraftIssue[]>(() => {
  if (!draftMap.value) return [];
  const issues: DraftIssue[] = [];
  draftMap.value.markers.forEach((marker, markerIndex) => {
    const [x, y] = marker.coords;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      issues.push({
        markerIndex,
        message: 'Coords must be finite numbers',
      });
    }
    if (marker.type === 'submenu') {
      const submenuMarkers = marker.markers ?? [];
      const hasEntranceBinding =
        (marker.entranceMenu?.entranceIds?.length ?? 0) > 0;
      if (submenuMarkers.length === 0 && !hasEntranceBinding) {
        issues.push({
          markerIndex,
          message:
            'Submenu marker must include submenu markers or at least one entrance id',
        });
      }
      submenuMarkers.forEach((submenuMarker, submenuIndex) => {
        const codes = Array.isArray(submenuMarker.codes)
          ? submenuMarker.codes
          : [submenuMarker.codes];
        const trimmedCodes = codes
          .map((code) => code.trim())
          .filter((code) => code.length > 0);
        if (trimmedCodes.length === 0) {
          issues.push({
            markerIndex,
            message: `Submenu marker #${submenuIndex + 1} must include at least one code`,
          });
        }
      });
      return;
    }
    if (marker.type === 'entrance-menu') {
      const entranceIds = marker.entranceMenu?.entranceIds ?? [];
      if (entranceIds.length === 0) {
        issues.push({
          markerIndex,
          message: 'Entrance-menu marker must include at least one entrance id',
        });
      }
      return;
    }

    const codes = markerCodeList(marker);
    if (codes.length === 0) {
      issues.push({
        markerIndex,
        message: 'Marker must include at least one code',
      });
    }
    const duplicateCodes = findDuplicateCodes(codes);
    if (duplicateCodes.length > 0) {
      issues.push({
        markerIndex,
        message: `Duplicate codes are not allowed (${duplicateCodes.join(', ')})`,
      });
    }
  });
  return issues;
});

const draftWarnings = computed<DraftIssue[]>(() => {
  if (!draftMap.value) return [];
  const issues: DraftIssue[] = [];
  draftMap.value.markers.forEach((marker, markerIndex) => {
    if (!mapIconNameSet.has(marker.image.trim())) {
      issues.push({
        markerIndex,
        message: `Unknown image key: "${marker.image}"`,
      });
    }
    if (marker.type === 'submenu') {
      const submenuUnresolved = (marker.markers ?? []).flatMap(
        (submenuMarker, submenuIndex) =>
          (Array.isArray(submenuMarker.codes)
            ? submenuMarker.codes
            : [submenuMarker.codes]
          )
            .map((code) => code.trim())
            .filter(
              (code) =>
                code.length > 0 && resolveCodeToCheckIds(code).length === 0,
            )
            .map((code) => `#${submenuIndex + 1}: ${code}`),
      );
      if (submenuUnresolved.length > 0) {
        issues.push({
          markerIndex,
          message: `Unresolved submenu codes: ${submenuUnresolved.join(', ')}`,
        });
      }
      return;
    }
    if (marker.type === 'entrance-menu') {
      return;
    }

    const unresolved = markerCodeList(marker).filter(
      (code) => resolveCodeToCheckIds(code).length === 0,
    );
    if (unresolved.length > 0) {
      issues.push({
        markerIndex,
        message: `Unresolved/manual codes: ${unresolved.join(', ')}`,
      });
    }
  });
  return issues;
});

const canExportDraft = computed(
  () => Boolean(draftMap.value) && draftErrors.value.length === 0,
);

function buildDraftExportMap(): MapDef | null {
  if (!draftMap.value) return null;
  return {
    id: draftMap.value.id,
    title: draftMap.value.title,
    image: draftMap.value.image,
    width: draftMap.value.width,
    height: draftMap.value.height,
    markers: draftMap.value.markers.map((marker) => {
      const exportMarker: MapMarkerDef = {
        coords: [Number(marker.coords[0]), Number(marker.coords[1])],
        image: marker.image.trim(),
      };
      if (marker.type) {
        exportMarker.type = marker.type;
      }
      if (marker.overlays && marker.overlays.length > 0) {
        exportMarker.overlays = [...marker.overlays];
      }
      if (marker.visibleWhen) {
        exportMarker.visibleWhen = cloneVisibleWhen(marker.visibleWhen);
      }
      if (marker.type === 'submenu') {
        const exportedSubmenuMarkers = (marker.markers ?? []).map(
          (submenuMarker) => {
            const codes = (
              Array.isArray(submenuMarker.codes)
                ? submenuMarker.codes
                : [submenuMarker.codes]
            )
              .map((code) => code.trim())
              .filter((code) => code.length > 0);
            const exportSubmenuMarker: MapSubmenuEntryDef = {
              image: submenuMarker.image.trim(),
              codes: codes.length > 1 ? [...codes] : (codes[0] ?? ''),
            };
            if (submenuMarker.overlays && submenuMarker.overlays.length > 0) {
              exportSubmenuMarker.overlays = [...submenuMarker.overlays];
            }
            if (submenuMarker.visibleWhen) {
              exportSubmenuMarker.visibleWhen = cloneVisibleWhen(
                submenuMarker.visibleWhen,
              );
            }
            return exportSubmenuMarker;
          },
        );
        if (exportedSubmenuMarkers.length > 0) {
          exportMarker.markers = exportedSubmenuMarkers;
        }
        if (marker.entranceMenu) {
          exportMarker.entranceMenu = {
            entranceIds: [...marker.entranceMenu.entranceIds],
          };
        }
      } else if (marker.type === 'entrance-menu') {
        if (marker.entranceMenu) {
          exportMarker.entranceMenu = {
            entranceIds: [...marker.entranceMenu.entranceIds],
          };
        }
      } else {
        const codes = markerCodeList(marker);
        exportMarker.codes = codes.length > 1 ? [...codes] : (codes[0] ?? '');
      }
      return exportMarker;
    }),
  };
}

function markerHasOverlay(
  marker: MapMarkerDef,
  overlay: MapMarkerOverlay,
): boolean {
  return (marker.overlays ?? []).includes(overlay);
}

function toggleSelectedOverlay(overlay: MapMarkerOverlay): void {
  const marker = selectedDraftMarker.value;
  if (!marker) return;
  const next = new Set(marker.overlays ?? []);
  if (next.has(overlay)) {
    next.delete(overlay);
  } else {
    next.add(overlay);
  }
  marker.overlays = MAP_MARKER_OVERLAYS.filter((entry) => next.has(entry));
  if (marker.overlays.length === 0) {
    marker.overlays = undefined;
  }
}

function setSelectedMarkerImage(value: string): void {
  const marker = selectedDraftMarker.value;
  if (!marker) return;
  marker.image = value.trim();
}

function parseNumberInput(raw: string): number {
  const value = raw.trim();
  if (!value) return Number.NaN;
  return Number(value);
}

function setSelectedCoord(axis: 0 | 1, value: number): void {
  const marker = selectedDraftMarker.value;
  if (!marker) return;
  marker.coords[axis] = value;
}

function addCodeToSelectedMarker(code: string): void {
  const marker = selectedDraftMarker.value;
  if (!marker || marker.type === 'submenu' || marker.type === 'entrance-menu')
    return;
  const trimmed = code.trim();
  if (!trimmed) return;
  const normalized = normalizeCode(trimmed);
  const existingCodes = markerCodeList(marker);
  if (
    existingCodes.some((existing) => normalizeCode(existing) === normalized)
  ) {
    return;
  }
  assignMarkerCodes(marker, [...existingCodes, trimmed]);
}

function removeCodeFromSelectedMarker(code: string): void {
  const marker = selectedDraftMarker.value;
  if (!marker || marker.type === 'submenu' || marker.type === 'entrance-menu')
    return;
  const normalized = normalizeCode(code);
  const nextCodes = markerCodeList(marker).filter(
    (entry) => normalizeCode(entry) !== normalized,
  );
  assignMarkerCodes(marker, nextCodes);
}

function addManualCode(): void {
  addCodeToSelectedMarker(manualCodeInput.value);
  manualCodeInput.value = '';
}

function resetDraft(): void {
  resetDraftFromActiveMap();
  emit('update:selected-marker-index', null);
}

function exportMapJson(): void {
  if (!canExportDraft.value) return;
  const exportMap = buildDraftExportMap();
  if (!exportMap) return;
  const json = `${JSON.stringify(exportMap, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${exportMap.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyMapJson(): Promise<void> {
  if (!canExportDraft.value) return;
  const exportMap = buildDraftExportMap();
  if (!exportMap || !navigator.clipboard) {
    setCopyStatus('error');
    return;
  }
  try {
    await navigator.clipboard.writeText(
      `${JSON.stringify(exportMap, null, 2)}\n`,
    );
    setCopyStatus('ok');
  } catch {
    setCopyStatus('error');
  }
}

watch(
  draftMap,
  () => {
    emitDraftMap();
  },
  { deep: true },
);

watch(
  () => props.activeMap?.id,
  () => {
    resetDraftFromActiveMap();
    emit('update:selected-marker-index', null);
  },
  { immediate: true },
);

watch(
  () => draftMap.value?.markers.length,
  (length) => {
    const selectedIndex = props.selectedMarkerIndex;
    if (selectedIndex === null || !length) return;
    if (selectedIndex >= length) {
      emit('update:selected-marker-index', null);
    }
  },
);

watch(
  () => selectedDraftMarker.value?.image ?? '',
  () => {
    if (isMarkerIconSelectorOpen.value) return;
    syncMarkerIconQueryFromSelection();
  },
  { immediate: true },
);

watch(markerIconSuggestions, (suggestions) => {
  if (suggestions.length === 0) {
    markerIconHighlightedIndex.value = -1;
    return;
  }
  if (
    markerIconHighlightedIndex.value < 0 ||
    markerIconHighlightedIndex.value >= suggestions.length
  ) {
    markerIconHighlightedIndex.value = 0;
  }
});

watch(
  draftWarnings,
  (warnings) => {
    emit('warnings-change', warnings);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (copyStatusTimer !== null) {
    window.clearTimeout(copyStatusTimer);
    copyStatusTimer = null;
  }
  panelDragPointerId = null;
  isDraggingPanel.value = false;
});
</script>

<template>
  <aside
    ref="editorRef"
    class="map-dev-editor"
    :class="{ 'is-dragging': isDraggingPanel }"
    :style="editorStyle"
    @wheel.stop
    @pointermove="handleEditorPointerMove"
    @pointerup="handleEditorPointerEnd"
    @pointercancel="handleEditorPointerEnd"
    @lostpointercapture="handleEditorLostPointerCapture"
  >
    <header
      class="map-dev-editor__header"
      @pointerdown.stop="handleHeaderPointerDown"
    >
      <h3>Marker Editor</h3>
      <p v-if="selectedMarkerIndex !== null">
        Marker #{{ selectedMarkerIndex + 1 }}
      </p>
      <p v-else>Select a marker to edit.</p>
    </header>

    <div class="map-dev-editor__actions">
      <button
        type="button"
        class="map-dev-editor__action"
        :disabled="!canExportDraft"
        @click="exportMapJson"
      >
        Export Map JSON
      </button>
      <button
        type="button"
        class="map-dev-editor__action"
        :disabled="!canExportDraft"
        @click="copyMapJson"
      >
        Copy Map JSON
      </button>
      <button
        type="button"
        class="map-dev-editor__action map-dev-editor__action--secondary"
        @click="resetDraft"
      >
        Reset Draft
      </button>
    </div>

    <p
      v-if="copyStatus !== 'idle'"
      class="map-dev-editor__copy-status"
      :class="{
        'is-ok': copyStatus === 'ok',
        'is-error': copyStatus === 'error',
      }"
    >
      {{
        copyStatus === 'ok' ? 'Map JSON copied to clipboard.' : 'Copy failed.'
      }}
    </p>

    <div
      v-if="draftErrors.length > 0"
      class="map-dev-editor__issue-group map-dev-editor__issue-group--error"
    >
      <div class="map-dev-editor__issue-title">Export blocked</div>
      <ul>
        <li
          v-for="(issue, index) in draftErrors"
          :key="`error:${issue.markerIndex}:${index}`"
        >
          Marker #{{ issue.markerIndex + 1 }}: {{ issue.message }}
        </li>
      </ul>
    </div>

    <template v-if="selectedDraftMarker">
      <section class="map-dev-editor__section">
        <h4>Position</h4>
        <div class="map-dev-editor__row map-dev-editor__row--two-col">
          <label>
            X
            <input
              type="number"
              step="1"
              :value="
                Number.isFinite(selectedDraftMarker.coords[0])
                  ? selectedDraftMarker.coords[0]
                  : ''
              "
              @input="
                setSelectedCoord(
                  0,
                  parseNumberInput(($event.target as HTMLInputElement).value),
                )
              "
            />
          </label>
          <label>
            Y
            <input
              type="number"
              step="1"
              :value="
                Number.isFinite(selectedDraftMarker.coords[1])
                  ? selectedDraftMarker.coords[1]
                  : ''
              "
              @input="
                setSelectedCoord(
                  1,
                  parseNumberInput(($event.target as HTMLInputElement).value),
                )
              "
            />
          </label>
        </div>
      </section>

      <section class="map-dev-editor__section">
        <h4>Image</h4>
        <label>
          Icon key
          <div class="map-dev-editor__combobox">
            <input
              ref="markerIconInputRef"
              v-model="markerIconQuery"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-label="Marker icon key"
              aria-controls="marker-icon-listbox"
              :aria-expanded="isMarkerIconSelectorOpen"
              :aria-activedescendant="activeMarkerIconOptionId"
              @focus="handleMarkerIconFocus"
              @click="handleMarkerIconClick"
              @input="
                handleMarkerIconInput(($event.target as HTMLInputElement).value)
              "
              @blur="handleMarkerIconBlur"
              @keydown="handleMarkerIconKeydown"
            />
            <ul
              v-if="isMarkerIconSelectorOpen"
              id="marker-icon-listbox"
              class="map-dev-editor__combobox-options"
              role="listbox"
              aria-label="Marker icon options"
            >
              <li
                v-for="(icon, index) in markerIconSuggestions"
                :id="getMarkerIconOptionId(index)"
                :key="icon"
                class="map-dev-editor__combobox-option"
                :class="{
                  'is-highlighted': index === markerIconHighlightedIndex,
                }"
                role="option"
                :aria-selected="index === markerIconHighlightedIndex"
                @mousedown.prevent
                @click="handleMarkerIconOptionClick(icon)"
              >
                {{ icon }}
              </li>
              <li
                v-if="markerIconSuggestions.length === 0"
                class="map-dev-editor__combobox-empty"
              >
                No icon keys found.
              </li>
            </ul>
          </div>
        </label>
        <p
          v-if="selectedMarkerImageUnknown"
          class="map-dev-editor__inline-warning"
        >
          Unknown image key. Marker still renders but icon may be missing.
        </p>
      </section>

      <section class="map-dev-editor__section">
        <h4>Overlays</h4>
        <div class="map-dev-editor__chip-grid">
          <button
            v-for="overlay in MAP_MARKER_OVERLAYS"
            :key="overlay"
            type="button"
            class="map-dev-editor__chip"
            :class="{
              'is-active': markerHasOverlay(selectedDraftMarker, overlay),
            }"
            @click="toggleSelectedOverlay(overlay)"
          >
            {{ formatOverlayLabel(overlay) }}
          </button>
        </div>
      </section>

      <section
        v-if="!selectedMarkerHasUnsupportedCodeEditing"
        class="map-dev-editor__section"
      >
        <h4>Codes</h4>
        <label>
          Search locations
          <input
            v-model="codeSearchQuery"
            type="text"
            placeholder="Search by location id or name"
            @focus="selectSearchInputText"
            @click="selectSearchInputText"
          />
        </label>
        <div class="map-dev-editor__location-list">
          <button
            v-for="entry in locationSearchResults"
            :key="entry.id"
            type="button"
            class="map-dev-editor__location-item"
            @click="addLocationCode(entry.id)"
          >
            <span class="map-dev-editor__location-id">{{ entry.name }}</span>
          </button>
          <p
            v-if="locationSearchResults.length === 0"
            class="map-dev-editor__location-empty"
          >
            No location matches.
          </p>
        </div>

        <div class="map-dev-editor__row">
          <label>
            Manual code
            <input
              v-model="manualCodeInput"
              type="text"
              placeholder="Add custom code"
              @keydown.enter.prevent="addManualCode"
            />
          </label>
          <button
            type="button"
            class="map-dev-editor__action map-dev-editor__action--small"
            @click="addManualCode"
          >
            Add
          </button>
        </div>

        <div class="map-dev-editor__codes-list">
          <div
            v-for="code in selectedMarkerCodeList"
            :key="code"
            class="map-dev-editor__code-row"
          >
            <span class="map-dev-editor__code-text">{{ code }}</span>
            <span
              v-if="resolveCodeToCheckIds(code).length === 0"
              class="map-dev-editor__tag map-dev-editor__tag--warning"
            >
              unresolved
            </span>
            <button
              type="button"
              class="map-dev-editor__remove"
              @click="removeCodeFromSelectedMarker(code)"
            >
              Remove
            </button>
          </div>
          <p
            v-if="selectedMarkerCodeList.length === 0"
            class="map-dev-editor__location-empty"
          >
            Marker has no codes.
          </p>
        </div>

        <div
          v-if="selectedMarkerDuplicateCodes.length > 0"
          class="map-dev-editor__inline-warning"
        >
          Duplicate codes in marker:
          {{ selectedMarkerDuplicateCodes.join(', ') }}
        </div>
        <div
          v-if="selectedMarkerUnresolvedCodes.length > 0"
          class="map-dev-editor__inline-warning"
        >
          Unresolved/manual codes:
          {{ selectedMarkerUnresolvedCodes.join(', ') }}
        </div>
      </section>

      <section v-else class="map-dev-editor__section">
        <h4>Codes</h4>
        <p class="map-dev-editor__location-empty">
          {{ selectedMarkerUnsupportedCodeEditingMessage }}
        </p>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.map-dev-editor {
  position: absolute;
  top: 8px;
  right: 8px;
  width: min(370px, calc(100% - 16px));
  max-height: calc(100% - 16px);
  overflow-y: auto;
  z-index: 11;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #334155;
  border-radius: 8px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  cursor: default;
}

.map-dev-editor.is-dragging {
  cursor: grabbing;
}

.map-dev-editor__header {
  cursor: move;
  cursor: grab;
  user-select: none;
}

.map-dev-editor__header * {
  cursor: inherit;
}

.map-dev-editor.is-dragging .map-dev-editor__header {
  cursor: move;
  cursor: grabbing;
}

.map-dev-editor__header h3 {
  margin: 0;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #f8fafc;
}

.map-dev-editor__header p {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  color: #93c5fd;
}

.map-dev-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.map-dev-editor__action {
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  background: #0b234f;
  color: #dbeafe;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.35rem 0.45rem;
  cursor: pointer;
}

.map-dev-editor__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.map-dev-editor__action--secondary {
  border-color: #475569;
  background: #0f172a;
}

.map-dev-editor__action--small {
  align-self: flex-end;
}

.map-dev-editor__copy-status {
  margin: 0;
  font-size: 0.7rem;
}

.map-dev-editor__copy-status.is-ok {
  color: #86efac;
}

.map-dev-editor__copy-status.is-error {
  color: #fca5a5;
}

.map-dev-editor__issue-group {
  border-radius: 6px;
  border: 1px solid #334155;
  padding: 0.4rem;
}

.map-dev-editor__issue-group ul {
  margin: 0.3rem 0 0;
  padding-left: 1rem;
  font-size: 0.7rem;
  line-height: 1.3;
}

.map-dev-editor__issue-group--error {
  border-color: #b91c1c;
  background: rgba(127, 29, 29, 0.35);
}

.map-dev-editor__issue-group--warning {
  border-color: #a16207;
  background: rgba(120, 53, 15, 0.3);
}

.map-dev-editor__issue-title {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #f8fafc;
}

.map-dev-editor__section {
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.map-dev-editor__section h4 {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #e2e8f0;
}

.map-dev-editor__section label {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  font-size: 0.68rem;
  color: #cbd5e1;
}

.map-dev-editor__section input {
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.28rem 0.35rem;
  font-size: 0.72rem;
}

.map-dev-editor__combobox {
  position: relative;
}

.map-dev-editor__combobox-options {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  border: 1px solid #334155;
  border-radius: 5px;
  background: #020617;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.4);
  max-height: min(14rem, 40vh);
  overflow-y: auto;
  z-index: 14;
}

.map-dev-editor__combobox-option {
  border-radius: 4px;
  padding: 0.25rem 0.3rem;
  font-size: 0.67rem;
  color: #cbd5e1;
  line-height: 1.3;
  cursor: pointer;
}

.map-dev-editor__combobox-option:hover,
.map-dev-editor__combobox-option.is-highlighted {
  background: #1e293b;
  color: #f8fafc;
}

.map-dev-editor__combobox-empty {
  padding: 0.25rem 0.3rem;
  font-size: 0.67rem;
  color: #94a3b8;
}

.map-dev-editor__row {
  display: flex;
  gap: 0.4rem;
  align-items: flex-end;
}

.map-dev-editor__row label {
  flex: 1;
}

.map-dev-editor__row--two-col label {
  min-width: 0;
}

.map-dev-editor__chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.map-dev-editor__chip {
  border: 1px solid #475569;
  border-radius: 999px;
  background: #111827;
  color: #cbd5e1;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.45rem;
}

.map-dev-editor__chip.is-active {
  border-color: #0f766e;
  background: #0f3d38;
  color: #ccfbf1;
}

.map-dev-editor__location-list {
  max-height: 170px;
  overflow-y: auto;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.map-dev-editor__section .map-dev-editor__location-item {
  display: flex;
  align-items: center;
  width: 100%;
  border: 1px solid #1e293b;
  border-radius: 5px;
  padding: 0.25rem;
  background: #111827;
  text-align: left;
  cursor: pointer;
}

.map-dev-editor__section .map-dev-editor__location-item:hover {
  border-color: #334155;
  background: #172036;
}

.map-dev-editor__location-id {
  font-size: 0.66rem;
  color: #e2e8f0;
  line-height: 1.2;
}

.map-dev-editor__location-empty {
  margin: 0;
  font-size: 0.66rem;
  color: #94a3b8;
}

.map-dev-editor__codes-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.map-dev-editor__code-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #334155;
  border-radius: 5px;
  padding: 0.22rem 0.3rem;
  background: #111827;
}

.map-dev-editor__code-text {
  min-width: 0;
  flex: 1;
  font-size: 0.66rem;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-dev-editor__remove {
  border: 1px solid #7f1d1d;
  border-radius: 5px;
  background: #450a0a;
  color: #fecaca;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.3rem;
}

.map-dev-editor__tag {
  border-radius: 999px;
  padding: 0.1rem 0.35rem;
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.map-dev-editor__tag--warning {
  border: 1px solid #a16207;
  background: rgba(120, 53, 15, 0.3);
  color: #fde68a;
}

.map-dev-editor__inline-warning {
  margin: 0;
  font-size: 0.66rem;
  color: #fcd34d;
  line-height: 1.25;
}

@media (max-width: 600px) {
  .map-dev-editor {
    width: calc(100% - 16px);
    max-height: 60%;
  }
}
</style>
