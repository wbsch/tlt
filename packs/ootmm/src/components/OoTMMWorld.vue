<script setup lang="ts">
import { computed } from 'vue'
import { SONG_EVENTS, SONG_CHOICES } from '../data/song-events'

type DungeonRow = {
  id: string
  label: string
  game: 'oot' | 'mm'
  note?: string
}

const props = defineProps<{
  enabled: boolean
  dungeons: DungeonRow[]
  selected: string[]
  settings: Record<string, unknown>
  songEvents?: Record<string, number>
}>()

const emit = defineEmits<{
  'update:selected': [string[]]
  'update:song-events': [Record<string, number>]
}>()

const selectedSet = computed(() => new Set(props.selected))

const songEventsEnabled = computed(() => Boolean(props.settings?.songEventsShuffleOot))

function getSongEventSelection(eventId: number): number | undefined {
  return props.songEvents?.[eventId]
}

function updateSongEvent(eventId: number, songId: number) {
  const next = { ...props.songEvents, [eventId]: songId }
  emit('update:song-events', next)
}

function toggleDungeon(id: string) {
  const next = new Set(props.selected)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  emit('update:selected', Array.from(next))
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
            </div>
            <select
              :value="getSongEventSelection(event.id) ?? 0"
              class="song-select"
              @change="updateSongEvent(event.id, Number(($event.target as HTMLSelectElement).value))"
            >
              <option
                v-for="song in SONG_CHOICES"
                :key="song.value"
                :value="song.value"
              >
                {{ song.label }}
              </option>
            </select>
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
</style>
