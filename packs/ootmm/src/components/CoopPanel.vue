<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMSessionStore } from '../stores/ootmmSession';

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
}>();

const COOP_BLOCKED_TITLE = 'Coop is unavailable while autotracking is active';

const sessionStore = useOoTMMSessionStore();
const { coopRoomCode, coopPeerCount, coopConnectionState } =
  storeToRefs(sessionStore);

const isConnected = computed(() => coopConnectionState.value === 'connected');
const isJoined = computed(() => coopRoomCode.value !== null);

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

const buttonStateClasses = computed(() => ({
  'coop-button--active': isConnected.value,
  'coop-button--warning':
    coopConnectionState.value === 'connecting' ||
    coopConnectionState.value === 'disconnected',
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
  if (isStartBlocked.value) return;
  if (isJoined.value) {
    emit('request-leave');
    return;
  }
  emit('request-start');
}
</script>

<template>
  <div class="coop-panel" data-testid="coop-panel">
    <button
      type="button"
      class="coop-button"
      :class="buttonStateClasses"
      :title="buttonTitle"
      :disabled="isStartBlocked"
      data-testid="coop-button"
      @click="handleClick"
    >
      <span
        class="coop-indicator"
        :style="{ backgroundColor: statusColor }"
        aria-hidden="true"
      />
      <span class="coop-label">COOP</span>
    </button>
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

.coop-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid #555;
  border-radius: 4px;
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

.coop-button:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #777;
}

.coop-button:disabled {
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
