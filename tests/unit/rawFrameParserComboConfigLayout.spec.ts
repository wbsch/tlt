import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
  type RawAutotrackerParser,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';

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
const OOT_COMBO_CONFIG_BOSS_COUNT = 12;
const OOT_COMBO_CONFIG_SONG_EVENT_COUNT = 18;

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

const OOT_SAVE_CHUNK_NAMES = [
  'oot_save_state_age',
  'oot_save_state_magic',
  'oot_save_state_scene',
  'oot_save_state_inventory',
  'oot_save_state_scene_flags',
  'oot_save_state_gs_flags',
  'oot_save_state_events',
];

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Build a combo-config block that satisfies validateOotComboConfig for the
 * given layout.  All fields default to zero (valid values); bosses get unique
 * ids 0..11 so the uniqueness check passes.
 */
function buildComboConfig(
  layout: ComboConfigLayoutFixture,
  mqBits: number,
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
    data[layout.songEventsOffset + index] = 0;
  }
  return data;
}

/**
 * Build a raw OoT snapshot with a fresh save at scene 0 whose chest bit 3 is
 * set (→ key OOT_chest_0_3) plus the given combo-config chunk.
 */
function buildOotMessageWithComboConfig(
  comboConfig: Uint8Array,
  comboConfigSpecLength: number,
): RawAutotrackerMessage {
  const chunks: RawAutotrackerMessage['chunks'] = [];

  for (const spec of RAW_CHUNK_SPECS_BY_GAME.oot) {
    const data = new Uint8Array(spec.length);
    if (spec.name === 'oot_save_state_scene_flags') {
      // Scene 0 (Deku Tree) chest bit 3 → OOT_chest_0_3.
      writeU32BE(data, 0, 0x08);
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
});
