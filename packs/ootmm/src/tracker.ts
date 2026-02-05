import type { TrackerPack, TrackerCheckResult, LocationInfo } from '@/types/tracker'
import type { OoTMMSettings } from './types/settings'
import { DEFAULT_OOTMM_SETTINGS } from './types/settings'

// Import from OoTMM submodule - using default imports for CJS/TS interop
import * as LogicMod from '@ootmm/core/logic/index'
import * as PathfinderMod from '@ootmm/core/logic/pathfind'
import * as LocationsMod from '@ootmm/core/logic/locations'
import * as ExprMod from '@ootmm/core/logic/expr'
import * as ItemsMod from '@ootmm/core/items/index'
import * as MonitorMod from '@ootmm/core/monitor'
import * as SettingsMod from '@ootmm/core/settings/index'
import * as EntranceMod from '@ootmm/core/logic/entrance'

const resolveExport = <T>(mod: unknown, key: string): T => (mod as Record<string, T>)?.[key] ?? (mod as { default: Record<string, T> })?.default?.[key]

const worldState = resolveExport<typeof LogicMod.worldState>(LogicMod, 'worldState')
const Pathfinder = resolveExport<typeof PathfinderMod.Pathfinder>(PathfinderMod, 'Pathfinder')
const makeLocation = resolveExport<typeof LocationsMod.makeLocation>(LocationsMod, 'makeLocation')
const exprTrue = resolveExport<typeof ExprMod.exprTrue>(ExprMod, 'exprTrue')
const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items')
const makePlayerItem = resolveExport<typeof ItemsMod.makePlayerItem>(ItemsMod, 'makePlayerItem')
const itemByID = resolveExport<typeof ItemsMod.itemByID>(ItemsMod, 'itemByID')
const Monitor = resolveExport<typeof MonitorMod.Monitor>(MonitorMod, 'Monitor')
const makeSettings = resolveExport<typeof SettingsMod.makeSettings>(SettingsMod, 'makeSettings')
const mergeSettings = resolveExport<typeof SettingsMod.mergeSettings>(SettingsMod, 'mergeSettings')
const LogicPassEntrances = resolveExport<typeof EntranceMod.LogicPassEntrances>(EntranceMod, 'LogicPassEntrances')

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

export class OoTMMTracker implements TrackerPack {
  id = 'ootmm'
  name = 'OoTMM'
  description = 'Ocarina of Time / Majora\'s Mask Randomizer Tracker'

  private pathfinder!: InstanceType<typeof Pathfinder>
  private worlds!: World[]
  private settings!: Record<string, unknown>
  private currentItems: Map<unknown, PlayerItem> = new Map()
  private allLocationIds: string[] = []
  private hiddenLocationIds: Set<string> = new Set()
  private baseHiddenLocationIds: Set<string> = new Set()
  private preCompletedDungeonIds: Set<string> = new Set()
  private baseWispEvents: Map<number, Map<string, unknown>> = new Map()
  private availableItemIds: Set<string> = new Set()
  private itemMaxCounts: Map<string, number> = new Map()

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
    this.baseHiddenLocationIds = this.buildHiddenLocationIds(worldData?.fixedLocations)
    this.hiddenLocationIds = new Set(this.baseHiddenLocationIds)
    this.preCompletedDungeonIds.clear()
    this.baseWispEvents.clear()
    this.availableItemIds = this.buildAvailableItemIds(worldData?.allItems)
    this.itemMaxCounts = this.buildItemMaxCounts(worldData?.allItems)
    
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
      // Try to find item in Items map, fall back to itemByID to resolve aliases
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
        // Player 0 for single-player
        const pi = makePlayerItem(item, 0)
        playerItems.set(pi, count)
        console.log('[OoTMM Tracker] Added item to playerItems:', itemId, 'as', pi.item.id, 'count:', count)
      }
    }

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
    
    console.log('[OoTMM Tracker] State after pathfinder:', { 
      locations: state.locations.size,
      goal: state.goal,
      started: state.started,
    })

    // Convert Location objects to strings
    // The pathfinder already returns locations with world suffix (e.g., "@0")
    const reachableLocationIds = Array.from(state.locations).filter((locId: string) => !this.hiddenLocationIds.has(locId)) as string[]
    const newLocationIds = Array.from(state.newLocations).filter((locId: string) => !this.hiddenLocationIds.has(locId)) as string[]
    
    console.log('[OoTMM Tracker] Pathfinder result: reachable =', reachableLocationIds.length, 'new =', newLocationIds.length)

    return {
      reachableLocationIds,
      newLocationIds,
      canComplete: state.goal,
      extra: {
        canReachBosses: state.ganonMajora,
        gossipStones: state.gossips[0]?.size || 0,
      },
    }
  }

  getAllLocations(): LocationInfo[] {
    const locations: LocationInfo[] = []
    
    for (const [worldId, world] of this.worlds.entries()) {
      for (const locId of Object.keys(world.checks)) {
        const fullId = makeLocation(locId, worldId)
        if (this.hiddenLocationIds.has(fullId)) continue
        const check = world.checks?.[locId]
        locations.push({
          id: fullId,
          name: locId,
          category: this.categorizeLocation(check),
          area: this.getAreaFromLocation(locId),
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

  private getAreaFromLocation(locId: string): string {
    // Extract area from location ID (e.g., "OOT Kokiri Forest" -> "Kokiri Forest")
    const parts = locId.split(' ')
    if (parts.length > 1) {
      return parts.slice(1).join(' ')
    }
    return locId
  }

  private buildHiddenLocationIds(fixedLocations?: Set<string>): Set<string> {
    const hidden = new Set<string>()
    if (!fixedLocations) return hidden
    for (const loc of fixedLocations) {
      hidden.add(String(loc))
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
    for (const [playerItem, count] of allItems) {
      if (!count || count <= 0) continue
      const itemId = (playerItem as { item?: { id?: string } })?.item?.id
      if (itemId) {
        available.add(itemId)
      }
    }
    return available
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
    return counts
  }
}
