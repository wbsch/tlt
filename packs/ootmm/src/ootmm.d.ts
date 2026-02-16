// Type declarations for OoTMM imports
// This file allows TypeScript to accept OoTMM imports without type checking them

declare module '@ootmm/core/logic/index' {
  export function worldState(monitor: any, opts: any): Promise<any>
}

declare module '@ootmm/core/logic/pathfind' {
  export class Pathfinder {
    constructor(worlds: any[], settings: any, startingItems: any)
    run(state: any, options: any): any
  }
  export type PathfinderState = any
}

declare module '@ootmm/core/logic/locations' {
  export function makeLocation(id: string, worldId: number): string
  export function locationData(loc: string): { id: string; world: number }
  export function isLocationInDungeon(scene: string): boolean
  export function isLocationOtherFairy(world: any, loc: string): boolean
}

declare module '@ootmm/core/logic/is-shuffled' {
  export function isShuffled(settings: any, world: any, loc: string, dungeonLocations?: Set<string>): boolean
}

declare module '@ootmm/core/logic/expr' {
  export function exprTrue(): any
}

declare module '@ootmm/core/logic/entrance' {
  export class LogicPassEntrances {
    constructor(worldData: any)
    run(): { worlds: any[] }
  }
}

declare module '@ootmm/core/items/index' {
  export function makePlayerItem(item: any, player: number): any
  export function itemByID(id: string): any
  export const Items: Record<string, any>
  export type PlayerItems = Map<any, number>
  export type PlayerItem = any
}

declare module '@ootmm/core/monitor' {
  export class Monitor {
    constructor(callbacks: { onLog?: (msg: string) => void; onProgress?: (current: number, total: number) => void }, silent: boolean)
  }
}

declare module '@ootmm/core/settings/index' {
  export function makeSettings(settings: any): any
  export function mergeSettings(settings: any, patch: any): any
  export const SPECIAL_CONDS: Record<string, any>
  export const SPECIAL_CONDS_FIELDS: Record<string, any>
}

declare module '@ootmm/core/settings/data.js' {
  export const SETTINGS: any[]
  export const SUBCATEGORIES: any[]
}

declare module '@ootmm/core/settings/tricks' {
  export const TRICKS: Record<string, { name?: string }>
}

declare module '@ootmm/core/names' {
  export function itemName(id: string): string
}

declare module '@ootmm/core/logic/world' {
  export type World = any
}

declare module '@ootmm/data' {
  export const POOL: any
  export const WORLD: any
}
