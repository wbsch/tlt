/**
 * Mapping from OoT scene IDs (from the save context) to tracker map IDs.
 * These map IDs correspond to the JSON files in ../data/maps/.
 */
export const OOT_SCENE_TO_MAP: Record<number, string> = {
  0: 'oot_deku_tree', // OOT_DEKU_TREE
  1: 'oot_dodongos_cavern', // OOT_DODONGO_CAVERN
  2: 'oot_jabu_jabu', // OOT_INSIDE_JABU_JABU
  3: 'oot_forest_temple', // OOT_TEMPLE_FOREST
  4: 'oot_fire_temple', // OOT_TEMPLE_FIRE
  5: 'oot_water_temple', // OOT_TEMPLE_WATER
  6: 'oot_spirit_temple', // OOT_TEMPLE_SPIRIT
  7: 'oot_shadow_temple', // OOT_TEMPLE_SHADOW
  8: 'oot_bottom_of_the_well', // OOT_BOTTOM_OF_THE_WELL
  9: 'oot_ice_cavern', // OOT_ICE_CAVERN
  10: 'oot_ganons_castle', // OOT_GANON_TOWER
  11: 'oot_gerudo_training_ground', // OOT_GERUDO_TRAINING_GROUND
  12: 'oot_gerudo_desert', // OOT_THIEVES_HIDEOUT
  13: 'oot_ganons_castle', // OOT_INSIDE_GANON_CASTLE
  14: 'oot_ganons_castle', // OOT_GANON_TOWER_COLLAPSING
  15: 'oot_ganons_castle', // OOT_INSIDE_GANON_CASTLE_COLLAPSING
  27: 'oot_hyrule_field', // OOT_MARKET_ENTRANCE_CHILD_DAY
  28: 'oot_hyrule_field', // OOT_MARKET_ENTRANCE_CHILD_NIGHT
  29: 'oot_hyrule_field', // OOT_MARKET_ENTRANCE_ADULT
  30: 'oot_hyrule_field', // OOT_BACK_ALLEY_DAY
  31: 'oot_hyrule_field', // OOT_BACK_ALLEY_NIGHT
  32: 'oot_hyrule_field', // OOT_MARKET_CHILD_DAY
  33: 'oot_hyrule_field', // OOT_MARKET_CHILD_NIGHT
  34: 'oot_hyrule_field', // OOT_MARKET_ADULT
  35: 'oot_hyrule_field', // OOT_TEMPLE_OF_TIME_EXTERIOR_CHILD_DAY
  36: 'oot_hyrule_field', // OOT_TEMPLE_OF_TIME_EXTERIOR_CHILD_NIGHT
  37: 'oot_hyrule_field', // OOT_TEMPLE_OF_TIME_EXTERIOR_ADULT
  69: 'oot_hyrule_field', // OOT_CASTLE_MAZE_DAY
  70: 'oot_hyrule_field', // OOT_CASTLE_MAZE_NIGHT
  74: 'oot_hyrule_field', // OOT_CASTLE_COURTYARD
  79: 'oot_ganons_castle', // OOT_GANON_BATTLE_ARENA
  81: 'oot_hyrule_field', // OOT_HYRULE_FIELD
  82: 'oot_kakariko', // OOT_KAKARIKO_VILLAGE
  83: 'oot_kakariko', // OOT_GRAVEYARD
  84: 'oot_zoras_river', // OOT_ZORA_RIVER
  85: 'oot_kokiri_forest', // OOT_KOKIRI_FOREST
  86: 'oot_kokiri_forest', // OOT_SACRED_FOREST_MEADOW
  87: 'oot_zoras_river', // OOT_LAKE_HYLIA
  88: 'oot_zoras_river', // OOT_ZORA_DOMAIN
  89: 'oot_zoras_river', // OOT_ZORA_FOUNTAIN
  90: 'oot_gerudo_desert', // OOT_GERUDO_VALLEY
  91: 'oot_kokiri_forest', // OOT_LOST_WOODS
  92: 'oot_gerudo_desert', // OOT_DESERT_COLOSSUS
  93: 'oot_gerudo_desert', // OOT_GERUDO_FORTRESS
  94: 'oot_gerudo_desert', // OOT_HAUNTED_WASTELAND
  95: 'oot_hyrule_field', // OOT_HYRULE_CASTLE
  96: 'oot_death_mountain', // OOT_DEATH_MOUNTAIN_TRAIL
  97: 'oot_death_mountain', // OOT_DEATH_MOUNTAIN_CRATER
  98: 'oot_death_mountain', // OOT_GORON_CITY
  99: 'oot_hyrule_field', // OOT_LON_LON_RANCH
  100: 'oot_hyrule_field', // OOT_GANON_CASTLE_EXTERIOR
};

