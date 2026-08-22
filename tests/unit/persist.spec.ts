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

  it('folds a persisted full MM Goron Lullaby into the half stage 2', () => {
    // Old session: progressive MM lullaby, full-song ID persisted before the
    // folding fix. Must be folded to MM_SONG_GORON_HALF at stage 2.
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        progressiveGoronLullabyMm: 'progressive',
      },
      inventoryById: {
        MM_SONG_GORON: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.MM_SONG_GORON_HALF).toBe(2);
    expect(inventory.MM_SONG_GORON).toBeUndefined();
  });

  it('folds a persisted full OOT Goron Lullaby into the half stage 2', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        progressiveGoronLullabyOot: 'progressive',
      },
      inventoryById: {
        OOT_SONG_GORON: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.OOT_SONG_GORON_HALF).toBe(2);
    expect(inventory.OOT_SONG_GORON).toBeUndefined();
  });

  it('folds all shared Goron Lullaby signals into the shared half stage 2', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        sharedSongGoron: true,
        progressiveGoronLullabyMm: 'progressive',
        progressiveGoronLullabyOot: 'progressive',
      },
      inventoryById: {
        SHARED_SONG_GORON: 1,
        MM_SONG_GORON: 1,
        OOT_SONG_GORON: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.SHARED_SONG_GORON_HALF).toBe(2);
    expect(inventory.SHARED_SONG_GORON).toBeUndefined();
    expect(inventory.MM_SONG_GORON).toBeUndefined();
    expect(inventory.OOT_SONG_GORON).toBeUndefined();
  });

  it('keeps the full song id when not in progressive mode', () => {
    const result = sanitizePersistedStateForStore('ootmm-session', {
      trackerSettings: {
        progressiveGoronLullabyMm: 'single',
      },
      inventoryById: {
        MM_SONG_GORON: 1,
      },
    });
    const inventory = result.inventoryById as Record<string, number>;
    expect(inventory.MM_SONG_GORON).toBe(1);
    expect(inventory.MM_SONG_GORON_HALF).toBeUndefined();
  });
});
