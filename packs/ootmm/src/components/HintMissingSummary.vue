<script setup lang="ts">
import { computed } from 'vue';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { storeToRefs } from 'pinia';
import {
  parseSpoilerHints,
  getExpectedHintCounts,
  type HintCategory,
} from '../utils/hintSpoilerAnalysis';

const sessionStore = useOoTMMSessionStore();
const { spoilerPlacements, hintTracker, hasImportedSpoilerLog, hintsText } =
  storeToRefs(sessionStore);

const CATEGORY_LABELS: Record<HintCategory, string> = {
  path: 'Path',
  foolish: 'Foolish',
  'item-exact': 'Always/Sometimes',
  'item-region': 'Region',
  moon: 'Moon',
};

/** Total counts expected from the spoiler log */
const expectedCounts = computed(() => {
  if (!hintsText.value) return null;
  try {
    const parsed = parseSpoilerHints(hintsText.value);
    return getExpectedHintCounts(parsed);
  } catch {
    return null;
  }
});

/** Current recorded counts by category */
const recordedCounts = computed(() => ({
  path: hintTracker.value.pathHints.length,
  'item-exact': hintTracker.value.alwaysSometimesHints.length,
  'item-region': hintTracker.value.regionHints.length,
  foolish: hintTracker.value.foolishHints.length,
  moon: hintTracker.value.moonHints.length,
}));

const hintCounts = computed(() => {
  if (!expectedCounts.value) return null;
  const expected = expectedCounts.value;

  const expectedItemExact = expected['item-exact'] ?? 0;
  const expectedRegion = expected['item-region'] ?? 0;
  const expectedFoolish = expected.foolish ?? 0;
  const expectedPath = expected.path ?? 0;
  const expectedMoon = expected.moon ?? 0;

  const pathCount = {
    expected: expectedPath,
    found: Math.min(recordedCounts.value.path, expectedPath),
  };
  const itemExactCount = {
    expected: expectedItemExact,
    found: Math.min(recordedCounts.value['item-exact'], expectedItemExact),
  };
  const regionCount = {
    expected: expectedRegion,
    found: Math.min(recordedCounts.value['item-region'], expectedRegion),
  };
  const foolishCount = {
    expected: expectedFoolish,
    found: Math.min(recordedCounts.value.foolish, expectedFoolish),
  };
  const moonCount = {
    expected: expectedMoon,
    found: Math.min(recordedCounts.value.moon, expectedMoon),
  };

  return {
    path: pathCount,
    'item-exact': itemExactCount,
    'item-region': regionCount,
    foolish: foolishCount,
    moon: moonCount,
  } as Record<HintCategory, { expected: number; found: number }>;
});

const totalSummary = computed(() => {
  if (!hintCounts.value) return null;
  const counts = hintCounts.value;
  let totalExpected = 0;
  let totalFound = 0;
  for (const c of Object.values(counts)) {
    totalExpected += c.expected;
    totalFound += c.found;
  }
  return { expected: totalExpected, found: totalFound };
});
</script>

<template>
  <div v-if="hintCounts" class="hint-missing-summary">
    <div class="hint-missing-summary__header">
      <strong>Hint Progress</strong>
      <span v-if="totalSummary" class="hint-missing-summary__total">
        {{ totalSummary.found }} / {{ totalSummary.expected }}
      </span>
    </div>
    <div class="hint-missing-summary__grid">
      <div
        v-for="(count, category) in hintCounts"
        :key="category"
        class="hint-missing-summary__item"
      >
        <span class="hint-missing-summary__label">{{
          CATEGORY_LABELS[category as HintCategory] ?? category
        }}</span>
        <span class="hint-missing-summary__value"
          >{{ count.found }} / {{ count.expected }}</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-missing-summary {
  padding: 8px;
  margin-bottom: 8px;
  background: #1a1e2a;
  border: 1px solid #3a4a5a;
  border-radius: 4px;
}

.hint-missing-summary__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.85rem;
}

.hint-missing-summary__total {
  color: #60a5fa;
  font-weight: 600;
}

.hint-missing-summary__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.hint-missing-summary__item {
  display: flex;
  justify-content: space-between;
  padding: 2px 6px;
  background: #2a2a3a;
  border-radius: 3px;
  font-size: 0.75rem;
}

.hint-missing-summary__label {
  color: #999;
}

.hint-missing-summary__value {
  color: #60a5fa;
  font-weight: 600;
}
</style>
