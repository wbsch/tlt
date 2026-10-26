import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerMessage,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';
import { parsedCheckSet } from '../helpers/autotrackerFixtures';

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Build a raw OoT message from the sparse chunk specs, with all-zero data
 * except any bit set in the scrub bitmap.
 */
function buildOotMessage(scrubBit: number): RawAutotrackerMessage {
  const chunks: RawAutotrackerMessage['chunks'] = [];

  for (const spec of RAW_CHUNK_SPECS_BY_GAME.oot) {
    const data = new Uint8Array(spec.length);
    if (spec.name === 'oot_shared_custom_save_bitmap_scrubsOot') {
      data[Math.floor(scrubBit / 8)] |= 1 << (scrubBit % 8);
    }
    if (spec.name === 'oot_save_state_scene_flags') {
      // Make the permanent scene-flags region non-zero so isPlausibleOotSave
      // accepts the save.
      writeU32BE(data, 0, 0x08);
    }
    if (spec.name === 'oot_foreign_mm_save_inventory') {
      // Empty MM inventory slots are 0xff.  The item array sits at offset 4
      // within this chunk (past equipment at 0x6c..0x6f); fill it so the
      // foreign MM save reads as legitimately empty, not zeroed garbage.
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

describe('rawFrameParser scrub checks', () => {
  it('tracks Dodongo Cavern Lobby Scrub (vanilla) via scrub bit 31', () => {
    const parser = createRawAutotrackerParserSync('v32_0');
    const parsed = parser.parse(buildOotMessage(31));
    expect(parsed).not.toBeNull();
    const checks = parsedCheckSet(parsed!.checks);
    expect(checks.has('Dodongo Cavern Lobby Scrub')).toBe(true);
  });

  it('tracks the MQ name when Dodongo Cavern is MQ', () => {
    // The MQ layout comes from the spoiler log's `mqDungeons` world flag.
    const parser = createRawAutotrackerParserSync('v32_0', {
      mqDungeons: ['DC'],
    });
    const parsed = parser.parse(buildOotMessage(31));
    expect(parsed).not.toBeNull();
    const checks = parsedCheckSet(parsed!.checks);
    expect(checks.has('MQ Dodongo Cavern Staircase Scrub')).toBe(true);
    expect(checks.has('Dodongo Cavern Lobby Scrub')).toBe(false);
  });
});
