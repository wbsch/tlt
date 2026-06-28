// ── Hint Spoiler Log Analysis ──
// Parses the raw "Hints" section from a spoiler log and provides
// structured data for the Hint Tracker.

import type { PathSubType, ParsedSpoilerHint } from '../data/hintTypes';

export type HintCategory = 'path' | 'foolish' | 'item-exact' | 'item-region';

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
};

/** Parse the raw Hints section text from a spoiler log */
export function parseSpoilerHints(hintsText: string): ParsedHintsData {
  const hints: ParsedSpoilerHint[] = [];
  const byCategory: Record<HintCategory, Set<string>> = {
    path: new Set(),
    foolish: new Set(),
    'item-exact': new Set(),
    'item-region': new Set(),
  };
  const availablePathSubTypes = new Set<PathSubType>();
  const availablePathSubIds: Partial<Record<PathSubType, Set<number>>> = {};
  const availableCheckLocations = new Set<string>();
  const availableRegionsForPath = new Set<string>();
  const availableRegionsForFoolish = new Set<string>();
  const availableRegionsForRegion = new Set<string>();

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
        // Format: "MM Ikana Canyon Gossip Upper" (a gossip stone location)
        // Or "East Clock Town" (a region name in the foolish section)

        // Check if it looks like a region name (no "Gossip" in it)
        if (!trimmed.toLowerCase().includes('gossip')) {
          // This is a region name for a foolish hint
          hints.push({
            type: 'foolish',
            region: trimmed,
          });
          byCategory['foolish'].add(trimmed);
          availableRegionsForFoolish.add(trimmed);
        }
        break;
      }
      case 'specific': {
        // Format: "MM Gossip Location: MM Check Location: Item Name (note)"
        // Example: "MM Great Bay Coast Gossip: MM Road to Ikana Stone Mask: Mask of Scents (not required)"
        const parts = trimmed.split(':');
        if (parts.length < 2) break;

        // The last part is the item, the second-to-last is the check location
        const lastPart = parts[parts.length - 1].trim();
        const checkLocation =
          parts.length >= 3 ? parts[parts.length - 2].trim() : '';
        const itemName = lastPart.replace(/\s*\([^)]*\)\s*$/, '').trim();

        if (checkLocation) {
          hints.push({
            type: 'item-exact',
            checkLocation,
            itemName: itemName || undefined,
          });

          const dedupKey = `${checkLocation}:${itemName}`;
          if (!byCategory['item-exact'].has(dedupKey)) {
            byCategory['item-exact'].add(dedupKey);
            availableCheckLocations.add(checkLocation);
          }
        }
        break;
      }
      case 'regional': {
        // Format: "MM Gossip Location: Region Name: Item Name (note)"
        // Example: "MM Doggy Racetrack Gossip: Ikana Graveyard: Shared Ice Arrows (sometimes required)"
        const parts = trimmed.split(':');
        if (parts.length < 2) break;

        // Second-to-last is the region, last is the item
        const region = parts.length >= 3 ? parts[parts.length - 2].trim() : '';
        const lastPart = parts[parts.length - 1].trim();
        const itemName = lastPart.replace(/\s*\([^)]*\)\s*$/, '').trim();

        if (region) {
          hints.push({
            type: 'item-region',
            region,
            itemName: itemName || undefined,
          });

          const dedupKey = `${region}:${itemName}`;
          if (!byCategory['item-region'].has(dedupKey)) {
            byCategory['item-region'].add(dedupKey);
            availableRegionsForRegion.add(region);
          }
        }
        break;
      }
      case 'foolish-regions': {
        // Format: "Region Name: count"
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const regionName = trimmed.slice(0, colonIdx).trim();
          hints.push({
            type: 'foolish',
            region: regionName,
          });
          byCategory['foolish'].add(regionName);
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
  };
}
