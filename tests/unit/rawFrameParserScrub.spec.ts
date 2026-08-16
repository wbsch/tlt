import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';
import { parsedCheckSet } from '../helpers/autotrackerFixtures';

// Combo-config layout for v31.0+ (size 745). Same layout used by v32_0.
const OOT_COMBO_CONFIG_MQ_OFFSET = 0x09c;
const OOT_COMBO_CONFIG_BOSS_COUNT = 12;
const LAYOUT_V32 = {
  size: 745,
  bossOffset: 699,
  strayFairyRewardCountOffset: 711,
  bombchuBehaviorOotOffset: 712,
  bombchuBehaviorMmOffset: 713,
  songEventsOffset: 714,
  songEventCount: 13,
};

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Build a combo-config block that passes validateOotComboConfig with the given
 * MQ bitmask.
 */
function buildComboConfig(mqBits: number): Uint8Array {
  const data = new Uint8Array(LAYOUT_V32.size);
  data[0] = 1; // non-zero version marker; bytes 1..3 stay 0
  writeU32BE(data, OOT_COMBO_CONFIG_MQ_OFFSET, mqBits >>> 0);
  for (let index = 0; index < OOT_COMBO_CONFIG_BOSS_COUNT; index++) {
    data[LAYOUT_V32.bossOffset + index] = index;
  }
  for (let index = 0; index < LAYOUT_V32.songEventCount; index++) {
    data[LAYOUT_V32.songEventsOffset + index] = 0;
  }
  return data;
}

/**
 * Build a raw OoT message from the sparse chunk specs, with all-zero data
 * except the combo config and any bit set in the scrub bitmap.
 */
function buildOotMessage(
  scrubBit: number,
  mqBits: number,
): RawAutotrackerMessage {
  const chunks: RawAutotrackerMessage['chunks'] = [];

  for (const spec of RAW_CHUNK_SPECS_BY_GAME.oot) {
    const data = new Uint8Array(spec.length);
    if (spec.name === 'oot_runtime_combo_config') {
      chunks.push({
        name: spec.name,
        address: spec.address,
        length: spec.length,
        data: buildComboConfig(mqBits),
      });
      continue;
    }
    if (spec.name === 'oot_shared_custom_save_bitmap_scrubsOot') {
      data[Math.floor(scrubBit / 8)] |= 1 << (scrubBit % 8);
    }
    if (spec.name === 'oot_save_state_scene_flags') {
      // Make the permanent scene-flags region non-zero so isPlausibleOotSave
      // accepts the save.
      writeU32BE(data, 0, 0x08);
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

describe('rawFrameParser scrub checks', () => {
  it('tracks Dodongo Cavern Lobby Scrub (vanilla) via scrub bit 31', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    const parsed = parser.parse(buildOotMessage(31, 0));
    expect(parsed).not.toBeNull();
    const checks = parsedCheckSet(parsed!.checks);
    expect(checks.has('Dodongo Cavern Lobby Scrub')).toBe(true);
  });

  it('tracks the MQ name when Dodongo Cavern is MQ', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    // dungeonMq 1 (Dodongo Cavern) MQ bit set.
    const parsed = parser.parse(buildOotMessage(31, 1 << 1));
    expect(parsed).not.toBeNull();
    const checks = parsedCheckSet(parsed!.checks);
    expect(checks.has('MQ Dodongo Cavern Staircase Scrub')).toBe(true);
    expect(checks.has('Dodongo Cavern Lobby Scrub')).toBe(false);
  });
});
