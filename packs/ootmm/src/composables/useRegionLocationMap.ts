import { computed, type Ref } from 'vue';
import type { TrackerPack } from '@/types/tracker';

export type RegionLocationMap = {
  /** Canonical direction: location full ID → hint region ID. */
  locationIdToRegion: Map<string, string>;
  /** Reverse direction: hint region ID → set of location full IDs. */
  regionToLocationIds: Map<string, Set<string>>;
};

/**
 * Derive the reverse (region → locations) direction from a location → region
 * map. Exported separately so it can be unit-tested without Vue.
 */
export function buildRegionLocationMap(
  locationIdToRegion: Map<string, string>,
): RegionLocationMap {
  const regionToLocationIds = new Map<string, Set<string>>();
  for (const [locationId, region] of locationIdToRegion) {
    const ids = regionToLocationIds.get(region);
    if (ids) {
      ids.add(locationId);
    } else {
      regionToLocationIds.set(region, new Set([locationId]));
    }
  }
  return { locationIdToRegion, regionToLocationIds };
}

/**
 * Reactive location ↔ hint-region mapping, sourced from the tracker pack's
 * post-entrance-pass region map. Recomputes whenever `version` changes, which
 * the session store bumps after every tracker (re-)initialization.
 */
export function useRegionLocationMap(
  tracker: Ref<TrackerPack | null>,
  version: Ref<number>,
) {
  const locationIdToRegion = computed<Map<string, string>>(() => {
    void version.value;
    return tracker.value?.getLocationRegionMap?.() ?? new Map<string, string>();
  });

  const regionToLocationIds = computed<Map<string, Set<string>>>(
    () => buildRegionLocationMap(locationIdToRegion.value).regionToLocationIds,
  );

  return { locationIdToRegion, regionToLocationIds };
}
