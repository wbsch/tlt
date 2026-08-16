/**
 * Song Events Constants
 * Based on OoTMM/packages/core/include/combo/data/song_events.h
 */
import { withBasePath } from '../utils/assetPath';

// BusinessAlex's song-event icons are opt-in: the default build substitutes the
// MIT-licensed fallback set. See LICENSE_ASSETS.md and the
// I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES build flag.
// typeof guard: the Vite define is absent when running under plain tsx/node.
const USE_RESTRICTED_ASSETS =
  typeof __TLT_USE_RESTRICTED_ASSETS__ !== 'undefined' &&
  __TLT_USE_RESTRICTED_ASSETS__;
const SONG_EVENTS_DIR = USE_RESTRICTED_ASSETS
  ? 'song_events'
  : 'fallback/song_events';
const songEventImage = (file: string): string =>
  withBasePath(`images/${SONG_EVENTS_DIR}/${file}`);

// Song Event IDs (matching OoTMM core definitions)
export const SONG_EVENT_TEMPLE_OF_TIME = 0x00;
export const SONG_EVENT_WINDMILL = 0x01;
export const SONG_EVENT_GRAVEYARD = 0x02;
export const SONG_EVENT_ZORA_RIVER = 0x03;
export const SONG_EVENT_GORON_CITY = 0x04;
export const SONG_EVENT_GREAT_FAIRY_SPELL_WIND = 0x05;
export const SONG_EVENT_GREAT_FAIRY_SPELL_FIRE = 0x06;
export const SONG_EVENT_GREAT_FAIRY_SPELL_LOVE = 0x07;
export const SONG_EVENT_GREAT_FAIRY_UPGRADE_MAGIC = 0x08;
export const SONG_EVENT_GREAT_FAIRY_UPGRADE_MAGIC2 = 0x09;
export const SONG_EVENT_GREAT_FAIRY_UPGRADE_DEFENSE = 0x0a;
export const SONG_EVENT_TEMPLE_WATER = 0x0b;
export const SONG_EVENT_TEMPLE_SHADOW = 0x0c;
export const SONG_EVENT_TEMPLE_SPIRIT_STATUE = 0x0d;
export const SONG_EVENT_TEMPLE_SPIRIT_LOWER = 0x0e;
export const SONG_EVENT_TEMPLE_SPIRIT_HIGHER = 0x0f;
export const SONG_EVENT_TEMPLE_BOTW = 0x10;
export const SONG_EVENT_TEMPLE_GANON = 0x11;

// MM Song Event IDs (matching OoTMM core definitions)
// OoT uses IDs 0x00-0x11, we use them directly.
// MM uses IDs 0x00-0x0c in core, we offset by 18 to avoid collision.
export const MM_SONG_EVENT_TEMPLE_WOODFALL = 18 + 0;
export const MM_SONG_EVENT_TEMPLE_SNOWHEAD = 18 + 1;
export const MM_SONG_EVENT_TEMPLE_GREATBAY = 18 + 2;
export const MM_SONG_EVENT_HEALING_DARMANI = 18 + 4;
export const MM_SONG_EVENT_HEALING_PAMELA_FATHER = 18 + 5;
export const MM_SONG_EVENT_HEALING_KAMARO = 18 + 6;
export const MM_SONG_EVENT_HEALING_MIKAU = 18 + 7;
export const MM_SONG_EVENT_AWAKENING_KEETA = 18 + 8;
export const MM_SONG_EVENT_LULLABY_KID = 18 + 10;
export const MM_SONG_EVENT_STORMS_COMPOSER = 18 + 11;
export const MM_SONG_EVENT_CLOCK_TOWER_ROOF = 18 + 12;

