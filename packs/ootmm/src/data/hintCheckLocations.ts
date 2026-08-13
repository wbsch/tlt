// ── Always and Sometimes Hint Check Locations ──
// Based on defs/hints.yml in the OoTMM data package
// Display names match the ROM: OoTMM packages/generator/src/common/text/text.c
// (kCheckNamesOot / kCheckNamesMm, indexed by the check IDs from hints.yml)

import type { HintCheckDef } from './hintTypes';

export const ALWAYS_HINT_CHECKS: HintCheckDef[] = [
  {
    id: 'OOT_FROGS_FINAL',
    locationName: 'the Frogs Ocarina Game',
    locationCodes: ['OOT Zora River Frogs Game'],
  },
  {
    id: 'MM_RANCH_DEFENSE',
    locationName: 'the Ranch Defense',
    locationCodes: ['MM Romani Ranch Aliens', 'MM Romani Ranch Cremia Escort'],
    itemCount: 2, // Romani Ranch Aliens + Romani Ranch Cremia Escort
  },
  {
    id: 'MM_BUTLER_RACE',
    locationName: 'the Butler Race',
    locationCodes: ['MM Deku Shrine Mask of Scents'],
  },
  {
    id: 'MM_COUPLE_MASK',
    locationName: 'Anju and Kafei',
    locationCodes: ["MM Stock Pot Inn Couple's Mask"],
  },
  {
    id: 'MM_DON_GERO_CHOIR',
    locationName: "Don Gero's Choir",
    locationCodes: ['MM Mountain Village Frog Choir HP'],
  },
  {
    id: 'MM_GORON_RACE',
    locationName: 'the Goron Race',
    locationCodes: ['MM Goron Race Reward'],
  },
  {
    id: 'MM_GRAVEYARD_NIGHT3',
    locationName: 'the Beneath the Graveyard Night 3 Chest',
    locationCodes: ['MM Beneath The Graveyard Dampe Chest'],
  },
  {
    id: 'MM_SONGS_GOSSIPS',
    locationName: 'the Termina Field Musical Stones',
    locationCodes: ['MM Termina Field Gossip Stones HP'],
  },
  {
    id: 'OOT_COW_LINK',
    locationName: "the Cow in Link's house",
    locationCodes: ['OOT Kokiri Forest Cow'],
  },
  {
    id: 'MM_LOTTERY',
    locationName: 'winning the Lottery',
    locationCodes: [
      'MM Lottery Prize Night 1',
      'MM Lottery Prize Night 2',
      'MM Lottery Prize Night 3',
    ],
    itemCount: 3, // Prize Night 1 / 2 / 3
  },
];

