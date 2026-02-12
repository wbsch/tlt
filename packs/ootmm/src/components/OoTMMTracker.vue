<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { TrackerPack } from '@/types/tracker'
import OoTMMInventory from './OoTMMInventory.vue'
import OoTMMLocations from './OoTMMLocations.vue'
import OoTMMSettings from './OoTMMSettings.vue'
import OoTMMItemGrid from './OoTMMItemGrid.vue'
import OoTMMWorld from './OoTMMWorld.vue'
import OoTMMTricks from './OoTMMTricks.vue'
import { DEFAULT_OOTMM_SETTINGS } from '../types/settings'
import { parseSpoilerLog } from '../utils/spoiler'
import { useOoTMMSessionStore } from '../stores/ootmmSession'
import { useOoTMMUiStore, type TrackerTab } from '../stores/ootmmUi'
import * as ItemsMod from '@ootmm/core/items/index'
import * as NamesMod from '@ootmm/core/names'
import * as SettingsDataMod from '@ootmm/core/settings/data.js'

const props = defineProps<{
  tracker: TrackerPack
}>()

type SettingsPanelHandle = {
  hasUnsavedChanges: () => boolean
  getLocalSettingsSnapshot: () => Record<string, unknown>
}

const resolveExport = <T,>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown }
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T)
}
const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items')
const itemName = resolveExport<typeof NamesMod.itemName>(NamesMod, 'itemName')
const coreSettings = (SettingsDataMod as { SETTINGS?: unknown[] })?.SETTINGS ?? []
const settingsByKey = new Map<string, unknown>(coreSettings.map((setting: unknown) => [(setting as { key: string }).key, setting]))
const settingsByName = new Map<string, unknown>(coreSettings.map((setting: unknown) => [(setting as { name: string }).name, setting]))
const supportedSettingKeys = new Set(Object.keys(DEFAULT_OOTMM_SETTINGS))
const itemNameToId = new Map<string, string>()

const normalizeName = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

if (Items) {
  for (const item of Object.values(Items as Record<string, unknown>)) {
    const id = (item as { id?: string })?.id
    if (!id) continue
    const name = itemName ? itemName(id) : id
    itemNameToId.set(normalizeName(name), id)
  }
}

const sessionStore = useOoTMMSessionStore()
const uiStore = useOoTMMUiStore()

const {
  inventoryMap: inventory,
  reachableLocationIdSet: reachableLocationIds,
  availableItemIdSet: availableItemIds,
  itemMaxCountsMap: itemMaxCounts,
  canComplete,
  stats,
  trackerSettings,
  preCompletedDungeons,
  collectedLocationIds,
  isApplyingSettings,
  preCompletedEnabled,
  canUndo,
  canRedo,
  allLocations,
} = storeToRefs(sessionStore)

const {
  activeTab,
  isLocationsSidebarOpen,
  isSpoilerDragActive,
  spoilerDragDepth,
} = storeToRefs(uiStore)

const settingsRef = ref<SettingsPanelHandle | null>(null)
const spoilerFileInput = ref<HTMLInputElement | null>(null)
const statsMenuRef = ref<HTMLDetailsElement | null>(null)
const isStatsMenuOpen = ref(false)

const MAJOR_DUNGEONS = [
  { id: 'DT', label: 'Deku Tree', game: 'oot' as const },
  { id: 'DC', label: 'Dodongo\'s Cavern', game: 'oot' as const },
  { id: 'JJ', label: 'Jabu-Jabu\'s Belly', game: 'oot' as const },
  { id: 'Forest', label: 'Forest Temple', game: 'oot' as const },
  { id: 'Fire', label: 'Fire Temple', game: 'oot' as const },
  { id: 'Water', label: 'Water Temple', game: 'oot' as const },
  { id: 'Shadow', label: 'Shadow Temple', game: 'oot' as const },
  { id: 'Spirit', label: 'Spirit Temple', game: 'oot' as const },
  { id: 'WF', label: 'Woodfall Temple', game: 'mm' as const },
  { id: 'SH', label: 'Snowhead Temple', game: 'mm' as const },
  { id: 'GB', label: 'Great Bay Temple', game: 'mm' as const },
  { id: 'ST', label: 'Stone Tower Temple', game: 'mm' as const },
]

