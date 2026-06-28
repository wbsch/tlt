<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { isValidCoopRoomCode } from '../utils/coopFlag';

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

const joinCodeInput = ref('');
const copyStatus = ref<'idle' | 'copied'>('idle');
const isJoinConfirmOpen = ref(false);
const pendingJoinCode = ref('');

const isConnected = computed(() => coopConnectionState.value === 'connected');
const isJoined = computed(() => coopRoomCode.value !== null);
const normalizedJoinCode = computed(() => joinCodeInput.value.trim());
const canJoinCode = computed(() =>
  isValidCoopRoomCode(normalizedJoinCode.value),
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

function handleStart() {
  if (props.autotrackerActive) return;
  sessionStore.startRoomSync({ roomCode: generateRoomCode() });
}

function handleJoin() {
  if (props.autotrackerActive) return;
  const code = normalizedJoinCode.value;
  if (!isValidCoopRoomCode(code)) return;
  // Joining adopts the room's state and replaces local tracker progress, so
  // always confirm first. Consent stays in the UI layer (the store's
  // startRoomSync is also used by non-destructive auto-rejoin and "Start coop").
  pendingJoinCode.value = code;
  isJoinConfirmOpen.value = true;
}

function confirmJoin() {
  const code = pendingJoinCode.value;
  isJoinConfirmOpen.value = false;
  pendingJoinCode.value = '';
  if (props.autotrackerActive) return;
  if (!isValidCoopRoomCode(code)) return;
  sessionStore.startRoomSync({ roomCode: code });
  joinCodeInput.value = '';
}

function cancelJoin() {
  isJoinConfirmOpen.value = false;
  pendingJoinCode.value = '';
}

function handleLeave() {
  sessionStore.leaveRoom();
}

async function handleCopyCode() {
  const code = coopRoomCode.value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copyStatus.value = 'copied';
    window.setTimeout(() => {
      copyStatus.value = 'idle';
    }, 1500);
  } catch (error) {
    console.warn('[Coop] Failed to copy room code', error);
  }
}
</script>

<template>
  <div class="coop-panel" data-testid="coop-panel">
    <div class="coop-panel-header">
      <span class="coop-panel-title">Coop</span>
      <span
        class="coop-panel-status"
        :class="`coop-status-${coopConnectionState}`"
        data-testid="coop-status"
      >
        {{ statusLabel }}
      </span>
    </div>
    <template v-if="!isJoined">
      <div class="coop-panel-row">
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
      </div>
      <div class="coop-panel-row">
        <input
          v-model="joinCodeInput"
          type="text"
          class="coop-panel-input"
          placeholder="Join with code"
          spellcheck="false"
          autocomplete="off"
          pattern="[A-Za-z0-9]+"
          :disabled="autotrackerActive"
          :aria-invalid="
            joinCodeInput.trim() && !canJoinCode ? 'true' : undefined
          "
          data-testid="coop-room-code-input"
          @keydown.enter.prevent="handleJoin"
        />
        <button
          type="button"
          class="coop-panel-button"
          :disabled="!canJoinCode || autotrackerActive"
          data-testid="coop-join-button"
          @click="handleJoin"
        >
          Join
        </button>
      </div>
      <p
        v-if="autotrackerActive"
        class="coop-panel-hint"
        data-testid="coop-autotracker-blocked-hint"
      >
        Stop autotracking to use coop.
      </p>
    </template>
    <div v-else class="coop-panel-row">
      <code class="coop-panel-code" data-testid="coop-room-code">{{
        coopRoomCode
      }}</code>
      <button
        type="button"
        class="coop-panel-button"
        data-testid="coop-copy-button"
        @click="handleCopyCode"
      >
        {{ copyStatus === 'copied' ? 'Copied' : 'Copy' }}
      </button>
      <button
        type="button"
        class="coop-panel-button coop-panel-button-danger"
        data-testid="coop-leave-button"
        @click="handleLeave"
      >
        Leave
      </button>
    </div>
    <p v-if="isJoined && !isConnected" class="coop-panel-hint">
      Share the room code with another player. State will sync once both are
      connected.
    </p>

    <div
      v-if="isJoinConfirmOpen"
      class="coop-confirm-backdrop"
      data-testid="coop-join-confirm-backdrop"
      @click="cancelJoin"
    >
      <div
        class="coop-confirm-modal"
        data-testid="coop-join-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coop-join-confirm-title"
        aria-describedby="coop-join-confirm-description"
        @click.stop
      >
        <h2 id="coop-join-confirm-title">Join coop room?</h2>
        <p id="coop-join-confirm-description">
          Joining replaces your current tracker state with the room's shared
          state. This can't be undone.
        </p>
        <div class="coop-confirm-actions">
          <button
            type="button"
            class="coop-panel-button"
            data-testid="coop-join-confirm-cancel-button"
            @click="cancelJoin"
          >
            Cancel
          </button>
          <button
            type="button"
            class="coop-panel-button coop-panel-button-danger"
            data-testid="coop-join-confirm-apply-button"
            @click="confirmJoin"
          >
            Join &amp; Replace
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coop-panel {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  font-size: 0.85rem;
  min-width: 220px;
}

.coop-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.coop-panel-title {
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.75rem;
}

.coop-panel-status {
  font-size: 0.75rem;
  opacity: 0.85;
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

.coop-panel-row {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.coop-panel-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
  color: inherit;
  font: inherit;
}

.coop-panel-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.coop-panel-button {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.coop-panel-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.coop-panel-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.coop-panel-button-danger {
  border-color: rgba(255, 120, 120, 0.5);
}

.coop-panel-button-danger:hover {
  background: rgba(255, 120, 120, 0.15);
}

.coop-panel-code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coop-panel-hint {
  margin: 0.2rem 0 0 0;
  font-size: 0.75rem;
  opacity: 0.7;
}

.coop-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 1rem;
}

.coop-confirm-modal {
  max-width: 320px;
  width: 100%;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: #2a2a2a;
  color: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.coop-confirm-modal h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.coop-confirm-modal p {
  margin: 0 0 1rem 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.coop-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
