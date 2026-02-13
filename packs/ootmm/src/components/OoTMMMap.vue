<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LocationInfo } from '@/types/tracker'
import {
  resolveBrokenOverlayImage,
  resolveDayComboOverlayImage,
  resolveDigitImage,
  resolveMapImage,
  resolveMarkerImage,
  resolveOverlayImage,
} from '../data/maps/assets'
import { MAP_ICON_INDEX } from '../data/maps/mapIconIndex'
import type {
  MapDef,
  MapMarkerDef,
  MapMarkerOverlay,
  MapMarkerViewModel,
  MapPopupEntry,
  MapPopupPayload,
  MarkerVisibilityMode,
} from '../data/maps/types'

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const WHEEL_ZOOM_FACTOR = 1.1
const MARKER_SIZE = 16
const LOCATION_SEARCH_LIMIT = 80
const MAP_POPUP_WIDTH = 260
const MAP_POPUP_HEIGHT = 230

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

type OverlayRender = {
  key: string
  src: string
  wide: boolean
}

type MarkerRuntime = MapMarkerViewModel & {
  markerIndex: number
  codeList: string[]
  allCheckIds: string[]
  reachableCheckIds: string[]
  reachableUncheckedCheckIds: string[]
  reachableUncheckedCount: number
  popupEntries: MapPopupEntry[]
  topLeftOverlays: OverlayRender[]
  bottomLeftOverlays: OverlayRender[]
  hasBrokenOverlay: boolean
  countDigitImages: string[]
}

type LocationIndexEntry = {
  id: string
  name: string
  normalizedId: string
  normalizedBaseId: string
  normalizedName: string
}

type DraftIssue = {
  markerIndex: number
  message: string
}

const props = withDefaults(
  defineProps<{
    activeMap: MapDef | null
    reachableIds: Set<string>
    collectedIds: Set<string>
    allLocations?: LocationInfo[]
    devMode?: boolean
    visibilityMode?: MarkerVisibilityMode
  }>(),
  {
    allLocations: () => [],
    devMode: false,
    visibilityMode: 'reachable-unchecked',
  },
)