watch(
  () => props.tracker,
  (nextTracker) => {
    sessionStore.attachTracker(nextTracker)
  },
  { immediate: true },
)

watch(
  preCompletedEnabled,
  () => {
    sessionStore.applyPreCompletedDungeons()
  },
  { immediate: true },
)

watch(isApplyingSettings, (applying) => {
  if (applying) {
    closeStatsMenu()
  }
})

function fillInventory() {
  sessionStore.fillInventoryForDebugActivateAll()
}

async function undo() {
  if (isApplyingSettings.value || !canUndo.value) return
  closeStatsMenu()
  await sessionStore.undo()
}

async function redo() {
  if (isApplyingSettings.value || !canRedo.value) return
  closeStatsMenu()
  await sessionStore.redo()
}

function handleInventoryChange(newInventory: Map<string, number>) {
  sessionStore.setInventoryFromMap(newInventory)
}

async function handleSettingsChange(newSettings: Record<string, unknown>) {
  await sessionStore.applySettings(newSettings)
}

function applySpecialCondsPatch(patch: Record<string, unknown>) {
  sessionStore.applySpecialCondsPatch(patch)
}

interface SettingDef {
  type?: string
}

function coerceSettingValue(raw: unknown, def?: SettingDef) {
  if (!def) return raw
  
  if (def.type === 'set') {
    if (raw && typeof raw === 'object' && typeof (raw as { type?: string }).type === 'string') {
      return raw
    }
    if (Array.isArray(raw)) {
      return { type: 'specific', values: raw }
    }
    if (typeof raw === 'string') {
      return { type: raw }
    }
    return raw
  }
  
  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    if (raw === 'true') return true
    if (raw === 'false') return false
  }
  
  if (def.type === 'number') {
    if (typeof raw === 'number') return raw
    const num = Number(raw)
    return Number.isNaN(num) ? raw : num
  }
  
  return raw
}

interface WorldFlagDef {
  type?: string
  values?: Array<{ name?: string; value?: unknown }>
}

function coerceWorldFlagValue(raw: unknown, def?: WorldFlagDef) {
  if (!def || def.type !== 'set') {
    return raw
  }
  
  if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'specific' && Array.isArray((raw as { values?: unknown[] }).values)) {
    const lookup = new Map(def.values?.map((v) => [v.name, v.value]) ?? [])
    const values = (raw as { values?: string[] }).values?.map((name) => lookup.get(name)).filter(Boolean)
    return { type: 'specific', values }
  }
  
  if (typeof raw === 'string') {
    return { type: raw }
  }
  
  return raw
}

function applyStartingItems(startingItems: Record<string, number>) {
  const nextById: Record<string, number> = {}
  for (const [name, count] of Object.entries(startingItems)) {
    if (!count || count <= 0) continue
    const itemId = itemNameToId.get(normalizeName(name))
    if (!itemId) {
      console.warn('[OoTMM Tracker] Unknown starting item:', name)
      continue
    }
    nextById[itemId] = Math.max(nextById[itemId] ?? 0, count)
  }
  sessionStore.mergeInventoryCounts(nextById)
}

function applyJunkLocations(junkLocations: string[]) {
  if (junkLocations.length === 0) return
  const locations = allLocations.value
  const byName = new Map<string, string[]>()
  for (const loc of locations) {
    const key = normalizeName(loc.name)
    const existing = byName.get(key) ?? []
    existing.push(loc.id)
    byName.set(key, existing)
  }
  const next = new Set(collectedLocationIds.value)
  for (const locName of junkLocations) {
    const ids = byName.get(normalizeName(locName))
    if (!ids) {
      console.warn('[OoTMM Tracker] Junk location not found:', locName)
      continue
    }
    for (const id of ids) {
      next.add(id)
    }
  }
  sessionStore.setCollectedLocationIds(Array.from(next))
}

