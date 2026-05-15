export type SpoilerLogData = {
  ootmmVersion?: string;
  settings: Record<string, string | number | boolean>;
  worldFlags: Record<string, string | { type: 'specific'; values: string[] }>;
  specialConds: Record<string, Record<string, string | number | boolean>>;
  startingItems: Record<string, number>;
  startingItemsPlayers: number[];
  junkLocations: string[];
  preCompletedDungeons: string[];
  locationPlacements: SpoilerLocationPlacement[];
  tricks?: string[];
  settingsString?: string;
};

export type SpoilerLocationPlacement = {
  location: string;
  item: string;
  region?: string;
  world?: number;
  itemPlayer?: number;
};

export function isAutotrackingSupportedSpoilerVersion(
  ootmmVersion: string | null | undefined,
): boolean {
  const normalizedVersion = ootmmVersion?.trim().toLowerCase();
  if (!normalizedVersion) {
    return false;
  }

  return /^v?30\.1(?:$|[.\-+ ].*)/.test(normalizedVersion);
}

export function getSpoilerLogPlayerOptions(parsed: SpoilerLogData): number[] {
  const mode = String(parsed.settings.mode ?? '')
    .trim()
    .toLowerCase();
  const players = new Set<number>();
  const configuredPlayerCount = Number(parsed.settings.players);

  if (mode !== 'multi') {
    return [];
  }

  if (Number.isInteger(configuredPlayerCount) && configuredPlayerCount > 0) {
    for (let player = 1; player <= configuredPlayerCount; player += 1) {
      players.add(player);
    }
  }

  return Array.from(players).sort((left, right) => left - right);
}

type ParseSpoilerLogOptions = {
  player?: number;
};

type WorldFlagValue = string | { type: 'specific'; values: string[] };

const WORLD_SECTION_HEADER_RE = /^World\s+(\d+)(?::|\s+\(\d+\))?$/i;

function cloneWorldFlagValue(value: WorldFlagValue): WorldFlagValue {
  if (typeof value === 'string') {
    return value;
  }

  return {
    type: 'specific',
    values: [...value.values],
  };
}

function mergeWorldFlags(
  base: Record<string, WorldFlagValue>,
  override?: Record<string, WorldFlagValue>,
): Record<string, WorldFlagValue> {
  const merged: Record<string, WorldFlagValue> = {};

  for (const [key, value] of Object.entries(base)) {
    merged[key] = cloneWorldFlagValue(value);
  }

  if (!override) {
    return merged;
  }

  for (const [key, value] of Object.entries(override)) {
    merged[key] = cloneWorldFlagValue(value);
  }

  return merged;
}

type Section =
  | 'settings'
  | 'specialConds'
  | 'startingItems'
  | 'junkLocations'
  | 'worldFlags'
  | 'preCompleted'
  | 'locations'
  | 'tricks'
  | null;

const normalizeLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const parseValue = (raw: string): string | number | boolean => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isNaN(num)) return num;
  }
  return raw;
};

