<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { storeToRefs } from 'pinia';
import { getRegionOptions, getRegionDisplayName } from '../data/regionNames';
import {
  ALWAYS_HINT_CHECKS,
  SOMETIMES_HINT_CHECKS,
  findHintCheckById,
  resolveCheckSlotLocationCodes,
} from '../data/hintCheckLocations';
import type {
  PathSubType,
  RecordedPathHint,
  RecordedItemExactHint,
  RecordedItemRegionHint,
  RecordedFoolishHint,
  RecordedMoonHint,
} from '../data/hintTypes';
import HintItemPicker from './HintItemPicker.vue';
import HintMissingSummary from './HintMissingSummary.vue';
import {
  parseSpoilerHints,
  type ParsedHintsData,
} from '../utils/hintSpoilerAnalysis';
import { getItemIcon } from '../data/itemIcons';
import {
  createItemDisplayNameResolver,
  getHintItemEntries,
} from '../utils/hintItemNames';

const sessionStore = useOoTMMSessionStore();
const {
  hintTracker,
  spoilerPlacements,
  collectedLocationIds,
  hasImportedSpoilerLog,
  hintsText,
  availableItemIdSet,
  allLocations,
  regionLocationMap,
  regionToLocationIds,
} = storeToRefs(sessionStore);

// ── Collapsible sections ──
const isPathCollapsed = ref(false);
const isAlwaysSometimesCollapsed = ref(true);
const isRegionCollapsed = ref(true);
const isFoolishCollapsed = ref(true);
const isMoonCollapsed = ref(true);

// ── Add form state ──
// Path
const pathFormRegion = ref('');
const pathFormSubType = ref<PathSubType>('woth');
const pathFormSubId = ref<number>(0);
const isPathFormOpen = ref(false);

// Always/Sometimes (merged)
const alwaysSometimesFormLocation = ref('');
const alwaysSometimesFormItems = ref<string[]>(['']);
const isAlwaysSometimesFormOpen = ref(false);

/** Index of the Always/Sometimes hint awaiting removal confirmation, or null. */
const pendingAlwaysSometimesRemoval = ref<number | null>(null);

/** Check definition for the currently selected Always/Sometimes location */
const alwaysSometimesSelectedCheck = computed(() => {
  if (!alwaysSometimesFormLocation.value) return undefined;
  return findHintCheckById(alwaysSometimesFormLocation.value);
});

/** Number of items the selected check yields (at least 1) */
const alwaysSometimesSelectedItemCount = computed(() =>
  Math.max(1, alwaysSometimesSelectedCheck.value?.itemCount ?? 1),
);

// Keep the item slot array sized to the selected check's item count
watch(alwaysSometimesFormLocation, () => {
  const count = alwaysSometimesSelectedItemCount.value;
  const next = [...alwaysSometimesFormItems.value];
  while (next.length < count) next.push('');
  alwaysSometimesFormItems.value = next.slice(0, count);
});

function setAlwaysSometimesFormItem(index: number, value: string) {
  const next = [...alwaysSometimesFormItems.value];
  next[index] = value;
  alwaysSometimesFormItems.value = next;
}

/** All item IDs recorded on an Always/Sometimes hint */
function getHintItems(hint: RecordedItemExactHint): string[] {
  return [hint.itemId, ...(hint.extraItemIds ?? [])];
}

function normalizeLocationName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Build a lookup from normalized location name → runtime location IDs. */
function buildLocationNameMap(): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const loc of allLocations.value) {
    const key = normalizeLocationName(loc.name);
    const existing = byName.get(key) ?? [];
    existing.push(loc.id);
    byName.set(key, existing);
  }
  return byName;
}

/**
 * Resolve the runtime location IDs to mark collected for a hint, based on
 * which of its item slots are Junk. Each Junk slot maps to its own location(s)
 * (including alternate variants such as MQ), so partially-junk multi-item hints
 * only collect the locations belonging to the junked items.
 */
function resolveJunkLocationIds(hint: RecordedItemExactHint): string[] {
  const checkDef = findHintCheckById(hint.location);
  if (!checkDef || checkDef.locationCodes.length === 0) return [];

  const items = getHintItems(hint);
  const byName = buildLocationNameMap();
  const resolved = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    if (items[i] !== 'JUNK') continue;
    for (const name of resolveCheckSlotLocationCodes(checkDef, i)) {
      const ids = byName.get(normalizeLocationName(name));
      if (ids) for (const id of ids) resolved.add(id);
    }
  }
  return Array.from(resolved);
}

// Region
const regionFormRegion = ref('');
const regionFormItem = ref('');
const isRegionFormOpen = ref(false);

// Foolish
const foolishFormRegion = ref('');
const isFoolishFormOpen = ref(false);

// Moon
const moonFormRegion = ref('');
const moonFormItem = ref('');
const isMoonFormOpen = ref(false);

