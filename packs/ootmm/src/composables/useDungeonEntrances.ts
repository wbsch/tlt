import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as DataMod from '@ootmm/data';
import { getItemName } from '../data/items';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';
import {
  getActiveEntranceKeys,
  getTrackedEntrancePool,
  isTrackedEntranceSourceType,
  computeExitOverrides,
  computeDisplayEntranceOverrides,
  filterEntranceOverridesForSettings,
  getExitKeyForEntrance,
  getExitLabel,
  getExitEndpointLabel,
  deriveEntranceFromExitMapping,
  INTERIOR_GAME_LINK_SOURCE_KEYS,
  INTERIOR_GAME_LINK_EXIT_KEYS,
  getGameLinkPartner,
  normalizeTrackedDestinationKeyForSource,
  normalizeTrackedEntranceKey,
  resolveToActiveEntranceKey,
  getTrackedEntranceCompatiblePools,
  getTrackedEntranceOwnGameMode,
  isTrackedSpawnDestination,
  isTrackedDestinationAllowedForSource,
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

function entranceOptionLabel(key: string, data: EntranceData): string {
  const toName = stripEntranceNamePrefix(data.to);

  if (data.type === 'one-way-song' || data.type === 'one-way-statue') {
    return toName ?? entranceLabel(key, data);
  }

  return entranceLabel(key, data);
}

function entranceLabel(key: string, data: EntranceData): string {
  if (data.type === 'spawn-child') return 'Child Spawn';
  if (data.type === 'spawn-adult') return 'Adult Spawn';

  const toName = stripEntranceNamePrefix(data.to);
  const fromName = stripEntranceNamePrefix(data.from);
  if (toName && fromName) {
    return `${toName} from ${fromName}`;
  }
  if (toName) return toName;
  if (data.debug && data.debug[1]) return data.debug[1];
  return key.replace(/_/g, ' ');
}

function entranceDisplayLabel(key: string, data: EntranceData): string {
  if (data.type === 'spawn-child') return 'Child Spawn';
  if (data.type === 'spawn-adult') return 'Adult Spawn';

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

  const normalizedEntranceOverrides = computed(() =>
    filterEntranceOverridesForSettings(
      entranceOverrides.value,
      trackerSettings.value,
    ),
  );

  const displayEntranceOverrides = computed(() =>
    computeDisplayEntranceOverrides(
      entranceOverrides.value,
      trackerSettings.value,
    ),
  );

  const rawActiveEntranceOverrides = computed(() => {
    const activeKeys = getActiveEntranceKeys(trackerSettings.value);
    if (activeKeys.size === 0) return {} as Record<string, string>;

    const result: Record<string, string> = {};
    for (const [rawSrc, rawDst] of Object.entries(entranceOverrides.value)) {
      const effectiveSrc = resolveToActiveEntranceKey(
        normalizeTrackedEntranceKey(rawSrc),
        activeKeys,
      );
      if (!effectiveSrc) continue;

      if (
        !isTrackedDestinationAllowedForSource(
          effectiveSrc,
          rawDst,
          trackerSettings.value ?? {},
          activeKeys,
        )
      ) {
        continue;
      }

      result[effectiveSrc] = rawDst;
    }
    return result;
  });

  function isEntranceMapped(entranceKey: string): boolean {
    return (
      (displayEntranceOverrides.value[entranceKey] ?? '').trim().length > 0
    );
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
          entries.push({
            key,
            label: entranceLabel(key, data),
            displayLabel: entranceDisplayLabel(key, data),
            optionLabel: entranceOptionLabel(key, data),
            game: data.game as 'oot' | 'mm',
            type: data.type,
            pool: 'interior',
          });
        }
        continue;
      }

      if (!isTrackedEntranceSourceType(data.type, key)) continue;
      const pool = getTrackedEntrancePool(data.type, key);
      if (!pool) continue;
      entries.push({
        key,
        label: entranceLabel(key, data),
        displayLabel: entranceDisplayLabel(key, data),
        optionLabel: entranceOptionLabel(key, data),
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

    return getTrackedEntrancePool(data.type, key);
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
    const opts = activeEntrances.value.map((entry) => {
      const partner = getGameLinkPartner(entry.key);
      if (partner) {
        const partnerData = ENTRANCES_RAW[partner];
        if (partnerData) {
          return {
            value: partner,
            label: entranceOptionLabel(partner, partnerData),
            game: entry.game,
            pool: entry.pool,
          };
        }
      }
      return {
        value: entry.key,
        label: entry.optionLabel,
        game: entry.game,
        pool: entry.pool,
      };
    });

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

      const partner = getGameLinkPartner(entry.key);
      if (partner) {
        const partnerData = ENTRANCES_RAW[partner];
        if (partnerData) {
          addOption({
            value: partner,
            label: entranceOptionLabel(partner, partnerData),
            game: entry.game,
            pool: entry.pool,
          });
        }
      } else {
        addOption({
          value: entry.key,
          label: entry.optionLabel,
          game: entry.game,
          pool: entry.pool,
        });
      }

      const exitKey = getExitKeyForEntrance(entry.key);
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

  function isDestinationUsed(dstKey: string, currentSrcKey: string): boolean {
    const normalizedDstKey = normalizeTrackedEntranceKey(dstKey);
    const currentSourcePool = getEntrancePoolByKey(currentSrcKey);

    for (const [src, dst] of Object.entries(rawActiveEntranceOverrides.value)) {
      if (src === currentSrcKey) continue;
      const otherSourcePool = getEntrancePoolByKey(src);
      if (currentSourcePool === 'spawn' || otherSourcePool === 'spawn') {
        continue;
      }
      if (dst === dstKey) return true;
      if (normalizeTrackedEntranceKey(dst) === normalizedDstKey) return true;
    }

    const partner = getGameLinkPartner(dstKey);
    if (partner) {
      for (const [src, dst] of Object.entries(
        rawActiveEntranceOverrides.value,
      )) {
        if (src === currentSrcKey) continue;
        const otherSourcePool = getEntrancePoolByKey(src);
        if (currentSourcePool === 'spawn' || otherSourcePool === 'spawn') {
          continue;
        }
        if (dst === partner) return true;
      }
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
    if (entry.pool === 'spawn') {
      return sortOptionsByGameThenLabel(
        spawnDestinationOptions.value.filter(
          (dest) =>
            dest.game === entry.game &&
            !isDestinationUsed(dest.value, entry.key),
        ),
      );
    }

    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const settings = trackerSettings.value ?? {};
    const compatiblePools = new Set(
      getTrackedEntranceCompatiblePools(entry.pool, settings),
    );
    const ownGameMode = getTrackedEntranceOwnGameMode(entry.pool, settings);
    const opts = destinationOptions.value.filter((dest) => {
      if (!compatiblePools.has(dest.pool)) return false;
      if (!ownGameMode) return true;
      return dest.game === entry.game;
    });

    if (gamesMode === 'ootmm' && INTERIOR_GAME_LINK_EXIT_KEYS.has(entry.key)) {
      const seenAliases = new Set(
        opts.map((dest) => `${dest.value}::${dest.label}`),
      );
      for (const exit of activeExitEntries.value) {
        if (!compatiblePools.has(exit.pool)) continue;
        if (ownGameMode && exit.game !== entry.game) continue;

        const normalizedValue = ENTRANCES_RAW[exit.key]?.reverse?.trim();
        if (!normalizedValue || !ENTRANCES_RAW[normalizedValue]) continue;

        const alias = {
          value: exit.key,
          label: getExitEndpointLabel(exit.key),
          game: exit.game,
          pool: exit.pool,
        };
        const aliasKey = `${alias.value}::${alias.label}`;
        if (seenAliases.has(aliasKey)) continue;
        seenAliases.add(aliasKey);
        opts.push(alias);
      }
    }

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
    return displayEntranceOverrides.value[srcKey] ?? '';
  }

  function getResolvedSelectedDestination(srcKey: string): string {
    return normalizeTrackedDestinationKeyForSource(
      srcKey,
      getSelectedDestination(srcKey),
    );
  }

  function setSelectedDestination(srcKey: string, dstKey: string) {
    // In single-game mode, game-link exit keys selected as entrance
    // destinations must be normalized to the source key so the plando
    // and exit override derivation stay correct.
    // In ootmm mode the exit keys are the active keys and must be preserved.
    let normalizedDst = dstKey;
    if (dstKey && INTERIOR_GAME_LINK_EXIT_KEYS.has(dstKey)) {
      const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
      if (gamesMode !== 'ootmm') {
        const partner = getGameLinkPartner(dstKey);
        if (partner) normalizedDst = partner;
      }
    }

    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const nextOverrides = { ...entranceOverrides.value };

    if (!nextOverrides[srcKey] && displayEntranceOverrides.value[srcKey]) {
      const activeKeys = getActiveEntranceKeys(trackerSettings.value);
      for (const [otherSrc, otherDst] of Object.entries(nextOverrides)) {
        const effectiveOtherSrc = resolveToActiveEntranceKey(
          normalizeTrackedEntranceKey(otherSrc),
          activeKeys,
        );
        const oppositeRaw = ENTRANCES_RAW[otherDst]?.reverse?.trim();
        const effectiveOppositeSrc = oppositeRaw
          ? resolveToActiveEntranceKey(
              normalizeTrackedEntranceKey(oppositeRaw),
              activeKeys,
            )
          : null;
        if (effectiveOtherSrc && effectiveOppositeSrc === srcKey) {
          delete nextOverrides[otherSrc];
          break;
        }
      }
    }

    const previousDst = nextOverrides[srcKey] ?? '';

    if (
      gamesMode === 'ootmm' &&
      previousDst &&
      INTERIOR_GAME_LINK_SOURCE_KEYS.has(previousDst)
    ) {
      const previousPartner = getGameLinkPartner(previousDst);
      if (previousPartner && nextOverrides[previousPartner] === srcKey) {
        delete nextOverrides[previousPartner];
      }
    }

    if (gamesMode === 'ootmm' && INTERIOR_GAME_LINK_EXIT_KEYS.has(srcKey)) {
      const sourceAlias = getGameLinkPartner(srcKey);
      if (sourceAlias) {
        for (const [otherSrc, otherDst] of Object.entries(nextOverrides)) {
          if (otherSrc === srcKey) continue;
          if (otherDst === sourceAlias && nextOverrides[srcKey] === otherSrc) {
            delete nextOverrides[otherSrc];
          }
        }
      }
    }

    if (!normalizedDst) {
      delete nextOverrides[srcKey];
      sessionStore.setEntranceOverrides(nextOverrides);
      return;
    }

    nextOverrides[srcKey] = normalizedDst;

    sessionStore.setEntranceOverrides(nextOverrides);
  }

  function clearAllOverrides() {
    sessionStore.setEntranceOverrides({});
  }

  const hasAnyOverrides = computed(
    () => Object.keys(displayEntranceOverrides.value).length > 0,
  );

  // --- Exit data ---

  const exitOverridesMap = computed(() =>
    computeExitOverrides(normalizedEntranceOverrides.value),
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
    // In single-game mode, game-link source keys selected as exit
    // destinations must be normalized to the exit key.
    // In ootmm mode the source keys don't appear in exit dropdowns.
    let normalizedExitDst = exitDstKey;
    if (INTERIOR_GAME_LINK_SOURCE_KEYS.has(exitDstKey)) {
      const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
      if (gamesMode !== 'ootmm') {
        const partner = getGameLinkPartner(exitDstKey);
        if (partner) normalizedExitDst = partner;
      }
    }
    const derived = deriveEntranceFromExitMapping(exitKey, normalizedExitDst);
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
    // Game-link keys have no polarity: check partner in both override maps
    const partner = getGameLinkPartner(exitDstKey);
    if (partner) {
      for (const [, dst] of Object.entries(overrides)) {
        if (dst === partner) return true;
      }
      for (const [, dst] of Object.entries(normalizedEntranceOverrides.value)) {
        if (dst === exitDstKey || dst === partner) return true;
      }
    }
    return false;
  }

  const exitDestinationOptions = computed(() => {
    const gamesMode = String(trackerSettings.value?.games ?? 'ootmm');
    const opts = activeExitEntries.value.map((entry) => ({
      value: entry.key,
      label: getExitEndpointLabel(entry.key),
      game: entry.game,
      pool: entry.pool,
    }));

    const seenValues = new Set(opts.map((opt) => opt.value));

    // Game-link rows themselves have no meaningful exit rows, but reverse
    // mappings from other interiors can legitimately point at their hidden
    // partner key. Keep that partner side in the destination list so the
    // reverse-edge row can render and stay editable.
    for (const entrance of activeEntrances.value) {
      const extraValue =
        gamesMode === 'ootmm'
          ? getGameLinkPartner(entrance.key)
          : INTERIOR_GAME_LINK_SOURCE_KEYS.has(entrance.key)
            ? entrance.key
            : null;
      if (!extraValue || seenValues.has(extraValue)) continue;
      seenValues.add(extraValue);
      opts.push({
        value: extraValue,
        label: getExitEndpointLabel(extraValue),
        game: entrance.game,
        pool: entrance.pool,
      });
    }

    return opts;
  });

  function destinationOptionsForExit(
    exit: Pick<ExitEntry, 'key' | 'game' | 'pool'>,
  ) {
    const settings = trackerSettings.value ?? {};
    const compatiblePools = new Set(
      getTrackedEntranceCompatiblePools(exit.pool, settings),
    );
    const ownGameMode = getTrackedEntranceOwnGameMode(exit.pool, settings);
    const opts = exitDestinationOptions.value.filter((dest) => {
      if (!compatiblePools.has(dest.pool)) return false;
      if (!ownGameMode) return true;
      return dest.game === exit.game;
    });

    return sortOptionsByGameThenLabel(
      opts.filter((dest) => !isExitDestinationUsed(dest.value, exit.key)),
    );
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
    getResolvedSelectedDestination,
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
