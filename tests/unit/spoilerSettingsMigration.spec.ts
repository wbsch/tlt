import { describe, expect, it } from 'vitest';
import {
  getCrossWarpCounterpart,
  hasLegacyCrossWarpOot,
  hasLegacyCrossWarpMm,
  hasLegacyKeys,
  normalizeSpoilerSettings,
  synthesizeCrossWarpItemsForInventory,
  synthesizeOotToMmItemsForInventory,
  synthesizeMmToOotItemsForInventory,
} from '../../packs/ootmm/src/utils/spoilerSettingsMigration';

describe('normalizeSpoilerSettings', () => {
  it('translates sunSongMm to songSunMm', () => {
    const result = normalizeSpoilerSettings({ sunSongMm: true });
    expect(result).toEqual({ songSunMm: true, moon: 'custom' });
    expect('sunSongMm' in result).toBe(false);
  });

  it('translates sunSongMm with a value other than true', () => {
    const result = normalizeSpoilerSettings({ sunSongMm: false });
    expect(result).toEqual({ songSunMm: false, moon: 'custom' });
    expect('sunSongMm' in result).toBe(false);
  });

  it('translates progressiveGoronLullaby to progressiveGoronLullabyMm', () => {
    const result = normalizeSpoilerSettings({
      progressiveGoronLullaby: 'progressive',
    });
    expect(result).toEqual({
      progressiveGoronLullabyMm: 'progressive',
      moon: 'custom',
    });
    expect('progressiveGoronLullaby' in result).toBe(false);
  });

  it('translates progressiveGoronLullaby with single value', () => {
    const result = normalizeSpoilerSettings({
      progressiveGoronLullaby: 'single',
    });
    expect(result).toEqual({
      progressiveGoronLullabyMm: 'single',
      moon: 'custom',
    });
  });

  it('translates crossWarpOot true to six song*Mm settings', () => {
    const result = normalizeSpoilerSettings({ crossWarpOot: true });
    expect(result.songMinuetMm).toBe(true);
    expect(result.songBoleroMm).toBe(true);
    expect(result.songSerenadeMm).toBe(true);
    expect(result.songRequiemMm).toBe(true);
    expect(result.songNocturneMm).toBe(true);
    expect(result.songPreludeMm).toBe(true);
    expect('crossWarpOot' in result).toBe(false);
  });

  it('ignores crossWarpOot false (removes the key, adds nothing)', () => {
    const result = normalizeSpoilerSettings({ crossWarpOot: false });
    expect('crossWarpOot' in result).toBe(false);
    expect(result.songMinuetMm).toBeUndefined();
  });

  it('translates crossWarpMm full to songSoaringOot + agelessSoaring', () => {
    const result = normalizeSpoilerSettings({ crossWarpMm: 'full' });
    expect(result.songSoaringOot).toBe(true);
    expect(result.agelessSoaring).toBe(true);
    expect('crossWarpMm' in result).toBe(false);
  });

  it('translates crossWarpMm childOnly to songSoaringOot only', () => {
    const result = normalizeSpoilerSettings({ crossWarpMm: 'childOnly' });
    expect(result.songSoaringOot).toBe(true);
    expect(result.agelessSoaring).toBe(false);
    expect('crossWarpMm' in result).toBe(false);
  });

  it('removes crossWarpMm none without adding anything', () => {
    const result = normalizeSpoilerSettings({ crossWarpMm: 'none' });
    expect('crossWarpMm' in result).toBe(false);
    expect(result.songSoaringOot).toBeUndefined();
    expect(result.agelessSoaring).toBeUndefined();
  });

  it('translates clearStateDungeonsMm legacy enum values to the set format', () => {
    expect(normalizeSpoilerSettings({ clearStateDungeonsMm: 'both' })).toEqual({
      clearStateDungeonsMm: { type: 'specific', values: ['WF', 'GB'] },
      moon: 'custom',
    });
    expect(normalizeSpoilerSettings({ clearStateDungeonsMm: 'WF' })).toEqual({
      clearStateDungeonsMm: { type: 'specific', values: ['WF'] },
      moon: 'custom',
    });
    expect(normalizeSpoilerSettings({ clearStateDungeonsMm: 'GB' })).toEqual({
      clearStateDungeonsMm: { type: 'specific', values: ['GB'] },
      moon: 'custom',
    });
  });

  it('omits legacy clearStateDungeonsMm none (equivalent to the default)', () => {
    const result = normalizeSpoilerSettings({ clearStateDungeonsMm: 'none' });
    expect('clearStateDungeonsMm' in result).toBe(false);
    expect(result.moon).toBe('custom');
  });

  it('preserves the new v31.0 clearStateDungeonsMm set format unchanged', () => {
    expect(
      normalizeSpoilerSettings({
        clearStateDungeonsMm: { type: 'none' },
      }),
    ).toEqual({ clearStateDungeonsMm: { type: 'none' }, moon: 'custom' });
    expect(
      normalizeSpoilerSettings({
        clearStateDungeonsMm: { type: 'specific', values: ['GB'] },
      }),
    ).toEqual({
      clearStateDungeonsMm: { type: 'specific', values: ['GB'] },
      moon: 'custom',
    });
    expect(
      normalizeSpoilerSettings({
        clearStateDungeonsMm: { type: 'all' },
      }),
    ).toEqual({ clearStateDungeonsMm: { type: 'all' }, moon: 'custom' });
  });

  it('preserves new v31.0 keys unchanged', () => {
    const result = normalizeSpoilerSettings({
      songMinuetMm: true,
      songSoaringOot: true,
      agelessSoaring: false,
      mode: 'single',
    });
    expect(result).toEqual({
      songMinuetMm: true,
      songSoaringOot: true,
      agelessSoaring: false,
      mode: 'single',
      moon: 'custom',
    });
  });

  it('handles mixed old and new keys (DEV builds)', () => {
    const result = normalizeSpoilerSettings({
      crossWarpOot: true,
      sunSongMm: true,
      mode: 'open',
    });
    // crossWarpOot sets all six song*Mm to true
    expect(result.songMinuetMm).toBe(true);
    expect(result.songBoleroMm).toBe(true);
    // sunSongMm → songSunMm
    expect(result.songSunMm).toBe(true);
    // Old keys removed
    expect('crossWarpOot' in result).toBe(false);
    expect('sunSongMm' in result).toBe(false);
    // Unrelated keys preserved
    expect(result.mode).toBe('open');
    // Missing moon defaults to 'custom'
    expect(result.moon).toBe('custom');
  });

  it('defaults missing moon to custom', () => {
    const result = normalizeSpoilerSettings({ mode: 'single' });
    expect(result.moon).toBe('custom');
  });

  it('preserves existing moon setting', () => {
    const result = normalizeSpoilerSettings({ moon: 'open', mode: 'single' });
    expect(result.moon).toBe('open');
  });

  it('preserves existing moon vanilla setting', () => {
    const result = normalizeSpoilerSettings({
      moon: 'vanilla',
      mode: 'single',
    });
    expect(result.moon).toBe('vanilla');
  });
});

