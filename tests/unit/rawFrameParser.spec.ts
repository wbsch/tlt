import { describe, expect, it } from 'vitest';

import { createRawAutotrackerParser } from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import {
  buildRawMessage,
  listRawFixtureNames,
  parseFixture,
  parsedCheckSet,
  parsedItemMap,
} from '../helpers/autotrackerFixtures';

describe('raw frame parser', () => {
  it.each(listRawFixtureNames())(
    'parses %s as a raw snapshot',
    (fixtureName) => {
      const parser = createRawAutotrackerParser();
      const { parsed } = parseFixture(parser, fixtureName);

      expect(parsed).not.toBeNull();
    },
  );

  it('emits the known tracker-native extras that legacy summaries omit', () => {
    const parser = createRawAutotrackerParser();
    const { parsed } = parseFixture(
      parser,
      'before-madame-aroma-20260501-170327.json',
    );
    const items = parsedItemMap(parsed.items);

    expect(items.get('OOT_SMALL_KEY_GF')).toBe(1);
    expect(items.get('MM_CLOCK1')).toBe(1);
    expect(items.get('MM_CLOCK2')).toBe(1);
    expect(items.get('MM_CLOCK3')).toBe(1);
    expect(items.get('MM_CLOCK4')).toBe(1);
    expect(items.get('MM_CLOCK5')).toBe(1);
    expect(items.get('MM_CLOCK6')).toBe(1);
  });

  it('reuses the last-known MM state across subsequent OoT snapshots', () => {
    const parser = createRawAutotrackerParser();
    const { message: beforeMessage } = buildRawMessage(
      'before-madame-aroma-20260501-170327.json',
      1,
    );
    const { message: afterMessage } = buildRawMessage(
      'test-20260501-125454.json',
      2,
    );

    parser.parse(beforeMessage);
    const parsed = parser.parse(afterMessage);

    expect(parsed).not.toBeNull();
    const checks = parsedCheckSet(parsed!.checks);

    expect(checks.has('Clock Town Tree HP')).toBe(true);
    expect(checks.has('Clock Town Platform HP')).toBe(true);
  });
});
