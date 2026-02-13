import type { TrackerPack, TrackerCheckResult, LocationInfo } from '@/types/tracker'
import type { OoTMMSettings } from './types/settings'
import { DEFAULT_OOTMM_SETTINGS } from './types/settings'
import { VANILLA_SONG_EVENTS } from './data/song-events'

// Import from OoTMM submodule - using default imports for CJS/TS interop
import * as LogicMod from '@ootmm/core/logic/index'
import * as PathfinderMod from '@ootmm/core/logic/pathfind'
import * as LocationsMod from '@ootmm/core/logic/locations'
import * as ExprMod from '@ootmm/core/logic/expr'
import * as ItemsMod from '@ootmm/core/items/index'
import * as MonitorMod from '@ootmm/core/monitor'
import * as SettingsMod from '@ootmm/core/settings/index'
import * as EntranceMod from '@ootmm/core/logic/entrance'
import * as IsShuffledMod from '@ootmm/core/logic/is-shuffled'

import { ITEM_DATABASE } from './data/items'

const resolveExport = <T>(mod: unknown, key: string): T => (mod as Record<string, T>)?.[key] ?? (mod as { default: Record<string, T> })?.default?.[key]

const worldState = resolveExport<typeof LogicMod.worldState>(LogicMod, 'worldState')
const Pathfinder = resolveExport<typeof PathfinderMod.Pathfinder>(PathfinderMod, 'Pathfinder')
const makeLocation = resolveExport<typeof LocationsMod.makeLocation>(LocationsMod, 'makeLocation')
const locationData = resolveExport<typeof LocationsMod.locationData>(LocationsMod, 'locationData')
const exprTrue = resolveExport<typeof ExprMod.exprTrue>(ExprMod, 'exprTrue')
const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items')
const makePlayerItem = resolveExport<typeof ItemsMod.makePlayerItem>(ItemsMod, 'makePlayerItem')
const itemByID = resolveExport<typeof ItemsMod.itemByID>(ItemsMod, 'itemByID')
const Monitor = resolveExport<typeof MonitorMod.Monitor>(MonitorMod, 'Monitor')
const makeSettings = resolveExport<typeof SettingsMod.makeSettings>(SettingsMod, 'makeSettings')
const mergeSettings = resolveExport<typeof SettingsMod.mergeSettings>(SettingsMod, 'mergeSettings')
const LogicPassEntrances = resolveExport<typeof EntranceMod.LogicPassEntrances>(EntranceMod, 'LogicPassEntrances')
const isShuffled = resolveExport<typeof IsShuffledMod.isShuffled>(IsShuffledMod, 'isShuffled')

import type { World } from '@ootmm/core/logic/world'
import type { PlayerItems, PlayerItem } from '@ootmm/core/items/index'

const PRECOMPLETED_MAJOR_DUNGEONS = new Set([
  'DT', 'DC', 'JJ', 'Forest', 'Fire', 'Water', 'Shadow', 'Spirit',
  'WF', 'SH', 'GB', 'ST',
])

const PRECOMPLETED_WISPS: Record<string, string> = {
  Water: 'OOT_WISP_CLEAR_STATE_LAKE',
  WF: 'MM_WISP_CLEAR_STATE_WOODFALL',
  SH: 'MM_WISP_CLEAR_STATE_SNOWHEAD',
  GB: 'MM_WISP_CLEAR_STATE_GREAT_BAY',
  IST: 'MM_WISP_CLEAR_STATE_IKANA',
}

const SINGLE_COUNT_ITEM_IDS = new Set([
  'OOT_BOTTLE_EMPTY',
  'OOT_SHIELD_DEKU',
  'OOT_SHIELD_HYLIAN',
  'OOT_TUNIC_GORON',
  'OOT_TUNIC_ZORA',
  'MM_SHIELD_HERO',
  'MM_BOTTLE_EMPTY',
])

const VANILLA_SILVER_RUPEE_PREFIX = 'OOT_RUPEE_SILVER_'
const OWL_STATUE_PREFIX = 'MM_OWL_'