describe('hasLegacyKeys', () => {
  it('returns true for crossWarpOot', () => {
    expect(hasLegacyKeys({ crossWarpOot: true })).toBe(true);
  });

  it('returns true for crossWarpMm', () => {
    expect(hasLegacyKeys({ crossWarpMm: 'full' })).toBe(true);
  });

  it('returns true for progressiveGoronLullaby', () => {
    expect(hasLegacyKeys({ progressiveGoronLullaby: 'progressive' })).toBe(
      true,
    );
  });

  it('returns true for sunSongMm', () => {
    expect(hasLegacyKeys({ sunSongMm: true })).toBe(true);
  });

  it('returns false for v31.0-only settings', () => {
    expect(hasLegacyKeys({ songMinuetMm: true, mode: 'single' })).toBe(false);
  });

  it('returns false for empty settings', () => {
    expect(hasLegacyKeys({})).toBe(false);
  });
});

describe('getCrossWarpCounterpart', () => {
  it('returns MM_SONG_TP_FOREST for OOT_SONG_TP_FOREST when songMinuetMm is enabled', () => {
    expect(
      getCrossWarpCounterpart('OOT_SONG_TP_FOREST', { songMinuetMm: true }),
    ).toBe('MM_SONG_TP_FOREST');
  });

  it('returns null for OOT_SONG_TP_FOREST when songMinuetMm is disabled', () => {
    expect(
      getCrossWarpCounterpart('OOT_SONG_TP_FOREST', { songMinuetMm: false }),
    ).toBeNull();
  });

  it('returns OOT_SONG_SOARING for MM_SONG_SOARING when songSoaringOot is enabled', () => {
    expect(
      getCrossWarpCounterpart('MM_SONG_SOARING', { songSoaringOot: true }),
    ).toBe('OOT_SONG_SOARING');
  });

  it('returns null for MM_SONG_SOARING when songSoaringOot is disabled', () => {
    expect(
      getCrossWarpCounterpart('MM_SONG_SOARING', { songSoaringOot: false }),
    ).toBeNull();
  });

  it('returns null for a non-crosswarp item', () => {
    expect(
      getCrossWarpCounterpart('OOT_SONG_EPONA', { songMinuetMm: true }),
    ).toBeNull();
  });

  it('returns null for unknown item ID', () => {
    expect(
      getCrossWarpCounterpart('UNKNOWN_ITEM', { songMinuetMm: true }),
    ).toBeNull();
  });

  it('returns null when setting key is absent', () => {
    expect(getCrossWarpCounterpart('OOT_SONG_TP_FOREST', {})).toBeNull();
  });
});

