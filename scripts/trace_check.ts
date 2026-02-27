/**
 * Traces the path to a specific check given a spoiler log, items, and a check name.
 *
 * Usage:
 *   node --import tsx scripts/trace_check.ts <spoiler_log> <check_name> [items...]
 *
 * Items can be specified as:
 *   ITEM_NAME        → count 1
 *   ITEM_NAME:COUNT  → specific count
 *
 * Examples:
 *   node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" MM_SCALE
 *   node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" MM_SCALE:1 MM_MASK_DEKU:1
 *   node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" --all
 *
 * Pass --all to use full inventory (all items at max count).
 */

import fs from 'node:fs';
import path from 'node:path';

// Resolve imports relative to the project root
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

// Dynamic import of the tracker
const { OoTMMTracker } = await import(
  path.join(PROJECT_ROOT, 'packs/ootmm/src/tracker.ts')
);

// ─── Trick name → key mapping ────────────────────────────────────────────────
// Built from OoTMM/packages/core/lib/combo/settings/tricks.ts
const TRICK_NAME_TO_KEY: Record<string, string> = {
  'Fewer Lens Requirements (OoT)': 'OOT_LENS',
  'Fewer Tunic Requirements (OoT)': 'OOT_TUNICS',
  'Hidden Grottos (OoT) without Stone of Agony': 'OOT_HIDDEN_GROTTOS',
  'Hidden Grottos (MM) without Stone of Agony': 'MM_HIDDEN_GROTTOS',
  'Backflip Over Mido': 'OOT_MIDO_SKIP',
  'Man on Roof with Nothing': 'OOT_MAN_ON_ROOF',
  'Haunted Wasteland Lensless': 'OOT_BLIND_WASTELAND',
  'Deku Tree B1 Skip': 'OOT_DEKU_SKIP',
  "Dodongo's Cavern Upper Adult Jump": 'OOT_DC_JUMP',
  'Forest Temple Garden Vines with Hookshot': 'OOT_FOREST_HOOK',
  'Hammer Through Walls': 'OOT_HAMMER_WALLS',
  'Volcano Item with Hover Boots': 'OOT_VOLCANO_HOVERS',
  "Nighttime Gold Skulltulas without Sun's Song": 'OOT_NIGHT_GS',
  "Enter Child Zora's Domain with Cucco": 'OOT_DOMAIN_CUCCO',
  "Enter Zora's Domain using Hover Boots": 'OOT_DOMAIN_HOVER',
  'Drain Water Temple using Longshot': 'OOT_WATER_LONGSHOT',
  'Cross the River of Sand with Nothing': 'OOT_SAND_RIVER_NOTHING',
  'Enter Shadow Temple using Fire Arrows': 'OOT_SHADOW_FIRE_ARROW',
  'Skip King Zora as Adult': 'OOT_KZ_SKIP',
  'Lost Woods Adult GS without Magic Beans': 'OOT_LOST_WOODS_ADULT_GS',
  'Windmill HP as Adult with Nothing': 'OOT_WINDMILL_HP_NOTHING',
  'Laboratory Dive without Golden Scale': 'OOT_LAB_DIVE_NO_GOLD_SCALE',
  'Laboratory Wall GS with Jump Slash': 'OOT_LAB_WALL_GS',
  'Pass through Visible One-Way Collisions': 'OOT_PASS_COLLISION',
  'DMT Red Rock Skulls without Hammer': 'OOT_DMT_RED_ROCK_GS',
  'Child Dead Hand without Kokiri Sword': 'OOT_DEAD_HAND_STICKS',
  'Break Mud Walls with Blue Fire Arrows': 'OOT_BFA_MUDWALLS',
  'Access Jabu-Jabu Pre-Boss using Hover Boots': 'OOT_JABU_BOSS_HOVER',
  'Access Adult Spirit as Child using Hover Boots': 'OOT_SPIRIT_CHILD_HOVER',
  'Reach Gerudo Fortress as Child using Hover Boots': 'OOT_VALLEY_GATE_HOVER',
  'MQ Ice Cavern GS without Scarecrow or Hover Boots':
    'OOT_MQ_ICE_SCARE_NOTHING',
  'MQ Ice Cavern GS using only Hover Boots': 'OOT_MQ_ICE_SCARE_HOVER',
  'MQ Gerudo Training Grounds Lava Room Walk along Flame Circles':
    'OOT_MQ_GTG_FLAMES',
  'Jump up to higher ledges outside Gerudo Fortress': 'OOT_FORTRESS_JUMPS',
  'Desert Colossus Plateau GS without Bean Plant': 'OOT_COLOSSUS_GS_NO_BEAN',
  'Enter Jabu-Jabu with Head Collision': 'OOT_ENTER_JABU',
  'Jabu Boss Switch without Boomerang or Climb Anywhere':
    'OOT_JABU_BOSS_HIGH_SWITCH',
  'Water Temple Reverse River with Hookshot Anywhere':
    'OOT_WATER_REVERSE_RIVER',
  'Water Temple Large Pit GS with Bombchu and Climb Anywhere':
    'OOT_WATER_PIT_GS_CHU',
  'Water Temple Boss Door with Only Iron Boots': 'OOT_WATER_BOSSBOOTS',
  'Reach Shadow Temple Boat with Climb Anywhere': 'OOT_SHADOW_BOAT_EARLY',
  'Reach Twinrova using Climb Anywhere and Hover Boots':
    'OOT_SPIRIT_BOSS_CLIMB_NO_HOOK',
  "Use Hookshot Anywhere to get past the Zora's River Falls":
    'OOT_ZR_FALLS_HOOK',
  "Skip Dodongo's Cavern Lobby with Climb Anywhere": 'OOT_DC_BOULDER',
  "Move Between Lake Hylia and Zora's Domain": 'OOT_LAKE_SHORTCUT',
  'Access Jabu-Jabu Pre-Boss without a box': 'OOT_JJB_BOXLESS',
  'Enter the Gerudo Valley Tent as Child': 'OOT_TENT_CHILD',
  'Enter Bottom of the Well as Adult with Time Travel': 'OOT_WELL_ADULT_TT',
  'Enter Adult Shooting Gallery as Child with Time Travel':
    'OOT_ADULT_GALLERY_TT',
  'Enter Gerudo Training Grounds as Child with Time Travel': 'OOT_GTG_CHILD_TT',
  "Navigate Dampé's Tomb Backwards": 'OOT_REVERSE_DAMPE',
  "Ganon's Tower Great Fairy with Time Travel": 'OOT_GANON_FAIRY_TT',
  "Enter Ganon's Castle as Child": 'OOT_GANON_CASTLE_ENTRY',
  'Enter Shadow Temple with Sticks & Fire Arrows': 'OOT_SHADOW_TEMPLE_STICKS',
  'Enter Water Temple with Golden Scale and Longshot': 'OOT_WATER_GOLD_SCALE',
  "Enter Zelda's Courtyard from Ganon's Castle": 'OOT_COURTYARD_FROM_GANON',
  'Destroy Beehives using Bombchu (OoT)': 'OOT_HIVE_BOMBCHU',
  'Get Past Deku Tree Water Room': 'OOT_DEKU_WATER_ROOM_SPIKE_NOTHING',
  'Backflip/Sidehop Over Gap to Reach BotW MQ': 'OOT_BOTW_MQ_BACKFLIP',
  'Hit/Reach the Forest MQ Twisting Switch While It Is Blocked':
    'OOT_FOREST_MQ_CLIMBING_BLOCK_ROOM_TWIST_SWITCH_EARLY',
  'Use Deku Sticks to Break Ice Cavern Stalagmite Icicles':
    'OOT_ICE_CAVERN_ICICLES_STICKS',
  'MQ Jabu without cow soul': 'OOT_MQ_JABU_WITHOUT_COW_SOUL',
  'Fewer Lens Requirements (MM)': 'MM_LENS',
  'Fewer Tunic Requirements (MM)': 'MM_TUNICS',
  'Skip Planting Beans in Deku Palace': 'MM_PALACE_BEAN_SKIP',
  'Climb Mountain Village Wall Blind': 'MM_DARMANI_WALL',
  'Pinnacle Rock without Seahorse': 'MM_NO_SEAHORSE',
  'Swim to Zora Hall as Human': 'MM_ZORA_HALL_HUMAN',
  'Climb Ikana Canyon without Ice Arrows': 'MM_ICELESS_IKANA',
  'Climb Stone Tower with One Mask': 'MM_ONE_MASK_STONE_TOWER',
  'Inverted Stone Tower Temple Early Eyegore': 'MM_ISTT_EYEGORE',
  'South Clock Town Chest with Nothing': 'MM_SCT_NOTHING',
  'Bomb Jump Fences as Goron': 'MM_GORON_BOMB_JUMP',
  "Guess Bombers' Code": 'MM_BOMBER_GUESS',
  'Guess Oceanside Spider House Code': 'MM_CAPTAIN_SKIP',
  'Inverted Stone Tower Temple Long Jump to Death Armos': 'MM_ISTT_ENTRY_JUMP',
  'Precise Short Hookshot Usage': 'MM_HARD_HOOKSHOT',
  "Enter Pirates' Fortress Interior with Short Hookshot": 'MM_PFI_BOAT_HOOK',
  'Backflip over Deku Palace Guards': 'MM_PALACE_GUARD_SKIP',
  'Complete Snowhead Temple using Hot Spring Water': 'MM_SHT_HOT_WATER',
  'Access SHT Pillar Fireless with Precise Stick Run': 'MM_SHT_STICKS_RUN',
  'Snowhead Temple Skip Raising Pillar': 'MM_SHT_PILLARLESS',
  'Snowhead Temple Hookshot Up Pillar Room': 'MM_SHT_PILLAR_ROOM_HOOKSHOT',
  'Use Powder Kegs as Explosives': 'MM_KEG_EXPLOSIVES',
  'Doggy Racetrack Chest with Nothing': 'MM_DOG_RACE_CHEST_NOTHING',
  'Fight Majora to Reset Time': 'MM_MAJORA_LOGIC',
  'Southern Swamp Scrub HP as Goron': 'MM_SOUTHERN_SWAMP_SCRUB_HP_GORON',
  'Great Bay Coast Cow Grotto LikeLike Elevator':
    'MM_GBC_COW_LIKELIKE_ELEVATOR',
  'Zora Hall Scrub HP without Deku': 'MM_ZORA_HALL_SCRUB_HP_NO_DEKU',
  'Access the doors in Zora Hall using Short Hookshot Anywhere':
    'MM_ZORA_HALL_DOORS',
  'Jump from Ikana Castle Roof to Exterior': 'MM_IKANA_ROOF_PARKOUR',
  'Float from Ikana Castle Pillar to Entrance':
    'MM_IKANA_PILLAR_ENTRANCE_FLOAT',
  'Jump from Ikana Castle Pillar to Entrance': 'MM_IKANA_PILLAR_ENTRANCE_JUMP',
  'Post Office Timing Game without Bunny Hood': 'MM_POST_OFFICE_GAME',
  'Well Hot Spring Water': 'MM_WELL_HSW',
  'ISTT Block Room without Chuchu Jellies': 'MM_ISTT_CHUCHU_LESS',
  'Cross GBT Waterwheel Room as Goron': 'MM_GBT_WATERWHEEL_GORON',
  'Great Bay Temple Entrance Chest using only Bow': 'MM_GBT_ENTRANCE_BOW',
  'Walk Along Surfaces Out of Bounds': 'MM_OOB_MOVEMENT',
  'Stone Tower Updrafts without Deku Mask': 'MM_ST_UPDRAFTS',
  'Escape the Monkey Cage with Hookshot Anywhere': 'MM_ESCAPE_CAGE',
  'GBT First Underwater Fairy with Short Hookshot Anywhere':
    'MM_GBT_FAIRY2_HOOK',
  'GBT Central Room without Zora using Fire & Ice Arrows or an OoT Magic Spell':
    'MM_GBT_CENTRAL_GEYSER',
  'Bank Rewards Require One Less Wallet': 'MM_BANK_ONE_WALLET',
  'Bank Rewards Require No Extra Wallets': 'MM_BANK_NO_WALLET',
  'Wait for the Clock Tower to Open When Shuffled': 'MM_CLOCK_TOWER_WAIT',
  'Collect the Pillar Rupees in Woodfall Temple using Ice Arrows':
    'MM_WFT_RUPEES_ICE',
  'Collect the Floating Rupees in ISTT as Goron': 'MM_ISTT_RUPEES_GORON',
  'Backflip over the Bomber in East Clock Town': 'MM_BOMBER_BACKFLIP',
  'Jump Slash Tingle in North Clock Town': 'MM_NCT_TINGLE',
  'Great Bay Temple without Fire Arrows': 'MM_GBT_FIRELESS',
  "Burn Igos' Curtains using Din's Fire": 'MM_IGOS_DINS',
  'Destroy the Bio Baba Grotto Hives with a Bombchu': 'MM_BIO_BABA_CHU',
  'Bio Baba Grotto Lilypad Luck': 'MM_BIO_BABA_LUCK',
  'Woodfall Owl Chest with Hover Boots and Jump Slash': 'MM_WF_SHRINE_HOVERS',
  'Woodfall Temple Lobby with Damage Boost and Hover Boots':
    'MM_WFT_LOBBY_HOVERS',
  'Zora Long Jump to the Soaring Tablet': 'MM_SOARING_ZORA',
  'Jump Slash or Damage Boost to the Soaring Tablet with Hover Boots and Bunny Hood':
    'MM_SOARING_HOVERS',
  'Skip playing Goron Lullaby by using Iron Boots': 'MM_LULLABY_SKIP_IRONS',
  'Cross Path to Snowhead using Hover Boots': 'MM_PATH_SNOWHEAD_HOVERS',
  'Cross GBT Waterwheel Room using Hover Boots': 'MM_GBT_WATERWHEEL_HOVERS',
  'Great Bay Temple Center Underwater Pot using only Iron Boots':
    'MM_GBT_CENTER_POT_IRONS',
  'Reach the First Red Turnkey in GBT using Hover Boots, Bunny Hood, and a Jump Slash':
    'MM_GBT_RED1_HOVERS',
  'Reach the Upper Chest in GBT Green Pipe 2 using Hover Boots':
    'MM_GBT_GREEN2_UPPER_HOVERS',
  'Fight Gyorg as Human using Iron Boots and Hookshot': 'MM_GYORG_IRONS',
  'Stone Tower Temple Map Chest using Hover Boots': 'MM_STT_LAVA_BLOCK_HOVERS',
  'Inverted Stone Tower Temple Death Armos using Hover Boots and Bunny Hood':
    'MM_ISTT_ENTRY_HOVER',
  'Dive Down for Gyorg Pots': 'MM_GYORG_POTS_DIVE',
  'STT Water Room Shallow Pots Dive with Bombchu': 'MM_STT_POT_BOMBCHU_DIVE',
  'Wait outside Stock Pot Inn': 'MM_STOCK_POT_WAIT',
  "Light the Zora Hall Stage Lights using Din's Fire": 'MM_STAGE_LIGHTS_DIN',
  "Romani's Ranch with Farore's Wind": 'MM_RANCH_FARORE',
  "Evan with Farore's Wind": 'MM_EVAN_FARORE',
  'Powder Keg Trial without Thawing Ice using Hookshot Anywhere':
    'MM_KEG_TRIAL_HEATLESS',
  'Powder Keg Trial with only Long Hookshot and Bunny Hood': 'MM_KEG_HOOKBUNNY',
  'Powder Keg Trial with only Hoverboots and Bunny Hood': 'MM_KEG_HOVERBUNNY',
  'Stone Tower Temple Lava Room switch without Goron':
    'MM_STT_LAVA_SWITCH_HAMMER',
  'Destroy Beehives using Bombchu (MM)': 'MM_HIVE_BOMBCHU',
  'Twinmold with Bow (MM)': 'MM_TWINMOLD_BOW',
  'Break Red Boulders using Powder Keg (MM)': 'MM_KEG_RED_BOULDER',
  'Enter the Bio Baba room by using a precise Bombchu launch.':
    'MM_GBT_BABA_ENTRY_BOMBCHU',
  'Defeat the waterfall Like Like in Zora Cape by using a precise Bombchu launch.':
    'MM_CAPE_LIKE_LIKE_BOMBCHU',
  'Equip Swap (OoT)': 'GLITCH_OOT_EQUIP_SWAP',
  'Ocarina Items (OoT)': 'GLITCH_OOT_OCARINA_ITEMS',
  'Megaflips (OoT)': 'GLITCH_OOT_MEGAFLIP',
  'Broken Deku Stick (OoT)': 'GLITCH_OOT_BROKEN_STICK',
};

