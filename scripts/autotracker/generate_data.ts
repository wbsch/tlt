import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { formatGeneratedFiles } from './format_generated_files.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const OOTMM_REPO = path.join(REPO_ROOT, 'OoTMM');
const AUTOTRACKER_DATA_BASE = path.join(
  REPO_ROOT,
  'packs/ootmm/src/autotracker/data',
);
const LEGACY_DATA_DIR = path.join(
  REPO_ROOT,
  'tlt_autotracker/ootmm-autotracker/ootmm',
);

/**
 * Detect the OoTMM version tag from the git tag (e.g. "v31.1").
 *
 * Throws if no git tag can be resolved.
 */
function detectOotmmVersionTag(): string {
  const gitResult = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: OOTMM_REPO,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (gitResult.status !== 0) {
    throw new Error(
      `Failed to detect OoTMM version via git tag in ${OOTMM_REPO}. ` +
        `Ensure the OoTMM repository is at a tagged commit.`,
    );
  }

  const tag = gitResult.stdout?.trim();
  if (!tag) {
    throw new Error(
      `No git tag found in OoTMM repository at ${OOTMM_REPO}. ` +
        `Check out a tagged commit (e.g. v31.1) before generating data.`,
    );
  }

  return tag;
}

/** Detect the OoTMM version and return the data directory name (e.g. "v31_1"). */
function detectOotmmVersionDir(): string {
  return tagToDirName(detectOotmmVersionTag());
}

/** Convert a version tag like "v31.1" or "31.1" to a dir name like "v31_1". */
function tagToDirName(tag: string): string {
  const cleaned = tag.trim().replace(/^v/i, '');
  return `v${cleaned.replace(/\./g, '_')}`;
}

const DATA_DIR = path.join(AUTOTRACKER_DATA_BASE, detectOotmmVersionDir());

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
  const versionedPath = path.join(DATA_DIR, fileName);
  if (existsSync(versionedPath)) {
    return versionedPath;
  }

  const parentPath = path.join(AUTOTRACKER_DATA_BASE, fileName);
  if (existsSync(parentPath)) {
    return parentPath;
  }

  return path.join(LEGACY_DATA_DIR, fileName);
}

function selectFallbackSeedFile(fileName: string): string {
  const parentPath = path.join(AUTOTRACKER_DATA_BASE, fileName);
  if (existsSync(parentPath)) {
    return parentPath;
  }

  return path.join(LEGACY_DATA_DIR, fileName);
}

/**
 * Final step of the data generation: recover `foreignSaveLive` /
 * `sharedCustomSaveLive` for the current OoTMM version from the published
 * ootmm.com web build (see `derive_web_symbols.py` and
 * `DERIVING_SAVE_SYMBOLS.md`). These addresses live in .bss and are not
 * present in the patchfile or in the OoTMM sources.
 *
 * The derivation CHECK is run first; only when it passes are the values
 * written back into the version's `live_addrs.json` (`--write`). A failing
 * check (version not published yet, offline, or inconsistent payload scan)
 * only warns and skips — the generation still succeeds, since the rest of
 * the data is complete and schema-valid without these four addresses.
 */
