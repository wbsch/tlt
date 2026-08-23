import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  RAW_CHUNK_SPECS_BY_GAME,
  createRawAutotrackerParserSync,
  type RawAutotrackerChunkSpec,
  type RawAutotrackerMessage,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';
import {
  hasAutotrackerDataForVersion,
  resolveAutotrackerDataVersion,
} from '../../packs/ootmm/src/autotracker/data/versions';
import {
  buildChunksFromSpecs,
  decodeRegions,
  type FixtureRegion,
} from './autotrackerFixtures';

/**
 * The minimal dump shape the verifier reads. A full `AutotrackerDumpFile`
 * (see `packs/ootmm/src/components/OoTMMTracker.vue`) is a superset of this;
 * only `regions`, `expected` and `ootmmVersion` are consulted.
 */
export type TestDumpFile = {
  ootmmVersion: string | null;
  expected: {
    activeGame: string;
    saveIndex: number;
    items: { id: string; qty: number }[];
    locations: string[];
  };
  regions: FixtureRegion[];
};

export type TestDumpVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Result of scanning a dump directory. `missingOrEmpty` is true when the
 * directory does not exist or contains no `*.json` dumps (the runner treats
 * that as a non-fatal warning).
 */
export type TestDumpDirectoryResult = {
  missingOrEmpty: boolean;
  dumpsDir: string;
  files: { name: string; result: TestDumpVerificationResult }[];
};

function normalizeGameKey(game: string): 'oot' | 'mm' | null {
  const normalized = game.trim().toLowerCase();
  if (normalized === 'oot') {
    return 'oot';
  }
  if (normalized === 'mm') {
    return 'mm';
  }
  return null;
}