// ── Region options ──
const regionOptions = computed(() => getRegionOptions());

// ── Spoiler log hint data (for filtering combo options) ──
const parsedSpoilerHints = computed<ParsedHintsData | null>(() => {
  if (!hintsText.value) return null;
  try {
    return parseSpoilerHints(hintsText.value);
  } catch {
    return null;
  }
});

// Build map: region display name → region ID for reverse lookup
function buildRegionNameToIdMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const opt of getRegionOptions()) {
    map.set(opt.label, opt.value);
  }
  return map;
}

/** Resolve spoiler region display names to region IDs. */
function getRegionIdsFromDisplayNames(names: Set<string>): Set<string> {
  const nameToId = buildRegionNameToIdMap();
  const ids = new Set<string>();
  for (const name of names) {
    const id = nameToId.get(name);
    if (id) ids.add(id);
  }
  return ids;
}

// ── Filtered options (when spoiler log is loaded) ──
const regionOptionsForPath = computed(() => {
  if (!parsedSpoilerHints.value?.availableRegionsForPath?.size) {
    return regionOptions.value;
  }
  const availableIds = getRegionIdsFromDisplayNames(
    parsedSpoilerHints.value.availableRegionsForPath,
  );
  if (availableIds.size === 0) return regionOptions.value;
  return regionOptions.value.filter((opt) => availableIds.has(opt.value));
});

const regionOptionsForRegion = computed(() => {
  if (!parsedSpoilerHints.value?.availableRegionsForRegion?.size) {
    return regionOptions.value;
  }
  const availableIds = getRegionIdsFromDisplayNames(
    parsedSpoilerHints.value.availableRegionsForRegion,
  );
  if (availableIds.size === 0) return regionOptions.value;
  return regionOptions.value.filter((opt) => availableIds.has(opt.value));
});

const regionOptionsForFoolish = computed(() => {
  if (!parsedSpoilerHints.value?.availableRegionsForFoolish?.size) {
    return regionOptions.value;
  }
  const availableIds = getRegionIdsFromDisplayNames(
    parsedSpoilerHints.value.availableRegionsForFoolish,
  );
  if (availableIds.size === 0) return regionOptions.value;
  return regionOptions.value.filter((opt) => availableIds.has(opt.value));
});

const regionOptionsForMoon = computed(() => {
  if (!parsedSpoilerHints.value?.availableRegionsForMoon?.size) {
    return regionOptions.value;
  }
  const availableIds = getRegionIdsFromDisplayNames(
    parsedSpoilerHints.value.availableRegionsForMoon,
  );
  if (availableIds.size === 0) return regionOptions.value;
  return regionOptions.value.filter((opt) => availableIds.has(opt.value));
});

// ── Path subtype options ──
interface SubTypeOption {
  value: PathSubType;
  label: string;
}
const PATH_SUBTYPE_OPTIONS: SubTypeOption[] = [
  { value: 'woth', label: 'Way of the Hero' },
  { value: 'triforce', label: 'Triforce' },
  { value: 'dungeon', label: 'Dungeon' },
  { value: 'boss', label: 'Boss' },
  { value: 'end-boss', label: 'End Boss' },
  { value: 'event', label: 'Event' },
];

// ── Path subId options per subtype ──
interface SubIdOption {
  value: number;
  label: string;
}

const PATH_SUBID_OPTIONS: Record<PathSubType, SubIdOption[]> = {
  woth: [],
  triforce: [
    { value: 0, label: 'Power' },
    { value: 1, label: 'Courage' },
    { value: 2, label: 'Wisdom' },
  ],
  dungeon: [
    { value: 0, label: 'Deku Tree' },
    { value: 1, label: "Dodongo's Cavern" },
    { value: 2, label: "Jabu-Jabu's Belly" },
    { value: 3, label: 'Forest Temple' },
    { value: 4, label: 'Fire Temple' },
    { value: 5, label: 'Water Temple' },
    { value: 6, label: 'Shadow Temple' },
    { value: 7, label: 'Spirit Temple' },
    { value: 8, label: 'Bottom of the Well' },
    { value: 9, label: 'Ice Cavern' },
    { value: 10, label: "Gerudo's Training Grounds" },
    { value: 11, label: "Ganon's Castle" },
    { value: 12, label: 'Woodfall Temple' },
    { value: 13, label: 'Snowhead Temple' },
    { value: 14, label: 'Great Bay Temple' },
    { value: 15, label: 'Stone Tower Temple' },
  ],
  boss: [
    { value: 0, label: 'Gohma' },
    { value: 1, label: 'King Dodongo' },
    { value: 2, label: 'Barinade' },
    { value: 3, label: 'Phantom Ganon' },
    { value: 4, label: 'Volvagia' },
    { value: 5, label: 'Morpha' },
    { value: 6, label: 'Bongo-Bongo' },
    { value: 7, label: 'Twinrova' },
    { value: 8, label: 'Odolwa' },
    { value: 9, label: 'Goht' },
    { value: 10, label: 'Gyorg' },
    { value: 11, label: 'Twinmold' },
  ],
  'end-boss': [
    { value: 0, label: 'Ganon' },
    { value: 1, label: 'Majora' },
  ],
  event: [
    { value: 0, label: 'Time Travel' },
    { value: 1, label: 'Rainbow Bridge' },
    { value: 2, label: 'Termina' },
    { value: 3, label: 'Moon' },
  ],
};

