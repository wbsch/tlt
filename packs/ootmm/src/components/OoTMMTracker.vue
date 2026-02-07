<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { TrackerPack } from '@/types/tracker'
import OoTMMInventory from './OoTMMInventory.vue'
import OoTMMLocations from './OoTMMLocations.vue'
import OoTMMSettings from './OoTMMSettings.vue'
import OoTMMItemGrid from './OoTMMItemGrid.vue'
import OoTMMWorld from './OoTMMWorld.vue'
import { ITEM_DATABASE } from '../data/items'
import { DEFAULT_OOTMM_SETTINGS } from '../types/settings'
import { parseSpoilerLog } from '../utils/spoiler'
import { useSessionState } from '../composables/useSessionState'
import * as ItemsMod from '@ootmm/core/items/index'
import * as NamesMod from '@ootmm/core/names'
import * as SettingsDataMod from '@ootmm/core/settings/data.js'

const props = defineProps<{
  tracker: TrackerPack
}>()

type TrackerTab = 'inventory' | 'settings' | 'grid' | 'world'
type SettingsPanelHandle = {
  hasUnsavedChanges: () => boolean
  getLocalSettingsSnapshot: () => Record<string, unknown>
  discardChanges: () => void
}

const resolveExport = <T,>(mod: unknown, key: string): T => {
  const modObj = mod as Record<string, T> | { default: Record<string, T> }
  return modObj[key] ?? modObj.default?.[key]
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

const activeTab = useSessionState<TrackerTab>('ootmm.activeTab', 'grid')
const inventory = ref<Map<string, number>>(new Map())
const reachableLocationIds = ref<Set<string>>(new Set())
const availableItemIds = ref<Set<string>>(new Set())
const itemMaxCounts = ref<Map<string, number>>(new Map())
const canComplete = ref(false)
const statsExtra = ref<Record<string, unknown>>({})
const isLocationsSidebarOpen = useSessionState<boolean>('ootmm.locationsSidebarOpen', true)
const trackerSettings = ref<Record<string, unknown>>(props.tracker.getSettings())
const preCompletedDungeons = useSessionState<string[]>('ootmm.preCompletedDungeons', [])
const collectedLocationIds = useSessionState<string[]>('locations.collectedIds', [])
const locationsVersion = ref(0)
const settingsRef = ref<SettingsPanelHandle | null>(null)
const isApplyingSettings = ref(false)
const spoilerFileInput = ref<HTMLInputElement | null>(null)
const isSpoilerDragActive = ref(false)
const spoilerDragDepth = ref(0)

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

// Update reachability when inventory changes
watch(inventory, (newInventory) => {
  const result = props.tracker.checkReachability(newInventory)
  reachableLocationIds.value = new Set(result.reachableLocationIds)
  canComplete.value = result.canComplete
  statsExtra.value = result.extra || {}
}, { deep: true })

// Initial check
const result = props.tracker.checkReachability(inventory.value)
reachableLocationIds.value = new Set(result.reachableLocationIds)
canComplete.value = result.canComplete
statsExtra.value = result.extra || {}
availableItemIds.value = new Set(props.tracker.getAvailableItemIds?.() ?? [])
itemMaxCounts.value = new Map(props.tracker.getItemMaxCounts?.() ?? [])

const allLocations = computed(() => {
  // Trigger recomputation when locationsVersion changes
  void locationsVersion.value
  return props.tracker.getAllLocations()
})

const shuffledLocations = computed(() => {
  return allLocations.value.filter(loc => loc.isShuffled !== false)
})

const preCompletedEnabled = computed(() => Boolean(trackerSettings.value?.preCompletedDungeons))

if (!['grid', 'inventory', 'settings', 'world'].includes(activeTab.value)) {
  activeTab.value = 'grid'
}

const stats = computed(() => {
  const total = shuffledLocations.value.length
  const reachable = shuffledLocations.value.filter(loc => reachableLocationIds.value.has(loc.id)).length
  const checked = 0 // TODO: track checked locations
  
  return {
    total,
    reachable,
    checked,
    remaining: total - checked,
  }
})

function fillInventory() {
  const newInventory = new Map<string, number>()
  if (availableItemIds.value.size > 0) {
    for (const itemId of availableItemIds.value) {
      const maxCount = itemMaxCounts.value.get(itemId) ?? 1
      newInventory.set(itemId, Math.max(1, maxCount))
    }
  } else {
    for (const item of ITEM_DATABASE) {
      if (item.category === 'junk') continue;
      const maxCount = itemMaxCounts.value.get(item.id) ?? item.maxCount ?? 1
      newInventory.set(item.id, Math.max(1, maxCount))
    }
  }
  inventory.value = newInventory
}

function handleInventoryChange(newInventory: Map<string, number>) {
  inventory.value = newInventory
  // NOTE: The below is vibed bullshit and not actually necessary!
  // Manually trigger reachability check since Map reactivity can be unreliable
  // const result = props.tracker.checkReachability(newInventory)
  // reachableLocationIds.value = new Set(result.reachableLocationIds)
  // canComplete.value = result.canComplete
  // statsExtra.value = result.extra || {}
  // ENDNOTE
}

async function handleSettingsChange(newSettings: Record<string, unknown>) {
  if (isApplyingSettings.value) return
  console.log('Settings changed:', newSettings)
  // Re-initialize tracker with new settings
  props.tracker.reset()
  try {
    isApplyingSettings.value = true
    await nextTick()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await props.tracker.initialize(newSettings)
    trackerSettings.value = props.tracker.getSettings()
    availableItemIds.value = new Set(props.tracker.getAvailableItemIds?.() ?? [])
    itemMaxCounts.value = new Map(props.tracker.getItemMaxCounts?.() ?? [])
    applyPreCompletedDungeons()
    // Re-check reachability
    const result = props.tracker.checkReachability(inventory.value)
    reachableLocationIds.value = new Set(result.reachableLocationIds)
    canComplete.value = result.canComplete
    statsExtra.value = result.extra || {}
  } catch (error) {
    console.error('Failed to apply settings:', error)
  } finally {
    isApplyingSettings.value = false
  }
}

function applyPreCompletedDungeons() {
  const setFn = props.tracker.setPreCompletedDungeons
  if (!setFn) return
  const selected = preCompletedEnabled.value ? preCompletedDungeons.value : []
  setFn.call(props.tracker, selected)
  locationsVersion.value += 1
  const result = props.tracker.checkReachability(inventory.value)
  reachableLocationIds.value = new Set(result.reachableLocationIds)
  canComplete.value = result.canComplete
  statsExtra.value = result.extra || {}
}

watch([preCompletedDungeons, preCompletedEnabled], () => {
  applyPreCompletedDungeons()
}, { deep: true, immediate: true })

function applySpecialCondsPatch(patch: Record<string, unknown>) {
  if (isApplyingSettings.value) return
  const setFn = props.tracker.setSpecialConds
  if (!setFn) return
  setFn.call(props.tracker, patch)
  trackerSettings.value = props.tracker.getSettings()
  const result = props.tracker.checkReachability(inventory.value)
  reachableLocationIds.value = new Set(result.reachableLocationIds)
  canComplete.value = result.canComplete
  statsExtra.value = result.extra || {}
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
  const next = new Map(inventory.value)
  for (const [name, count] of Object.entries(startingItems)) {
    if (!count || count <= 0) continue
    const itemId = itemNameToId.get(normalizeName(name))
    if (!itemId) {
      console.warn('[OoTMM Tracker] Unknown starting item:', name)
      continue
    }
    const current = next.get(itemId) || 0
    next.set(itemId, Math.max(current, count))
  }
  inventory.value = next
}

function applyJunkLocations(junkLocations: string[]) {
  if (junkLocations.length === 0) return
  const locations = props.tracker.getAllLocations()
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
  collectedLocationIds.value = Array.from(next)
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
    preCompletedDungeons.value = Array.from(new Set(parsed.preCompletedDungeons))
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

  if (activeTab.value === 'settings') {
    const settingsHandle = settingsRef.value
    if (settingsHandle?.hasUnsavedChanges()) {
      await handleSettingsChange(settingsHandle.getLocalSettingsSnapshot())
    }
  }

  activeTab.value = nextTab
}
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
    <div v-if="isSpoilerDragActive" class="spoiler-drop-overlay" role="status" aria-live="polite">
      <div class="spoiler-drop-content">Drop spoiler log to load</div>
    </div>
    <div class="tracker-sidebar">
      <div class="stats-panel">
        <h3>Statistics</h3>
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
        <button style="margin-top: 10px; width: 100%; padding: 5px; cursor: pointer; background: #444; color: white; border: 1px solid #666;" @click="fillInventory">Debug: Activate All</button>
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
          @update:selected="preCompletedDungeons = $event"
          @update:special-conds="applySpecialCondsPatch"
        />
        
        <OoTMMSettings
          v-if="activeTab === 'settings'"
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

.stats-panel h3 {
  font-size: 0.875rem;
  color: #9ca3af;
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
