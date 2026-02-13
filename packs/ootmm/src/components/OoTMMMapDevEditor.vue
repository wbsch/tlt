<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LocationInfo } from '@/types/tracker'
import { MAP_ICON_INDEX } from '../data/maps/mapIconIndex'
import { normalizeCode, useLocationCodeLookup } from '../composables/useLocationCodeLookup'
import type { MapDef, MapMarkerDef, MapMarkerOverlay } from '../data/maps/types'

const LOCATION_SEARCH_LIMIT = 80

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
  'broken',
]

type DraftIssue = {
  markerIndex: number
  message: string
}

const props = withDefaults(
  defineProps<{
    activeMap: MapDef | null
    allLocations?: LocationInfo[]
    reachableIds: Set<string>
    collectedIds: Set<string>
    selectedMarkerIndex: number | null
  }>(),
  {
    allLocations: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:draft-map', value: MapDef | null): void
  (e: 'update:selected-marker-index', value: number | null): void
}>()

const draftMap = ref<MapDef | null>(null)
const codeSearchQuery = ref('')
const manualCodeInput = ref('')
const copyStatus = ref<'idle' | 'ok' | 'error'>('idle')
const editorRef = ref<HTMLElement | null>(null)
const panelPosition = ref<{ left: number; top: number } | null>(null)
const isDraggingPanel = ref(false)

let copyStatusTimer: number | null = null
let panelDragPointerId: number | null = null
let panelDragOffsetX = 0
let panelDragOffsetY = 0

const mapIconAutocompleteId = 'map-icon-autocomplete-dev'
const mapIconNames = [...MAP_ICON_INDEX].sort((a, b) => a.localeCompare(b))
const mapIconNameSet = new Set(mapIconNames)

function cloneMapDef(mapDef: MapDef): MapDef {
  return {
    id: mapDef.id,
    title: mapDef.title,
    image: mapDef.image,
    width: mapDef.width,
    height: mapDef.height,
    markers: mapDef.markers.map((marker) => ({
      coords: [marker.coords[0], marker.coords[1]],
      image: marker.image,
      overlays: marker.overlays ? [...marker.overlays] : undefined,
      codes: Array.isArray(marker.codes) ? [...marker.codes] : marker.codes,
    })),
  }
}

function formatOverlayLabel(overlay: MapMarkerOverlay): string {
  return overlay.replace(/_/g, ' ')
}

function markerCodeList(marker: MapMarkerDef): string[] {
  const rawList = Array.isArray(marker.codes) ? marker.codes : [marker.codes]
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0)
}

function assignMarkerCodes(marker: MapMarkerDef, nextCodes: string[]): void {
  const cleaned = nextCodes.map((value) => value.trim()).filter((value) => value.length > 0)
  if (cleaned.length === 0) {
    marker.codes = ''
    return
  }
  marker.codes = cleaned.length === 1 ? cleaned[0] : cleaned
}

function findDuplicateCodes(values: string[]): string[] {
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeCode(value)
    if (!normalized) continue
    if (seen.has(normalized)) {
      duplicates.add(normalized)
    } else {
      seen.add(normalized)
    }
  }
  return Array.from(duplicates)
}

function setCopyStatus(status: 'idle' | 'ok' | 'error'): void {
  copyStatus.value = status
  if (copyStatusTimer !== null) {
    window.clearTimeout(copyStatusTimer)
    copyStatusTimer = null
  }
  if (status === 'idle') return
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.value = 'idle'
    copyStatusTimer = null
  }, 1800)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getPanelContainer(): HTMLElement | null {
  return editorRef.value?.parentElement ?? null
}

function clampPanelPosition(left: number, top: number): { left: number; top: number } {
  const panel = editorRef.value
  const container = getPanelContainer()
  if (!panel || !container) {
    return { left, top }
  }

  const maxLeft = Math.max(0, container.clientWidth - panel.offsetWidth)
  const maxTop = Math.max(0, container.clientHeight - panel.offsetHeight)
  return {
    left: clamp(left, 0, maxLeft),
    top: clamp(top, 0, maxTop),
  }
}

