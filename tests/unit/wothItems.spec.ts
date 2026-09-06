import { describe, expect, it } from 'vitest';
import {
  getWotHCanonicalItemId,
  isWotHItemInGrid,
  WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS,
  WOTH_GOLD_DUST_VARIANTS,
  WOTH_RUTO_LETTER_VARIANTS,
} from '../../packs/ootmm/src/utils/wothItems';

describe('Way of the Hero item normalization', () => {
  describe('getWotHCanonicalItemId', () => {
    it('collapses bottle contents to their base Empty Bottle', () => {
      expect(getWotHCanonicalItemId('OOT_BOTTLE_POTION_RED')).toBe(
        'OOT_BOTTLE_EMPTY',
      );
      expect(getWotHCanonicalItemId('OOT_BOTTLE_MILK')).toBe(
        'OOT_BOTTLE_EMPTY',
      );
      expect(getWotHCanonicalItemId('MM_BOTTLE_FAIRY')).toBe(
        'MM_BOTTLE_EMPTY',
      );
      expect(getWotHCanonicalItemId('SHARED_BOTTLE_BLUE_FIRE')).toBe(
        'SHARED_BOTTLE_EMPTY',
      );
    });

    it('normalizes every Ruto\'s Letter variant to the OoT variant', () => {
      for (const id of WOTH_RUTO_LETTER_VARIANTS) {
        expect(getWotHCanonicalItemId(id)).toBe('OOT_BOTTLE_RUTO_LETTER');
      }
    });

    it('normalizes every Gold Dust variant to the MM variant', () => {
      for (const id of WOTH_GOLD_DUST_VARIANTS) {
        expect(getWotHCanonicalItemId(id)).toBe('MM_BOTTLED_GOLD_DUST');
      }
    });

    it('leaves non-bottle items unchanged', () => {
      expect(getWotHCanonicalItemId('OOT_BOW')).toBe('OOT_BOW');
      expect(getWotHCanonicalItemId('MM_HOOKSHOT')).toBe('MM_HOOKSHOT');
      expect(getWotHCanonicalItemId('SHARED_HAMMER')).toBe('SHARED_HAMMER');
    });
  });

  describe('isWotHItemInGrid', () => {
    it('matches bottle contents via their base Empty Bottle', () => {
      const grid = new Set(['OOT_BOTTLE_EMPTY']);
      expect(isWotHItemInGrid('OOT_BOTTLE_POTION_RED', grid)).toBe(true);
      expect(isWotHItemInGrid('OOT_BOTTLE_MILK', grid)).toBe(true);
      expect(isWotHItemInGrid('MM_BOTTLE_POTION_RED', grid)).toBe(false);
    });

    it('matches Ruto\'s Letter via any variant present in the grid', () => {
      // Non-shared mode: OoT variant is in the grid.
      expect(
        isWotHItemInGrid(
          'MM_BOTTLE_RUTO_LETTER',
          new Set(['OOT_BOTTLE_RUTO_LETTER']),
        ),
      ).toBe(true);
      // Shared mode: shared variant is in the grid.
      expect(
        isWotHItemInGrid(
          'MM_BOTTLE_RUTO_LETTER',
          new Set(['SHARED_BOTTLE_RUTO_LETTER']),
        ),
      ).toBe(true);
      // No variant present.
      expect(isWotHItemInGrid('MM_BOTTLE_RUTO_LETTER', new Set())).toBe(false);
    });

    it('matches Gold Dust via any variant present in the grid', () => {
      expect(
        isWotHItemInGrid(
          'OOT_BOTTLED_GOLD_DUST',
          new Set(['MM_BOTTLED_GOLD_DUST']),
        ),
      ).toBe(true);
      expect(
        isWotHItemInGrid(
          'OOT_BOTTLED_GOLD_DUST',
          new Set(['SHARED_BOTTLED_GOLD_DUST']),
        ),
      ).toBe(true);
      expect(isWotHItemInGrid('OOT_BOTTLED_GOLD_DUST', new Set())).toBe(false);
    });

    it('matches ordinary items by exact ID', () => {
      const grid = new Set(['OOT_BOW']);
      expect(isWotHItemInGrid('OOT_BOW', grid)).toBe(true);
      expect(isWotHItemInGrid('OOT_BOMB_BAG', grid)).toBe(false);
    });
  });

  describe('WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS', () => {
    it('does not map Ruto\'s Letter or Gold Dust to Empty Bottle', () => {
      for (const id of [...WOTH_RUTO_LETTER_VARIANTS, ...WOTH_GOLD_DUST_VARIANTS]) {
        expect(WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS[id]).toBeUndefined();
      }
    });

    it('maps every bottle content to the matching game Empty Bottle', () => {
      for (const [contentId, baseId] of Object.entries(
        WOTH_BOTTLE_CONTENT_BASE_ITEM_IDS,
      )) {
        const game = contentId.split('_')[0];
        expect(baseId).toBe(`${game}_BOTTLE_EMPTY`);
      }
    });
  });
});
