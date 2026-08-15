import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync as createRawAutotrackerParser,
  isPlausibleMmSave,
  RAW_CHUNK_SPECS,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import { translateAutotrackerItems } from '@/../packs/ootmm/src/autotracker/autotrackerMapping';
import {
  buildRawMessage,
  listRawFixtureNames,
  parseFixture,
  parsedCheckSet,
  parsedItemMap,
} from '../helpers/autotrackerFixtures';

const EMPTY_INVENTORY_ITEM = 0xff;
const OOT_SAVE_CHUNK_NAME = 'oot_save_state';
const OOT_OFF_AGE = 0x04;
const OOT_OFF_INV_ITEMS = 0x74;
const OOT_OFF_PERM = 0x0d4;
const OOT_PERM_ENTRY_SIZE = 0x1c;
const OOT_PERM_EXTRA_OFF = 0x10;
const EXTRA_IDX_OOT_TRADE = 0;
const EXTRA_IDX_OOT_TRADE_SAVE = 10;
const EXTRA_IDX_OOT_ITEMS = 1;
const EXTRA_IDX_OOT_FLAGS = 2;
const EXTRA_IDX_MM_ITEMS = 4;
const OOT_ITEM_SLOT_COUNT = 24;
const OOT_ITEM_HAMMER = 0x11;
const OOT_ITEM_GREAT_FAIRY_SWORD = 0xa8;

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function buildMinimalOotMessage(
  extraRecords: Record<number, number>,
): RawAutotrackerMessage {
  const ootSaveSpec = RAW_CHUNK_SPECS.find(
    (spec) => spec.name === OOT_SAVE_CHUNK_NAME,
  );
  if (!ootSaveSpec) {
    throw new Error('Missing OoT save chunk spec');
  }

  const data = new Uint8Array(ootSaveSpec.length);
  data.fill(
    EMPTY_INVENTORY_ITEM,
    OOT_OFF_INV_ITEMS - OOT_OFF_AGE,
    OOT_OFF_INV_ITEMS - OOT_OFF_AGE + OOT_ITEM_SLOT_COUNT,
  );

  for (const [rawIndex, value] of Object.entries(extraRecords)) {
    const index = Number.parseInt(rawIndex, 10);
    const offset =
      OOT_OFF_PERM +
      index * OOT_PERM_ENTRY_SIZE +
      OOT_PERM_EXTRA_OFF -
      OOT_OFF_AGE;
    writeU32BE(data, offset, value >>> 0);
  }

  return {
    type: 'raw',
    schemaVersion: '1',
    diff: false,
    refresh: true,
    sequence: 1,
    game: 'OoT',
    saveIndex: 0,
    chunks: [
      {
        name: ootSaveSpec.name,
        address: ootSaveSpec.address,
        length: ootSaveSpec.length,
        data,
      },
    ],
  };
}

/**
 * Builds a minimal OoT message whose hammer slot (index 15) holds `slotValue`
 * (0x11 = hammer, 0xa8 = Great Fairy's Sword) with the given extra records set.
 */
function buildOotMessageWithHammerSlot(
  slotValue: number,
  extraRecords: Record<number, number>,
): RawAutotrackerMessage {
  const message = buildMinimalOotMessage(extraRecords);
  const data = message.chunks[0].data as Uint8Array;
  data[OOT_OFF_INV_ITEMS - OOT_OFF_AGE + 15] = slotValue;
  return message;
}

