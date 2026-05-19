import { createRawAutotrackerParser } from '../../packs/ootmm/src/autotracker/rawFrameParser';
import {
  diffCheckSets,
  diffItemMaps,
  listRawFixtureNames,
  normalizedExpectedFixtureChecks,
  normalizedExpectedFixtureItems,
  normalizedParsedFixtureChecks,
  normalizedParsedFixtureItems,
  parseFixture,
} from '../../tests/helpers/autotrackerFixtures';

function main() {
  const requestedFixtures = process.argv.slice(2);
  const fixtureNames =
    requestedFixtures.length > 0 ? requestedFixtures : listRawFixtureNames();

  const failures: string[] = [];

  for (const fixtureName of fixtureNames) {
    const parser = createRawAutotrackerParser();
    const { fixture, parsed } = parseFixture(parser, fixtureName);
    const itemDiffs = diffItemMaps(
      normalizedExpectedFixtureItems(fixture),
      normalizedParsedFixtureItems(parsed),
    );
    const checkDiffs = diffCheckSets(
      normalizedExpectedFixtureChecks(fixtureName, fixture),
      normalizedParsedFixtureChecks(parsed),
    );

    if (itemDiffs.length === 0 && checkDiffs.length === 0) {
      continue;
    }

    failures.push(fixtureName);
    console.error(`Fixture parity mismatch: ${fixtureName}`);
    for (const line of itemDiffs) {
      console.error(`  item ${line}`);
    }
    for (const line of checkDiffs) {
      console.error(`  check ${line}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Autotracker fixture parity failed for ${failures.length} fixture(s).`,
    );
  }

  console.log(
    `Autotracker fixture parity passed for ${fixtureNames.length} fixture(s).`,
  );
}

main();