async function applySpoilerLog(text: string) {
  if (isApplyingSettings.value) return
  const parsed = parseSpoilerLog(text)
  const settingsPatch: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(parsed.settings)) {
    if (!supportedSettingKeys.has(key)) continue
    const def = settingsByKey.get(key)
    settingsPatch[key] = coerceSettingValue(value, def)
  }

  for (const [name, value] of Object.entries(parsed.worldFlags)) {
    const def = settingsByName.get(name)
    if (!def || !supportedSettingKeys.has((def as { key?: string }).key)) continue
    settingsPatch[(def as { key?: string }).key] = coerceWorldFlagValue(value, def)
  }

  const nextSettings = { ...trackerSettings.value, ...settingsPatch }
  if (Object.keys(parsed.specialConds).length > 0) {
    nextSettings.specialConds = parsed.specialConds
  }

  if (Object.keys(settingsPatch).length > 0 || Object.keys(parsed.specialConds).length > 0) {
    await handleSettingsChange(nextSettings)
  }

  if (parsed.preCompletedDungeons.length > 0) {
    sessionStore.setPreCompletedDungeons(Array.from(new Set(parsed.preCompletedDungeons)))
  }

  if (Object.keys(parsed.startingItems).length > 0) {
    applyStartingItems(parsed.startingItems)
  }

  if (parsed.junkLocations.length > 0) {
    applyJunkLocations(parsed.junkLocations)
  }
}

async function handleSpoilerFile(file: File) {
  if (!file) return
  const text = await file.text()
  await applySpoilerLog(text)
}

function openSpoilerFileDialog() {
  if (isApplyingSettings.value) return
  spoilerFileInput.value?.click()
}

async function onSpoilerFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await handleSpoilerFile(file)
  }
  input.value = ''
}

