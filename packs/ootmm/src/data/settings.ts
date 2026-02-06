import type { SettingDefinition } from '@/types/tracker'
import * as SettingsMod from '@ootmm/core/settings/data.js'
import settingsWhitelist from './settingsWhitelist.json'
// CJS interop: grab SETTINGS array from module exports
const { SETTINGS } = SettingsMod as { SETTINGS?: unknown[] }

/**
 * Settings definitions for OoTMM tracker
 * Loaded directly from OoTMM settings data and transformed for UI
 */
function transformOoTMMSetting(setting: unknown): SettingDefinition | null {
  const raw = setting as {
    key?: string
    name?: string
    description?: string
    default?: unknown
    category?: string
    type?: string
    cond?: unknown
    min?: unknown
    max?: unknown
    values?: unknown[]
  }

  const base = {
    key: raw.key,
    label: raw.name,
    description: raw.description,
    default: raw.default,
    category: raw.category || 'Other',
    cond: typeof raw.cond === 'function' ? (raw.cond as (settings: Record<string, unknown>) => boolean) : undefined,
  }

  const options = raw.values?.map((v: unknown) => {
    const option = v as { value?: unknown; name?: string; description?: string; cond?: unknown }
    return {
      value: option.value,
      label: option.name ?? '',
      description: option.description,
      cond: typeof option.cond === 'function' ? (option.cond as (settings: Record<string, unknown>) => boolean) : undefined,
    }
  })

  const min = typeof raw.min === 'function' || typeof raw.min === 'number' ? raw.min : undefined
  const max = typeof raw.max === 'function' || typeof raw.max === 'number' ? raw.max : undefined

  switch (raw.type) {
    case 'boolean':
      return { ...base, type: 'boolean' }
    
    case 'number':
      return { ...base, type: 'number', min, max }
    
    case 'enum':
      return {
        ...base,
        type: 'select',
        options,
      }
    
    case 'set':
      return {
        ...base,
        type: 'multi-select',
        default: { type: (setting as { default?: string }).default },
        options,
      }
    
    default:
      return null
  }
}

const SETTINGS_WHITELIST = new Set(settingsWhitelist)

const mergeSettingDefinitions = (
  base: SettingDefinition[],
  overrides: SettingDefinition[],
): SettingDefinition[] => {
  const merged = new Map<string, SettingDefinition>()
  for (const def of base) {
    merged.set(def.key, def)
  }
  for (const def of overrides) {
    const existing = merged.get(def.key)
    if (!existing) {
      merged.set(def.key, def)
      continue
    }

    const mergedDef: SettingDefinition = { ...existing, ...def }

    if (def.options && existing.options) {
      const baseOptionsByValue = new Map<unknown, (typeof existing.options)[number]>(
        existing.options.map((option) => [option.value, option]),
      )
      mergedDef.options = def.options.map((option) => {
        const baseOption = baseOptionsByValue.get(option.value)
        if (!baseOption) return option
        return {
          ...baseOption,
          ...option,
          cond: option.cond ?? baseOption.cond,
          description: option.description ?? baseOption.description,
        }
      })
    }

    merged.set(def.key, mergedDef)
  }
  return [...merged.values()]
}

const applyWhitelist = (definitions: SettingDefinition[]): SettingDefinition[] => {
  const definitionKeys = new Set(definitions.map((def) => def.key))
  const missing = settingsWhitelist.filter((key) => !definitionKeys.has(key))
  if (missing.length > 0) {
    console.warn(
      `[OoTMM Settings] ${missing.length} whitelist entries have no definition: ${missing.join(', ')}`,
    )
  }
  return definitions.filter((def) => SETTINGS_WHITELIST.has(def.key))
}

// Transform OoTMM settings into our UI format
const BASE_SETTINGS_DEFINITIONS: SettingDefinition[] = SETTINGS
  .map(transformOoTMMSetting)
  .filter((s): s is SettingDefinition => s !== null)

