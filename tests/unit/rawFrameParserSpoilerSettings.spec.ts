import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';
import { parsedCheckSet } from '../helpers/autotrackerFixtures';

// ---------------------------------------------------------------------------
// Spoiler-log settings that drive raw parsing.
//
// Two pieces of state the parser used to read out of RAM are now inputs:
//   - `mqDungeons` (spoiler log `World Flags`) decides whether dungeon checks
//     resolve to their vanilla or MQ names. It used to come from
//     `ComboConfig.mq`.
//   - `bronzeScale` (spoiler log setting) decides whether an owned bronze
//     pre-stage adds one level on top of the save's dive upgrade. It used to
//     come from `ComboConfig.config[CFG_BRONZE_SCALE]`, because the runtime
//     `bronzeScaleOot/Mm` bits are always set by the first scale pickup
//     (`progressiveDiveOot` resolves that pickup to the bronze item even when
//     the setting is off), so RAM cannot distinguish the two cases.
// ---------------------------------------------------------------------------

const OOT_OFF_INVENTORY_ITEMS = 0x74;
const OOT_OFF_UPGRADES = 0xa0;
const OOT_SCALE_UPGRADE_SHIFT = 9;
const OOT_SCALE_UPGRADE_MASK = 0x3;
const OOT_SCALE_BRONZE_PROGRESSIVE_BIT = 4;
const MM_SCALE_BRONZE_PROGRESSIVE_BIT = 3;

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Build a raw OoT message from the sparse chunk specs with all-zero data, a
 * plausible save (scene 0, chest bit 3 → `OOT_chest_0_3`), the requested dive
 * upgrade level and, optionally, the bronze pre-stage bits.
 */
function buildOotMessage(
  options: { ootScaleLevel?: number; bronzeScaleOwned?: boolean } = {},
): RawAutotrackerMessage {
  const chunks: RawAutotrackerMessage['chunks'] = [];

  for (const spec of RAW_CHUNK_SPECS_BY_GAME.oot) {
    const data = new Uint8Array(spec.length);
    if (spec.name === 'oot_save_state_scene_flags') {
      writeU32BE(data, 0, 0x08);
    }
    if (spec.name === 'oot_save_state_inventory' && options.ootScaleLevel) {
      writeU32BE(
        data,
        OOT_OFF_UPGRADES - OOT_OFF_INVENTORY_ITEMS,
        (options.ootScaleLevel & OOT_SCALE_UPGRADE_MASK) <<
          OOT_SCALE_UPGRADE_SHIFT,
      );
    }
    if (
      spec.name === 'oot_shared_custom_save_bitmap_progressiveFlags' &&
      options.bronzeScaleOwned
    ) {
      data[0] |=
        (1 << OOT_SCALE_BRONZE_PROGRESSIVE_BIT) |
        (1 << MM_SCALE_BRONZE_PROGRESSIVE_BIT);
    }
    if (spec.name === 'oot_foreign_mm_save_inventory') {
      data.fill(0xff, 4, 4 + 48);
    }
    chunks.push({
      name: spec.name,
      address: spec.address,
      length: spec.length,
      data,
    });
  }

  return {
    type: 'raw',
    schemaVersion: '1',
    diff: false,
    refresh: true,
    sequence: 1,
    game: 'OoT',
    saveIndex: 0,
    chunks,
  };
}

function itemQty(
  parsed: NonNullable<ReturnType<typeof parse>>,
  id: string,
): number {
  return parsed.items.find((item) => item.id === id)?.qty ?? 0;
}

function parse(
  parser: ReturnType<typeof createRawAutotrackerParserSync>,
  message: RawAutotrackerMessage,
): NonNullable<
  ReturnType<ReturnType<typeof createRawAutotrackerParserSync>['parse']>
> {
  const parsed = parser.parse(message);
  if (!parsed) {
    throw new Error('Expected the constructed message to parse successfully');
  }
  return parsed;
}

