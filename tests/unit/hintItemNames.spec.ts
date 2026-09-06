import { describe, expect, it } from 'vitest';
import {
  getHintItemEntries,
  getMoonTrialMaskItemIds,
} from '../../packs/ootmm/src/utils/hintItemNames';

describe('getHintItemEntries', () => {
  it('includes souls even though they are not in the item grid', () => {
    const entries = getHintItemEntries(null, null);
    const ids = new Set(entries.map((e) => e.id));

    expect(ids.has('OOT_SOUL_ENEMY_STALFOS')).toBe(true);
    expect(ids.has('MM_SOUL_BOSS_GOHT')).toBe(true);
    expect(ids.has('OOT_SOUL_NPC_SARIA')).toBe(true);
    expect(ids.has('OOT_SOUL_ANIMAL_CUCCO')).toBe(true);
  });

  it('excludes souls when an explicit pool (Moon Trial masks) is given', () => {
    const maskPool = getMoonTrialMaskItemIds(null);
    const entries = getHintItemEntries(maskPool, null);
    const ids = new Set(entries.map((e) => e.id));

    // Souls must not leak into the Moon Trial picker.
    expect(ids.has('OOT_SOUL_ENEMY_STALFOS')).toBe(false);
    expect(ids.has('MM_SOUL_BOSS_GOHT')).toBe(false);

    // Masks are still present.
    expect(ids.has('MM_MASK_CAPTAIN')).toBe(true);
  });

  it('includes souls when restricted to a pool that contains them', () => {
    const pool = ['OOT_SOUL_ENEMY_STALFOS', 'OOT_BOW'];
    const entries = getHintItemEntries(pool, null);
    const ids = new Set(entries.map((e) => e.id));

    expect(ids.has('OOT_SOUL_ENEMY_STALFOS')).toBe(true);
    expect(ids.has('OOT_BOW')).toBe(true);
  });
});
