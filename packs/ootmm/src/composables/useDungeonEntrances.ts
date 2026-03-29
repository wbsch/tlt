import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as DataMod from '@ootmm/data';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import {
  getActiveEntranceKeys,
  getTrackedEntrancePool,
  isTrackedEntranceSourceType,
  computeExitOverrides,
  getExitKeyForEntrance,
  getExitLabel,
  getExitEndpointLabel,
  deriveEntranceFromExitMapping,
  type TrackedEntrancePool,
} from '../utils/entranceRandomization';
import { matchesSearchTerms } from '../utils/search';

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
  displayLabel: string;
  game: 'oot' | 'mm';
  type: string;
  pool: TrackedEntrancePool;
};

export type ExitEntry = {
  key: string;
  sourceEntranceKey: string;
  label: string;
  game: 'oot' | 'mm';
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
  const toName =
    data.to && data.to !== 'NONE' ? data.to.replace(/^(OOT|MM) /, '') : null;
  const fromName =
    data.from && data.from !== 'NONE'
      ? data.from.replace(/^(OOT|MM) /, '')
      : null;
  if (toName && fromName) {
    return `${toName} from ${fromName}`;
  }
  if (toName) return toName;
  if (data.debug && data.debug[1]) return data.debug[1];
  return key.replace(/_/g, ' ');
}

function entranceDisplayLabel(key: string, data: EntranceData): string {
  const toName =
    data.to && data.to !== 'NONE' ? data.to.replace(/^(OOT|MM) /, '') : null;
  const fromName =
    data.from && data.from !== 'NONE'
      ? data.from.replace(/^(OOT|MM) /, '')
      : null;
  if (fromName && toName) {
    return `${fromName} to ${toName}`;
  }
  return entranceLabel(key, data);
}