const emit = defineEmits<{
  (e: 'toggle-collected', checkId: string): void
  (e: 'mark-all-reachable', checkIds: string[]): void
  (e: 'open-popup', markerId: string): void
  (e: 'close-popup'): void
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const popupRef = ref<HTMLDivElement | null>(null)

const scale = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const popupMarkerId = ref<string | null>(null)

const draftMap = ref<MapDef | null>(null)
const selectedMarkerIndex = ref<number | null>(null)
const codeSearchQuery = ref('')
const manualCodeInput = ref('')
const copyStatus = ref<'idle' | 'ok' | 'error'>('idle')

const activePointers = new Map<number, { x: number; y: number }>()
let lastDragPoint: { x: number; y: number } | null = null
let pinchStartDistance = 0
let pinchStartScale = 1
let copyStatusTimer: number | null = null

const mapIconNames = [...MAP_ICON_INDEX].sort((a, b) => a.localeCompare(b))
const mapIconNameSet = new Set(mapIconNames)

const renderMapDef = computed<MapDef | null>(() => (props.devMode ? draftMap.value : props.activeMap))
const isDevMode = computed(() => props.devMode)

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

function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function stripWorldSuffix(value: string): string {
  return value.replace(/@\d+$/, '')
}

function formatOverlayLabel(overlay: MapMarkerOverlay): string {
  return overlay.replace(/_/g, ' ')
}

function looksLikeLocationId(value: string): boolean {
  return /@\d+$/.test(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

function resetDraftFromActiveMap(): void {
  draftMap.value = props.activeMap ? cloneMapDef(props.activeMap) : null
  selectedMarkerIndex.value = null
  codeSearchQuery.value = ''
  manualCodeInput.value = ''
  setCopyStatus('idle')
}

function syncPointerState(): void {
  if (activePointers.size < 2) {
    pinchStartDistance = 0
  }

  if (activePointers.size === 1) {
    const [remaining] = Array.from(activePointers.values())
    isDragging.value = true
    lastDragPoint = { x: remaining.x, y: remaining.y }
    return
  }

  isDragging.value = false
  lastDragPoint = null

  if (activePointers.size >= 2) {
    beginPinch()
  }
}

function clampPanForScale(nextScale: number, x: number, y: number): { x: number; y: number } {
  const mapDef = renderMapDef.value
  const viewport = viewportRef.value
  if (!mapDef || !viewport) {
    return { x, y }
  }

  const viewportWidth = viewport.clientWidth
  const viewportHeight = viewport.clientHeight
  const scaledWidth = mapDef.width * nextScale
  const scaledHeight = mapDef.height * nextScale

  const nextX =
    scaledWidth <= viewportWidth
      ? (viewportWidth - scaledWidth) / 2
      : clamp(x, viewportWidth - scaledWidth, 0)
  const nextY =
    scaledHeight <= viewportHeight
      ? (viewportHeight - scaledHeight) / 2
      : clamp(y, viewportHeight - scaledHeight, 0)

  return { x: nextX, y: nextY }
}

function fitMapToViewport(): void {
  const mapDef = renderMapDef.value
  const viewport = viewportRef.value
  if (!mapDef || !viewport) {
    return
  }

  const viewportWidth = viewport.clientWidth
  const viewportHeight = viewport.clientHeight
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return
  }

  const containScale = Math.min(viewportWidth / mapDef.width, viewportHeight / mapDef.height)
  const nextScale = clamp(containScale, MIN_SCALE, MAX_SCALE)
  const centeredX = (viewportWidth - mapDef.width * nextScale) / 2
  const centeredY = (viewportHeight - mapDef.height * nextScale) / 2
  const bounded = clampPanForScale(nextScale, centeredX, centeredY)
  scale.value = nextScale
  panX.value = bounded.x
  panY.value = bounded.y
}

function applyScaleAtClientPoint(nextScaleRaw: number, clientX: number, clientY: number): void {
  const viewport = viewportRef.value
  const mapDef = renderMapDef.value
  if (!viewport || !mapDef) {
    return
  }

  const nextScale = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE)
  const rect = viewport.getBoundingClientRect()
  const anchorX = clientX - rect.left
  const anchorY = clientY - rect.top

  const mapX = (anchorX - panX.value) / scale.value
  const mapY = (anchorY - panY.value) / scale.value
  const projectedX = anchorX - mapX * nextScale
  const projectedY = anchorY - mapY * nextScale
  const bounded = clampPanForScale(nextScale, projectedX, projectedY)

  scale.value = nextScale
  panX.value = bounded.x
  panY.value = bounded.y
}

function beginPinch(): void {
  const pointers = Array.from(activePointers.values())
  if (pointers.length < 2) {
    pinchStartDistance = 0
    return
  }
  const [first, second] = pointers
  const distance = Math.hypot(second.x - first.x, second.y - first.y)
  if (distance <= 0) {
    pinchStartDistance = 0
    return
  }
  pinchStartDistance = distance
  pinchStartScale = scale.value
}

function addCodeLookup(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!key) return
  const existing = map.get(key)
  if (existing) {
    existing.add(value)
    return
  }
  map.set(key, new Set([value]))
}

const locationIndex = computed<LocationIndexEntry[]>(() => {
  const byId = new Map<string, LocationIndexEntry>()
  for (const location of props.allLocations) {
    if (!location?.id) continue
    byId.set(location.id, {
      id: location.id,
      name: location.name || location.id,
      normalizedId: normalizeCode(location.id),
      normalizedBaseId: normalizeCode(stripWorldSuffix(location.id)),
      normalizedName: normalizeCode(location.name || ''),
    })
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
})

const knownLocationIds = computed(() => {
  const ids = new Set<string>()
  locationIndex.value.forEach((entry) => ids.add(entry.id))
  props.reachableIds.forEach((id) => ids.add(id))
  props.collectedIds.forEach((id) => ids.add(id))
  return ids
})

const codeLookup = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const entry of locationIndex.value) {
    addCodeLookup(map, entry.id, entry.id)
    addCodeLookup(map, entry.normalizedId, entry.id)
    addCodeLookup(map, stripWorldSuffix(entry.id), entry.id)
    addCodeLookup(map, entry.normalizedBaseId, entry.id)
    addCodeLookup(map, entry.normalizedName, entry.id)
  }
  for (const checkId of knownLocationIds.value) {
    addCodeLookup(map, checkId, checkId)
    addCodeLookup(map, normalizeCode(checkId), checkId)
    const baseName = stripWorldSuffix(checkId)
    addCodeLookup(map, baseName, checkId)
    addCodeLookup(map, normalizeCode(baseName), checkId)
  }
  return map
})

