import { describe, expect, it } from 'vitest';

import { createRawAutotrackerParser } from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import { parseFixture, parsedCheckSet } from '../helpers/autotrackerFixtures';

function getChecks(
  fixtureName: string,
  sequence = 1,
  parser = createRawAutotrackerParser(),
): Set<string> {
  return parsedCheckSet(
    parseFixture(parser, fixtureName, sequence).parsed.checks,
  );
}

function expectOnlyAddedChecks(
  beforeChecks: Set<string>,
  afterChecks: Set<string>,
  expectedAdded: string[],
) {
  const added = [...afterChecks]
    .filter((name) => !beforeChecks.has(name))
    .sort((left, right) => left.localeCompare(right));

  for (const name of beforeChecks) {
    expect(afterChecks.has(name)).toBe(true);
  }

  expect(added).toEqual(
    [...expectedAdded].sort((left, right) => left.localeCompare(right)),
  );
}

function expectChecksAbsent(checks: Set<string>, names: string[]) {
  for (const name of names) {
    expect(checks.has(name)).toBe(false);
  }
}

describe('raw frame snapshot transitions', () => {
  it('tracks the Initial Song of Healing extra-flag transition', () => {
    const parser = createRawAutotrackerParser();
    const withoutChecks = getChecks(
      'mm-without-initial-song-of-healing-20260501-143756.json',
      1,
      parser,
    );
    const withChecks = getChecks(
      'mm-with-initial-song-of-healing-20260501-143938.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(withoutChecks, withChecks, [
      'Initial Song of Healing',
    ]);
  });

  it('keeps Honey and Darling rewards absent in the false-positive fixture', () => {
    const checks = getChecks('honey-darling-false-20260429-204043.json');

    expectChecksAbsent(checks, [
      'Honey & Darling Reward Any Day',
      'Honey & Darling Reward All Days',
    ]);
  });

  it('tracks the Tingle map fallback pair without leaking extra map checks', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-tingle-20260501-170052.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-tingle-20260501-170137.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Tingle Map Clock Town',
      'Tingle Map Woodfall',
    ]);
    expectChecksAbsent(afterChecks, [
      'Tingle Map Snowhead',
      'Tingle Map Ranch',
      'Tingle Map Great Bay',
      'Tingle Map Ikana',
    ]);
  });

  it('tracks the Madame Aroma fallback pair without removing prior checks', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-madame-aroma-20260501-170327.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-madame-aroma-20260501-170357.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      "Mayor's Office Kafei's Mask",
    ]);
  });

  it('tracks the Stock Pot Inn room key fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-anju-key-20260501-170709.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-anju-key-20260501-170751.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Stock Pot Inn Room Key',
    ]);
  });

  it('tracks the Town Archery fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-archery-20260501-170932.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-archery-20260501-171131.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, ['Town Archery Reward 1']);
    expectChecksAbsent(afterChecks, [
      'Town Archery Reward 2',
      'Swamp Archery Reward 1',
      'Swamp Archery Reward 2',
    ]);
  });

  it('tracks Bombchu Bowling reward progression across the snapshot trio', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-bombchu-bowling-20260501-201613.json',
      1,
      parser,
    );
    const afterFirstChecks = getChecks(
      'after-bomchu-1-20260501-201847.json',
      2,
      parser,
    );
    const afterSecondChecks = getChecks(
      'after-bombchu-2-20260501-202008.json',
      3,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterFirstChecks, [
      'Bombchu Bowling Reward 1',
    ]);
    expectOnlyAddedChecks(afterFirstChecks, afterSecondChecks, [
      'Bombchu Bowling Reward 2',
    ]);
  });

  it('tracks the Zora Diving Game fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-diving-game-20260501-205252.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-diving-game-20260501-205332.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Zora Domain Diving Game',
    ]);
  });

  it('tracks the Goron Tunic fallback pair without leaking unrelated extra flags', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-goron-20260501-185643.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-goron-20260501-185719.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, ['Goron City Tunic']);
    expectChecksAbsent(beforeChecks, [
      'Fishing Pond Adult',
      'Fishing Pond Child',
      'Zora Domain Tunic',
      'Lake Hylia Fire Arrow',
      'Treasure Chest Game Buy Key',
      'Death Mountain Trail Biggoron Sword',
      'Kakariko Potion Shop Odd Potion',
    ]);
    expectChecksAbsent(afterChecks, [
      'Fishing Pond Adult',
      'Fishing Pond Child',
      'Zora Domain Tunic',
      'Lake Hylia Fire Arrow',
      'Treasure Chest Game Buy Key',
      'Death Mountain Trail Biggoron Sword',
      'Kakariko Potion Shop Odd Potion',
    ]);
  });

  it('keeps the expanded MM extra-flag fallbacks absent across the May 1 fixtures', () => {
    const blockedChecks = [
      'Clock Town Postman Hat',
      'Milk Bar Troupe Leader Mask',
      'Moon Fierce Deity Mask',
      'Clock Tower Roof Skull Kid Ocarina',
      'Oath to Order',
      'Clock Town Guru-Guru Mask Bremen',
      'Deku Shrine Mask of Scents',
      'Termina Field Kamaro Mask',
      'Astral Observatory Moon Tear',
      'Lottery Prize Night 1',
      'Lottery Prize Night 2',
      'Lottery Prize Night 3',
    ];

    for (const fixtureName of [
      'before-madame-aroma-20260501-170327.json',
      'after-madame-aroma-20260501-170357.json',
      'before-anju-key-20260501-170709.json',
      'after-anju-key-20260501-170751.json',
    ]) {
      expectChecksAbsent(getChecks(fixtureName), blockedChecks);
    }
  });
});
