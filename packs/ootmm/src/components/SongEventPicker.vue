<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { SongChoice } from '../data/song-events';

const props = defineProps<{
  eventId: number;
  eventLabel: string;
  game: 'oot' | 'mm';
  choices: readonly SongChoice[];
  modelValue?: number;
  dropdownId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'close'): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(-1);

const selectedChoice = computed<SongChoice | null>(() => {
  const match = props.choices.find(
    (choice) => choice.value === props.modelValue,
  );
  return match ?? props.choices[0] ?? null;
});

const gameLabel = computed(() => (props.game === 'oot' ? 'OoT' : 'MM'));

function scrollHighlightIntoView(index: number): void {
  void nextTick(() => {
    const option = rootRef.value?.querySelectorAll<HTMLElement>(
      '.song-event-picker__option',
    )[index];
    option?.scrollIntoView({ block: 'nearest' });
  });
}

function moveHighlight(delta: number): void {
  if (props.choices.length === 0) return;
  const selectedIndex = props.choices.findIndex(
    (choice) => choice.value === selectedChoice.value?.value,
  );
  const base =
    highlightedIndex.value >= 0
      ? highlightedIndex.value
      : Math.max(0, selectedIndex);
  const next = (base + delta + props.choices.length) % props.choices.length;
  highlightedIndex.value = next;
  scrollHighlightIntoView(next);
}

function selectChoice(value: number): void {
  emit('update:modelValue', value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveHighlight(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveHighlight(-1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    const choice = props.choices[highlightedIndex.value];
    if (!choice) return;
    event.preventDefault();
    selectChoice(choice.value);
    return;
  }
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}

onMounted(() => {
  const selectedIndex = props.choices.findIndex(
    (choice) => choice.value === selectedChoice.value?.value,
  );
  highlightedIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
  scrollHighlightIntoView(highlightedIndex.value);
  void nextTick(() => rootRef.value?.focus({ preventScroll: true }));
});
</script>

<template>
  <div
    :id="dropdownId"
    ref="rootRef"
    class="song-event-picker"
    tabindex="-1"
    role="group"
    :aria-label="`Song for ${eventLabel}`"
    @keydown="handleKeydown"
  >
    <div class="song-event-picker__event">
      <span class="song-event-picker__event-label">{{ eventLabel }}</span>
      <span class="song-event-picker__game">{{ gameLabel }}</span>
    </div>

    <ul
      class="song-event-picker__options"
      role="listbox"
      :aria-label="`Songs for ${eventLabel}`"
    >
      <li
        v-for="(song, index) in choices"
        :key="`${eventId}:${song.value}`"
        role="presentation"
      >
        <button
          type="button"
          class="song-event-picker__option"
          :class="{
            'is-selected': song.value === selectedChoice?.value,
            'is-highlighted': index === highlightedIndex,
          }"
          role="option"
          tabindex="-1"
          :aria-selected="song.value === selectedChoice?.value"
          @click="selectChoice(song.value)"
          @mousemove="highlightedIndex = index"
        >
          <img
            :src="song.image"
            alt=""
            class="song-event-picker__option-icon"
          />
          <span class="song-event-picker__option-label">{{ song.label }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.song-event-picker {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  outline: none;
}

.song-event-picker__event {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.song-event-picker__event-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25;
  color: #e5e7eb;
  overflow-wrap: anywhere;
}

.song-event-picker__game {
  flex: 0 0 auto;
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
  background: #1e2f4d;
  color: #93c5fd;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.song-event-picker__options {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 260px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.song-event-picker__option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.45rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #f9fafb;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}

.song-event-picker__option:hover,
.song-event-picker__option.is-highlighted {
  background: rgba(96, 165, 250, 0.14);
}

.song-event-picker__option:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
}

.song-event-picker__option.is-selected {
  background: rgba(59, 130, 246, 0.24);
}

.song-event-picker__option-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex: 0 0 auto;
  image-rendering: pixelated;
}

.song-event-picker__option-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