function ensurePanelPosition(): { left: number; top: number } | null {
  if (panelPosition.value) {
    return panelPosition.value
  }
  const panel = editorRef.value
  const container = getPanelContainer()
  if (!panel || !container) {
    return null
  }
  const panelRect = panel.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const nextPosition = clampPanelPosition(
    panelRect.left - containerRect.left,
    panelRect.top - containerRect.top,
  )
  panelPosition.value = nextPosition
  return nextPosition
}

const editorStyle = computed<Record<string, string>>(() => {
  if (!panelPosition.value) return {}
  return {
    left: `${panelPosition.value.left}px`,
    top: `${panelPosition.value.top}px`,
    right: 'auto',
  }
})

function handleHeaderPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const panel = editorRef.value
  const container = getPanelContainer()
  const position = ensurePanelPosition()
  if (!panel || !container || !position) return

  if (event.cancelable) {
    event.preventDefault()
  }

  const containerRect = container.getBoundingClientRect()
  panelDragPointerId = event.pointerId
  panelDragOffsetX = event.clientX - containerRect.left - position.left
  panelDragOffsetY = event.clientY - containerRect.top - position.top
  isDraggingPanel.value = true

  if (!panel.hasPointerCapture(event.pointerId)) {
    try {
      panel.setPointerCapture(event.pointerId)
    } catch {
      // Ignore capture errors; drag still works while pointer remains over the panel.
    }
  }
}

function handleEditorPointerMove(event: PointerEvent): void {
  if (!isDraggingPanel.value || panelDragPointerId !== event.pointerId) return

  const container = getPanelContainer()
  if (!container) return

  if (event.cancelable) {
    event.preventDefault()
  }

  const containerRect = container.getBoundingClientRect()
  panelPosition.value = clampPanelPosition(
    event.clientX - containerRect.left - panelDragOffsetX,
    event.clientY - containerRect.top - panelDragOffsetY,
  )
}

function stopPanelDrag(pointerId: number): void {
  if (panelDragPointerId !== pointerId) return
  panelDragPointerId = null
  panelDragOffsetX = 0
  panelDragOffsetY = 0
  isDraggingPanel.value = false
}

function handleEditorPointerEnd(event: PointerEvent): void {
  stopPanelDrag(event.pointerId)
}

function handleEditorLostPointerCapture(event: PointerEvent): void {
  stopPanelDrag(event.pointerId)
}

function emitDraftMap(): void {
  emit('update:draft-map', draftMap.value)
}

function resetDraftFromActiveMap(): void {
  draftMap.value = props.activeMap ? cloneMapDef(props.activeMap) : null
  codeSearchQuery.value = ''
  manualCodeInput.value = ''
  setCopyStatus('idle')
  emitDraftMap()
}

const { locationIndex, resolveCodeToCheckIds } = useLocationCodeLookup(
  computed(() => props.allLocations),
  computed(() => props.reachableIds),
  computed(() => props.collectedIds),
)

const selectedDraftMarker = computed<MapMarkerDef | null>(() => {
  if (!draftMap.value || props.selectedMarkerIndex === null) return null
  return draftMap.value.markers[props.selectedMarkerIndex] ?? null
})

const selectedMarkerCodeList = computed(() =>
  selectedDraftMarker.value ? markerCodeList(selectedDraftMarker.value) : [],
)

const selectedMarkerCodeSet = computed(() => {
  const values = new Set<string>()
  selectedMarkerCodeList.value.forEach((code) => values.add(normalizeCode(code)))
  return values
})

const selectedMarkerDuplicateCodes = computed(() =>
  findDuplicateCodes(selectedMarkerCodeList.value),
)

const selectedMarkerUnresolvedCodes = computed(() => {
  return selectedMarkerCodeList.value.filter((code) => resolveCodeToCheckIds(code).length === 0)
})

const selectedMarkerImageUnknown = computed(() => {
  const marker = selectedDraftMarker.value
  if (!marker) return false
  const image = marker.image.trim()
  if (!image) return true
  return !mapIconNameSet.has(image)
})

