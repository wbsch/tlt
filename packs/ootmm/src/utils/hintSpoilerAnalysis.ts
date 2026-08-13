// ── Hint Spoiler Log Analysis ──
// Parses the raw "Hints" section from a spoiler log and provides
// structured data for the Hint Tracker.

import type { PathSubType, ParsedSpoilerHint } from '../data/hintTypes';

export type HintCategory =
  | 'path'
  | 'foolish'
  | 'item-exact'
  | 'item-region'
  | 'moon';

export type ParsedHintsData = {
  /** All parsed hints from the spoiler log */
  hints: ParsedSpoilerHint[];
  /** Deduplicated sets for counting "found" hints */
  byCategory: Record<HintCategory, Set<string>>;
  /** Which path subtypes appear in the seed */
  availablePathSubTypes: Set<PathSubType>;
  /** Which path sub-IDs are available (e.g. which dungeons/bosses/events) */
  availablePathSubIds: Partial<Record<PathSubType, Set<number>>>;
  /** Which Always/Sometimes check locations appear in the seed */
  availableCheckLocations: Set<string>;
  /** Which regions appear in the seed for a given hint category */
  availableRegionsForPath: Set<string>;
  availableRegionsForFoolish: Set<string>;
  availableRegionsForRegion: Set<string>;
  availableRegionsForMoon: Set<string>;
};

