// Type declarations for OoTMM imports
// This file allows TypeScript to accept OoTMM imports without type checking them

declare module '@ootmm/core/logic/index' {
  export function worldState(monitor: unknown, opts: unknown): Promise<unknown>
}

declare module '@ootmm/core/logic/pathfind' {
  export class Pathfinder {
    constructor(worlds: unknown[], settings: unknown, startingItems: unknown)
    run(state: unknown, options: unknown): unknown
  }
  export type PathfinderState = unknown
}

declare module '@ootmm/core/logic/locations' {
  export function makeLocation(id: string, worldId: number): string
  export function locationData(loc: string): { id: string; world: number }
  export function isLocationInDungeon(scene: string): boolean
  export function isLocationOtherFairy(world: unknown, loc: string): boolean
}

declare module '@ootmm/core/logic/is-shuffled' {
  export function isShuffled(settings: unknown, world: unknown, loc: string, dungeonLocations?: Set<string>): boolean
}

declare module '@ootmm/core/items/index' {
  export function makePlayerItem(item: unknown, player: number): unknown
  export const Items: Record<string, unknown>
  export type PlayerItems = Map<unknown, number>
  export type PlayerItem = unknown
}

declare module '@ootmm/core/monitor' {
  export class Monitor {
    constructor(callbacks: { onLog?: (msg: string) => void; onProgress?: (current: number, total: number) => void }, silent: boolean)
  }
}

declare module '@ootmm/core/settings/index' {
  export function makeSettings(settings: unknown): unknown
  export function mergeSettings(settings: unknown, patch: unknown): unknown
  export const SPECIAL_CONDS: Record<string, unknown>
  export const SPECIAL_CONDS_FIELDS: Record<string, unknown>
}

declare module '@ootmm/core/settings/data.js' {
  export const SETTINGS: unknown[]
}

declare module '@ootmm/core/names' {
  export function itemName(id: string): string
}

declare module '@ootmm/core/logic/world' {
  export type World = unknown
}