function maybeDeriveWebSaveSymbols(): void {
  const versionTag = detectOotmmVersionTag();
  const liveAddrsPath = path.join(DATA_DIR, 'live_addrs.json');
  const script = path.join(SCRIPT_DIR, 'derive_web_symbols.py');

  // 1. Check only (no --write). A non-zero exit means the check failed or the
  //    version is not available on the site → skip the write-back.
  const check = spawnSync('python3', [script, versionTag], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (check.status !== 0) {
    console.warn(
      `[generate_data] derive_web_symbols.py check failed for ${versionTag} ` +
        `(exit ${check.status ?? 'unknown'}); skipping web-symbol write-back ` +
        'into live_addrs.json.',
    );
    return;
  }

  // 2. Check passed → write the values into the version's live_addrs.json.
  const write = spawnSync(
    'python3',
    [script, versionTag, '--write', liveAddrsPath],
    {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (write.status !== 0) {
    throw new Error(
      `derive_web_symbols.py --write failed with status ${write.status ?? 'unknown'}`,
    );
  }
  console.log(
    `[generate_data] derived web payload save symbols for ${versionTag} ` +
      `and wrote them into ${liveAddrsPath}`,
  );
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
  mkdirSync(AUTOTRACKER_DATA_BASE, { recursive: true });
  const generatedFiles = [
    path.join(DATA_DIR, 'inventory_slots.json'),
    path.join(DATA_DIR, 'locations.json'),
    path.join(DATA_DIR, 'special_locations_mm.json'),
    path.join(DATA_DIR, 'special_locations_oot.json'),
    path.join(
      AUTOTRACKER_DATA_BASE,
      'special_locations_fallbacks_mm.lock.json',
    ),
    path.join(
      AUTOTRACKER_DATA_BASE,
      'special_locations_fallbacks_oot.lock.json',
    ),
    path.join(DATA_DIR, 'live_addrs.json'),
    path.join(DATA_DIR, 'combo_config_layout.json'),
    path.join(DATA_DIR, 'manifest.json'),
  ];

  runPython('generate_inventory_slots.py', [
    '--ootmm-repo',
    OOTMM_REPO,
    '--output',
    path.join(DATA_DIR, 'inventory_slots.json'),
    '--shared-save-offsets-output',
    path.join(DATA_DIR, 'shared_save_offsets.json'),
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
      ? path.join(
          AUTOTRACKER_DATA_BASE,
          'special_locations_fallbacks_mm.lock.json',
        )
      : selectFallbackSeedFile('special_locations_fallbacks_mm.lock.json'),
    '--oot-fallback-baseline',
    options.updateFallbackBaselines
      ? path.join(
          AUTOTRACKER_DATA_BASE,
          'special_locations_fallbacks_oot.lock.json',
        )
      : selectFallbackSeedFile('special_locations_fallbacks_oot.lock.json'),
  ];
  if (options.updateFallbackBaselines) {
    specialLocationsArgs.push('--update-fallback-baseline');
  }
  // Seed special_locations files from the base data directory into the
  // version directory when they don't exist there yet.
  for (const fileName of [
    'special_locations_mm.json',
    'special_locations_oot.json',
  ]) {
    const versionedPath = path.join(DATA_DIR, fileName);
    if (!existsSync(versionedPath)) {
      const basePath = path.join(AUTOTRACKER_DATA_BASE, fileName);
      if (existsSync(basePath)) {
        copyFileSync(basePath, versionedPath);
      }
    }
  }

  runPython('generate_special_locations.py', specialLocationsArgs);

  // Regenerate the ComboConfig tail layout from the OoTMM repo header at the
  // current tag (fails loudly if the struct's fixed offsets changed).
  runPython('derive_combo_config_layout.py', [
    '--ootmm-repo',
    OOTMM_REPO,
    '--version',
    detectOotmmVersionTag(),
    '--write',
    path.join(DATA_DIR, 'combo_config_layout.json'),
  ]);

  // Write the data manifest.
  const manifest = {
    schemaVersion: 1,
    files: {
      'inventory_slots.json': 1,
      'locations.json': 1,
      'special_locations_mm.json': 1,
      'special_locations_oot.json': 1,
      'special_locations_fallbacks_mm.lock.json': 1,
      'special_locations_fallbacks_oot.lock.json': 1,
      'live_addrs.json': 1,
      'combo_config_layout.json': 1,
    },
  };
  writeFileSync(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  if (!options.updateFallbackBaselines) {
    copyFileSync(
      selectFallbackSeedFile('special_locations_fallbacks_mm.lock.json'),
      path.join(
        AUTOTRACKER_DATA_BASE,
        'special_locations_fallbacks_mm.lock.json',
      ),
    );
    copyFileSync(
      selectFallbackSeedFile('special_locations_fallbacks_oot.lock.json'),
      path.join(
        AUTOTRACKER_DATA_BASE,
        'special_locations_fallbacks_oot.lock.json',
      ),
    );
  }

  if (!options.includeLiveAddrs) {
    // Without a patchfile, seed live_addrs.json from an existing file (the
    // current version dir, then the shared base data dir). If no seed exists,
    // derive the addresses that are readable straight from the OoTMM sources
    // so the run still completes — the patchfile-only fields will be missing
    // and listed under "notDerivableWithoutLinking".
    const liveAddrsSeed = selectSeedFile('live_addrs.json');
    if (existsSync(liveAddrsSeed)) {
      copyFileSync(liveAddrsSeed, path.join(DATA_DIR, 'live_addrs.json'));
    } else {
      console.warn(
        '[generate_data] No OOTMM_PATCHFILE set and no existing live_addrs.json ' +
          'seed found; deriving live addresses from OoTMM sources only. ' +
          'comboConfigLive / runtimeMaxKeysLive / runtimeSilverRupeeDataLive and ' +
          'the foreign/shared save addresses will be missing ' +
          '(see "notDerivableWithoutLinking").',
      );
      runPython('export_live_addrs.py', [
        '--ootmm-repo',
        OOTMM_REPO,
        '--output',
        path.join(DATA_DIR, 'live_addrs.json'),
      ]);
    }
  } else {
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

  formatGeneratedFiles(REPO_ROOT, generatedFiles);

  // Publish the generated special_locations files back to the base
  // data directory so it stays up-to-date.
  for (const fileName of [
    'special_locations_mm.json',
    'special_locations_oot.json',
  ]) {
    copyFileSync(
      path.join(DATA_DIR, fileName),
      path.join(AUTOTRACKER_DATA_BASE, fileName),
    );
  }

  // Final step: recover the foreign/shared save addresses from the published
  // ootmm.com web build (they are not derivable from the patchfile/sources)
  // and write them into this version's live_addrs.json — but only if the
  // derivation's consistency checks pass.
  maybeDeriveWebSaveSymbols();
}

main();
