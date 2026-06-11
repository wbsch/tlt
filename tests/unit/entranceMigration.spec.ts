import { describe, expect, it } from 'vitest';
import {
  needsEntranceMigration,
  migrateEntranceOverrides,
  migrateEntranceOverridesInPlace,
} from '../../src/utils/entranceMigration';

/**
 * Real entrance key pairs from the OoTMM data:
 *   OOT_FIELD_FROM_LOST_WOODS_BRIDGE (region-exit) ↔ OOT_LOST_WOODS_BRIDGE_FROM_FIELD (region)
 *   OOT_DEKU_TREE (dungeon) ↔ OOT_KOKIRI_FOREST_FROM_DEKU_TREE (dungeon-exit)
 *   OOT_DODONGO_CAVERN (dungeon) ↔ OOT_MOUNTAIN_TRAIL_FROM_DODONGO_CAVERN (dungeon-exit)
 *   OOT_BOSS_DEKU_TREE (boss) — one-way, no reverse
 */

describe('needsEntranceMigration', () => {
  it('returns true for old-format overrides (entrance-source only)', () => {
    // Old format: only the exit→entrance direction is stored.
    // The coupled reverse (entrance→exit) is missing.
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
    };
    expect(needsEntranceMigration(overrides)).toBe(true);
  });

  it('returns false for already-migrated overrides', () => {
    // Both directions present.
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    };
    expect(needsEntranceMigration(overrides)).toBe(false);
  });

  it('returns false for empty overrides', () => {
    expect(needsEntranceMigration({})).toBe(false);
  });

  it('returns false when only one-way warps are present', () => {
    // OOT_BOSS_DEKU_TREE has no reverse edge — no migration needed.
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_BOSS_DEKU_TREE',
    };
    expect(needsEntranceMigration(overrides)).toBe(false);
  });
});

describe('migrateEntranceOverrides', () => {
  it('fills in missing coupled reverse entries', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
    };
    const result = migrateEntranceOverrides(overrides);
    expect(result).toEqual({
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    });
  });

  it('preserves existing entries when migrating multiple old-format pairs', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_MOUNTAIN_TRAIL_FROM_DODONGO_CAVERN: 'OOT_TEMPLE_FIRE',
    };
    const result = migrateEntranceOverrides(overrides);
    expect(result).toEqual({
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
      OOT_MOUNTAIN_TRAIL_FROM_DODONGO_CAVERN: 'OOT_TEMPLE_FIRE',
      OOT_DEATH_CRATER_FROM_TEMPLE_FIRE: 'OOT_DODONGO_CAVERN',
    });
  });

  it('is idempotent — already-migrated data is unchanged', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    };
    const result = migrateEntranceOverrides(overrides);
    expect(result).toEqual(overrides);
    // Same object reference for same values (spread creates new object, but
    // the content should be identical).
    expect(Object.keys(result)).toEqual(Object.keys(overrides));
  });

  it('returns empty object for empty input', () => {
    const result = migrateEntranceOverrides({});
    expect(result).toEqual({});
  });

  it('does not add entries for one-way warps', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_BOSS_DEKU_TREE',
    };
    const result = migrateEntranceOverrides(overrides);
    expect(result).toEqual(overrides);
  });

  it('does not mutate the original object', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
    };
    const copy = { ...overrides };
    migrateEntranceOverrides(overrides);
    expect(overrides).toEqual(copy);
  });
});

describe('migrateEntranceOverridesInPlace', () => {
  it('mutates the object and returns true when entries are added', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
    };
    const changed = migrateEntranceOverridesInPlace(overrides);
    expect(changed).toBe(true);
    expect(overrides).toEqual({
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    });
  });

  it('returns false when no entries are added (already migrated)', () => {
    const overrides: Record<string, string> = {
      OOT_FIELD_FROM_LOST_WOODS_BRIDGE: 'OOT_DEKU_TREE',
      OOT_KOKIRI_FOREST_FROM_DEKU_TREE: 'OOT_LOST_WOODS_BRIDGE_FROM_FIELD',
    };
    const changed = migrateEntranceOverridesInPlace(overrides);
    expect(changed).toBe(false);
  });

  it('returns false for empty object', () => {
    const overrides: Record<string, string> = {};
    const changed = migrateEntranceOverridesInPlace(overrides);
    expect(changed).toBe(false);
  });
});
