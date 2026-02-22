type GameId = 'oot' | 'mm';

type WorldAreaRecord = {
  locations?: Record<string, unknown>;
};

type WorldLayoutRecord = Record<string, Record<string, WorldAreaRecord>>;

export type WorldLikeData = Record<string, WorldLayoutRecord>;

export type HintLocationRecord = {
  location?: unknown;
};

export type HintsLikeData = Record<string, HintLocationRecord[]>;

const BASE_GAMES: GameId[] = ['oot', 'mm'];

export function toLocationName(game: GameId, locationName: string): string {
  return `${game.toUpperCase()} ${locationName}`;
}

export function layoutToGame(layout: string): GameId | null {
  if (layout === 'oot' || layout === 'mq' || layout.startsWith('mq_')) {
    return 'oot';
  }
  if (layout === 'mm' || layout.startsWith('mm_')) return 'mm';
  return null;
}

export function toSortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function collectWorldLocationNames(world: WorldLikeData): Set<string> {
  const locationNames = new Set<string>();

  for (const [layoutKey, worldByLayout] of Object.entries(world ?? {})) {
    const game = layoutToGame(layoutKey);
    if (!game) continue;

    for (const areaSet of Object.values(worldByLayout ?? {})) {
      for (const area of Object.values(areaSet ?? {})) {
        for (const locationName of Object.keys(area?.locations ?? {})) {
          locationNames.add(toLocationName(game, locationName));
        }
      }
    }
  }

  return locationNames;
}

export function collectHintLocationNames(hints: HintsLikeData): Set<string> {
  const locationNames = new Set<string>();

  for (const game of BASE_GAMES) {
    for (const hint of hints?.[game] ?? []) {
      if (!hint || typeof hint !== 'object') continue;
      if (typeof hint.location !== 'string') continue;
      locationNames.add(toLocationName(game, hint.location));
    }
  }

  return locationNames;
}

export function buildLocationCodeSet(
  world: WorldLikeData,
  hints?: HintsLikeData,
): string[] {
  const names = new Set<string>(collectWorldLocationNames(world));
  if (hints) {
    for (const hintName of collectHintLocationNames(hints)) {
      names.add(hintName);
    }
  }
  return toSortedUnique(names);
}
