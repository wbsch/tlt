#!/usr/bin/env node --import tsx
/**
 * Migrate the recorded `expected` of already-captured full dumps after the raw
 * parser gained or dropped a raw item id.
 *
 * A full dump stores `expected` = the raw `parse()` output at capture time
 * (see `packages/.../OoTMMTracker.vue` → `buildAutotrackerDumpExpected`), and
 * `npm run verify:test-dumps` compares the raw items re-derived from the dump's
 * own `regions` against it. A parser change that adds a *new* raw signal
 * therefore makes every historical dump fail even though the recorded memory is
 * unchanged. Where the original game state cannot be re-captured, this tool
 * appends the newly introduced ids to `expected.items` instead of dropping the
 * dump.
 *
 * Safety rails:
 *  - only ids explicitly passed via `--add` may be added,
 *  - nothing may be removed and no quantity may change (any other difference
 *    aborts the file),
 *  - dry run unless `--write` is passed.
 *
 * A parser *fix* can also leave an already-captured dump with a stale
 * quantity (e.g. the BRONZE_SCALE flag index fix changes OOT_SCALE/MM_SCALE
 * from 1 to 2). `--fix-qty <ID>` allows exactly that: it corrects the
 * quantity of the listed ids to the parser output while still refusing any
 * other difference. Both modes can be combined.
 *
 * Usage:
 *   node --import tsx scripts/autotracker/migrate_dump_expected.ts \
 *     --add MM_SHIELD_IS_DEKU --write
 *
 *   node --import tsx scripts/autotracker/migrate_dump_expected.ts \
 *     --fix-qty OOT_SCALE --fix-qty MM_SCALE --write
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_DUMPS_DIR = path.join(REPO_ROOT, 'public/test-dumps');
const COMMITTED_FIXTURES = [
  path.join(REPO_ROOT, 'tests/fixtures/autotracker/test-dumps'),
];

type Item = { id: string; qty: number };

type Options = {
  add: Set<string>;
  fixQty: Set<string>;
  write: boolean;
  dirs: string[];
  help: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    add: new Set(),
    fixQty: new Set(),
    write: false,
    dirs: [DEFAULT_DUMPS_DIR, ...COMMITTED_FIXTURES],
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--add') {
      const value = argv[++index];
      if (!value) {
        throw new Error('--add requires a raw item id');
      }
      options.add.add(value);
    } else if (arg === '--fix-qty') {
      const value = argv[++index];
      if (!value) {
        throw new Error('--fix-qty requires a raw item id');
      }
      options.fixQty.add(value);
    } else if (arg === '--dir') {
      const value = argv[++index];
      if (!value) {
        throw new Error('--dir requires a path');
      }
      options.dirs.push(path.resolve(value));
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function collectDumpFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith('.json')) {
        files.push(path.join(dir, name));
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: node --import tsx scripts/autotracker/migrate_dump_expected.ts ' +
        '[--add <RAW_ITEM_ID> ...] [--fix-qty <RAW_ITEM_ID> ...] ' +
        '[--dir <dumps dir>] [--write]',
    );
    return;
  }
  if (options.add.size === 0 && options.fixQty.size === 0) {
    throw new Error(
      'Refusing to run without --add <RAW_ITEM_ID> or --fix-qty <RAW_ITEM_ID>',
    );
  }

  const files = collectDumpFiles(options.dirs);
  if (files.length === 0) {
    console.warn('No dump files found; nothing to do.');
    return;
  }

  const server = await createServer({
    root: REPO_ROOT,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const parserMod = await server.ssrLoadModule(
      '/packs/ootmm/src/autotracker/rawFrameParser.ts',
    );
    const fixtures = await server.ssrLoadModule(
      '/tests/helpers/autotrackerFixtures.ts',
    );
    const versions = await server.ssrLoadModule(
      '/packs/ootmm/src/autotracker/data/versions.ts',
    );

    let failed = false;

    for (const file of files) {
      const relative = path.relative(REPO_ROOT, file);
      const dump = JSON.parse(readFileSync(file, 'utf8'));
      if (
        dump?.dumpKind !== 'full' ||
        !dump.expected ||
        !Array.isArray(dump.regions)
      ) {
        console.log(`SKIP ${relative}: not a full dump`);
        continue;
      }

      const { dirName } = versions.resolveAutotrackerDataVersion(
        dump.ootmmVersion,
      );
      const parser = parserMod.createRawAutotrackerParserSync(dirName);
      const gameKey = String(dump.expected.activeGame).toLowerCase();
      const specs = parserMod.RAW_CHUNK_SPECS_BY_GAME[gameKey];
      const regions = fixtures.decodeRegions(dump.regions);
      const { chunks } = fixtures.buildChunksFromSpecs(regions, specs);
      const parsed = parser.parse({
        type: 'raw',
        schemaVersion: '1',
        diff: false,
        refresh: true,
        sequence: 1,
        game: dump.expected.activeGame,
        saveIndex: dump.expected.saveIndex >>> 0,
        chunks,
      });
      if (!parsed) {
        console.error(`FAIL ${relative}: parser returned no snapshot`);
        failed = true;
        continue;
      }

      const expected: Item[] = dump.expected.items;
      const expectedMap = new Map(expected.map((item) => [item.id, item.qty]));
      const derivedMap = new Map<string, number>(
        parsed.items
          .filter((item: Item) => item.qty > 0)
          .map((item: Item) => [item.id, item.qty]),
      );

      const extra = [...derivedMap].filter(([id]) => !expectedMap.has(id));
      const missing = [...expectedMap].filter(([id]) => !derivedMap.has(id));
      const mismatch = [...expectedMap].filter(
        ([id, qty]) => derivedMap.has(id) && derivedMap.get(id) !== qty,
      );
      const disallowed = extra.filter(([id]) => !options.add.has(id));
      // `--fix-qty <ID>` realigns that id to the parser output, including
      // dropping it when the (fixed) parser no longer emits it at all. Every
      // other difference is still refused below.
      const realign = [...expectedMap.keys()].filter(
        (id) =>
          options.fixQty.has(id) && derivedMap.get(id) !== expectedMap.get(id),
      );
      const disallowedMissing = missing.filter(
        ([id]) => !options.fixQty.has(id),
      );
      const disallowedQty = mismatch.filter(([id]) => !options.fixQty.has(id));

      if (
        disallowedMissing.length > 0 ||
        disallowed.length > 0 ||
        disallowedQty.length > 0
      ) {
        console.error(
          `FAIL ${relative}: refusing to migrate — ` +
            `missing=${JSON.stringify(disallowedMissing)} ` +
            `qty-mismatch=${JSON.stringify(disallowedQty)} ` +
            `not-allowed=${JSON.stringify(disallowed)}`,
        );
        failed = true;
        continue;
      }

      if (extra.length === 0 && realign.length === 0) {
        console.log(`OK   ${relative}: already up to date`);
        continue;
      }

      const merged: Item[] = [
        ...expected
          .filter((item) => !options.fixQty.has(item.id))
          .map((item) => ({ ...item })),
        ...extra.map(([id, qty]) => ({ id, qty })),
        // Re-read the allowed quantity fixes from the parser output.
        ...realign
          .filter((id) => derivedMap.has(id))
          .map((id) => ({ id, qty: derivedMap.get(id) as number })),
      ].sort((left, right) => left.id.localeCompare(right.id));
      dump.expected.items = merged;

      const realignSummary = realign.map((id) => ({
        id,
        from: expectedMap.get(id),
        to: derivedMap.get(id),
      }));

      if (options.write) {
        writeFileSync(file, `${JSON.stringify(dump, null, 2)}\n`);
        console.log(
          `OK   ${relative}: added ${JSON.stringify(extra)} ` +
            `realigned ${JSON.stringify(realignSummary)} (${merged.length} items)`,
        );
      } else {
        console.log(
          `DRY  ${relative}: would add ${JSON.stringify(extra)} ` +
            `realign ${JSON.stringify(realignSummary)} (${merged.length} items)`,
        );
      }
    }

    if (failed) {
      process.exitCode = 1;
    } else if (!options.write) {
      console.log('\nDry run only — re-run with --write to update the dumps.');
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error('migrate_dump_expected failed:', error);
  process.exitCode = 1;
});