export function parseSpoilerLog(
  text: string,
  options: ParseSpoilerLogOptions = {},
): SpoilerLogData {
  const result: SpoilerLogData = {
    settings: {},
    worldFlags: {},
    specialConds: {},
    startingItems: {},
    startingItemsPlayers: [],
    junkLocations: [],
    preCompletedDungeons: [],
    locationPlacements: [],
  };

  const lines = text.split(/\r?\n/);
  let section: Section = null;
  let currentSpecialCond: string | null = null;
  let currentWorldFlag: string | null = null;
  let currentStartingItemsPlayer: number | null = null;
  let currentWorldSectionPlayer: number | null = null;
  let currentLocationRegion: string | null = null;
  let currentLocationWorld: number | null = null;
  let hasStartingItemsPlayerHeaders = false;
  const startingItemsByPlayer: Record<number, Record<string, number>> = {};
  const worldFlagsByPlayer: Record<number, Record<string, WorldFlagValue>> = {};
  const junkLocationsByPlayer: Record<number, string[]> = {};
  const preCompletedDungeonsByPlayer: Record<number, string[]> = {};

  for (const rawLine of lines) {
    if (!rawLine) continue;

    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('Version:')) {
      result.ootmmVersion =
        trimmed.slice('Version:'.length).trim() || undefined;
      continue;
    }

    if (trimmed.startsWith('SettingsString:')) {
      result.settingsString = trimmed.slice('SettingsString:'.length).trim();
      continue;
    }

    if (trimmed === 'Settings') {
      section = 'settings';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      continue;
    }
    if (trimmed === 'Special Conditions') {
      section = 'specialConds';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      continue;
    }
    if (trimmed === 'Starting Items') {
      section = 'startingItems';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentStartingItemsPlayer = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      hasStartingItemsPlayerHeaders = false;
      continue;
    }
    if (trimmed === 'Junk Locations') {
      section = 'junkLocations';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      continue;
    }
    if (trimmed === 'Tricks' || trimmed === 'Glitches') {
      section = 'tricks';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      if (!result.tricks) {
        result.tricks = [];
      }
      continue;
    }
    if (trimmed === 'World Flags') {
      section = 'worldFlags';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      continue;
    }
    if (trimmed === 'Pre-Completed Dungeons') {
      section = 'preCompleted';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      continue;
    }
    if (
      trimmed === 'Locations' ||
      /^Location List(?:\s+\(\d+\))?$/i.test(trimmed)
    ) {
      section = 'locations';
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      continue;
    }

    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      section = null;
      currentSpecialCond = null;
      currentWorldFlag = null;
      currentWorldSectionPlayer = null;
      currentLocationRegion = null;
      currentLocationWorld = null;
      continue;
    }

    switch (section) {
      case 'settings': {
        const normalized = normalizeLine(trimmed);
        const splitIndex = normalized.indexOf(':');
        if (splitIndex <= 0) break;
        const key = normalized.slice(0, splitIndex).trim();
        const value = normalized.slice(splitIndex + 1).trim();
        if (!key) break;
        result.settings[key] = parseValue(value);
        break;
      }
      case 'specialConds': {
        const normalized = normalizeLine(trimmed);
        if (normalized.endsWith(':') && !normalized.includes(': ')) {
          currentSpecialCond = normalized.slice(0, -1).trim();
          if (currentSpecialCond) {
            result.specialConds[currentSpecialCond] = {};
          }
          break;
        }
        if (!currentSpecialCond) break;
        const splitIndex = normalized.indexOf(':');
        if (splitIndex <= 0) break;
        const key = normalized.slice(0, splitIndex).trim();
        const value = normalized.slice(splitIndex + 1).trim();
        if (!key) break;
        result.specialConds[currentSpecialCond][key] = parseValue(value);
        break;
      }
      case 'startingItems': {
        const playerMatch = trimmed.match(/^Player\s+(\d+)/i);
        if (playerMatch) {
          hasStartingItemsPlayerHeaders = true;
          currentStartingItemsPlayer = Number.parseInt(playerMatch[1], 10);
          if (!Number.isNaN(currentStartingItemsPlayer)) {
            if (!startingItemsByPlayer[currentStartingItemsPlayer]) {
              startingItemsByPlayer[currentStartingItemsPlayer] = {};
            }
          }
          break;
        }
        const normalized = normalizeLine(trimmed);
        const splitIndex = normalized.lastIndexOf(':');
        if (splitIndex <= 0) break;
        const name = normalized.slice(0, splitIndex).trim();
        const countRaw = normalized.slice(splitIndex + 1).trim();
        const count = Number.parseInt(countRaw, 10);
        if (!name || Number.isNaN(count)) break;
        const player = hasStartingItemsPlayerHeaders
          ? currentStartingItemsPlayer
          : 1;
        if (player === null) {
          break;
        }
        if (!startingItemsByPlayer[player]) {
          startingItemsByPlayer[player] = {};
        }
        startingItemsByPlayer[player][name] = count;
        break;
      }
      case 'junkLocations': {
        const worldMatch = trimmed.match(WORLD_SECTION_HEADER_RE);
        if (worldMatch) {
          currentWorldSectionPlayer = Number.parseInt(worldMatch[1], 10);
          break;
        }
        const normalized = normalizeLine(trimmed);
        if (normalized) {
          if (
            currentWorldSectionPlayer !== null &&
            !Number.isNaN(currentWorldSectionPlayer)
          ) {
            const entries =
              junkLocationsByPlayer[currentWorldSectionPlayer] ?? [];
            entries.push(normalized);
            junkLocationsByPlayer[currentWorldSectionPlayer] = entries;
          } else {
            result.junkLocations.push(normalized);
          }
        }
        break;
      }
      case 'worldFlags': {
        const worldMatch = trimmed.match(WORLD_SECTION_HEADER_RE);
        if (worldMatch) {
          currentWorldSectionPlayer = Number.parseInt(worldMatch[1], 10);
          currentWorldFlag = null;
          if (
            !Number.isNaN(currentWorldSectionPlayer) &&
            !worldFlagsByPlayer[currentWorldSectionPlayer]
          ) {
            worldFlagsByPlayer[currentWorldSectionPlayer] = {};
          }
          break;
        }
        const normalized = normalizeLine(trimmed);
        const targetWorldFlags =
          currentWorldSectionPlayer !== null &&
          !Number.isNaN(currentWorldSectionPlayer)
            ? (worldFlagsByPlayer[currentWorldSectionPlayer] ??
              (worldFlagsByPlayer[currentWorldSectionPlayer] = {}))
            : result.worldFlags;
        if (normalized.startsWith('- ')) {
          if (!currentWorldFlag) break;
          const valueName = normalized.slice(2).trim();
          const entry = targetWorldFlags[currentWorldFlag];
          if (!entry || typeof entry === 'string') {
            targetWorldFlags[currentWorldFlag] = {
              type: 'specific',
              values: [valueName],
            };
          } else {
            entry.values.push(valueName);
          }
          break;
        }
        if (normalized.endsWith(':') && !normalized.includes(': ')) {
          currentWorldFlag = normalized.slice(0, -1).trim();
          if (currentWorldFlag) {
            targetWorldFlags[currentWorldFlag] = {
              type: 'specific',
              values: [],
            };
          }
          break;
        }
        const splitIndex = normalized.indexOf(':');
        if (splitIndex <= 0) break;
        const name = normalized.slice(0, splitIndex).trim();
        const value = normalized.slice(splitIndex + 1).trim();
        if (!name) break;
        currentWorldFlag = null;
        targetWorldFlags[name] = parseValue(value) as string;
        break;
      }
      case 'preCompleted': {
        const worldMatch = trimmed.match(WORLD_SECTION_HEADER_RE);
        if (worldMatch) {
          currentWorldSectionPlayer = Number.parseInt(worldMatch[1], 10);
          break;
        }
        const normalized = normalizeLine(trimmed);
        if (normalized) {
          if (
            currentWorldSectionPlayer !== null &&
            !Number.isNaN(currentWorldSectionPlayer)
          ) {
            const entries =
              preCompletedDungeonsByPlayer[currentWorldSectionPlayer] ?? [];
            entries.push(normalized);
            preCompletedDungeonsByPlayer[currentWorldSectionPlayer] = entries;
          } else {
            result.preCompletedDungeons.push(normalized);
          }
        }
        break;
      }
      case 'tricks': {
        const normalized = normalizeLine(trimmed);
        if (normalized) {
          if (!result.tricks) {
            result.tricks = [];
          }
          result.tricks.push(normalized);
        }
        break;
      }
      case 'locations': {
        const normalized = normalizeLine(trimmed);
        if (!normalized) break;

        const worldMatch = normalized.match(/^World\s+(\d+)(?:\s+\(\d+\))?$/i);
        if (worldMatch) {
          currentLocationWorld = Number.parseInt(worldMatch[1], 10);
          currentLocationRegion = null;
          break;
        }

        const regionMatch = normalized.match(/^(.*)\s+\((\d+)\):$/);
        if (regionMatch) {
          currentLocationRegion = regionMatch[1]
            .replace(/^World\s+\d+\s+/i, '')
            .trim();
          break;
        }

        const splitIndex = normalized.indexOf(':');
        if (splitIndex <= 0) break;

        const location = normalized.slice(0, splitIndex).trim();
        const rawItem = normalized.slice(splitIndex + 1).trim();
        if (!location || !rawItem) break;

        const uncloakedItem = rawItem.replace(/\s+\(cloaked as .+\)$/i, '');
        const itemPlayerMatch = uncloakedItem.match(/^Player\s+(\d+)\s+(.+)$/i);
        const itemPlayer = itemPlayerMatch
          ? Number.parseInt(itemPlayerMatch[1], 10)
          : undefined;
        const item = itemPlayerMatch
          ? itemPlayerMatch[2].trim()
          : uncloakedItem.trim();

        if (!item) break;

        result.locationPlacements.push({
          location,
          item,
          region: currentLocationRegion || undefined,
          world:
            currentLocationWorld !== null && !Number.isNaN(currentLocationWorld)
              ? currentLocationWorld
              : undefined,
          itemPlayer:
            typeof itemPlayer === 'number' && !Number.isNaN(itemPlayer)
              ? itemPlayer
              : undefined,
        });
        break;
      }
      default:
        break;
    }
  }

  const startingItemsPlayers = Object.keys(startingItemsByPlayer)
    .map((player) => Number.parseInt(player, 10))
    .filter((player) => !Number.isNaN(player))
    .sort((left, right) => left - right);
  result.startingItemsPlayers = startingItemsPlayers;

  const selectedPlayer = options.player ?? 1;
  if (startingItemsByPlayer[selectedPlayer]) {
    result.startingItems = startingItemsByPlayer[selectedPlayer];
  }

  result.worldFlags = mergeWorldFlags(
    result.worldFlags,
    worldFlagsByPlayer[selectedPlayer],
  );

  if (junkLocationsByPlayer[selectedPlayer]) {
    result.junkLocations = [
      ...result.junkLocations,
      ...junkLocationsByPlayer[selectedPlayer],
    ];
  }

  if (preCompletedDungeonsByPlayer[selectedPlayer]) {
    result.preCompletedDungeons = [
      ...result.preCompletedDungeons,
      ...preCompletedDungeonsByPlayer[selectedPlayer],
    ];
  }

  return result;
}