const currentSubIdOptions = computed(() => {
  return PATH_SUBID_OPTIONS[pathFormSubType.value] ?? [];
});

// Reset subId when subtype changes
watch(pathFormSubType, () => {
  const options = PATH_SUBID_OPTIONS[pathFormSubType.value] ?? [];
  if (options.length > 0) {
    pathFormSubId.value = options[0].value;
  } else {
    pathFormSubId.value = 0;
  }
});

// ── Path subtype options (filtered by spoiler log) ──
const pathSubTypeOptions = computed(() => {
  const available = parsedSpoilerHints.value?.availablePathSubTypes;
  if (!available || available.size === 0) return PATH_SUBTYPE_OPTIONS;
  return PATH_SUBTYPE_OPTIONS.filter((opt) => available.has(opt.value));
});

// ── Always/Sometimes location options (merged) ──
const alwaysSometimesLocationOptions = computed(() =>
  [...ALWAYS_HINT_CHECKS, ...SOMETIMES_HINT_CHECKS].map((c) => ({
    value: c.id,
    label: c.locationName,
  })),
);

// ── Items in region (for path hints) ──
// The tracker's world graph tells us which location belongs to which hint
// region; the spoiler log tells us which item sits at each location. Combining
// the two yields region → items without relying on the spoiler log's own region
// names.
const regionToItemsMap = computed(() => {
  const map = new Map<
    string,
    Array<{
      itemId: string;
      itemName: string;
      iconPath: string;
      locationName: string;
      locationId: string;
    }>
  >();
  if (!spoilerPlacements.value || !hasImportedSpoilerLog.value) return map;

  for (const p of spoilerPlacements.value) {
    const region = regionLocationMap.value.get(p.locationId);
    if (!region) continue;
    const itemEntry = {
      itemId: p.itemId,
      itemName: p.itemName,
      iconPath: getItemIcon(p.itemId),
      locationName: p.locationName,
      locationId: p.locationId,
    };
    const entry = map.get(region);
    if (entry) {
      entry.push(itemEntry);
    } else {
      map.set(region, [itemEntry]);
    }
  }
  return map;
});

const collectedLocationIdSet = computed(
  () => new Set(collectedLocationIds.value),
);

// ── Item name lookup (pool-aware, with game prefixes for ambiguous names) ──
const hintItemEntries = computed(() =>
  getHintItemEntries(
    availableItemIdSet.value.size > 0 ? availableItemIdSet.value : null,
  ),
);
const hintItemNameResolver = computed(() =>
  createItemDisplayNameResolver(hintItemEntries.value.map((item) => item.id)),
);

/** Item IDs shown in the hint item dropdown (item-grid items ∩ current pool). */
const hintGridItemIdSet = computed(
  () => new Set(hintItemEntries.value.map((item) => item.id)),
);

function resolveItemName(itemId: string): string {
  return hintItemNameResolver.value(itemId);
}

/**
 * True for dungeon keys (small keys, boss keys, key rings, incl. the Gerudo
 * Hideout / Chest Game variants). Mirrors OoTMM's `ItemHelpers.isKey()` used to
 * exclude items from Way of the Hero path hints (`isLocationHintable` with
 * klass 'path'). Rusty keys and skeleton keys are NOT covered (OoTMM doesn't
 * treat them as keys) and stay valid WotH targets.
 */
function isDungeonKeyItemId(itemId: string): boolean {
  return (
    itemId.startsWith('OOT_SMALL_KEY') ||
    itemId.startsWith('MM_SMALL_KEY') ||
    itemId.startsWith('OOT_BOSS_KEY') ||
    itemId.startsWith('MM_BOSS_KEY') ||
    itemId.startsWith('OOT_KEY_RING') ||
    itemId.startsWith('MM_KEY_RING')
  );
}

function getItemsInRegion(regionId: string): Array<{
  itemId: string;
  itemName: string;
  iconPath: string;
  locationName: string;
  locationId: string;
}> {
  const all = regionToItemsMap.value.get(regionId) ?? [];
  // Filter to only items whose location has been collected AND that exist in
  // the item grid (same set as the hint item dropdown), so Path hints don't
  // surface items the tracker cannot represent (maps, compasses, junk...).
  // Dungeon keys are excluded too, mirroring OoTMM's WotH hint logic: they can
  // never be Way of the Hero targets.
  return all.filter(
    (item) =>
      collectedLocationIdSet.value.has(item.locationId) &&
      hintGridItemIdSet.value.has(item.itemId) &&
      !isDungeonKeyItemId(item.itemId),
  );
}

