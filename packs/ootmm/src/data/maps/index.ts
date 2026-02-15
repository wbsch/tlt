import type { MapDef } from './types'

// Automatically import all JSON files in this directory
const mapModules = import.meta.glob<MapDef>('./*.json', { eager: true, import: 'default' })

const MAP_DEFS: MapDef[] = Object.values(mapModules)

export const OOTMM_MAP_DEFS = MAP_DEFS
export const OOTMM_MAP_DEFS_BY_ID = new Map(MAP_DEFS.map((mapDef) => [mapDef.id, mapDef]))
