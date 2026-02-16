<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { SPECIAL_CONDS, SPECIAL_CONDS_FIELDS } from '@ootmm/core/settings/index'
import { SETTINGS_DEFINITIONS } from '../data/settings'
import { useOoTMMUiStore } from '../stores/ootmmUi'
import { matchesSearchTerms } from '../utils/search'
import { selectSearchInputText } from '../utils/input'

const props = defineProps<{
  settings: Record<string, unknown>
  specialConds?: Record<string, unknown>
  isApplyingSettings: boolean
}>()

const emit = defineEmits<{
  'update:settings': [Record<string, unknown>]
  'update:special-conds': [Record<string, unknown>]
  'load-spoiler-log': [File]
}>()

const localSettings = ref<Record<string, unknown>>({ ...props.settings })
const spoilerFileInput = ref<HTMLInputElement | null>(null)
const uiStore = useOoTMMUiStore()
const { settingsSearchQuery: searchQuery } = storeToRefs(uiStore)

type MultiSelectValue =
  | { type: 'none' | 'all' }
  | { type: 'specific'; values: string[] }
  | { type: 'random' }
  | { type: 'random-mixed'; set: string[]; unset: string[] }

interface SpecialCondDef {
  cond?: (settings: Record<string, unknown>) => boolean
  name?: string
}

interface SpecialCondField {
  max?: number | ((settings: Record<string, unknown>) => unknown)
}

function areSettingsEqual(a: Record<string, unknown>, b: Record<string, unknown>) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (a[key] !== b[key]) return false
  }
  return true
}

function hasUnsavedChanges() {
  return !areSettingsEqual(localSettings.value, props.settings)
}

function getLocalSettingsSnapshot() {
  return { ...localSettings.value }
}

function discardChanges() {
  localSettings.value = { ...props.settings }
}

watch(
  () => props.settings,
  (newSettings) => {
    localSettings.value = { ...newSettings }
  },
  { deep: true }
)

function updateSetting(key: string, value: unknown) {
  localSettings.value = {
    ...localSettings.value,
    [key]: value
  }
}

function isCondSatisfied(
  cond: ((settings: Record<string, unknown>) => boolean) | undefined,
  settings: Record<string, unknown>,
) {
  if (!cond) return true
  return Boolean(cond(settings))
}

function isSettingVisible(def: (typeof SETTINGS_DEFINITIONS)[number]) {
  return isCondSatisfied(def.cond, localSettings.value)
}

function getVisibleOptions(def: (typeof SETTINGS_DEFINITIONS)[number]) {
  if (!def.options) return []
  const settings = localSettings.value
  return def.options.filter((option) => isCondSatisfied(option.cond, settings))
}

function getSelectValue(def: (typeof SETTINGS_DEFINITIONS)[number]) {
  const current = localSettings.value[def.key]
  if (def.type !== 'select') {
    return current
  }

  const options = getVisibleOptions(def)
  if (options.length === 0) {
    return current
  }

  const hasCurrent = options.some((option) => option.value === current)
  if (hasCurrent) {
    return current
  }

  const defaultValue = def.default
  const hasDefault = options.some((option) => option.value === defaultValue)
  if (hasDefault) {
    return defaultValue
  }

  return options[0].value
}

function getNumberBound(
  bound: number | ((settings: Record<string, unknown>) => number) | undefined,
) {
  if (typeof bound === 'function') {
    const value = bound(localSettings.value)
    return typeof value === 'number' ? value : undefined
  }
  if (typeof bound === 'number') return bound
  return undefined
}

function getMultiSelectValue(key: string): MultiSelectValue {
  const raw = localSettings.value[key]
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { type?: unknown }).type === 'string'
  ) {
    return raw as MultiSelectValue
  }
  if (raw === 'all' || raw === 'none') {
    return { type: raw }
  }
  return { type: 'none' }
}

function optionValueString(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function optionKey(value: unknown): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value
  return optionValueString(value)
}

function getMultiSelectMode(key: string) {
  const current = getMultiSelectValue(key)
  if (current.type === 'specific' || current.type === 'all' || current.type === 'none') {
    return current.type
  }
  return 'none'
}

function updateMultiSelectMode(key: string, mode: string) {
  if (mode === 'specific') {
    const current = getMultiSelectValue(key)
    const values = current.type === 'specific' ? current.values : []
    updateSetting(key, { type: 'specific', values: [...values] })
    return
  }
  if (mode === 'all' || mode === 'none') {
    updateSetting(key, { type: mode })
  }
}

