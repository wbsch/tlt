import { describe, expect, it } from 'vitest';
import { MM_AGE_REQ_ITEMS } from '@ootmm/core/mm-age-requirements';
import {
  SETTINGS_DEFINITIONS,
  TRACKER_DEFAULT_SETTINGS,
  readMmAgeRequirement,
  writeMmAgeRequirement,
} from '../../packs/ootmm/src/data/settings';

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

  it('surfaces one age dropdown per MM age requirement item', () => {
    for (const item of MM_AGE_REQ_ITEMS) {
      const dropdown = SETTINGS_DEFINITIONS.find(
        (definition) => definition.control?.childKey === item.childSetting,
      );

      expect(dropdown, item.id).toBeTruthy();
      expect(dropdown?.category).toBe('MM Age Requirements');
      expect(dropdown?.type).toBe('select');
      expect(dropdown?.options?.map((option) => option.value)).toEqual([
        'both',
        'child',
        'adult',
      ]);
      expect(dropdown?.control?.adultKey).toBe(item.adultSetting);
      expect(dropdown?.hidden).toBeFalsy();

      // The raw child/adult flags stay available for spoiler log imports but
      // are not rendered as individual toggles.
      for (const key of [item.childSetting, item.adultSetting]) {
        const flag = SETTINGS_DEFINITIONS.find(
          (definition) => definition.key === key,
        );

        expect(flag, key).toBeTruthy();
        expect(flag?.hidden).toBe(true);
      }
    }

    expect(
      SETTINGS_DEFINITIONS.filter((definition) => definition.control),
    ).toHaveLength(MM_AGE_REQ_ITEMS.length);
  });

  it('does not offer random MM age requirements', () => {
    expect(
      SETTINGS_DEFINITIONS.some(
        (definition) => definition.key === 'mmAgeReqRandom',
      ),
    ).toBe(false);
    // Kept at its OoTMM default so the tracked settings stay in sync with the
    // core defaults (and out of shared-state diffs).
    expect(TRACKER_DEFAULT_SETTINGS.mmAgeReqRandom).toEqual({ type: 'none' });
  });

  it('defaults all MM age requirement flags to disabled', () => {
    for (const item of MM_AGE_REQ_ITEMS) {
      expect(TRACKER_DEFAULT_SETTINGS[item.childSetting]).toBe(false);
      expect(TRACKER_DEFAULT_SETTINGS[item.adultSetting]).toBe(false);
    }
  });

  it('only shows age requirements when both MM ages are reachable', () => {
    const hookshot = MM_AGE_REQ_ITEMS.find((item) => item.id === 'hookshot');
    expect(hookshot).toBeTruthy();

    const cond = (settings: Record<string, unknown>) =>
      Boolean(
        SETTINGS_DEFINITIONS.find(
          (definition) =>
            definition.control?.childKey === hookshot?.childSetting,
        )?.cond?.(settings),
      );

    expect(cond({ games: 'oot' })).toBe(false);
    expect(cond({ games: 'ootmm' })).toBe(false);
    expect(cond({ games: 'ootmm', crossAge: true })).toBe(true);
    expect(cond({ games: 'mm', adultMaskMm: true })).toBe(true);
    expect(cond({ games: 'ootmm', adultMaskMm: true, crossAge: true })).toBe(
      true,
    );
  });

  it('hides age requirements for items outside the MM item pool', () => {
    const shortHookshot = MM_AGE_REQ_ITEMS.find(
      (item) => item.id === 'hookshotShort',
    );
    const hookshot = MM_AGE_REQ_ITEMS.find((item) => item.id === 'hookshot');
    expect(shortHookshot).toBeTruthy();
    expect(hookshot).toBeTruthy();

    const condOf = (childSetting: string) =>
      SETTINGS_DEFINITIONS.find(
        (definition) => definition.control?.childKey === childSetting,
      )?.cond;

    const base = { games: 'ootmm', adultMaskMm: true };

    expect(condOf(shortHookshot!.childSetting)?.(base)).toBe(false);
    expect(
      condOf(shortHookshot!.childSetting)?.({
        ...base,
        shortHookshotMm: true,
      }),
    ).toBe(true);
    // Items without a pool setting are always part of the pool.
    expect(condOf(hookshot!.childSetting)?.(base)).toBe(true);
  });

  it('maps the age dropdown value to the child/adult flags', () => {
    const childKey = 'mmAgeReqChildHookshot';
    const adultKey = 'mmAgeReqAdultHookshot';

    expect(readMmAgeRequirement({}, childKey, adultKey)).toBe('both');
    expect(readMmAgeRequirement({ [childKey]: true }, childKey, adultKey)).toBe(
      'child',
    );
    expect(readMmAgeRequirement({ [adultKey]: true }, childKey, adultKey)).toBe(
      'adult',
    );
    expect(
      readMmAgeRequirement(
        { [childKey]: true, [adultKey]: true },
        childKey,
        adultKey,
      ),
    ).toBe('child');

    expect(writeMmAgeRequirement({}, childKey, adultKey, 'both')).toEqual({
      [childKey]: false,
      [adultKey]: false,
    });
    expect(writeMmAgeRequirement({}, childKey, adultKey, 'child')).toEqual({
      [childKey]: true,
      [adultKey]: false,
    });
    expect(writeMmAgeRequirement({}, childKey, adultKey, 'adult')).toEqual({
      [childKey]: false,
      [adultKey]: true,
    });
  });
});