// Song IDs (matching OoTMM core song indices)
export const SONG_ZELDA = 0; // Zelda's Lullaby
export const SONG_EPONA = 1; // Epona's Song
export const SONG_SARIA = 2; // Saria's Song
export const SONG_STORMS = 3; // Song of Storms
export const SONG_SUN = 4; // Sun's Song
export const SONG_TIME = 5; // Song of Time
export const SONG_MINUET = 6; // Minuet of Forest
export const SONG_BOLERO = 7; // Bolero of Fire
export const SONG_SERENADE = 8; // Serenade of Water
export const SONG_REQUIEM = 9; // Requiem of Spirit
export const SONG_NOCTURNE = 10; // Nocturne of Shadow
export const SONG_PRELUDE = 11; // Prelude of Light
export const SONG_HEALING = 12; // Song of Healing
export const SONG_SOARING = 13; // Song of Soaring
export const SONG_SONATA = 14; // Sonata of Awakening
export const SONG_GORON_LULLABY = 15; // Goron Lullaby
export const SONG_GORON_LULLABY_INTRO = 16; // Goron Lullaby (Intro)
export const SONG_NEW_WAVE = 17; // New Wave Bossa Nova
export const SONG_ELEGY = 18; // Elegy of Emptiness
export const SONG_OATH = 19; // Oath to Order

/**
 * Vanilla default song assignments
 * Based on OoTMM/packages/core/lib/combo/logic/world.ts
 * Array index = Song Event ID, value = Song ID
 */
export const VANILLA_SONG_EVENTS = [
  SONG_TIME, // 0x00: Temple of Time (Door of Time)
  SONG_STORMS, // 0x01: Windmill (Kakariko Well Drain)
  SONG_ZELDA, // 0x02: Graveyard (Royal Tomb)
  SONG_ZELDA, // 0x03: Zora River (Waterfall)
  SONG_ZELDA, // 0x04: Goron City (Darunia's Chamber)
  SONG_ZELDA, // 0x05: Great Fairy Spell Wind (Zora's Fountain)
  SONG_ZELDA, // 0x06: Great Fairy Spell Fire (Hyrule Castle)
  SONG_ZELDA, // 0x07: Great Fairy Spell Love (Desert Colossus)
  SONG_ZELDA, // 0x08: Great Fairy Upgrade Magic (Death Mountain Trail)
  SONG_ZELDA, // 0x09: Great Fairy Upgrade Magic 2 (Death Mountain Crater)
  SONG_ZELDA, // 0x0a: Great Fairy Upgrade Defense (Ganon's Castle)
  SONG_ZELDA, // 0x0b: Temple Water (Water Level Control)
  SONG_ZELDA, // 0x0c: Temple Shadow (Boat)
  SONG_ZELDA, // 0x0d: Temple Spirit Statue Hand
  SONG_ZELDA, // 0x0e: Temple Spirit Lower (Compass Chest)
  SONG_ZELDA, // 0x0f: Temple Spirit Higher (Boss Key)
  SONG_ZELDA, // 0x10: Temple BotW (Bottom of the Well Gates)
  SONG_ZELDA, // 0x11: Temple Ganon (Light Trial)
] as const;

/**
 * Vanilla default MM song assignments
 * Based on OoTMM/packages/logic/src/world/builder.ts
 * Array index = MM Song Event ID (0-based), value = Song ID
 */
export const VANILLA_SONG_EVENTS_MM = [
  SONG_SONATA, // 0: Woodfall Temple
  SONG_GORON_LULLABY, // 1: Snowhead Temple
  SONG_NEW_WAVE, // 2: Great Bay Temple
  // 3: Song of Healing - Poe Hut (not gated by any location, but kept
  // for positional alignment with OoTMM core's 13-entry MM song event list)
  SONG_HEALING,
  SONG_HEALING, // 4: Song of Healing - Darmani
  SONG_HEALING, // 5: Song of Healing - Pamela's Father
  SONG_HEALING, // 6: Song of Healing - Kamaro
  SONG_HEALING, // 7: Song of Healing - Mikau
  SONG_SONATA, // 8: Sonata of Awakening - Keeta
  // 9: Sonata of Awakening - Deku Scrub (not gated by any location, but kept
  // for positional alignment with OoTMM core's 13-entry MM song event list)
  SONG_SONATA,
  SONG_GORON_LULLABY_INTRO, // 10: Goron Lullaby - Elder's Son
  SONG_STORMS, // 11: Song of Storms - Composer
  SONG_OATH, // 12: Clock Tower Roof
] as const;