describe('synthesizeCrossWarpItemsForInventory', () => {
  it('does not add counterpart when OOT_SONG_TP_FOREST is present but songMinuetMm is false', () => {
    const inventory: Record<string, number> = { OOT_SONG_TP_FOREST: 1 };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: false,
    });
    expect(changed).toBe(false);
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
  });

  it('removes counterpart when source is absent', () => {
    const inventory: Record<string, number> = {
      MM_SONG_TP_FOREST: 1,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(true);
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
  });

  it('removes counterpart when setting is disabled even if source is present', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_TP_FOREST: 1,
      MM_SONG_TP_FOREST: 1,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: false,
    });
    expect(changed).toBe(true);
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
    // Source item should remain
    expect(inventory.OOT_SONG_TP_FOREST).toBe(1);
  });

  it('removes OOT_SONG_SOARING when MM_SONG_SOARING is absent', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_SOARING: 1,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songSoaringOot: true,
    });
    expect(changed).toBe(true);
    expect(inventory.OOT_SONG_SOARING).toBeUndefined();
  });

  it('does nothing when inventory is empty', () => {
    const inventory: Record<string, number> = {};
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(false);
  });

  it('adds OOT_SONG_SOARING when MM_SONG_SOARING is present and songSoaringOot is true', () => {
    const inventory: Record<string, number> = { MM_SONG_SOARING: 1 };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songSoaringOot: true,
    });
    expect(changed).toBe(true);
    expect(inventory.OOT_SONG_SOARING).toBe(1);
  });

  it('handles multiple crosswarp items at once', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_TP_FOREST: 1,
      OOT_SONG_TP_FIRE: 1,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: true,
      songBoleroMm: true,
    });
    expect(changed).toBe(true);
    expect(inventory.MM_SONG_TP_FOREST).toBe(1);
    expect(inventory.MM_SONG_TP_FIRE).toBe(1);
  });

  it('does not overwrite an already-existing counterpart', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_TP_FOREST: 1,
      MM_SONG_TP_FOREST: 2,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(false); // nothing changed
    expect(inventory.MM_SONG_TP_FOREST).toBe(2); // unchanged
  });

  it('does not touch counterpart that has a present source', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_TP_FOREST: 1,
      MM_SONG_TP_FOREST: 2,
    };
    const changed = synthesizeCrossWarpItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(false);
    expect(inventory.MM_SONG_TP_FOREST).toBe(2);
  });
});

