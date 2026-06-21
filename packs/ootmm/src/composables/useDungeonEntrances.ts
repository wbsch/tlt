import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as DataMod from '@ootmm/data';
import { getItemName } from '../data/items';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import {
  getActiveEntranceKeys,
  getTrackedEntrancePool,
  getTrackedEntrancePolarity,
  isTrackedEntranceSourceType,
  isTrackedWallmasterDestination,
  isTrackedOneWayDestination,
  getExitLabel,
  getExitEndpointLabel,
  getEdgeReverse,
  INTERIOR_GAME_LINK_SOURCE_KEYS,
  INTERIOR_GAME_LINK_EXIT_KEYS,
  getTrackedEntranceCompatiblePools,
  getTrackedEntranceOwnGameMode,
  doTrackedEntrancePolaritiesMatch,
  isTrackedSpawnDestination,
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
  optionLabel: string;
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

function stripEntranceNamePrefix(value: string | undefined): string | null {
  if (!value || value === 'NONE') return null;
  return value.replace(/^(OOT|MM) /, '');
}

function getWarpSongName(data: EntranceData): string | null {
  if (data.type !== 'one-way-song') return null;

  const sourceName = stripEntranceNamePrefix(data.from);
  if (!sourceName) return null;

  return getItemName(`${String(data.game).toUpperCase()}_${sourceName}`);
}

function appendWarpPadName(destination: string): string {
  // "Death Mountain Crater Warp" already contains "Warp" → append only " Pad"
  // "Lake Hylia" → append " Warp Pad"
  if (destination.includes('Warp')) {
    return `${destination} Pad`;
  }
  return `${destination} Warp Pad`;
}

function entranceOptionLabel(
  key: string,
  data: EntranceData,
  pool?: TrackedEntrancePool | null,
): string {
  const toName = stripEntranceNamePrefix(data.to);

  if (data.type === 'one-way-song') {
    const baseName = toName ?? entranceLabel(key, data);
    return appendWarpPadName(baseName);
  }
  if (data.type === 'one-way-statue') {
    return toName ?? entranceLabel(key, data);
  }

  if (data.type === 'one-way-owl') {
    const toName = stripEntranceNamePrefix(data.to);
    return `Owl Flight ${toName}`;
  }

  if (data.type === 'wallmaster') {
    const locationName = (data.from ?? '').replace(/^(OOT|MM) /, '');
    return `Wallmaster @ ${locationName}`;
  }

  return entranceLabel(key, data, pool);
}

function entranceLabel(
  key: string,
  data: EntranceData,
  _pool?: TrackedEntrancePool | null,
): string {
  if (data.type === 'spawn-child') return 'Child Spawn';
  if (data.type === 'spawn-adult') return 'Adult Spawn';

  if (data.type === 'wallmaster') {
    const locationName = (data.from ?? '')
      .replace(/^(OOT|MM) /, '')
      .replace(/ Wallmaster\b/, '');
    return `Wallmaster: ${locationName}`;
  }

  if (data.type === 'one-way-ikana') {
    const dir = key.includes('KEG') ? 'Keg' : 'Block';
    return `Ikana Castle ${dir}`;
  }
  if (data.type === 'one-way-owl') {
    const fromName = stripEntranceNamePrefix(data.from);
    return `Owl Flight ${fromName}`;
  }
  if (data.type === 'one-way-woods') {
    const from = data.from ?? '';
    const dirMatch = from.match(/Lost (North|East|South|West)$/);
    const dir = dirMatch ? dirMatch[1] : from;
    return `Lost Woods ${dir}`;
  }
  if (data.type === 'one-way-water-void') {
    const area = stripEntranceNamePrefix(data.from) ?? key;
    return area;
  }

  const toName = stripEntranceNamePrefix(data.to);
  const fromName = stripEntranceNamePrefix(data.from);
  if (toName && fromName) {
    return `${toName} from ${fromName}`;
  }
  if (toName) return toName;
  if (data.debug && data.debug[1]) return data.debug[1];
  return key.replace(/_/g, ' ');
}

function entranceDisplayLabel(
  key: string,
  data: EntranceData,
  pool?: TrackedEntrancePool | null,
): string {
  if (data.type === 'spawn-child') return 'Child Spawn';
  if (data.type === 'spawn-adult') return 'Adult Spawn';

  if (data.type === 'wallmaster') {
    const locationName = (data.from ?? '')
      .replace(/^(OOT|MM) /, '')
      .replace(/ Wallmaster\b/, '');
    return `Wallmaster: ${locationName}`;
  }

  if (data.type === 'one-way-ikana') {
    const dir = key.includes('KEG') ? 'Keg' : 'Block';
    return `Ikana Castle ${dir}`;
  }
  if (data.type === 'one-way-owl') {
    const fromName = stripEntranceNamePrefix(data.from);
    return `Owl Flight ${fromName}`;
  }
  if (data.type === 'one-way-woods') {
    const from = data.from ?? '';
    const dirMatch = from.match(/Lost (North|East|South|West)$/);
    const dir = dirMatch ? dirMatch[1] : from;
    return `Lost Woods ${dir}`;
  }
  if (data.type === 'one-way-water-void') {
    const area = stripEntranceNamePrefix(data.from) ?? key;
    return area;
  }
  const toName = stripEntranceNamePrefix(data.to);
  const fromName = stripEntranceNamePrefix(data.from);

  if (data.type === 'one-way-song') {
    return getWarpSongName(data) ?? toName ?? entranceLabel(key, data);
  }

  if (data.type === 'one-way-statue') {
    return toName ? `Soaring to ${toName}` : 'Soaring';
  }

  if (fromName && toName) {
    return `${fromName} to ${toName}`;
  }
  return entranceLabel(key, data, pool);
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
    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const isOotmm = gamesMode === 'ootmm';
    // In ootmm mode the game-link interior doesn't exist — only the
    // "entering the portal" direction (exit keys) is meaningful.
    // In single-game mode the interior exists, so use source keys.
    const gameLinkActiveKeys = isOotmm
      ? INTERIOR_GAME_LINK_EXIT_KEYS
      : INTERIOR_GAME_LINK_SOURCE_KEYS;

    const entries: DungeonEntranceEntry[] = [];
    for (const [key, data] of Object.entries(ENTRANCES_RAW)) {
      // Handle game-link keys based on mode
      if (
        INTERIOR_GAME_LINK_SOURCE_KEYS.has(key) ||
        INTERIOR_GAME_LINK_EXIT_KEYS.has(key)
      ) {
        if (gameLinkActiveKeys.has(key)) {
          const gameLinkPool =
            getTrackedEntrancePool(
              data.type,
              key,
              trackerSettings.value ?? {},
            ) ?? 'interior';
          entries.push({
            key,
            label: entranceLabel(key, data, gameLinkPool),
            displayLabel: entranceDisplayLabel(key, data, gameLinkPool),
            optionLabel: entranceOptionLabel(key, data, gameLinkPool),
            game: data.game as 'oot' | 'mm',
            type: data.type,
            pool: gameLinkPool,
          });
        }
        continue;
      }

      if (
        !isTrackedEntranceSourceType(
          data.type,
          key,
          trackerSettings.value ?? {},
        )
      )
        continue;
      const pool = getTrackedEntrancePool(
        data.type,
        key,
        trackerSettings.value ?? {},
      );
      if (!pool) continue;
      entries.push({
        key,
        label: entranceLabel(key, data, pool),
        displayLabel: entranceDisplayLabel(key, data, pool),
        optionLabel: entranceOptionLabel(key, data, pool),
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

  const activeEntrancePoolByKey = computed(() => {
    const pools = new Map<string, TrackedEntrancePool>();
    for (const entrance of activeEntrances.value) {
      pools.set(entrance.key, entrance.pool);
    }
    return pools;
  });

  function getEntrancePoolByKey(key: string): TrackedEntrancePool | null {
    const activePool = activeEntrancePoolByKey.value.get(key);
    if (activePool) return activePool;

    const data = ENTRANCES_RAW[key];
    if (!data) return null;

    return getTrackedEntrancePool(data.type, key, trackerSettings.value ?? {});
  }

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
    const exitReachable = sidebarActiveExitEntries.value.filter((exit) =>
      reachableSet.has(exit.key),
    ).length;
    const total =
      activeEntrances.value.length + sidebarActiveExitEntries.value.length;
    const reachable = entranceReachable + exitReachable;
    return { total, reachable, unreachable: total - reachable };
  });

  const mappingStats = computed<MappingStats>(() => {
    const entrances = reachabilityScopedEntrances.value;
    const exits = sidebarReachabilityScopedExits.value;
    const entranceMapped = entrances.filter((e) =>
      isEntranceMapped(e.key),
    ).length;
    const exitMapped = exits.filter((e) => isExitMapped(e.key)).length;
    const total = entrances.length + exits.length;
    const mapped = entranceMapped + exitMapped;
    return { total, mapped, unmapped: total - mapped };
  });

  const destinationOptions = computed(() => {
    const opts: Array<{
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }> = [];
    const seenValues = new Set<string>();

    const addOption = (option: {
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }) => {
      if (seenValues.has(option.value)) return;
      seenValues.add(option.value);
      opts.push(option);
    };

    for (const entry of activeEntrances.value) {
      if (entry.pool === 'wallmaster' || entry.pool === 'one-way') continue;

      // Add entrance key.
      addOption({
        value: entry.key,
        label: entry.optionLabel,
        game: entry.game,
        pool: entry.pool,
      });

      // Add exit (reverse) key if present.
      const exitKey = getEdgeReverse(entry.key);
      if (exitKey) {
        addOption({
          value: exitKey,
          label: getExitEndpointLabel(exitKey),
          game: entry.game,
          pool: entry.pool,
        });
      }
    }

    return opts;
  });

  const spawnDestinationOptions = computed(() => {
    const settings = trackerSettings.value ?? {};
    const opts: Array<{
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }> = [];
    const seenValues = new Set<string>();

    const addOption = (option: {
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }) => {
      if (seenValues.has(option.value)) return;
      seenValues.add(option.value);
      opts.push(option);
    };

    for (const entry of allDungeonEntrances.value) {
      if (!isTrackedSpawnDestination(entry.key, entry.type, settings)) {
        continue;
      }

      addOption({
        value: entry.key,
        label: entry.optionLabel,
        game: entry.game,
        pool: entry.pool,
      });

      const exitKey = getEdgeReverse(entry.key);
      if (exitKey) {
        addOption({
          value: exitKey,
          label: getExitEndpointLabel(exitKey),
          game: entry.game,
          pool: entry.pool,
        });
      }
    }

    return opts;
  });

  const wallmasterDestinationOptions = computed(() => {
    const opts: Array<{
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }> = [];
    const seenValues = new Set<string>();

    const addOption = (option: {
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }) => {
      if (seenValues.has(option.value)) return;
      seenValues.add(option.value);
      opts.push(option);
    };

    for (const entry of allDungeonEntrances.value) {
      if (!isTrackedWallmasterDestination(entry.type)) {
        continue;
      }

      addOption({
        value: entry.key,
        label: entry.optionLabel,
        game: entry.game,
        pool: entry.pool,
      });

      // Also offer the exit (reverse) key if present
      const exitKey = getEdgeReverse(entry.key);
      if (exitKey) {
        addOption({
          value: exitKey,
          label: getExitEndpointLabel(exitKey),
          game: entry.game,
          pool: entry.pool,
        });
      }
    }

    return opts;
  });

  const oneWayDestinationOptions = computed(() => {
    const settings = trackerSettings.value ?? {};
    const opts: Array<{
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }> = [];
    const seenValues = new Set<string>();

    const addOption = (option: {
      value: string;
      label: string;
      game: 'oot' | 'mm';
      pool: TrackedEntrancePool;
    }) => {
      if (seenValues.has(option.value)) return;
      seenValues.add(option.value);
      opts.push(option);
    };

    for (const entry of allDungeonEntrances.value) {
      if (!isTrackedOneWayDestination(entry.type, settings)) {
        continue;
      }

      addOption({
        value: entry.key,
        label: entry.optionLabel,
        game: entry.game,
        pool: entry.pool,
      });

      const exitKey = getEdgeReverse(entry.key);
      if (exitKey) {
        addOption({
          value: exitKey,
          label: getExitEndpointLabel(exitKey),
          game: entry.game,
          pool: entry.pool,
        });
      }
    }

    return opts;
  });

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

  /** Set of destination keys currently used by non-spawn, non-wallmaster sources. */
  const usedDestinationKeysByNonSpawn = computed(() => {
    const used = new Set<string>();
    const overrides = entranceOverrides.value;
    for (const src of Object.keys(overrides)) {
      const dst = overrides[src];
      if (!dst) continue;
      const pool = getEntrancePoolByKey(src);
      const oneWayAlias =
        pool === 'one-way' && trackerSettings.value?.erOneWaysAnywhere;
      if (pool === 'spawn' || pool === 'wallmaster' || oneWayAlias) continue;
      used.add(dst);
    }
    return used;
  });

  function isDestinationUsed(dstKey: string, currentSrcKey: string): boolean {
    const currentSourcePool = getEntrancePoolByKey(currentSrcKey);
    const oneWayAlias =
      currentSourcePool === 'one-way' &&
      trackerSettings.value?.erOneWaysAnywhere;
    if (
      currentSourcePool === 'spawn' ||
      currentSourcePool === 'wallmaster' ||
      oneWayAlias
    ) {
      return false;
    }

    // If the current source already maps to this destination,
    // it's not considered "used" by someone else.
    const currentDst = entranceOverrides.value[currentSrcKey] ?? '';
    if (currentDst === dstKey) {
      return false;
    }

    return usedDestinationKeysByNonSpawn.value.has(dstKey);
  }

  function sortOptionsByGameThenLabel<
    T extends { game: string; label: string },
  >(opts: T[]): T[] {
    return [...opts].sort((a, b) => {
      if (a.game !== b.game) return a.game === 'oot' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }

  type EntranceOption = {
    value: string;
    label: string;
    game: 'oot' | 'mm';
    pool: TrackedEntrancePool;
  };

  function computeOptionsForEntrance(
    entry: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
  ): EntranceOption[] {
    if (entry.pool === 'spawn') {
      return sortOptionsByGameThenLabel(
        spawnDestinationOptions.value.filter(
          (dest) =>
            dest.game === entry.game &&
            !isDestinationUsed(dest.value, entry.key),
        ),
      );
    }

    if (entry.pool === 'wallmaster') {
      const settings = trackerSettings.value ?? {};
      const ownGameMode = getTrackedEntranceOwnGameMode('wallmaster', settings);
      const opts = wallmasterDestinationOptions.value.filter((dest) => {
        if (!ownGameMode) return true;
        return dest.game === entry.game;
      });
      return sortOptionsByGameThenLabel(
        opts.filter((dest) => {
          if (isDestinationUsed(dest.value, entry.key)) return false;
          return doTrackedEntrancePolaritiesMatch(
            entry.key,
            dest.value,
            settings,
          );
        }),
      );
    }

    if (entry.pool === 'one-way') {
      const settings = trackerSettings.value ?? {};
      const ownGameMode = getTrackedEntranceOwnGameMode('one-way', settings);
      const opts = oneWayDestinationOptions.value.filter((dest) => {
        if (!ownGameMode) return true;
        return dest.game === entry.game;
      });
      return sortOptionsByGameThenLabel(
        opts.filter((dest) => {
          if (isDestinationUsed(dest.value, entry.key)) return false;
          return doTrackedEntrancePolaritiesMatch(
            entry.key,
            dest.value,
            settings,
          );
        }),
      );
    }

    const settings = trackerSettings.value ?? {};
    const selectedDestination = entranceOverrides.value[entry.key] ?? '';
    const compatiblePools = new Set(
      getTrackedEntranceCompatiblePools(entry.pool, settings),
    );
    const ownGameMode = getTrackedEntranceOwnGameMode(entry.pool, settings);
    const opts = destinationOptions.value.filter((dest) => {
      if (!compatiblePools.has(dest.pool)) return false;
      if (!ownGameMode) return true;
      return dest.game === entry.game;
    });

    return sortOptionsByGameThenLabel(
      opts.filter((dest) => {
        if (isDestinationUsed(dest.value, entry.key)) {
          return false;
        }

        if (dest.value === selectedDestination) {
          return true;
        }

        return doTrackedEntrancePolaritiesMatch(
          entry.key,
          dest.value,
          settings,
        );
      }),
    );
  }

  function destinationOptionsForEntrance(
    entry: Pick<DungeonEntranceEntry, 'key' | 'game' | 'pool'>,
  ): EntranceOption[] {
    return entranceOptionsByKey.value.get(entry.key) ?? [];
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

  function getResolvedSelectedDestination(srcKey: string): string {
    return getSelectedDestination(srcKey);
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

  function isExitMapped(exitKey: string): boolean {
    return (entranceOverrides.value[exitKey] ?? '').trim().length > 0;
  }

  function getExitDestination(exitKey: string): string {
    return entranceOverrides.value[exitKey] ?? '';
  }

  function getExitDestinationLabel(exitKey: string): string {
    const dst = entranceOverrides.value[exitKey] ?? '';
    if (!dst) return '';
    return getExitLabel(dst);
  }

  function getExitSelectedDestination(exitKey: string): string {
    return entranceOverrides.value[exitKey] ?? '';
  }

  /**
   * Set an exit mapping directly. The store coupling (Phase 2.1) automatically
   * sets the reverse entrance mapping. Passing an empty dstKey clears it.
   */
  function setExitDestination(exitKey: string, exitDstKey: string) {
    sessionStore.setEntranceOverride(exitKey, exitDstKey || null);
  }

  /** Set of all destination keys currently used (including spawn sources). */
  const usedDestinationKeys = computed(() => {
    const used = new Set<string>();
    const overrides = entranceOverrides.value;
    for (const dst of Object.values(overrides)) {
      if (dst) used.add(dst);
    }
    return used;
  });

  function isExitDestinationUsed(
    exitDstKey: string,
    currentExitSrcKey: string,
  ): boolean {
    // If the current exit source already maps to this destination,
    // it's not considered "used" by someone else.
    const currentDst = entranceOverrides.value[currentExitSrcKey] ?? '';
    if (currentDst === exitDstKey) return false;

    return usedDestinationKeys.value.has(exitDstKey);
  }

  function computeOptionsForExit(
    exit: Pick<ExitEntry, 'key' | 'game' | 'pool'>,
  ): EntranceOption[] {
    const settings = trackerSettings.value ?? {};
    const selectedDestination = entranceOverrides.value[exit.key] ?? '';
    const compatiblePools = new Set(
      getTrackedEntranceCompatiblePools(exit.pool, settings),
    );
    const ownGameMode = getTrackedEntranceOwnGameMode(exit.pool, settings);
    const activeKeys = getActiveEntranceKeys(settings);

    const opts = destinationOptions.value.filter((dest) => {
      if (!compatiblePools.has(dest.pool)) return false;
      if (!ownGameMode) return true;
      return dest.game === exit.game;
    });

    return sortOptionsByGameThenLabel(
      opts.filter((dest) => {
        if (dest.value === selectedDestination) return true;
        if (isExitDestinationUsed(dest.value, exit.key)) return false;
        // The destination (or its reverse for exit-type keys) must be
        // an active entrance source.
        if (activeKeys.has(dest.value)) return true;
        const reverse = getEdgeReverse(dest.value);
        return reverse !== null && activeKeys.has(reverse);
      }),
    );
  }

  function destinationOptionsForExit(
    exit: Pick<ExitEntry, 'key' | 'game' | 'pool'>,
  ): EntranceOption[] {
    return exitOptionsByKey.value.get(exit.key) ?? [];
  }

  const activeExitEntries = computed<ExitEntry[]>(() => {
    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const entries: ExitEntry[] = [];
    for (const entrance of activeEntrances.value) {
      // In ootmm mode the game-link interior doesn't exist,
      // so there is no meaningful exit row.
      if (
        gamesMode === 'ootmm' &&
        INTERIOR_GAME_LINK_EXIT_KEYS.has(entrance.key)
      ) {
        continue;
      }
      const exitKey = getEdgeReverse(entrance.key);
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

  const sidebarActiveExitEntries = computed<ExitEntry[]>(() => {
    return activeExitEntries.value.filter((exit) => {
      if (activeEntrancePoolByKey.value.has(exit.key)) return false;
      // When polarity is 'any' (e.g. region-exit with erOverworld),
      // the entry is not exclusively an exit — skip the dedicated Exits section.
      if (
        getTrackedEntrancePolarity(exit.key, trackerSettings.value ?? {}) ===
        'any'
      )
        return false;
      return true;
    });
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

  const sidebarReachabilityScopedExits = computed<ExitEntry[]>(() => {
    const filter = entrancesReachabilityFilter.value;
    if (filter === 'all') return sidebarActiveExitEntries.value;

    const reachableSet = reachableEntranceIdSet.value;
    return sidebarActiveExitEntries.value.filter((exit) => {
      const isReachable = reachableSet.has(exit.key);
      return filter === 'reachable' ? isReachable : !isReachable;
    });
  });

  const filteredExitEntries = computed<ExitEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    const query = entrancesSearchQuery.value;
    let result = sidebarReachabilityScopedExits.value;

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
  const mapReachabilityScopedExits = computed<ExitEntry[]>(() => {
    const filter = entrancesReachabilityFilter.value;
    if (filter === 'all') return activeExitEntries.value;

    const reachableSet = reachableEntranceIdSet.value;
    return activeExitEntries.value.filter((exit) => {
      const isReachable = reachableSet.has(exit.key);
      return filter === 'reachable' ? isReachable : !isReachable;
    });
  });

  const mapFilteredExitEntries = computed<ExitEntry[]>(() => {
    const mappingFilter = entrancesMappingFilter.value;
    let result = mapReachabilityScopedExits.value;

    if (mappingFilter !== 'all') {
      result = result.filter((exit) => {
        const mapped = isExitMapped(exit.key);
        return mappingFilter === 'mapped' ? mapped : !mapped;
      });
    }

    return result;
  });

  const entranceOptionsByKey = computed<Map<string, EntranceOption[]>>(() => {
    const result = new Map<string, EntranceOption[]>();
    for (const entrance of activeEntrances.value) {
      result.set(entrance.key, computeOptionsForEntrance(entrance));
    }
    return result;
  });

  const exitOptionsByKey = computed<Map<string, EntranceOption[]>>(() => {
    const result = new Map<string, EntranceOption[]>();
    for (const exit of activeExitEntries.value) {
      result.set(exit.key, computeOptionsForExit(exit));
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
    getResolvedSelectedDestination,
    setSelectedDestination,
    clearAllOverrides,
    hasAnyOverrides,
    activeExitEntries,
    filteredExitEntries,
    mapFilteredEntrances,
    mapFilteredExitEntries,
    isExitMapped,
    getExitDestination,
    getExitDestinationLabel,
    getExitSelectedDestination,
    setExitDestination,
    destinationOptionsForExit,
  };
}