// ── Actions ──

function addPathHint() {
  if (!pathFormRegion.value) return;
  const hint: RecordedPathHint = {
    region: pathFormRegion.value,
    subType: pathFormSubType.value,
    subId: pathFormSubType.value !== 'woth' ? pathFormSubId.value : undefined,
  };
  sessionStore.addPathHint(hint);
  // Reset form
  pathFormRegion.value = '';
  pathFormSubType.value = 'woth';
  pathFormSubId.value = 0;
  isPathFormOpen.value = false;
}

function removePathHint(index: number) {
  sessionStore.removePathHint(index);
}

function addAlwaysSometimesHint() {
  if (!alwaysSometimesFormLocation.value) return;
  const items = alwaysSometimesFormItems.value.filter(Boolean);
  if (items.length === 0) return;
  const hint: RecordedItemExactHint = {
    location: alwaysSometimesFormLocation.value,
    itemId: items[0],
  };
  if (items.length > 1) {
    hint.extraItemIds = items.slice(1);
  }
  sessionStore.addAlwaysSometimesHint(hint);

  // For each Junk item slot, mark its associated location(s) as collected
  // and protect them from autotracker uncollection.
  const junkLocationIds = resolveJunkLocationIds(hint);
  if (junkLocationIds.length > 0) {
    const nextCollected = new Set(collectedLocationIds.value);
    for (const id of junkLocationIds) {
      nextCollected.add(id);
    }
    sessionStore.setCollectedLocationIds(Array.from(nextCollected));
    sessionStore.addHintProtectedLocationIds(junkLocationIds);
  }

  alwaysSometimesFormLocation.value = '';
  alwaysSometimesFormItems.value = [''];
  isAlwaysSometimesFormOpen.value = false;
}

function removeAlwaysSometimesHint(index: number) {
  const hint = hintTracker.value.alwaysSometimesHints[index];
  if (!hint) return;

  // If the hint had Junk items that marked locations collected, ask the user
  // how to handle them via an in-tracker modal instead of a browser confirm.
  const junkLocationIds = resolveJunkLocationIds(hint);
  if (junkLocationIds.length > 0) {
    pendingAlwaysSometimesRemoval.value = index;
    return;
  }

  sessionStore.removeAlwaysSometimesHint(index);
}

function confirmAlwaysSometimesRemoval(keepCollected: boolean) {
  const index = pendingAlwaysSometimesRemoval.value;
  if (index === null) return;
  const hint = hintTracker.value.alwaysSometimesHints[index];
  pendingAlwaysSometimesRemoval.value = null;
  if (!hint) return;

  const junkLocationIds = resolveJunkLocationIds(hint);
  if (junkLocationIds.length > 0 && !keepCollected) {
    // Revert: remove both protection and collected state
    sessionStore.removeHintProtectedLocationIds(junkLocationIds);
    const nextCollected = new Set(collectedLocationIds.value);
    for (const id of junkLocationIds) {
      nextCollected.delete(id);
    }
    sessionStore.setCollectedLocationIds(Array.from(nextCollected));
  }
  // If keepCollected, the location IDs stay in hintProtectedLocationIds

  sessionStore.removeAlwaysSometimesHint(index);
}

function cancelAlwaysSometimesRemoval() {
  pendingAlwaysSometimesRemoval.value = null;
}

function addRegionHint() {
  if (!regionFormRegion.value || !regionFormItem.value) return;
  const hint: RecordedItemRegionHint = {
    region: regionFormRegion.value,
    itemId: regionFormItem.value,
  };
  sessionStore.addRegionHint(hint);

  regionFormRegion.value = '';
  regionFormItem.value = '';
  isRegionFormOpen.value = false;
}

function removeRegionHint(index: number) {
  sessionStore.removeRegionHint(index);
}

function addFoolishHint() {
  if (!foolishFormRegion.value) return;
  const region = foolishFormRegion.value;
  const hint: RecordedFoolishHint = {
    region,
  };
  sessionStore.addFoolishHint(hint);

  // Set all locations in this hint region to collected. The region → locations
  // mapping comes from the tracker's own post-entrance-pass world graph, so it
  // works with or without an imported spoiler log.
  const regionLocationIds = Array.from(
    regionToLocationIds.value.get(region) ?? [],
  );

  if (regionLocationIds.length > 0) {
    const nextCollected = new Set(collectedLocationIds.value);
    for (const id of regionLocationIds) {
      nextCollected.add(id);
    }
    sessionStore.setCollectedLocationIds(Array.from(nextCollected));
    sessionStore.addHintProtectedLocationIds(regionLocationIds);
  }

  foolishFormRegion.value = '';
  isFoolishFormOpen.value = false;
}