describe('hasLegacyCrossWarpOot', () => {
  it('returns true when crossWarpOot is present', () => {
    expect(hasLegacyCrossWarpOot({ crossWarpOot: true })).toBe(true);
  });

  it('returns false when only crossWarpMm is present', () => {
    expect(hasLegacyCrossWarpOot({ crossWarpMm: 'full' })).toBe(false);
  });

  it('returns false for v31.0-only settings', () => {
    expect(hasLegacyCrossWarpOot({ songMinuetMm: true })).toBe(false);
  });
});

describe('hasLegacyCrossWarpMm', () => {
  it('returns true when crossWarpMm is present', () => {
    expect(hasLegacyCrossWarpMm({ crossWarpMm: 'full' })).toBe(true);
  });

  it('returns false when only crossWarpOot is present', () => {
    expect(hasLegacyCrossWarpMm({ crossWarpOot: true })).toBe(false);
  });

  it('returns false for v31.0-only settings', () => {
    expect(hasLegacyCrossWarpMm({ songSoaringOot: true })).toBe(false);
  });
});

describe('synthesizeOotToMmItemsForInventory', () => {
  it('adds MM counterpart when OoT warp song is present and setting enabled', () => {
    const inventory: Record<string, number> = { OOT_SONG_TP_FOREST: 1 };
    const changed = synthesizeOotToMmItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(true);
    expect(inventory.MM_SONG_TP_FOREST).toBe(1);
  });

  it('does not add counterpart when setting is disabled', () => {
    const inventory: Record<string, number> = { OOT_SONG_TP_FOREST: 1 };
    const changed = synthesizeOotToMmItemsForInventory(inventory, {
      songMinuetMm: false,
    });
    expect(changed).toBe(false);
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
  });

  it('removes counterpart when source is absent', () => {
    const inventory: Record<string, number> = {
      MM_SONG_TP_FOREST: 1,
    };
    const changed = synthesizeOotToMmItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(true);
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
  });

  it('does NOT touch MM_SONG_SOARING or OOT_SONG_SOARING', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_SOARING: 1,
      MM_SONG_SOARING: 1,
    };
    const changed = synthesizeOotToMmItemsForInventory(inventory, {
      songSoaringOot: true,
    });
    expect(changed).toBe(false);
    expect(inventory.OOT_SONG_SOARING).toBe(1);
    expect(inventory.MM_SONG_SOARING).toBe(1);
  });
});

describe('synthesizeMmToOotItemsForInventory', () => {
  it('adds OoT counterpart when MM_SONG_SOARING is present and setting enabled', () => {
    const inventory: Record<string, number> = { MM_SONG_SOARING: 1 };
    const changed = synthesizeMmToOotItemsForInventory(inventory, {
      songSoaringOot: true,
    });
    expect(changed).toBe(true);
    expect(inventory.OOT_SONG_SOARING).toBe(1);
  });

  it('does not add counterpart when setting is disabled', () => {
    const inventory: Record<string, number> = { MM_SONG_SOARING: 1 };
    const changed = synthesizeMmToOotItemsForInventory(inventory, {
      songSoaringOot: false,
    });
    expect(changed).toBe(false);
    expect(inventory.OOT_SONG_SOARING).toBeUndefined();
  });

  it('removes OOT_SONG_SOARING when source is absent', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_SOARING: 1,
    };
    const changed = synthesizeMmToOotItemsForInventory(inventory, {
      songSoaringOot: true,
    });
    expect(changed).toBe(true);
    expect(inventory.OOT_SONG_SOARING).toBeUndefined();
  });

  it('does NOT touch OoT warp songs or MM counterparts', () => {
    const inventory: Record<string, number> = {
      OOT_SONG_TP_FOREST: 1,
      MM_SONG_TP_FOREST: 1,
    };
    const changed = synthesizeMmToOotItemsForInventory(inventory, {
      songMinuetMm: true,
    });
    expect(changed).toBe(false);
    expect(inventory.OOT_SONG_TP_FOREST).toBe(1);
    expect(inventory.MM_SONG_TP_FOREST).toBe(1);
  });
});