// ─── Spoiler log parser ──────────────────────────────────────────────────────

type ParsedSpoiler = {
  settings: Record<string, unknown>;
  tricks: string[];
  specialConds: Record<string, Record<string, unknown>>;
  startingItems: Record<string, Record<string, number>>;
  worldFlags: Record<string, Record<string, unknown>>;
};

function parseSpoilerLog(filePath: string): ParsedSpoiler {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const settings: Record<string, unknown> = {};
  const tricks: string[] = [];
  const specialConds: Record<string, Record<string, unknown>> = {};
  const startingItems: Record<string, Record<string, number>> = {};
  const worldFlags: Record<string, Record<string, unknown>> = {};

  let section = '';
  let subSection = '';
  let subSubSection = '';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Detect top-level sections
    if (/^Settings\s*$/.test(line)) {
      section = 'settings';
      subSection = '';
      continue;
    }
    if (/^Special Conditions\s*$/.test(line)) {
      section = 'specialConds';
      subSection = '';
      continue;
    }
    if (/^Tricks\s*$/.test(line)) {
      section = 'tricks';
      subSection = '';
      continue;
    }
    if (/^Starting Items\s*$/.test(line)) {
      section = 'startingItems';
      subSection = '';
      continue;
    }
    if (/^World Flags\s*$/.test(line)) {
      section = 'worldFlags';
      subSection = '';
      continue;
    }
    if (/^Entrances\s*$/.test(line)) {
      section = 'entrances';
      subSection = '';
      continue;
    }
    if (/^Hints\s*$/.test(line)) {
      section = 'hints';
      subSection = '';
      continue;
    }
    if (/^Foolish Regions\s*$/.test(line)) {
      section = 'foolish';
      subSection = '';
      continue;
    }
    if (/^Locations\s*$/.test(line)) {
      section = 'locations';
      subSection = '';
      continue;
    }

    // Stop parsing settings-related sections when we hit unrelated ones
    if (['entrances', 'hints', 'foolish', 'locations'].includes(section))
      continue;

    if (line.trim() === '') continue;

    if (section === 'settings') {
      const m = line.match(/^\s{2}(\w+):\s*(.+)$/);
      if (m) {
        settings[m[1]] = parseValue(m[2].trim());
      }
    }

    if (section === 'tricks') {
      const trickName = line.trim();
      if (trickName) {
        // Try to map display name to trick key
        const key = TRICK_NAME_TO_KEY[trickName];
        if (key) {
          tricks.push(key);
        } else {
          // Fuzzy match: try contains
          const found = Object.entries(TRICK_NAME_TO_KEY).find(
            ([name]) => trickName.includes(name) || name.includes(trickName),
          );
          if (found) {
            tricks.push(found[1]);
          } else {
            console.warn(`  Warning: Unknown trick "${trickName}", skipping`);
          }
        }
      }
    }

    if (section === 'specialConds') {
      const subM = line.match(/^\s{2}(\w+):$/);
      if (subM) {
        subSection = subM[1];
        specialConds[subSection] = {};
        continue;
      }
      if (subSection) {
        const m = line.match(/^\s{4}(\w+):\s*(.+)$/);
        if (m) {
          specialConds[subSection][m[1]] = parseValue(m[2].trim());
        }
      }
    }

    if (section === 'startingItems') {
      const playerM = line.match(/^\s{2}Player\s+(\d+)$/);
      if (playerM) {
        subSection = playerM[1];
        startingItems[subSection] = {};
        continue;
      }
      if (subSection) {
        const m = line.match(/^\s{4}(.+?):\s*(\d+)$/);
        if (m) {
          startingItems[subSection][m[1].trim()] = parseInt(m[2]);
        }
      }
    }

    if (section === 'worldFlags') {
      const worldM = line.match(/^\s{2}World\s+(\d+)$/);
      if (worldM) {
        subSection = worldM[1];
        worldFlags[subSection] = {};
        continue;
      }
      if (subSection) {
        const m = line.match(/^\s{4}(.+?):\s*(.+)$/);
        if (m) {
          worldFlags[subSection][m[1].trim()] = parseValue(m[2].trim());
        }
      }
    }
  }

  return { settings, tricks, specialConds, startingItems, worldFlags };
}