function removeFoolishHint(index: number) {
  const hint = hintTracker.value.foolishHints[index];
  if (!hint) return;

  // Find location IDs for this region from the tracker's own mapping.
  const regionLocationIds = Array.from(
    regionToLocationIds.value.get(hint.region) ?? [],
  );

  if (regionLocationIds.length > 0) {
    const keepCollected = window.confirm(
      'This Foolish hint marked all locations in this region as collected. ' +
        'Keep them collected? ' +
        'Click "OK" to keep them collected, or "Cancel" to revert them to uncollected.',
    );
    if (!keepCollected) {
      // Revert: remove both protection and collected state
      sessionStore.removeHintProtectedLocationIds(regionLocationIds);
      const nextCollected = new Set(collectedLocationIds.value);
      for (const id of regionLocationIds) {
        nextCollected.delete(id);
      }
      sessionStore.setCollectedLocationIds(Array.from(nextCollected));
    }
    // If keepCollected, the location IDs stay in hintProtectedLocationIds
  }

  sessionStore.removeFoolishHint(index);
}

function addMoonHint() {
  if (!moonFormRegion.value || !moonFormItem.value) return;
  const hint: RecordedMoonHint = {
    region: moonFormRegion.value,
    itemId: moonFormItem.value,
  };
  sessionStore.addMoonHint(hint);

  moonFormRegion.value = '';
  moonFormItem.value = '';
  isMoonFormOpen.value = false;
}

function removeMoonHint(index: number) {
  sessionStore.removeMoonHint(index);
}
</script>

