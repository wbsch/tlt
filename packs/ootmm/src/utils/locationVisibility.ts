import type { LocationInfo } from '@/types/tracker'
import type { CollectionFilter, ReachabilityFilter } from '../stores/ootmmUi'

export type LocationVisibilityFilters = {
  searchQuery: string
  selectedCategory: string
  reachabilityFilter: ReachabilityFilter
  collectionFilter: CollectionFilter
  showUnshuffled: boolean
}

type SetMembershipFilter = 'all' | 'included' | 'excluded'

function isToggleEligibleWhenUnshuffled(location: LocationInfo): boolean {
  return Boolean(location.isSkulltulaToken || location.isStrayFairy)
}

function matchesSetMembership(
  locationId: string,
  idSet: ReadonlySet<string>,
  filter: SetMembershipFilter,
): boolean {
  if (filter === 'included') return idSet.has(locationId)
  if (filter === 'excluded') return !idSet.has(locationId)
  return true
}

export function matchesLocationBaseVisibility(
  location: LocationInfo,
  filters: LocationVisibilityFilters,
): boolean {
  const searchQuery = filters.searchQuery.toLowerCase()
  const matchesShuffle =
    location.isShuffled !== false
    || location.showWhenUnshuffled
    || (filters.showUnshuffled && isToggleEligibleWhenUnshuffled(location))
  const matchesSearch = location.name.toLowerCase().includes(searchQuery)
  const matchesCategory =
    filters.selectedCategory === 'all' || location.category === filters.selectedCategory

  return matchesShuffle && matchesSearch && matchesCategory
}

export function matchesLocationReachabilityVisibility(
  locationId: string,
  reachableIds: ReadonlySet<string>,
  reachabilityFilter: ReachabilityFilter,
): boolean {
  const membershipFilter: SetMembershipFilter =
    reachabilityFilter === 'reachable'
      ? 'included'
      : reachabilityFilter === 'unreachable'
        ? 'excluded'
        : 'all'
  return matchesSetMembership(locationId, reachableIds, membershipFilter)
}

export function matchesLocationCollectionVisibility(
  locationId: string,
  collectedIds: ReadonlySet<string>,
  collectionFilter: CollectionFilter,
): boolean {
  const membershipFilter: SetMembershipFilter =
    collectionFilter === 'collected'
      ? 'included'
      : collectionFilter === 'uncollected'
        ? 'excluded'
        : 'all'
  return matchesSetMembership(locationId, collectedIds, membershipFilter)
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
