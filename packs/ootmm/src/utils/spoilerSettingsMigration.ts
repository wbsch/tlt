/**
 * Per-key normalization for OoTMM spoiler settings across versions.
 *
 * Scans raw settings for known old keys (v30.1) and translates them
 * one-by-one into their v31.0 equivalents. No version detection — each
 * old key is handled independently so DEV builds with mixed keys work.
 *
 * Also provides cross-game (CrossWarp) item synthesis: when an OoT warp
 * song is collected and the corresponding extension setting is enabled,
 * the MM counterpart is automatically added to the inventory, and vice
 * versa.
 */

// ── CrossWarp mapping tables ────────────────────────────────────────────────

/** OoT warp song → [MM counterpart item, MM extension setting key] */
const CROSS_WARP_OOT_TO_MM: Record<string, [string, string]> = {
  OOT_SONG_TP_FOREST: ['MM_SONG_TP_FOREST', 'songMinuetMm'],
  OOT_SONG_TP_FIRE: ['MM_SONG_TP_FIRE', 'songBoleroMm'],
  OOT_SONG_TP_WATER: ['MM_SONG_TP_WATER', 'songSerenadeMm'],
  OOT_SONG_TP_SHADOW: ['MM_SONG_TP_SHADOW', 'songRequiemMm'],
  OOT_SONG_TP_SPIRIT: ['MM_SONG_TP_SPIRIT', 'songNocturneMm'],
  OOT_SONG_TP_LIGHT: ['MM_SONG_TP_LIGHT', 'songPreludeMm'],
};

/** MM item → [OoT counterpart item, OoT extension setting key] */
const CROSS_WARP_MM_TO_OOT: Record<string, [string, string]> = {
  MM_SONG_SOARING: ['OOT_SONG_SOARING', 'songSoaringOot'],
};

// ── Normalization ───────────────────────────────────────────────────────────

/**
 * Per-key normalization: scans raw settings for known old keys and
 * translates them one-by-one into their v31.0 equivalents.
 *
 * No version detection — each old key is handled independently.
 * DEV builds with a mix of old and new keys work correctly.
 */
export function normalizeSpoilerSettings(
  rawSettings: Record<
    string,
    string | number | boolean | Record<string, unknown>
  >,
): Record<string, string | number | boolean | Record<string, unknown>> {
  const result = { ...rawSettings };

  // ── crossWarpOot → individual song*Mm extensions ──
  if ('crossWarpOot' in result) {
    if (result.crossWarpOot === true) {
      result.songMinuetMm = true;
      result.songBoleroMm = true;
      result.songSerenadeMm = true;
      result.songRequiemMm = true;
      result.songNocturneMm = true;
      result.songPreludeMm = true;
    }
    delete result.crossWarpOot;
  }

  // ── crossWarpMm → songSoaringOot + agelessSoaring ──
  if ('crossWarpMm' in result) {
    const value = String(result.crossWarpMm ?? 'none');
    delete result.crossWarpMm;
    if (value === 'childOnly') {
      result.songSoaringOot = true;
      result.agelessSoaring = false;
    } else if (value === 'full') {
      result.songSoaringOot = true;
      result.agelessSoaring = true;
    }
    // 'none': both stay at their current value (or false if absent)
  }

  // ── progressiveGoronLullaby → progressiveGoronLullabyMm ──
  if ('progressiveGoronLullaby' in result) {
    result.progressiveGoronLullabyMm = result.progressiveGoronLullaby;
    delete result.progressiveGoronLullaby;
  }

  // ── sunSongMm → songSunMm ──
  if ('sunSongMm' in result) {
    result.songSunMm = result.sunSongMm;
    delete result.sunSongMm;
  }

  // ── clearStateDungeonsMm (v30.1 enum) → set format (v31.0) ──
  if ('clearStateDungeonsMm' in result) {
    const current = result.clearStateDungeonsMm;
    // Only legacy enum strings need migration. The v31.0 set format
    // ({ type: 'none' } / { type: 'all' } / { type: 'specific', values: [...] })
    // is already canonical and must pass through unchanged — otherwise a
    // default-valued { type: 'none' } gets stringified to "[object Object]"
    // and is wrongly dropped.
    if (typeof current === 'string') {
      delete result.clearStateDungeonsMm;
      if (current === 'both') {
        result.clearStateDungeonsMm = {
          type: 'specific',
          values: ['WF', 'GB'],
        };
      } else if (current === 'WF' || current === 'GB') {
        result.clearStateDungeonsMm = { type: 'specific', values: [current] };
      }
      // 'none' → omit (equivalent to { type: 'none' }, which is the default)
    }
  }

  // ── moon (wasn't in older versions; default to 'custom' to reproduce old behavior) ──
  if (!('moon' in result)) {
    result.moon = 'custom';
  }

  return result;
}