const imageSuggestions = computed(() => {
  const marker = selectedDraftMarker.value
  const query = normalizeCode(marker?.image ?? '')
  if (!query) {
    return mapIconNames
  }
  return mapIconNames.filter((icon) => normalizeCode(icon).includes(query))
})

const locationSearchResults = computed(() => {
  const terms = normalizeCode(codeSearchQuery.value)
    .split(/\s+/)
    .filter((term) => term.length > 0)
  if (terms.length === 0) {
    return locationIndex.value.slice(0, LOCATION_SEARCH_LIMIT)
  }
  return locationIndex.value
    .filter(
      (entry) =>
        terms.every(
          (term) =>
            entry.normalizedId.includes(term) ||
            entry.normalizedBaseId.includes(term) ||
            entry.normalizedName.includes(term),
        ),
    )
    .slice(0, LOCATION_SEARCH_LIMIT)
})

const draftErrors = computed<DraftIssue[]>(() => {
  if (!draftMap.value) return []
  const issues: DraftIssue[] = []
  draftMap.value.markers.forEach((marker, markerIndex) => {
    const [x, y] = marker.coords
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      issues.push({
        markerIndex,
        message: 'Coords must be finite numbers',
      })
    }
    const codes = markerCodeList(marker)
    if (codes.length === 0) {
      issues.push({
        markerIndex,
        message: 'Marker must include at least one code',
      })
    }
    const duplicateCodes = findDuplicateCodes(codes)
    if (duplicateCodes.length > 0) {
      issues.push({
        markerIndex,
        message: `Duplicate codes are not allowed (${duplicateCodes.join(', ')})`,
      })
    }
  })
  return issues
})

const draftWarnings = computed<DraftIssue[]>(() => {
  if (!draftMap.value) return []
  const issues: DraftIssue[] = []
  draftMap.value.markers.forEach((marker, markerIndex) => {
    if (!mapIconNameSet.has(marker.image.trim())) {
      issues.push({
        markerIndex,
        message: `Unknown image key: "${marker.image}"`,
      })
    }
    const unresolved = markerCodeList(marker).filter((code) => resolveCodeToCheckIds(code).length === 0)
    if (unresolved.length > 0) {
      issues.push({
        markerIndex,
        message: `Unresolved/manual codes: ${unresolved.join(', ')}`,
      })
    }
  })
  return issues
})

const canExportDraft = computed(() => Boolean(draftMap.value) && draftErrors.value.length === 0)

function buildDraftExportMap(): MapDef | null {
  if (!draftMap.value) return null
  return {
    id: draftMap.value.id,
    title: draftMap.value.title,
    image: draftMap.value.image,
    width: draftMap.value.width,
    height: draftMap.value.height,
    markers: draftMap.value.markers.map((marker) => {
      const codes = markerCodeList(marker)
      const exportMarker: MapMarkerDef = {
        coords: [Number(marker.coords[0]), Number(marker.coords[1])],
        image: marker.image.trim(),
        codes: codes.length > 1 ? [...codes] : (codes[0] ?? ''),
      }
      if (marker.overlays && marker.overlays.length > 0) {
        exportMarker.overlays = [...marker.overlays]
      }
      return exportMarker
    }),
  }
}

function markerHasOverlay(marker: MapMarkerDef, overlay: MapMarkerOverlay): boolean {
  return (marker.overlays ?? []).includes(overlay)
}

function toggleSelectedOverlay(overlay: MapMarkerOverlay): void {
  const marker = selectedDraftMarker.value
  if (!marker) return
  const next = new Set(marker.overlays ?? [])
  if (next.has(overlay)) {
    next.delete(overlay)
  } else {
    next.add(overlay)
  }
  marker.overlays = MAP_MARKER_OVERLAYS.filter((entry) => next.has(entry))
  if (marker.overlays.length === 0) {
    marker.overlays = undefined
  }
}

function setSelectedMarkerImage(value: string): void {
  const marker = selectedDraftMarker.value
  if (!marker) return
  marker.image = value.trim()
}