/**
 * Mapping from MM scene IDs (from the live play state) to tracker map IDs.
 * These map IDs correspond to the JSON files in ../data/maps/.
 */
export const MM_SCENE_TO_MAP: Record<number, string> = {
  0: 'mm_southern_swamp', // MM_SOUTHERN_SWAMP_CLEAR
  19: 'mm_ikana_canyon', // MM_IKANA_CANYON
  20: 'mm_pirate_fortress', // MM_PIRATE_FORTRESS_EXTERIOR
  22: 'mm_stone_tower_temple', // MM_TEMPLE_STONE_TOWER
  24: 'mm_stone_tower_temple', // MM_TEMPLE_STONE_TOWER_INVERTED
  27: 'mm_woodfall_temple', // MM_TEMPLE_WOODFALL
  28: 'mm_termina_field', // MM_PATH_MOUNTAIN_VILLAGE
  29: 'mm_ikana_castle', // MM_CASTLE_IKANA
  33: 'mm_snowhead_temple', // MM_SNOWHEAD (summit)
  34: 'mm_termina_field', // MM_MILK_ROAD
  42: 'mm_moon', // MM_MOON_DEKU
  45: 'mm_termina_field', // MM_TERMINA_FIELD_OPENING
  50: 'mm_mountain_village', // MM_GORON_SHRINE
  53: 'mm_romani_ranch', // MM_ROMANI_RANCH
  55: 'mm_great_bay', // MM_GREAT_BAY_COAST
  56: 'mm_great_bay', // MM_ZORA_CAPE
  59: 'mm_pirate_fortress', // MM_PIRATE_FORTRESS_ENTRANCE
  63: 'mm_moon', // MM_MOON (other areas)
  64: 'mm_termina_field', // MM_ROAD_SOUTHERN_SWAMP
  67: 'mm_ikana_canyon', // MM_IKANA_GRAVEYARD
  69: 'mm_southern_swamp', // MM_SOUTHERN_SWAMP
  70: 'mm_southern_swamp', // MM_WOODFALL (preamble)
  71: 'mm_moon', // MM_MOON (trial)
  72: 'mm_mountain_village', // MM_MOUNTAIN_VILLAGE_SPRING
  73: 'mm_great_bay_temple', // MM_GREAT_BAY_TEMPLE
  75: 'mm_beneath_the_well', // MM_BENEATH_THE_WELL
  76: 'mm_great_bay', // MM_ZORA_HALL_ROOMS
  77: 'mm_mountain_village', // MM_MOUNTAIN_VILLAGE_WINTER
  80: 'mm_mountain_village', // MM_MOUNTAIN_VILLAGE_WINTER
  82: 'mm_southern_swamp', // MM_DEKU_SHRINE (in Ikana)
  83: 'mm_termina_field', // MM_ROAD_IKANA
  88: 'mm_stone_tower_temple', // MM_STONE_TOWER
  89: 'mm_stone_tower_temple', // MM_STONE_TOWER_INVERTED
  90: 'mm_mountain_village', // MM_MOUNTAIN_VILLAGE_SPRING
  91: 'mm_mountain_village', // MM_PATH_SNOWHEAD
  92: 'mm_mountain_village', // MM_SNOWHEAD (temple exterior)
  93: 'mm_mountain_village', // MM_TWIN_ISLANDS_WINTER
  94: 'mm_mountain_village', // MM_TWIN_ISLANDS_SPRING
  96: 'mm_secret_shrine', // MM_SECRET_SHRINE
  98: 'mm_great_bay', // MM_GREAT_BAY_CUTSCENE
  100: 'mm_southern_swamp', // MM_WOODS_MYSTERY (alt)
  102: 'mm_moon', // MM_MOON_LINK
  103: 'mm_moon', // MM_MOON (main)
  106: 'mm_romani_ranch', // MM_GORMAN_TRACK
  107: 'mm_mountain_village', // MM_GORON_RACETRACK
  108: 'mm_termina_field', // MM_CLOCK_TOWN_EAST
  109: 'mm_termina_field', // MM_CLOCK_TOWN_WEST
  110: 'mm_termina_field', // MM_CLOCK_TOWN_NORTH
  111: 'mm_termina_field', // MM_CLOCK_TOWN_SOUTH
  112: 'mm_termina_field', // MM_LAUNDRY_POOL
};

/**
 * Default map to show when autotracking is active for a given game
 * but no specific scene mapping is found.
 */
export const DEFAULT_MAP_FOR_GAME: Record<string, string> = {
  OoT: 'oot_hyrule_field',
  MM: 'mm_termina_field',
};
