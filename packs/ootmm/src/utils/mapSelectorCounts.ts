import { getEdgeReverse } from './entranceRandomization';
import { OOTMM_MAP_DEFS } from '../data/maps';
import type { MapSubmenuEntryDef } from '../data/maps/types';

/**
 * Normalize a code value that may be a single string, an array, or undefined
 * into an array of non-empty trimmed strings.
 */
export function normalizeMapCodeList(
  rawCodes: string | string[] | undefined,
): string[] {
  const rawList = Array.isArray(rawCodes) ? rawCodes : [rawCodes ?? ''];
  return rawList.map((code) => code.trim()).filter((code) => code.length > 0);
}

/**
 * Static lookup: entrance ID → check codes from map marker definitions.
 * For each entrance with markers on a map, stores the codes of checks
 * behind that entrance.
 */
export const ENTRANCE_CHECK_CODES_BY_ID: ReadonlyMap<
  string,
  MapSubmenuEntryDef[]
> = (() => {
  const byId = new Map<string, MapSubmenuEntryDef[]>();
  for (const mapDef of OOTMM_MAP_DEFS) {
    for (const markerDef of mapDef.markers) {
      if (markerDef.type !== 'submenu' || !markerDef.entranceMenu) continue;
      if (!Array.isArray(markerDef.markers) || markerDef.markers.length === 0)
        continue;
      const entranceIds = (markerDef.entranceMenu.entranceIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (entranceIds.length === 0) continue;
      const entries: MapSubmenuEntryDef[] = markerDef.markers
        .filter((e) => e.anchored !== true)
        .map((e) => ({
          image: e.image,
          overlays: e.overlays,
          codes: e.codes,
          visibleWhen: e.visibleWhen,
          anchored: e.anchored,
        }));
      for (const entranceId of entranceIds) {
        const existing = byId.get(entranceId);
        if (existing) {
          existing.push(...entries);
        } else {
          byId.set(entranceId, [...entries]);
        }
      }
    }
  }
  return byId;
})();

/**
 * Resolve entrance-bound submenu marker codes to raw check code strings.
 *
 * For each entrance ID in `markerEntranceIds`, looks up the effective
 * destination entrance via `overrides` (ER mapping).
 *
 * - If the entrance is in an active ER pool (`activeEntranceIds`), an
 *   explicit override is required — without one the entrance could be
 *   shuffled somewhere unknown, so no codes are produced.
 * - If the entrance is NOT in an active pool, falls back to the source
 *   entrance ID itself (vanilla location), ensuring entrance-bound
 *   submenu markers outside active ER pools still contribute their codes.
 *
 * Returns a flat array of raw check code strings that the caller should
 * further resolve to actual check IDs.
 */
export function resolveEntranceBoundCodes(
  markerEntranceIds: string[],
  overrides: Record<string, string>,
  activeEntranceIds?: ReadonlySet<string>,
): string[] {
  const codes: string[] = [];
  for (const srcId of markerEntranceIds) {
    const trimmed = srcId.trim();
    if (!trimmed) continue;

    let resolvedEntranceId: string | undefined;
    if (activeEntranceIds?.has(trimmed)) {
      // In an active ER pool — must have an explicit override to resolve
      resolvedEntranceId = overrides[trimmed];
      if (!resolvedEntranceId) continue;
    } else {
      // Not in an active pool — fall back to source entrance (vanilla)
      resolvedEntranceId = overrides[trimmed] || trimmed;
    }
    if (!resolvedEntranceId) continue;

    // Look up check codes by the resolved destination entrance ID.
    // If not found directly, try the reverse (exit→entrance fallback).
    const dstEntries =
      ENTRANCE_CHECK_CODES_BY_ID.get(resolvedEntranceId) ??
      (getEdgeReverse(resolvedEntranceId)
        ? ENTRANCE_CHECK_CODES_BY_ID.get(getEdgeReverse(resolvedEntranceId)!)
        : undefined);
    if (!dstEntries) continue;
    for (const entry of dstEntries) {
      for (const code of normalizeMapCodeList(entry.codes)) {
        codes.push(code);
      }
    }
  }
  return codes;
}