function parseValue(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^\d+$/.test(s)) return parseInt(s);
  if (/^\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

// Map spoiler starting item display names to item IDs
const STARTING_ITEM_NAME_TO_ID: Record<string, string> = {
  'Clock (Day 1)': 'MM_CLOCK1',
  'Clock (Night 1)': 'MM_CLOCK2',
  'Clock (Day 2)': 'MM_CLOCK3',
  'Clock (Night 2)': 'MM_CLOCK4',
  'Clock (Day 3)': 'MM_CLOCK5',
  'Clock (Night 3)': 'MM_CLOCK6',
  'Progressive Clock': 'MM_CLOCK',
};

// Map spoiler world flag keys to OoTMMSettings keys
const WORLD_FLAG_KEY_MAP: Record<string, string> = {
  'Ganon Trials': 'ganonTrials',
  'Small Key Ring (OoT)': 'smallKeyRingOot',
  'Small Key Ring (MM)': 'smallKeyRingMm',
  'Silver Rupee Pouches': 'silverRupeePouches',
  'Open Dungeons (MM)': 'openDungeonsMm',
  'Open Dungeons (OoT)': 'openDungeonsOot',
  'Pre-Activated Owl Statues': 'mmPreActivatedOwls',
  'Master Quest Dungeons': 'mqDungeons',
  "Majora's Mask JP Layouts": 'jpLayouts',
};

function buildTrackerSettings(
  spoiler: ParsedSpoiler,
  playerNum: number,
): Record<string, unknown> {
  const s: Record<string, unknown> = { ...spoiler.settings };

  // Force single player for pathfinding
  s['players'] = 1;

  // Apply tricks
  if (spoiler.tricks.length > 0) {
    s['tricks'] = spoiler.tricks;
  }

  // Apply special conditions
  if (Object.keys(spoiler.specialConds).length > 0) {
    s['specialConds'] = spoiler.specialConds;
  }

  // Apply starting items for the given player
  const playerItems = spoiler.startingItems[String(playerNum)];
  if (playerItems) {
    const mappedItems: Record<string, number> = {};
    for (const [name, count] of Object.entries(playerItems)) {
      const itemId = STARTING_ITEM_NAME_TO_ID[name] || name;
      mappedItems[itemId] = count;
    }
    s['startingItems'] = mappedItems;
  }

  // Apply world flags for the given player
  const flags = spoiler.worldFlags[String(playerNum)];
  if (flags) {
    for (const [displayKey, value] of Object.entries(flags)) {
      const settingsKey = WORLD_FLAG_KEY_MAP[displayKey];
      if (settingsKey) {
        s[settingsKey] = value;
      }
    }
  }

  return s;
}

// ─── BFS Path tracer ────────────────────────────────────────────────────────

type AreaGraph = Map<string, Set<string>>; // area → set of exit area names

function buildAreaGraph(worlds: any[]): AreaGraph {
  const graph: AreaGraph = new Map();
  for (const world of worlds) {
    for (const [areaName, area] of Object.entries(
      world.areas as Record<string, any>,
    )) {
      if (!graph.has(areaName)) {
        graph.set(areaName, new Set());
      }
      const exits = graph.get(areaName)!;
      for (const exitName of Object.keys(area.exits || {})) {
        exits.add(exitName);
      }
    }
  }
  return graph;
}

/**
 * Resolve a user-provided check name to the exact name(s) used in the world graph.
 * Tries exact match, then "MM <name>" and "OOT <name>" prefixes, then substring match.
 */
function resolveCheckName(worlds: any[], checkName: string): string[] {
  const allCheckNames = new Set<string>();
  for (const world of worlds) {
    for (const area of Object.values(world.areas as Record<string, any>)) {
      if (area.locations) {
        for (const locName of Object.keys(area.locations)) {
          allCheckNames.add(locName);
        }
      }
    }
  }

  // Exact match
  if (allCheckNames.has(checkName)) return [checkName];

  // Try with prefixes
  for (const prefix of ['MM ', 'OOT ']) {
    const prefixed = `${prefix}${checkName}`;
    if (allCheckNames.has(prefixed)) return [prefixed];
  }

  // Substring / case-insensitive match
  const lower = checkName.toLowerCase();
  const matches = [...allCheckNames].filter(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()),
  );
  return matches;
}