/**
 * Returns true if the raw settings contain at least one known legacy key
 * that `normalizeSpoilerSettings` would translate.
 */
export function hasLegacyKeys(rawSettings: Record<string, unknown>): boolean {
  return (
    'crossWarpOot' in rawSettings ||
    'crossWarpMm' in rawSettings ||
    'progressiveGoronLullaby' in rawSettings ||
    'sunSongMm' in rawSettings ||
    'clearStateDungeonsMm' in rawSettings
  );
}

/**
 * Returns true if the raw settings contain the legacy `crossWarpOot` setting
 * that requires OoT→MM cross-warp item synthesis.
 *
 * Only old spoiler logs with this key need the MM counterpart items to be
 * synthesized when an OoT warp song is collected.
 */
export function hasLegacyCrossWarpOot(
  rawSettings: Record<string, unknown>,
): boolean {
  return 'crossWarpOot' in rawSettings;
}

/**
 * Returns true if the raw settings contain the legacy `crossWarpMm` setting
 * that requires MM→OoT cross-warp item synthesis.
 *
 * Only old spoiler logs with this key need the OoT counterpart (Song of
 * Soaring) to be synthesized when MM_SONG_SOARING is collected.
 */
export function hasLegacyCrossWarpMm(
  rawSettings: Record<string, unknown>,
): boolean {
  return 'crossWarpMm' in rawSettings;
}

// ── CrossWarp item synthesis ────────────────────────────────────────────────

/**
 * If `itemId` has a cross-game counterpart that is enabled in settings,
 * return the counterpart item ID. Otherwise return null.
 *
 * Uses NORMALIZED settings (songMinuetMm, songSoaringOot, etc.),
 * which works for both migrated v30.1 sessions and native v31.0 sessions.
 */
export function getCrossWarpCounterpart(
  itemId: string,
  settings: Record<string, unknown>,
): string | null {
  const ootToMm = CROSS_WARP_OOT_TO_MM[itemId];
  if (ootToMm) {
    const [mmItem, mmSetting] = ootToMm;
    if (settings[mmSetting] === true) return mmItem;
    return null;
  }
  const mmToOot = CROSS_WARP_MM_TO_OOT[itemId];
  if (mmToOot) {
    const [ootItem, ootSetting] = mmToOot;
    if (settings[ootSetting] === true) return ootItem;
    return null;
  }
  return null;
}

/**
 * Synthesizes MM counterpart items for OoT warp songs (OoT→MM direction).
 *
 * Only called when the legacy `crossWarpOot` setting was in the spoiler log.
 * - Adds the MM counterpart when the OoT warp song is present and the
 *   corresponding MM extension setting is enabled.
 * - Removes the MM counterpart when the OoT warp song is absent, so
 *   untracking the source cleans up the synthesized counterpart.
 *
 * Returns `true` if at least one item was added or removed.
 */
export function synthesizeOotToMmItemsForInventory(
  inventory: Record<string, number>,
  settings: Record<string, unknown>,
): boolean {
  let changed = false;
  for (const [ootItem, [mmItem, mmSetting]] of Object.entries(
    CROSS_WARP_OOT_TO_MM,
  )) {
    if (inventory[ootItem] && settings[mmSetting] === true) {
      if (!inventory[mmItem]) {
        inventory[mmItem] = 1;
        changed = true;
      }
    } else if (inventory[mmItem]) {
      delete inventory[mmItem];
      changed = true;
    }
  }
  return changed;
}

/**
 * Synthesizes the OoT counterpart item for MM Song of Soaring (MM→OoT
 * direction).
 *
 * Only called when the legacy `crossWarpMm` setting was in the spoiler log.
 * - Adds OOT_SONG_SOARING when MM_SONG_SOARING is present and
 *   `songSoaringOot` is enabled.
 * - Removes OOT_SONG_SOARING when MM_SONG_SOARING is absent, so
 *   untracking the source cleans up the synthesized counterpart.
 *
 * Returns `true` if at least one item was added or removed.
 */
export function synthesizeMmToOotItemsForInventory(
  inventory: Record<string, number>,
  settings: Record<string, unknown>,
): boolean {
  let changed = false;
  for (const [mmItem, [ootItem, ootSetting]] of Object.entries(
    CROSS_WARP_MM_TO_OOT,
  )) {
    if (inventory[mmItem] && settings[ootSetting] === true) {
      if (!inventory[ootItem]) {
        inventory[ootItem] = 1;
        changed = true;
      }
    } else if (inventory[ootItem]) {
      delete inventory[ootItem];
      changed = true;
    }
  }
  return changed;
}

