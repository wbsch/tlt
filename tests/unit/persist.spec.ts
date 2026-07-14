import { describe, expect, it } from 'vitest';
import { sanitizePersistedStateForStore } from '@/stores/persist';

describe('persist sanitizeSettingsObject via hydrate', () => {
  it('normalizes sunSongMm to songSunMm in trackerSettings', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        sunSongMm: true,
        mode: 'single',
      },
    });
    expect(result.trackerSettings).toMatchObject({
      songSunMm: true,
    });
    expect(
      (result.trackerSettings as Record<string, unknown>).sunSongMm,
    ).toBeUndefined();
  });

  it('normalizes crossWarpOot to six song*Mm settings', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        crossWarpOot: true,
      },
    });
    const settings = result.trackerSettings as Record<string, unknown>;
    expect(settings.songMinuetMm).toBe(true);
    expect(settings.songBoleroMm).toBe(true);
    expect(settings.songSerenadeMm).toBe(true);
    expect(settings.songRequiemMm).toBe(true);
    expect(settings.songNocturneMm).toBe(true);
    expect(settings.songPreludeMm).toBe(true);
    expect(settings.crossWarpOot).toBeUndefined();
  });

  it('normalizes crossWarpMm full to songSoaringOot + agelessSoaring', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        crossWarpMm: 'full',
      },
    });
    const settings = result.trackerSettings as Record<string, unknown>;
    expect(settings.songSoaringOot).toBe(true);
    expect(settings.agelessSoaring).toBe(true);
  });

  it('normalizes progressiveGoronLullaby to progressiveGoronLullabyMm', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        progressiveGoronLullaby: 'single',
      },
    });
    const settings = result.trackerSettings as Record<string, unknown>;
    expect(settings.progressiveGoronLullabyMm).toBe('single');
    expect(
      (settings as Record<string, unknown>).progressiveGoronLullaby,
    ).toBeUndefined();
  });

  it('synthesizes crosswarp counterpart items from legacy settings in inventory', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        crossWarpOot: true,
      },
      needsLegacyCrossWarpOotSynthesis: true,
      inventoryById: {
        OOT_SONG_TP_FOREST: 1,
        OOT_SONG_TP_FIRE: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    // Both OoT songs should have their MM counterparts synthesized
    expect(inventory.MM_SONG_TP_FOREST).toBe(1);
    expect(inventory.MM_SONG_TP_FIRE).toBe(1);
    // Original items preserved
    expect(inventory.OOT_SONG_TP_FOREST).toBe(1);
    expect(inventory.OOT_SONG_TP_FIRE).toBe(1);
  });

  it('synthesizes crosswarp counterpart for MM_SONG_SOARING', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        songSoaringOot: true,
      },
      needsLegacyCrossWarpMmSynthesis: true,
      inventoryById: {
        MM_SONG_SOARING: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.OOT_SONG_SOARING).toBe(1);
  });

  it('does not synthesize when songMinuetMm is false', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        songMinuetMm: false,
      },
      inventoryById: {
        OOT_SONG_TP_FOREST: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.MM_SONG_TP_FOREST).toBeUndefined();
  });

  it('preserves v31.0 native settings unchanged through sanitize', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        songMinuetMm: true,
        songSoaringOot: true,
        agelessSoaring: false,
        mode: 'open',
        games: 'ootmm',
      },
    });
    const settings = result.trackerSettings as Record<string, unknown>;
    expect(settings.songMinuetMm).toBe(true);
    expect(settings.songSoaringOot).toBe(true);
    expect(settings.agelessSoaring).toBe(false);
    expect(settings.mode).toBe('open');
  });
});