function isMultiSelectChecked(key: string, value: string) {
  const current = getMultiSelectValue(key)
  if (current.type !== 'specific') return false
  return current.values?.includes(value) ?? false
}

function toggleMultiSelectValue(key: string, value: string, checked: boolean) {
  const current = getMultiSelectValue(key)
  const values = current.type === 'specific' ? current.values : []
  const nextValues = checked
    ? Array.from(new Set([...values, value]))
    : values.filter((v) => v !== value)
  updateSetting(key, { type: 'specific', values: nextValues })
}

function applySettings() {
  emit('update:settings', localSettings.value)
}

function openSpoilerFileDialog() {
  if (props.isApplyingSettings) return
  spoilerFileInput.value?.click()
}

function onSpoilerFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('load-spoiler-log', file)
  }
  input.value = ''
}

function getSettingDefault(def: (typeof SETTINGS_DEFINITIONS)[number]) {
  if (def.type === 'multi-select') {
    if (def.default && typeof def.default === 'object' && 'type' in def.default) {
      return def.default
    }
    if (def.default === 'all' || def.default === 'none') {
      return { type: def.default }
    }
    return { type: 'none' }
  }
  return def.default
}

function resetSettings() {
  localSettings.value = {}
  SETTINGS_DEFINITIONS.forEach(def => {
    localSettings.value[def.key] = getSettingDefault(def)
  })
}

const SPECIAL_COND_ANCHORS: Record<string, string[]> = {
  rainbowBridge: ['BRIDGE'],
  lacs: ['LACS'],
  ganonBossKey: ['GANON_BK'],
  majoraChild: ['MAJORA'],
}

const specialFields = Object.entries(SPECIAL_CONDS_FIELDS)
const expandedConds = ref<Record<string, boolean>>({})

function isSpecialCondVisible(condKey: string) {
  const cond = (SPECIAL_CONDS as Record<string, SpecialCondDef>)[condKey]?.cond
  return cond ? cond(localSettings.value) : true
}

function getSpecialCondState(condKey: string) {
  return props.specialConds?.[condKey] as Record<string, unknown> ?? { count: 0 }
}

function isSpecialCondExpanded(condKey: string) {
  if (expandedConds.value[condKey] !== undefined) {
    return expandedConds.value[condKey]
  }
  return false
}

function toggleSpecialCondExpanded(condKey: string) {
  expandedConds.value = {
    ...expandedConds.value,
    [condKey]: !isSpecialCondExpanded(condKey),
  }
}

function computeSpecialCondMax(condState: Record<string, unknown>) {
  const settings = localSettings.value ?? {}
  let max = 0
  for (const [fieldKey, fieldDef] of specialFields) {
    if (!condState[fieldKey]) continue
    const fieldMax = (fieldDef as SpecialCondField).max
    const raw = typeof fieldMax === 'function' ? (fieldMax as (settings: Record<string, unknown>) => unknown)(settings) : fieldMax
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(value)) {
      max += value
    }
  }
  if (condState.masksOot && condState.masksRegular) {
    const sharedMaskCount = Object.keys(settings)
      .filter(key => key.includes('sharedMask'))
      .filter(key => Boolean(settings[key as keyof typeof settings]))
      .length
    max -= sharedMaskCount
  }
  return Math.max(0, Math.floor(max))
}

function getSpecialCondMax(condKey: string) {
  const cond = getSpecialCondState(condKey)
  return computeSpecialCondMax(cond)
}

function getSpecialCondCount(condKey: string) {
  const cond = getSpecialCondState(condKey)
  const raw = Number(cond.count ?? 0)
  const value = Number.isFinite(raw) ? raw : 0
  const max = getSpecialCondMax(condKey)
  return Math.min(Math.max(0, Math.floor(value)), max)
}

function getSpecialCondEnabledFields(condKey: string) {
  const cond = getSpecialCondState(condKey)
  return specialFields
    .filter(([fieldKey]) => Boolean(cond[fieldKey]))
    .map(([, fieldDef]) => String((fieldDef as { name?: string }).name))
}

function getSpecialCondSummary(condKey: string) {
  const enabledFields = getSpecialCondEnabledFields(condKey)
  if (enabledFields.length === 0) {
    return 'No fields selected'
  }
  if (enabledFields.length <= 3) {
    return enabledFields.join(', ')
  }
  return `${enabledFields.slice(0, 3).join(', ')} +${enabledFields.length - 3} more`
}

