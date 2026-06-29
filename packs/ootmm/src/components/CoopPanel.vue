<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMSessionStore } from '../stores/ootmmSession';

const ROOM_CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ROOM_CODE_LENGTH = 8;

function generateRoomCode(): string {
  const out: string[] = [];
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(buf);
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      out.push(ROOM_CODE_ALPHABET[buf[i] % ROOM_CODE_ALPHABET.length]);
    }
    return out.join('');
  }
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    out.push(ROOM_CODE_ALPHABET[idx]);
  }
  return out.join('');
}

// Coop and autotracking are mutually exclusive (see docs/coop-sync.md §7).
// Autotracker state lives in OoTMMTracker, not the store, so it's passed in.
const props = defineProps<{
  autotrackerActive?: boolean;
}>();

const sessionStore = useOoTMMSessionStore();
const { coopRoomCode, coopPeerCount, coopConnectionState } =
  storeToRefs(sessionStore);

const isConnected = computed(() => coopConnectionState.value === 'connected');
const isJoined = computed(() => coopRoomCode.value !== null);

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

function handleStart() {
  if (props.autotrackerActive) return;
  sessionStore.startRoomSync({ roomCode: generateRoomCode() });
}

function handleLeave() {
  sessionStore.leaveRoom();
}
</script>

<template>
  <div class="coop-panel" data-testid="coop-panel">
    <span class="coop-panel-label">Coop</span>
    <span
      class="coop-panel-status"
      :class="`coop-status-${coopConnectionState}`"
      data-testid="coop-status"
      :title="
        isJoined && !isConnected
          ? 'Share the room code with another player. State syncs once both are connected.'
          : undefined
      "
    >
      <span class="coop-panel-dot" aria-hidden="true"></span>
      {{ statusLabel }}
    </span>

    <template v-if="!isJoined">
      <button
        type="button"
        class="coop-panel-button"
        :disabled="autotrackerActive"
        :title="
          autotrackerActive ? 'Stop autotracking to use coop' : undefined
        "
        data-testid="coop-start-button"
        @click="handleStart"
      >
        Start coop
      </button>
      <span
        v-if="autotrackerActive"
        class="coop-panel-hint"
        data-testid="coop-autotracker-blocked-hint"
      >
        Stop autotracking to use coop.
      </span>
    </template>

    <template v-else>
      <code class="coop-panel-code" data-testid="coop-room-code">{{
        coopRoomCode
      }}</code>
      <button
        type="button"
        class="coop-panel-button coop-panel-button-danger"
        data-testid="coop-leave-button"
        @click="handleLeave"
      >
        Leave
      </button>
    </template>
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

.coop-panel-label {
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #9ca3af;
}

.coop-panel-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  opacity: 0.85;
}

.coop-panel-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}

.coop-status-connected {
  color: #5fdc7a;
}

.coop-status-connecting,
.coop-status-disconnected {
  color: #ffc857;
}

.coop-status-idle {
  opacity: 0.6;
}

.coop-panel-button {
  padding: 0.4rem 0.6rem;
  border-radius: 0.25rem;
  border: 1px solid #67e8f9;
  background: #155e75;
  color: #fff;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 700;
}

.coop-panel-button:hover:not(:disabled) {
  background: #0e7490;
}

.coop-panel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.coop-panel-button-danger {
  border-color: #fca5a5;
  background: #7f1d1d;
}

.coop-panel-button-danger:hover:not(:disabled) {
  background: #991b1b;
}

.coop-panel-code {
  padding: 0.35rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #404040;
  background: #2a2a2a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.03em;
}

.coop-panel-hint {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