describe('raw frame parser', () => {
  it('exposes sparse live chunk requests without legacy monolithic save or shared chunks', () => {
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_save_state',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some((spec) => spec.name === 'mm_save_state'),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_foreign_mm_save',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_foreign_oot_save',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_shared_custom_save',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_shared_custom_save',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_save_state_time',
      ),
    ).toBe(false);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_foreign_mm_save_time',
      ),
    ).toBe(false);

    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_save_state_inventory',
      ),
    ).toBe(true);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_save_state_week_events',
      ),
    ).toBe(true);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_foreign_mm_save_week_events',
      ),
    ).toBe(true);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_foreign_oot_save_events',
      ),
    ).toBe(true);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.oot.some(
        (spec) => spec.name === 'oot_shared_custom_save_song_notes',
      ),
    ).toBe(true);
    expect(
      RAW_CHUNK_SPECS_BY_GAME.mm.some(
        (spec) => spec.name === 'mm_shared_custom_save_song_notes',
      ),
    ).toBe(true);
  });

  it.each(listRawFixtureNames())(
    'parses %s as a raw snapshot',
    (fixtureName) => {
      const parser = createRawAutotrackerParser('v30_1');
      const { parsed } = parseFixture(parser, fixtureName);

      expect(parsed).not.toBeNull();
    },
  );

  it.each([
    'test-20260501-125454.json',
    'before-madame-aroma-20260501-170327.json',
  ])('parses %s with only sparse live chunks present', (fixtureName) => {
    const parser = createRawAutotrackerParser('v30_1');
    const { message } = buildRawMessage(fixtureName, 1);
    const parsed = parser.parse({
      ...message,
      chunks: message.chunks.filter(
        (chunk) =>
          chunk.name !== 'oot_save_state' &&
          chunk.name !== 'mm_save_state' &&
          chunk.name !== 'oot_foreign_mm_save' &&
          chunk.name !== 'mm_foreign_oot_save' &&
          chunk.name !== 'oot_shared_custom_save' &&
          chunk.name !== 'mm_shared_custom_save',
      ),
    });

    expect(parsed).not.toBeNull();
  });

  it('emits the known tracker-native extras that legacy summaries omit', () => {
    const parser = createRawAutotrackerParser('v30_1');
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
    const parser = createRawAutotrackerParser('v30_1');
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

  it('keeps consumed adult trade items owned after the next trade step is reached', () => {
    const parser = createRawAutotrackerParser('v30_1');
    const parsed = parser.parse(
      buildMinimalOotMessage({
        [EXTRA_IDX_OOT_TRADE]: 1 << 4,
        [EXTRA_IDX_OOT_TRADE_SAVE]: (1 << 3) | (1 << 4),
      }),
    );

    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_ADULT_TRADE')).toBe((1 << 3) | (1 << 4));

    const translated = translateAutotrackerItems(
      parsed!.items,
      new Set(['OOT_ODD_MUSHROOM', 'OOT_ODD_POTION']),
      new Map(),
    );

    expect(translated.OOT_ODD_MUSHROOM).toBe(1);
    expect(translated.OOT_ODD_POTION).toBe(1);
  });

  it('tracks the OOT Great Fairy Sword separately from the OOT hammer', () => {
    const parser = createRawAutotrackerParser('v32_0');
    // OOT Great Fairy Sword occupies the hammer slot (0xa8) and sets the
    // gfsHammer "GFS" bit (record 1, bit 22). It must NOT be reported as the
    // hammer.
    const parsed = parser.parse(
      buildOotMessageWithHammerSlot(OOT_ITEM_GREAT_FAIRY_SWORD, {
        [EXTRA_IDX_OOT_ITEMS]: 1 << 22,
      }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_HAMMER')).toBeUndefined();
    expect(items.get('OOT_GREAT_FAIRY_SWORD')).toBe(1);
  });

  it('still tracks the OOT hammer when it occupies the hammer slot', () => {
    const parser = createRawAutotrackerParser('v32_0');
    const parsed = parser.parse(
      buildOotMessageWithHammerSlot(OOT_ITEM_HAMMER, {
        [EXTRA_IDX_OOT_ITEMS]: 1 << 21,
      }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_HAMMER')).toBe(1);
    expect(items.get('OOT_GREAT_FAIRY_SWORD')).toBeUndefined();
  });

  it('tracks both OOT hammer and GFS when both gfsHammer bits are set', () => {
    const parser = createRawAutotrackerParser('v32_0');
    // GFS was obtained first (hammer slot holds 0xa8), then the hammer was
    // obtained (gfsHammer bit 0). Both bits are set, so both items must show.
    const parsed = parser.parse(
      buildOotMessageWithHammerSlot(OOT_ITEM_GREAT_FAIRY_SWORD, {
        [EXTRA_IDX_OOT_ITEMS]: (1 << 21) | (1 << 22),
      }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_HAMMER')).toBe(1);
    expect(items.get('OOT_GREAT_FAIRY_SWORD')).toBe(1);
  });

  it('tracks the MM hammer via the MmExtraItems.hammerGFS bit', () => {
    const parser = createRawAutotrackerParser('v32_0');
    // MmExtraItems.hammerGFS is record 4; param 1 (hammer) is bit 26.
    const parsed = parser.parse(
      buildMinimalOotMessage({ [EXTRA_IDX_MM_ITEMS]: 1 << 26 }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('MM_HAMMER')).toBe(1);
    expect(items.get('MM_GREAT_FAIRY_SWORD')).toBeUndefined();
  });

  it('tracks the OOT spin attack upgrade via OotExtraFlags.spinUpgrade', () => {
    const parser = createRawAutotrackerParser('v32_0');
    // OotExtraFlags.spinUpgrade is record 2, bit 5 (MSB-first layout). Bit 26
    // is greatFairies bit 1 (FAIRY_MAGIC_UPGRADE2) and must NOT report the
    // spin upgrade.
    const parsed = parser.parse(
      buildMinimalOotMessage({ [EXTRA_IDX_OOT_FLAGS]: 1 << 5 }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_SPIN_UPGRADE')).toBe(1);
  });

  it('does not report the OOT spin upgrade from the greatFairies bits', () => {
    const parser = createRawAutotrackerParser('v32_0');
    const parsed = parser.parse(
      buildMinimalOotMessage({ [EXTRA_IDX_OOT_FLAGS]: 1 << 26 }),
    );
    expect(parsed).not.toBeNull();

    const items = parsedItemMap(parsed!.items);
    expect(items.get('OOT_SPIN_UPGRADE')).toBeUndefined();
  });
});

describe('isPlausibleMmSave conditional all-zero rejection', () => {
  // Offsets within the MM save buffer
  const MM_OFF_PLAYER_FORM = 0x20;
  const MM_OFF_STRAY_FAIRIES = 0xd4;

  /** Creates a minimal, valid-looking MM save buffer.
   *  All fields required by isPlausibleMmSave pass their range checks.
   *  Equipment, permanent scene flags, and cycle flags are all zero.
   *  One Stray Fairy is set to verify that data outside the three
   *  checked regions does not cause rejection when rejectAllZero is false.
   */
  function buildMinimalMmSaveBuffer(strayFairyValue = 1): Uint8Array {
    // Buffer must cover all reads up to the last stray fairy byte (0xd4 + 10 = 0xde).
    const buffer = new Uint8Array(MM_OFF_STRAY_FAIRIES + 10);
    buffer[MM_OFF_PLAYER_FORM] = 0; // valid (≤ 4)
    // readU32BE at MM_OFF_DAY → all zeros → day = 0 (valid, ≤ 4)
    // Dungeon keys at 0xca..0xd2 all zero → toSignedByte(0) = 0 (valid, -1..9)
    // Equipment at 0x6c → zero
    // Scene flags at 0x0f8 and cycle flags at 0x3f68 are beyond the buffer,
    // so saveDataRegionHasNonZeroValue trivially returns false (all-zero).
    buffer[MM_OFF_STRAY_FAIRIES] = strayFairyValue;
    return buffer;
  }

  it('accepts a save with Stray Fairies but all-zero equipment/scene/cycle when rejectAllZero is false', () => {
    const data = buildMinimalMmSaveBuffer(4);
    expect(isPlausibleMmSave(data, false)).toBe(true);
  });

  it('rejects a save with Stray Fairies but all-zero equipment/scene/cycle when rejectAllZero is true', () => {
    const data = buildMinimalMmSaveBuffer(4);
    expect(isPlausibleMmSave(data, true)).toBe(false);
  });
});
