import { describe, expect, it } from 'vitest';
import {
  ALWAYS_HINT_CHECKS,
  SOMETIMES_HINT_CHECKS,
  findHintCheckById,
  resolveCheckSlotLocationCodes,
} from '../../packs/ootmm/src/data/hintCheckLocations';
import { LOCATION_CODE_CATALOG } from '../../packs/ootmm/src/data/locationCatalog';

const normalize = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

describe('hint check location codes', () => {
  const catalogNames = new Set(
    LOCATION_CODE_CATALOG.map((entry) => normalize(entry.name)),
  );

  const allChecks = [...ALWAYS_HINT_CHECKS, ...SOMETIMES_HINT_CHECKS];

  it('covers every Always/Sometimes check', () => {
    expect(ALWAYS_HINT_CHECKS.length).toBeGreaterThan(0);
    expect(SOMETIMES_HINT_CHECKS.length).toBeGreaterThan(0);
  });

  it('has non-empty location codes for every check', () => {
    for (const check of allChecks) {
      expect(
        check.locationCodes.length,
        `${check.id} should map to at least one location`,
      ).toBeGreaterThan(0);
    }
  });

  it('maps every location code to a known tracker location', () => {
    const unknown: string[] = [];
    for (const check of allChecks) {
      for (const code of check.locationCodes) {
        if (!catalogNames.has(normalize(code))) {
          unknown.push(`${check.id} -> ${code}`);
        }
      }
    }
    expect(unknown, 'unknown location codes').toEqual([]);
  });

  it('resolves the Great Bay Temple Wart hint to the Ice Arrow check', () => {
    const check = allChecks.find((c) => c.id === 'MM_GBT_ICE_ARROW');
    expect(check).toBeDefined();
    expect(check!.locationCodes).toEqual(['MM Great Bay Temple Ice Arrow']);
  });

  it('maps each item slot of a multi-item check to its own location code', () => {
    const biggoron = findHintCheckById('OOT_BIGGORON')!;
    expect(resolveCheckSlotLocationCodes(biggoron, 0)).toEqual([
      'OOT Death Mountain Trail Prescription',
    ]);
    expect(resolveCheckSlotLocationCodes(biggoron, 1)).toEqual([
      'OOT Death Mountain Trail Claim Check',
    ]);
    expect(resolveCheckSlotLocationCodes(biggoron, 2)).toEqual([
      'OOT Death Mountain Trail Biggoron Sword',
    ]);
  });

  it('resolves alternate (MQ) variants for the same item slot', () => {
    const iceCavern = findHintCheckById('OOT_ICE_CAVERN_CHEST')!;
    expect(resolveCheckSlotLocationCodes(iceCavern, 0)).toEqual([
      'OOT Ice Cavern Iron Boots',
      'OOT MQ Ice Cavern Iron Boots',
    ]);
    expect(resolveCheckSlotLocationCodes(iceCavern, 1)).toEqual([
      'OOT Ice Cavern Sheik Song',
      'OOT MQ Ice Cavern Sheik Song',
    ]);
  });

  it('covers every item slot of every multi-item check with a location code', () => {
    for (const check of allChecks) {
      const itemCount = Math.max(1, check.itemCount ?? 1);
      for (let slot = 0; slot < itemCount; slot++) {
        expect(
          resolveCheckSlotLocationCodes(check, slot).length,
          `${check.id} slot ${slot} should map to at least one location`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
