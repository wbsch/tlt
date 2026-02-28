<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import * as DataMod from '@ootmm/data';

const resolveExport = <T,>(mod: unknown, key: string): T => {
  const modObj = mod as { default?: Record<string, T>; [k: string]: unknown };
  return (modObj[key] as T | undefined) ?? (modObj.default?.[key] as T);
};

type EntranceData = {
  game: string;
  type: string;
  from: string;
  to: string;
  debug?: string[];
  reverse?: string;
};

const ENTRANCES_RAW =
  resolveExport<Record<string, EntranceData>>(DataMod, 'ENTRANCES') ?? {};

const sessionStore = useOoTMMSessionStore();
const { trackerSettings, entranceOverrides } = storeToRefs(sessionStore);

/**
 * Map from entrance type to the sub-setting that enables it.
 */
const TYPE_TO_SETTING: Record<string, string> = {
  dungeon: 'erMajorDungeons',
  'dungeon-minor': 'erMinorDungeons',
  'dungeon-ganon': 'erGanonCastle',
  'dungeon-ganon-tower': 'erGanonTower',
  'dungeon-sh': 'erSpiderHouses',
  'dungeon-pf': 'erPirateFortress',
  'dungeon-btw': 'erBeneathWell',
  'dungeon-acoi': 'erIkanaCastle',
  'dungeon-ss': 'erSecretShrine',
  'dungeon-ctr': 'erMoon',
};

/** Set of all dungeon-related entrance types. */
const DUNGEON_TYPES = new Set(Object.keys(TYPE_TO_SETTING));

function getEnabledDungeonTypes(
  settings: Record<string, unknown>,
): Set<string> {
  const enabled = new Set<string>();
  enabled.add('dungeon');
  for (const [type, settingKey] of Object.entries(TYPE_TO_SETTING)) {
    if (settings?.[settingKey]) {
      enabled.add(type);
    }
  }

  return enabled;
}

type EntranceEntry = {
  key: string;
  label: string;
  game: 'oot' | 'mm';
  type: string;
};

/**
 * Build human-readable label from entrance data.
 * Use the 'to' field (e.g. "OOT Deku Tree" → "Deku Tree"), fall back to debug[1], then key.
 */
function entranceLabel(key: string, data: EntranceData): string {
  if (data.to && data.to !== 'NONE') {
    // Strip "OOT " / "MM " prefix since we already group by game
    return data.to.replace(/^(OOT|MM) /, '');
  }
  if (data.debug && data.debug[1]) return data.debug[1];
  return key.replace(/_/g, ' ');
}

/**
 * All dungeon-type entrances from ENTRANCES data (filtered by dungeon types).
 */
