// ── Human-readable region names for OoTMM ──
// Display names come from OoTMM's own `regionName()` (generator, forwarded
// through the '@ootmm/data' bridge) and the list of selectable region IDs from
// OoTMM's `REGIONS` registry, so the tracker stays in sync with the randomizer
// instead of keeping a hand-maintained copy.

import { REGIONS, regionName } from '@ootmm/data';

// Region markers that are not selectable hint regions. ENTRANCE / BUFFER /
// BUFFER_DELAYED are transient values used only during entrance-region
// propagation and never appear in the REGIONS registry.
const REGION_MARKERS = new Set(['NONE', 'NAMELESS', 'POCKET']);

/** All region IDs that can be selected in comboboxes (excludes markers). */
export const SELECTABLE_REGION_IDS = Object.keys(REGIONS).filter(
  (id) => !REGION_MARKERS.has(id),
);

/** Get the display name for a region ID (e.g. "OOT_KOKIRI_FOREST" → "Kokiri Forest"). */
export function getRegionDisplayName(regionId: string): string {
  return regionName(regionId);
}

/**
 * True when the given region ID is a valid hint region (i.e. one that can be
 * selected in comboboxes). Excludes the placeholder/marker values used by the
 * OoTMM world graph: NONE, NAMELESS, POCKET, ENTRANCE, BUFFER, BUFFER_DELAYED.
 */
export function isValidHintRegion(
  region: string | undefined,
): region is string {
  return typeof region === 'string' && SELECTABLE_REGION_IDS.includes(region);
}

/** Build an array of { value: regionId, label: displayName } for combobox use. */
export function getRegionOptions(): Array<{ value: string; label: string }> {
  return SELECTABLE_REGION_IDS.map((id) => ({
    value: id,
    label: getRegionDisplayName(id),
  })).sort((a, b) => a.label.localeCompare(b.label));
}
