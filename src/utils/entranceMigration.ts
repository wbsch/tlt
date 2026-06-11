import { computeCoupledReverse } from '@packs/ootmm/utils/entranceRandomization';

/**
 * Check whether any entry in `overrides` has a coupled reverse edge that is
 * missing. One-way warps (no reverse) are naturally excluded because
 * `computeCoupledReverse` returns null for them.
 */
export function needsEntranceMigration(
  overrides: Record<string, string>,
): boolean {
  for (const [src, dst] of Object.entries(overrides)) {
    const partner = computeCoupledReverse(src, dst);
    if (partner && !(partner.reverseSrc in overrides)) {
      return true;
    }
  }
  return false;
}

/**
 * Create a new object with all original entries plus any missing coupled
 * reverse entries. Idempotent — safe to call on already-migrated data.
 */
export function migrateEntranceOverrides(
  overrides: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = { ...overrides };
  for (const [src, dst] of Object.entries(overrides)) {
    const partner = computeCoupledReverse(src, dst);
    if (partner && !(partner.reverseSrc in result)) {
      result[partner.reverseSrc] = partner.reverseDst;
    }
  }
  return result;
}

/**
 * Mutates the given object in-place, adding any missing coupled reverse
 * entries. Returns `true` if any entries were added.
 */
export function migrateEntranceOverridesInPlace(
  overrides: Record<string, string>,
): boolean {
  let changed = false;
  for (const [src, dst] of Object.entries(overrides)) {
    const partner = computeCoupledReverse(src, dst);
    if (partner && !(partner.reverseSrc in overrides)) {
      overrides[partner.reverseSrc] = partner.reverseDst;
      changed = true;
    }
  }
  return changed;
}
