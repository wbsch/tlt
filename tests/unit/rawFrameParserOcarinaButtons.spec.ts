/**
 * Regression test: the shared ocarina button masks use the game's own
 * button bits (BTN_A=0x8000, BTN_CRIGHT=0x0001, BTN_CLEFT=0x0002,
 * BTN_CUP=0x0008, BTN_CDOWN=0x0004). C-UP and C-DOWN were previously
 * swapped, so playing C-UP tracked C-DOWN and vice versa.
 */
import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS,
  type RawAutotrackerMessage,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import sharedOffsets from '@/../packs/ootmm/src/autotracker/data/v32_0/shared_save_offsets.json';

const OOT_SAVE_CHUNK = 'oot_save_state';
const SHARED_CHUNK = 'oot_shared_custom_save';

function findSpec(name: string) {
  const spec = RAW_CHUNK_SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`missing chunk spec ${name}`);
  return spec;
}

function writeU16BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 8) & 0xff;
  data[offset + 1] = value & 0xff;
}

function buildMessage(maskOot: number, maskMm: number): RawAutotrackerMessage {
  const ootSpec = findSpec(OOT_SAVE_CHUNK);
  const sharedSpec = findSpec(SHARED_CHUNK);

  // Minimal OoT save that passes isPlausibleOotSave and covers all active
  // sub-chunk ranges (scene-flags region extends up to 0x1104).
  const oot = new Uint8Array(0x135c); // covers addrOotSaveCtx+0x04..+0x1360
  writeU16BE(oot, 0x04 - 0x04, 0); // age = 0
  writeU16BE(oot, 0x66 - 0x04, 0); // sceneId = 0
  writeU16BE(oot, 0x0d0 - 0x04, 0); // gold tokens = 0
  for (let i = 0; i < 19; i++) oot[0x0bc - 0x04 + i] = 0xff; // keys = -1
  oot[0x0d4 - 0x04 + 2] = 0x01; // perm region nonzero

  const shared = new Uint8Array(sharedSpec.length);
  writeU16BE(
    shared,
    (sharedOffsets as Record<string, number>).ocarinaButtonMaskOotOffset,
    maskOot,
  );
  writeU16BE(
    shared,
    (sharedOffsets as Record<string, number>).ocarinaButtonMaskMmOffset,
    maskMm,
  );

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
        name: ootSpec.name,
        address: ootSpec.address,
        length: ootSpec.length,
        data: oot,
      },
      {
        name: sharedSpec.name,
        address: sharedSpec.address,
        length: sharedSpec.length,
        data: shared,
      },
    ],
  };
}

describe('rawFrameParser ocarina buttons', () => {
  it('maps shared ocarina mask bits to the correct button items', () => {
    const cases: Array<[number, string[]]> = [
      [0x8000, ['MM_BUTTON_A', 'OOT_BUTTON_A']],
      [0x0001, ['MM_BUTTON_C_RIGHT', 'OOT_BUTTON_C_RIGHT']],
      [0x0002, ['MM_BUTTON_C_LEFT', 'OOT_BUTTON_C_LEFT']],
      [0x0008, ['MM_BUTTON_C_UP', 'OOT_BUTTON_C_UP']],
      [0x0004, ['MM_BUTTON_C_DOWN', 'OOT_BUTTON_C_DOWN']],
      [
        0x0008 | 0x0004,
        [
          'MM_BUTTON_C_DOWN',
          'MM_BUTTON_C_UP',
          'OOT_BUTTON_C_DOWN',
          'OOT_BUTTON_C_UP',
        ],
      ],
      [0x0000, []],
      [0xffff, []],
    ];
    for (const [mask, expected] of cases) {
      const parser = createRawAutotrackerParserSync();
      const parsed = parser.parse(buildMessage(mask, mask));
      if (!parsed) throw new Error(`parse failed for mask ${mask}`);
      const owned = parsed.items
        .filter((i) => i.id.includes('BUTTON') && i.qty > 0)
        .map((i) => i.id)
        .sort();
      expect(owned, `mask 0x${mask.toString(16)}`).toEqual(expected);
    }
  });
});
