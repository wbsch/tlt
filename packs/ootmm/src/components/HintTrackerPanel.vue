<script setup lang="ts">
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import { storeToRefs } from 'pinia';
import OoTMMSpoilerLookup from './OoTMMSpoilerLookup.vue';
import HintTrackerMain from './HintTrackerMain.vue';

const sessionStore = useOoTMMSessionStore();
const { hasImportedSpoilerLog } = storeToRefs(sessionStore);

const uiStore = useOoTMMUiStore();
const { isSpoilerSectionCollapsed, isHintSectionCollapsed } =
  storeToRefs(uiStore);
</script>

<template>
  <div class="hint-tracker-panel">
    <!-- Spoiler Lookup section -->
    <div v-if="hasImportedSpoilerLog" class="hint-tracker-panel__section">
      <div
        class="hint-tracker-panel__section-header"
        @click="isSpoilerSectionCollapsed = !isSpoilerSectionCollapsed"
      >
        <span class="hint-tracker-panel__collapse-icon">{{
          isSpoilerSectionCollapsed ? '▶' : '▼'
        }}</span>
        <span>Spoiler Lookup</span>
      </div>
      <div
        v-if="!isSpoilerSectionCollapsed"
        class="hint-tracker-panel__section-body"
      >
        <OoTMMSpoilerLookup />
      </div>
    </div>

    <!-- Hint Tracker section -->
    <div class="hint-tracker-panel__section">
      <div
        class="hint-tracker-panel__section-header"
        @click="isHintSectionCollapsed = !isHintSectionCollapsed"
      >
        <span class="hint-tracker-panel__collapse-icon">{{
          isHintSectionCollapsed ? '▶' : '▼'
        }}</span>
        <span>Hint Tracker</span>
      </div>
      <div
        v-if="!isHintSectionCollapsed"
        class="hint-tracker-panel__section-body"
      >
        <HintTrackerMain />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-tracker-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
}

.hint-tracker-panel__section {
  border: 1px solid #3a4a5a;
  border-radius: 4px;
  background: #1a1e1a;
}

.hint-tracker-panel__section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #2a2a3a;
  cursor: pointer;
  user-select: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ccc;
}

.hint-tracker-panel__section-header:hover {
  background: #3a3a4a;
}

.hint-tracker-panel__collapse-icon {
  font-size: 0.7rem;
  width: 12px;
}

.hint-tracker-panel__section-body {
  padding: 4px;
}
</style>