export class OoTMMTracker implements TrackerPack {
  id = 'ootmm'
  name = 'OoTMM'
  description = 'Ocarina of Time / Majora\'s Mask Randomizer Tracker'

  private pathfinder!: InstanceType<typeof Pathfinder>
  private worlds!: World[]
  private baseWorlds!: World[]
  private settings!: Record<string, unknown>
  private currentItems: Map<unknown, PlayerItem> = new Map()
  private allLocationIds: string[] = []
  private fixedLocationIds: Set<string> = new Set()
  private hiddenLocationIds: Set<string> = new Set()
  private baseHiddenLocationIds: Set<string> = new Set()
  private preCompletedDungeonIds: Set<string> = new Set()
  private baseWispEvents: Map<number, Map<string, unknown>> = new Map()
  private availableItemIds: Set<string> = new Set()
  private itemMaxCounts: Map<string, number> = new Map()
  private silverRupeeLocationIdsByItemId: Map<string, string[]> = new Map()

  async initialize(userSettings: Partial<OoTMMSettings> = {}): Promise<void> {
    console.log('[OoTMM Tracker] Initializing...')
    
    // Merge with defaults
    // We default ageChange to 'oot' for the tracker to ensure better reachability estimates
    // unless the user explicitly overrides it (e.g. from a spoiler log)
    const ootmmSettings = { 
      ...DEFAULT_OOTMM_SETTINGS, 
      ageChange: 'oot',
      ...userSettings 
    }
    console.log('[OoTMM Tracker] Merged settings:', ootmmSettings)
    
    // Convert to OoTMM settings format
    this.settings = makeSettings(ootmmSettings) as Record<string, unknown>
    console.log('[OoTMM Tracker] Final settings after makeSettings:', this.settings)
    
    // Create monitor for progress tracking
    const monitor = new Monitor({
      onLog: (msg: string) => console.log(`[OoTMM] ${msg}`),
      onProgress: (current: number, total: number) => {
        console.log(`[OoTMM] Building world: ${current}/${total}`)
      },
    }, false)

    const opts = {
      settings: this.settings,
      seed: 'TRACKER_SEED',
      settingsLog: null,
      mode: 'seed' as const,
      cosmetics: {},
      random: {},
    }
    
    console.log('[OoTMM Tracker] Building world graph...')
    const worldData = await worldState(monitor, opts as Record<string, unknown>)
    this.baseWorlds = (worldData as { worlds?: World[] }).worlds ?? []
    this.normalizeWorldItems(this.baseWorlds)
    
    // Run entrance pass to connect games
    console.log('[OoTMM Tracker] Running entrance pass...')
    const entrancePass = new LogicPassEntrances({
      ...worldData,
      startingItems: new Map(), // Provide empty starting items if missing from worldData, though worldState likely provides it internally if it was returned.
                                // Actually worldState might NOT return startingItems if it wasn't requested in options?
                                // Let's check if worldData has it or we invoke config pass separately.
                                // worldState pipeline runs LogicPassConfig which returns { settings, startingItems }.
                                // So worldData has startingItems.
    } as Record<string, unknown>)
    
    const entranceResult = entrancePass.run()
    this.worlds = entranceResult.worlds
    this.normalizeWorldItems(this.worlds)

    // Create pathfinder with empty starting items
    this.pathfinder = new Pathfinder(
      this.worlds,
      this.settings,
      new Map()
    )
    
    // Cache all location IDs
    this.allLocationIds = this.worlds.flatMap((world, worldId) => 
      Object.keys(world.checks).map(loc => makeLocation(loc, worldId))
    )
    this.fixedLocationIds = this.buildFixedLocationIds(worldData?.fixedLocations)
    this.baseHiddenLocationIds = this.buildBaseHiddenLocationIds()
    this.hiddenLocationIds = new Set(this.baseHiddenLocationIds)
    this.preCompletedDungeonIds.clear()
    this.baseWispEvents.clear()
    this.availableItemIds = this.buildAvailableItemIds(worldData?.allItems)
    this.itemMaxCounts = this.buildItemMaxCounts(worldData?.allItems)
    this.silverRupeeLocationIdsByItemId = this.buildSilverRupeeLocationIndex(this.worlds)
    
    console.log(`[OoTMM Tracker] Initialized with ${this.allLocationIds.length} locations`)
  }

