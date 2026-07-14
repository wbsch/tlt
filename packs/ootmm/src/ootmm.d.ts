// Type declarations for OoTMM imports
// This file allows TypeScript to accept OoTMM imports without type checking them

declare module '@ootmm/core/logic/index' {
  import type { World } from '@ootmm/core/logic/world';
  export function worldState(
    monitor: unknown,
    opts: unknown,
  ): Promise<{
    worlds: World[];
    fixedLocations?: unknown;
    allItems?: unknown;
    startingItems?: unknown;
    [key: string]: unknown;
  }>;
}

declare module '@ootmm/core/logic/pathfind' {
  export type PathfinderState = {
    locations: Set<string>;
    newLocations: Set<string>;
    goal: boolean;
    ganonMajora: boolean;
    started: boolean;
    gossips: Set<string>[];
    [key: string]: unknown;
  };

  export class Pathfinder {
    constructor(worlds: unknown[], settings: unknown, startingItems: unknown);
    run(state: PathfinderState | null, options?: unknown): PathfinderState;
  }
}

declare module '@ootmm/core/logic/locations' {
  export function makeLocation(id: string, worldId: number): string;
  export function locationData(loc: string): { id: string; world: number };
  export function isLocationInDungeon(scene: string): boolean;
  export function isLocationOtherFairy(world: unknown, loc: string): boolean;
}

declare module '@ootmm/core/logic/is-shuffled' {
  export function isShuffled(
    settings: unknown,
    world: unknown,
    loc: string,
    dungeonLocations?: Set<string>,
  ): boolean;
}

declare module '@ootmm/core/logic/expr' {
  export function exprTrue(): unknown;
}

declare module '@ootmm/core/logic/entrance' {
  import type { World } from '@ootmm/core/logic/world';
  export function logicPassEntrances(worldData: unknown): { worlds: World[] };
  export const DUNGEON_ENTRANCES: readonly string[];
}

declare module '@ootmm/core/items/index' {
  export type PlayerItem = {
    item: { id: string; [key: string]: unknown };
    player: number | 'all';
    [key: string]: unknown;
  };
  export type PlayerItems = Map<PlayerItem, number>;
  export function makePlayerItem(item: unknown, player: number): PlayerItem;
  export function itemByID(id: string): unknown;
  export const Items: Record<string, unknown>;
}

declare module '@ootmm/core/monitor' {
  export class Monitor {
    constructor(
      callbacks: {
        onLog?: (msg: string) => void;
        onProgress?: (current: number, total: number) => void;
      },
      silent: boolean,
    );
  }
}

declare module '@ootmm/core/settings/index' {
  export function makeSettings(settings: unknown): Record<string, unknown>;
  export function mergeSettings(
    settings: unknown,
    patch: unknown,
  ): Record<string, unknown>;
  export const SPECIAL_CONDS: Record<string, unknown>;
  export const SPECIAL_CONDS_FIELDS: Record<string, unknown>;
}

declare module '@ootmm/core/settings/data' {
  export const SETTINGS: unknown[];
  export const SUBCATEGORIES: unknown[];
}

declare module '@ootmm/core/settings/tricks' {
  export const TRICKS: Record<string, { name?: string }>;
}

declare module '@ootmm/core/names' {
  export function itemName(id: string): string;
}

declare module '@ootmm/core/logic/world' {
  export type World = {
    areas: Record<
      string,
      {
        exits?: Record<string, unknown>;
        events?: Record<string, unknown>;
        locations?: Record<string, unknown>;
        gossip?: Record<string, unknown>;
        stay?: unknown[] | null;
        game?: string;
        boss?: boolean;
        ageChange?: boolean;
        dungeon?: string | null;
        time?: string;
        region?: string;
      }
    >;
    checks: Record<
      string,
      {
        game?: string;
        scene?: string;
        item?: { id?: string; [key: string]: unknown };
        hint?: string;
        type?: string;
        id?: number | string;
        [key: string]: unknown;
      }
    >;
    dungeons: Record<string, Set<string>>;
    dungeonsBossAreas?: Record<string, Set<string>>;
    regions?: Record<string, string>;
    gossip: Record<string, unknown>;
    checkHints?: Record<string, string[]>;
    locations?: Set<string>;
    songLocations?: Set<string>;
    warpLocations?: Set<string>;
    prices: number[];
    songEventsOot: number[];
    songEventsMm: number[];
    bossIds?: number[];
    entranceOverrides?: Map<string, string>;
    preCompleted: Set<string>;
    [key: string]: unknown;
  };
}

declare module '@ootmm/data' {
  export const POOL: unknown;
  export const WORLD: unknown;
  export const ENTRANCES: Record<
    string,
    {
      game: 'oot' | 'mm';
      id: number;
      type: string;
      from: string;
      to: string;
      flags: string[];
      reverse?: string;
      fromMap: string;
      toMap: string;
      fromSubmap: string;
      toSubmap: string;
      debug?: string[];
      [key: string]: unknown;
    }
  >;
}
