import type { LocationInfo } from '@/types/tracker'
import type { CollectionFilter, ReachabilityFilter } from '../stores/ootmmUi'

export type LocationVisibilityFilters = {
  searchQuery: string
  selectedCategory: string
  reachabilityFilter: ReachabilityFilter
  collectionFilter: CollectionFilter
  showUnshuffled: boolean
}

function isToggleEligibleWhenUnshuffled(location: LocationInfo): boolean {
  return Boolean(location.isSkulltulaToken || location.isStrayFairy)
}

export function matchesLocationBaseVisibility(
  location: LocationInfo,
  filters: LocationVisibilityFilters,
): boolean {
  const matchesShuffle =
    location.isShuffled !== false
    || location.showWhenUnshuffled
    || (filters.showUnshuffled && isToggleEligibleWhenUnshuffled(location))
  const matchesSearch = location.name.toLowerCase().includes(filters.searchQuery.toLowerCase())
  const matchesCategory =
    filters.selectedCategory === 'all' || location.category === filters.selectedCategory

  return matchesShuffle && matchesSearch && matchesCategory
}

export function matchesLocationReachabilityVisibility(
  locationId: string,
  reachableIds: ReadonlySet<string>,
  reachabilityFilter: ReachabilityFilter,
): boolean {
  if (reachabilityFilter === 'reachable') return reachableIds.has(locationId)
  if (reachabilityFilter === 'unreachable') return !reachableIds.has(locationId)
  return true
}

export function matchesLocationCollectionVisibility(
  locationId: string,
  collectedIds: ReadonlySet<string>,
  collectionFilter: CollectionFilter,
): boolean {
  if (collectionFilter === 'collected') return collectedIds.has(locationId)
  if (collectionFilter === 'uncollected') return !collectedIds.has(locationId)
  return true
}

export function isLocationVisibleInSidebar(
  location: LocationInfo,
  filters: LocationVisibilityFilters,
  reachableIds: ReadonlySet<string>,
  collectedIds: ReadonlySet<string>,
): boolean {
  return (
    matchesLocationBaseVisibility(location, filters)
    && matchesLocationReachabilityVisibility(location.id, reachableIds, filters.reachabilityFilter)
    && matchesLocationCollectionVisibility(location.id, collectedIds, filters.collectionFilter)
  )
}