  checkReachability(inventory: Map<string, number>): TrackerCheckResult {
    try {
      console.log('[OoTMM Tracker] checkReachability called with inventory:', JSON.stringify(Array.from(inventory.entries())));
    } catch (e) {
      console.log('[OoTMM Tracker] checkReachability called with inventory: (could not stringify) ', Array.from(inventory.entries()));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _unusedError = e;
    }
    const isVanillaSilverRupees = this.isVanillaSilverRupeeShuffle()
    const baseInventory = isVanillaSilverRupees ? this.stripVanillaSilverRupees(inventory) : inventory

    let assumedInventory = baseInventory
    let state
    let reachableLocationIds: string[] = []
    let newLocationIds: string[] = []
    let silverRupeeCounts = new Map<string, number>()
    let iterations = 0

    while (true) {
      const result = this.runPathfinder(assumedInventory)
      state = result.state
      reachableLocationIds = result.reachableLocationIds
      newLocationIds = result.newLocationIds

      if (!isVanillaSilverRupees || this.silverRupeeLocationIdsByItemId.size === 0) {
        break
      }

      const nextCounts = this.computeVanillaSilverRupeeCounts(reachableLocationIds)
      if (this.areCountMapsEqual(nextCounts, silverRupeeCounts)) {
        silverRupeeCounts = nextCounts
        break
      }
      silverRupeeCounts = nextCounts
      assumedInventory = this.mergeInventoryWithCounts(baseInventory, silverRupeeCounts)
      iterations += 1
      if (iterations >= 10) {
        console.warn('[OoTMM Tracker] Vanilla silver rupee auto-tracking did not stabilize after 10 iterations')
        break
      }
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!')
      throw new Error('Pathfinder returned undefined')
    }

    console.log('[OoTMM Tracker] State after pathfinder:', {
      locations: state.locations.size,
      goal: state.goal,
      started: state.started,
    })

    console.log('[OoTMM Tracker] Pathfinder result: reachable =', reachableLocationIds.length, 'new =', newLocationIds.length)

    const extra: Record<string, unknown> = {
      canReachBosses: state.ganonMajora,
      gossipStones: state.gossips[0]?.size || 0,
    }

    if (isVanillaSilverRupees) {
      extra.vanillaSilverRupeeCounts = this.countMapToRecord(silverRupeeCounts)
    }

    return {
      reachableLocationIds,
      newLocationIds,
      canComplete: state.goal,
      extra,
    }
  }

  getAllLocations(): LocationInfo[] {
    const locations: LocationInfo[] = []
    
    const worldsForLocations = this.baseWorlds.length > 0 ? this.baseWorlds : this.worlds
    for (const [worldId, world] of worldsForLocations.entries()) {
      const dungeonLocations = this.buildDungeonLocationIds(world)
      for (const locId of Object.keys(world.checks)) {
        const fullId = makeLocation(locId, worldId)
        if (this.hiddenLocationIds.has(fullId)) continue
        const check = world.checks?.[locId]
        const itemId = (check as { item?: { id?: string } })?.item?.id
        const isSkulltulaToken =
          itemId === 'OOT_GS_TOKEN' ||
          itemId === 'MM_GS_TOKEN_SWAMP' ||
          itemId === 'MM_GS_TOKEN_OCEAN'
        const isStrayFairy =
          typeof itemId === 'string' &&
          itemId.startsWith('MM_STRAY_FAIRY_') &&
          itemId !== 'MM_STRAY_FAIRY_TOWN'
        const shuffled = this.computeIsShuffled(world, locId, fullId, check, dungeonLocations)
        const showWhenUnshuffled = this.shouldShowVanillaKeyLocation(itemId)
        locations.push({
          id: fullId,
          name: locId,
          category: this.categorizeLocation(check),
          area: this.getAreaFromLocation(locId),
          isSkulltulaToken,
          isStrayFairy,
          isShuffled: shuffled,
          showWhenUnshuffled,
        })
      }
    }
    
    return locations
  }

