import { describe, expect, it } from 'vitest';
import {
  parseSpoilerHints,
  getExpectedHintCounts,
} from '../../packs/ootmm/src/utils/hintSpoilerAnalysis';

const DUAL_HINT_LOG = [
  'Hints',
  '  Specific Hints:',
  '    OOT Hyrule Field Gossip 1    Romani Ranch Aliens    Bomb Bag (sometimes required)',
  '                                Romani Ranch Cremia Escort    Bombchu (sometimes required)',
  '    MM Great Bay Coast Gossip    Secret Shrine Wart Chest    Bow (sometimes required)',
  '                                Secret Shrine HP Chest    Quiver (sometimes required)',
  '    OOT Kokiri Forest Gossip    Fishing Pond Child    Slingshot (not required)',
].join('\n');

const TRIPLE_HINT_LOG = [
  'Hints',
  '  Specific Hints:',
  '    OOT Hyrule Field Gossip 2    Zora Domain Tunic    Tunics (not required)',
  '                                Zora Domain Eyeball Frog    Bomb Bag (not required)',
  '    OOT Market Gossip    Death Mountain Trail Prescription    Prescription (not required)',
  '                           Death Mountain Trail Claim Check    Claim Check (not required)',
  '                           Death Mountain Trail Biggoron Sword    Biggoron Sword (not required)',
].join('\n');

const DUAL_HINT_DEDUP_LOG = [
  'Hints',
  '  Specific Hints:',
  '    OOT Hyrule Field Gossip 1    Romani Ranch Aliens    Bomb Bag (sometimes required)',
  '                                Romani Ranch Cremia Escort    Bombchu (sometimes required)',
  '    OOT Hyrule Field Gossip 2    Romani Ranch Aliens    Bomb Bag (sometimes required)',
  '                                Romani Ranch Cremia Escort    Bombchu (sometimes required)',
].join('\n');

describe('parseSpoilerHints - dual hints', () => {
  it('counts a dual hint as a single hint', () => {
    const parsed = parseSpoilerHints(DUAL_HINT_LOG);
    const counts = getExpectedHintCounts(parsed);
    // 2 dual hints (2 lines each) + 1 single hint = 3 distinct hints
    expect(counts['item-exact']).toBe(3);
    expect(parsed.hints).toHaveLength(5);
  });

  it('counts a triple hint as a single hint', () => {
    const parsed = parseSpoilerHints(TRIPLE_HINT_LOG);
    const counts = getExpectedHintCounts(parsed);
    // 1 dual hint (2 lines) + 1 triple hint (3 lines) = 2 distinct hints
    expect(counts['item-exact']).toBe(2);
    expect(parsed.hints).toHaveLength(5);
  });

  it('deduplicates the same dual hint across gossip stones', () => {
    const parsed = parseSpoilerHints(DUAL_HINT_DEDUP_LOG);
    const counts = getExpectedHintCounts(parsed);
    // Same dual hint on two stones only counts once
    expect(counts['item-exact']).toBe(1);
  });

  it('does not collapse continuation lines of different stones', () => {
    const log = [
      'Hints',
      '  Specific Hints:',
      '    Stone A    Location One    Item One (not required)',
      '                Location Two    Item Two (not required)',
      '    Stone B    Location Three    Item Three (not required)',
    ].join('\n');
    const parsed = parseSpoilerHints(log);
    const counts = getExpectedHintCounts(parsed);
    // Stone A has 2 lines (one dual hint), Stone B is a single hint
    expect(counts['item-exact']).toBe(2);
    expect(parsed.hints).toHaveLength(3);
  });
});