const allDungeonEntrances = computed<EntranceEntry[]>(() => {
  const entries: EntranceEntry[] = [];
  for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
    if (!DUNGEON_TYPES.has(data.type)) continue;
    entries.push({
      key,
      label: entranceLabel(key, data),
      game: data.game as 'oot' | 'mm',
      type: data.type,
    });
  }
  // Sort: OoT first, then MM; within each game alphabetical by label
  entries.sort((a, b) => {
    if (a.game !== b.game) return a.game === 'oot' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return entries;
});

/**
 * Entrances that are currently active based on settings.
 */
const activeEntrances = computed<EntranceEntry[]>(() => {
  const settings = trackerSettings.value;
  const erDungeons = settings?.erDungeons;
  if (erDungeons === 'none' || !erDungeons) return [];

  const selectedGames = String(settings?.games ?? 'ootmm');
  const enabledTypes = getEnabledDungeonTypes(settings);

  return allDungeonEntrances.value.filter((entrance) => {
    // Filter by game selection
    if (selectedGames === 'oot' && entrance.game === 'mm') return false;
    if (selectedGames === 'mm' && entrance.game === 'oot') return false;

    return enabledTypes.has(entrance.type);
  });
});

/**
 * Available destination options (the same pool as sources).
 */
const destinationOptions = computed(() => {
  return activeEntrances.value.map((e) => ({
    value: e.key,
    label: e.label,
    game: e.game,
  }));
});

const erDungeonsMode = computed(() =>
  String(trackerSettings.value?.erDungeons ?? 'none'),
);

function destinationOptionsForGame(game: 'oot' | 'mm', currentSrcKey: string) {
  const opts =
    erDungeonsMode.value === 'ownGame'
      ? destinationOptions.value.filter((dest) => dest.game === game)
      : destinationOptions.value;
  // Hide destinations already assigned to other entrances
  return opts.filter((dest) => !isDestinationUsed(dest.value, currentSrcKey));
}

/**
 * Group entrances by game for display.
 */
const ootEntrances = computed(() =>
  activeEntrances.value.filter((e) => e.game === 'oot'),
);
const mmEntrances = computed(() =>
  activeEntrances.value.filter((e) => e.game === 'mm'),
);

function getSelectedDestination(srcKey: string): string {
  return entranceOverrides.value[srcKey] ?? '';
}

function handleDestinationChange(srcKey: string, dstKey: string) {
  sessionStore.setEntranceOverride(srcKey, dstKey || null);
}

function clearAllOverrides() {
  sessionStore.setEntranceOverrides({});
}

const hasAnyOverrides = computed(
  () => Object.keys(entranceOverrides.value).length > 0,
);

/**
 * Check if a destination is already assigned to another source.
 */
function isDestinationUsed(dstKey: string, currentSrcKey: string): boolean {
  for (const [src, dst] of Object.entries(entranceOverrides.value)) {
    if (src !== currentSrcKey && dst === dstKey) return true;
  }
  return false;
}
</script>

<template>
  <div class="entrances-panel">
    <div class="entrances-header">
      <h3 class="entrances-title">Dungeon Entrances</h3>
      <button
        v-if="hasAnyOverrides"
        type="button"
        class="clear-button"
        @click="clearAllOverrides"
      >
        Clear All
      </button>
    </div>

    <div v-if="activeEntrances.length === 0" class="no-entrances">
      <p>
        Enable Dungeon ER in Settings and select dungeon sub-types to configure
        entrance assignments.
      </p>
    </div>

    <div v-else class="entrances-list">
      <!-- OoT Entrances -->
      <template v-if="ootEntrances.length > 0">
        <div class="game-section-header">Ocarina of Time</div>
        <div
          v-for="entrance in ootEntrances"
          :key="entrance.key"
          class="entrance-row"
        >
          <label class="entrance-label" :title="entrance.key">
            {{ entrance.label }}
          </label>
          <select
            class="entrance-select"
            :value="getSelectedDestination(entrance.key)"
            @change="
              handleDestinationChange(
                entrance.key,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">— Not mapped —</option>
            <option
              v-for="dest in destinationOptionsForGame(
                entrance.game,
                entrance.key,
              )"
              :key="dest.value"
              :value="dest.value"
            >
              {{ dest.label
              }}{{
                dest.game === 'mm'
                  ? ' (MM)'
                  : dest.game === 'oot'
                    ? ' (OoT)'
                    : ''
              }}
            </option>
          </select>
        </div>
      </template>

      <!-- MM Entrances -->
      <template v-if="mmEntrances.length > 0">
        <div class="game-section-header">Majora's Mask</div>
        <div
          v-for="entrance in mmEntrances"
          :key="entrance.key"
          class="entrance-row"
        >
          <label class="entrance-label" :title="entrance.key">
            {{ entrance.label }}
          </label>
          <select
            class="entrance-select"
            :value="getSelectedDestination(entrance.key)"
            @change="
              handleDestinationChange(
                entrance.key,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">— Not mapped —</option>
            <option
              v-for="dest in destinationOptionsForGame(
                entrance.game,
                entrance.key,
              )"
              :key="dest.value"
              :value="dest.value"
            >
              {{ dest.label
              }}{{
                dest.game === 'mm'
                  ? ' (MM)'
                  : dest.game === 'oot'
                    ? ' (OoT)'
                    : ''
              }}
            </option>
          </select>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entrances-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0.75rem;
  color: #e5e7eb;
}

.entrances-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #404040;
}

.entrances-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e5e7eb;
}

.clear-button {
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  background: #4b2020;
  color: #f87171;
  border: 1px solid #7f1d1d;
  border-radius: 0.25rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.clear-button:hover {
  background: #6b2020;
  border-color: #991b1b;
}

.no-entrances {
  text-align: center;
  color: #9ca3af;
  font-size: 0.8rem;
  padding: 1rem;
}

.entrances-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.game-section-header {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  padding: 0.5rem 0 0.25rem;
  border-bottom: 1px solid #333;
}

.entrance-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.3rem 0;
}

.entrance-label {
  font-size: 0.75rem;
  color: #d1d5db;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entrance-select {
  width: 100%;
  padding: 0.3rem 0.4rem;
  font-size: 0.75rem;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  cursor: pointer;
  appearance: auto;
}

.entrance-select:focus {
  outline: 2px solid #60a5fa;
  outline-offset: -1px;
}

.entrance-select:hover {
  border-color: #6b7280;
}
</style>