const CUSTOM_SETTINGS_DEFINITIONS: SettingDefinition[] = [
  // === MAIN SETTINGS ===
  {
    key: 'games',
    label: 'Games',
    type: 'select',
    default: 'ootmm',
    category: 'Main',
    description: 'Which game(s) to include',
    options: [
      { value: 'ootmm', label: 'OoT+MM' },
      { value: 'oot', label: 'OoT Only' },
      { value: 'mm', label: 'MM Only' },
    ],
  },
  {
    key: 'logic',
    label: 'Logic',
    type: 'select',
    default: 'allLocations',
    category: 'Main',
    description: 'The guarantees you have regarding reachability of locations',
    options: [
      { value: 'allLocations', label: 'All Locations' },
      { value: 'beatable', label: 'Beatable Only' },
      { value: 'none', label: 'No Logic' },
    ],
  },
  {
    key: 'goal',
    label: 'Goal',
    type: 'select',
    default: 'both',
    category: 'Main',
    description: 'The objective of the seed',
    options: [
      { value: 'both', label: 'Ganon & Majora' },
      { value: 'any', label: 'Any Final Boss' },
      { value: 'ganon', label: 'Ganon' },
      { value: 'majora', label: 'Majora' },
      { value: 'triforce', label: 'Triforce Hunt' },
      { value: 'triforce3', label: 'Triforce Quest' },
    ],
  },
  {
    key: 'itemPool',
    label: 'Item Pool',
    type: 'select',
    default: 'normal',
    category: 'Main',
    description: 'Change the item pool',
    options: [
      { value: 'plentiful', label: 'Plentiful' },
      { value: 'normal', label: 'Normal' },
      { value: 'scarce', label: 'Scarce' },
      { value: 'minimal', label: 'Minimal' },
      { value: 'barren', label: 'Barren' },
    ],
  },
  {
    key: 'startingAge',
    label: 'Starting Age',
    type: 'select',
    default: 'child',
    category: 'Main',
    description: 'Which age to start in (OoT)',
    options: [
      { value: 'child', label: 'Child' },
      { value: 'adult', label: 'Adult' },
      { value: 'random', label: 'Random' },
    ],
  },

  // === SHUFFLE SETTINGS ===
  {
    key: 'songs',
    label: 'Songs',
    type: 'select',
    default: 'songLocations',
    category: 'Shuffle',
    description: 'Where songs can be found',
    options: [
      { value: 'songLocations', label: 'Song Locations' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'notes', label: 'Notes' },
    ],
  },
  {
    key: 'dungeonRewardShuffle',
    label: 'Dungeon Rewards',
    type: 'select',
    default: 'dungeonBlueWarps',
    category: 'Shuffle',
    description: 'Where dungeon rewards are placed',
    options: [
      { value: 'dungeonBlueWarps', label: 'Dungeon Blue Warps' },
      { value: 'dungeonsLimited', label: 'Dungeons (Max one per dungeon)' },
      { value: 'dungeons', label: 'Dungeons (Unrestricted)' },
      { value: 'anywhere', label: 'Anywhere' },
    ],
  },
  {
    key: 'mapCompassShuffle',
    label: 'Maps & Compasses',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Where maps and compasses can be',
    options: [
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'starting', label: 'Starting Items' },
      { value: 'removed', label: 'Removed' },
    ],
  },
  {
    key: 'smallKeyShuffleOot',
    label: 'Small Keys (OoT)',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Small key shuffle for OoT dungeons',
    options: [
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'removed', label: 'Removed' },
      { value: 'vanilla', label: 'Vanilla' },
    ],
  },
  {
    key: 'smallKeyShuffleMm',
    label: 'Small Keys (MM)',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Small key shuffle for MM dungeons',
    options: [
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'removed', label: 'Removed' },
      { value: 'vanilla', label: 'Vanilla' },
    ],
  },
  {
    key: 'bossKeyShuffleOot',
    label: 'Boss Keys (OoT)',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Boss key shuffle for OoT dungeons',
    options: [
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'removed', label: 'Removed' },
      { value: 'vanilla', label: 'Vanilla' },
    ],
  },
  {
    key: 'bossKeyShuffleMm',
    label: 'Boss Keys (MM)',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Boss key shuffle for MM dungeons',
    options: [
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'removed', label: 'Removed' },
      { value: 'vanilla', label: 'Vanilla' },
    ],
  },
  {
    key: 'ganonBossKey',
    label: 'Ganon Boss Key',
    type: 'select',
    default: 'removed',
    category: 'Shuffle',
    description: 'Where Ganon Boss Key should be',
    options: [
      { value: 'removed', label: 'Removed' },
      { value: 'vanilla', label: 'Vanilla' },
      { value: 'ganon', label: 'Ganon\'s Castle' },
      { value: 'anywhere', label: 'Anywhere' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  {
    key: 'goldSkulltulaTokens',
    label: 'Gold Skulltula Tokens',
    type: 'select',
    default: 'none',
    category: 'Shuffle',
    description: 'Gold Skulltula shuffle (OoT)',
    options: [
      { value: 'none', label: 'No Shuffle' },
      { value: 'dungeons', label: 'Dungeons Only' },
      { value: 'overworld', label: 'Overworld Only' },
      { value: 'all', label: 'All Tokens' },
    ],
  },
  {
    key: 'housesSkulltulaTokens',
    label: 'House Skulltula Tokens',
    type: 'select',
    default: 'none',
    category: 'Shuffle',
    description: 'Swamp/Ocean skulltula shuffle (MM)',
    options: [
      { value: 'none', label: 'No Shuffle' },
      { value: 'cross', label: 'Gold Skulltulas Only' },
      { value: 'all', label: 'All Tokens' },
    ],
  },
  {
    key: 'strayFairyChestShuffle',
    label: 'Stray Fairy (Chests)',
    type: 'select',
    default: 'ownDungeon',
    category: 'Shuffle',
    description: 'Dungeon chest stray fairies (MM)',
    options: [
      { value: 'starting', label: 'Starting' },
      { value: 'vanilla', label: 'Vanilla' },
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
    ],
  },
  {
    key: 'strayFairyOtherShuffle',
    label: 'Stray Fairy (Freestanding)',
    type: 'select',
    default: 'vanilla',
    category: 'Shuffle',
    description: 'Dungeon freestanding stray fairies (MM)',
    options: [
      { value: 'removed', label: 'Removed' },
      { value: 'starting', label: 'Starting' },
      { value: 'vanilla', label: 'Vanilla' },
      { value: 'ownDungeon', label: 'Own Dungeon' },
      { value: 'anywhere', label: 'Anywhere' },
    ],
  },
  {
    key: 'scrubShuffleOot',
    label: 'Scrubs (OoT)',
    type: 'boolean',
    default: false,
    category: 'Shuffle',
    description: 'Shuffle scrub items in OoT',
  },
  {
    key: 'scrubShuffleMm',
    label: 'Scrubs (MM)',
    type: 'boolean',
    default: false,
    category: 'Shuffle',
    description: 'Shuffle scrub items in MM',
  },
  {
    key: 'cowShuffleOot',
    label: 'Cows (OoT)',
    type: 'boolean',
    default: false,
    category: 'Shuffle',
    description: 'Shuffle cow rewards in OoT',
  },
  {
    key: 'cowShuffleMm',
    label: 'Cows (MM)',
    type: 'boolean',
    default: false,
    category: 'Shuffle',
    description: 'Shuffle cow rewards in MM',
  },
  {
    key: 'shopShuffleOot',
    label: 'Shops (OoT)',
    type: 'select',
    default: 'none',
    category: 'Shuffle',
    description: 'Shop item shuffle in OoT',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'shopShuffleMm',
    label: 'Shops (MM)',
    type: 'select',
    default: 'none',
    category: 'Shuffle',
    description: 'Shop item shuffle in MM',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },

  // === SHARED ITEMS ===
  {
    key: 'sharedBows',
    label: 'Shared Bows',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM bows are the same item',
  },
  {
    key: 'sharedBombBags',
    label: 'Shared Bomb Bags',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM bomb bags are the same item',
  },
  {
    key: 'sharedMagic',
    label: 'Shared Magic',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM magic are shared',
  },
  {
    key: 'sharedMagicArrowFire',
    label: 'Shared Fire Arrows',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM fire arrows are the same',
  },
  {
    key: 'sharedMagicArrowIce',
    label: 'Shared Ice Arrows',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM ice arrows are the same',
  },
  {
    key: 'sharedMagicArrowLight',
    label: 'Shared Light Arrows',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM light arrows are the same',
  },
  {
    key: 'sharedHookshot',
    label: 'Shared Hookshot',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM hookshoots are the same',
  },
  {
    key: 'sharedLens',
    label: 'Shared Lens of Truth',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM lens are the same',
  },
  {
    key: 'sharedOcarina',
    label: 'Shared Ocarina',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'OoT and MM ocarinas are the same',
  },
  {
    key: 'sharedMaskGoron',
    label: 'Shared Goron Mask/Tunic',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Goron abilities are shared',
  },
  {
    key: 'sharedMaskZora',
    label: 'Shared Zora Mask/Tunic',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Zora abilities are shared',
  },
  {
    key: 'sharedSongEpona',
    label: 'Shared Epona\'s Song',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Epona\'s Song is shared',
  },
  {
    key: 'sharedSongStorms',
    label: 'Shared Song of Storms',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Song of Storms is shared',
  },
  {
    key: 'sharedSongTime',
    label: 'Shared Song of Time',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Song of Time is shared',
  },
  {
    key: 'sharedWallets',
    label: 'Shared Wallets',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Wallet upgrades are shared',
  },
  {
    key: 'sharedHealth',
    label: 'Shared Health',
    type: 'boolean',
    default: false,
    category: 'Shared Items',
    description: 'Health upgrades are shared',
  },

  // === ENTRANCE RANDOMIZER ===
  {
    key: 'erDungeons',
    label: 'Dungeons',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize dungeon entrances',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erBoss',
    label: 'Boss Rooms',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize boss room entrances',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erGrottos',
    label: 'Grottoes',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize grotto entrances',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erIndoors',
    label: 'Indoor Entrances',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize indoor building entrances',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erRegions',
    label: 'Regions',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize region connections',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erOverworld',
    label: 'Overworld',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize overworld entrances',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'erWarps',
    label: 'Warp Songs',
    type: 'select',
    default: 'none',
    category: 'Entrance Randomizer',
    description: 'Randomize warp song destinations',
    options: [
      { value: 'none', label: 'None' },
      { value: 'full', label: 'Full' },
    ],
  },

  // === WORLD SETTINGS ===
  {
    key: 'crossAge',
    label: 'Cross-Age',
    type: 'boolean',
    default: false,
    category: 'World Settings',
    description: 'Allow progression across ages freely',
  },
  {
    key: 'crossWarpOot',
    label: 'Cross-Warp (OoT)',
    type: 'boolean',
    default: false,
    category: 'World Settings',
    description: 'Warp songs can warp across games',
  },
  {
    key: 'crossWarpMm',
    label: 'Cross-Warp (MM)',
    type: 'select',
    default: 'none',
    category: 'World Settings',
    description: 'MM warp songs cross-game behavior',
    options: [
      { value: 'none', label: 'None' },
      { value: 'childOnly', label: 'Child Only' },
      { value: 'full', label: 'Child & Adult' },
    ],
  },
  {
    key: 'doorOfTime',
    label: 'Door of Time',
    type: 'select',
    default: 'closed',
    category: 'World Settings',
    description: 'Door of Time state',
    options: [
      { value: 'closed', label: 'Closed' },
      { value: 'open', label: 'Open' },
    ],
  },
  {
    key: 'openDungeonsOot',
    label: 'Open Dungeons (OoT)',
    type: 'multi-select',
    default: { type: 'none' },
    category: 'World Settings',
    description: 'Opens the entrance to the chosen dungeons',
    options: [
      { value: 'dekuTreeAdult', label: 'Deku Tree as Adult' },
      { value: 'wellAdult', label: 'Bottom of the Well as Adult' },
      { value: 'fireChild', label: 'Fire Temple as Child' },
      { value: 'DC', label: 'Dodongo\'s Cavern' },
      { value: 'BotW', label: 'Bottom of the Well' },
      { value: 'JJ', label: 'Jabu-Jabu' },
      { value: 'Shadow', label: 'Shadow Temple' },
      { value: 'Water', label: 'Water Temple' },
    ],
  },
  {
    key: 'openDungeonsMm',
    label: 'Open Dungeons (MM)',
    type: 'multi-select',
    default: { type: 'none' },
    category: 'World Settings',
    description: 'Controls whether or not MM dungeons will need their respective song',
    options: [
      { value: 'WF', label: 'Woodfall Temple' },
      { value: 'SH', label: 'Snowhead Temple' },
      { value: 'GB', label: 'Great Bay Temple' },
      { value: 'ST', label: 'Stone Tower Temple' },
    ],
  },
  {
    key: 'gerudoFortress',
    label: 'Gerudo Fortress',
    type: 'select',
    default: 'vanilla',
    category: 'World Settings',
    description: 'Gerudo Fortress requirements',
    options: [
      { value: 'vanilla', label: 'Vanilla' },
      { value: 'open', label: 'Open' },
      { value: 'single', label: 'One Carpenter' },
    ],
  },
  {
    key: 'rainbowBridge',
    label: 'Rainbow Bridge',
    type: 'select',
    default: 'medallions',
    category: 'World Settings',
    description: 'Rainbow Bridge requirements',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'vanilla', label: 'Vanilla' },
      { value: 'medallions', label: 'Medallions' },
      { value: 'custom', label: 'Custom' },
    ],
  },

  // === QUALITY OF LIFE ===
  {
    key: 'fastBunnyHood',
    label: 'Fast Bunny Hood',
    type: 'boolean',
    default: true,
    category: 'Quality of Life',
    description: 'Bunny Hood increases movement speed',
  },
  {
    key: 'critWiggleDisable',
    label: 'Disable Crit Wiggle',
    type: 'boolean',
    default: true,
    category: 'Quality of Life',
    description: 'Disable critical health wiggle',
  },
  {
    key: 'fastMasks',
    label: 'Fast Masks',
    type: 'boolean',
    default: false,
    category: 'Quality of Life',
    description: 'Skip mask transformation animations',
  },
  {
    key: 'lenientSpikes',
    label: 'Lenient Spikes',
    type: 'boolean',
    default: true,
    category: 'Quality of Life',
    description: 'Make spike damage more forgiving',
  },
  {
    key: 'blastMaskCooldown',
    label: 'Blast Mask Cooldown',
    type: 'select',
    default: 'default',
    category: 'Quality of Life',
    description: 'Blast Mask cooldown time',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'instant', label: 'Instant' },
      { value: 'veryfast', label: 'Very Fast' },
      { value: 'fast', label: 'Fast' },
      { value: 'slow', label: 'Slow' },
    ],
  },
  {
    key: 'clockSpeed',
    label: 'Clock Speed',
    type: 'select',
    default: 'default',
    category: 'Quality of Life',
    description: 'MM 3-day cycle speed',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'veryslow', label: 'Very Slow' },
      { value: 'slow', label: 'Slow' },
      { value: 'fast', label: 'Fast' },
      { value: 'veryfast', label: 'Very Fast' },
      { value: 'superfast', label: 'Super Fast' },
    ],
  },
]

const MERGED_SETTINGS_DEFINITIONS = mergeSettingDefinitions(
  BASE_SETTINGS_DEFINITIONS,
  CUSTOM_SETTINGS_DEFINITIONS,
)

export const SETTINGS_DEFINITIONS = applyWhitelist(MERGED_SETTINGS_DEFINITIONS)
