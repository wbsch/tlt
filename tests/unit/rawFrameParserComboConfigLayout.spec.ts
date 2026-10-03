import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
  type RawAutotrackerParser,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import { getVersionedDataFile } from '@/../packs/ootmm/src/autotracker/data/registry';

// ---------------------------------------------------------------------------
// Constructed-state tests for the version-dependent combo-config layout.
//
// The ComboConfig struct tail layout changed between v30.1 and v31.0:
//   - v30_1:  staticHints[20] before the bosses, no songEventsMm → size 0x2DC
//   - v31_0+: giZoraSapphire before staticHints[21], songEventsMm appended
//             → size 0x2E9
// The parser reads this layout from the per-version combo_config_layout.json
// files.  These tests build a valid combo-config chunk by hand and assert the
// parser resolves scene-conflict check names (e.g. "Deku Tree Map Chest")
// only when the chunk matches the parser version's layout.
// ---------------------------------------------------------------------------

const OOT_COMBO_CONFIG_MQ_OFFSET = 0x09c;
const OOT_COMBO_CONFIG_FLAGS_OFFSET = 0x0ec;
const OOT_COMBO_CONFIG_BOSS_COUNT = 12;
const OOT_COMBO_CONFIG_SONG_EVENT_COUNT = 18;
const OOT_OFF_UPGRADES = 0x0a0;
const OOT_OFF_INVENTORY_ITEMS = 0x74;
const OOT_SCALE_UPGRADE_SHIFT = 9;
const OOT_SCALE_UPGRADE_MASK = 0x3;
const OOT_SCALE_BRONZE_PROGRESSIVE_BIT = 4;
const MM_SCALE_BRONZE_PROGRESSIVE_BIT = 3;

// The BRONZE_SCALE config[] index is version data: 192 in v30.1 and 225 in
// v31.0+. A regression here silently turns the bronze pre-stage into a no-op,
// which under-reports the progressive scale level by one (see the scale tests
// below). These literal values are asserted against the shipped data files.
const BRONZE_SCALE_FLAG_V30_1 = 192;
const BRONZE_SCALE_FLAG_V31_PLUS = 225;

type ComboConfigLayoutFixture = {
  size: number;
  staticHintsOffset: number;
  staticHintCount: number;
  bossOffset: number;
  strayFairyRewardCountOffset: number;
  bombchuBehaviorOotOffset: number;
  bombchuBehaviorMmOffset: number;
  songEventsOffset: number;
};

const LAYOUT_V30_1: ComboConfigLayoutFixture = {
  size: 732,
  staticHintsOffset: 676,
  staticHintCount: 20,
  bossOffset: 698,
  strayFairyRewardCountOffset: 710,
  bombchuBehaviorOotOffset: 711,
  bombchuBehaviorMmOffset: 712,
  songEventsOffset: 713,
};

const LAYOUT_V31_PLUS: ComboConfigLayoutFixture = {
  size: 745,
  staticHintsOffset: 678,
  staticHintCount: 21,
  bossOffset: 699,
  strayFairyRewardCountOffset: 711,
  bombchuBehaviorOotOffset: 712,
  bombchuBehaviorMmOffset: 713,
  songEventsOffset: 714,
};

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Build a combo-config block that satisfies validateOotComboConfig for the
 * given layout.  All fields default to zero (valid values); bosses get unique
 * ids 0..11 so the uniqueness check passes.  `bronzeScaleFlag` (when given)
 * sets that `config[]` bit to enable the bronze scale pre-stage.
 * `songEvents` overrides the song-event indices (default all zero).
 */
function buildComboConfig(
  layout: ComboConfigLayoutFixture,
  mqBits: number,
  bronzeScaleFlag?: number,
  songEvents?: readonly number[],
): Uint8Array {
  const data = new Uint8Array(layout.size);
  data[0] = 1; // non-zero version marker; bytes 1..3 stay 0
  writeU32BE(data, OOT_COMBO_CONFIG_MQ_OFFSET, mqBits >>> 0);
  for (let index = 0; index < OOT_COMBO_CONFIG_BOSS_COUNT; index++) {
    data[layout.bossOffset + index] = index;
  }
  data[layout.strayFairyRewardCountOffset] = 0;
  data[layout.bombchuBehaviorOotOffset] = 0;
  data[layout.bombchuBehaviorMmOffset] = 0;
  for (let index = 0; index < OOT_COMBO_CONFIG_SONG_EVENT_COUNT; index++) {
    data[layout.songEventsOffset + index] = songEvents?.[index] ?? 0;
  }
  if (bronzeScaleFlag !== undefined) {
    data[OOT_COMBO_CONFIG_FLAGS_OFFSET + (bronzeScaleFlag >> 3)] |=
      1 << (bronzeScaleFlag & 7);
  }
  return data;
}

