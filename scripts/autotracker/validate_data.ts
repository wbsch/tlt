import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const OOTMM_REPO = path.join(REPO_ROOT, 'OoTMM');
const DATA_DIR = path.join(REPO_ROOT, 'packs/ootmm/src/autotracker/data');
const LEGACY_DATA_DIR = path.join(
  REPO_ROOT,
  'tlt_autotracker/ootmm-autotracker/ootmm',
);
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

const EXACT_FILES = [
  'inventory_slots.json',
  'locations.json',
  'special_locations_mm.json',
  'special_locations_oot.json',
  'special_locations_fallbacks_mm.lock.json',
  'special_locations_fallbacks_oot.lock.json',
] as const;

function runPython(scriptName: string, args: string[]): void {
  const scriptPath = path.join(SCRIPT_DIR, scriptName);
  const result = spawnSync('python3', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `${scriptName} exited with status ${result.status ?? 'unknown'}`,
    );
  }
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function selectSeedFile(fileName: string): string {
  const ownedPath = path.join(DATA_DIR, fileName);
  if (existsSync(ownedPath)) {
    return ownedPath;
  }

  return path.join(LEGACY_DATA_DIR, fileName);
}

function assertExactMatch(
  fileName: (typeof EXACT_FILES)[number],
  tempDir: string,
): void {
  const actualPath = path.join(DATA_DIR, fileName);
  const expectedPath = path.join(tempDir, fileName);
  const actual = readUtf8(actualPath);
  const expected = readUtf8(expectedPath);
  if (actual !== expected) {
    throw new Error(
      `${fileName} is out of date. Run \"npm run generate:autotracker-data\" and commit the result.`,
    );
  }
}

function validateDataManifest(): void {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error('autotracker data manifest is missing.');
  }

  const manifest = JSON.parse(readUtf8(MANIFEST_PATH)) as {
    schemaVersion?: unknown;
    files?: Record<string, unknown>;
  };
  if (manifest.schemaVersion !== 1) {
    throw new Error(
      'autotracker data manifest has an unsupported schemaVersion.',
    );
  }
  if (!manifest.files || typeof manifest.files !== 'object') {
    throw new Error('autotracker data manifest is missing the files table.');
  }

  for (const fileName of [...EXACT_FILES, 'live_addrs.json']) {
    if (manifest.files[fileName] !== 1) {
      throw new Error(
        `autotracker data manifest is missing version 1 for ${fileName}.`,
      );
    }
  }
}

function validateLiveAddrsSchema(): void {
  const liveAddrsPath = path.join(DATA_DIR, 'live_addrs.json');
  if (!existsSync(liveAddrsPath)) {
    throw new Error(
      'live_addrs.json is missing. Generate it with OOTMM_PATCHFILE=<path> npm run generate:autotracker-data -- --include-live-addrs.',
    );
  }

  const raw = JSON.parse(readUtf8(liveAddrsPath)) as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    throw new Error('live_addrs.json has an unsupported schemaVersion.');
  }

  for (const game of ['oot', 'mm'] as const) {
    const entry = raw[game];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`live_addrs.json is missing the ${game} object.`);
    }

    for (const key of ['comboCtx', 'saveCtx', 'payload']) {
      if (typeof (entry as Record<string, unknown>)[key] !== 'string') {
        throw new Error(`live_addrs.json is missing ${game}.${key}.`);
      }
    }
  }
}

function maybeValidateLiveAddrsExact(tempDir: string): void {
  const patchfile = process.env.OOTMM_PATCHFILE?.trim();
  if (!patchfile) {
    return;
  }

  runPython('export_live_addrs.py', [
    '--ootmm-repo',
    OOTMM_REPO,
    '--patchfile',
    patchfile,
    '--output',
    path.join(tempDir, 'live_addrs.json'),
  ]);

  const actual = readUtf8(path.join(DATA_DIR, 'live_addrs.json'));
  const expected = readUtf8(path.join(tempDir, 'live_addrs.json'));
  if (actual !== expected) {
    throw new Error(
      'live_addrs.json is out of date for the configured OOTMM_PATCHFILE. Run npm run generate:autotracker-data -- --include-live-addrs.',
    );
  }
}

function main(): void {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'tlt-autotracker-data-'));

  try {
    runPython('generate_inventory_slots.py', [
      '--ootmm-repo',
      OOTMM_REPO,
      '--output',
      path.join(tempDir, 'inventory_slots.json'),
    ]);

    runPython('generate_locations.py', [
      '--ootmm-repo',
      OOTMM_REPO,
      '--output',
      path.join(tempDir, 'locations.json'),
    ]);

    runPython('generate_special_locations.py', [
      '--ootmm-repo',
      OOTMM_REPO,
      '--mm-output',
      path.join(tempDir, 'special_locations_mm.json'),
      '--oot-output',
      path.join(tempDir, 'special_locations_oot.json'),
      '--hints',
      selectSeedFile('special_locations_mm.json'),
      '--oot-hints',
      selectSeedFile('special_locations_oot.json'),
      '--fallback-baseline',
      path.join(tempDir, 'special_locations_fallbacks_mm.lock.json'),
      '--oot-fallback-baseline',
      path.join(tempDir, 'special_locations_fallbacks_oot.lock.json'),
      '--update-fallback-baseline',
    ]);

    for (const fileName of EXACT_FILES) {
      assertExactMatch(fileName, tempDir);
    }

    validateDataManifest();
    validateLiveAddrsSchema();
    maybeValidateLiveAddrsExact(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