function resolveCodeToCheckIds(code: string): string[] {
  const keys = [code, normalizeCode(code), stripWorldSuffix(code), normalizeCode(stripWorldSuffix(code))]
  for (const key of keys) {
    const values = codeLookup.value.get(key)
    if (values && values.size > 0) {
      return Array.from(values)
    }
  }
  return []
}

const locationSearchResults = computed(() => {
  const query = normalizeCode(codeSearchQuery.value)
  if (!query) {
    return locationIndex.value.slice(0, LOCATION_SEARCH_LIMIT)
  }
  return locationIndex.value
    .filter(
      (entry) =>
        entry.normalizedId.includes(query) ||
        entry.normalizedBaseId.includes(query) ||
        entry.normalizedName.includes(query),
    )
    .slice(0, LOCATION_SEARCH_LIMIT)
})

function buildTopLeftOverlays(overlays: MapMarkerOverlay[]): OverlayRender[] {
  const result: OverlayRender[] = []
  const has = new Set(overlays)

  for (const single of ['child', 'adult', 'jp_only', 'na_only'] as const) {
    if (!has.has(single)) continue
    result.push({
      key: single,
      src: resolveOverlayImage(single),
      wide: single === 'jp_only' || single === 'na_only',
    })
  }

  const dayOverlays = (['day1', 'day2', 'day3'] as const).filter((day) => has.has(day))
  if (dayOverlays.length === 1) {
    const onlyDay = dayOverlays[0]
    result.push({
      key: onlyDay,
      src: resolveOverlayImage(onlyDay),
      wide: false,
    })
  } else if (dayOverlays.length === 2) {
    const combo = resolveDayComboOverlayImage(dayOverlays[0], dayOverlays[1])
    if (combo) {
      result.push({
        key: dayOverlays.join('+'),
        src: combo,
        wide: true,
      })
    }
  }

  return result
}

function buildBottomLeftOverlays(overlays: MapMarkerOverlay[]): OverlayRender[] {
  const result: OverlayRender[] = []
  const has = new Set(overlays)
  for (const item of ['night', 'day'] as const) {
    if (!has.has(item)) continue
    result.push({
      key: item,
      src: resolveOverlayImage(item),
      wide: false,
    })
  }
  return result
}

const markerViewModels = computed<MarkerRuntime[]>(() => {
  const mapDef = renderMapDef.value
  if (!mapDef) {
    return []
  }

  return mapDef.markers.map((markerDef, markerIndex) => {
    const markerId = `${mapDef.id}:${markerIndex}`
    const overlays = markerDef.overlays ?? []
    const codeList = markerCodeList(markerDef)
    const popupEntries: MapPopupEntry[] = []
    const resolvedCheckIds = new Set<string>()

    codeList.forEach((code, codeIndex) => {
      const resolved = resolveCodeToCheckIds(code)
      const candidateIds = resolved.length > 0 ? resolved : looksLikeLocationId(code) ? [code] : []

      if (candidateIds.length === 0) {
        popupEntries.push({
          id: `${markerId}:${codeIndex}:missing`,
          code,
          checkId: null,
          isReachable: false,
          isChecked: false,
        })
        return
      }

      candidateIds.forEach((checkId, candidateIndex) => {
        resolvedCheckIds.add(checkId)
        popupEntries.push({
          id: `${markerId}:${codeIndex}:${candidateIndex}`,
          code,
          checkId,
          isReachable: props.reachableIds.has(checkId),
          isChecked: props.collectedIds.has(checkId),
        })
      })
    })

    const allCheckIds = Array.from(resolvedCheckIds)
    const reachableCheckIds = allCheckIds.filter((checkId) => props.reachableIds.has(checkId))
    const checkedCount = allCheckIds.filter((checkId) => props.collectedIds.has(checkId)).length
    const reachableUncheckedCheckIds = allCheckIds.filter(
      (checkId) => props.reachableIds.has(checkId) && !props.collectedIds.has(checkId),
    )
    const reachableUncheckedCount = reachableUncheckedCheckIds.length
    const reachableCount = reachableCheckIds.length
    const isVisible = props.devMode
      ? true
      : props.visibilityMode === 'reachable-any'
        ? reachableCount > 0
        : reachableUncheckedCount > 0

    const countDigitImages =
      Array.isArray(markerDef.codes) && reachableUncheckedCount > 1
        ? String(reachableUncheckedCount).split('').map((digit) => resolveDigitImage(digit))
        : []

    return {
      id: markerId,
      markerIndex,
      coords: markerDef.coords,
      image: markerDef.image,
      overlays,
      codes: markerDef.codes,
      reachableCount,
      checkedCount,
      isVisible,
      codeList,
      allCheckIds,
      reachableCheckIds,
      reachableUncheckedCheckIds,
      reachableUncheckedCount,
      popupEntries,
      topLeftOverlays: buildTopLeftOverlays(overlays),
      bottomLeftOverlays: buildBottomLeftOverlays(overlays),
      hasBrokenOverlay: overlays.includes('broken'),
      countDigitImages,
    }
  })
})