export function useDungeonEntrances() {
  const sessionStore = useOoTMMSessionStore();
  const { trackerSettings, entranceOverrides, reachableEntranceIdSet } =
    storeToRefs(sessionStore);
  const uiStore = useOoTMMUiStore();
  const {
    entrancesReachabilityFilter,
    entrancesMappingFilter,
    entrancesSearchQuery,
  } = storeToRefs(uiStore);

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
        displayLabel: entranceDisplayLabel(key, data),
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

  // Reachability filter is applied first; mapping is a subset of it.
  const reachabilityScopedEntrances = computed<DungeonEntranceEntry[]>(() => {
    const filter = entrancesReachabilityFilter.value;
    if (filter === 'all') return activeEntrances.value;

    const reachableSet = reachableEntranceIdSet.value;
    return activeEntrances.value.filter((entrance) => {
      const isReachable = reachableSet.has(entrance.key);
      return filter === 'reachable' ? isReachable : !isReachable;
    });
  });

  const filteredEntrances = computed<DungeonEntranceEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    let result = reachabilityScopedEntrances.value;

    if (mappingFilter !== 'all') {
      result = result.filter((entrance) => {
        const mapped = isEntranceMapped(entrance.key);
        return mappingFilter === 'mapped' ? mapped : !mapped;
      });
    }

    const query = entrancesSearchQuery.value;
    if (query.trim()) {
      result = result.filter((entrance) =>
        matchesSearchTerms([entrance.displayLabel, entrance.label], query),
      );
    }

    return result;
  });

  const reachabilityStats = computed<ReachabilityStats>(() => {
    const reachableSet = reachableEntranceIdSet.value;
    const entranceReachable = activeEntrances.value.filter((entrance) =>
      reachableSet.has(entrance.key),
    ).length;
    const exitReachable = activeExitEntries.value.filter((exit) =>
      reachableSet.has(exit.key),
    ).length;
    const total = activeEntrances.value.length + activeExitEntries.value.length;
    const reachable = entranceReachable + exitReachable;
    return { total, reachable, unreachable: total - reachable };
  });

  const mappingStats = computed<MappingStats>(() => {
    const entrances = reachabilityScopedEntrances.value;
    const exits = reachabilityScopedExits.value;
    const entranceMapped = entrances.filter((e) =>
      isEntranceMapped(e.key),
    ).length;
    const exitMapped = exits.filter((e) => isExitMapped(e.key)).length;
    const total = entrances.length + exits.length;
    const mapped = entranceMapped + exitMapped;
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

  function sortOptionsByGameThenLabel<
    T extends { game: string; label: string },
  >(opts: T[]): T[] {
    return [...opts].sort((a, b) => {
      if (a.game !== b.game) return a.game === 'oot' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
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

    return sortOptionsByGameThenLabel(
      opts.filter((dest) => !isDestinationUsed(dest.value, entry.key)),
    );
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

  // --- Exit data ---

  const exitOverridesMap = computed(() =>
    computeExitOverrides(entranceOverrides.value),
  );

  function isExitMapped(exitKey: string): boolean {
    return (exitOverridesMap.value[exitKey] ?? '').trim().length > 0;
  }

  function getExitDestination(exitKey: string): string {
    return exitOverridesMap.value[exitKey] ?? '';
  }

  function getExitDestinationLabel(exitKey: string): string {
    const dst = exitOverridesMap.value[exitKey];
    if (!dst) return '';
    return getExitLabel(dst);
  }

  function getExitSelectedDestination(exitKey: string): string {
    return exitOverridesMap.value[exitKey] ?? '';
  }

  /**
   * Set an exit mapping. Derives and stores the corresponding entrance mapping.
   * Passing an empty dstKey clears the mapping.
   */
  function setExitDestination(exitKey: string, exitDstKey: string) {
    if (!exitDstKey) {
      // Clear: find which entrance mapping produces this exit key and remove it
      const currentOverrides = entranceOverrides.value;
      for (const [src, dst] of Object.entries(currentOverrides)) {
        const dstData = ENTRANCES_RAW[dst];
        if (dstData?.reverse?.trim() === exitKey) {
          sessionStore.setEntranceOverride(src, null);
          return;
        }
      }
      return;
    }
    const derived = deriveEntranceFromExitMapping(exitKey, exitDstKey);
    if (!derived) return;
    sessionStore.setEntranceOverride(derived.entranceSrc, derived.entranceDst);
  }

  function isExitDestinationUsed(
    exitDstKey: string,
    currentExitSrcKey: string,
  ): boolean {
    const overrides = exitOverridesMap.value;
    for (const [src, dst] of Object.entries(overrides)) {
      if (src !== currentExitSrcKey && dst === exitDstKey) return true;
    }
    return false;
  }

  const exitDestinationOptions = computed(() => {
    return activeExitEntries.value.map((entry) => ({
      value: entry.key,
      label: getExitEndpointLabel(entry.key),
      game: entry.game,
      pool: entry.pool,
    }));
  });

  function destinationOptionsForExit(
    exit: Pick<ExitEntry, 'key' | 'game' | 'pool'>,
  ) {
    const ownGameMode =
      exit.pool === 'dungeon'
        ? erDungeonsMode.value === 'ownGame'
        : exit.pool === 'grotto'
          ? erGrottosMode.value === 'ownGame'
          : erIndoorsMode.value === 'ownGame';
    const opts = exitDestinationOptions.value.filter((dest) => {
      if (dest.pool !== exit.pool) return false;
      if (!ownGameMode) return true;
      return dest.game === exit.game;
    });

    return sortOptionsByGameThenLabel(
      opts.filter((dest) => !isExitDestinationUsed(dest.value, exit.key)),
    );
  }

  const activeExitEntries = computed<ExitEntry[]>(() => {
    const entries: ExitEntry[] = [];
    for (const entrance of activeEntrances.value) {
      const exitKey = getExitKeyForEntrance(entrance.key);
      if (!exitKey) continue;
      entries.push({
        key: exitKey,
        sourceEntranceKey: entrance.key,
        label: getExitLabel(exitKey),
        game: entrance.game,
        pool: entrance.pool,
      });
    }
    return entries;
  });

  /** Entrances filtered by reachability + mapping only (no search query). Used by the map. */
  const mapFilteredEntrances = computed<DungeonEntranceEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    let result = reachabilityScopedEntrances.value;

    if (mappingFilter !== 'all') {
      result = result.filter((entrance) => {
        const mapped = isEntranceMapped(entrance.key);
        return mappingFilter === 'mapped' ? mapped : !mapped;
      });
    }

    return result;
  });

  const reachabilityScopedExits = computed<ExitEntry[]>(() => {
    const filter = entrancesReachabilityFilter.value;
    if (filter === 'all') return activeExitEntries.value;

    const reachableSet = reachableEntranceIdSet.value;
    return activeExitEntries.value.filter((exit) => {
      const isReachable = reachableSet.has(exit.key);
      return filter === 'reachable' ? isReachable : !isReachable;
    });
  });

  const filteredExitEntries = computed<ExitEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    const query = entrancesSearchQuery.value;
    let result = reachabilityScopedExits.value;

    if (mappingFilter !== 'all') {
      result = result.filter((exit) => {
        const mapped = isExitMapped(exit.key);
        return mappingFilter === 'mapped' ? mapped : !mapped;
      });
    }

    if (query.trim()) {
      result = result.filter((exit) => matchesSearchTerms([exit.label], query));
    }

    return result;
  });

  /** Exits filtered by reachability + mapping only (no search query). Used by the map. */
  const mapFilteredExitEntries = computed<ExitEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    let result = reachabilityScopedExits.value;

    if (mappingFilter !== 'all') {
      result = result.filter((exit) => {
        const mapped = isExitMapped(exit.key);
        return mappingFilter === 'mapped' ? mapped : !mapped;
      });
    }

    return result;
  });

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
    activeExitEntries,
    filteredExitEntries,
    mapFilteredEntrances,
    mapFilteredExitEntries,
    exitOverridesMap,
    isExitMapped,
    getExitDestination,
    getExitDestinationLabel,
    getExitSelectedDestination,
    setExitDestination,
    destinationOptionsForExit,
  };
}