  getSettings(): Record<string, unknown> {
    return this.settings
  }

  getAvailableItemIds(): Set<string> {
    return new Set(this.availableItemIds)
  }

  getItemMaxCounts(): Map<string, number> {
    return new Map(this.itemMaxCounts)
  }

  reset(): void {
    this.currentItems.clear()
  }

  setPreCompletedDungeons(dungeons: string[]): void {
    if (!this.worlds || !this.settings) return
    const next = new Set(dungeons.filter((id) => PRECOMPLETED_MAJOR_DUNGEONS.has(id)))
    this.preCompletedDungeonIds = next

    for (const world of this.worlds) {
      world.preCompleted = new Set(next)
    }

    this.updatePreCompletedLocations()
    this.applyPreCompletedWispEvents()
    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map())
  }

  setSongEvents(events: Record<string, number>): void {
    if (!this.worlds || !this.settings) return
    
    for (const world of this.worlds) {
      // Start with vanilla defaults from OoTMM core
      world.songEvents = [...VANILLA_SONG_EVENTS]
      
      // If Song Events Shuffle is enabled, apply user selections
      if (Object.keys(events).length > 0) {
        for (const [eventKey, songId] of Object.entries(events)) {
          const eventId = parseInt(eventKey, 10)
          if (!isNaN(eventId) && songId >= 0 && songId <= 5 && eventId >= 0 && eventId < world.songEvents.length) {
            world.songEvents[eventId] = songId
          }
        }
      }
    }

    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map())
  }

  setSpecialConds(patch: Record<string, unknown>): void {
    if (!this.worlds || !this.settings || !mergeSettings) return
    this.settings = mergeSettings(this.settings, { specialConds: patch } as Record<string, unknown>)
    this.pathfinder = new Pathfinder(this.worlds, this.settings, new Map())
  }

  // Helper methods
  private categorizeLocation(check?: unknown): string {
    if ((check as { type?: unknown })?.type) return String((check as { type?: unknown }).type)
    return 'None'
  }

  private computeIsShuffled(
    world: World,
    locId: string,
    fullId: string,
    check: unknown,
    dungeonLocations: Set<string>,
  ): boolean {
    if (this.fixedLocationIds.has(fullId)) return false
    const base = isShuffled ? Boolean(isShuffled(this.settings, world, locId, dungeonLocations)) : true
    const itemId = (check as { item?: { id?: string } })?.item?.id
    if (!itemId) return base

    if (itemId === 'OOT_GS_TOKEN') {
      const mode = String((this.settings as { goldSkulltulaTokens?: unknown }).goldSkulltulaTokens ?? '')
      if (mode === 'none') return false
      const isDungeon = dungeonLocations.has(locId)
      if (mode === 'overworld' && isDungeon) return false
      if (mode === 'dungeons' && !isDungeon) return false
      return true
    }

    if (itemId === 'MM_GS_TOKEN_SWAMP' || itemId === 'MM_GS_TOKEN_OCEAN') {
      const mode = String((this.settings as { housesSkulltulaTokens?: unknown }).housesSkulltulaTokens ?? '')
      if (mode === 'none') return false
      return true
    }

    if (itemId === 'MM_STRAY_FAIRY_TOWN') {
      const mode = String((this.settings as { townFairyShuffle?: unknown }).townFairyShuffle ?? '')
      if (mode === 'vanilla') return false
      return true
    }

    return base
  }

  private shouldShowVanillaKeyLocation(itemId?: string): boolean {
    if (!itemId) return false
    if (itemId === 'OOT_SMALL_KEY_TCG') return false
    const smallKeySetting = this.getSmallKeyShuffleSetting(itemId)
    if (smallKeySetting === 'vanilla') return true
    const bossKeySetting = this.getBossKeyShuffleSetting(itemId)
    if (bossKeySetting === 'vanilla') return true
    return false
  }

  private getSmallKeyShuffleSetting(itemId: string): string | null {
    const settings = this.settings as {
      smallKeyShuffleOot?: unknown
      smallKeyShuffleMm?: unknown
      smallKeyShuffleHideout?: unknown
      smallKeyShuffleChestGame?: unknown
    }
    if (itemId === 'OOT_SMALL_KEY_TCG') {
      return String(settings.smallKeyShuffleChestGame ?? '')
    }
    if (itemId === 'OOT_SMALL_KEY_GF') {
      return String(settings.smallKeyShuffleHideout ?? '')
    }
    if (itemId.startsWith('OOT_SMALL_KEY_') || itemId === 'OOT_SMALL_KEY' || itemId === 'OOT_TC_SMALL_KEY') {
      return String(settings.smallKeyShuffleOot ?? '')
    }
    if (itemId.startsWith('MM_SMALL_KEY_') || itemId === 'MM_SMALL_KEY') {
      return String(settings.smallKeyShuffleMm ?? '')
    }
    return null
  }

  private getBossKeyShuffleSetting(itemId: string): string | null {
    const settings = this.settings as {
      bossKeyShuffleOot?: unknown
      bossKeyShuffleMm?: unknown
      ganonBossKey?: unknown
    }
    if (itemId === 'OOT_BOSS_KEY_GANON') {
      return String(settings.ganonBossKey ?? '')
    }
    if (itemId.startsWith('OOT_BOSS_KEY_') || itemId === 'OOT_BOSS_KEY') {
      return String(settings.bossKeyShuffleOot ?? '')
    }
    if (itemId.startsWith('MM_BOSS_KEY_') || itemId === 'MM_BOSS_KEY') {
      return String(settings.bossKeyShuffleMm ?? '')
    }
    return null
  }

  private getAreaFromLocation(locId: string): string {
    // Extract area from location ID (e.g., "OOT Kokiri Forest" -> "Kokiri Forest")
    const parts = locId.split(' ')
    if (parts.length > 1) {
      return parts.slice(1).join(' ')
    }
    return locId
  }

  private buildFixedLocationIds(fixedLocations?: Set<string>): Set<string> {
    const fixed = new Set<string>()
    if (!fixedLocations) return fixed
    for (const loc of fixedLocations) {
      fixed.add(String(loc))
    }
    return fixed
  }

  private buildDungeonLocationIds(world: World): Set<string> {
    const dungeonLocations = new Set<string>()
    const dungeons = (world as { dungeons?: Record<string, string[]> }).dungeons
    if (!dungeons) return dungeonLocations
    for (const locs of Object.values(dungeons)) {
      if (!locs) continue
      for (const loc of locs) {
        dungeonLocations.add(String(loc))
      }
    }
    return dungeonLocations
  }

  private buildBaseHiddenLocationIds(): Set<string> {
    const hidden = new Set<string>()
    if (!this.worlds || this.worlds.length === 0) return hidden

    const settings = this.settings as { skipZelda?: unknown; shuffleWonderItemsOot?: unknown }
    const hideZeldaLocations = Boolean(settings.skipZelda)
    const wonderItemsSetting = String(settings.shuffleWonderItemsOot ?? '')
    const hideCourtyardWonderItem = wonderItemsSetting !== '' && wonderItemsSetting !== 'none'

    if (!hideZeldaLocations && !hideCourtyardWonderItem) return hidden

    const locationNames: string[] = []
    if (hideZeldaLocations) {
      locationNames.push("OOT Zelda's Letter", "OOT Zelda's Song")
    }
    if (hideCourtyardWonderItem) {
      locationNames.push('OOT Castle Courtyard Wonder Item')
    }

    for (let worldId = 0; worldId < this.worlds.length; worldId += 1) {
      for (const locationName of locationNames) {
        hidden.add(makeLocation(locationName, worldId))
      }
    }

    return hidden
  }

  private updatePreCompletedLocations(): void {
    const hidden = new Set(this.baseHiddenLocationIds)
    const expanded = new Set(this.preCompletedDungeonIds)
    if (expanded.has('ST')) {
      expanded.add('IST')
    }

    const dungeonLocs = new Set<string>()
    for (const [worldId, world] of this.worlds.entries()) {
      for (const dungeonId of expanded) {
        const locNames = world.dungeons?.[dungeonId]
        if (!locNames) continue
        for (const locName of locNames) {
          dungeonLocs.add(makeLocation(locName, worldId))
        }
      }
    }

    for (const locId of dungeonLocs) {
      hidden.add(locId)
    }
    this.hiddenLocationIds = hidden
  }

  private applyPreCompletedWispEvents(): void {
    const shouldApply =
      Boolean(this.settings?.preCompletedDungeons) &&
      this.settings?.regionState === 'dungeonBeaten'

    const expanded = new Set(this.preCompletedDungeonIds)
    if (expanded.has('ST')) {
      expanded.add('IST')
    }

    for (const [worldId, world] of this.worlds.entries()) {
      const spawnArea = world.areas?.['OOT SPAWN']
      if (!spawnArea) continue

      let base = this.baseWispEvents.get(worldId)
      if (!base) {
        base = new Map()
        this.baseWispEvents.set(worldId, base)
      }

      for (const [dungeonId, eventName] of Object.entries(PRECOMPLETED_WISPS)) {
        if (!base.has(eventName)) {
          base.set(eventName, spawnArea.events[eventName] ?? null)
        }

        if (shouldApply && expanded.has(dungeonId)) {
          spawnArea.events[eventName] = exprTrue()
          continue
        }

        const original = base.get(eventName)
        if (original === null || original === undefined) {
          delete spawnArea.events[eventName]
        } else {
          spawnArea.events[eventName] = original
        }
      }
    }
  }

  private buildAvailableItemIds(allItems?: Map<unknown, number>): Set<string> {
    const available = new Set<string>()
    if (!allItems) return available
    const chestGameShuffle = String((this.settings as { smallKeyShuffleChestGame?: unknown })?.smallKeyShuffleChestGame ?? '')
    const hideVanillaSilverRupees = this.isVanillaSilverRupeeShuffle()
    const hideOwlStatues = String((this.settings as { owlShuffle?: unknown })?.owlShuffle ?? '') === 'none'
    for (const [playerItem, count] of allItems) {
      if (!count || count <= 0) continue
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id
      if (itemId) {
        if (hideVanillaSilverRupees && this.isVanillaSilverRupeeItemId(itemId)) continue
        if (itemId === 'OOT_SMALL_KEY_TCG' && chestGameShuffle === 'vanilla') continue
        if (hideOwlStatues && this.isOwlStatueItemId(itemId)) continue
        available.add(itemId)
      }
    }
    return available
  }

  private normalizeWorldItems(worlds: World[]): void {
    if (!worlds || !Items) return
    const itemsById = Items as Record<string, unknown>
    for (const world of worlds) {
      const checks = (world as { checks?: Record<string, { item?: { id?: string } }> }).checks
      if (!checks) continue
      for (const check of Object.values(checks)) {
        const item = check?.item
        const id = item?.id
        if (!id) continue
        const canonical = itemsById[id]
        if (canonical) {
          check.item = canonical
        }
      }
    }
  }

  private buildItemMaxCounts(allItems?: Map<unknown, number>): Map<string, number> {
    const counts = new Map<string, number>()
    if (!allItems) return counts
    for (const [playerItem, count] of allItems) {
      if (!count || count <= 0) continue
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id
      if (!itemId) continue
      counts.set(itemId, (counts.get(itemId) || 0) + count)
    }

    // Core allItems includes fixed locations on top of the initial pool snapshot,
    // which effectively double-counts fixed items. Remove one per fixed location.
    this.adjustFixedLocationCounts(counts)

    const settings = this.settings as {
      smallKeyShuffleOot?: unknown
      smallKeyShuffleMm?: unknown
      smallKeyShuffleHideout?: unknown
      smallKeyShuffleChestGame?: unknown
    }
    const ootSetting = String(settings.smallKeyShuffleOot ?? '')
    const mmSetting = String(settings.smallKeyShuffleMm ?? '')
    const hideoutSetting = String(settings.smallKeyShuffleHideout ?? '')
    const chestGameSetting = String(settings.smallKeyShuffleChestGame ?? '')

    if (ootSetting === 'vanilla' || mmSetting === 'vanilla' || hideoutSetting === 'vanilla' || chestGameSetting === 'vanilla') {
      const defaultSmallKeyCounts = ITEM_DATABASE
        .filter((item) => item.id.includes('SMALL_KEY') && typeof item.maxCount === 'number')
        .map((item) => [item.id, item.maxCount as number])

      for (const [itemId, maxCount] of defaultSmallKeyCounts) {
        if (itemId === 'OOT_SMALL_KEY_GF') {
          if (hideoutSetting === 'vanilla') counts.set(itemId, maxCount)
          continue
        }
        if (itemId === 'OOT_SMALL_KEY_TCG') {
          if (chestGameSetting === 'vanilla') counts.set(itemId, maxCount)
          continue
        }
        if (itemId.startsWith('OOT_SMALL_KEY_')) {
          if (ootSetting === 'vanilla') counts.set(itemId, maxCount)
          continue
        }
        if (itemId.startsWith('MM_SMALL_KEY_')) {
          if (mmSetting === 'vanilla') counts.set(itemId, maxCount)
        }
      }
    }

    for (const itemId of SINGLE_COUNT_ITEM_IDS) {
      if (counts.has(itemId)) {
        counts.set(itemId, 1)
      }
    }
    return counts
  }

  private adjustFixedLocationCounts(counts: Map<string, number>): void {
    if (!this.fixedLocationIds || this.fixedLocationIds.size === 0) return
    const worlds = this.baseWorlds.length > 0 ? this.baseWorlds : this.worlds
    if (!worlds || worlds.length === 0) return

    for (const loc of this.fixedLocationIds) {
      let locId: string | undefined
      let worldId: number | null | undefined

      if (locationData) {
        const data = locationData(loc as unknown as ReturnType<typeof makeLocation>)
        if (data) {
          locId = data.id
          worldId = data.world
        }
      }

      if (!locId) {
        const atIndex = loc.lastIndexOf('@')
        if (atIndex >= 0) {
          locId = loc.slice(0, atIndex)
          worldId = Number(loc.slice(atIndex + 1))
        } else {
          locId = loc
          worldId = 0
        }
      }

      if (worldId === null || worldId === undefined || Number.isNaN(worldId)) continue
      const world = worlds[worldId]
      const itemId = world?.checks?.[locId]?.item?.id
      if (!itemId) continue

      const current = counts.get(itemId)
      if (!current) continue
      const next = current - 1
      if (next > 0) {
        counts.set(itemId, next)
      } else {
        counts.delete(itemId)
      }
    }
  }

  private isVanillaSilverRupeeShuffle(): boolean {
    return String((this.settings as { silverRupeeShuffle?: unknown })?.silverRupeeShuffle ?? '') === 'vanilla'
  }

  private isVanillaSilverRupeeItemId(itemId: string): boolean {
    return itemId.startsWith(VANILLA_SILVER_RUPEE_PREFIX)
  }

  private isOwlStatueItemId(itemId: string): boolean {
    return itemId.startsWith(OWL_STATUE_PREFIX)
  }

  private stripVanillaSilverRupees(inventory: Map<string, number>): Map<string, number> {
    if (!inventory || inventory.size === 0) return new Map()
    const next = new Map<string, number>()
    for (const [itemId, count] of inventory) {
      if (this.isVanillaSilverRupeeItemId(itemId)) continue
      next.set(itemId, count)
    }
    return next
  }

  private mergeInventoryWithCounts(baseInventory: Map<string, number>, counts: Map<string, number>): Map<string, number> {
    const next = new Map<string, number>(baseInventory)
    for (const [itemId, count] of counts) {
      if (count > 0) {
        next.set(itemId, count)
      }
    }
    return next
  }

  private areCountMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
    if (a.size !== b.size) return false
    for (const [itemId, count] of a) {
      if (b.get(itemId) !== count) return false
    }
    return true
  }

  private countMapToRecord(counts: Map<string, number>): Record<string, number> {
    return Object.fromEntries(counts.entries())
  }

  private runPathfinder(inventory: Map<string, number>): {
    state: ReturnType<InstanceType<typeof Pathfinder>['run']>
    reachableLocationIds: string[]
    newLocationIds: string[]
  } {
    const playerItems = this.buildPlayerItemsFromInventory(inventory)

    // Run pathfinding. Use a fresh state each run so that removals
    // of items (decrements) are correctly handled. The
    // Pathfinder only applies deltas for increased items
    // when given a previous state, which prevents reductions from
    // taking effect. Using `null` forces a full recalculation.
    let state
    try {
      state = this.pathfinder.run(null, {
        assumedItems: playerItems,  // Items the player has
        recursive: true,
        inPlace: false,
      })
    } catch (e) {
      console.error('[OoTMM Tracker] Pathfinder error:', e)
      throw e
    }

    if (!state) {
      console.error('[OoTMM Tracker] Pathfinder returned undefined!')
      throw new Error('Pathfinder returned undefined')
    }

    const reachableLocationIds = Array.from(state.locations).filter((locId: string) => !this.hiddenLocationIds.has(locId)) as string[]
    const newLocationIds = Array.from(state.newLocations).filter((locId: string) => !this.hiddenLocationIds.has(locId)) as string[]

    return { state, reachableLocationIds, newLocationIds }
  }

  private buildPlayerItemsFromInventory(inventory: Map<string, number>): PlayerItems {
    // Convert inventory to PlayerItems format
    const playerItems: PlayerItems = new Map()

    // WORKAROUND: The OoTMM core library seems to have been transpiled with an assumption
    // that Map.entries() returns an array (or using a C-style for loop on the result),
    // but in the browser it returns an Iterator which has no .length property.
    // We patch the map instance to return an array from entries().
    // See: https://github.com/microsoft/TypeScript/issues/33077 (maybe related?)
    ;(playerItems as { entries?: () => unknown[] }).entries = function() {
      return Array.from(Map.prototype.entries.call(this))
    }

    for (const [itemId, count] of inventory) {
      let item = (Items as Record<string, unknown>)[itemId]
      if (!item) {
        try {
          item = itemByID(itemId)
        } catch (e) {
          console.log('[OoTMM Tracker] Could not resolve item:', itemId, e)
          item = undefined
        }
      }
      if (item && count > 0) {
        const pi = makePlayerItem(item, 0)
        playerItems.set(pi, count)
        console.log('[OoTMM Tracker] Added item to playerItems:', itemId, 'as', pi.item.id, 'count:', count)
      }
    }
    return playerItems
  }

  private buildSilverRupeeLocationIndex(worlds: World[]): Map<string, string[]> {
    const map = new Map<string, string[]>()
    if (!worlds || worlds.length === 0) return map

    for (const [worldId, world] of worlds.entries()) {
      for (const [locId, check] of Object.entries(world.checks ?? {})) {
        const itemId = (check as { item?: { id?: string } })?.item?.id
        if (!itemId || !this.isVanillaSilverRupeeItemId(itemId)) continue
        const fullId = makeLocation(locId, worldId)
        const list = map.get(itemId) ?? []
        list.push(fullId)
        map.set(itemId, list)
      }
    }
    return map
  }

  private computeVanillaSilverRupeeCounts(reachableLocationIds: string[]): Map<string, number> {
    const counts = new Map<string, number>()
    if (this.silverRupeeLocationIdsByItemId.size === 0) return counts
    const reachable = new Set(reachableLocationIds)
    for (const [itemId, locationIds] of this.silverRupeeLocationIdsByItemId) {
      let count = 0
      for (const locId of locationIds) {
        if (reachable.has(locId)) count += 1
      }
      if (count > 0) {
        counts.set(itemId, count)
      }
    }
    return counts
  }
}
