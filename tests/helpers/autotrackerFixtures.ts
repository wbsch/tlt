import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  RAW_CHUNK_SPECS,
  type ParsedRawAutotrackerSnapshot,
  type RawAutotrackerChunk,
  type RawAutotrackerChunkSpec,
  type RawAutotrackerMessage,
  type RawAutotrackerParser,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';

export type FixtureRegion = {
  name: string;
  address: string;
  size: number;
  encoding: string;
  data: string;
};

export type FixtureFile = {
  summary: {
    activeGame: string;
    saveIndex: number;
  };
  regions: FixtureRegion[];
};

export type LoadedRegion = {
  name: string;
  address: number;
  data: Uint8Array;
};

export const RAW_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  'tests/fixtures/autotracker/dumps',
);

export function listRawFixtureNames(): string[] {
  return readdirSync(RAW_FIXTURE_ROOT)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
}

export function loadRawFixture(name: string): FixtureFile {
  const raw = readFileSync(path.join(RAW_FIXTURE_ROOT, name), 'utf8');
  return JSON.parse(raw) as FixtureFile;
}

function decodeBase64(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, 'base64'));
}

/**
 * Decode a list of base64-encoded memory regions into addressable byte ranges.
 * Used both by the raw fixture path (`buildRawMessage`) and the test-dump
 * verifier (`autotrackerTestDumpVerifier.ts`).
 */
export function decodeRegions(regions: FixtureRegion[]): LoadedRegion[] {
  return regions
    .filter((region) => region.encoding === 'base64' && region.data)
    .map((region) => ({
      name: region.name,
      address: Number.parseInt(region.address, 0),
      data: decodeBase64(region.data),
    }));
}

/**
 * Slice `size` bytes at `address` out of the first region that fully covers
 * `[address, address + size)`. Returns `null` if no region covers the range.
 */
export function sliceRegions(
  regions: LoadedRegion[],
  address: number,
  size: number,
): Uint8Array | null {
  for (const region of regions) {
    if (address < region.address) {
      continue;
    }
    const offset = address - region.address;
    if (offset < 0 || offset + size > region.data.length) {
      continue;
    }
    return region.data.slice(offset, offset + size);
  }

  return null;
}

/**
 * Slice a list of chunk specs out of `regions` by address coverage and return
 * the resulting raw chunks plus the specs that no region fully covered.
 */
export function buildChunksFromSpecs(
  regions: LoadedRegion[],
  specs: RawAutotrackerChunkSpec[],
): { chunks: RawAutotrackerChunk[]; uncovered: RawAutotrackerChunkSpec[] } {
  const chunks: RawAutotrackerChunk[] = [];
  const uncovered: RawAutotrackerChunkSpec[] = [];

  for (const spec of specs) {
    const data = sliceRegions(regions, spec.address, spec.length);
    if (!data) {
      uncovered.push(spec);
      continue;
    }

    chunks.push({
      name: spec.name,
      address: spec.address,
      length: spec.length,
      data: Buffer.from(data).toString('base64'),
    });
  }

  return { chunks, uncovered };
}

export function buildRawMessage(
  fixtureName: string,
  sequence = 1,
): { fixture: FixtureFile; message: RawAutotrackerMessage } {
  const fixture = loadRawFixture(fixtureName);
  const regions = decodeRegions(fixture.regions);

  const { chunks } = buildChunksFromSpecs(regions, RAW_CHUNK_SPECS);

  return {
    fixture,
    message: {
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence,
      game: fixture.summary.activeGame,
      saveIndex: fixture.summary.saveIndex,
      chunks,
    },
  };
}

export function parseFixture(
  parser: RawAutotrackerParser,
  fixtureName: string,
  sequence = 1,
): {
  fixture: FixtureFile;
  message: RawAutotrackerMessage;
  parsed: ParsedRawAutotrackerSnapshot;
} {
  const bundle = buildRawMessage(fixtureName, sequence);
  const parsed = parser.parse(bundle.message);
  if (!parsed) {
    throw new Error(`Failed to parse fixture ${fixtureName}`);
  }
  return {
    ...bundle,
    parsed,
  };
}

export function parsedItemMap(
  items: Array<{ id: string; qty: number }>,
): Map<string, number> {
  return new Map(items.map((item) => [item.id, item.qty]));
}

export function parsedCheckSet(
  checks: Array<{ name?: string; checked: boolean }>,
): Set<string> {
  return new Set(
    checks
      .filter((check) => check.checked)
      .map((check) => check.name ?? '')
      .filter((name) => name.length > 0),
  );
}
