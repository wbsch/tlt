/**
 * OoT dungeon codes as used by the OoTMM `mqDungeons` setting / world flag,
 * indexed by the generator's MQ dungeon id (`MQ_*` in
 * `generator/include/combo/dungeon.h`). The autotracker `locations.json`
 * conflict tables reference the same ids as `dungeonMq`, and the generator
 * stores the MQ state as a bit per id in `ComboConfig.mq`.
 */
export const OOT_MQ_DUNGEON_CODES = [
  'DT',
  'DC',
  'JJ',
  'Forest',
  'Fire',
  'Water',
  'Spirit',
  'Shadow',
  'BotW',
  'IC',
  'GTG',
  'Ganon',
] as const;

export type OotMqDungeonCode = (typeof OOT_MQ_DUNGEON_CODES)[number];

export const OOT_MQ_DUNGEON_COUNT = OOT_MQ_DUNGEON_CODES.length;

/**
 * Generator MQ dungeon id for a `mqDungeons` code, i.e. the bit index used in
 * `ComboConfig.mq` and the `dungeonMq` field of the autotracker data tables.
 * Returns -1 for unknown codes.
 */
export function ootMqDungeonId(code: string): number {
  return (OOT_MQ_DUNGEON_CODES as readonly string[]).indexOf(code);
}

function isOotMqDungeonCode(value: unknown): value is OotMqDungeonCode {
  return (
    typeof value === 'string' &&
    (OOT_MQ_DUNGEON_CODES as readonly string[]).includes(value)
  );
}

function filterCodes(values: readonly unknown[] | undefined): string[] {
  return (values ?? []).filter(isOotMqDungeonCode);
}

/**
 * Resolve the tracker's `mqDungeons` setting value to the list of dungeons
 * that use the MQ layout.
 *
 * Autotracking requires an imported spoiler log, whose `World Flags` section
 * always carries the already-resolved state (`all`, `none`, or an explicit
 * list). Unresolved random modes (`random`, `random-mixed`) cannot be
 * reproduced from the settings alone; only their explicitly pinned values are
 * used.
 */
export function resolveOotMqDungeonCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return filterCodes(value);
  }

  if (typeof value === 'string') {
    if (value === 'all') {
      return [...OOT_MQ_DUNGEON_CODES];
    }
    return isOotMqDungeonCode(value) ? [value] : [];
  }

  if (value && typeof value === 'object') {
    const entry = value as {
      type?: unknown;
      values?: unknown;
      set?: unknown;
    };
    switch (entry.type) {
      case 'all':
        return [...OOT_MQ_DUNGEON_CODES];
      case 'specific':
        return Array.isArray(entry.values) ? filterCodes(entry.values) : [];
      case 'random-mixed':
        return Array.isArray(entry.set) ? filterCodes(entry.set) : [];
      default:
        return [];
    }
  }

  return [];
}

/**
 * Build the MQ dungeon bitmask (`ComboConfig.mq` bit per MQ dungeon id) from a
 * list of `mqDungeons` codes.
 */
export function buildOotMqDungeonMask(
  codes: readonly string[] | null | undefined,
): number {
  let mask = 0;
  for (const code of codes ?? []) {
    const index = (OOT_MQ_DUNGEON_CODES as readonly string[]).indexOf(code);
    if (index >= 0) {
      mask |= 1 << index;
    }
  }
  return mask >>> 0;
}
