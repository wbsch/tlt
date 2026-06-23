import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';
import {
  computeCoupledReverse,
  computeEffectiveTrackedEntranceOverrides,
  filterEntranceOverridesForSettings,
} from '../../packs/ootmm/src/utils/entranceRandomization';

describe('erDecoupled', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const baseSettings = {
    games: 'ootmm',
    erDungeons: 'full',
    erBoss: 'none',
    erGrottos: 'none',
    erIndoors: 'none',
    erOverworld: 'none',
    erRegions: 'none',
    erSpawns: 'none',
    erWarps: 'none',
    erNoPolarity: false,
  };

  // ──────────────────────────────────────────────
  // setEntranceOverride — single override
  // ──────────────────────────────────────────────

  describe('setEntranceOverride — single override coupling', () => {
    it('skips reverse coupling when erDecoupled is true', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: true };

      store.setEntranceOverride('OOT_DEKU_TREE', 'OOT_DODONGO_CAVERN');

      // The override itself must be set
      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );

      // The coupled reverse must NOT be set
      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBeUndefined();
    });

    it('creates reverse coupling when erDecoupled is false (default)', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: false };

      store.setEntranceOverride('OOT_DEKU_TREE', 'OOT_DODONGO_CAVERN');

      // The override itself must be set
      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );

      // The coupled reverse must be set
      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBe(
        partner!.reverseDst,
      );
    });
  });

  // ──────────────────────────────────────────────
  // setEntranceOverride — deletion
  // ──────────────────────────────────────────────

  describe('setEntranceOverride — single override deletion', () => {
    it('does NOT delete the partner when erDecoupled is true', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: true };

      // Set the main override in decoupled mode (no auto-reverse).
      store.setEntranceOverride('OOT_DEKU_TREE', 'OOT_DODONGO_CAVERN');

      // Simulate independent configuration by manually adding the reverse.
      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      store.entranceOverrides = {
        ...store.entranceOverrides,
        [partner!.reverseSrc]: partner!.reverseDst,
      };

      // Delete the main entrance — partner should survive
      store.setEntranceOverride('OOT_DEKU_TREE', null);

      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBeUndefined();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBe(
        partner!.reverseDst,
      );
    });

    it('DOES delete the partner when erDecoupled is false (default)', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: false };

      // In coupled mode, setting the override auto-creates the reverse.
      store.setEntranceOverride('OOT_DEKU_TREE', 'OOT_DODONGO_CAVERN');

      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBe(
        partner!.reverseDst,
      );

      // Delete the main entrance — partner is also removed
      store.setEntranceOverride('OOT_DEKU_TREE', null);

      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBeUndefined();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────
  // setEntranceOverrides — batch override
  // ──────────────────────────────────────────────

  describe('setEntranceOverrides — batch override coupling', () => {
    it('skips coupling when erDecoupled is true', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: true };

      store.setEntranceOverrides({
        OOT_DEKU_TREE: 'OOT_DODONGO_CAVERN',
      });

      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );

      // No reverse should be auto-filled
      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      expect(Object.keys(store.entranceOverrides)).toHaveLength(1);
      expect(store.entranceOverrides[partner!.reverseSrc]).toBeUndefined();
    });

    it('fills in missing reverse entries when erDecoupled is false (default)', () => {
      const store = useOoTMMSessionStore();
      store.trackerSettings = { ...baseSettings, erDecoupled: false };

      store.setEntranceOverrides({
        OOT_DEKU_TREE: 'OOT_DODONGO_CAVERN',
      });

      expect(store.entranceOverrides['OOT_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );

      // Reverse must be auto-filled
      const partner = computeCoupledReverse(
        'OOT_DEKU_TREE',
        'OOT_DODONGO_CAVERN',
      );
      expect(partner).not.toBeNull();
      expect(store.entranceOverrides[partner!.reverseSrc]).toBe(
        partner!.reverseDst,
      );
    });
  });

  // ──────────────────────────────────────────────
  // filterEntranceOverridesForSettings — plando export
  // ──────────────────────────────────────────────

  describe('filterEntranceOverridesForSettings — plando export', () => {
    const dungeonOverrides: Record<string, string> = {
      OOT_DEKU_TREE: 'OOT_DODONGO_CAVERN',
      // OOT_KOKIRI_FOREST_FROM_DEKU_TREE is the dungeon-exit partner of
      // OOT_DEKU_TREE — it is NOT in activeKeys (dungeon-exit is not in
      // DUNGEON_TYPES) so the filter strips it in coupled mode.
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_DODONGO_CAVERN',
    };

    it('preserves exit keys when erDecoupled is true', () => {
      const settings = {
        ...baseSettings,
        erDecoupled: true,
        erMajorDungeons: true,
      };

      const result = filterEntranceOverridesForSettings(
        dungeonOverrides,
        settings,
      );

      // Both the entrance key and the exit key should be preserved
      expect(result['OOT_DEKU_TREE']).toBe('OOT_DODONGO_CAVERN');
      expect(result['OOT_KOKIRI_FOREST_FROM_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );
    });

    it('strips exit keys when erDecoupled is false (default)', () => {
      const settings = {
        ...baseSettings,
        erDecoupled: false,
        erMajorDungeons: true,
      };

      const result = filterEntranceOverridesForSettings(
        dungeonOverrides,
        settings,
      );

      // Only the entrance key should survive; the exit key is stripped
      expect(result['OOT_DEKU_TREE']).toBe('OOT_DODONGO_CAVERN');
      expect(result['OOT_KOKIRI_FOREST_FROM_DEKU_TREE']).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────
  // computeEffectiveTrackedEntranceOverrides — tracker internal
  // ──────────────────────────────────────────────

  describe('computeEffectiveTrackedEntranceOverrides — tracker internal', () => {
    const dungeonOverrides: Record<string, string> = {
      OOT_DEKU_TREE: 'OOT_DODONGO_CAVERN',
      // Same exit key as above — should only pass through in decoupled mode
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_DODONGO_CAVERN',
    };

    it('preserves exit keys when erDecoupled is true', () => {
      const settings = {
        ...baseSettings,
        erDecoupled: true,
        erMajorDungeons: true,
      };

      const result = computeEffectiveTrackedEntranceOverrides(
        dungeonOverrides,
        settings,
      );

      expect(result['OOT_DEKU_TREE']).toBe('OOT_DODONGO_CAVERN');
      expect(result['OOT_KOKIRI_FOREST_FROM_DEKU_TREE']).toBe(
        'OOT_DODONGO_CAVERN',
      );
    });

    it('strips exit keys when erDecoupled is false (default)', () => {
      const settings = {
        ...baseSettings,
        erDecoupled: false,
        erMajorDungeons: true,
      };

      const result = computeEffectiveTrackedEntranceOverrides(
        dungeonOverrides,
        settings,
      );

      expect(result['OOT_DEKU_TREE']).toBe('OOT_DODONGO_CAVERN');
      expect(result['OOT_KOKIRI_FOREST_FROM_DEKU_TREE']).toBeUndefined();
    });
  });
});
