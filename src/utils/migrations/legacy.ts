import { migrateEntranceOverrides } from '@/utils/entranceMigration';
import {
  foldGoronLullabyForInventory,
  hasLegacyCrossWarpMm,
  hasLegacyCrossWarpOot,
  normalizeSpoilerSettings,
} from '@packs/ootmm/utils/spoilerSettingsMigration';
import {
  SECRET_SHRINE_RENAME_MAP,
  renameLocationFields,
} from './locationRenames';
import type { PersistedStorePayload, StateMigration } from './index';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') continue;
    next[key] = entry;
  }
  return next;
}

const VALID_RIGHT_SIDEBAR_TABS = new Set(['locations', 'entrances']);

/**
 * v1 → v2 legacy bundle.
 *
 * Legacy payloads were never version-tagged, so we cannot tell which of the
 * old inline transforms a given payload has already seen. The transforms below
 * were always applied together at hydrate time and are idempotent, so they are
 * bundled into a single `1 → 2` step. Every transform is field-guarded, making
 * the step a no-op for store fields it does not own.
 *
 * Ordering matters:
 * - M1 (ER structure) reads `erDecoupled` from the raw settings and is
 *   independent of the other transforms.
 * - M-flag captures the cross-warp synthesis decision from the legacy
 *   `crossWarpOot` / `crossWarpMm` keys, so it MUST run before M2 deletes them.
 * - M2 (settings normalization) must run before M3 because
 *   `foldGoronLullabyForInventory` reads the *normalized* progressive keys.
 * - M3 (Goron Lullaby folding) runs last.
 * - M4 (Secret Shrine pot renames) is independent of M1–M3 and applies to
 *   different fields, so it can run anywhere; it is placed last for clarity.
 */
export const legacyV1ToV2: StateMigration = {
  version: 1,
  up(state) {
    const next: PersistedStorePayload = { ...state };

    // M1 — old ER structure → new ER structure (add missing coupled reverse
    // entranceOverrides entries). Skipped in decoupled mode, where a missing
    // reverse entry is intentional.
    if (isPlainObject(next.entranceOverrides)) {
      const decoupled = Boolean(
        (next.trackerSettings as Record<string, unknown> | undefined)
          ?.erDecoupled,
      );
      if (!decoupled) {
        next.entranceOverrides = migrateEntranceOverrides(
          stringRecord(next.entranceOverrides),
        );
      }
    }

    // M-flag — record the cross-warp synthesis decision BEFORE M2 runs. The
    // legacy `crossWarpOot` / `crossWarpMm` keys are the only signal that the
    // post-migration hydrate must synthesize counterpart items; M2 deletes
    // them, so the flags must be captured on the raw settings here.
    if (isPlainObject(next.trackerSettings)) {
      if (hasLegacyCrossWarpOot(next.trackerSettings)) {
        next.needsLegacyCrossWarpOotSynthesis = true;
      }
      if (hasLegacyCrossWarpMm(next.trackerSettings)) {
        next.needsLegacyCrossWarpMmSynthesis = true;
      }
    }

    // M2 — v30.1 settings → v31.0 settings.
    if (isPlainObject(next.trackerSettings)) {
      next.trackerSettings = normalizeSpoilerSettings(
        next.trackerSettings as Record<
          string,
          string | number | boolean | Record<string, unknown>
        >,
      );
    }

    // M3 — `*_GORON_SONG` → `2× *_SONG_GORON_HALF` (progressive Goron Lullaby
    // folding). The fold is guarded internally ("only fold a full-song ID when
    // present"), so it is idempotent.
    if (
      isPlainObject(next.inventoryById) &&
      isPlainObject(next.trackerSettings)
    ) {
      foldGoronLullabyForInventory(
        next.inventoryById as Record<string, number>,
        next.trackerSettings,
      );
    }

    // ui-sidebar merge — `isEntrancesSidebarOpen` / `isLocationsSidebarOpen` →
    // `isRightSidebarOpen` (+ derive `activeRightSidebarTab`), ootmm-ui store.
    // Only present in legacy ootmm-ui payloads, so this is a no-op elsewhere.
    if (
      next.isEntrancesSidebarOpen === false &&
      next.isLocationsSidebarOpen === false
    ) {
      if (next.isRightSidebarOpen === undefined) {
        next.isRightSidebarOpen = false;
      }
    } else if (
      typeof next.isEntrancesSidebarOpen === 'boolean' ||
      typeof next.isLocationsSidebarOpen === 'boolean'
    ) {
      if (next.isRightSidebarOpen === undefined) {
        next.isRightSidebarOpen =
          next.isEntrancesSidebarOpen === true ||
          next.isLocationsSidebarOpen === true;
      }
    }

    if (
      typeof next.activeRightSidebarTab !== 'string' ||
      !VALID_RIGHT_SIDEBAR_TABS.has(next.activeRightSidebarTab)
    ) {
      if (next.isEntrancesSidebarOpen === true) {
        next.activeRightSidebarTab = 'entrances';
      } else if (next.isLocationsSidebarOpen === true) {
        next.activeRightSidebarTab = 'locations';
      }
    }

    delete next.isEntrancesSidebarOpen;
    delete next.isLocationsSidebarOpen;

    // M4 — Secret Shrine pot renames (v30.1 → v31.0). Same era as the rest of
    // this legacy bundle; the rename was simply forgotten when the bundle was
    // written. The map has no rename chains, so this transform is idempotent.
    return renameLocationFields(next, SECRET_SHRINE_RENAME_MAP);

    // NOTE: the actual cross-warp synthesis (inventory mutation) is NOT part of
    // this step (Decision 2) — only the *flag capture* above. Synthesis stays a
    // post-migration hydrate step, driven by needsLegacyCrossWarp*Synthesis.
  },
};
