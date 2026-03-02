import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as DataMod from '@ootmm/data';
import { useOoTMMSessionStore } from '../stores/ootmmSession';
import { useOoTMMUiStore } from '../stores/ootmmUi';

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

export type DungeonEntranceEntry = {
  key: string;
  label: string;
  game: 'oot' | 'mm';
  type: string;
};

export type EntrancePanelSection = {
  id: 'dungeon';
  title: string;
  hasContent: boolean;
  sortOrder: number;
  kind: 'dungeon';
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
      if (!DUNGEON_TYPES.has(data.type)) continue;
      entries.push({
        key,
        label: entranceLabel(key, data),
        game: data.game as 'oot' | 'mm',
        type: data.type,
      });
    }
    entries.sort((a, b) => {
      if (a.game !== b.game) return a.game === 'oot' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return entries;
  });

  const activeEntrances = computed<DungeonEntranceEntry[]>(() => {
    const settings = trackerSettings.value;
    const erDungeons = settings?.erDungeons;
    if (erDungeons === 'none' || !erDungeons) return [];

    const selectedGames = String(settings?.games ?? 'ootmm');
    const enabledTypes = getEnabledDungeonTypes(settings);

    return allDungeonEntrances.value.filter((entrance) => {
      if (selectedGames === 'oot' && entrance.game === 'mm') return false;
      if (selectedGames === 'mm' && entrance.game === 'oot') return false;

      return enabledTypes.has(entrance.type);
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
    }));
  });

  const erDungeonsMode = computed(() =>
    String(trackerSettings.value?.erDungeons ?? 'none'),
  );
  const sections = computed<EntrancePanelSection[]>(() => {
    if (activeEntrances.value.length === 0) return [];

    return [
      {
        id: 'dungeon',
        title: 'Dungeon Entrances',
        hasContent: true,
        sortOrder: 0,
        kind: 'dungeon',
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

  function destinationOptionsForGame(
    game: 'oot' | 'mm',
    currentSrcKey: string,
  ) {
    const opts =
      erDungeonsMode.value === 'ownGame'
        ? destinationOptions.value.filter((dest) => dest.game === game)
        : destinationOptions.value;

    return opts.filter((dest) => !isDestinationUsed(dest.value, currentSrcKey));
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
    activeEntrances,
    filteredEntrances,
    reachabilityStats,
    mappingStats,
    ootEntrances,
    mmEntrances,
    destinationOptionsForGame,
    getSelectedDestination,
    setSelectedDestination,
    clearAllOverrides,
    hasAnyOverrides,
  };
}
