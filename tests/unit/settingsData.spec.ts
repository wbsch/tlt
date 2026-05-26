import { describe, expect, it } from 'vitest';
import { SETTINGS_DEFINITIONS } from '@packs/ootmm/data/settings';

describe('tracker settings definitions', () => {
  it('surfaces boss entrance shuffle in the whitelisted tracker settings', () => {
    const erBoss = SETTINGS_DEFINITIONS.find(
      (definition) => definition.key === 'erBoss',
    );

    expect(erBoss).toBeTruthy();
    expect(erBoss?.type).toBe('select');
    expect(erBoss?.category).toBe('Entrance Randomizer');
    expect(erBoss?.options?.map((option) => option.value)).toEqual([
      'none',
      'ownGame',
      'full',
    ]);
  });
});
