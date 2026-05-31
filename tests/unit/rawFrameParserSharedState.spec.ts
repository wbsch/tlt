import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParser,
  type RawAutotrackerMessage,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';
import { buildRawMessage } from '../helpers/autotrackerFixtures';

const BRONZE_SCALE_COMBO_CONFIG_BYTE_OFFSET = 0x104;
const BRONZE_SCALE_COMBO_CONFIG_BIT_MASK = 1 << 0;
const OOT_SCALE_BRONZE_PROGRESSIVE_BIT_MASK = 1 << 4;
const MM_SCALE_BRONZE_PROGRESSIVE_BIT_MASK = 1 << 3;

function updateChunkData(
  message: RawAutotrackerMessage,
  chunkName: string,
  mutate: (data: Uint8Array) => void,
): RawAutotrackerMessage {
  return {
    ...message,
    chunks: message.chunks.map((chunk) => {
      if (chunk.name !== chunkName) {
        return chunk;
      }

      const raw =
        typeof chunk.data === 'string'
          ? Uint8Array.from(Buffer.from(chunk.data, 'base64'))
          : new Uint8Array(chunk.data);
      const next = new Uint8Array(raw);
      mutate(next);

      return {
        ...chunk,
        data: Buffer.from(next).toString('base64'),
      };
    }),
  };
}

function withSyntheticBronzeScaleData(
  message: RawAutotrackerMessage,
): RawAutotrackerMessage {
  const withBronzeComboConfig = updateChunkData(
    message,
    'oot_runtime_combo_config',
    (data) => {
      data[BRONZE_SCALE_COMBO_CONFIG_BYTE_OFFSET] |=
        BRONZE_SCALE_COMBO_CONFIG_BIT_MASK;
    },
  );

  return updateChunkData(
    withBronzeComboConfig,
    'oot_shared_custom_save_bitmap_progressiveFlags',
    (data) => {
      data[0] |=
        OOT_SCALE_BRONZE_PROGRESSIVE_BIT_MASK |
        MM_SCALE_BRONZE_PROGRESSIVE_BIT_MASK;
    },
  );
}

function zeroTransitionAuxiliaryChunks(
  message: RawAutotrackerMessage,
  sequence: number,
): RawAutotrackerMessage {
  return {
    ...message,
    sequence,
    chunks: message.chunks.map((chunk) => {
      if (
        !chunk.name.includes('_shared_custom_save_') &&
        chunk.name !== 'oot_runtime_combo_config' &&
        chunk.name !== 'oot_runtime_max_keys' &&
        chunk.name !== 'oot_runtime_silver_rupee_data'
      ) {
        return chunk;
      }

      return {
        ...chunk,
        data: Buffer.from(new Uint8Array(chunk.length)).toString('base64'),
      };
    }),
  };
}

describe('rawFrameParser shared state fallback', () => {
  it('keeps the last known shared and runtime state when a later frame zeroes transition chunks during the same save state', () => {
    const parser = createRawAutotrackerParser();
    const { message } = buildRawMessage('after-bomchu-1-20260501-201847.json');
    const bronzeMessage = withSyntheticBronzeScaleData(message);

    const initial = parser.parse(bronzeMessage);
    expect(initial).not.toBeNull();
    expect(initial?.items.find((item) => item.id === 'OOT_SCALE')?.qty).toBe(2);
    expect(initial?.items.find((item) => item.id === 'MM_SCALE')?.qty).toBe(2);

    const transitionLikeFrame = zeroTransitionAuxiliaryChunks(bronzeMessage, 2);
    const parsed = parser.parse(transitionLikeFrame);

    expect(parsed).not.toBeNull();
    expect(parsed?.items.find((item) => item.id === 'OOT_SCALE')?.qty).toBe(2);
    expect(parsed?.items.find((item) => item.id === 'MM_SCALE')?.qty).toBe(2);
  });

  it('does not invent shared or runtime state before any valid snapshot was seen', () => {
    const parser = createRawAutotrackerParser();
    const { message } = buildRawMessage('after-bomchu-1-20260501-201847.json');
    const bronzeMessage = withSyntheticBronzeScaleData(message);

    const zeroedFirstFrame = zeroTransitionAuxiliaryChunks(bronzeMessage, 1);
    const parsed = parser.parse(zeroedFirstFrame);

    expect(parsed).not.toBeNull();
    expect(
      parsed?.items.find((item) => item.id === 'OOT_SCALE')?.qty ?? 0,
    ).toBe(1);
    expect(parsed?.items.find((item) => item.id === 'MM_SCALE')?.qty ?? 0).toBe(
      1,
    );
  });
});
