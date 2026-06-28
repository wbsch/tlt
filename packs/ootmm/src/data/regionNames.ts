// ── Human-readable region names for OoTMM ──
// Maps internal region IDs (e.g. "OOT_KOKIRI_FOREST") to display names

// Exclude NONE (0x00), NAMELESS (0xfe), POCKET (0xff)
const REGION_DISPLAY_NAMES: Record<string, string> = {
  // OoT Regions
  OOT_SACRED_REALM: 'Sacred Realm',
  OOT_DEKU_TREE: 'Deku Tree',
  OOT_DODONGO_CAVERN: "Dodongo's Cavern",
  OOT_JABU_JABU: "Jabu-Jabu's Belly",
  OOT_TEMPLE_FOREST: 'Forest Temple',
  OOT_TEMPLE_FIRE: 'Fire Temple',
  OOT_TEMPLE_WATER: 'Water Temple',
  OOT_TEMPLE_SPIRIT: 'Spirit Temple',
  OOT_TEMPLE_SHADOW: 'Shadow Temple',
  OOT_BOTTOM_OF_THE_WELL: 'Bottom of the Well',
  OOT_ICE_CAVERN: 'Ice Cavern',
  OOT_GERUDO_TRAINING_GROUNDS: "Gerudo's Training Ground",
  OOT_THIEVES_HIDEOUT: "Thieves' Hideout",
  OOT_GANON_CASTLE: "Ganon's Castle",
  OOT_KOKIRI_FOREST: 'Kokiri Forest',
  OOT_HYRULE_FIELD: 'Hyrule Field',
  OOT_MARKET: 'Market',
  OOT_LON_LON_RANCH: 'Lon Lon Ranch',
  OOT_HYRULE_CASTLE: 'Hyrule Castle',
  OOT_GANON_CASTLE_EXTERIOR: "Outside Ganon's Castle",
  OOT_LOST_WOODS: 'Lost Woods',
  OOT_SACRED_MEADOW: 'Sacred Forest Meadow',
  OOT_KAKARIKO: 'Kakariko',
  OOT_GRAVEYARD: 'Graveyard',
  OOT_DEATH_MOUNTAIN_TRAIL: 'Death Mountain Trail',
  OOT_DEATH_MOUNTAIN_CRATER: 'Death Mountain Crater',
  OOT_GORON_CITY: 'Goron City',
  OOT_ZORA_RIVER: "Zora's River",
  OOT_ZORA_DOMAIN: "Zora's Domain",
  OOT_ZORA_FOUNTAIN: "Zora's Fountain",
  OOT_LAKE_HYLIA: 'Lake Hylia',
  OOT_TEMPLE_OF_TIME: 'Temple of Time',
  OOT_GERUDO_VALLEY: 'Gerudo Valley',
  OOT_GERUDO_FORTRESS: "Gerudo's Fortress",
  OOT_HAUNTED_WASTELAND: 'Haunted Wasteland',
  OOT_DESERT_COLOSSUS: 'Desert Colossus',
  OOT_EGGS: 'Eggs',
  OOT_GANON_CASTLE_TOWER: "Ganon's Castle Tower",

  // MM Regions
  MM_TEMPLE_WOODFALL: 'Woodfall Temple',
  MM_TEMPLE_SNOWHEAD: 'Snowhead Temple',
  MM_TEMPLE_GREAT_BAY: 'Great Bay Temple',
  MM_TEMPLE_STONE_TOWER: 'Stone Tower Temple',
  MM_CLOCK_TOWN_SOUTH: 'South Clock Town',
  MM_CLOCK_TOWN_NORTH: 'North Clock Town',
  MM_CLOCK_TOWN_EAST: 'East Clock Town',
  MM_CLOCK_TOWN_WEST: 'West Clock Town',
  MM_LAUNDRY_POOL: 'Laundry Pool',
  MM_GIANT_DREAM: "Giant's Dream",
  MM_CLOCK_TOWER_ROOFTOP: 'Clock Tower Roof',
  MM_STOCK_POT_INN: 'Stock Pot Inn',
  MM_TERMINA_FIELD: 'Termina Field',
  MM_ROAD_TO_SWAMP: 'Road to Southern Swamp',
  MM_SOUTHERN_SWAMP: 'Southern Swamp',
  MM_DEKU_PALACE: 'Deku Palace',
  MM_WOODFALL: 'Woodfall',
  MM_PATH_TO_MOUNTAIN_VILLAGE: 'Path to Mountain Village',
  MM_MOUNTAIN_VILLAGE: 'Mountain Village',
  MM_PATH_TO_SNOWHEAD: 'Road to Snowhead',
  MM_TWIN_ISLANDS: 'Twin Islands',
  MM_GORON_VILLAGE: 'Goron Village',
  MM_SNOWHEAD: 'Snowhead',
  MM_MILK_ROAD: 'Milk Road',
  MM_ROMANI_RANCH: 'Romani Ranch',
  MM_GREAT_BAY_COAST: 'Great Bay Coast',
  MM_PIRATE_FORTRESS_EXTERIOR: "Pirates' Fortress Exterior",
  MM_PIRATE_FORTRESS_SEWERS: "Pirates' Fortress Sewers",
  MM_PIRATE_FORTRESS_INTERIOR: "Pirates' Fortress Interior",
  MM_ZORA_CAPE: 'Zora Cape',
  MM_ZORA_HALL: 'Zora Hall',
  MM_PINNACLE_ROCK: 'Pinnacle Rock',
  MM_ROAD_TO_IKANA: 'Road to Ikana',
  MM_IKANA_GRAVEYARD: 'Ikana Graveyard',
  MM_IKANA_CANYON: 'Ikana Canyon',
  MM_IKANA_CASTLE: 'Ikana Castle',
  MM_BENEATH_THE_WELL: 'Beneath the Well',
  MM_SECRET_SHRINE: 'Secret Shrine',
  MM_STONE_TOWER: 'Stone Tower',
  MM_MOON: 'The Moon',
  MM_SPIDER_HOUSE_SWAMP: 'Swamp Spider House',
  MM_SPIDER_HOUSE_OCEAN: 'Ocean Spider House',
  MM_TINGLE: 'Tingle',
  MM_TEMPLE_STONE_TOWER_INVERTED: 'Inverted Stone Tower Temple',
  MM_BUTLER_RACE: 'Butler Race',
  MM_GORON_RACETRACK: 'Goron Racetrack',
};

/** Get the display name for a region ID (e.g. "OOT_KOKIRI_FOREST" → "Kokiri Forest") */
export function getRegionDisplayName(regionId: string): string {
  return REGION_DISPLAY_NAMES[regionId] ?? regionId;
}

/** All region IDs that can be selected in comboboxes (excludes NONE, NAMELESS, POCKET) */
export const SELECTABLE_REGION_IDS = Object.keys(REGION_DISPLAY_NAMES);

/** Build an array of { value: regionId, label: displayName } for combobox use */
export function getRegionOptions(): Array<{ value: string; label: string }> {
  return SELECTABLE_REGION_IDS.map((id) => ({
    value: id,
    label: getRegionDisplayName(id),
  })).sort((a, b) => a.label.localeCompare(b.label));
}