function toggleSpecialCondField(condKey: string, fieldKey: string) {
  const cond = getSpecialCondState(condKey)
  const nextValue = !cond[fieldKey]
  const nextCond = { ...cond, [fieldKey]: nextValue }
  const max = computeSpecialCondMax(nextCond)
  const rawCount = Number(cond.count ?? 0)
  const safeCount = Number.isFinite(rawCount) ? rawCount : 0
  const nextCount = Math.min(Math.max(0, Math.floor(safeCount)), max)
  const patch: Record<string, unknown> = { [fieldKey]: nextValue }
  if (nextCount !== cond.count) {
    patch.count = nextCount
  }
  emit('update:special-conds', { [condKey]: patch })
}

function updateSpecialCondCount(condKey: string, value: number) {
  const max = getSpecialCondMax(condKey)
  const nextValue = Math.min(Math.max(0, Math.floor(value || 0)), max)
  emit('update:special-conds', { [condKey]: { count: nextValue } })
}

const visibleSettings = computed(() => SETTINGS_DEFINITIONS.filter(isSettingVisible))

// Filter settings by search query
const filteredSettings = computed(() => {
  if (!searchQuery.value.trim()) {
    return visibleSettings.value
  }

  return visibleSettings.value.filter(setting => {
    return matchesSearchTerms(
      [setting.label, setting.description ?? '', setting.key],
      searchQuery.value,
    )
  })
})

// Group settings by category
const settingsByCategory = computed(() => {
  return filteredSettings.value.reduce((acc, setting) => {
    const category = setting.category || 'General'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(setting)
    return acc
  }, {} as Record<string, (typeof SETTINGS_DEFINITIONS)[number][]>)
})

const isSearchActive = computed(() => Boolean(searchQuery.value.trim()))

const moonAnchorKey = computed(() => {
  const keys = filteredSettings.value.map((setting) => setting.key)
  if (keys.includes('majoraChild')) return 'majoraChild'
  if (keys.includes('openMoon')) return 'openMoon'
  return null
})

const specialCondKeysBySetting = computed(() => {
  const result: Record<string, string[]> = {}
  for (const setting of filteredSettings.value) {
    const base = SPECIAL_COND_ANCHORS[setting.key] ?? []
    const withMoon = setting.key === moonAnchorKey.value ? ['MOON', ...base] : base
    const visible = withMoon.filter(isSpecialCondVisible)
    if (visible.length > 0) {
      result[setting.key] = Array.from(new Set(visible))
    }
  }
  return result
})

const fallbackSpecialCondKeys = computed(() => {
  if (moonAnchorKey.value) return []
  if (isSearchActive.value) return []
  return ['MOON'].filter(isSpecialCondVisible)
})

watch(
  () => localSettings.value,
  () => {
    const updates: Record<string, unknown> = {}
    for (const def of SETTINGS_DEFINITIONS) {
      if (def.type !== 'select') continue
      const nextValue = getSelectValue(def)
      if (nextValue !== localSettings.value[def.key]) {
        updates[def.key] = nextValue
      }
    }
    if (Object.keys(updates).length > 0) {
      localSettings.value = {
        ...localSettings.value,
        ...updates,
      }
    }
  },
  { deep: true },
)

defineExpose({
  hasUnsavedChanges,
  getLocalSettingsSnapshot,
  discardChanges,
})
</script>

