import { computed, type ComputedRef, type Ref } from 'vue'
import type { LocationInfo } from '@/types/tracker'

type LocationSource = Ref<LocationInfo[]> | ComputedRef<LocationInfo[]>
type IdSetSource = Ref<Set<string>> | ComputedRef<Set<string>>

export type LocationIndexEntry = {
  id: string
  name: string
  normalizedId: string
  normalizedBaseId: string
  normalizedName: string
}

export function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function stripWorldSuffix(value: string): string {
  return value.replace(/@\d+$/, '')
}

export function stripGamePrefix(value: string): string {
  return value.replace(/^\s*(?:MM|OOT)(?:\s+|[-_:]+)/i, '')
}

export function formatLocationDisplayName(value: string): string {
  return stripGamePrefix(stripWorldSuffix(value))
}

function addCodeLookup(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!key) return
  const existing = map.get(key)
  if (existing) {
    existing.add(value)
    return
  }
  map.set(key, new Set([value]))
}

export function useLocationCodeLookup(
  allLocations: LocationSource,
  reachableIds: IdSetSource,
  collectedIds: IdSetSource,
) {
  const locationIndex = computed<LocationIndexEntry[]>(() => {
    const byId = new Map<string, LocationIndexEntry>()
    for (const location of allLocations.value) {
      if (!location?.id) continue
      byId.set(location.id, {
        id: location.id,
        name: location.name || location.id,
        normalizedId: normalizeCode(location.id),
        normalizedBaseId: normalizeCode(stripWorldSuffix(location.id)),
        normalizedName: normalizeCode(location.name || ''),
      })
    }
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
  })

  const knownLocationIds = computed(() => {
    const ids = new Set<string>()
    locationIndex.value.forEach((entry) => ids.add(entry.id))
    reachableIds.value.forEach((id) => ids.add(id))
    collectedIds.value.forEach((id) => ids.add(id))
    return ids
  })

  const codeLookup = computed(() => {
    const map = new Map<string, Set<string>>()
    for (const entry of locationIndex.value) {
      addCodeLookup(map, entry.id, entry.id)
      addCodeLookup(map, entry.normalizedId, entry.id)
      addCodeLookup(map, stripWorldSuffix(entry.id), entry.id)
      addCodeLookup(map, entry.normalizedBaseId, entry.id)
      addCodeLookup(map, entry.normalizedName, entry.id)
    }
    for (const checkId of knownLocationIds.value) {
      addCodeLookup(map, checkId, checkId)
      addCodeLookup(map, normalizeCode(checkId), checkId)
      const baseName = stripWorldSuffix(checkId)
      addCodeLookup(map, baseName, checkId)
      addCodeLookup(map, normalizeCode(baseName), checkId)
    }
    return map
  })

  function resolveCodeToCheckIds(code: string): string[] {
    const keys = [code, normalizeCode(code), stripWorldSuffix(code), normalizeCode(stripWorldSuffix(code))]
    for (const key of keys) {
      const values = codeLookup.value.get(key)
      if (values && values.size > 0) {
        return Array.from(values)
      }
    }
    return []
  }

  return {
    locationIndex,
    resolveCodeToCheckIds,
  }
}
