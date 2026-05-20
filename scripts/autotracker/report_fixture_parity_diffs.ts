import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createRawAutotrackerParser } from '../../packs/ootmm/src/autotracker/rawFrameParser';
import {
  listRawFixtureNames,
  normalizedExpectedFixtureChecks,
  normalizedExpectedFixtureItems,
  normalizedParsedFixtureChecks,
  normalizedParsedFixtureItems,
  parseFixture,
} from '../../tests/helpers/autotrackerFixtures';

type ItemDiffKind = 'missing-item' | 'unexpected-item' | 'quantity-mismatch';
type CheckDiffKind = 'missing-check' | 'unexpected-check';

type ItemDiff = {
  id: string;
  expectedQty: number;
  actualQty: number;
  kind: ItemDiffKind;
};

type CheckDiff = {
  name: string;
  kind: CheckDiffKind;
};

type FixtureMismatch = {
  fixture: string;
  parseError?: string;
  itemDiffs: ItemDiff[];
  checkDiffs: CheckDiff[];
};

type ParityReport = {
  generatedAt: string;
  fixturesCompared: number;
  mismatchedFixtures: number;
  summary: {
    parseFailures: number;
    missingItems: number;
    unexpectedItems: number;
    quantityMismatches: number;
    missingChecks: number;
    unexpectedChecks: number;
  };
  mismatches: FixtureMismatch[];
};

function buildItemDiffs(
  expected: Map<string, number>,
  actual: Map<string, number>,
): ItemDiff[] {
  const itemIds = new Set([...expected.keys(), ...actual.keys()]);
  const diffs: ItemDiff[] = [];

  for (const id of [...itemIds].sort((a, b) => a.localeCompare(b))) {
    const expectedQty = expected.get(id) ?? 0;
    const actualQty = actual.get(id) ?? 0;
    if (expectedQty === actualQty) {
      continue;
    }

    let kind: ItemDiffKind = 'quantity-mismatch';
    if (expectedQty > 0 && actualQty === 0) {
      kind = 'missing-item';
    } else if (expectedQty === 0 && actualQty > 0) {
      kind = 'unexpected-item';
    }

    diffs.push({ id, expectedQty, actualQty, kind });
  }

  return diffs;
}

function buildCheckDiffs(
  expected: Set<string>,
  actual: Set<string>,
): CheckDiff[] {
  const diffs: CheckDiff[] = [];

  for (const name of [...expected].sort((a, b) => a.localeCompare(b))) {
    if (!actual.has(name)) {
      diffs.push({ name, kind: 'missing-check' });
    }
  }

  for (const name of [...actual].sort((a, b) => a.localeCompare(b))) {
    if (!expected.has(name)) {
      diffs.push({ name, kind: 'unexpected-check' });
    }
  }

  return diffs;
}

function buildReport(fixtureNames: string[]): ParityReport {
  const mismatches: FixtureMismatch[] = [];
  const summary = {
    parseFailures: 0,
    missingItems: 0,
    unexpectedItems: 0,
    quantityMismatches: 0,
    missingChecks: 0,
    unexpectedChecks: 0,
  };

  for (const fixture of fixtureNames) {
    const parser = createRawAutotrackerParser();

    try {
      const { fixture: fixtureData, parsed } = parseFixture(parser, fixture);
      const itemDiffs = buildItemDiffs(
        normalizedExpectedFixtureItems(fixtureData),
        normalizedParsedFixtureItems(parsed),
      );
      const checkDiffs = buildCheckDiffs(
        normalizedExpectedFixtureChecks(fixture, fixtureData),
        normalizedParsedFixtureChecks(parsed),
      );

      if (itemDiffs.length === 0 && checkDiffs.length === 0) {
        continue;
      }

      for (const diff of itemDiffs) {
        if (diff.kind === 'missing-item') {
          summary.missingItems++;
        } else if (diff.kind === 'unexpected-item') {
          summary.unexpectedItems++;
        } else {
          summary.quantityMismatches++;
        }
      }

      for (const diff of checkDiffs) {
        if (diff.kind === 'missing-check') {
          summary.missingChecks++;
        } else {
          summary.unexpectedChecks++;
        }
      }

      mismatches.push({
        fixture,
        itemDiffs,
        checkDiffs,
      });
    } catch (error) {
      summary.parseFailures++;
      mismatches.push({
        fixture,
        parseError: error instanceof Error ? error.message : String(error),
        itemDiffs: [],
        checkDiffs: [],
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    fixturesCompared: fixtureNames.length,
    mismatchedFixtures: mismatches.length,
    summary,
    mismatches,
  };
}

function parseArgs(argv: string[]): { outPath?: string; fixtures: string[] } {
  const args = [...argv];
  let outPath: string | undefined;
  const fixtures: string[] = [];

  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }

    if (token === '--out') {
      const next = args.shift();
      if (!next) {
        throw new Error('Missing value for --out');
      }
      outPath = path.resolve(process.cwd(), next);
      continue;
    }

    fixtures.push(token);
  }

  return { outPath, fixtures };
}

function main() {
  const { outPath, fixtures } = parseArgs(process.argv.slice(2));
  const fixtureNames = fixtures.length > 0 ? fixtures : listRawFixtureNames();
  const report = buildReport(fixtureNames);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (outPath) {
    writeFileSync(outPath, serialized, 'utf8');
    console.log(`Wrote parity report to ${outPath}`);
  } else {
    process.stdout.write(serialized);
  }

  if (report.mismatchedFixtures > 0) {
    process.exitCode = 1;
  }
}

main();