const markerById = computed(() => {
  return new Map(markerViewModels.value.map((marker) => [marker.id, marker]))
})

const visibleMarkers = computed(() => markerViewModels.value.filter((marker) => marker.isVisible))
const popupMarker = computed(() =>
  popupMarkerId.value ? markerById.value.get(popupMarkerId.value) ?? null : null,
)
const selectedDraftMarker = computed<MapMarkerDef | null>(() => {
  if (!props.devMode || !draftMap.value || selectedMarkerIndex.value === null) return null
  return draftMap.value.markers[selectedMarkerIndex.value] ?? null
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

const draftErrors = computed<DraftIssue[]>(() => {
  if (!props.devMode || !draftMap.value) return []
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
  if (!props.devMode || !draftMap.value) return []
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

const canExportDraft = computed(() => props.devMode && Boolean(draftMap.value) && draftErrors.value.length === 0)

const activePopup = computed<MapPopupPayload | null>(() => {
  const marker = popupMarker.value
  if (!marker || props.devMode) return null

  const title =
    marker.popupEntries.length === 1
      ? stripWorldSuffix(marker.popupEntries[0].code)
      : `${marker.popupEntries.length} checks`

  return {
    markerId: marker.id,
    title,
    entries: marker.popupEntries,
    canMarkAll: marker.reachableUncheckedCheckIds.length > 0,
    markAllAffectsReachableOnly: true,
  }
})

const sceneStyle = computed(() => {
  const mapDef = renderMapDef.value
  if (!mapDef) return {}
  return {
    width: `${mapDef.width}px`,
    height: `${mapDef.height}px`,
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  }
})

function markerStyle(marker: MarkerRuntime): Record<string, string> {
  return {
    left: `${marker.coords[0]}px`,
    top: `${marker.coords[1]}px`,
  }
}

function popupStyle(): Record<string, string> {
  const marker = popupMarker.value
  const viewport = viewportRef.value
  if (!marker || !viewport) return {}

  const rawX = marker.coords[0] * scale.value + panX.value + MARKER_SIZE * 0.75
  const rawY = marker.coords[1] * scale.value + panY.value + MARKER_SIZE * 0.75
  const maxX = Math.max(8, viewport.clientWidth - MAP_POPUP_WIDTH)
  const maxY = Math.max(8, viewport.clientHeight - MAP_POPUP_HEIGHT)
  const left = clamp(rawX, 8, maxX)
  const top = clamp(rawY, 8, maxY)

  return {
    left: `${left}px`,
    top: `${top}px`,
  }
}

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

function openPopup(markerId: string): void {
  popupMarkerId.value = markerId
  emit('open-popup', markerId)
}

function closePopup(): void {
  if (!popupMarkerId.value) return
  popupMarkerId.value = null
  emit('close-popup')
}

function handleMarkerClick(marker: MarkerRuntime): void {
  if (props.devMode) {
    selectedMarkerIndex.value = marker.markerIndex
    closePopup()
    return
  }

  if (Array.isArray(marker.codes)) {
    if (marker.reachableUncheckedCheckIds.length === 1) {
      emit('toggle-collected', marker.reachableUncheckedCheckIds[0])
      return
    }
    openPopup(marker.id)
    return
  }

  const directTarget =
    marker.reachableUncheckedCheckIds[0] ?? marker.reachableCheckIds[0] ?? marker.allCheckIds[0]
  if (directTarget) {
    emit('toggle-collected', directTarget)
  }
}

function handlePopupEntryClick(entry: MapPopupEntry): void {
  if (!entry.checkId || !entry.isReachable) return
  emit('toggle-collected', entry.checkId)
}

function handlePopupMarkAll(payload: MapPopupPayload): void {
  const ids = payload.entries
    .filter((entry) => entry.checkId && entry.isReachable && !entry.isChecked)
    .map((entry) => entry.checkId as string)
  if (ids.length === 0) return
  emit('mark-all-reachable', Array.from(new Set(ids)))
}

function handleWheel(event: WheelEvent): void {
  if (!renderMapDef.value) return
  const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR
  applyScaleAtClientPoint(scale.value * factor, event.clientX, event.clientY)
}

function handlePointerDown(event: PointerEvent): void {
  if (!renderMapDef.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const target = event.target as HTMLElement | null
  if (target?.closest('.map-marker') || target?.closest('.map-popup') || target?.closest('.map-dev-editor')) {
    return
  }

  if (event.cancelable) {
    event.preventDefault()
  }
  const viewport = viewportRef.value
  if (viewport && !viewport.hasPointerCapture(event.pointerId)) {
    try {
      viewport.setPointerCapture(event.pointerId)
    } catch {
      // Ignore capture errors; drag still works while pointer remains over the viewport.
    }
  }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  syncPointerState()

  closePopup()
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return
  if (event.cancelable) {
    event.preventDefault()
  }

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size >= 2) {
    if (pinchStartDistance <= 0) {
      beginPinch()
    }
    if (pinchStartDistance <= 0) {
      return
    }
    const pointers = Array.from(activePointers.values())
    const [first, second] = pointers
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    if (distance > 0) {
      const centerX = (first.x + second.x) / 2
      const centerY = (first.y + second.y) / 2
      applyScaleAtClientPoint(pinchStartScale * (distance / pinchStartDistance), centerX, centerY)
    }
    return
  }

  if (!isDragging.value || !lastDragPoint || !renderMapDef.value) return

  const deltaX = event.clientX - lastDragPoint.x
  const deltaY = event.clientY - lastDragPoint.y
  const bounded = clampPanForScale(scale.value, panX.value + deltaX, panY.value + deltaY)
  panX.value = bounded.x
  panY.value = bounded.y
  lastDragPoint = { x: event.clientX, y: event.clientY }
}

function handlePointerEnd(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return
  activePointers.delete(event.pointerId)
  syncPointerState()
}

function handleLostPointerCapture(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return
  activePointers.delete(event.pointerId)
  syncPointerState()
}

function handleWindowBlur(): void {
  if (activePointers.size === 0) return
  activePointers.clear()
  syncPointerState()
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (props.devMode) {
    selectedMarkerIndex.value = null
    return
  }
  closePopup()
}

function resetDraft(): void {
  resetDraftFromActiveMap()
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
  [() => props.activeMap?.id, () => props.devMode],
  async () => {
    closePopup()
    if (props.devMode) {
      resetDraftFromActiveMap()
    } else {
      draftMap.value = null
      selectedMarkerIndex.value = null
      codeSearchQuery.value = ''
      manualCodeInput.value = ''
      setCopyStatus('idle')
    }
    await nextTick()
    fitMapToViewport()
  },
  { immediate: true },
)

watch(
  () => renderMapDef.value?.id,
  async () => {
    await nextTick()
    fitMapToViewport()
  },
)

watch(
  () => draftMap.value?.markers.length,
  (length) => {
    if (selectedMarkerIndex.value === null || !length) return
    if (selectedMarkerIndex.value >= length) {
      selectedMarkerIndex.value = null
    }
  },
)

watch(markerViewModels, () => {
  if (props.devMode) return
  const activeMarkerId = popupMarkerId.value
  if (!activeMarkerId) return
  const marker = markerById.value.get(activeMarkerId)
  if (!marker || !marker.isVisible) {
    closePopup()
  }
})

watch(activePopup, async (popup) => {
  if (!popup) return
  await nextTick()
  const target = popupRef.value?.querySelector<HTMLElement>('button:not(:disabled)')
  target?.focus()
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('keydown', handleEscapeKey)
  window.addEventListener('blur', handleWindowBlur)
  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      const bounded = clampPanForScale(scale.value, panX.value, panY.value)
      panX.value = bounded.x
      panY.value = bounded.y
    })
    resizeObserver.observe(viewportRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscapeKey)
  window.removeEventListener('blur', handleWindowBlur)
  resizeObserver?.disconnect()
  resizeObserver = null
  activePointers.clear()
  if (copyStatusTimer !== null) {
    window.clearTimeout(copyStatusTimer)
    copyStatusTimer = null
  }
  syncPointerState()
})
</script>

<template>
  <div
    ref="viewportRef"
    class="ootmm-map"
    :class="{ 'is-dragging': isDragging }"
    @wheel.prevent="handleWheel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @lostpointercapture="handleLostPointerCapture"
    @dragstart.prevent
    @selectstart.prevent
  >
    <div v-if="!renderMapDef" class="ootmm-map__empty">No active map selected.</div>

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

        <button
          v-for="marker in visibleMarkers"
          :key="marker.id"
          type="button"
          class="map-marker"
          :class="{ 'is-selected': isDevMode && selectedMarkerIndex === marker.markerIndex }"
          :style="markerStyle(marker)"
          :aria-label="`Map marker: ${marker.codeList.join(', ')}`"
          @pointerdown.stop
          @click.stop="handleMarkerClick(marker)"
        >
          <img
            class="map-marker__icon"
            :src="resolveMarkerImage(marker.image)"
            alt=""
            draggable="false"
          />

          <span v-if="marker.topLeftOverlays.length > 0" class="map-marker__corner map-marker__corner--top-left">
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

          <span v-if="marker.hasBrokenOverlay" class="map-marker__corner map-marker__corner--top-right">
            <img class="map-marker__overlay" :src="resolveBrokenOverlayImage()" alt="" draggable="false" />
          </span>

          <span v-if="marker.countDigitImages.length > 0" class="map-marker__corner map-marker__corner--bottom-right">
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
        v-if="activePopup && popupMarker"
        ref="popupRef"
        class="map-popup"
        role="dialog"
        aria-modal="false"
        :aria-label="activePopup.title"
        :style="popupStyle()"
        @pointerdown.stop
      >
        <header class="map-popup__header">
          <div class="map-popup__icon">
            <img class="map-popup__base" :src="resolveMarkerImage(popupMarker.image)" alt="" draggable="false" />
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
            <span v-if="popupMarker.hasBrokenOverlay" class="map-popup__corner map-popup__corner--top-right">
              <img class="map-popup__overlay" :src="resolveBrokenOverlayImage()" alt="" draggable="false" />
            </span>
          </div>
          <div class="map-popup__titles">
            <h3>{{ activePopup.title }}</h3>
            <p>{{ popupMarker.checkedCount }} checked / {{ popupMarker.reachableUncheckedCount }} reachable unchecked</p>
          </div>
          <button type="button" class="map-popup__close" aria-label="Close popup" @click="closePopup">×</button>
        </header>

        <div class="map-popup__entries">
          <button
            v-for="entry in activePopup.entries"
            :key="entry.id"
            type="button"
            class="map-popup__entry"
            :class="{
              'is-reachable': entry.isReachable,
              'is-checked': entry.isChecked,
            }"
            :disabled="!entry.checkId || !entry.isReachable"
            @click="handlePopupEntryClick(entry)"
          >
            <span class="map-popup__entry-name">{{ stripWorldSuffix(entry.code) }}</span>
            <span class="map-popup__entry-state">
              {{ entry.isReachable ? (entry.isChecked ? 'Checked' : 'Reachable') : 'Unreachable' }}
            </span>
          </button>
        </div>

        <footer class="map-popup__footer">
          <button
            type="button"
            class="map-popup__mark-all"
            :disabled="!activePopup.canMarkAll"
            @click="handlePopupMarkAll(activePopup)"
          >
            Mark all checked
          </button>
          <span class="map-popup__hint">Affects currently reachable checks only.</span>
        </footer>
      </div>

      <aside
        v-if="isDevMode"
        class="map-dev-editor"
        @pointerdown.stop
      >
        <header class="map-dev-editor__header">
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
                list="map-icon-autocomplete"
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
      </aside>

      <datalist id="map-icon-autocomplete">
        <option v-for="icon in imageSuggestions" :key="icon" :value="icon" />
      </datalist>
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
}

.map-marker:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 1px;
}

.map-marker.is-selected {
  filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.9));
}

.map-marker__icon {
  width: 16px;
  height: 16px;
  display: block;
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

.map-popup__entries {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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

.map-popup__entry-state {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  flex: 0 0 auto;
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
  .map-popup {
    width: 240px;
  }

  .map-dev-editor {
    width: calc(100% - 16px);
    max-height: 60%;
  }
}
</style>