export type SongEventData = {
  id: number;
  label: string;
};

/**
 * Song Event definitions for OoT UI display
 * Sorted alphabetically by label
 */
export const SONG_EVENTS: SongEventData[] = [
  { id: SONG_EVENT_GORON_CITY, label: "Darunia's Chamber" },
  {
    id: SONG_EVENT_GREAT_FAIRY_UPGRADE_MAGIC2,
    label: 'Death Mountain Crater Fairy',
  },
  {
    id: SONG_EVENT_GREAT_FAIRY_UPGRADE_MAGIC,
    label: 'Death Mountain Trail Fairy',
  },
  { id: SONG_EVENT_GREAT_FAIRY_SPELL_LOVE, label: 'Desert Colossus Fairy' },
  { id: SONG_EVENT_TEMPLE_OF_TIME, label: 'Door of Time' },
  { id: SONG_EVENT_WINDMILL, label: 'Drain Well Exterior' },
  { id: SONG_EVENT_TEMPLE_BOTW, label: 'Drain Well Interior' },
  { id: SONG_EVENT_GREAT_FAIRY_UPGRADE_DEFENSE, label: "Ganon's Castle Fairy" },
  { id: SONG_EVENT_TEMPLE_GANON, label: "Ganon's Light Trial" },
  { id: SONG_EVENT_GREAT_FAIRY_SPELL_FIRE, label: 'Hyrule Castle Fairy' },
  { id: SONG_EVENT_GRAVEYARD, label: 'Royal Tomb' },
  { id: SONG_EVENT_TEMPLE_SHADOW, label: 'Shadow Temple Boat' },
  { id: SONG_EVENT_TEMPLE_SPIRIT_HIGHER, label: 'Spirit Temple Boss Key' },
  { id: SONG_EVENT_TEMPLE_SPIRIT_LOWER, label: 'Spirit Temple Compass Chest' },
  { id: SONG_EVENT_TEMPLE_SPIRIT_STATUE, label: 'Spirit Temple Statue Hand' },
  { id: SONG_EVENT_TEMPLE_WATER, label: 'Water Temple Water Level' },
  { id: SONG_EVENT_GREAT_FAIRY_SPELL_WIND, label: "Zora's Fountain Fairy" },
  { id: SONG_EVENT_ZORA_RIVER, label: "Zora's River Waterfall" },
];

/**
 * Song Event definitions for MM UI display
 * Sorted alphabetically by label
 */
export const SONG_EVENTS_MM: SongEventData[] = [
  { id: MM_SONG_EVENT_CLOCK_TOWER_ROOF, label: 'Clock Tower Roof' },
  { id: MM_SONG_EVENT_LULLABY_KID, label: "Goron Lullaby - Elder's Son" },
  { id: MM_SONG_EVENT_TEMPLE_GREATBAY, label: 'Great Bay Temple' },
  { id: MM_SONG_EVENT_AWAKENING_KEETA, label: 'Ikana Graveyard Keeta' },
  { id: MM_SONG_EVENT_HEALING_PAMELA_FATHER, label: "Pamela's Father" },
  { id: MM_SONG_EVENT_HEALING_DARMANI, label: 'Song of Healing - Darmani' },
  { id: MM_SONG_EVENT_HEALING_KAMARO, label: 'Song of Healing - Kamaro' },
  { id: MM_SONG_EVENT_HEALING_MIKAU, label: 'Song of Healing - Mikau' },
  {
    id: MM_SONG_EVENT_STORMS_COMPOSER,
    label: 'Song of Storms - Composer Bros',
  },
  { id: MM_SONG_EVENT_TEMPLE_SNOWHEAD, label: 'Snowhead Temple' },
  { id: MM_SONG_EVENT_TEMPLE_WOODFALL, label: 'Woodfall Temple' },
];

