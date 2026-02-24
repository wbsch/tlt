<script setup lang="ts">
import { computed, ref } from 'vue';
import { SONG_EVENTS, SONG_CHOICES, type SongChoice } from '../data/song-events';

type DungeonRow = {
  id: string;
  label: string;
  game: 'oot' | 'mm';
  note?: string;
};

const props = defineProps<{
  enabled: boolean;
  dungeons: DungeonRow[];
  selected: string[];
  settings: Record<string, unknown>;
  songEvents?: Record<string, number>;
}>();

const emit = defineEmits<{
  'update:selected': [string[]];
  'update:song-events': [Record<string, number>];
}>();

const selectedSet = computed(() => new Set(props.selected));

const showPreCompleted = computed(() => props.enabled);
const songEventsEnabled = computed(() =>
  Boolean(props.settings?.songEventsShuffleOot),
);
const showEmptyState = computed(
  () => !showPreCompleted.value && !songEventsEnabled.value,
);
const activeSongDropdownEventId = ref<number | null>(null);

function getSongEventSelection(eventId: number): number | undefined {
  return props.songEvents?.[eventId];
}

function getSelectedSongChoice(eventId: number): SongChoice {
  const selectedValue = getSongEventSelection(eventId);
  return (
    SONG_CHOICES.find((song) => song.value === selectedValue) ?? SONG_CHOICES[0]
  );
}

function isSongDropdownOpen(eventId: number): boolean {
  return activeSongDropdownEventId.value === eventId;
}

function getSongDropdownId(eventId: number): string {
  return `song-options-${eventId}`;
}

function getSongDropdownTriggerId(eventId: number): string {
  return `song-trigger-${eventId}`;
}

function getSongOptionId(eventId: number, songId: number): string {
  return `song-option-${eventId}-${songId}`;
}

function toggleSongDropdown(eventId: number) {
  activeSongDropdownEventId.value =
    activeSongDropdownEventId.value === eventId ? null : eventId;
}

function closeSongDropdown() {
  activeSongDropdownEventId.value = null;
}

function handleSongDropdownFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (!currentTarget) return;
  if (nextTarget && currentTarget.contains(nextTarget)) return;
  closeSongDropdown();
}

function updateSongEvent(eventId: number, songId: number) {
  const next = { ...props.songEvents, [eventId]: songId };
  emit('update:song-events', next);
  closeSongDropdown();
}

function toggleDungeon(id: string) {
  const next = new Set(props.selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  emit('update:selected', Array.from(next));
}
</script>

<template>
  <div class="world-panel">
    <div class="world-body">
      <div v-if="showEmptyState" class="world-empty">
        <p>
          This tab is empty. Enable settings like Pre-Completed Dungeons to see
          world options here.
        </p>
      </div>

      <section v-if="showPreCompleted" class="world-section">
        <div class="world-header">
          <h3>Pre-Completed Dungeons</h3>
          <p class="world-description">
            Choose which major dungeons are already cleared. Locations inside
            will be marked as collected and logic will treat them as completed.
          </p>
          <p class="world-hint">
            Stone Tower Temple includes the inverted dungeon.
          </p>
        </div>
        <div class="world-list">
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
              <span v-if="dungeon.note" class="row-note">{{
                dungeon.note
              }}</span>
            </div>
            <input
              type="checkbox"
              class="row-toggle"
              :checked="selectedSet.has(dungeon.id)"
              @change="toggleDungeon(dungeon.id)"
            />
          </label>
        </div>
      </section>

      <section v-if="songEventsEnabled" class="world-section">
        <div class="world-header">
          <h3>Song Events</h3>
          <p class="world-description">
            Choose which song is required to trigger each event. These events
            will require playing the selected song to proceed.
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
            <div
              class="song-select-wrap"
              @focusout="handleSongDropdownFocusOut"
            >
              <button
                :id="getSongDropdownTriggerId(event.id)"
                type="button"
                class="song-select-trigger"
                aria-haspopup="listbox"
                :aria-controls="getSongDropdownId(event.id)"
                :aria-expanded="isSongDropdownOpen(event.id)"
                @click="toggleSongDropdown(event.id)"
              >
                <img
                  :src="getSelectedSongChoice(event.id).image"
                  alt=""
                  class="song-select-icon"
                />
                <span class="song-select-text">{{
                  getSelectedSongChoice(event.id).label
                }}</span>
                <span class="song-select-caret" aria-hidden="true">▾</span>
              </button>

              <ul
                v-if="isSongDropdownOpen(event.id)"
                :id="getSongDropdownId(event.id)"
                class="song-select-options"
                role="listbox"
                :aria-labelledby="getSongDropdownTriggerId(event.id)"
              >
                <li
                  v-for="song in SONG_CHOICES"
                  :id="getSongOptionId(event.id, song.value)"
                  :key="song.value"
                  class="song-select-option-item"
                  role="presentation"
                >
                  <button
                    type="button"
                    class="song-select-option"
                    role="option"
                    :aria-selected="getSelectedSongChoice(event.id).value === song.value"
                    :class="{
                      'is-selected':
                        getSelectedSongChoice(event.id).value === song.value,
                    }"
                    @click="updateSongEvent(event.id, song.value)"
                  >
                    <img :src="song.image" alt="" class="song-select-icon" />
                    <span class="song-select-text">{{ song.label }}</span>
                  </button>
                </li>
              </ul>
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

.world-empty {
  padding: 1rem;
  font-size: 0.9rem;
  color: #cbd5f5;
  border: 1px dashed #374151;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.4);
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

.song-select-wrap {
  position: relative;
  min-width: 220px;
}

.song-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #404040;
  background: #0f172a;
  color: #f9fafb;
  font-size: 0.875rem;
  cursor: pointer;
  text-align: left;
}

.song-select-trigger:hover {
  border-color: #60a5fa;
}

.song-select-trigger:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.song-select-options {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 5;
  margin: 0.3rem 0 0;
  padding: 0.3rem;
  border: 1px solid #404040;
  border-radius: 8px;
  background: #0f172a;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
}

.song-select-option-item {
  margin: 0;
}

.song-select-option {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #f9fafb;
  padding: 0.35rem 0.45rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  cursor: pointer;
}

.song-select-option:hover {
  background: rgba(96, 165, 250, 0.12);
}

.song-select-option:focus {
  outline: none;
  background: rgba(59, 130, 246, 0.2);
}

.song-select-option.is-selected {
  background: rgba(59, 130, 246, 0.22);
}

.song-select-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.song-select-text {
  flex: 1;
}

.song-select-caret {
  color: #9ca3af;
}

@media (max-width: 640px) {
  .song-select-wrap {
    min-width: 100%;
  }

  .song-event-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
