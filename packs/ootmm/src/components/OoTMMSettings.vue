<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { SETTINGS_DEFINITIONS } from '../data/settings'
import { useOoTMMUiStore } from '../stores/ootmmUi'

const props = defineProps<{
  settings: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:settings': [Record<string, unknown>]
}>()

const localSettings = ref<Record<string, unknown>>({ ...props.settings })
const uiStore = useOoTMMUiStore()
const { settingsSearchQuery: searchQuery } = storeToRefs(uiStore)

type MultiSelectValue =
  | { type: 'none' | 'all' }
  | { type: 'specific'; values: string[] }
  | { type: 'random' }
  | { type: 'random-mixed'; set: string[]; unset: string[] }

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
  if (raw && typeof raw === 'object' && typeof raw.type === 'string') {
    return raw as MultiSelectValue
  }
  if (raw === 'all' || raw === 'none') {
    return { type: raw }
  }
  return { type: 'none' }
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

// Filter settings by search query
const filteredSettings = computed(() => {
  const visibleSettings = SETTINGS_DEFINITIONS.filter(isSettingVisible)
  if (!searchQuery.value.trim()) {
    return visibleSettings
  }
  
  const query = searchQuery.value.toLowerCase()
  return visibleSettings.filter(setting => {
    const matchesLabel = setting.label.toLowerCase().includes(query)
    const matchesDescription = setting.description?.toLowerCase().includes(query)
    const matchesKey = setting.key.toLowerCase().includes(query)
    return matchesLabel || matchesDescription || matchesKey
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
      
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search settings..."
        class="search-input"
      />
    </div>

    <div class="settings-content">
      <div v-for="(categorySettings, category) in settingsByCategory" :key="category" class="settings-category">
        <h3 class="category-name">{{ category }}</h3>
        
        <div class="settings-list">
          <div v-for="setting in categorySettings" :key="setting.key" class="setting-item">
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
              :checked="localSettings[setting.key]"
              class="setting-checkbox"
              @change="updateSetting(setting.key, ($event.target as HTMLInputElement).checked)"
            />

            <!-- Select -->
            <select
              v-else-if="setting.type === 'select'"
              :id="setting.key"
              :value="getSelectValue(setting)"
              class="setting-select"
              @change="updateSetting(setting.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in getVisibleOptions(setting)" :key="opt.value" :value="opt.value">
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
                <label v-for="opt in getVisibleOptions(setting)" :key="opt.value" class="multiselect-option">
                  <input
                    type="checkbox"
                    :checked="isMultiSelectChecked(setting.key, opt.value)"
                    @change="toggleMultiSelectValue(setting.key, opt.value, ($event.target as HTMLInputElement).checked)"
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
  gap: 1rem;
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
}
</style>