<template>
  <div class="hint-tracker-main">
    <!-- Missing Summary (only with spoiler log) -->
    <HintMissingSummary v-if="hasImportedSpoilerLog" />

    <!-- ── Path / Way of the Hero ── -->
    <div class="hint-category">
      <button
        class="hint-category__header"
        @click="isPathCollapsed = !isPathCollapsed"
      >
        <span class="hint-category__toggle">{{
          isPathCollapsed ? '▸' : '▾'
        }}</span>
        <span class="hint-category__title">Path / Way of the Hero</span>
        <span class="hint-category__count"
          >({{ hintTracker.pathHints.length }})</span
        >
      </button>

      <div v-if="!isPathCollapsed" class="hint-category__body">
        <!-- Add form -->
        <div v-if="isPathFormOpen" class="hint-add-form">
          <div class="hint-add-form__field">
            <label>Region</label>
            <select v-model="pathFormRegion" class="hint-combobox">
              <option value="" disabled>Select region...</option>
              <option
                v-for="opt in regionOptionsForPath"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="hint-add-form__field">
            <label>Subtype</label>
            <select v-model="pathFormSubType" class="hint-combobox">
              <option
                v-for="opt in pathSubTypeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div
            v-if="currentSubIdOptions.length > 0"
            class="hint-add-form__field"
          >
            <label>Detail</label>
            <select v-model="pathFormSubId" class="hint-combobox">
              <option
                v-for="opt in currentSubIdOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="hint-add-form__actions">
            <button
              class="hint-btn hint-btn--primary"
              :disabled="!pathFormRegion"
              @click="addPathHint"
            >
              Save
            </button>
            <button
              class="hint-btn hint-btn--secondary"
              @click="isPathFormOpen = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Recorded hints -->
        <div
          v-for="(hint, idx) in hintTracker.pathHints"
          :key="idx"
          class="hint-row"
        >
          <div class="hint-row__info">
            <strong>{{ getRegionDisplayName(hint.region) }}</strong>
            <span class="hint-row__subtype">{{
              pathSubTypeOptions.find((s) => s.value === hint.subType)?.label ??
              hint.subType
            }}</span>
            <span v-if="hint.subId !== undefined" class="hint-row__subid">{{
              PATH_SUBID_OPTIONS[hint.subType]?.find(
                (o) => o.value === hint.subId,
              )?.label ?? `#${hint.subId}`
            }}</span>
          </div>
          <!-- Items in region (spoiler-only, collected items) -->
          <div v-if="hasImportedSpoilerLog" class="hint-row__items">
            <div
              v-for="(item, iidx) in getItemsInRegion(hint.region)"
              :key="iidx"
              class="hint-row__item"
            >
              <img
                v-if="item.iconPath"
                :src="item.iconPath"
                class="hint-item-icon"
                :alt="item.itemName"
              />
              <span class="hint-item-name">{{ item.itemName }}</span>
            </div>
            <div
              v-if="getItemsInRegion(hint.region).length === 0"
              class="hint-row__empty"
            >
              No collected items in this region yet
            </div>
          </div>
          <button
            class="hint-row__delete"
            title="Delete hint"
            @click="removePathHint(idx)"
          >
            🗑
          </button>
        </div>

        <button
          v-if="!isPathFormOpen"
          class="hint-btn hint-btn--add"
          @click="isPathFormOpen = true"
        >
          + Add Path Hint
        </button>
      </div>
    </div>

    <!-- ── Always / Sometimes (merged) ── -->
    <div class="hint-category">
      <button
        class="hint-category__header"
        @click="isAlwaysSometimesCollapsed = !isAlwaysSometimesCollapsed"
      >
        <span class="hint-category__toggle">{{
          isAlwaysSometimesCollapsed ? '▸' : '▾'
        }}</span>
        <span class="hint-category__title">Always/Sometimes</span>
        <span class="hint-category__count"
          >({{ hintTracker.alwaysSometimesHints.length }})</span
        >
      </button>

      <div v-if="!isAlwaysSometimesCollapsed" class="hint-category__body">
        <div v-if="isAlwaysSometimesFormOpen" class="hint-add-form">
          <div class="hint-add-form__field">
            <label>Check Location</label>
            <select v-model="alwaysSometimesFormLocation" class="hint-combobox">
              <option value="" disabled>Select location...</option>
              <option
                v-for="opt in alwaysSometimesLocationOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div
            v-for="slot in alwaysSometimesSelectedItemCount"
            :key="slot"
            class="hint-add-form__field"
          >
            <label>{{
              alwaysSometimesSelectedItemCount > 1 ? `Item ${slot}` : 'Item'
            }}</label>
            <HintItemPicker
              :model-value="alwaysSometimesFormItems[slot - 1] ?? ''"
              @update:model-value="
                (v) => setAlwaysSometimesFormItem(slot - 1, v)
              "
            />
          </div>
          <div class="hint-add-form__actions">
            <button
              class="hint-btn hint-btn--primary"
              :disabled="
                !alwaysSometimesFormLocation ||
                alwaysSometimesFormItems.length === 0 ||
                !alwaysSometimesFormItems.every(Boolean)
              "
              @click="addAlwaysSometimesHint"
            >
              Save
            </button>
            <button
              class="hint-btn hint-btn--secondary"
              @click="isAlwaysSometimesFormOpen = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <div
          v-for="(hint, idx) in hintTracker.alwaysSometimesHints"
          :key="idx"
          class="hint-row"
        >
          <div class="hint-row__info">
            <strong>{{
              alwaysSometimesLocationOptions.find(
                (c) => c.value === hint.location,
              )?.label ?? hint.location
            }}</strong>
            <div class="hint-row__hint-items">
              <span
                v-for="(itemId, iidx) in getHintItems(hint)"
                :key="iidx"
                class="hint-row__hint-item"
              >
                <span v-if="itemId === 'JUNK'" class="hint-row__junk"
                  >Junk</span
                >
                <template v-else>
                  <img
                    v-if="getItemIcon(itemId)"
                    :src="getItemIcon(itemId)"
                    class="hint-item-icon"
                    :alt="itemId"
                  />
                  <span class="hint-row__item-name">{{
                    resolveItemName(itemId)
                  }}</span>
                </template>
              </span>
            </div>
          </div>
          <button
            class="hint-row__delete"
            title="Delete hint"
            @click="removeAlwaysSometimesHint(idx)"
          >
            🗑
          </button>
        </div>

        <button
          v-if="!isAlwaysSometimesFormOpen"
          class="hint-btn hint-btn--add"
          @click="isAlwaysSometimesFormOpen = true"
        >
          + Add Always/Sometimes Hint
        </button>
      </div>
    </div>

    <!-- ── Region Hints (Playthrough + Item merged) ── -->
    <div class="hint-category">
      <button
        class="hint-category__header"
        @click="isRegionCollapsed = !isRegionCollapsed"
      >
        <span class="hint-category__toggle">{{
          isRegionCollapsed ? '▸' : '▾'
        }}</span>
        <span class="hint-category__title">Region Hints</span>
        <span class="hint-category__count"
          >({{ hintTracker.regionHints.length }})</span
        >
      </button>

      <div v-if="!isRegionCollapsed" class="hint-category__body">
        <div v-if="isRegionFormOpen" class="hint-add-form">
          <div class="hint-add-form__field">
            <label>Region</label>
            <select v-model="regionFormRegion" class="hint-combobox">
              <option value="" disabled>Select region...</option>
              <option
                v-for="opt in regionOptionsForRegion"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="hint-add-form__field">
            <label>Item</label>
            <HintItemPicker v-model="regionFormItem" />
          </div>
          <div class="hint-add-form__actions">
            <button
              class="hint-btn hint-btn--primary"
              :disabled="!regionFormRegion || !regionFormItem"
              @click="addRegionHint"
            >
              Save
            </button>
            <button
              class="hint-btn hint-btn--secondary"
              @click="isRegionFormOpen = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <div
          v-for="(hint, idx) in hintTracker.regionHints"
          :key="idx"
          class="hint-row"
        >
          <div class="hint-row__info">
            <strong>{{ getRegionDisplayName(hint.region) }}</strong>
            <span v-if="hint.itemId === 'JUNK'" class="hint-row__junk"
              >Junk</span
            >
            <template v-else>
              <img
                v-if="getItemIcon(hint.itemId)"
                :src="getItemIcon(hint.itemId)"
                class="hint-item-icon"
                :alt="hint.itemId"
              />
              <span class="hint-row__item-name">{{
                resolveItemName(hint.itemId)
              }}</span>
            </template>
          </div>
          <button
            class="hint-row__delete"
            title="Delete hint"
            @click="removeRegionHint(idx)"
          >
            🗑
          </button>
        </div>

        <button
          v-if="!isRegionFormOpen"
          class="hint-btn hint-btn--add"
          @click="isRegionFormOpen = true"
        >
          + Add Region Hint
        </button>
      </div>
    </div>

    <!-- ── Foolish ── -->
    <div class="hint-category">
      <button
        class="hint-category__header"
        @click="isFoolishCollapsed = !isFoolishCollapsed"
      >
        <span class="hint-category__toggle">{{
          isFoolishCollapsed ? '▸' : '▾'
        }}</span>
        <span class="hint-category__title">Foolish</span>
        <span class="hint-category__count"
          >({{ hintTracker.foolishHints.length }})</span
        >
      </button>

      <div v-if="!isFoolishCollapsed" class="hint-category__body">
        <div v-if="isFoolishFormOpen" class="hint-add-form">
          <div class="hint-add-form__field">
            <label>Region</label>
            <select v-model="foolishFormRegion" class="hint-combobox">
              <option value="" disabled>Select region...</option>
              <option
                v-for="opt in regionOptionsForFoolish"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="hint-add-form__actions">
            <button
              class="hint-btn hint-btn--primary"
              :disabled="!foolishFormRegion"
              @click="addFoolishHint"
            >
              Save
            </button>
            <button
              class="hint-btn hint-btn--secondary"
              @click="isFoolishFormOpen = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <div
          v-for="(hint, idx) in hintTracker.foolishHints"
          :key="idx"
          class="hint-row"
        >
          <div class="hint-row__info">
            <strong>{{ getRegionDisplayName(hint.region) }}</strong>
            <span class="hint-row__subtype">Foolish</span>
          </div>
          <button
            class="hint-row__delete"
            title="Delete hint"
            @click="removeFoolishHint(idx)"
          >
            🗑
          </button>
        </div>

        <button
          v-if="!isFoolishFormOpen"
          class="hint-btn hint-btn--add"
          @click="isFoolishFormOpen = true"
        >
          + Add Foolish Hint
        </button>
      </div>
    </div>

    <!-- ── Moon Trial (from Regional Hints) ── -->
    <div class="hint-category">
      <button
        class="hint-category__header"
        @click="isMoonCollapsed = !isMoonCollapsed"
      >
        <span class="hint-category__toggle">{{
          isMoonCollapsed ? '▸' : '▾'
        }}</span>
        <span class="hint-category__title">Moon Trial</span>
        <span class="hint-category__count"
          >({{ hintTracker.moonHints.length }})</span
        >
      </button>

      <div v-if="!isMoonCollapsed" class="hint-category__body">
        <div v-if="isMoonFormOpen" class="hint-add-form">
          <div class="hint-add-form__field">
            <label>Region</label>
            <select v-model="moonFormRegion" class="hint-combobox">
              <option value="" disabled>Select region...</option>
              <option
                v-for="opt in regionOptionsForMoon"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="hint-add-form__field">
            <label>Item</label>
            <HintItemPicker v-model="moonFormItem" />
          </div>
          <div class="hint-add-form__actions">
            <button
              class="hint-btn hint-btn--primary"
              :disabled="!moonFormRegion || !moonFormItem"
              @click="addMoonHint"
            >
              Save
            </button>
            <button
              class="hint-btn hint-btn--secondary"
              @click="isMoonFormOpen = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <div
          v-for="(hint, idx) in hintTracker.moonHints"
          :key="idx"
          class="hint-row"
        >
          <div class="hint-row__info">
            <strong>{{ getRegionDisplayName(hint.region) }}</strong>
            <span v-if="hint.itemId === 'JUNK'" class="hint-row__junk"
              >Junk</span
            >
            <template v-else>
              <img
                v-if="getItemIcon(hint.itemId)"
                :src="getItemIcon(hint.itemId)"
                class="hint-item-icon"
                :alt="hint.itemId"
              />
              <span class="hint-row__item-name">{{
                resolveItemName(hint.itemId)
              }}</span>
            </template>
          </div>
          <button
            class="hint-row__delete"
            title="Delete hint"
            @click="removeMoonHint(idx)"
          >
            🗑
          </button>
        </div>

        <button
          v-if="!isMoonFormOpen"
          class="hint-btn hint-btn--add"
          @click="isMoonFormOpen = true"
        >
          + Add Moon Hint
        </button>
      </div>
    </div>

    <!-- Confirmation modal for removing an Always/Sometimes hint with collected junk locations -->
    <div
      v-if="pendingAlwaysSometimesRemoval !== null"
      class="hint-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hint-remove-confirm-title"
    >
      <div class="hint-modal">
        <h2 id="hint-remove-confirm-title" class="hint-modal__title">
          Remove hint?
        </h2>
        <p class="hint-modal__text">
          This hint has locations set to collected because they were junked.
          What should happen to those locations?
        </p>
        <div class="hint-modal__actions">
          <button
            class="hint-btn hint-btn--primary"
            @click="confirmAlwaysSometimesRemoval(true)"
          >
            Keep collected
          </button>
          <button
            class="hint-btn hint-btn--secondary"
            @click="confirmAlwaysSometimesRemoval(false)"
          >
            Revert to uncollected
          </button>
          <button
            class="hint-btn hint-btn--secondary"
            @click="cancelAlwaysSometimesRemoval"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-tracker-main {
  padding: 8px;
}