function parseNumberInput(raw: string): number {
  const value = raw.trim()
  if (!value) return Number.NaN
  return Number(value)
}

function setSelectedCoord(axis: 0 | 1, value: number): void {
  const marker = selectedDraftMarker.value
  if (!marker) return
  marker.coords[axis] = value
}

function addCodeToSelectedMarker(code: string): void {
  const marker = selectedDraftMarker.value
  if (!marker) return
  const trimmed = code.trim()
  if (!trimmed) return
  const normalized = normalizeCode(trimmed)
  const existingCodes = markerCodeList(marker)
  if (existingCodes.some((existing) => normalizeCode(existing) === normalized)) {
    return
  }
  assignMarkerCodes(marker, [...existingCodes, trimmed])
}

function removeCodeFromSelectedMarker(code: string): void {
  const marker = selectedDraftMarker.value
  if (!marker) return
  const normalized = normalizeCode(code)
  const nextCodes = markerCodeList(marker).filter((entry) => normalizeCode(entry) !== normalized)
  assignMarkerCodes(marker, nextCodes)
}

function toggleLocationCode(locationId: string, selected: boolean): void {
  if (selected) {
    addCodeToSelectedMarker(locationId)
    return
  }
  removeCodeFromSelectedMarker(locationId)
}

function addManualCode(): void {
  addCodeToSelectedMarker(manualCodeInput.value)
  manualCodeInput.value = ''
}

function resetDraft(): void {
  resetDraftFromActiveMap()
  emit('update:selected-marker-index', null)
}

