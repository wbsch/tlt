<script setup lang="ts">
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { computed } from 'vue';

const sessionStore = useOoTMMSessionStore();

const totalPlacements = computed(() => sessionStore.spoilerPlacements.length);
const hasDebug = computed(() =>
  new URLSearchParams(window.location.search).has('debug'),
);
</script>

<template>
  <div class="spoiler-lookup">
    <p class="spoiler-placeholder">Spoiler lookup coming soon.</p>
    <p class="spoiler-summary" v-if="totalPlacements > 0">
      {{ totalPlacements }} item placements loaded.
    </p>
    <table v-if="hasDebug && totalPlacements > 0" class="debug-table">
      <thead>
        <tr>
          <th>Location</th>
          <th>Item</th>
          <th>Region</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in sessionStore.spoilerPlacements" :key="i">
          <td>{{ p.locationName }} ({{ p.locationId }})</td>
          <td>{{ p.itemName }} ({{ p.itemId }})</td>
          <td>{{ p.region ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.spoiler-lookup {
  padding: 12px;
}
.spoiler-placeholder {
  color: #888;
  font-style: italic;
  margin: 0 0 8px;
}
.spoiler-summary {
  margin: 0 0 8px;
  font-size: 0.85em;
  color: #666;
}
.debug-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75em;
}
.debug-table th,
.debug-table td {
  border: 1px solid #ccc;
  padding: 2px 4px;
  text-align: left;
}
.debug-table th {
  background: #f5f5f5;
  font-weight: 600;
}
</style>