function hasFilePayload(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onSpoilerDragEnter(event: DragEvent) {
  if (!hasFilePayload(event)) return
  event.preventDefault()
  spoilerDragDepth.value += 1
  isSpoilerDragActive.value = true
}

function onSpoilerDragLeave(event: DragEvent) {
  if (!hasFilePayload(event)) return
  event.preventDefault()
  spoilerDragDepth.value = Math.max(0, spoilerDragDepth.value - 1)
  if (spoilerDragDepth.value === 0) {
    isSpoilerDragActive.value = false
  }
}

function onSpoilerDragOver(event: DragEvent) {
  if (!hasFilePayload(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isSpoilerDragActive.value = true
}

async function onSpoilerDrop(event: DragEvent) {
  if (!hasFilePayload(event)) return
  event.preventDefault()
  spoilerDragDepth.value = 0
  isSpoilerDragActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    await handleSpoilerFile(file)
  }
}

async function requestTabSwitch(nextTab: TrackerTab) {
  if (activeTab.value === nextTab) return
  if (isApplyingSettings.value) return

  if (activeTab.value === 'settings' || activeTab.value === 'tricks') {
    const settingsHandle = settingsRef.value
    if (settingsHandle?.hasUnsavedChanges()) {
      await handleSettingsChange(settingsHandle.getLocalSettingsSnapshot())
    }
  }

  uiStore.setActiveTab(nextTab)
}

function handleStatsMenuToggle(event: Event) {
  isStatsMenuOpen.value = (event.target as HTMLDetailsElement).open
}

function closeStatsMenu() {
  isStatsMenuOpen.value = false
  if (statsMenuRef.value) {
    statsMenuRef.value.open = false
  }
}

function resetTrackerState() {
  closeStatsMenu()
  const resetFn = (window as Window & { __TLT_RESET_TRACKER_STATE__?: () => void })
    .__TLT_RESET_TRACKER_STATE__
  if (typeof resetFn === 'function') {
    resetFn()
    return
  }
  window.localStorage.clear()
  window.location.reload()
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function handleGlobalUndoRedoKeydown(event: KeyboardEvent) {
  if (isApplyingSettings.value) return
  if (!(event.ctrlKey || event.metaKey)) return
  if (isEditableTarget(event.target)) return

  const key = event.key.toLowerCase()
  const isUndo = key === 'z' && !event.shiftKey
  const isRedo = (key === 'z' && event.shiftKey) || key === 'y'
  if (!isUndo && !isRedo) return

  event.preventDefault()
  if (isUndo) {
    void undo()
    return
  }
  void redo()
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalUndoRedoKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalUndoRedoKeydown)
})
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
    <div v-if="isApplyingSettings" class="applying-overlay" role="status" aria-live="polite">
      <div class="applying-overlay__content">
        <span class="applying-overlay__title">Applying settings…</span>
        <span class="applying-overlay__subtitle">Recalculating tracker logic</span>
      </div>
    </div>
    <button
      v-if="isStatsMenuOpen"
      type="button"
      class="stats-menu-backdrop"
      aria-label="Close tracker menu"
      @click="closeStatsMenu"
    />
    <div v-if="isSpoilerDragActive" class="spoiler-drop-overlay" role="status" aria-live="polite">
      <div class="spoiler-drop-content">Drop spoiler log to load</div>
    </div>
    <div class="tracker-sidebar">
      <div class="stats-panel">
        <div class="stats-header">
          <h3>Statistics</h3>
          <details
            ref="statsMenuRef"
            class="stats-menu"
            :class="{ 'is-open': isStatsMenuOpen }"
            @toggle="handleStatsMenuToggle"
          >
            <summary class="stats-menu-trigger" aria-label="Open tracker menu">⋮</summary>
            <div class="stats-menu-content" role="menu">
              <button
                class="stats-menu-item"
                type="button"
                @click="resetTrackerState"
              >
                RESET TRACKER STATE
              </button>
            </div>
          </details>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Reachable:</span>
            <span class="stat-value">{{ stats.reachable }} / {{ stats.total }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Checked:</span>
            <span class="stat-value">{{ stats.checked }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Remaining:</span>
            <span class="stat-value">{{ stats.remaining }}</span>
          </div>
          <div class="stat-item goal" :class="{ complete: canComplete }">
            <span class="stat-label">Goal:</span>
            <span class="stat-value">{{ canComplete ? '✓ Ready' : '✗ Not Ready' }}</span>
          </div>
        </div>
        <button class="debug-button" @click="fillInventory">Debug: Activate All</button>
        <div class="history-actions">
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings || !canUndo"
            @click="undo"
          >
            Undo
          </button>
          <button
            type="button"
            class="history-button"
            :disabled="isApplyingSettings || !canRedo"
            @click="redo"
          >
            Redo
          </button>
        </div>
        <div class="spoiler-actions">
          <input
            ref="spoilerFileInput"
            type="file"
            accept=".txt"
            class="spoiler-input"
            @change="onSpoilerFileSelected"
          />
          <button
            class="spoiler-button"
            type="button"
            :disabled="isApplyingSettings"
            @click="openSpoilerFileDialog"
          >
            Load Spoiler Log
          </button>
          <p class="spoiler-hint">or drag & drop anywhere</p>
        </div>
      </div>

      <div class="tabs">
        <button 
          :class="{ active: activeTab === 'grid' }"
          @click="requestTabSwitch('grid')"
        >
          Items
        </button>
        <button 
          :class="{ active: activeTab === 'inventory' }"
          @click="requestTabSwitch('inventory')"
        >
          All Items
        </button>
        <button 
          :class="{ active: activeTab === 'world' }"
          @click="requestTabSwitch('world')"
        >
          World
        </button>
        <button 
          :class="{ active: activeTab === 'settings' }"
          @click="requestTabSwitch('settings')"
        >
          Settings
        </button>
        <button 
          :class="{ active: activeTab === 'tricks' }"
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
          :special-conds="trackerSettings?.specialConds"
          @update:selected="sessionStore.setPreCompletedDungeons($event)"
          @update:special-conds="applySpecialCondsPatch"
        />
        
        <OoTMMSettings
          v-if="activeTab === 'settings'"
          ref="settingsRef"
          :settings="trackerSettings"
          @update:settings="handleSettingsChange"
        />

        <OoTMMTricks
          v-if="activeTab === 'tricks'"
          ref="settingsRef"
          :settings="trackerSettings"
          @update:settings="handleSettingsChange"
        />
      </div>
    </div>

    <div class="tracker-main">
      <div class="map-panel">
        <div class="map-placeholder">
          <h2>Map View</h2>
          <p>Interactive map coming soon...</p>
          <p class="hint">For now, use the Locations sidebar to see all checks</p>
        </div>
      </div>

      <aside class="locations-sidebar" :class="{ collapsed: !isLocationsSidebarOpen }">
        <button
          class="locations-toggle"
          type="button"
          :aria-expanded="isLocationsSidebarOpen"
          aria-controls="map-locations-panel"
          @click="isLocationsSidebarOpen = !isLocationsSidebarOpen"
        >
          <span class="toggle-text">Locations</span>
          <span class="toggle-icon">{{ isLocationsSidebarOpen ? '>>' : '<<' }}</span>
        </button>
        <div class="locations-clip">
          <div
            id="map-locations-panel"
            class="locations-content"
            :aria-hidden="!isLocationsSidebarOpen"
          >
            <OoTMMLocations
              class="map-locations"
              :locations="allLocations"
              :reachable-ids="reachableLocationIds"
            />
          </div>
        </div>
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
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 220px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
}

.applying-overlay__title {
  font-size: 1rem;
  font-weight: 600;
}

.applying-overlay__subtitle {
  font-size: 0.8rem;
  color: #d1d5db;
  letter-spacing: 0.02em;
}

.stats-menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 8;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  margin: 0;
  padding: 0;
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

.tracker-sidebar {
  width: 400px;
  background: #2a2a2a;
  border-right: 2px solid #404040;
  display: flex;
  flex-direction: column;
}

.stats-panel {
  padding: 1rem;
  border-bottom: 1px solid #404040;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.stats-panel h3 {
  font-size: 0.875rem;
  color: #9ca3af;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-menu {
  position: relative;
}

.stats-menu.is-open {
  z-index: 10;
}

.stats-menu-trigger {
  list-style: none;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.35rem;
  border: 1px solid #4b5563;
  color: #d1d5db;
  background: #1f2937;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  cursor: pointer;
  user-select: none;
}

.stats-menu-trigger::-webkit-details-marker {
  display: none;
}

.stats-menu-trigger:hover {
  background: #111827;
}

.stats-menu-content {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  background: #111827;
  border: 1px solid #374151;
  border-radius: 0.4rem;
  min-width: 12rem;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  z-index: 11;
}

.stats-menu-item {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #f3f4f6;
  text-align: left;
  padding: 0.55rem 0.7rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stats-menu-item:hover:not(:disabled) {
  background: #1f2937;
}

.stats-menu-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.debug-button {
  margin-top: 10px;
  width: 100%;
  padding: 5px;
  cursor: pointer;
  background: #444;
  color: #fff;
  border: 1px solid #666;
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

.spoiler-actions {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.spoiler-input {
  display: none;
}

.spoiler-button {
  width: 100%;
  padding: 0.45rem 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #374151;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.spoiler-button:hover {
  background: #111827;
  border-color: #4b5563;
}

.spoiler-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spoiler-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: center;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #404040;
}

.tabs button {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border-radius: 0;
  font-size: 0.875rem;
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
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.map-placeholder {
  text-align: center;
  color: #6b7280;
}

.map-placeholder h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.map-placeholder p {
  margin-bottom: 0.5rem;
}

.map-placeholder .hint {
  font-size: 0.875rem;
  color: #9ca3af;
}

.locations-sidebar {
  position: relative;
  width: 400px;
  flex: 0 0 400px;
  background: #2a2a2a;
  border-left: 2px solid #404040;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, flex-basis 0.2s ease;
  overflow: visible;
}

.locations-sidebar.collapsed {
  width: 0;
  flex: 0 0 0;
  border-left: none;
}

.locations-clip {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.locations-toggle {
  position: absolute;
  top: 12px;
  left: 0;
  transform: translateX(calc(-100% + 4px));
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 0.5rem 0 0 0.5rem;
  color: #e5e7eb;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.locations-toggle:hover {
  background: #333;
  border-color: #4b5563;
}

.locations-toggle:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.toggle-icon {
  font-weight: 700;
}

.locations-content {
  position: absolute;
  inset: 0;
  width: 400px;
  display: flex;
  flex-direction: column;
}

.locations-sidebar.collapsed .locations-content {
  visibility: hidden;
  pointer-events: none;
}

.map-locations {
  flex: 1;
  min-height: 0;
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

  .map-panel {
    min-height: 220px;
  }

  .locations-sidebar {
    width: 100%;
    flex: 0 0 auto;
    border-left: none;
    border-top: 2px solid #404040;
  }

  .locations-sidebar.collapsed {
    width: 100%;
    flex: 0 0 0;
    border-top: none;
  }

  .locations-toggle {
    left: 12px;
    top: -16px;
    border-radius: 0.5rem;
    transform: none;
  }

  .locations-content {
    position: relative;
    width: 100%;
  }
}

@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .tabs button {
    flex: 1 1 100%;
  }

  .map-placeholder h2 {
    font-size: 1.5rem;
  }
}
</style>
