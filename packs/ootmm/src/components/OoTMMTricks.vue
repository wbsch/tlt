<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { TRICKS } from '@ootmm/core/settings/tricks';
import { TRACKER_DEFAULT_SETTINGS } from '../data/settings';
import { matchesSearchTerms } from '../utils/search';
import { selectSearchInputText } from '../utils/input';

const props = defineProps<{
  settings: Record<string, unknown>;
  isApplyingSettings?: boolean;
}>();

const emit = defineEmits<{
  'update:settings': [Record<string, unknown>];
}>();

type Trick = {
  game: 'oot' | 'mm';
  name: string;
  glitch?: boolean;
  tooltip?: string;
  linkVideo?: string;
  linkText?: string;
};

const ALL_TRICKS = TRICKS as Record<string, Trick>;
const DEFAULT_TRICKS = Array.isArray(TRACKER_DEFAULT_SETTINGS.tricks)
  ? Array.from(
      new Set(
        (TRACKER_DEFAULT_SETTINGS.tricks as unknown[]).filter(
          (entry): entry is string => typeof entry === 'string',
        ),
      ),
    )
  : [];

const localSettings = ref<Record<string, unknown>>({ ...props.settings });
const searchQuery = ref('');
const selectedGame = ref<'all' | 'oot' | 'mm'>('all');

function areSettingsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!areSettingsEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!areSettingsEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

function hasUnsavedChanges() {
  return !areSettingsEqual(localSettings.value, props.settings);
}

function getLocalSettingsSnapshot() {
  return { ...localSettings.value };
}

function discardChanges() {
  localSettings.value = { ...props.settings };
}

watch(
  () => props.settings,
  (newSettings) => {
    localSettings.value = { ...newSettings };
  },
  { deep: true },
);

const enabledTricks = computed(() => {
  const tricks = localSettings.value.tricks;
  if (Array.isArray(tricks)) {
    return new Set(tricks as string[]);
  }
  return new Set<string>();
});

const filteredTricks = computed(() => {
  return Object.entries(ALL_TRICKS)
    .filter(([key, trick]) => {
      // Filter by game
      if (selectedGame.value !== 'all' && trick.game !== selectedGame.value) {
        return false;
      }

      return matchesSearchTerms(
        [trick.name, key, trick.tooltip ?? ''],
        searchQuery.value,
      );
    })
    .sort((a, b) => {
      // Sort glitches to the bottom
      if (a[1].glitch !== b[1].glitch) {
        return a[1].glitch ? 1 : -1;
      }
      // Then sort by name
      return a[1].name.localeCompare(b[1].name);
    });
});

const ootTricksCount = computed(() => {
  return Object.values(ALL_TRICKS).filter((t) => t.game === 'oot').length;
});

const mmTricksCount = computed(() => {
  return Object.values(ALL_TRICKS).filter((t) => t.game === 'mm').length;
});

const enabledTricksCount = computed(() => {
  return enabledTricks.value.size;
});

const isAtDefaultTricks = computed(() => {
  const currentTricks = Array.isArray(localSettings.value.tricks)
    ? (localSettings.value.tricks as string[])
    : [];
  if (currentTricks.length !== DEFAULT_TRICKS.length) return false;
  const currentSet = new Set(currentTricks);
  if (currentSet.size !== DEFAULT_TRICKS.length) return false;
  return DEFAULT_TRICKS.every((trick) => currentSet.has(trick));
});

function toggleTrick(trickKey: string) {
  const currentTricks = Array.isArray(localSettings.value.tricks)
    ? [...(localSettings.value.tricks as string[])]
    : [];

  const index = currentTricks.indexOf(trickKey);
  if (index >= 0) {
    currentTricks.splice(index, 1);
  } else {
    currentTricks.push(trickKey);
  }

  localSettings.value = {
    ...localSettings.value,
    tricks: Array.from(new Set(currentTricks)),
  };
}

function applyTricks() {
  emit('update:settings', localSettings.value);
}

function resetTricksToDefaults() {
  const currentTricks = Array.isArray(props.settings.tricks)
    ? Array.from(
        new Set(
          (props.settings.tricks as unknown[]).filter(
            (entry): entry is string => typeof entry === 'string',
          ),
        ),
      )
    : [];
  const currentSet = new Set(currentTricks);
  const currentMatchesDefaultSet =
    currentSet.size === DEFAULT_TRICKS.length &&
    DEFAULT_TRICKS.every((trick) => currentSet.has(trick));
  const targetTricks = currentMatchesDefaultSet
    ? currentTricks
    : DEFAULT_TRICKS;
  localSettings.value = {
    ...localSettings.value,
    tricks: [...targetTricks],
  };
}

defineExpose({
  hasUnsavedChanges,
  getLocalSettingsSnapshot,
  discardChanges,
});
</script>