function normalizeItems(
  items: readonly { id: string; qty: number }[],
): { id: string; qty: number }[] {
  return items
    .filter(({ qty }) => qty > 0)
    .map(({ id, qty }) => ({ id, qty }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeLocations(locations: readonly string[]): string[] {
  return locations
    .filter((key) => key.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function diffItems(
  expected: { id: string; qty: number }[],
  derived: { id: string; qty: number }[],
): string | null {
  const expectedMap = new Map(expected.map((item) => [item.id, item.qty]));
  const derivedMap = new Map(derived.map((item) => [item.id, item.qty]));

  const missing: string[] = [];
  const extra: string[] = [];
  const quantityMismatch: string[] = [];

  for (const [id, qty] of expectedMap) {
    const actual = derivedMap.get(id);
    if (actual === undefined) {
      missing.push(`${id} (expected ${qty})`);
    } else if (actual !== qty) {
      quantityMismatch.push(`${id} (expected ${qty}, got ${actual})`);
    }
  }
  for (const [id, qty] of derivedMap) {
    if (!expectedMap.has(id)) {
      extra.push(`${id} (got ${qty})`);
    }
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing items: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    parts.push(`unexpected items: ${extra.join(', ')}`);
  }
  if (quantityMismatch.length > 0) {
    parts.push(`quantity mismatches: ${quantityMismatch.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

function diffLocations(expected: string[], derived: string[]): string | null {
  const expectedSet = new Set(expected);
  const derivedSet = new Set(derived);

  const missing: string[] = [];
  const extra: string[] = [];

  for (const key of expectedSet) {
    if (!derivedSet.has(key)) {
      missing.push(key);
    }
  }
  for (const key of derivedSet) {
    if (!expectedSet.has(key)) {
      extra.push(key);
    }
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing locations: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    parts.push(`unexpected locations: ${extra.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * Verify a full autotracker dump against its recorded `expected` ground truth.
 *
 * The verifier re-derives the game state **only** from `dump.regions` (the
 * dump's self-describing memory layout). It never reads the dump's
 * `requestedMemoryAreas` (which exist purely as a diagnostic aid). The sole
 * failure criterion is an items/locations mismatch; a spec whose address range
 * is not covered by any region only fails indirectly, if the missing data
 * actually changes the decoded output.
 */
export function verifyTestDump(dump: TestDumpFile): TestDumpVerificationResult {
  if (!dump?.expected || !Array.isArray(dump.regions)) {
    return { ok: false, reason: 'dump is missing expected or regions' };
  }

  // Step 1: resolve the version dir. Unsupported/absent → fail with a clear
  // reason (a null version normalizes to the default dir, so check it first).
  const rawVersion = dump.ootmmVersion?.trim() ?? '';
  if (!rawVersion) {
    return { ok: false, reason: 'dump is missing ootmmVersion' };
  }
  if (!hasAutotrackerDataForVersion(rawVersion)) {
    return {
      ok: false,
      reason: `unsupported ootmmVersion "${rawVersion}"`,
    };
  }
  const { dirName } = resolveAutotrackerDataVersion(rawVersion);

  // Step 2: create the parser FIRST. `createRawAutotrackerParserSync` calls
  // `applyVersionData` → `rebuildChunkSpecs`, which sets the module-global
  // `RAW_CHUNK_SPECS_BY_GAME` to the dump's version. Reading the specs before
  // this would yield the wrong (previously applied) version's specs.
  const parser = createRawAutotrackerParserSync(dirName);

  // Step 3: read the version-specific specs AFTER step 2 and filter to the
  // dump's active game. These are the authoritative slice list, sourced from
  // the version's data files — never from `dump.requestedMemoryAreas`.
  const gameKey = normalizeGameKey(dump.expected.activeGame);
  if (!gameKey) {
    return {
      ok: false,
      reason: `unexpected activeGame "${dump.expected.activeGame}"`,
    };
  }
  const specs: RawAutotrackerChunkSpec[] = RAW_CHUNK_SPECS_BY_GAME[gameKey];

  // Step 4: build a flat address index from the dump's self-describing regions
  // and slice each spec out by address coverage (never by fixed chunk name).
  const regions = decodeRegions(dump.regions);
  const { chunks, uncovered } = buildChunksFromSpecs(regions, specs);
  const diagnostics = uncovered.map(
    (spec) =>
      `dump does not cover ${spec.name} at 0x${spec.address.toString(16)} ` +
      `(${spec.length} bytes)`,
  );

  // Step 5: assemble a synthetic raw message and parse it.
  const message: RawAutotrackerMessage = {
    type: 'raw',
    schemaVersion: '1',
    diff: false,
    refresh: true,
    sequence: 1,
    game: dump.expected.activeGame,
    saveIndex: dump.expected.saveIndex >>> 0,
    chunks,
  };

  const parsed = parser.parse(message);
  if (!parsed) {
    return {
      ok: false,
      reason: [
        'parser returned no snapshot for the assembled frame',
        ...diagnostics,
      ].join(' — '),
    };
  }

  // Step 6: normalize both sides and compare. This is the sole failure
  // criterion for a dump whose data is present but wrong.
  const derivedItems = normalizeItems(parsed.items);
  const derivedLocations = normalizeLocations(
    parsed.checks
      .filter((check) => check.checked)
      .map((check) => check.name ?? check.id ?? ''),
  );

  const expectedItems = normalizeItems(dump.expected.items);
  const expectedLocations = normalizeLocations(dump.expected.locations);

  const itemDiff = diffItems(expectedItems, derivedItems);
  const locationDiff = diffLocations(expectedLocations, derivedLocations);

  if (itemDiff || locationDiff) {
    const parts = [itemDiff, locationDiff].filter((part): part is string =>
      Boolean(part),
    );
    if (diagnostics.length > 0) {
      parts.push(diagnostics.join('; '));
    }
    return { ok: false, reason: parts.join(' — ') };
  }

  return { ok: true };
}

/**
 * Scan a dump directory and verify every `*.json` dump it contains. A missing
 * or empty directory is reported (not thrown) via `missingOrEmpty: true`.
 */
export function verifyTestDumpsInDirectory(
  dumpsDir: string,
): TestDumpDirectoryResult {
  if (!existsSync(dumpsDir)) {
    return { missingOrEmpty: true, dumpsDir, files: [] };
  }

  const names = readdirSync(dumpsDir)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  if (names.length === 0) {
    return { missingOrEmpty: true, dumpsDir, files: [] };
  }

  const files = names.map((name) => {
    let result: TestDumpVerificationResult;
    try {
      const dump = JSON.parse(
        readFileSync(path.join(dumpsDir, name), 'utf8'),
      ) as TestDumpFile;
      result = verifyTestDump(dump);
    } catch (error) {
      result = {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    return { name, result };
  });

  return { missingOrEmpty: false, dumpsDir, files };
}
