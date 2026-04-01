<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { matchesSearchTerms } from '../utils/search';

type DestinationOption = {
  value: string;
  label: string;
  game: 'oot' | 'mm';
};

const props = withDefaults(
  defineProps<{
    dropdownId: string;
    options: readonly DestinationOption[];
    modelValue: string;
    placeholder?: string;
    emptyText?: string;
  }>(),
  {
    placeholder: '— Not mapped —',
    emptyText: 'No destinations found',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isOpen = ref(false);
const query = ref('');
const highlightedIndex = ref(-1);

function formatOptionLabel(option: DestinationOption): string {
  return `${option.label}${option.game === 'mm' ? ' (MM)' : ' (OoT)'}`;
}

const filteredOptions = computed(() => {
  if (!query.value.trim()) return [...props.options];
  return props.options.filter((option) =>
    matchesSearchTerms(
      [
        option.label,
        formatOptionLabel(option),
        option.game === 'mm' ? 'MM' : 'OoT',
      ],
      query.value,
    ),
  );
});

const displayValue = computed(() => {
  if (isOpen.value) return query.value;
  if (!props.modelValue) return '';
  const option = props.options.find((entry) => entry.value === props.modelValue);
  return option ? formatOptionLabel(option) : '';
});

const hasValue = computed(() => Boolean(props.modelValue) && !isOpen.value);

function openDropdown(): void {
  isOpen.value = true;
  highlightedIndex.value = -1;
}

function closeDropdown(): void {
  isOpen.value = false;
  query.value = '';
  highlightedIndex.value = -1;
}

function handleFocus(): void {
  query.value = '';
  openDropdown();
}

function handleClick(): void {
  query.value = '';
  openDropdown();
  inputRef.value?.select();
}

function handleInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value;
  openDropdown();
  highlightedIndex.value = 0;
}

function handleOptionClick(value: string): void {
  emit('update:modelValue', value);
  closeDropdown();
}

function handleClear(): void {
  emit('update:modelValue', '');
  closeDropdown();
}

function scrollHighlightedIntoView(): void {
  nextTick(() => {
    const listbox = document.getElementById(props.dropdownId);
    if (!listbox) return;
    const highlighted = listbox.querySelector('.is-highlighted');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleKeydown(event: KeyboardEvent): void {
  const options = filteredOptions.value;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isOpen.value) {
      openDropdown();
      return;
    }
    if (options.length === 0) return;
    highlightedIndex.value =
      highlightedIndex.value < 0
        ? 0
        : (highlightedIndex.value + 1) % options.length;
    scrollHighlightedIntoView();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isOpen.value) {
      openDropdown();
      return;
    }
    if (options.length === 0) return;
    highlightedIndex.value =
      highlightedIndex.value < 0
        ? options.length - 1
        : (highlightedIndex.value - 1 + options.length) % options.length;
    scrollHighlightedIntoView();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (options.length === 0) {
      closeDropdown();
      return;
    }
    const selected =
      options[highlightedIndex.value >= 0 ? highlightedIndex.value : 0];
    if (selected) {
      emit('update:modelValue', selected.value);
    }
    closeDropdown();
    inputRef.value?.blur();
    return;
  }

  if (event.key === 'Tab') {
    if (!isOpen.value) return;
    if (options.length > 0) {
      const selected =
        options[highlightedIndex.value >= 0 ? highlightedIndex.value : 0];
      if (selected) {
        emit('update:modelValue', selected.value);
      }
    }
    closeDropdown();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeDropdown();
    inputRef.value?.blur();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!query.value && props.modelValue) {
      emit('update:modelValue', '');
    }
  }
}
</script>

<template>
  <div class="destination-combobox">
    <input
      ref="inputRef"
      class="destination-combobox__input"
      :class="{ 'has-value': hasValue }"
      :value="displayValue"
      :data-selected="modelValue || ''"
      type="text"
      :placeholder="modelValue ? '' : placeholder"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      :aria-controls="dropdownId"
      @focus="handleFocus"
      @click="handleClick"
      @input="handleInput"
      @blur="closeDropdown"
      @keydown="handleKeydown"
    />
    <button
      v-if="hasValue"
      class="destination-combobox__clear"
      type="button"
      tabindex="-1"
      title="Clear mapping"
      @mousedown.prevent
      @click="handleClear"
    >
      ×
    </button>
    <ul
      v-if="isOpen"
      :id="dropdownId"
      class="destination-combobox__options"
      role="listbox"
    >
      <li
        v-for="(option, index) in filteredOptions"
        :key="option.value"
        class="destination-combobox__option"
        :class="{ 'is-highlighted': index === highlightedIndex }"
        :data-value="option.value"
        role="option"
        :aria-selected="index === highlightedIndex"
        @mousedown.prevent
        @click="handleOptionClick(option.value)"
      >
        <span class="destination-combobox__option-label">{{ option.label }}</span>
        <span class="destination-combobox__option-game">
          {{ option.game === 'mm' ? '(MM)' : '(OoT)' }}
        </span>
      </li>
      <li
        v-if="filteredOptions.length === 0"
        class="destination-combobox__empty"
      >
        {{ emptyText }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.destination-combobox {
  position: relative;
  width: 100%;
}

.destination-combobox__input {
  width: 100%;
  padding: 0.3rem 1.5rem 0.3rem 0.4rem;
  font-size: 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  cursor: text;
  box-sizing: border-box;
}

.destination-combobox__input::placeholder {
  color: #6b7280;
}

.destination-combobox__input.has-value {
  color: #93c5fd;
}

.destination-combobox__input:focus {
  outline: 2px solid #60a5fa;
  outline-offset: -1px;
}

.destination-combobox__input:hover {
  border-color: #6b7280;
}

.destination-combobox__clear {
  position: absolute;
  right: 0.2rem;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: #9ca3af;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
}

.destination-combobox__clear:hover {
  color: #f87171;
}

.destination-combobox__options {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  position: absolute;
  top: calc(100% + 0.2rem);
  left: 0;
  right: 0;
  border: 1px solid #4b5563;
  border-radius: 0.35rem;
  background: #111827;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.45);
  max-height: min(16rem, 45vh);
  overflow-y: auto;
  z-index: 16;
}

.destination-combobox__option {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0.4rem;
  border-radius: 0.25rem;
  cursor: pointer;
}

.destination-combobox__option:hover,
.destination-combobox__option.is-highlighted {
  background: #1f2937;
}

.destination-combobox__option-label {
  color: #e5e7eb;
  font-size: 0.75rem;
  min-width: 0;
}

.destination-combobox__option-game {
  color: #93c5fd;
  font-size: 0.65rem;
  white-space: nowrap;
}

.destination-combobox__empty {
  color: #9ca3af;
  font-size: 0.72rem;
  padding: 0.3rem 0.4rem;
}
</style>