<template>
  <div class="settings-panel">
    <div class="settings-header">
      <p class="settings-note">
        ⚠️ Changing settings will reset the tracker and recalculate logic
      </p>

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
      
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search settings..."
        class="search-input"
        @focus="selectSearchInputText"
        @click="selectSearchInputText"
      />
    </div>

    <div class="settings-content">
      <div v-for="(categorySettings, category) in settingsByCategory" :key="category" class="settings-category">
        <h3 class="category-name">{{ category }}</h3>
        
        <div class="settings-list">
          <div v-for="setting in categorySettings" :key="setting.key" class="setting-block">
            <div class="setting-item">
              <label :for="setting.key" class="setting-label">
                {{ setting.label }}
                <span v-if="setting.description" class="setting-description">
                  {{ setting.description }}
                </span>
              </label>

              <!-- Boolean -->
              <input
                v-if="setting.type === 'boolean'"
                :id="setting.key"
                type="checkbox"
                :checked="Boolean(localSettings[setting.key])"
                class="setting-checkbox"
                @change="updateSetting(setting.key, ($event.target as HTMLInputElement).checked)"
              />

              <!-- Select -->
              <select
                v-else-if="setting.type === 'select'"
                :id="setting.key"
                :value="optionValueString(getSelectValue(setting))"
                class="setting-select"
                @change="updateSetting(setting.key, ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="opt in getVisibleOptions(setting)"
                  :key="optionKey(opt.value)"
                  :value="optionValueString(opt.value)"
                >
                  {{ opt.label }}
                </option>
              </select>

              <!-- Number -->
              <input
                v-else-if="setting.type === 'number'"
                :id="setting.key"
                type="number"
                :value="localSettings[setting.key]"
                :min="getNumberBound(setting.min)"
                :max="getNumberBound(setting.max)"
                class="setting-input"
                @input="updateSetting(setting.key, parseInt(($event.target as HTMLInputElement).value))"
              />

              <!-- Multi-select -->
              <div v-else-if="setting.type === 'multi-select'" class="setting-multiselect">
                <select
                  :id="setting.key"
                  :value="getMultiSelectMode(setting.key)"
                  class="setting-select"
                  @change="updateMultiSelectMode(setting.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="none">None</option>
                  <option value="all">All</option>
                  <option value="specific">Specific</option>
                </select>

                <div v-if="getMultiSelectMode(setting.key) === 'specific'" class="setting-multiselect-options">
                  <label
                    v-for="opt in getVisibleOptions(setting)"
                    :key="optionKey(opt.value)"
                    class="multiselect-option"
                  >
                    <input
                      type="checkbox"
                      :checked="isMultiSelectChecked(setting.key, optionValueString(opt.value))"
                      @change="toggleMultiSelectValue(setting.key, optionValueString(opt.value), ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ opt.label }}</span>
                  </label>
                </div>
              </div>

              <!-- Text -->
              <input
                v-else-if="setting.type === 'text'"
                :id="setting.key"
                type="text"
                :value="localSettings[setting.key]"
                class="setting-input"
                @input="updateSetting(setting.key, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <div v-if="specialCondKeysBySetting[setting.key]?.length" class="setting-special">
              <div class="setting-special-label">Special Condition</div>
              <div class="special-grid">
                <div v-for="condKey in specialCondKeysBySetting[setting.key]" :key="condKey" class="special-card">
                  <div class="special-header">
                    <div class="special-title">{{ (SPECIAL_CONDS as Record<string, SpecialCondDef>)[condKey]?.name }}</div>
                    <button
                      type="button"
                      class="special-expand"
                      :aria-expanded="isSpecialCondExpanded(condKey)"
                      @click="toggleSpecialCondExpanded(condKey)"
                    >
                      {{ isSpecialCondExpanded(condKey) ? 'Hide' : 'Show' }}
                    </button>
                  </div>

                  <div v-if="!isSpecialCondExpanded(condKey)" class="special-summary">
                    <div class="special-summary-text">{{ getSpecialCondSummary(condKey) }}</div>
                    <div class="special-summary-count">
                      Amount: {{ getSpecialCondCount(condKey) }} / {{ getSpecialCondMax(condKey) }}
                    </div>
                  </div>

                  <div v-else class="special-fields">
                    <label
                      v-for="[fieldKey, fieldDef] in specialFields"
                      :key="fieldKey"
                      class="special-field"
                    >
                      <span class="special-label">{{ (fieldDef as any).name }}</span>
                      <input
                        type="checkbox"
                        class="special-toggle"
                        :checked="Boolean(getSpecialCondState(condKey)[fieldKey])"
                        @change="toggleSpecialCondField(condKey, fieldKey)"
                      />
                    </label>
                    <label class="special-count">
                      <span class="special-count-label">Amount (max: {{ getSpecialCondMax(condKey) }})</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        :max="getSpecialCondMax(condKey)"
                        :value="getSpecialCondCount(condKey)"
                        class="special-count-input"
                        @input="updateSpecialCondCount(condKey, Number(($event.target as HTMLInputElement).value))"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="fallbackSpecialCondKeys.length > 0" class="settings-fallback">
        <h3 class="category-name">Special Conditions</h3>
        <div class="setting-special">
          <div class="special-grid">
            <div v-for="condKey in fallbackSpecialCondKeys" :key="condKey" class="special-card">
              <div class="special-header">
                <div class="special-title">{{ (SPECIAL_CONDS as Record<string, SpecialCondDef>)[condKey]?.name }}</div>
                <button
                  type="button"
                  class="special-expand"
                  :aria-expanded="isSpecialCondExpanded(condKey)"
                  @click="toggleSpecialCondExpanded(condKey)"
                >
                  {{ isSpecialCondExpanded(condKey) ? 'Hide' : 'Show' }}
                </button>
              </div>

              <div v-if="!isSpecialCondExpanded(condKey)" class="special-summary">
                <div class="special-summary-text">{{ getSpecialCondSummary(condKey) }}</div>
                <div class="special-summary-count">
                  Amount: {{ getSpecialCondCount(condKey) }} / {{ getSpecialCondMax(condKey) }}
                </div>
              </div>

              <div v-else class="special-fields">
                <label
                  v-for="[fieldKey, fieldDef] in specialFields"
                  :key="fieldKey"
                  class="special-field"
                >
                  <span class="special-label">{{ (fieldDef as any).name }}</span>
                  <input
                    type="checkbox"
                    class="special-toggle"
                    :checked="Boolean(getSpecialCondState(condKey)[fieldKey])"
                    @change="toggleSpecialCondField(condKey, fieldKey)"
                  />
                </label>
                <label class="special-count">
                  <span class="special-count-label">Amount (max: {{ getSpecialCondMax(condKey) }})</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    :max="getSpecialCondMax(condKey)"
                    :value="getSpecialCondCount(condKey)"
                    class="special-count-input"
                    @input="updateSpecialCondCount(condKey, Number(($event.target as HTMLInputElement).value))"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn-secondary" @click="resetSettings">
        Reset to Defaults
      </button>
      <button class="btn-primary" @click="applySettings">
        Apply Settings
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.settings-header {
  padding: 1rem;
  border-bottom: 1px solid #404040;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-note {
  font-size: 0.875rem;
  color: #f59e0b;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1f2937;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #f3f4f6;
  font-size: 0.875rem;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.settings-category {
  margin-bottom: 1.5rem;
}

.category-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #404040;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.setting-block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setting-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: start;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.setting-multiselect {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.setting-multiselect-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 0.35rem 0.75rem;
}