export const SOMETIMES_HINT_CHECKS: HintCheckDef[] = [
  {
    id: 'OOT_FISHING',
    locationName: 'Fishing',
    locationCodes: ['OOT Fishing Pond Child', 'OOT Fishing Pond Adult'],
    itemCount: 2, // Fishing Pond Child + Adult
  },
  {
    id: 'OOT_RAVAGED_VILLAGE',
    locationName: 'a Ravaged Village',
    locationCodes: ['OOT Kakariko Song Shadow'],
  },
  {
    id: 'OOT_ZORA_KING',
    locationName: 'King Zora',
    locationCodes: ['OOT Zora Domain Tunic', 'OOT Zora Domain Eyeball Frog'],
    itemCount: 2, // Zora Domain Tunic + Eyeball Frog
  },
  {
    id: 'OOT_GANON_FAIRY',
    locationName: "the Great Fairy outside of Ganon's Castle",
    locationCodes: ['OOT Great Fairy Defense Upgrade'],
  },
  {
    id: 'OOT_TEMPLE_FIRE_HAMMER',
    locationName: 'the Fire Temple Hammer Chest',
    locationCodes: ['OOT Fire Temple Hammer'],
  },
  {
    id: 'OOT_TEMPLE_FIRE_SCARECROW',
    locationName: 'the Fire Temple Scarecrow Chest',
    locationCodes: ['OOT Fire Temple Scarecrow Chest'],
  },
  {
    id: 'OOT_GTG_WATER',
    locationName: 'the Gerudo Training Grounds Water Room',
    locationCodes: ['OOT Gerudo Training Water'],
  },
  {
    id: 'OOT_HAUNTED_WASTELAND',
    locationName: 'the Haunted Wastelands Chest',
    locationCodes: ['OOT Haunted Wasteland Chest'],
  },
  {
    id: 'OOT_GERUDO_ARCHERY',
    locationName: 'the Gerudo Archery',
    locationCodes: [
      'OOT Gerudo Fortress Archery Reward 1',
      'OOT Gerudo Fortress Archery Reward 2',
    ],
    itemCount: 2, // Archery Reward 1 + 2
  },
  {
    id: 'OOT_BIGGORON',
    locationName: 'Biggoron',
    locationCodes: [
      'OOT Death Mountain Trail Prescription',
      'OOT Death Mountain Trail Claim Check',
      'OOT Death Mountain Trail Biggoron Sword',
    ],
    itemCount: 3, // Prescription + Claim Check + Biggoron Sword
  },
  {
    id: 'OOT_ICE_CAVERN_CHEST',
    locationName: 'the Ice Cavern Final Chest',
    locationCodes: [
      'OOT Ice Cavern Iron Boots',
      'OOT Ice Cavern Sheik Song',
      'OOT MQ Ice Cavern Iron Boots',
      'OOT MQ Ice Cavern Sheik Song',
    ],
    itemCount: 2, // Iron Boots + Sheik Song (normal or MQ version per seed)
  },
  {
    id: 'OOT_TREASURE_GAME',
    locationName: 'the Market Treasure Game',
    locationCodes: ['OOT Treasure Chest Game HP'],
  },
  {
    id: 'OOT_SHOOT_SUN',
    locationName: 'Shooting at the Sun',
    locationCodes: ['OOT Lake Hylia Fire Arrow'],
  },
  {
    id: 'OOT_FOREST_FLOORMASTER',
    locationName: 'the Floormaster in the Forest Temple',
    locationCodes: ['OOT Forest Temple Floormaster'],
  },
  {
    id: 'OOT_SHADOW_SKULL_POT',
    locationName: 'bombing a fiery skull pot',
    locationCodes: ['OOT Shadow Temple Skull'],
  },
  {
    id: 'OOT_MQ_SHADOW_STALFOS',
    locationName: 'a Stalfos duel near spikes',
    locationCodes: ['OOT MQ Shadow Temple Stalfos Room Chest'],
  },
  {
    id: 'OOT_WATER_RIVER',
    locationName: 'the Water Temple River chest',
    locationCodes: ['OOT Water Temple River Chest'],
  },
  {
    id: 'OOT_LOST_WOODS_TRADE',
    locationName: 'trading a bird and a mixture in the Lost Woods',
    locationCodes: [
      'OOT Lost Woods Odd Mushroom',
      "OOT Lost Woods Poacher's Saw",
    ],
    itemCount: 2, // Odd Mushroom + Poacher's Saw
  },
  {
    id: 'OOT_JABU_BOOMERANG',
    locationName: "Stingers in Jabu-Jabu's Belly",
    locationCodes: ['OOT Jabu-Jabu Boomerang Chest'],
  },
  {
    id: 'OOT_MQ_SPIRIT_SYMPHONY',
    locationName: 'playing a symphony in Spirit Temple',
    locationCodes: ['OOT MQ Spirit Temple Symphony Room Chest'],
  },
  {
    id: 'OOT_MQ_DEKU_TIME_BLOCK',
    locationName: 'a chest hidden by a time block in Deku Tree',
    locationCodes: ['OOT MQ Deku Tree After Water Platform Chest'],
  },
  {
    id: 'MM_BANK_3',
    locationName: "the Bank's Final Reward",
    locationCodes: ['MM Clock Town Bank Reward 3'],
  },
  {
    id: 'MM_SOUND_CHECK',
    locationName: 'the Milk Bar Performance',
    locationCodes: ['MM Milk Bar Troupe Leader Mask'],
  },
  {
    id: 'MM_BOAT_ARCHERY',
    locationName: 'the Boat Archery',
    locationCodes: ['MM Tourist Information Boat Archery'],
  },
  {
    id: 'MM_OSH_CHEST',
    locationName: 'the Ocean Spider House Chest',
    locationCodes: ['MM Ocean Spider House Chest HP'],
  },
  {
    id: 'MM_PINNACLE_ROCK_HP',
    locationName: 'the Pinnacle Rock Seahorses',
    locationCodes: ['MM Pinnacle Rock HP'],
  },
  {
    id: 'MM_FISHERMAN_GAME',
    locationName: "the Fisherman's Game",
    locationCodes: ['MM Great Bay Coast Fisherman HP'],
  },
  {
    id: 'MM_SONG_ELEGY',
    locationName: 'Igos du Ikana',
    locationCodes: ['MM Ancient Castle of Ikana Song Emptiness'],
  },
  {
    id: 'MM_SECRET_SHRINE_WART_HP',
    locationName: 'the Secret Shrine Wart and Final Chest',
    locationCodes: ['MM Secret Shrine Wart Chest', 'MM Secret Shrine HP Chest'],
    itemCount: 2, // Wart Chest + HP Chest
  },
  {
    id: 'MM_BLACKSMITH',
    locationName: 'the Blacksmith',
    locationCodes: ['MM Blacksmith Razor Blade', 'MM Blacksmith Gilded Sword'],
    itemCount: 2, // Razor Blade + Gilded Sword
  },
  {
    id: 'MM_MIDNIGHT_MEETING',
    locationName: 'the Midnight Meeting',
    locationCodes: ['MM Stock Pot Inn Letter to Kafei'],
  },
  {
    id: 'MM_MADAME_AROMA_BAR',
    locationName: 'Madame Aroma in the Bar',
    locationCodes: ['MM Milk Bar Madame Aroma Bottle'],
  },
  {
    id: 'MM_CUCCOS',
    locationName: 'Marching for Cuccos',
    locationCodes: ['MM Cucco Shack Bunny Mask'],
  },
  {
    id: 'MM_KAFEI',
    locationName: 'Finding Kafei',
    locationCodes: [
      'MM Kafei Hideout Pendant of Memories',
      'MM Kafei Hideout Owner Reward 1',
      'MM Kafei Hideout Owner Reward 2',
    ],
    itemCount: 3, // Pendant of Memories + Owner Reward 1 + Owner Reward 2
  },
  {
    id: 'MM_INVISIBLE_SOLDIER',
    locationName: 'an Invisible Soldier',
    locationCodes: ['MM Road to Ikana Stone Mask'],
  },
  {
    id: 'MM_GBT_ICE_ARROW',
    locationName: 'the Great Bay Temple Wart',
    locationCodes: ['MM Great Bay Temple Ice Arrow'],
  },
  {
    id: 'MM_SHT_BOSS_KEY',
    locationName: 'the second Snowhead Wizzrobe',
    locationCodes: ['MM Snowhead Temple Boss Key'],
  },
  {
    id: 'MM_WFT_BOSS_KEY',
    locationName: 'the Woodfall Temple Gekko',
    locationCodes: ['MM Woodfall Temple Boss Key Chest'],
  },
  {
    id: 'MM_ISTT_BOSS_KEY',
    locationName: 'defeating Gomess',
    locationCodes: ['MM Stone Tower Temple Inverted Boss Key'],
  },
  {
    id: 'MM_HUNGRY_GORON',
    locationName: 'feeding a freezing Goron',
    locationCodes: ['MM Mountain Village Don Gero Mask'],
  },
  {
    id: 'MM_KAMARO',
    locationName: 'healing Kamaro',
    locationCodes: ['MM Termina Field Kamaro Mask'],
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

/**
 * Resolve the location code names for a given item slot of a multi-item check.
 *
 * `locationCodes` is ordered item-major: the entries for item slot `i` sit at
 * indices `i`, `i + itemCount`, `i + 2 * itemCount`, … — each additional entry
 * being an alternate variant of the same slot (e.g. the MQ counterpart of a
 * check that exists in both normal and Master Quest layouts).
 */
export function resolveCheckSlotLocationCodes(
  check: HintCheckDef,
  slotIndex: number,
): string[] {
  const itemCount = Math.max(1, check.itemCount ?? 1);
  const codes: string[] = [];
  for (let k = 0; slotIndex + k * itemCount < check.locationCodes.length; k++) {
    codes.push(check.locationCodes[slotIndex + k * itemCount]);
  }
  return codes;
}