describe('rawFrameParser spoiler-driven MQ dungeon split', () => {
  it.each(['v30_1', 'v31_1', 'v32_0', 'v33_0'] as const)(
    'defaults to the vanilla check names for %s',
    (dirName) => {
      const parser = createRawAutotrackerParserSync(dirName);
      const checks = parsedCheckSet(parse(parser, buildOotMessage()).checks);

      expect(checks.has('Deku Tree Map Chest')).toBe(true);
      expect(checks.has('MQ Deku Tree Map Chest')).toBe(false);
    },
  );

  it.each(['v30_1', 'v31_1', 'v32_0', 'v33_0'] as const)(
    'resolves the MQ check names for %s from the spoiler mqDungeons the parser was built with',
    (dirName) => {
      const parser = createRawAutotrackerParserSync(dirName, {
        mqDungeons: ['DT'],
      });
      const checks = parsedCheckSet(parse(parser, buildOotMessage()).checks);

      expect(checks.has('MQ Deku Tree Map Chest')).toBe(true);
      expect(checks.has('Deku Tree Map Chest')).toBe(false);
    },
  );

  it('follows a later setMqDungeons call', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    expect(
      parsedCheckSet(parse(parser, buildOotMessage()).checks).has(
        'Deku Tree Map Chest',
      ),
    ).toBe(true);

    parser.setMqDungeons(['DT']);
    expect(
      parsedCheckSet(parse(parser, buildOotMessage()).checks).has(
        'MQ Deku Tree Map Chest',
      ),
    ).toBe(true);

    parser.setMqDungeons(null);
    expect(
      parsedCheckSet(parse(parser, buildOotMessage()).checks).has(
        'Deku Tree Map Chest',
      ),
    ).toBe(true);
  });
});

describe('rawFrameParser bronze scale setting', () => {
  it('reports the plain dive upgrade level when the setting is off', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    const parsed = parse(
      parser,
      buildOotMessage({ ootScaleLevel: 2, bronzeScaleOwned: true }),
    );

    expect(itemQty(parsed, 'OOT_SCALE')).toBe(2);
    expect(itemQty(parsed, 'MM_SCALE')).toBe(0);
  });

  it('adds one level for an owned bronze pre-stage when the setting is on', () => {
    const parser = createRawAutotrackerParserSync('v32_0', {
      bronzeScale: true,
    });
    const parsed = parse(
      parser,
      buildOotMessage({ ootScaleLevel: 2, bronzeScaleOwned: true }),
    );

    expect(itemQty(parsed, 'OOT_SCALE')).toBe(3);
    expect(itemQty(parsed, 'MM_SCALE')).toBe(1);
  });

  it('does not invent the bronze level when the pre-stage is not owned yet', () => {
    const parser = createRawAutotrackerParserSync('v32_0', {
      bronzeScale: true,
    });
    const parsed = parse(parser, buildOotMessage({ ootScaleLevel: 2 }));

    expect(itemQty(parsed, 'OOT_SCALE')).toBe(2);
    expect(itemQty(parsed, 'MM_SCALE')).toBe(0);
  });

  it.each(['v30_1', 'v31_1', 'v32_0', 'v33_0'] as const)(
    'applies the setting identically for %s',
    (dirName) => {
      const parser = createRawAutotrackerParserSync(dirName, {
        bronzeScale: true,
      });
      const parsed = parse(
        parser,
        buildOotMessage({ ootScaleLevel: 1, bronzeScaleOwned: true }),
      );

      expect(itemQty(parsed, 'OOT_SCALE')).toBe(2);
    },
  );

  it('follows a later setBronzeScale call', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    const message = buildOotMessage({
      ootScaleLevel: 1,
      bronzeScaleOwned: true,
    });

    expect(itemQty(parse(parser, message), 'OOT_SCALE')).toBe(1);

    parser.setBronzeScale(true);
    expect(itemQty(parse(parser, message), 'OOT_SCALE')).toBe(2);

    parser.setBronzeScale(false);
    expect(itemQty(parse(parser, message), 'OOT_SCALE')).toBe(1);
  });
});