function findCheckAreas(worlds: any[], checkName: string): string[] {
  const areas: string[] = [];
  for (const world of worlds) {
    for (const [areaName, area] of Object.entries(
      world.areas as Record<string, any>,
    )) {
      if (area.locations && checkName in area.locations) {
        areas.push(areaName);
      }
    }
  }
  return areas;
}

function bfsPath(
  graph: AreaGraph,
  reachableAreas: Set<string>,
  startAreas: string[],
  targetAreas: string[],
): string[] | null {
  const targetSet = new Set(targetAreas);
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  const queue: string[] = [];
  for (const start of startAreas) {
    if (reachableAreas.has(start)) {
      queue.push(start);
      visited.add(start);
      parent.set(start, null);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (targetSet.has(current)) {
      // Reconstruct path
      const path: string[] = [];
      let node: string | null = current;
      while (node !== null) {
        path.unshift(node);
        node = parent.get(node) ?? null;
      }
      return path;
    }

    const exits = graph.get(current);
    if (!exits) continue;

    for (const exit of exits) {
      if (!visited.has(exit) && reachableAreas.has(exit)) {
        visited.add(exit);
        parent.set(exit, current);
        queue.push(exit);
      }
    }
  }

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(
    `Usage: node --import tsx scripts/trace_check.ts <spoiler_log> <check_name> [items...]`,
  );
  console.log();
  console.log(`Items format:`);
  console.log(`  ITEM_NAME        → count 1`);
  console.log(`  ITEM_NAME:COUNT  → specific count`);
  console.log(
    `  --all            → use full inventory (all items at max count)`,
  );
  console.log();
  console.log(`Options:`);
  console.log(
    `  --player N       → use settings/starting items for player N (default: 1)`,
  );
  console.log();
  console.log(`Examples:`);
  console.log(
    `  node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" MM_SCALE`,
  );
  console.log(
    `  node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" MM_SCALE:1 MM_MASK_DEKU:1`,
  );
  console.log(
    `  node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" --all`,
  );
  console.log(
    `  node --import tsx scripts/trace_check.ts spoiler.txt "Southern Swamp Rupee 1" --player 2 MM_SCALE`,
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const spoilerPath = args[0];
  const checkName = args[1];
  const itemArgs = args.slice(2);

  // Parse --player option
  let playerNum = 1;
  const playerIdx = itemArgs.indexOf('--player');
  if (playerIdx !== -1) {
    playerNum = parseInt(itemArgs[playerIdx + 1]) || 1;
    itemArgs.splice(playerIdx, 2);
  }

  const useFullInventory = itemArgs.includes('--all');
  if (useFullInventory) {
    itemArgs.splice(itemArgs.indexOf('--all'), 1);
  }

  // Parse items
  const items = new Map<string, number>();
  for (const arg of itemArgs) {
    const [name, countStr] = arg.split(':');
    const count = countStr ? parseInt(countStr) : 1;
    items.set(name, count);
  }

  // Parse spoiler log
  console.log(`Parsing spoiler log: ${spoilerPath}`);
  if (!fs.existsSync(spoilerPath)) {
    console.error(`Error: File not found: ${spoilerPath}`);
    process.exit(1);
  }
  const spoiler = parseSpoilerLog(spoilerPath);
  const trackerSettings = buildTrackerSettings(spoiler, playerNum);

  console.log(`Player: ${playerNum}`);
  console.log(`Check: "${checkName}"`);
  if (useFullInventory) {
    console.log(`Items: ALL (full inventory)`);
  } else if (items.size > 0) {
    console.log(
      `Items: ${[...items.entries()].map(([k, v]) => (v > 1 ? `${k}:${v}` : k)).join(', ')}`,
    );
  } else {
    console.log(`Items: (none)`);
  }
  console.log();

  // Initialize tracker
  console.log('Initializing tracker...');
  const tracker = new OoTMMTracker();
  await tracker.initialize(trackerSettings);
  console.log('Tracker initialized.');

  // Build inventory
  let inventory: Map<string, number>;
  if (useFullInventory) {
    inventory = new Map();
    const availableItemIds = tracker.getAvailableItemIds();
    const itemMaxCounts = tracker.getItemMaxCounts();
    for (const id of availableItemIds) {
      const maxCount = itemMaxCounts.get(id) ?? 1;
      inventory.set(id, Math.max(1, maxCount));
    }
  } else {
    inventory = items;
  }

  // Run pathfinder
  console.log('Running pathfinder...');
  const result = tracker.checkReachability(inventory);

  // Check if the target check is reachable
  // Try exact match, then with MM/OOT prefix, then substring match
  const candidates = [
    `${checkName}@0`,
    `MM ${checkName}@0`,
    `OOT ${checkName}@0`,
  ];
  let isReachable = candidates.some((c) =>
    result.reachableLocationIds.includes(c),
  );

  // Also try matching by substring (in case the check name has a different format)
  const matchingLocations = result.reachableLocationIds.filter((loc: string) =>
    loc.includes(checkName),
  );

  if (!isReachable && matchingLocations.length > 0) {
    isReachable = true;
  }

  if (!isReachable && matchingLocations.length === 0) {
    console.log();
    console.log(
      `✗ Check "${checkName}" is NOT reachable with the given items.`,
    );

    // Show how many were reachable for context
    console.log(
      `  (${result.reachableLocationIds.length} total locations reachable)`,
    );

    // Try to find similar check names to help the user
    const allLocations = tracker.getAllLocations();
    const suggestions = allLocations.filter((loc: any) => {
      const locName = (loc.id || loc.name || String(loc)).toLowerCase();
      const checkLower = checkName.toLowerCase();
      return (
        locName.includes(checkLower) ||
        checkLower
          .split(' ')
          .every((w: string) => locName.includes(w.toLowerCase()))
      );
    });
    if (suggestions.length > 0 && suggestions.length <= 10) {
      console.log(`  Did you mean one of these?`);
      for (const s of suggestions) {
        console.log(`    - ${s.id || s.name || s}`);
      }
    }

    process.exit(0);
  }

  console.log();
  console.log(`✓ Check "${checkName}" IS reachable!`);

  // Now trace the path
  // Access internal worlds for area graph and reachable areas
  const worlds = (tracker as any).worlds;
  if (!worlds) {
    console.log('  (Could not access world graph for path tracing)');
    process.exit(0);
  }

  // Resolve the check name to its actual name in the world graph
  const resolvedNames = resolveCheckName(worlds, checkName);
  if (resolvedNames.length === 0) {
    console.log(`  (Could not find check "${checkName}" in any world area)`);
    process.exit(0);
  }

  const resolvedCheckName = resolvedNames[0];
  if (resolvedCheckName !== checkName) {
    console.log(`  Resolved check name: "${resolvedCheckName}"`);
  }
  if (resolvedNames.length > 1) {
    console.log(`  Also matches: ${resolvedNames.slice(1).join(', ')}`);
  }

  // Find which areas contain this check
  const checkAreas = findCheckAreas(worlds, resolvedCheckName);
  if (checkAreas.length === 0) {
    console.log(`  (Could not find check areas for "${resolvedCheckName}")`);
    process.exit(0);
  }

  console.log(`  Check found in area(s): ${checkAreas.join(', ')}`);

  // Get reachable areas from the pathfinder state
  // We need to run the pathfinder again to get the state with areas
  const playerItems = (tracker as any).buildPlayerItemsFromInventory(inventory);
  const pathfinder = (tracker as any).pathfinder;
  const state = pathfinder.run(null, {
    assumedItems: playerItems,
    recursive: true,
    inPlace: false,
    gossips: false,
  });

  // Collect all reachable areas across both ages
  const reachableAreas = new Set<string>();
  for (const ws of state.ws) {
    for (const age of [0, 1]) {
      // AGE_CHILD=0, AGE_ADULT=1
      const ageState = ws.ages[age];
      if (ageState?.areas) {
        for (const area of ageState.areas.keys()) {
          reachableAreas.add(area);
        }
      }
    }
  }

  // Build area graph and find path
  const graph = buildAreaGraph(worlds);
  const startAreas = ['OOT SPAWN'];

  // Only consider target areas that are actually reachable
  const reachableTargetAreas = checkAreas.filter((a) => reachableAreas.has(a));

  if (reachableTargetAreas.length === 0) {
    console.log(
      `  The check is reachable but the area is not (check may be in a different area copy).`,
    );
    process.exit(0);
  }

  const areaPath = bfsPath(
    graph,
    reachableAreas,
    startAreas,
    reachableTargetAreas,
  );

  if (areaPath) {
    console.log();
    console.log(`Path (${areaPath.length} areas):`);
    for (let i = 0; i < areaPath.length; i++) {
      const prefix = i === areaPath.length - 1 ? '  └─▶' : '  ├──';
      const suffix = i === areaPath.length - 1 ? `  [CHECK: ${checkName}]` : '';
      console.log(`${prefix} ${areaPath[i]}${suffix}`);
    }
  } else {
    console.log(`  (Could not reconstruct path via BFS)`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
