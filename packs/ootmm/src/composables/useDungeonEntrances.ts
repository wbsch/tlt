import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as DataMod from '@ootmm/data';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import {
  getActiveEntranceKeys,
  getTrackedEntrancePool,
  isTrackedEntranceSourceType,
  type TrackedEntrancePool,
} from '../utils/entranceRandomization';

const resolveExport = <T>(mod: unknown, key: string): T => {
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

export type DungeonEntranceEntry = {
  key: string;
  label: string;
  game: 'oot' | 'mm';
  type: string;
  pool: TrackedEntrancePool;
};

export type EntrancePanelSection = {
  id: 'tracked';
  title: string;
  hasContent: boolean;
  sortOrder: number;
  kind: 'tracked';
};

type ReachabilityStats = {
  total: number;
  reachable: number;
  unreachable: number;
};

type MappingStats = {
  total: number;
  mapped: number;
  unmapped: number;
};

function entranceLabel(key: string, data: EntranceData): string {
  if (data.to && data.to !== 'NONE') {
    return data.to.replace(/^(OOT|MM) /, '');
  }
  if (data.debug && data.debug[1]) return data.debug[1];
  return key.replace(/_/g, ' ');
}

export function useDungeonEntrances() {
  const sessionStore = useOoTMMSessionStore();
  const { trackerSettings, entranceOverrides, reachableEntranceIdSet } =
    storeToRefs(sessionStore);
  const uiStore = useOoTMMUiStore();
  const { entrancesReachabilityFilter, entrancesMappingFilter } =
    storeToRefs(uiStore);

  function isEntranceMapped(entranceKey: string): boolean {
    return (entranceOverrides.value[entranceKey] ?? '').trim().length > 0;
  }

  const allDungeonEntrances = computed<DungeonEntranceEntry[]>(() => {
    const entries: DungeonEntranceEntry[] = [];
    for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
      if (!isTrackedEntranceSourceType(data.type, key)) continue;
      const pool = getTrackedEntrancePool(data.type, key);
      if (!pool) continue;
      entries.push({
        key,
        label: entranceLabel(key, data),
        game: data.game as 'oot' | 'mm',
        type: data.type,
        pool,
      });
    }
    entries.sort((a, b) => {
      if (a.game !== b.game) return a.game === 'oot' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return entries;
  });

  const activeEntrances = computed<DungeonEntranceEntry[]>(() => {
    const activeKeys = getActiveEntranceKeys(trackerSettings.value);
    if (activeKeys.size === 0) return [];

    return allDungeonEntrances.value.filter((entrance) => {
      return activeKeys.has(entrance.key);
    });
  });

  const mappingScopedEntrances = computed<DungeonEntranceEntry[]>(() => {
    const filter = entrancesMappingFilter.value;
    if (filter === 'all') return activeEntrances.value;

    return activeEntrances.value.filter((entrance) => {
      const mapped = isEntranceMapped(entrance.key);
      return filter === 'mapped' ? mapped : !mapped;
    });
  });

  const filteredEntrances = computed<DungeonEntranceEntry[]>(() => {
    const filter = entrancesReachabilityFilter.value;
    if (filter === 'all') return mappingScopedEntrances.value;

    const reachableSet = reachableEntranceIdSet.value;
    return mappingScopedEntrances.value.filter((entrance) => {
      const isReachable = reachableSet.has(entrance.key);
      return filter === 'reachable' ? isReachable : !isReachable;
    });
  });

  const reachabilityStats = computed<ReachabilityStats>(() => {
    const total = mappingScopedEntrances.value.length;
    const reachable = mappingScopedEntrances.value.filter((entrance) =>
      reachableEntranceIdSet.value.has(entrance.key),
    ).length;
    return { total, reachable, unreachable: total - reachable };
  });

  const mappingStats = computed<MappingStats>(() => {
    const total = activeEntrances.value.length;
    const mapped = activeEntrances.value.filter((entrance) =>
      isEntranceMapped(entrance.key),
    ).length;
    return { total, mapped, unmapped: total - mapped };
  });

  const destinationOptions = computed(() => {
    return activeEntrances.value.map((entry) => ({
      value: entry.key,
      label: entry.label,
      game: entry.game,
      pool: entry.pool,
    }));
  });

  const erDungeonsMode = computed(() =>
    String(trackerSettings.value?.erDungeons ?? 'none'),
  );
  const erGrottosMode = computed(() =>
    String(trackerSettings.value?.erGrottos ?? 'none'),
  );
  const erIndoorsMode = computed(() =>
    String(trackerSettings.value?.erIndoors ?? 'none'),
  );
  const sections = computed<EntrancePanelSection[]>(() => {
    if (activeEntrances.value.length === 0) return [];

    return [
      {
        id: 'tracked',
        title: 'Entrances',
        hasContent: true,
        sortOrder: 0,
        kind: 'tracked',
      },
    ];
  });
  const hasAvailableSections = computed(() => sections.value.length > 0);

  function isDestinationUsed(dstKey: string, currentSrcKey: string): boolean {
    for (const [src, dst] of Object.entries(entranceOverrides.value)) {
      if (src !== currentSrcKey && dst === dstKey) return true;
    }
    return false;
  }

  function destinationOptionsForEntrance(
    entry: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
  ) {
    const ownGameMode =
      entry.pool === 'dungeon'
        ? erDungeonsMode.value === 'ownGame'
        : entry.pool === 'grotto'
          ? erGrottosMode.value === 'ownGame'
          : erIndoorsMode.value === 'ownGame';
    const opts = destinationOptions.value.filter((dest) => {
      if (dest.pool !== entry.pool) return false;
      if (!ownGameMode) return true;
      return dest.game === entry.game;
    });

    return opts.filter((dest) => !isDestinationUsed(dest.value, entry.key));
  }

  const ootEntrances = computed(() =>
    filteredEntrances.value.filter((entry) => entry.game === 'oot'),
  );
  const mmEntrances = computed(() =>
    filteredEntrances.value.filter((entry) => entry.game === 'mm'),
  );

  function getSelectedDestination(srcKey: string): string {
    return entranceOverrides.value[srcKey] ?? '';
  }

  function setSelectedDestination(srcKey: string, dstKey: string) {
    sessionStore.setEntranceOverride(srcKey, dstKey || null);
  }

  function clearAllOverrides() {
    sessionStore.setEntranceOverrides({});
  }

  const hasAnyOverrides = computed(
    () => Object.keys(entranceOverrides.value).length > 0,
  );

  return {
    sections,
    hasAvailableSections,
    allEntrances: allDungeonEntrances,
    activeEntrances,
    filteredEntrances,
    reachabilityStats,
    mappingStats,
    ootEntrances,
    mmEntrances,
    destinationOptionsForEntrance,
    getSelectedDestination,
    setSelectedDestination,
    clearAllOverrides,
    hasAnyOverrides,
  };
}
