import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  RAW_FIXTURE_ROOT,
  type FixtureFile,
  expectedCheckSet,
  positiveItemMap,
} from '../../tests/helpers/autotrackerFixtures';

type LoadedSummary = {
  label: string;
  items: Map<string, number>;
  checks: Set<string>;
};

function resolveFixturePath(input: string): string {
  if (path.isAbsolute(input) || input.includes('/')) {
    return input;
  }

  return path.join(RAW_FIXTURE_ROOT, input);
}

function loadSummary(input: string): LoadedSummary {
  const filePath = resolveFixturePath(input);
  const raw = readFileSync(filePath, 'utf8');
  const fixture = JSON.parse(raw) as FixtureFile;

  return {
    label: path.basename(filePath),
    items: positiveItemMap(fixture.summary.items),
    checks: expectedCheckSet(fixture.summary.checks),
  };
}

function diffItems(before: LoadedSummary, after: LoadedSummary): string[] {
  const itemIds = new Set([...before.items.keys(), ...after.items.keys()]);
  return [...itemIds]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((itemId) => {
      const beforeQty = before.items.get(itemId) ?? 0;
      const afterQty = after.items.get(itemId) ?? 0;
      if (beforeQty === afterQty) {
        return [];
      }
      return [`${itemId}: ${beforeQty} -> ${afterQty}`];
    });
}

function diffChecks(
  before: LoadedSummary,
  after: LoadedSummary,
): {
  removed: string[];
  added: string[];
} {
  const removed = [...before.checks]
    .filter((checkName) => !after.checks.has(checkName))
    .sort((left, right) => left.localeCompare(right));
  const added = [...after.checks]
    .filter((checkName) => !before.checks.has(checkName))
    .sort((left, right) => left.localeCompare(right));

  return { removed, added };
}

function main() {
  const [beforeInput, afterInput] = process.argv.slice(2);
  if (!beforeInput || !afterInput) {
    throw new Error(
      'Usage: node --import tsx scripts/autotracker/diff_fixture_summaries.ts <before-fixture> <after-fixture>',
    );
  }

  const before = loadSummary(beforeInput);
  const after = loadSummary(afterInput);
  const itemDiffs = diffItems(before, after);
  const checkDiffs = diffChecks(before, after);

  console.log(`Before: ${before.label}`);
  console.log(`After:  ${after.label}`);
  console.log(`Different Items: ${itemDiffs.length}`);
  for (const line of itemDiffs) {
    console.log(`  ${line}`);
  }
  console.log(`Checks only in Before: ${checkDiffs.removed.length}`);
  for (const checkName of checkDiffs.removed) {
    console.log(`  ${checkName}`);
  }
  console.log(`Checks only in After: ${checkDiffs.added.length}`);
  for (const checkName of checkDiffs.added) {
    console.log(`  ${checkName}`);
  }
}

main();
