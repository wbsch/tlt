export function sanitizeAutotrackerCount(value: number | undefined): number {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.floor(numericValue));
}

function clampAutotrackerCount(
  itemId: string,
  count: number,
  itemMaxCounts: ReadonlyMap<string, number>,
): number {
  const configuredMax = sanitizeAutotrackerCount(itemMaxCounts.get(itemId));
  if (configuredMax <= 0) {
    return count;
  }

  return Math.min(count, configuredMax);
}

export function buildAutotrackerInventorySnapshot(
  remoteInventory: Record<string, number>,
  itemMaxCounts: ReadonlyMap<string, number>,
  excludedItemIds?: ReadonlySet<string>,
): Map<string, number> {
  const snapshot = new Map<string, number>();

  for (const [itemId, value] of Object.entries(remoteInventory)) {
    if (excludedItemIds?.has(itemId)) {
      continue;
    }

    const count = clampAutotrackerCount(
      itemId,
      sanitizeAutotrackerCount(value),
      itemMaxCounts,
    );
    if (count <= 0) {
      continue;
    }

    snapshot.set(itemId, count);
  }

  return snapshot;
}

interface MergeAutotrackerInventoryUpdateOptions {
  currentInventory: ReadonlyMap<string, number>;
  previousRemoteInventory: Record<string, number>;
  nextRemoteInventory: Record<string, number>;
  itemMaxCounts: ReadonlyMap<string, number>;
  excludedItemIds?: ReadonlySet<string>;
  /**
   * Items that represent permanent unlocks synthesized from volatile signal
   * items (e.g. bombchu bags, key rings).  When one of these items is absent
   * from `nextRemoteInventory` it is treated as a transient glitch rather than
   * a genuine loss — no negative delta is applied.
   */
  derivedItemIds?: ReadonlySet<string>;
}

export function mergeAutotrackerInventoryUpdate({
  currentInventory,
  previousRemoteInventory,
  nextRemoteInventory,
  itemMaxCounts,
  excludedItemIds,
  derivedItemIds,
}: MergeAutotrackerInventoryUpdateOptions): Map<string, number> {
  const nextInventory = new Map<string, number>();
  for (const [itemId, count] of currentInventory) {
    const sanitizedCount = sanitizeAutotrackerCount(count);
    if (sanitizedCount <= 0) {
      continue;
    }

    nextInventory.set(itemId, sanitizedCount);
  }
  const itemIds = new Set<string>([
    ...Object.keys(previousRemoteInventory),
    ...Object.keys(nextRemoteInventory),
  ]);

  for (const itemId of itemIds) {
    if (excludedItemIds?.has(itemId)) {
      continue;
    }

    // Derived items (bombchu bags, key rings, skeleton keys, etc.) are
    // synthesized from volatile signal items.  When a signal item
    // transiently reads as 0 (shared-save parse failure, scene transition),
    // the derived item disappears from the remote snapshot.  Treating that
    // as a genuine loss would incorrectly un-mark the item in the tracker.
    // Skip the delta entirely when a derived item is absent from the
    // incoming snapshot — permanent unlocks should never be decremented.
    if (derivedItemIds?.has(itemId) && !(itemId in nextRemoteInventory)) {
      continue;
    }

    const previousCount = sanitizeAutotrackerCount(
      previousRemoteInventory[itemId],
    );
    const nextRemoteCount = sanitizeAutotrackerCount(
      nextRemoteInventory[itemId],
    );
    const delta = nextRemoteCount - previousCount;
    if (delta === 0) {
      continue;
    }

    const currentCount = sanitizeAutotrackerCount(nextInventory.get(itemId));
    const nextCount = clampAutotrackerCount(
      itemId,
      Math.max(0, currentCount + delta),
      itemMaxCounts,
    );

    if (nextCount > 0) {
      nextInventory.set(itemId, nextCount);
    } else {
      nextInventory.delete(itemId);
    }
  }

  return nextInventory;
}

interface MergeAutotrackerCollectedLocationsUpdateOptions {
  currentCollectedLocationIds: Iterable<string>;
  previousRemoteCollectedLocationIds: ReadonlySet<string>;
  nextRemoteCollectedLocationIds: ReadonlySet<string>;
}

export function mergeAutotrackerCollectedLocationsUpdate({
  currentCollectedLocationIds,
  previousRemoteCollectedLocationIds,
  nextRemoteCollectedLocationIds,
}: MergeAutotrackerCollectedLocationsUpdateOptions): string[] {
  const nextCollectedLocationIds = new Set(currentCollectedLocationIds);

  for (const locationId of nextRemoteCollectedLocationIds) {
    if (previousRemoteCollectedLocationIds.has(locationId)) {
      continue;
    }

    nextCollectedLocationIds.add(locationId);
  }

  return Array.from(nextCollectedLocationIds);
}
