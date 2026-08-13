// ── Always and Sometimes Hint Check Locations ──
// Based on defs/hints.yml in the OoTMM data package
// Display names match the ROM: OoTMM packages/generator/src/common/text/text.c
// (kCheckNamesOot / kCheckNamesMm, indexed by the check IDs from hints.yml)

import type { HintCheckDef } from './hintTypes';

export const ALWAYS_HINT_CHECKS: HintCheckDef[] = [
  {
    id: 'OOT_FROGS_FINAL',
    locationName: 'the Frogs Ocarina Game',
    locationCodes: [],
  },
  {
    id: 'MM_RANCH_DEFENSE',
    locationName: 'the Ranch Defense',
    locationCodes: [],
    itemCount: 2, // Romani Ranch Aliens + Romani Ranch Cremia Escort
  },
  {
    id: 'MM_BUTLER_RACE',
    locationName: 'the Butler Race',
    locationCodes: [],
  },
  {
    id: 'MM_COUPLE_MASK',
    locationName: 'Anju and Kafei',
    locationCodes: [],
  },
  {
    id: 'MM_DON_GERO_CHOIR',
    locationName: "Don Gero's Choir",
    locationCodes: [],
  },
  {
    id: 'MM_GORON_RACE',
    locationName: 'the Goron Race',
    locationCodes: [],
  },
  {
    id: 'MM_GRAVEYARD_NIGHT3',
    locationName: 'the Beneath the Graveyard Night 3 Chest',
    locationCodes: [],
  },
  {
    id: 'MM_SONGS_GOSSIPS',
    locationName: 'the Termina Field Musical Stones',
    locationCodes: [],
  },
  {
    id: 'OOT_COW_LINK',
    locationName: "the Cow in Link's house",
    locationCodes: [],
  },
  {
    id: 'MM_LOTTERY',
    locationName: 'winning the Lottery',
    locationCodes: [],
    itemCount: 3, // Prize Night 1 / 2 / 3
  },
];