/** Split a line into columns separated by 2+ spaces */
function splitByDoubleSpaces(line: string): string[] {
  return line
    .split(/\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract item name and optional note (e.g. "(sometimes required)") from a field */
function parseItemField(field: string): { itemName: string; note: string } {
  const noteMatch = field.match(/\s*\(([^)]*)\)\s*$/);
  const note = noteMatch ? noteMatch[1] : '';
  const itemName = noteMatch
    ? field.slice(0, noteMatch.index).trim()
    : field.trim();
  return { itemName, note };
}

/** Parse the raw Hints section text from a spoiler log */
export function parseSpoilerHints(hintsText: string): ParsedHintsData {
  const hints: ParsedSpoilerHint[] = [];
  const byCategory: Record<HintCategory, Set<string>> = {
    path: new Set(),
    foolish: new Set(),
    'item-exact': new Set(),
    'item-region': new Set(),
    moon: new Set(),
  };
  const availablePathSubTypes = new Set<PathSubType>();
  const availablePathSubIds: Partial<Record<PathSubType, Set<number>>> = {};
  const availableCheckLocations = new Set<string>();
  const availableRegionsForPath = new Set<string>();
  const availableRegionsForFoolish = new Set<string>();
  const availableRegionsForRegion = new Set<string>();
  const availableRegionsForMoon = new Set<string>();

  // Helper to add subId to available set
  function addSubId(type: PathSubType, id: number) {
    if (!availablePathSubIds[type]) availablePathSubIds[type] = new Set();
    availablePathSubIds[type]!.add(id);
  }

  // Known boss names → subId mapping
  const BOSS_NAMES_MAP: Record<string, number> = {
    gohma: 0,
    'king dodongo': 1,
    barinade: 2,
    'phantom ganon': 3,
    volvagia: 4,
    morpha: 5,
    'bongo-bongo': 6,
    twinrova: 7,
    odolwa: 8,
    goht: 9,
    gyorg: 10,
    twinmold: 11,
  };
  const KNOWN_BOSS_NAMES = new Set(Object.keys(BOSS_NAMES_MAP));
  const BOSS_NAME_TO_SUBID = new Map(Object.entries(BOSS_NAMES_MAP));

  // Known dungeon names → subId mapping
  const DUNGEON_NAMES_MAP: Record<string, number> = {
    'deku tree': 0,
    "dodongo's cavern": 1,
    'dodongo cavern': 1,
    "jabu-jabu's belly": 2,
    'jabu-jabu': 2,
    'forest temple': 3,
    'fire temple': 4,
    'water temple': 5,
    'shadow temple': 6,
    'spirit temple': 7,
    'bottom of the well': 8,
    'ice cavern': 9,
    "gerudo's training grounds": 10,
    'gerudo training grounds': 10,
    "ganon's castle": 11,
    'ganon castle': 11,
    'woodfall temple': 12,
    'snowhead temple': 13,
    'great bay temple': 14,
    'stone tower temple': 15,
  };
  const DUNGEON_NAME_TO_SUBID = new Map(Object.entries(DUNGEON_NAMES_MAP));

  const lines = hintsText.split('\n');
  let currentSection:
    | 'path'
    | 'foolish'
    | 'specific'
    | 'regional'
    | 'foolish-regions'
    | null = null;
  let currentPathLabel: string | null = null;
  /** Carry-over gossip stone name for multi-line entries in specific/regional sections */
  let lastGossipStone: string | undefined = undefined;
  /**
   * Last gossip stone seen in the current "Specific Hints:" section.
   * A check with multiple items (dual hint, e.g. the Ranch Defense) spans
   * several lines under the same stone, so only the first line of each stone
   * counts as a distinct hint.
   */
  let lastSpecificStone: string | undefined = undefined;

  // Known path subtype labels
  const PATH_SUBTYPE_LABELS: Record<string, PathSubType> = {
    woth: 'woth',
    triforce: 'triforce',
    dungeon: 'dungeon',
    boss: 'boss',
    'end-boss': 'end-boss',
    event: 'event',
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect section headers
    if (trimmed === 'Paths') {
      currentSection = null;
      continue;
    }
    if (trimmed === 'Hints') {
      currentSection = null;
      continue;
    }

    // Path section: "Way of the Hero:" (the most common path type)
    if (trimmed === 'Way of the Hero:') {
      currentSection = 'path';
      currentPathLabel = trimmed.replace(/:$/, '');
      availablePathSubTypes.add('woth');
      continue;
    }

    // Foolish section (names of gossip stones, no items)
    if (trimmed === 'Foolish:') {
      currentSection = 'foolish';
      continue;
    }

    // Specific Hints (Always/Sometimes) section
    if (trimmed === 'Specific Hints:') {
      currentSection = 'specific';
      lastSpecificStone = undefined;
      continue;
    }

    // Regional Hints section
    if (trimmed === 'Regional Hints:') {
      currentSection = 'regional';
      continue;
    }

    // Foolish Regions (counts only)
    if (trimmed === 'Foolish Regions:') {
      currentSection = 'foolish-regions';
      continue;
    }

    // Path section: "Path to X:" headers
    const pathHeaderMatch = trimmed.match(/^Path\s+to\s+(.+):$/i);
    if (pathHeaderMatch) {
      currentSection = 'path';
      currentPathLabel = pathHeaderMatch[1].trim();

      // Determine path subtype from label
      const labelLower = currentPathLabel.toLowerCase();

      if (labelLower.includes('triforce')) {
        availablePathSubTypes.add('triforce');
        // Map "Power"/"Courage"/"Wisdom" to subId 0/1/2
        if (labelLower.includes('power')) addSubId('triforce', 0);
        else if (labelLower.includes('courage')) addSubId('triforce', 1);
        else if (labelLower.includes('wisdom')) addSubId('triforce', 2);
      } else if (
        labelLower.includes('rainbow bridge') ||
        labelLower.includes('bridge')
      ) {
        availablePathSubTypes.add('event');
        addSubId('event', 1); // Rainbow Bridge
      } else if (labelLower.includes('termina')) {
        availablePathSubTypes.add('event');
        addSubId('event', 2); // Termina
      } else if (labelLower.includes('moon')) {
        availablePathSubTypes.add('event');
        addSubId('event', 3); // Moon
      } else if (labelLower.includes('time travel')) {
        availablePathSubTypes.add('event');
        addSubId('event', 0); // Time Travel
      } else if (labelLower === 'ganon') {
        availablePathSubTypes.add('end-boss');
        addSubId('end-boss', 0); // Ganon
      } else if (labelLower === 'majora') {
        availablePathSubTypes.add('end-boss');
        addSubId('end-boss', 1); // Majora
      } else if (KNOWN_BOSS_NAMES.has(labelLower)) {
        availablePathSubTypes.add('boss');
        const subId = BOSS_NAME_TO_SUBID.get(labelLower);
        if (subId !== undefined) addSubId('boss', subId);
      } else {
        // Default to dungeon
        availablePathSubTypes.add('dungeon');
        const subId = DUNGEON_NAME_TO_SUBID.get(labelLower);
        if (subId !== undefined) addSubId('dungeon', subId);
      }
      continue;
    }

    // Parse lines based on section
    switch (currentSection) {
      case 'path': {
        // The Hints section uses space-separated columns (padded):
        //   <gossipStone>  <locationName>  <itemName>
        // The Paths section uses colon-separated format:
        //   <locationName>: <itemName>
        // Try colon-separated format first (from Paths section), then
        // fall back to space-separated (from Hints section).

        const colonIdx = trimmed.indexOf(':');
        let checkLocationName: string;
        let itemName: string;
        let gossipStoneName: string | undefined;

        if (colonIdx > 0) {
          // Colon-separated: "LocationName: ItemName (note)"
          checkLocationName = trimmed.slice(0, colonIdx).trim();
          const rightPart = trimmed.slice(colonIdx + 1).trim();
          itemName = rightPart.replace(/\s*\([^)]*\)\s*$/, '').trim();
        } else {
          // Space-separated: "GossipStone   LocationName   ItemName"
          // Split by 2+ spaces to handle padding
          const spaceParts = trimmed.split(/\s{2,}/);
          if (spaceParts.length < 2) break;

          gossipStoneName = spaceParts[0].trim();
          if (spaceParts.length >= 3) {
            checkLocationName = spaceParts[1].trim();
            itemName = spaceParts[spaceParts.length - 1]
              .replace(/\s*\([^)]*\)\s*$/, '')
              .trim();
          } else {
            checkLocationName = spaceParts[0].trim();
            itemName = spaceParts[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
          }
        }

        hints.push({
          type: 'path',
          pathSubType:
            currentPathLabel === 'Way of the Hero' ? 'woth' : undefined,
          checkLocation: checkLocationName,
          itemName: itemName || undefined,
        });

        if (itemName) {
          byCategory['path'].add(`${checkLocationName}:${itemName}`);
          if (currentPathLabel) {
            availableRegionsForPath.add(currentPathLabel);
          }
        }
        break;
      }
      case 'foolish': {
        // Format: "GossipStoneName (2+ spaces) RegionName"
        // Example: "MM Ikana Canyon Gossip Upper                    East Clock Town"
        const spaceParts = splitByDoubleSpaces(trimmed);
        if (spaceParts.length >= 2) {
          // The second part is the region name
          const regionName = spaceParts[spaceParts.length - 1];
          hints.push({
            type: 'foolish',
            region: regionName,
          });
          if (!byCategory['foolish'].has(regionName)) {
            byCategory['foolish'].add(regionName);
            availableRegionsForFoolish.add(regionName);
          }
        }
        break;
      }
      case 'specific': {
        // Format: "GossipStoneName (2+ spaces) CheckLocation (2+ spaces) ItemName (note)"
        // Example: "MM Great Bay Coast Gossip    MM Road to Ikana Stone Mask    Mask of Scents (not required)"
        // Checks with multiple items (dual hints) span several lines under the
        // same gossip stone:
        // "                                Romani Ranch Aliens    Item1 (sometimes required)"
        // "                                Romani Ranch Cremia Escort    Item2 (sometimes required)"
        // Continuation lines (no gossip stone):
        // "                                CheckLocation (2+ spaces) ItemName (note)"
        const spaceParts = splitByDoubleSpaces(trimmed);

        let gossipStone: string | undefined;
        let checkLocation: string;
        let itemField: string;
        let isNewHint = false;

        if (spaceParts.length >= 3) {
          // Full line: gossip stone + check location + item
          gossipStone = spaceParts[0];
          lastGossipStone = gossipStone;
          // A stone's hint may continue on the next lines (dual hints), so
          // only the first line of each stone starts a new hint.
          isNewHint = gossipStone !== lastSpecificStone;
          lastSpecificStone = gossipStone;
          checkLocation = spaceParts[1];
          itemField = spaceParts[spaceParts.length - 1];
        } else if (spaceParts.length === 2 && lastGossipStone) {
          // Continuation line: check location + item (carry over gossip stone)
          checkLocation = spaceParts[0];
          itemField = spaceParts[1];
        } else {
          break;
        }

        const { itemName } = parseItemField(itemField);

        if (checkLocation && itemName) {
          hints.push({
            type: 'item-exact',
            checkLocation,
            itemName,
          });

          if (isNewHint) {
            const dedupKey = `${checkLocation}:${itemName}`;
            if (!byCategory['item-exact'].has(dedupKey)) {
              byCategory['item-exact'].add(dedupKey);
              availableCheckLocations.add(checkLocation);
            }
          }
        }
        break;
      }
      case 'regional': {
        // Format: "GossipStoneName (2+ spaces) RegionName (2+ spaces) ItemName (note)"
        // Example: "MM Doggy Racetrack Gossip    Ikana Graveyard    Shared Ice Arrows (sometimes required)"
        // Moon Trial entries (GossipStone starts with "MM Moon Trial"):
        //   "MM Moon Trial Deku Gossip Back    Stone Tower Temple    Bunny Hood (not required)"
        const spaceParts = splitByDoubleSpaces(trimmed);

        let gossipStone: string | undefined;
        let region: string;
        let itemField: string;

        if (spaceParts.length >= 3) {
          // Full line: gossip stone + region + item
          gossipStone = spaceParts[0];
          lastGossipStone = gossipStone;
          region = spaceParts[1];
          itemField = spaceParts[spaceParts.length - 1];
        } else if (spaceParts.length === 2 && lastGossipStone) {
          // Continuation line
          region = spaceParts[0];
          itemField = spaceParts[1];
        } else {
          break;
        }

        const { itemName } = parseItemField(itemField);

        if (region && itemName) {
          const isMoonTrial = (gossipStone ?? lastGossipStone ?? '')
            .toLowerCase()
            .includes('moon trial');

          if (isMoonTrial) {
            hints.push({
              type: 'moon',
              region,
              itemName,
            });
            const dedupKey = `${region}:${itemName}`;
            if (!byCategory['moon'].has(dedupKey)) {
              byCategory['moon'].add(dedupKey);
              availableRegionsForMoon.add(region);
            }
          } else {
            hints.push({
              type: 'item-region',
              region,
              itemName,
            });
            const dedupKey = `${region}:${itemName}`;
            if (!byCategory['item-region'].has(dedupKey)) {
              byCategory['item-region'].add(dedupKey);
              availableRegionsForRegion.add(region);
            }
          }
        }
        break;
      }
      case 'foolish-regions': {
        // Format: "Region Name: count"
        // This is metadata showing how many gossip stones point to each region.
        // It's NOT individual hints, so we only track for UI filtering.
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const regionName = trimmed.slice(0, colonIdx).trim();
          availableRegionsForFoolish.add(regionName);
        }
        break;
      }
    }
  }

  return {
    hints,
    byCategory,
    availablePathSubTypes,
    availablePathSubIds,
    availableCheckLocations,
    availableRegionsForPath,
    availableRegionsForFoolish,
    availableRegionsForRegion,
    availableRegionsForMoon,
  };
}

/**
 * Get the expected hint counts per category from parsed spoiler data,
 * excluding duplicate entries (same content appears on multiple gossip stones).
 */
export function getExpectedHintCounts(
  parsed: ParsedHintsData,
): Record<HintCategory, number> {
  return {
    path: parsed.byCategory.path.size,
    foolish: parsed.byCategory.foolish.size,
    'item-exact': parsed.byCategory['item-exact'].size,
    'item-region': parsed.byCategory['item-region'].size,
    moon: parsed.byCategory.moon.size,
  };
}
