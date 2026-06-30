<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { buildCoopShareUrl } from '../utils/coopFlag';

// Coop and autotracking are mutually exclusive (see docs/coop-sync.md §7).
// Autotracker state lives in OoTMMTracker, not the store, so it's passed in.
const props = defineProps<{
  autotrackerActive?: boolean;
}>();

// Starting and leaving a room are both confirmed via modals owned by the parent
// (mirrors the AUTO button's overwrite confirmation). The panel only requests
// the action; it never mutates the room itself.
const emit = defineEmits<{
  'request-start': [];
  'request-leave': [];
  // The button stays disabled-looking while autotracking blocks it, but a click
  // still fires this so the parent can explain why (instead of doing nothing).
  blocked: [];
}>();

const COOP_BLOCKED_TITLE = 'Coop is unavailable while autotracking is active';

const sessionStore = useOoTMMSessionStore();
const { coopRoomCode, coopPeerCount, coopConnectionState } =
  storeToRefs(sessionStore);

const isConnected = computed(() => coopConnectionState.value === 'connected');
const isJoined = computed(() => coopRoomCode.value !== null);

// Suffix shown next to the COOP label, e.g. "COOP (1)". Hidden when no peers
// are connected (the count is reset to 0 whenever the room is left/disconnected).
const peerCountSuffix = computed(() =>
  coopPeerCount.value > 0 ? ` (${coopPeerCount.value})` : '',
);

// Block *starting* a room while autotracking; never block leaving (so a stray
// both-active state stays recoverable from the UI). Mirrors AutotrackerToggle.
const isStartBlocked = computed(
  () => Boolean(props.autotrackerActive) && !isJoined.value,
);

const statusLabel = computed(() => {
  switch (coopConnectionState.value) {
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return `Connected · ${coopPeerCount.value} peer${coopPeerCount.value === 1 ? '' : 's'}`;
    case 'disconnected':
      return 'Reconnecting…';
    case 'idle':
    default:
      return 'Not connected';
  }
});

// Dot color mirrors the AUTO button's palette so the two controls read alike.
const statusColor = computed(() => {
  if (isConnected.value) return '#4caf50';
  if (
    coopConnectionState.value === 'connecting' ||
    coopConnectionState.value === 'disconnected'
  ) {
    return '#ff9800';
  }
  return '#888';
});

const isWarning = computed(
  () =>
    coopConnectionState.value === 'connecting' ||
    coopConnectionState.value === 'disconnected',
);

const buttonStateClasses = computed(() => ({
  'coop-button--active': isConnected.value,
  'coop-button--warning': isWarning.value,
  'coop-button--blocked': isStartBlocked.value,
}));

const dropdownStateClasses = computed(() => ({
  'coop-dropdown-toggle--active': isConnected.value,
  'coop-dropdown-toggle--warning': isWarning.value,
}));

const buttonTitle = computed(() => {
  if (isStartBlocked.value) return COOP_BLOCKED_TITLE;
  if (isJoined.value) {
    if (!isConnected.value) {
      return `Coop: ${statusLabel.value} - share the room code; state syncs once both are connected. Click to leave.`;
    }
    return `Coop: ${statusLabel.value} - click to leave the room`;
  }
  return 'Coop: Not connected - click to start a shared room';
});

function handleClick() {
  if (isStartBlocked.value) {
    emit('blocked');
    return;
  }
  if (isJoined.value) {
    emit('request-leave');
    return;
  }
  emit('request-start');
}

// Dropdown (the "⋮" split button) mirrors AutotrackerToggle. Its only entry is
// "Copy coop URL", which only makes sense once a room exists, so the toggle is
// disabled until then.
const rootRef = ref<HTMLElement | null>(null);
const isMenuOpen = ref(false);
const isUrlCopied = ref(false);
let copyResetTimeout: number | null = null;

function closeMenu() {
  isMenuOpen.value = false;
}

