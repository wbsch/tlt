<script setup lang="ts">
import { computed } from 'vue';
import type { AutotrackerStatus } from '../autotracker/useAutotracker';

const props = defineProps<{
  status: AutotrackerStatus;
  enabled: boolean;
  lastError: string | null;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
}>();

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

const statusColor = computed(() => {
  switch (props.status) {
    case 'connected':
      return '#4caf50';
    case 'connecting':
      return '#ff9800';
    case 'error':
      return '#f44336';
    default:
      return '#888';
  }
});

function toggle() {
  emit('update:enabled', !props.enabled);
}
</script>

<template>
  <div class="autotracker-toggle" data-testid="autotracker-toggle">
    <button
      type="button"
      class="autotracker-button"
      :class="{
        'autotracker-button--active': enabled,
        'autotracker-button--error': status === 'error',
      }"
      :title="
        lastError
          ? `Autotracker: ${statusLabel} — ${lastError}`
          : `Autotracker: ${statusLabel}`
      "
      data-testid="autotracker-button"
      @click="toggle"
    >
      <span
        class="autotracker-indicator"
        :style="{ backgroundColor: statusColor }"
      />
      <span class="autotracker-label">AUTO</span>
    </button>
  </div>
</template>

<style scoped>
.autotracker-toggle {
  display: inline-flex;
  align-items: center;
}

.autotracker-button {
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

.autotracker-button:hover {
  background: #3a3a3a;
  border-color: #777;
}

.autotracker-button--active {
  border-color: #4caf50;
  color: #fff;
}

.autotracker-button--error {
  border-color: #f44336;
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
