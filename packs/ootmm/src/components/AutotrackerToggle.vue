<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AutotrackerStatus } from '../autotracker/useAutotracker';

const props = defineProps<{
  status: AutotrackerStatus;
  enabled: boolean;
  lastError: string | null;
  warningMessage?: string | null;
  /**
   * Coop and autotracking are mutually exclusive (see docs/coop-sync.md §7).
   * While in a room the toggle is blocked from turning autotracking on.
   */
  coopActive?: boolean;
}>();

const COOP_BLOCKED_TITLE = 'Autotracking is unavailable while coop is active';

// Block turning autotracking *on* while in a room; never block turning it off
// (so a stray both-active state stays recoverable from the UI).
const isCoopBlocked = computed(
  () => Boolean(props.coopActive) && !props.enabled,
);

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'start-overwrite': [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const isMenuOpen = ref(false);

const warningMessage = computed(() => props.warningMessage?.trim() || null);

const statusLabel = computed(() => {
  switch (props.status) {
    case 'disconnected':
      return 'Disconnected';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
});

const isConnected = computed(
  () => props.enabled && props.status === 'connected',
);

const isConnectionPending = computed(
  () => props.enabled && props.status !== 'connected',
);

const isError = computed(
  () => props.status === 'error' && !isConnectionPending.value,
);

const statusColor = computed(() => {
  if (isConnected.value) {
    return '#4caf50';
  }

  if (isConnectionPending.value || props.status === 'connecting') {
    return '#ff9800';
  }

  switch (props.status) {
    case 'error':
      return '#f44336';
    default:
      return '#888';
  }
});

const buttonStateClasses = computed(() => ({
  'autotracker-button--active': isConnected.value,
  'autotracker-button--warning': isConnectionPending.value,
  'autotracker-button--error': isError.value,
}));

const dropdownStateClasses = computed(() => ({
  'autotracker-dropdown-toggle--active': isConnected.value,
  'autotracker-dropdown-toggle--warning': isConnectionPending.value,
  'autotracker-dropdown-toggle--error': isError.value,
}));

const buttonTitle = computed(() => {
  if (isCoopBlocked.value) {
    return COOP_BLOCKED_TITLE;
  }
  const baseTitle = lastErrorTitle();
  if (props.enabled) {
    return baseTitle;
  }
  return `${baseTitle} - click to keep current state`;
});

function lastErrorTitle() {
  return warningMessage.value
    ? `Autotracker: ${statusLabel.value} - ${warningMessage.value}`
    : props.lastError
      ? `Autotracker: ${statusLabel.value} - ${props.lastError}`
      : `Autotracker: ${statusLabel.value}`;
}

function closeMenu() {
  isMenuOpen.value = false;
}

function handleDocumentClick(event: MouseEvent) {
  if (!isMenuOpen.value) return;
  const target = event.target;
  if (target instanceof Node && rootRef.value?.contains(target)) {
    return;
  }
  closeMenu();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !isMenuOpen.value) {
    return;
  }

  event.preventDefault();
  closeMenu();
}

function toggle() {
  if (isCoopBlocked.value) {
    return;
  }
  closeMenu();
  emit('update:enabled', !props.enabled);
}

function toggleMenu() {
  if (props.enabled || props.coopActive) {
    return;
  }
  isMenuOpen.value = !isMenuOpen.value;
}

function startOverwrite() {
  if (props.enabled || props.coopActive) {
    return;
  }
  closeMenu();
  emit('start-overwrite');
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleWindowKeydown);
});
</script>

<template>
  <div
    ref="rootRef"
    class="autotracker-toggle"
    data-testid="autotracker-toggle"
  >
    <button
      type="button"
      class="autotracker-button"
      :class="buttonStateClasses"
      :title="buttonTitle"
      :disabled="isCoopBlocked"
      data-testid="autotracker-button"
      @click="toggle"
    >
      <span
        class="autotracker-indicator"
        :style="{ backgroundColor: statusColor }"
      />
      <span class="autotracker-label">AUTO</span>
    </button>
    <button
      type="button"
      class="autotracker-dropdown-toggle"
      :class="dropdownStateClasses"
      data-testid="autotracker-dropdown-toggle"
      aria-label="Autotracker options"
      aria-haspopup="menu"
      :aria-expanded="isMenuOpen ? 'true' : 'false'"
      :title="coopActive ? COOP_BLOCKED_TITLE : undefined"
      :disabled="enabled || coopActive"
      @click="toggleMenu"
    >
      ⋮
    </button>
    <div
      v-if="isMenuOpen"
      class="autotracker-dropdown-menu"
      data-testid="autotracker-dropdown-menu"
      role="menu"
    >
      <button
        type="button"
        class="autotracker-dropdown-item"
        data-testid="autotracker-overwrite-button"
        role="menuitem"
        @click="startOverwrite"
      >
        Overwrite current state
      </button>
    </div>
  </div>
</template>

<style scoped>
.autotracker-toggle {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}

.autotracker-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid #555;
  border-right: none;
  border-radius: 4px 0 0 4px;
  background: #2a2a2a;
  color: #ccc;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  white-space: nowrap;
}

.autotracker-button:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #777;
}

.autotracker-button:disabled {
  cursor: default;
  opacity: 0.65;
}

.autotracker-button--active {
  border-color: #4caf50;
  color: #fff;
}

.autotracker-button--warning {
  border-color: #ff9800;
  color: #fff;
}

.autotracker-button--error {
  border-color: #f44336;
}

.autotracker-dropdown-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 7px;
  border: 1px solid #555;
  border-radius: 0 4px 4px 0;
  background: #2a2a2a;
  color: #ccc;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    opacity 0.15s;
}

.autotracker-dropdown-toggle:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #777;
}

.autotracker-dropdown-toggle:disabled {
  cursor: default;
  opacity: 0.65;
}

.autotracker-dropdown-toggle--active:disabled,
.autotracker-dropdown-toggle--warning:disabled {
  opacity: 1;
}

.autotracker-dropdown-toggle--active {
  border-color: #4caf50;
  color: #fff;
}

.autotracker-dropdown-toggle--warning {
  border-color: #ff9800;
  color: #fff;
}

.autotracker-dropdown-toggle--error {
  border-color: #f44336;
}

.autotracker-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  min-width: max-content;
  border: 1px solid #555;
  border-radius: 0.25rem;
  background: #1f1f1f;
  box-shadow: 0 4px 12px rgb(0 0 0 / 40%);
  z-index: 10;
}

.autotracker-dropdown-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  color: #e5e7eb;
  font-size: 0.75rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.autotracker-dropdown-item:hover {
  background: #3a3a3a;
}

.autotracker-dropdown-item--selected {
  color: #fff;
  background: #2f4d32;
}

.autotracker-dropdown-item--selected:hover {
  background: #3b6240;
}

.autotracker-dropdown-section-label {
  padding: 0.45rem 0.75rem 0.2rem;
  color: #9ca3af;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.autotracker-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.autotracker-label {
  letter-spacing: 0.05em;
}
</style>