.multiselect-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #d1d5db;
}

.multiselect-option input {
  accent-color: #3b82f6;
}

.setting-description {
  font-size: 0.75rem;
  color: #9ca3af;
  font-weight: normal;
}

.setting-checkbox {
  margin-top: 0.125rem;
}

.setting-select,
.setting-input {
  min-width: 150px;
}

.setting-special {
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #2f3b4f;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setting-special-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.settings-fallback {
  margin-top: 1.5rem;
}

.special-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.special-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #404040;
  background: #111827;
}

.special-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.special-title {
  font-size: 0.95rem;
  font-weight: 600;
}

.special-expand {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5f5;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  cursor: pointer;
}

.special-expand:hover {
  border-color: #60a5fa;
  color: #e2e8f0;
}

.special-summary {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #cbd5f5;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  border: 1px dashed #334155;
  background: #0f172a;
}

.special-summary-text {
  color: #e2e8f0;
}

.special-summary-count {
  color: #94a3b8;
  font-size: 0.75rem;
}

.special-fields {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.special-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: #1f2937;
  border: 1px solid #2f3b4f;
}

.special-label {
  font-size: 0.8rem;
  color: #d1d5db;
}

.special-toggle {
  width: 16px;
  height: 16px;
  accent-color: #38bdf8;
}

.special-count {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #cbd5f5;
}

.special-count-input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #404040;
  background: #1f2937;
  color: #f9fafb;
}

.settings-actions {
  padding: 1rem;
  border-top: 1px solid #404040;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-primary {
  background: #3b82f6;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #6b7280;
}

.btn-secondary:hover {
  background: #4b5563;
}

.spoiler-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
}

.spoiler-input {
  display: none;
}

.spoiler-button {
  flex: 1;
  padding: 0.45rem 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #374151;
  border-radius: 0.5rem;
  font-size: 0.8rem;
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
  white-space: nowrap;
}

@media (max-width: 700px) {
  .setting-item {
    grid-template-columns: 1fr;
  }

  .setting-select,
  .setting-input {
    width: 100%;
    min-width: 0;
  }

  .settings-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .spoiler-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
  }

  .spoiler-hint {
    white-space: normal;
    text-align: center;
  }
}
</style>