/**
 * Build a raw OoT snapshot with a fresh save at scene 0 whose chest bit 3 is
 * set (→ key OOT_chest_0_3) plus the given combo-config chunk.
 *
 * `ootScaleLevel` sets the save's dive upgrade level (0..3); when
 * `bronzeScaleOwned` is set, the shared progressiveFlags BRONZE bits are set
 * too, mirroring a genuinely owned bronze pre-stage.
 */
function buildOotMessageWithComboConfig(
  comboConfig: Uint8Array,
  comboConfigSpecLength: number,
  options: {
    ootScaleLevel?: number;
    bronzeScaleOwned?: boolean;
    xflagsOotBit?: number;
  } = {},
): RawAutotrackerMessage {
  const chunks: RawAutotrackerMessage['chunks'] = [];

  for (const spec of RAW_CHUNK_SPECS_BY_GAME.oot) {
    const data = new Uint8Array(spec.length);
    if (spec.name === 'oot_save_state_scene_flags') {
      // Scene 0 (Deku Tree) chest bit 3 → OOT_chest_0_3.
      writeU32BE(data, 0, 0x08);
    }
    if (
      spec.name === 'oot_shared_custom_save_bitmap_xflagsOot' &&
      options.xflagsOotBit !== undefined
    ) {
      data[options.xflagsOotBit >> 3] |= 1 << (options.xflagsOotBit & 7);
    }
    if (spec.name === 'oot_save_state_inventory' && options.ootScaleLevel) {
      // The inventory chunk starts at OOT_OFF_INV_ITEMS (0x74); the upgrades
      // word (OOT_OFF_UPGRADES = 0xa0) holds the dive level at bit 9.
      const upgradeOffset = OOT_OFF_UPGRADES - OOT_OFF_INVENTORY_ITEMS;
      writeU32BE(
        data,
        upgradeOffset,
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
      // Empty MM inventory slots are 0xff; fill the item region (offset 4) so
      // the foreign MM save is legitimately empty, not zeroed garbage.
      data.fill(0xff, 4, 4 + 48);
    }
    chunks.push({
      name: spec.name,
      address: spec.address,
      length: spec.length,
      data,
    });
  }

  const comboIndex = chunks.findIndex(
    (chunk) => chunk.name === 'oot_runtime_combo_config',
  );
  if (comboIndex < 0) {
    throw new Error('Missing oot_runtime_combo_config chunk spec');
  }
  chunks[comboIndex] = {
    name: 'oot_runtime_combo_config',
    address: chunks[comboIndex].address,
    length: comboConfigSpecLength,
    data: comboConfig,
  };

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

function parseMessage(
  parser: RawAutotrackerParser,
  message: RawAutotrackerMessage,
): NonNullable<ReturnType<RawAutotrackerParser['parse']>> {
  const parsed = parser.parse(message);
  if (!parsed) {
    throw new Error('Expected the constructed message to parse successfully');
  }
  return parsed;
}

function parsedCheckNames(
  parser: RawAutotrackerParser,
  message: RawAutotrackerMessage,
): string[] {
  return parseMessage(parser, message).checks.map((check) => check.name);
}

describe('combo config layout version handling', () => {
  it.each([
    ['v30_1', LAYOUT_V30_1],
    ['v31_0', LAYOUT_V31_PLUS],
    ['v31_1', LAYOUT_V31_PLUS],
    ['v32_0', LAYOUT_V31_PLUS],
  ] as const)(
    'resolves Deku Tree chest checks for %s with its own layout',
    (dirName, layout) => {
      const parser = createRawAutotrackerParserSync(dirName);
      const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
        (spec) => spec.name === 'oot_runtime_combo_config',
      );
      expect(comboSpec?.length).toBe(layout.size);

      const message = buildOotMessageWithComboConfig(
        buildComboConfig(layout, 0),
        comboSpec?.length ?? layout.size,
      );
      const names = parsedCheckNames(parser, message);

      // mqBits == 0 → Deku Tree is vanilla → vanilla conflict names resolve.
      expect(names).toContain('Deku Tree Map Chest');
      expect(names).not.toContain('MQ Deku Tree Map Chest');
    },
  );

  it.each([
    ['v30_1', LAYOUT_V30_1],
    ['v31_1', LAYOUT_V31_PLUS],
    ['v32_0', LAYOUT_V31_PLUS],
  ] as const)(
    'resolves MQ Deku Tree chest checks for %s when mqBits bit 0 is set',
    (dirName, layout) => {
      const parser = createRawAutotrackerParserSync(dirName);
      const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
        (spec) => spec.name === 'oot_runtime_combo_config',
      );
      const message = buildOotMessageWithComboConfig(
        buildComboConfig(layout, 0b1),
        comboSpec?.length ?? layout.size,
      );
      const names = parsedCheckNames(parser, message);

      expect(names).toContain('MQ Deku Tree Map Chest');
      expect(names).not.toContain('Deku Tree Map Chest');
    },
  );

  // Regression: `songEventsOot[]` holds indices into a 20-entry song table
  // (`kOcarinaActions`), so shuffled seeds store values well above 5. The
  // validator must accept those, otherwise the whole combo config is rejected,
  // runtime MQ bits are ignored, and every Deku Tree / Jabu Jabu conflict
  // check silently disappears (scene and bitmap conflicts both resolve via
  // `ootMqDungeonState`).
  const SHUFFLED_SONG_EVENTS = [
    2, 1, 11, 7, 9, 6, 11, 5, 6, 6, 0, 9, 0, 7, 8, 0, 3, 5,
  ] as const;

  it('resolves scene-conflict checks when song events are shuffled (values > 5)', () => {
    const parser = createRawAutotrackerParserSync('v32_3');
    const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
      (spec) => spec.name === 'oot_runtime_combo_config',
    );
    const message = buildOotMessageWithComboConfig(
      buildComboConfig(LAYOUT_V31_PLUS, 0, undefined, SHUFFLED_SONG_EVENTS),
      comboSpec?.length ?? LAYOUT_V31_PLUS.size,
    );
    const names = parsedCheckNames(parser, message);

    expect(names).toContain('Deku Tree Map Chest');
    expect(names).not.toContain('MQ Deku Tree Map Chest');
  });

  it('resolves xflag (bitmap) conflict checks when song events are shuffled (values > 5)', () => {
    const parser = createRawAutotrackerParserSync('v32_3');
    const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
      (spec) => spec.name === 'oot_runtime_combo_config',
    );
    // xflagsOot bit 73 is a conflict: vanilla → Deku Tree Grass Water Room 2.
    const message = buildOotMessageWithComboConfig(
      buildComboConfig(LAYOUT_V31_PLUS, 0, undefined, SHUFFLED_SONG_EVENTS),
      comboSpec?.length ?? LAYOUT_V31_PLUS.size,
      { xflagsOotBit: 73 },
    );
    const names = parsedCheckNames(parser, message);

    expect(names).toContain('Deku Tree Grass Water Room 2');
    expect(names).not.toContain('MQ Deku Tree Grass Spike Room Back 1');
  });

  it('does not resolve scene-conflict checks when the combo config does not match the parser layout', () => {
    // v31_1 parser expects the new (745-byte) layout; feeding it an old-layout
    // (732-byte) block fails validation → MQ state unknown → no conflict names.
    const parser = createRawAutotrackerParserSync('v31_1');
    const message = buildOotMessageWithComboConfig(
      buildComboConfig(LAYOUT_V30_1, 0),
      LAYOUT_V30_1.size,
    );
    const names = parsedCheckNames(parser, message);

    expect(names).not.toContain('Deku Tree Map Chest');
    expect(names).not.toContain('MQ Deku Tree Map Chest');
  });

  it('does not resolve scene-conflict checks when a new-layout block is fed to the v30_1 parser', () => {
    const parser = createRawAutotrackerParserSync('v30_1');
    const message = buildOotMessageWithComboConfig(
      buildComboConfig(LAYOUT_V31_PLUS, 0),
      LAYOUT_V31_PLUS.size,
    );
    const names = parsedCheckNames(parser, message);

    expect(names).not.toContain('Deku Tree Map Chest');
    expect(names).not.toContain('MQ Deku Tree Map Chest');
  });

  it('uses the layout data from each version folder for the runtime chunk length', () => {
    const parserV30 = createRawAutotrackerParserSync('v30_1');
    const v30Spec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
      (spec) => spec.name === 'oot_runtime_combo_config',
    );
    expect(v30Spec?.length).toBe(732);
    expect(parserV30).toBeTruthy();

    const parserV31 = createRawAutotrackerParserSync('v31_1');
    const v31Spec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
      (spec) => spec.name === 'oot_runtime_combo_config',
    );
    expect(v31Spec?.length).toBe(745);
    expect(parserV31).toBeTruthy();
  });

  // The BRONZE_SCALE flag index in ComboConfig.config[] is version data (192
  // in v30.1, 225 in v31.0+). Regression: a hardcoded 192 made the bronze
  // pre-stage a no-op for every version >= v31.0, so the tracker reported the
  // first (bronze) scale as if it were the only one and dropped the +1 stage.
  it.each([
    ['v30_1', LAYOUT_V30_1, BRONZE_SCALE_FLAG_V30_1],
    ['v31_0', LAYOUT_V31_PLUS, BRONZE_SCALE_FLAG_V31_PLUS],
    ['v31_1', LAYOUT_V31_PLUS, BRONZE_SCALE_FLAG_V31_PLUS],
    ['v32_0', LAYOUT_V31_PLUS, BRONZE_SCALE_FLAG_V31_PLUS],
  ] as const)(
    'counts the bronze pre-stage in the OOT scale level for %s',
    (dirName, layout, bronzeFlag) => {
      const parser = createRawAutotrackerParserSync(dirName);
      const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
        (spec) => spec.name === 'oot_runtime_combo_config',
      );
      const message = buildOotMessageWithComboConfig(
        buildComboConfig(layout, 0, bronzeFlag),
        comboSpec?.length ?? layout.size,
        { ootScaleLevel: 1, bronzeScaleOwned: true },
      );

      const scale = parseMessage(parser, message).items.find(
        (item) => item.id === 'OOT_SCALE',
      );
      // dive level 1 (silver held) + bronze pre-stage = progressive stage 2.
      expect(scale?.qty).toBe(2);
    },
  );

  it('ignores a bronze flag at the v30.1 index when running a v31.0+ layout', () => {
    // If the parser wrongly used the old 192 index for v32_0, the flag would
    // land in the wrong byte and the bronze stage would be lost.
    const parser = createRawAutotrackerParserSync('v32_0');
    const comboSpec = RAW_CHUNK_SPECS_BY_GAME.oot.find(
      (spec) => spec.name === 'oot_runtime_combo_config',
    );
    const message = buildOotMessageWithComboConfig(
      buildComboConfig(LAYOUT_V31_PLUS, 0, BRONZE_SCALE_FLAG_V30_1),
      comboSpec?.length ?? LAYOUT_V31_PLUS.size,
      { ootScaleLevel: 1, bronzeScaleOwned: true },
    );

    const scale = parseMessage(parser, message).items.find(
      (item) => item.id === 'OOT_SCALE',
    );
    expect(scale?.qty).toBe(1);
  });

  it('ships a per-version BRONZE_SCALE flag index in the layout data', () => {
    const readFlag = (dirName: string): number =>
      (
        getVersionedDataFile(dirName, 'combo_config_layout.json') as {
          configFlags: Record<string, number>;
        }
      ).configFlags.BRONZE_SCALE;

    expect(readFlag('v30_1')).toBe(BRONZE_SCALE_FLAG_V30_1);
    for (const dirName of [
      'v31_0',
      'v31_1',
      'v32_0',
      'v32_1',
      'v32_2',
      'v32_3',
    ]) {
      expect(readFlag(dirName)).toBe(BRONZE_SCALE_FLAG_V31_PLUS);
    }
  });
});