export type SongChoice = {
  value: number;
  label: string;
  image: string;
};

/**
 * Available songs for selection
 */
export const SONG_CHOICES: SongChoice[] = [
  {
    value: SONG_ZELDA,
    label: "Zelda's Lullaby",
    image: songEventImage('zeldas_lullaby.png'),
  },
  {
    value: SONG_EPONA,
    label: "Epona's Song",
    image: songEventImage('eponas_song_oot.png'),
  },
  {
    value: SONG_SARIA,
    label: "Saria's Song",
    image: songEventImage('sarias_song.png'),
  },
  {
    value: SONG_STORMS,
    label: 'Song of Storms',
    image: songEventImage('song_of_storms_oot.png'),
  },
  {
    value: SONG_SUN,
    label: "Sun's Song",
    image: songEventImage('suns_song.png'),
  },
  {
    value: SONG_TIME,
    label: 'Song of Time',
    image: songEventImage('song_of_time_oot.png'),
  },
  {
    value: SONG_MINUET,
    label: 'Minuet of Forest',
    image: songEventImage('minuet_of_forest.png'),
  },
  {
    value: SONG_BOLERO,
    label: 'Bolero of Fire',
    image: songEventImage('bolero_of_fire.png'),
  },
  {
    value: SONG_SERENADE,
    label: 'Serenade of Water',
    image: songEventImage('serenade_of_water.png'),
  },
  {
    value: SONG_REQUIEM,
    label: 'Requiem of Spirit',
    image: songEventImage('requiem_of_spirit.png'),
  },
  {
    value: SONG_NOCTURNE,
    label: 'Nocturne of Shadow',
    image: songEventImage('nocturne_of_shadow.png'),
  },
  {
    value: SONG_PRELUDE,
    label: 'Prelude of Light',
    image: songEventImage('prelude_of_light.png'),
  },
  {
    value: SONG_HEALING,
    label: 'Song of Healing',
    image: songEventImage('song_of_healing.png'),
  },
  {
    value: SONG_SOARING,
    label: 'Song of Soaring',
    image: songEventImage('song_of_soaring.png'),
  },
  {
    value: SONG_SONATA,
    label: 'Sonata of Awakening',
    image: songEventImage('sonata_of_awakening.png'),
  },
  {
    value: SONG_GORON_LULLABY,
    label: 'Goron Lullaby',
    image: songEventImage('goron_lullaby.png'),
  },
  {
    value: SONG_GORON_LULLABY_INTRO,
    label: 'Goron Lullaby (Intro)',
    image: songEventImage('goron_lullaby.png'),
  },
  {
    value: SONG_NEW_WAVE,
    label: 'New Wave Bossa Nova',
    image: songEventImage('new_wave_bossa_nova.png'),
  },
  {
    value: SONG_ELEGY,
    label: 'Elegy of Emptiness',
    image: songEventImage('elegy_of_emptiness.png'),
  },
  {
    value: SONG_OATH,
    label: 'Oath to Order',
    image: songEventImage('oath_to_order.png'),
  },
];

/**
 * Returns the subset of songs that can be assigned to OoT song events,
 * based on the current randomizer settings.
 */