function toggleMenu() {
  if (!isJoined.value) return;
  if (!isMenuOpen.value) {
    isUrlCopied.value = false;
  }
  isMenuOpen.value = !isMenuOpen.value;
}

async function copyCoopUrl() {
  const code = coopRoomCode.value;
  if (!code) return;
  const url = buildCoopShareUrl(code);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      markCopied();
      return;
    }
    window.prompt('Copy this coop URL:', url);
    closeMenu();
  } catch (error) {
    console.error('Failed to copy coop URL:', error);
    window.prompt('Copy this coop URL:', url);
    closeMenu();
  }
}

// Brief inline "Copied!" confirmation, mirroring the coop-created modal's copy
// button instead of routing through the header status line.
function markCopied() {
  isUrlCopied.value = true;
  if (copyResetTimeout !== null) {
    window.clearTimeout(copyResetTimeout);
  }
  copyResetTimeout = window.setTimeout(() => {
    isUrlCopied.value = false;
    copyResetTimeout = null;
  }, 2000);
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
  if (event.key !== 'Escape' || !isMenuOpen.value) return;
  event.preventDefault();
  closeMenu();
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleWindowKeydown);
  if (copyResetTimeout !== null) {
    window.clearTimeout(copyResetTimeout);
  }
});
</script>

<template>
  <div class="coop-panel" data-testid="coop-panel">
    <div ref="rootRef" class="coop-control">
      <button
        type="button"
        class="coop-button"
        :class="buttonStateClasses"
        :title="buttonTitle"
        :aria-disabled="isStartBlocked"
        data-testid="coop-button"
        @click="handleClick"
      >
        <span
          class="coop-indicator"
          :style="{ backgroundColor: statusColor }"
          aria-hidden="true"
        />
        <span class="coop-label">COOP{{ peerCountSuffix }}</span>
      </button>
      <button
        type="button"
        class="coop-dropdown-toggle"
        :class="dropdownStateClasses"
        data-testid="coop-dropdown-toggle"
        aria-label="Coop options"
        aria-haspopup="menu"
        :aria-expanded="isMenuOpen ? 'true' : 'false'"
        :disabled="!isJoined"
        @click="toggleMenu"
      >
        ⋮
      </button>
      <div
        v-if="isMenuOpen && isJoined"
        class="coop-dropdown-menu"
        data-testid="coop-dropdown-menu"
        role="menu"
      >
        <button
          type="button"
          class="coop-dropdown-item"
          data-testid="coop-copy-url-button"
          role="menuitem"
          @click="copyCoopUrl"
        >
          {{ isUrlCopied ? 'Copied!' : 'Copy coop URL' }}
        </button>
      </div>
    </div>
    <span
      v-if="isStartBlocked"
      class="coop-hint"
      data-testid="coop-autotracker-blocked-hint"
    >
      Stop autotracking to use coop.
    </span>
  </div>
</template>

<style scoped>
.coop-panel {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  white-space: nowrap;
}

.coop-control {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}

.coop-button {
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

.coop-button:hover:not(:disabled):not(.coop-button--blocked) {
  background: #3a3a3a;
  border-color: #777;
}

.coop-button:disabled,
.coop-button--blocked {
  cursor: default;
  opacity: 0.65;
}

.coop-button--active {
  border-color: #4caf50;
  color: #fff;
}

.coop-button--warning {
  border-color: #ff9800;
  color: #fff;
}

.coop-dropdown-toggle {
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

.coop-dropdown-toggle:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #777;
}

.coop-dropdown-toggle:disabled {
  cursor: default;
  opacity: 0.65;
}

.coop-dropdown-toggle--active {
  border-color: #4caf50;
  color: #fff;
}

.coop-dropdown-toggle--warning {
  border-color: #ff9800;
  color: #fff;
}

.coop-dropdown-menu {
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

.coop-dropdown-item {
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

.coop-dropdown-item:hover {
  background: #3a3a3a;
}

.coop-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.coop-label {
  letter-spacing: 0.05em;
}

.coop-hint {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
