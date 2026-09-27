import { computed, type ComputedRef, type Ref } from 'vue';
import type { LocationInfo } from '@/types/tracker';

type LocationSource = Ref<LocationInfo[]> | ComputedRef<LocationInfo[]>;
type IdSetSource = Ref<Set<string>> | ComputedRef<Set<string>>;

export type LocationIndexEntry = {
  id: string;
  name: string;
  normalizedId: string;
  normalizedBaseId: string;
  normalizedName: string;
};

export function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripWorldSuffix(value: string): string {
  return value.replace(/@\d+$/, '');
}

export function stripGamePrefix(value: string): string {
  return value.replace(/^\s*(?:MM|OOT)(?:\s+|[-_:]+)/i, '');
}

export function formatLocationDisplayName(value: string): string {
  return stripGamePrefix(stripWorldSuffix(value));
}

function addCodeLookup(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }
  map.set(key, new Set([value]));
}

function hasExplicitWorldSuffix(code: string): boolean {
  return /@\d+$/.test(code.trim());
}

/**
 * Candidate lookup keys for a code, in priority order. Shared by the cached
 * and uncached resolution paths so both keep identical semantics.
 */
function codeLookupKeys(code: string): string[] {
  return [
    code,
    normalizeCode(code),
    stripWorldSuffix(code),
    normalizeCode(stripWorldSuffix(code)),
  ];
}

function preferLocalWorld(ids: string[], code: string): string[] {
  if (ids.length <= 1 || hasExplicitWorldSuffix(code)) {
    return ids;
  }

  const localWorldIds = ids.filter((id) => /@0$/.test(id));
  if (localWorldIds.length > 0) {
    return localWorldIds;
  }

  return ids;
}

export function useLocationCodeLookup(
  allLocations: LocationSource,
  reachableIds: IdSetSource,
  collectedIds: IdSetSource,
) {
  const locationIndex = computed<LocationIndexEntry[]>(() => {
    const byId = new Map<string, LocationIndexEntry>();
    for (const location of allLocations.value) {
      if (!location?.id) continue;
      byId.set(location.id, {
        id: location.id,
        name: location.name || location.id,
        normalizedId: normalizeCode(location.id),
        normalizedBaseId: normalizeCode(stripWorldSuffix(location.id)),
        normalizedName: normalizeCode(location.name || ''),
      });
    }
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  });

  // The bulk of the lookup is derived purely from the location index, which
  // only changes when the tracker is (re-)initialized. Keeping it in its own
  // computed means a reachability/collection change (e.g. every inventory
  // mutation) does NOT rebuild the ~6k-entry index — that rebuild used to cost
  // tens of milliseconds per mutation and made grid interactions feel laggy.
  const baseCodeLookup = computed(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of locationIndex.value) {
      addCodeLookup(map, entry.id, entry.id);
      addCodeLookup(map, entry.normalizedId, entry.id);
      addCodeLookup(map, stripWorldSuffix(entry.id), entry.id);
      addCodeLookup(map, entry.normalizedBaseId, entry.id);
      addCodeLookup(map, entry.normalizedName, entry.id);
    }
    return map;
  });

  // Safety net for ids that are reachable/collected but absent from the
  // location index. In practice this set is empty, so the loop is cheap; it
  // only depends on the (small) reachable/collected sets, not the full index.
  const extraCodeLookup = computed(() => {
    const map = new Map<string, Set<string>>();
    const base = baseCodeLookup.value;
    const addIfUnknown = (checkId: string) => {
      if (base.has(checkId)) return;
      addCodeLookup(map, checkId, checkId);
      addCodeLookup(map, normalizeCode(checkId), checkId);
      const baseName = stripWorldSuffix(checkId);
      addCodeLookup(map, baseName, checkId);
      addCodeLookup(map, normalizeCode(baseName), checkId);
    };
    reachableIds.value.forEach(addIfUnknown);
    collectedIds.value.forEach(addIfUnknown);
    return map;
  });

  // Memoize per-code resolution. The map renders thousands of marker codes and
  // re-resolves them on every reachability/collection change, so without a
  // cache each render pays the regex normalization cost thousands of times.
  //
  // The cache is keyed on the *base* table only. The extra table changes on
  // every reachability/collection update, so keying on it would invalidate the
  // cache on every mutation and defeat the purpose. Since the extra table is
  // empty in practice, the common path is fully cached; the rare non-empty
  // path falls back to an uncached union that preserves the original
  // key-priority semantics.
  let cachedBase: Map<string, Set<string>> | null = null;
  const baseResolveCache = new Map<string, string[]>();

  function resolveFromBase(code: string): string[] {
    const base = baseCodeLookup.value;
    if (base !== cachedBase) {
      cachedBase = base;
      baseResolveCache.clear();
    }

    const cached = baseResolveCache.get(code);
    if (cached) return cached;

    let result: string[] = [];
    for (const key of codeLookupKeys(code)) {
      const values = base.get(key);
      if (values && values.size > 0) {
        result = preferLocalWorld(Array.from(values), code);
        break;
      }
    }

    baseResolveCache.set(code, result);
    return result;
  }

  function resolveCodeToCheckIds(code: string): string[] {
    const extra = extraCodeLookup.value;
    if (extra.size === 0) {
      return resolveFromBase(code);
    }

    // Rare path: some reachable/collected id is missing from the location
    // index. Union both tables while preserving the original key priority.
    const base = baseCodeLookup.value;
    for (const key of codeLookupKeys(code)) {
      const baseValues = base.get(key);
      const extraValues = extra.get(key);
      if (!baseValues && !extraValues) continue;

      const values =
        baseValues && extraValues
          ? new Set([...baseValues, ...extraValues])
          : (baseValues ?? extraValues)!;
      if (values.size > 0) {
        return preferLocalWorld(Array.from(values), code);
      }
    }
    return [];
  }

  return {
    locationIndex,
    resolveCodeToCheckIds,
  };
}