/**
 * Convenience function that runs both OoT→MM and MM→OoT synthesis.
 * Equivalent to calling `synthesizeOotToMmItemsForInventory` and
 * `synthesizeMmToOotItemsForInventory` in sequence.
 *
 * Returns `true` if at least one item was added or removed.
 */
export function synthesizeCrossWarpItemsForInventory(
  inventory: Record<string, number>,
  settings: Record<string, unknown>,
): boolean {
  const changedOot = synthesizeOotToMmItemsForInventory(inventory, settings);
  const changedMm = synthesizeMmToOotItemsForInventory(inventory, settings);
  return changedOot || changedMm;
}

// ── Goron Lullaby progressive folding ───────────────────────────────────────

/**
 * Fold a completed Goron Lullaby full-song ID into stage 2 of the
 * progressive half item.
 *
 * The autotracker reports the completed lullaby via the MM quest bit
 * (`MM_SONG_GORON`) and the OoT shared custom save (`OOT_SONG_GORON`), but
 * in "progressive" mode the item pool holds two copies of the half item
 * (the full lullaby is stage 2) and no full-song ID. If a saved session
 * (localStorage / shared state) was created before this folding existed, it
 * may carry the full-song ID with qty 1 instead of the half item at qty 2.
 *
 * This mirrors the live translation in `translateAutotrackerItems` so the
 * pathfinder doesn't receive an out-of-pool full-song ID. The target half
 * item is chosen from the settings, which deterministically drives the pool:
 *   - shared songs enabled (`sharedSongGoron`) → `SHARED_SONG_GORON_HALF`
 *   - otherwise game-specific (`MM_SONG_GORON_HALF` / `OOT_SONG_GORON_HALF`)
 *
 * Only folds a full-song ID when the corresponding progressive setting is
 * active; otherwise the full-song ID legitimately exists in the pool and is
 * left untouched. Returns `true` if at least one item was folded.
 */
export function foldGoronLullabyForInventory(
  inventory: Record<string, number>,
  settings: Record<string, unknown>,
): boolean {
  let changed = false;

  // If shared songs are enabled and progressive, the pool holds only
  // SHARED_SONG_GORON_HALF. Fold every Goron full-song signal into it.
  if (settings.sharedSongGoron === true) {
    const progressiveMm = settings.progressiveGoronLullabyMm === 'progressive';
    const progressiveOot =
      settings.progressiveGoronLullabyOot === 'progressive';
    const anySignal =
      (inventory['SHARED_SONG_GORON'] ?? 0) > 0 ||
      (inventory['MM_SONG_GORON'] ?? 0) > 0 ||
      (inventory['OOT_SONG_GORON'] ?? 0) > 0;
    if ((progressiveMm || progressiveOot) && anySignal) {
      // Only fold when at least one full-song signal is present; the half
      // item gets stage 2.
      const folded = Math.max(inventory['SHARED_SONG_GORON_HALF'] ?? 0, 2);
      if (folded !== (inventory['SHARED_SONG_GORON_HALF'] ?? 0)) {
        inventory['SHARED_SONG_GORON_HALF'] = folded;
        changed = true;
      }
      delete inventory['SHARED_SONG_GORON'];
      delete inventory['MM_SONG_GORON'];
      delete inventory['OOT_SONG_GORON'];
      changed = true;
    }
    return changed;
  }

  // Non-shared path: fold the game-specific full-song signal into the
  // corresponding half item when that game's setting is progressive.
  const foldMm =
    settings.progressiveGoronLullabyMm === 'progressive' &&
    (inventory['MM_SONG_GORON'] ?? 0) > 0;
  const foldOot =
    settings.progressiveGoronLullabyOot === 'progressive' &&
    (inventory['OOT_SONG_GORON'] ?? 0) > 0;

  if (foldMm) {
    const folded = Math.max(inventory['MM_SONG_GORON_HALF'] ?? 0, 2);
    if (folded !== (inventory['MM_SONG_GORON_HALF'] ?? 0)) {
      inventory['MM_SONG_GORON_HALF'] = folded;
      changed = true;
    }
    delete inventory['MM_SONG_GORON'];
    changed = true;
  }

  if (foldOot) {
    const folded = Math.max(inventory['OOT_SONG_GORON_HALF'] ?? 0, 2);
    if (folded !== (inventory['OOT_SONG_GORON_HALF'] ?? 0)) {
      inventory['OOT_SONG_GORON_HALF'] = folded;
      changed = true;
    }
    delete inventory['OOT_SONG_GORON'];
    changed = true;
  }

  return changed;
}