/* ── Category sections ── */
.hint-category {
  margin-bottom: 4px;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  overflow: visible;
}

.hint-category__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  background: #2a2a2a;
  border: none;
  color: #ccc;
  cursor: pointer;
  font-size: 0.85rem;
  text-align: left;
}

.hint-category__header:hover {
  background: #333;
}

.hint-category__toggle {
  font-size: 0.75rem;
  width: 12px;
}

.hint-category__title {
  flex: 1;
  font-weight: 600;
}

.hint-category__count {
  color: #888;
  font-size: 0.8rem;
}

.hint-category__body {
  padding: 6px 10px 10px;
  background: #222;
}

/* ── Add form ── */
.hint-add-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: #2a2a2a;
  border-radius: 4px;
}

.hint-add-form__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hint-add-form__field label {
  font-size: 0.75rem;
  color: #999;
}

.hint-add-form__actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

/* ── Combobox / select ── */
.hint-combobox {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #555;
  border-radius: 3px;
  background: #333;
  color: #ddd;
  font-size: 0.8rem;
  outline: none;
}

.hint-combobox:focus {
  border-color: #4a8ac0;
}

/* ── Buttons ── */
.hint-btn {
  padding: 4px 10px;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8rem;
}

.hint-btn--primary {
  background: #2563eb;
  border-color: #3b82f6;
  color: #fff;
}

