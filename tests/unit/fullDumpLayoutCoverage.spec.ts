import { describe, expect, it } from 'vitest';

import {
  buildFullDumpChunkSpecs,
  createRawAutotrackerParserSync,
  RAW_CHUNK_SPECS_BY_GAME,
  type RawAutotrackerChunkSpec,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import { AUTOTRACKER_DATA_VERSIONS } from '@/../packs/ootmm/src/autotracker/data/versions';

/**
 * The fixed "full" dump layout must cover the union of every version-specific
 * sub-range (`RAW_CHUNK_SPECS_BY_GAME`) for every supported version. If a spec
 * falls outside the fixed ranges, a full capture silently loses that data and
 * `npm run verify:test-dumps` can no longer re-derive the recorded state from
 * `regions` alone.
 *
 * Regression guard for the play-state room/link-age specs, which lived beyond
 * the play-state "core + tail" range of the v1 layout.
 */
function formatSpec(spec: RawAutotrackerChunkSpec): string {
  const address = `0x${spec.address.toString(16)}`;
  return `${spec.name}@${address}+${spec.length}`;
}

describe('fixed full-dump layout coverage', () => {
  const fullLayouts = buildFullDumpChunkSpecs();

  for (const version of AUTOTRACKER_DATA_VERSIONS) {
    for (const game of ['oot', 'mm'] as const) {
      it(`covers every ${game.toUpperCase()} spec of ${version.label}`, () => {
        // Selecting the version rebuilds the module-global chunk specs.
        createRawAutotrackerParserSync(version.dirName);

        const fixedRanges = fullLayouts[game].map((spec) => ({
          start: spec.address,
          end: spec.address + spec.length,
        }));

        const uncovered = RAW_CHUNK_SPECS_BY_GAME[game].filter(
          (spec) =>
            !fixedRanges.some(
              (range) =>
                spec.address >= range.start &&
                spec.address + spec.length <= range.end,
            ),
        );

        expect(uncovered.map(formatSpec)).toEqual([]);
      });
    }
  }

  it('does not request overlapping fixed ranges', () => {
    for (const game of ['oot', 'mm'] as const) {
      const ranges = fullLayouts[game]
        .map((spec) => ({
          name: spec.name,
          start: spec.address,
          end: spec.address + spec.length,
        }))
        .sort((left, right) => left.start - right.start);

      for (let index = 1; index < ranges.length; index++) {
        expect(ranges[index]!.start).toBeGreaterThanOrEqual(
          ranges[index - 1]!.end,
        );
      }
    }
  });
});
