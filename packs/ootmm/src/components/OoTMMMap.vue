<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  resolveBrokenOverlayImage,
  resolveDayComboOverlayImage,
  resolveDigitImage,
  resolveMapImage,
  resolveMarkerImage,
  resolveOverlayImage,
} from '../data/maps/assets'
import type {
  MapDef,
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

type OverlayRender = {
  key: string
  src: string
  wide: boolean
}

type MarkerRuntime = MapMarkerViewModel & {
  codeList: string[]
  allCheckIds: string[]
  reachableCheckIds: string[]
  reachableUncheckedCheckIds: string[]
  popupEntries: MapPopupEntry[]
  topLeftOverlays: OverlayRender[]
  bottomLeftOverlays: OverlayRender[]
  hasBrokenOverlay: boolean
  countDigitImages: string[]
}

const props = withDefaults(
  defineProps<{
    activeMap: MapDef | null
    reachableIds: Set<string>
    collectedIds: Set<string>
    visibilityMode?: MarkerVisibilityMode
  }>(),
  {
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

const activePointers = new Map<number, { x: number; y: number }>()
let lastDragPoint: { x: number; y: number } | null = null
let pinchStartDistance = 0
let pinchStartScale = 1

function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function stripWorldSuffix(value: string): string {
  return value.replace(/@\d+$/, '')
}

function looksLikeLocationId(value: string): boolean {
  return /@\d+$/.test(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampPanForScale(nextScale: number, x: number, y: number): { x: number; y: number } {
  const mapDef = props.activeMap
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
  const mapDef = props.activeMap
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
  const mapDef = props.activeMap
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

const knownLocationIds = computed(() => {
  const ids = new Set<string>()
  props.reachableIds.forEach((id) => ids.add(id))
  props.collectedIds.forEach((id) => ids.add(id))
  return ids
})

const codeLookup = computed(() => {
  const map = new Map<string, Set<string>>()
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
  const mapDef = props.activeMap
  if (!mapDef) {
    return []
  }

  return mapDef.markers.map((markerDef, markerIndex) => {
    const markerId = `${mapDef.id}:${markerIndex}`
    const overlays = markerDef.overlays ?? []
    const codeList = Array.isArray(markerDef.codes) ? markerDef.codes : [markerDef.codes]
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
    const reachableCount = reachableCheckIds.length
    const isVisible =
      props.visibilityMode === 'reachable-any'
        ? reachableCount > 0
        : reachableUncheckedCheckIds.length > 0

    const countDigitImages =
      Array.isArray(markerDef.codes) && reachableCount > 1
        ? String(reachableCount).split('').map((digit) => resolveDigitImage(digit))
        : []

    return {
      id: markerId,
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

const activePopup = computed<MapPopupPayload | null>(() => {
  const marker = popupMarker.value
  if (!marker) return null

  const title =
    marker.popupEntries.length === 1 ? stripWorldSuffix(marker.popupEntries[0].code) : `${marker.popupEntries.length} checks`

  return {
    markerId: marker.id,
    title,
    entries: marker.popupEntries,
    canMarkAll: marker.reachableUncheckedCheckIds.length > 0,
    markAllAffectsReachableOnly: true,
  }
})

const sceneStyle = computed(() => {
  const mapDef = props.activeMap
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
  const popupWidth = 260
  const popupHeight = 230
  const maxX = Math.max(8, viewport.clientWidth - popupWidth)
  const maxY = Math.max(8, viewport.clientHeight - popupHeight)
  const left = clamp(rawX, 8, maxX)
  const top = clamp(rawY, 8, maxY)

  return {
    left: `${left}px`,
    top: `${top}px`,
  }
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
  if (!props.activeMap) return
  const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR
  applyScaleAtClientPoint(scale.value * factor, event.clientX, event.clientY)
}

function handlePointerDown(event: PointerEvent): void {
  if (!props.activeMap) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const target = event.target as HTMLElement | null
  if (target?.closest('.map-marker') || target?.closest('.map-popup')) {
    return
  }

  viewportRef.value?.setPointerCapture(event.pointerId)
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size === 1) {
    isDragging.value = true
    lastDragPoint = { x: event.clientX, y: event.clientY }
  } else if (activePointers.size === 2) {
    isDragging.value = false
    lastDragPoint = null
    beginPinch()
  }

  closePopup()
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size >= 2 && pinchStartDistance > 0) {
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

  if (!isDragging.value || !lastDragPoint || !props.activeMap) return

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
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closePopup()
}

watch(
  () => props.activeMap?.id,
  async () => {
    closePopup()
    await nextTick()
    fitMapToViewport()
  },
  { immediate: true },
)

watch(markerViewModels, () => {
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
  resizeObserver?.disconnect()
  resizeObserver = null
  activePointers.clear()
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
    @pointerleave="handlePointerEnd"
  >
    <div v-if="!activeMap" class="ootmm-map__empty">No active map selected.</div>

    <template v-else>
      <div class="ootmm-map__scene" :style="sceneStyle">
        <img
          class="ootmm-map__image"
          :src="resolveMapImage(activeMap.image)"
          :width="activeMap.width"
          :height="activeMap.height"
          :alt="activeMap.title"
          draggable="false"
        />

        <button
          v-for="marker in visibleMarkers"
          :key="marker.id"
          type="button"
          class="map-marker"
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
            <p>{{ popupMarker.checkedCount }} checked / {{ popupMarker.reachableCount }} reachable</p>
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
  cursor: grab;
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

@media (max-width: 600px) {
  .map-popup {
    width: 240px;
  }
}
</style>