.hint-btn--primary:disabled {
  opacity: 0.4;
  cursor: default;
}

.hint-btn--secondary {
  background: #444;
  color: #ccc;
}

.hint-btn--add {
  width: 100%;
  padding: 6px;
  background: #2a2a2a;
  border-style: dashed;
  color: #60a5fa;
}

.hint-btn--add:hover {
  background: #333;
  border-color: #3b82f6;
}

/* ── Rows ── */
.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid #333;
}

.hint-row:last-child {
  border-bottom: none;
}

.hint-row__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
}

.hint-row__subtype {
  color: #888;
  font-size: 0.75rem;
}

.hint-row__subid {
  color: #68a;
  font-size: 0.75rem;
  font-style: italic;
}

.hint-row__requirement {
  color: #da5;
  font-size: 0.75rem;
  font-style: italic;
}

.hint-row__junk {
  color: #a66;
  font-weight: 600;
  font-size: 0.75rem;
}

/* Multi-item hints: items flow side by side, wrap when space runs out */
.hint-row__hint-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 2px;
}

.hint-row__hint-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hint-row__item-name {
  color: #aaa;
  font-size: 0.75rem;
}

.hint-row__delete {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 0.9rem;
  opacity: 0.6;
}

.hint-row__delete:hover {
  opacity: 1;
}

/* ── Items in region ── */
.hint-row__items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.hint-row__item {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: #2a2a2a;
  border-radius: 3px;
  font-size: 0.7rem;
}

.hint-item-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.hint-item-name {
  color: #aaa;
}

.hint-row__empty {
  color: #666;
  font-style: italic;
  font-size: 0.7rem;
}

/* ── Confirmation modal ── */
.hint-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.hint-modal {
  min-width: 320px;
  max-width: 420px;
  padding: 16px;
  background: #2a2a2a;
  border: 1px solid #555;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.hint-modal__title {
  margin: 0 0 8px;
  font-size: 1rem;
  color: #eee;
}

.hint-modal__text {
  margin: 0 0 14px;
  font-size: 0.85rem;
  color: #bbb;
  line-height: 1.4;
}

.hint-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
</style>
