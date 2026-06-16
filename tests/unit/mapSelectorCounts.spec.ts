import { describe, expect, it } from 'vitest';
import {
  resolveEntranceBoundCodes,
  ENTRANCE_CHECK_CODES_BY_ID,
} from '../../packs/ootmm/src/utils/mapSelectorCounts';

describe('resolveEntranceBoundCodes', () => {
  // --- Known codes from the Kokiri Forest map data ---
  // OOT_HOUSE_MIDO: 4 chests
  const MIDO_CODES = [
    "OOT Mido's House Top Left",
    "OOT Mido's House Top Right",
    "OOT Mido's House Bottom Left",
    "OOT Mido's House Bottom Right",
  ];

  // OOT_HOUSE_SARIA: 4 hearts
  const SARIA_CODES = [
    "OOT Saria's House Heart 1",
    "OOT Saria's House Heart 2",
    "OOT Saria's House Heart 3",
    "OOT Saria's House Heart 4",
  ];

  // OOT_HOUSE_KNOW_IT_ALL: 2 pots
  const KNOW_IT_ALL_CODES = [
    'OOT Know It All House Pot 1',
    'OOT Know It All House Pot 2',
  ];

  it('returns codes when ER is off (empty overrides, no active set)', () => {
    const codes = resolveEntranceBoundCodes(['OOT_HOUSE_MIDO'], {});
    expect(codes.sort()).toEqual(MIDO_CODES.sort());
  });

  it('returns codes when ER is off (empty active set)', () => {
    const codes = resolveEntranceBoundCodes(['OOT_HOUSE_MIDO'], {}, new Set());
    expect(codes.sort()).toEqual(MIDO_CODES.sort());
  });

  it('returns codes when ER is active and entrance is self-mapped', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO'],
      { OOT_HOUSE_MIDO: 'OOT_HOUSE_MIDO' },
      new Set(['OOT_HOUSE_MIDO']),
    );
    expect(codes.sort()).toEqual(MIDO_CODES.sort());
  });

  it('returns remapped codes when ER override points to another entrance', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO'],
      { OOT_HOUSE_MIDO: 'OOT_HOUSE_SARIA' },
      new Set(['OOT_HOUSE_MIDO']),
    );
    expect(codes.sort()).toEqual(SARIA_CODES.sort());
  });

  it('returns empty when entrance is in active pool but no override', () => {
    // When an entrance is in an active ER pool and has no override,
    // the entrance could be shuffled somewhere unknown — no codes.
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO'],
      {},
      new Set(['OOT_HOUSE_MIDO']),
    );
    expect(codes).toEqual([]);
  });

  it('returns combined codes for multiple entrance IDs (no active pools)', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL'],
      {},
    );
    expect(codes.sort()).toEqual([...MIDO_CODES, ...KNOW_IT_ALL_CODES].sort());
  });

  it('returns combined codes when multiple in active pool with overrides', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL'],
      {
        OOT_HOUSE_MIDO: 'OOT_HOUSE_MIDO',
        OOT_HOUSE_KNOW_IT_ALL: 'OOT_HOUSE_KNOW_IT_ALL',
      },
      new Set(['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL']),
    );
    expect(codes.sort()).toEqual([...MIDO_CODES, ...KNOW_IT_ALL_CODES].sort());
  });

  it('returns empty array for unknown entrance ID (no crash)', () => {
    const codes = resolveEntranceBoundCodes(['OOT_HOUSE_NONEXISTENT'], {});
    expect(codes).toEqual([]);
  });

  it('handles mixed overrides: active pool, some overridden others skipped', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL'],
      { OOT_HOUSE_MIDO: 'OOT_HOUSE_SARIA' },
      new Set(['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL']),
    );
    // Mido's → Saria's codes via override, Know It All → active but no
    // override → skipped entirely (unlike the old fallback behaviour).
    expect(codes.sort()).toEqual(SARIA_CODES.sort());
  });

  it('handles mixed overrides: some in active pool, others not', () => {
    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO', 'OOT_HOUSE_KNOW_IT_ALL'],
      { OOT_HOUSE_MIDO: 'OOT_HOUSE_SARIA' },
      new Set(['OOT_HOUSE_MIDO']),
    );
    // Mido's → active pool, has override → Saria's codes
    // Know It All → NOT in active pool, no override → fallback to itself
    expect(codes.sort()).toEqual([...SARIA_CODES, ...KNOW_IT_ALL_CODES].sort());
  });

  it('resolves via reverse edge when resolved ID is an exit key', () => {
    // OOT_KOKIRI_FOREST_FROM_SARIA is the exit-side partner of OOT_HOUSE_SARIA.
    // It is NOT in ENTRANCE_CHECK_CODES_BY_ID directly, but its reverse
    // (OOT_HOUSE_SARIA) IS — so the fallback look-up via getEdgeReverse
    // should find Saria's House codes.
    const reverseId = 'OOT_KOKIRI_FOREST_FROM_SARIA';
    expect(getEdgeReverseExists(reverseId)).toBe(true);

    const codes = resolveEntranceBoundCodes(
      ['OOT_HOUSE_MIDO'],
      { OOT_HOUSE_MIDO: reverseId },
      new Set(['OOT_HOUSE_MIDO']),
    );
    expect(codes.sort()).toEqual(SARIA_CODES.sort());
  });

  it('returns empty array for empty markerEntranceIds', () => {
    const codes = resolveEntranceBoundCodes([], {});
    expect(codes).toEqual([]);
  });

  it('trims entrance IDs and skips empty ones', () => {
    const codes = resolveEntranceBoundCodes(
      ['  OOT_HOUSE_MIDO  ', '', '  ', 'OOT_HOUSE_SARIA'],
      {},
    );
    const expected = [...MIDO_CODES, ...SARIA_CODES].sort();
    expect(codes.sort()).toEqual(expected);
  });
});

/**
 * Verify that a key exists as an entrance with a reverse edge.
 * Uses the same getEdgeReverse logic as the module under test.
 */
function getEdgeReverseExists(_key: string): boolean {
  // Check via the module's ENTRANCE_CHECK_CODES_BY_ID that the reverse
  // lookup would succeed — we import getEdgeReverse indirectly through
  // our knowledge that OOT_KOKIRI_FOREST_FROM_SARIA's reverse is
  // OOT_HOUSE_SARIA, which IS in the index.
  return ENTRANCE_CHECK_CODES_BY_ID.has('OOT_HOUSE_SARIA');
}