<template>
  <div class="tricks-panel">
    <div class="tricks-header">
      <h2>Tricks & Glitches</h2>
      <p class="tricks-description">
        Enable tricks and glitches to allow the logic to expect more advanced
        techniques. Enabled: {{ enabledTricksCount }} /
        {{ Object.keys(ALL_TRICKS).length }}
      </p>
    </div>

    <div class="tricks-filters">
      <div class="filter-row">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search tricks..."
          class="search-input"
          @focus="selectSearchInputText"
          @click="selectSearchInputText"
        />

        <div class="filter-group">
          <label class="filter-label">Game:</label>
          <select v-model="selectedGame" class="filter-select">
            <option value="all">
              All ({{ Object.keys(ALL_TRICKS).length }})
            </option>
            <option value="oot">OoT ({{ ootTricksCount }})</option>
            <option value="mm">MM ({{ mmTricksCount }})</option>
          </select>
        </div>
      </div>
    </div>

    <div class="tricks-list">
      <div
        v-for="[key, trick] in filteredTricks"
        :key="key"
        class="trick-item"
        :class="{
          enabled: enabledTricks.has(key),
          glitch: trick.glitch,
        }"
      >
        <label class="trick-label">
          <input
            type="checkbox"
            :checked="enabledTricks.has(key)"
            :disabled="isApplyingSettings"
            @change="toggleTrick(key)"
          />
          <div class="trick-content">
            <div class="trick-header-row">
              <span class="trick-name">{{ trick.name }}</span>
              <span class="trick-game-badge" :class="trick.game">
                {{ trick.game.toUpperCase() }}
              </span>
              <span v-if="trick.glitch" class="glitch-badge">GLITCH</span>
            </div>
            <p v-if="trick.tooltip" class="trick-tooltip">
              {{ trick.tooltip }}
            </p>
            <div v-if="trick.linkVideo || trick.linkText" class="trick-links">
              <a
                v-if="trick.linkVideo"
                :href="trick.linkVideo"
                target="_blank"
                rel="noopener noreferrer"
                class="trick-link"
                @click.stop
              >
                📹 Video Guide
              </a>
              <a
                v-if="trick.linkText"
                :href="trick.linkText"
                target="_blank"
                rel="noopener noreferrer"
                class="trick-link"
                @click.stop
              >
                📄 Text Guide
              </a>
            </div>
          </div>
        </label>
      </div>

      <div v-if="filteredTricks.length === 0" class="no-results">
        No tricks found matching your filters.
      </div>
    </div>

    <div class="tricks-actions">
      <button
        class="btn-secondary"
        data-testid="reset-tricks-button"
        :disabled="isApplyingSettings || isAtDefaultTricks"
        @click="resetTricksToDefaults"
      >
        Reset to Defaults
      </button>
      <button
        class="btn-primary"
        data-testid="apply-tricks-button"
        :disabled="isApplyingSettings"
        @click="applyTricks"
      >
        Apply Tricks
      </button>
    </div>
  </div>
</template>

<style scoped>
.tricks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tricks-header {
  padding: 1rem;
  border-bottom: 1px solid #404040;
}

.tricks-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #e5e7eb;
}

.tricks-description {
  margin: 0;
  font-size: 0.875rem;
  color: #9ca3af;
}

.tricks-filters {
  padding: 1rem;
  border-bottom: 1px solid #404040;
  background: #1f2937;
}

.filter-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.filter-select {
  padding: 0.5rem;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #e5e7eb;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox'] {
  cursor: pointer;
}

.bulk-actions {
  display: flex;
  gap: 0.5rem;
}

.bulk-button {
  padding: 0.5rem 0.75rem;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 0.375rem;
  color: #e5e7eb;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.bulk-button:hover {
  background: #4b5563;
}

.tricks-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.trick-item {
  margin-bottom: 0.5rem;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
}

.trick-item:hover {
  background: #111827;
  border-color: #4b5563;
}

.trick-item.enabled {
  background: #1e3a5f;
  border-color: #3b82f6;
}

.trick-item.glitch {
  border-left: 3px solid #dc2626;
}

.trick-label {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.trick-label input[type='checkbox'] {
  margin-top: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;
}

.trick-content {
  flex: 1;
  min-width: 0;
}

.trick-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.trick-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: #f3f4f6;
}

.trick-game-badge {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.trick-game-badge.oot {
  background: #065f46;
  color: #d1fae5;
}

.trick-game-badge.mm {
  background: #7c2d12;
  color: #fed7aa;
}

.glitch-badge {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
  background: #7f1d1d;
  color: #fecaca;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.trick-tooltip {
  margin: 0.5rem 0 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #d1d5db;
}

.trick-links {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.trick-link {
  font-size: 0.75rem;
  color: #60a5fa;
  text-decoration: none;
  transition: color 0.2s ease;
}

.trick-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.no-results {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
}

.tricks-actions {
  border-top: 1px solid #374151;
  padding: 1rem;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: #2563eb;
  border: none;
  border-radius: 0.375rem;
  color: #fff;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: #6b7280;
  border: none;
  border-radius: 0.375rem;
  color: #fff;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