export const SOMETIMES_HINT_CHECKS: HintCheckDef[] = [
  {
    id: 'OOT_FISHING',
    locationName: 'Fishing',
    locationCodes: [],
    itemCount: 2, // Fishing Pond Child + Adult
  },
  {
    id: 'OOT_RAVAGED_VILLAGE',
    locationName: 'a Ravaged Village',
    locationCodes: [],
  },
  {
    id: 'OOT_ZORA_KING',
    locationName: 'King Zora',
    locationCodes: [],
    itemCount: 2, // Zora Domain Tunic + Eyeball Frog
  },
  {
    id: 'OOT_GANON_FAIRY',
    locationName: "the Great Fairy outside of Ganon's Castle",
    locationCodes: [],
  },
  {
    id: 'OOT_TEMPLE_FIRE_HAMMER',
    locationName: 'the Fire Temple Hammer Chest',
    locationCodes: [],
  },
  {
    id: 'OOT_TEMPLE_FIRE_SCARECROW',
    locationName: 'the Fire Temple Scarecrow Chest',
    locationCodes: [],
  },
  {
    id: 'OOT_GTG_WATER',
    locationName: 'the Gerudo Training Grounds Water Room',
    locationCodes: [],
  },
  {
    id: 'OOT_HAUNTED_WASTELAND',
    locationName: 'the Haunted Wastelands Chest',
    locationCodes: [],
  },
  {
    id: 'OOT_GERUDO_ARCHERY',
    locationName: 'the Gerudo Archery',
    locationCodes: [],
    itemCount: 2, // Archery Reward 1 + 2
  },
  {
    id: 'OOT_BIGGORON',
    locationName: 'Biggoron',
    locationCodes: [],
    itemCount: 3, // Prescription + Claim Check + Biggoron Sword
  },
  {
    id: 'OOT_ICE_CAVERN_CHEST',
    locationName: 'the Ice Cavern Final Chest',
    locationCodes: [],
    itemCount: 2, // Iron Boots + Sheik Song (normal or MQ version per seed)
  },
  {
    id: 'OOT_TREASURE_GAME',
    locationName: 'the Market Treasure Game',
    locationCodes: [],
  },
  {
    id: 'OOT_SHOOT_SUN',
    locationName: 'Shooting at the Sun',
    locationCodes: [],
  },
  {
    id: 'OOT_FOREST_FLOORMASTER',
    locationName: 'the Floormaster in the Forest Temple',
    locationCodes: [],
  },
  {
    id: 'OOT_SHADOW_SKULL_POT',
    locationName: 'bombing a fiery skull pot',
    locationCodes: [],
  },
  {
    id: 'OOT_MQ_SHADOW_STALFOS',
    locationName: 'a Stalfos duel near spikes',
    locationCodes: [],
  },
  {
    id: 'OOT_WATER_RIVER',
    locationName: 'the Water Temple River chest',
    locationCodes: [],
  },
  {
    id: 'OOT_LOST_WOODS_TRADE',
    locationName: 'trading a bird and a mixture in the Lost Woods',
    locationCodes: [],
    itemCount: 2, // Odd Mushroom + Poacher's Saw
  },
  {
    id: 'OOT_JABU_BOOMERANG',
    locationName: "Stingers in Jabu-Jabu's Belly",
    locationCodes: [],
  },
  {
    id: 'OOT_MQ_SPIRIT_SYMPHONY',
    locationName: 'playing a symphony in Spirit Temple',
    locationCodes: [],
  },
  {
    id: 'OOT_MQ_DEKU_TIME_BLOCK',
    locationName: 'a chest hidden by a time block in Deku Tree',
    locationCodes: [],
  },
  {
    id: 'MM_BANK_3',
    locationName: "the Bank's Final Reward",
    locationCodes: [],
  },
  {
    id: 'MM_SOUND_CHECK',
    locationName: 'the Milk Bar Performance',
    locationCodes: [],
  },
  {
    id: 'MM_BOAT_ARCHERY',
    locationName: 'the Boat Archery',
    locationCodes: [],
  },
  {
    id: 'MM_OSH_CHEST',
    locationName: 'the Ocean Spider House Chest',
    locationCodes: [],
  },
  {
    id: 'MM_PINNACLE_ROCK_HP',
    locationName: 'the Pinnacle Rock Seahorses',
    locationCodes: [],
  },
  {
    id: 'MM_FISHERMAN_GAME',
    locationName: "the Fisherman's Game",
    locationCodes: [],
  },
  {
    id: 'MM_SONG_ELEGY',
    locationName: 'Igos du Ikana',
    locationCodes: [],
  },
  {
    id: 'MM_SECRET_SHRINE_WART_HP',
    locationName: 'the Secret Shrine Wart and Final Chest',
    locationCodes: [],
    itemCount: 2, // Wart Chest + HP Chest
  },
  {
    id: 'MM_BLACKSMITH',
    locationName: 'the Blacksmith',
    locationCodes: [],
    itemCount: 2, // Razor Blade + Gilded Sword
  },
  {
    id: 'MM_MIDNIGHT_MEETING',
    locationName: 'the Midnight Meeting',
    locationCodes: [],
  },
  {
    id: 'MM_MADAME_AROMA_BAR',
    locationName: 'Madame Aroma in the Bar',
    locationCodes: [],
  },
  {
    id: 'MM_CUCCOS',
    locationName: 'Marching for Cuccos',
    locationCodes: [],
  },
  {
    id: 'MM_KAFEI',
    locationName: 'Finding Kafei',
    locationCodes: [],
    itemCount: 3, // Pendant of Memories + Owner Reward 1 + Owner Reward 2
  },
  {
    id: 'MM_INVISIBLE_SOLDIER',
    locationName: 'an Invisible Soldier',
    locationCodes: [],
  },
  {
    id: 'MM_GBT_ICE_ARROW',
    locationName: 'the Great Bay Temple Wart',
    locationCodes: [],
  },
  {
    id: 'MM_SHT_BOSS_KEY',
    locationName: 'the second Snowhead Wizzrobe',
    locationCodes: [],
  },
  {
    id: 'MM_WFT_BOSS_KEY',
    locationName: 'the Woodfall Temple Gekko',
    locationCodes: [],
  },
  {
    id: 'MM_ISTT_BOSS_KEY',
    locationName: 'defeating Gomess',
    locationCodes: [],
  },
  {
    id: 'MM_HUNGRY_GORON',
    locationName: 'feeding a freezing Goron',
    locationCodes: [],
  },
  {
    id: 'MM_KAMARO',
    locationName: 'healing Kamaro',
    locationCodes: [],
  },
  // Conditional:
  // OOT_DMC_SCRUB (scrubShuffleOot)
  // OOT_DEKU_BACK_SKULL (goldSkulltulaTokens != none)
  // MM_COW_WELL (cowShuffleMm)
  // MM_WFT_DARK (strayFairyChestShuffle != none)
];

/** Build a lookup map from hint check ID → HintCheckDef */
export function buildHintCheckMap(
  checks: HintCheckDef[],
): Map<string, HintCheckDef> {
  return new Map(checks.map((c) => [c.id, c]));
}

/** Find a HintCheckDef by its ID in either always or sometimes list */
export function findHintCheckById(id: string): HintCheckDef | undefined {
  return (
    ALWAYS_HINT_CHECKS.find((c) => c.id === id) ??
    SOMETIMES_HINT_CHECKS.find((c) => c.id === id)
  );
}