function exportMapJson(): void {
  if (!canExportDraft.value) return
  const exportMap = buildDraftExportMap()
  if (!exportMap) return
  const json = `${JSON.stringify(exportMap, null, 2)}\n`
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${exportMap.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function copyMapJson(): Promise<void> {
  if (!canExportDraft.value) return
  const exportMap = buildDraftExportMap()
  if (!exportMap || !navigator.clipboard) {
    setCopyStatus('error')
    return
  }
  try {
    await navigator.clipboard.writeText(`${JSON.stringify(exportMap, null, 2)}\n`)
    setCopyStatus('ok')
  } catch {
    setCopyStatus('error')
  }
}

watch(
  draftMap,
  () => {
    emitDraftMap()
  },
  { deep: true },
)

watch(
  () => props.activeMap?.id,
  () => {
    resetDraftFromActiveMap()
    emit('update:selected-marker-index', null)
  },
  { immediate: true },
)

watch(
  () => draftMap.value?.markers.length,
  (length) => {
    const selectedIndex = props.selectedMarkerIndex
    if (selectedIndex === null || !length) return
    if (selectedIndex >= length) {
      emit('update:selected-marker-index', null)
    }
  },
)

onBeforeUnmount(() => {
  if (copyStatusTimer !== null) {
    window.clearTimeout(copyStatusTimer)
    copyStatusTimer = null
  }
  panelDragPointerId = null
  isDraggingPanel.value = false
})
</script>

<template>
  <aside
    ref="editorRef"
    class="map-dev-editor"
    :class="{ 'is-dragging': isDraggingPanel }"
    :style="editorStyle"
    @pointermove="handleEditorPointerMove"
    @pointerup="handleEditorPointerEnd"
    @pointercancel="handleEditorPointerEnd"
    @lostpointercapture="handleEditorLostPointerCapture"
  >
    <header class="map-dev-editor__header" @pointerdown.stop="handleHeaderPointerDown">
      <h3>Marker Editor</h3>
      <p v-if="selectedMarkerIndex !== null">Marker #{{ selectedMarkerIndex + 1 }}</p>
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
      {{ copyStatus === 'ok' ? 'Map JSON copied to clipboard.' : 'Copy failed.' }}
    </p>

    <div v-if="draftErrors.length > 0" class="map-dev-editor__issue-group map-dev-editor__issue-group--error">
      <div class="map-dev-editor__issue-title">Export blocked</div>
      <ul>
        <li v-for="(issue, index) in draftErrors" :key="`error:${issue.markerIndex}:${index}`">
          Marker #{{ issue.markerIndex + 1 }}: {{ issue.message }}
        </li>
      </ul>
    </div>

    <div v-if="draftWarnings.length > 0" class="map-dev-editor__issue-group map-dev-editor__issue-group--warning">
      <div class="map-dev-editor__issue-title">Warnings</div>
      <ul>
        <li v-for="(issue, index) in draftWarnings" :key="`warning:${issue.markerIndex}:${index}`">
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
              step="0.1"
              :value="Number.isFinite(selectedDraftMarker.coords[0]) ? selectedDraftMarker.coords[0] : ''"
              @input="setSelectedCoord(0, parseNumberInput(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label>
            Y
            <input
              type="number"
              step="0.1"
              :value="Number.isFinite(selectedDraftMarker.coords[1]) ? selectedDraftMarker.coords[1] : ''"
              @input="setSelectedCoord(1, parseNumberInput(($event.target as HTMLInputElement).value))"
            />
          </label>
        </div>
      </section>

      <section class="map-dev-editor__section">
        <h4>Image</h4>
        <label>
          Icon key
          <input
            :value="selectedDraftMarker.image"
            :list="mapIconAutocompleteId"
            type="text"
            @input="setSelectedMarkerImage(($event.target as HTMLInputElement).value)"
          />
        </label>
        <p v-if="selectedMarkerImageUnknown" class="map-dev-editor__inline-warning">
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
            :class="{ 'is-active': markerHasOverlay(selectedDraftMarker, overlay) }"
            @click="toggleSelectedOverlay(overlay)"
          >
            {{ formatOverlayLabel(overlay) }}
          </button>
        </div>
      </section>

      <section class="map-dev-editor__section">
        <h4>Codes</h4>
        <label>
          Search locations
          <input
            v-model="codeSearchQuery"
            type="text"
            placeholder="Search by location id or name"
          />
        </label>
        <div class="map-dev-editor__location-list">
          <label
            v-for="entry in locationSearchResults"
            :key="entry.id"
            class="map-dev-editor__location-item"
          >
            <input
              type="checkbox"
              :checked="selectedMarkerCodeSet.has(normalizeCode(entry.id))"
              @change="toggleLocationCode(entry.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="map-dev-editor__location-id">{{ entry.id }}</span>
            <span class="map-dev-editor__location-name">{{ entry.name }}</span>
          </label>
          <p v-if="locationSearchResults.length === 0" class="map-dev-editor__location-empty">
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
          <button type="button" class="map-dev-editor__action map-dev-editor__action--small" @click="addManualCode">
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
            <button type="button" class="map-dev-editor__remove" @click="removeCodeFromSelectedMarker(code)">
              Remove
            </button>
          </div>
          <p v-if="selectedMarkerCodeList.length === 0" class="map-dev-editor__location-empty">
            Marker has no codes.
          </p>
        </div>

        <div
          v-if="selectedMarkerDuplicateCodes.length > 0"
          class="map-dev-editor__inline-warning"
        >
          Duplicate codes in marker: {{ selectedMarkerDuplicateCodes.join(', ') }}
        </div>
        <div
          v-if="selectedMarkerUnresolvedCodes.length > 0"
          class="map-dev-editor__inline-warning"
        >
          Unresolved/manual codes: {{ selectedMarkerUnresolvedCodes.join(', ') }}
        </div>
      </section>
    </template>

    <datalist :id="mapIconAutocompleteId">
      <option v-for="icon in imageSuggestions" :key="icon" :value="icon" />
    </datalist>
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

.map-dev-editor__location-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 0.35rem;
  row-gap: 0.08rem;
  border: 1px solid #1e293b;
  border-radius: 5px;
  padding: 0.25rem;
}

.map-dev-editor__location-item input {
  grid-row: 1 / span 2;
  margin: 0;
}

.map-dev-editor__location-id {
  font-size: 0.66rem;
  color: #e2e8f0;
  line-height: 1.2;
}

.map-dev-editor__location-name {
  font-size: 0.63rem;
  color: #94a3b8;
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
