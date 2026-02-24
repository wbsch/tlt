/**
 * Song Events Constants
 * Based on OoTMM/packages/core/include/combo/data/song_events.h
 */
import { withBasePath } from '../utils/assetPath';

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

// Song IDs (matching OoTMM core song indices)
export const SONG_ZELDA = 0; // Zelda's Lullaby
export const SONG_EPONA = 1; // Epona's Song
export const SONG_SARIA = 2; // Saria's Song
export const SONG_STORMS = 3; // Song of Storms
export const SONG_SUN = 4; // Sun's Song
export const SONG_TIME = 5; // Song of Time

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

export type SongEventData = {
  id: number;
  label: string;
};

/**
 * Song Event definitions for UI display
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
    image: withBasePath('images/song_events/zeldas_lullaby.png'),
  },
  {
    value: SONG_EPONA,
    label: "Epona's Song",
    image: withBasePath('images/song_events/eponas_song_oot.png'),
  },
  {
    value: SONG_SARIA,
    label: "Saria's Song",
    image: withBasePath('images/song_events/sarias_song.png'),
  },
  {
    value: SONG_STORMS,
    label: 'Song of Storms',
    image: withBasePath('images/song_events/song_of_storms_oot.png'),
  },
  {
    value: SONG_SUN,
    label: "Sun's Song",
    image: withBasePath('images/song_events/suns_song.png'),
  },
  {
    value: SONG_TIME,
    label: 'Song of Time',
    image: withBasePath('images/song_events/song_of_time_oot.png'),
  },
];
