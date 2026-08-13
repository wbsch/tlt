export interface OoTMMItem {
  id: string;
  name: string;
  category:
    | 'equipment'
    | 'consumable'
    | 'key'
    | 'song'
    | 'mask'
    | 'trade'
    | 'bottle'
    | 'event'
    | 'misc'
    | 'quest'
    | 'trap'
    | 'dungeon'
    | 'token'
    | 'soul';
  game: 'oot' | 'mm' | 'shared';
  icon?: string;
  maxCount?: number;
}

export interface OoTMMLocation {
  id: string;
  name: string;
  category:
    | 'overworld'
    | 'dungeon'
    | 'shop'
    | 'minigame'
    | 'npc'
    | 'cow'
    | 'scrub'
    | 'chest';
  area: string;
  game: 'oot' | 'mm';
  region: string;
  position?: { x: number; y: number };
}

/** A single spoiler log placement, resolved to internal IDs. */
export interface ResolvedSpoilerPlacement {
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  world?: number;
  itemPlayer?: number;
}
