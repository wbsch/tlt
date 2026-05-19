import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

interface GenerateOptions {
  includeLiveAddrs: boolean;
  updateFallbackBaselines: boolean;
}

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

function selectSeedFile(fileName: string): string {
  const ownedPath = path.join(DATA_DIR, fileName);
  if (existsSync(ownedPath)) {
    return ownedPath;
  }

  return path.join(LEGACY_DATA_DIR, fileName);
}

function parseArgs(argv: string[]): GenerateOptions {
  let includeLiveAddrs = false;
  let updateFallbackBaselines = false;

  for (const arg of argv) {
    if (arg === '--include-live-addrs') {
      includeLiveAddrs = true;
      continue;
    }
    if (arg === '--update-fallback-baselines') {
      updateFallbackBaselines = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (process.env.OOTMM_PATCHFILE) {
    includeLiveAddrs = true;
  }

  return { includeLiveAddrs, updateFallbackBaselines };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(DATA_DIR, { recursive: true });

  runPython('generate_inventory_slots.py', [
    '--ootmm-repo',
    OOTMM_REPO,
    '--output',
    path.join(DATA_DIR, 'inventory_slots.json'),
  ]);

  runPython('generate_locations.py', [
    '--ootmm-repo',
    OOTMM_REPO,
    '--output',
    path.join(DATA_DIR, 'locations.json'),
  ]);

  const specialLocationsArgs = [
    '--ootmm-repo',
    OOTMM_REPO,
    '--mm-output',
    path.join(DATA_DIR, 'special_locations_mm.json'),
    '--oot-output',
    path.join(DATA_DIR, 'special_locations_oot.json'),
    '--hints',
    selectSeedFile('special_locations_mm.json'),
    '--oot-hints',
    selectSeedFile('special_locations_oot.json'),
    '--fallback-baseline',
    options.updateFallbackBaselines
      ? path.join(DATA_DIR, 'special_locations_fallbacks_mm.lock.json')
      : selectSeedFile('special_locations_fallbacks_mm.lock.json'),
    '--oot-fallback-baseline',
    options.updateFallbackBaselines
      ? path.join(DATA_DIR, 'special_locations_fallbacks_oot.lock.json')
      : selectSeedFile('special_locations_fallbacks_oot.lock.json'),
  ];
  if (options.updateFallbackBaselines) {
    specialLocationsArgs.push('--update-fallback-baseline');
  }
  runPython('generate_special_locations.py', specialLocationsArgs);

  if (!options.updateFallbackBaselines) {
    copyFileSync(
      selectSeedFile('special_locations_fallbacks_mm.lock.json'),
      path.join(DATA_DIR, 'special_locations_fallbacks_mm.lock.json'),
    );
    copyFileSync(
      selectSeedFile('special_locations_fallbacks_oot.lock.json'),
      path.join(DATA_DIR, 'special_locations_fallbacks_oot.lock.json'),
    );
  }

  if (!options.includeLiveAddrs) {
    copyFileSync(
      selectSeedFile('live_addrs.json'),
      path.join(DATA_DIR, 'live_addrs.json'),
    );
    return;
  }

  const liveAddrsArgs = [
    '--ootmm-repo',
    OOTMM_REPO,
    '--output',
    path.join(DATA_DIR, 'live_addrs.json'),
  ];
  const patchfile = process.env.OOTMM_PATCHFILE?.trim();
  if (patchfile) {
    liveAddrsArgs.push('--patchfile', patchfile);
  }
  runPython('export_live_addrs.py', liveAddrsArgs);
}

main();
