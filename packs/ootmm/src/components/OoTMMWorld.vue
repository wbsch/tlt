<script setup lang="ts">
import { computed, ref } from 'vue'
import { SPECIAL_CONDS, SPECIAL_CONDS_FIELDS } from '@ootmm/core/settings/index'

type DungeonRow = {
  id: string
  label: string
  game: 'oot' | 'mm'
  note?: string
}

type SongEventData = {
  id: number
  label: string
  code: string
}

const props = defineProps<{
  enabled: boolean
  dungeons: DungeonRow[]
  selected: string[]
  settings: Record<string, unknown>
  specialConds?: Record<string, unknown>
  songEvents?: Record<string, number>
}>()

const emit = defineEmits<{
  'update:selected': [string[]]
  'update:special-conds': [Record<string, unknown>]
  'update:song-events': [Record<string, number>]
}>()

const selectedSet = computed(() => new Set(props.selected))

// Song Events Data
const SONG_EVENTS: SongEventData[] = [
  { id: 0x10, label: 'Drain Well Interior', code: '0x10' },
  { id: 0x11, label: "Ganon's Light Trial", code: '0x11' },
  { id: 0x0c, label: 'Shadow Temple Boat', code: '0x0c' },
  { id: 2, label: 'Royal Tomb', code: '2' },
]

const SONG_NAMES = [
  { value: 0, label: "Zelda's Lullaby" },
  { value: 1, label: "Epona's Song" },
  { value: 2, label: "Saria's Song" },
  { value: 3, label: "Song of Storms" },
  { value: 4, label: "Sun's Song" },
  { value: 5, label: "Song of Time" },
]

const songEventsEnabled = computed(() => Boolean(props.settings?.songEventsShuffleOot))

function getSongEventSelection(eventId: number): number | undefined {
  return props.songEvents?.[eventId]
}

function updateSongEvent(eventId: number, songId: number) {
  const next = { ...props.songEvents, [eventId]: songId }
  emit('update:song-events', next)
}

interface SpecialCond {
  cond?: (settings: Record<string, unknown>) => boolean
  name?: string
}

const specialCondKeys = computed(() => {
  const settings = props.settings ?? {}
  return Object.keys(SPECIAL_CONDS).filter((key) => {
    if (key === 'MOON') return true
    const cond = (SPECIAL_CONDS as Record<string, SpecialCond>)[key]?.cond
    return cond ? cond(settings) : true
  })
})
const specialFields = Object.entries(SPECIAL_CONDS_FIELDS)
const expandedConds = ref<Record<string, boolean>>({})

function toggleDungeon(id: string) {
  const next = new Set(props.selected)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  emit('update:selected', Array.from(next))
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

function getSpecialCondState(condKey: string) {
  return props.specialConds?.[condKey] as Record<string, unknown> ?? { count: 0 }
}

interface SpecialCondField {
  max?: number | ((settings: Record<string, unknown>) => unknown)
}

function computeSpecialCondMax(condState: Record<string, unknown>) {
  const settings = props.settings ?? {}
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
</script>

<template>
  <div class="world-panel">
    <div class="world-body">
      <section class="world-section">
        <div class="world-header">
          <h3>Pre-Completed Dungeons</h3>
          <p class="world-description">
            Choose which major dungeons are already cleared. Locations inside will be hidden and logic will treat them as completed.
          </p>
          <p class="world-hint">
            Stone Tower Temple includes the inverted dungeon.
          </p>
        </div>

        <div v-if="!enabled" class="world-disabled">
          <p>Enable <strong>Pre-Completed Dungeons</strong> in Settings to edit this list.</p>
        </div>

        <div v-else class="world-list">
          <label
            v-for="dungeon in dungeons"
            :key="dungeon.id"
            class="world-row"
          >
            <div class="row-info">
              <span class="row-label">{{ dungeon.label }}</span>
              <span class="row-game" :class="`game-${dungeon.game}`">
                {{ dungeon.game === 'oot' ? 'OoT' : 'MM' }}
              </span>
              <span v-if="dungeon.note" class="row-note">{{ dungeon.note }}</span>
            </div>
            <input
              type="checkbox"
              class="row-toggle"
              :checked="selectedSet.has(dungeon.id)"
              :disabled="!enabled"
              @change="toggleDungeon(dungeon.id)"
            />
          </label>
        </div>
      </section>

      <section v-if="songEventsEnabled" class="world-section">
        <div class="world-header">
          <h3>Song Events</h3>
          <p class="world-description">
            Choose which song is required to trigger each event. These events will require playing the selected song to proceed.
          </p>
        </div>

        <div class="world-list">
          <div
            v-for="event in SONG_EVENTS"
            :key="event.id"
            class="world-row song-event-row"
          >
            <div class="row-info">
              <span class="row-label">{{ event.label }}</span>
              <span class="row-note">({{ event.code }})</span>
            </div>
            <select
              :value="getSongEventSelection(event.id) ?? 0"
              class="song-select"
              @change="updateSongEvent(event.id, Number(($event.target as HTMLSelectElement).value))"
            >
              <option
                v-for="song in SONG_NAMES"
                :key="song.value"
                :value="song.value"
              >
                {{ song.label }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <section class="world-section">
        <div class="world-header">
          <h3>Special Conditions</h3>
          <p class="world-description">
            Configure custom requirements for special access conditions. Moon is always available; other categories appear when their setting is set to Custom.
          </p>
        </div>

        <div class="special-grid">
          <div v-for="condKey in specialCondKeys" :key="condKey" class="special-card">
            <div class="special-header">
              <div class="special-title">{{ (SPECIAL_CONDS as Record<string, SpecialCond>)[condKey]?.name }}</div>
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
      </section>
    </div>
  </div>
</template>

<style scoped>
.world-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.world-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.world-section {
  display: flex;
  flex-direction: column;
}

.world-header {
  padding: 1rem;
  border-bottom: 1px solid #404040;
}

.world-header h3 {
  margin-bottom: 0.35rem;
  font-size: 1rem;
  font-weight: 600;
}

.world-description {
  font-size: 0.875rem;
  color: #cbd5f5;
  margin-bottom: 0.5rem;
}

.world-hint {
  font-size: 0.75rem;
  color: #9ca3af;
}

.world-disabled {
  padding: 1rem;
  font-size: 0.875rem;
  color: #f59e0b;
}

.world-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
}

.world-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid #404040;
  border-radius: 6px;
  background: #1f2937;
}

.row-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.row-label {
  font-size: 0.9rem;
  font-weight: 500;
}

.row-game {
  font-size: 0.75rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  background: #334155;
  color: #e2e8f0;
}

.row-game.game-oot {
  background: #1f3a5f;
}

.row-game.game-mm {
  background: #3b2f4a;
}

.row-note {
  font-size: 0.75rem;
  color: #9ca3af;
}

.row-toggle {
  width: 18px;
  height: 18px;
  accent-color: #3b82f6;
}

.song-event-row {
  background: #1a2332;
}

.song-select {
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #404040;
  background: #0f172a;
  color: #f9fafb;
  font-size: 0.875rem;
  cursor: pointer;
  min-width: 160px;
}

.song-select:hover {
  border-color: #60a5fa;
}

.song-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.special-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  padding: 1rem;
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
</style>