export function getOotSongChoices(
  settings: Record<string, unknown>,
): SongChoice[] {
  const allowed: SongChoice[] = [
    // Always available in OoT
    SONG_CHOICES[0], // Zelda's Lullaby
    SONG_CHOICES[1], // Epona's Song
    SONG_CHOICES[2], // Saria's Song
    SONG_CHOICES[3], // Song of Storms
    SONG_CHOICES[4], // Sun's Song
    SONG_CHOICES[5], // Song of Time
    SONG_CHOICES[6], // Minuet of Forest
    SONG_CHOICES[7], // Bolero of Fire
    SONG_CHOICES[8], // Serenade of Water
    SONG_CHOICES[9], // Requiem of Spirit
    SONG_CHOICES[10], // Nocturne of Shadow
    SONG_CHOICES[11], // Prelude of Light
  ];

  if (settings.songHealingOot) {
    allowed.push(SONG_CHOICES[12]); // Song of Healing
  }
  if (settings.songSoaringOot) {
    allowed.push(SONG_CHOICES[13]); // Song of Soaring
  }
  if (settings.songAwakeningOot) {
    allowed.push(SONG_CHOICES[14]); // Sonata of Awakening
  }
  if (settings.songGoronOot) {
    allowed.push(SONG_CHOICES[15]); // Goron Lullaby
    if (settings.progressiveGoronLullabyOot === 'progressive') {
      allowed.push(SONG_CHOICES[16]); // Goron Lullaby (Intro)
    }
  }
  if (settings.songZoraOot) {
    allowed.push(SONG_CHOICES[17]); // New Wave Bossa Nova
  }
  if (settings.elegyOot) {
    allowed.push(SONG_CHOICES[18]); // Elegy of Emptiness
  }
  if (settings.songOrderOot) {
    allowed.push(SONG_CHOICES[19]); // Oath to Order
  }

  return allowed;
}

/**
 * Returns the subset of songs that can be assigned to MM song events,
 * based on the current randomizer settings.
 */
export function getMmSongChoices(
  settings: Record<string, unknown>,
): SongChoice[] {
  const allowed: SongChoice[] = [
    // Always available in MM with song events
    SONG_CHOICES[5], // Song of Time
    SONG_CHOICES[12], // Song of Healing
    SONG_CHOICES[1], // Epona's Song
    SONG_CHOICES[13], // Song of Soaring
    SONG_CHOICES[3], // Song of Storms
    SONG_CHOICES[14], // Sonata of Awakening
    SONG_CHOICES[15], // Goron Lullaby
    SONG_CHOICES[17], // New Wave Bossa Nova
    SONG_CHOICES[18], // Elegy of Emptiness
    SONG_CHOICES[19], // Oath to Order
  ];

  if (settings.progressiveGoronLullabyMm === 'progressive') {
    allowed.push(SONG_CHOICES[16]); // Goron Lullaby (Intro)
  }

  // OoT songs that can be added to MM
  if (settings.songSunMm) {
    allowed.push(SONG_CHOICES[4]); // Sun's Song
  }
  if (settings.songZeldaLullabyMm) {
    allowed.push(SONG_CHOICES[0]); // Zelda's Lullaby
  }
  if (settings.songSariasMm) {
    allowed.push(SONG_CHOICES[2]); // Saria's Song
  }
  if (settings.songMinuetMm) {
    allowed.push(SONG_CHOICES[6]); // Minuet of Forest
  }
  if (settings.songBoleroMm) {
    allowed.push(SONG_CHOICES[7]); // Bolero of Fire
  }
  if (settings.songSerenadeMm) {
    allowed.push(SONG_CHOICES[8]); // Serenade of Water
  }
  if (settings.songRequiemMm) {
    allowed.push(SONG_CHOICES[9]); // Requiem of Spirit
  }
  if (settings.songNocturneMm) {
    allowed.push(SONG_CHOICES[10]); // Nocturne of Shadow
  }
  if (settings.songPreludeMm) {
    allowed.push(SONG_CHOICES[11]); // Prelude of Light
  }

  return allowed;
}

/**
 * Get the default song choice from a filtered list.
 * Falls back to the first entry (Zelda's Lullaby) if the current selection
 * is not in the filtered list.
 */
export function getFilteredDefaultChoice(
  choices: SongChoice[],
  currentValue: number | undefined,
): SongChoice {
  if (currentValue !== undefined) {
    const match = choices.find((c) => c.value === currentValue);
    if (match) return match;
  }
  return choices[0];
}
