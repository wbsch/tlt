import ootKokiriForest from './oot_kokiri_forest.json'
import ootDekuTree from './oot_deku_tree.json'
import type { MapDef } from './types'

const MAP_DEFS: MapDef[] = [ootKokiriForest as MapDef, ootDekuTree as MapDef]

export const OOTMM_MAP_DEFS = MAP_DEFS
export const OOTMM_MAP_DEFS_BY_ID = new Map(MAP_DEFS.map((mapDef) => [mapDef.id, mapDef]))
