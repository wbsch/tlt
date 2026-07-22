import { readdir } from 'node:fs/promises';
import path from 'node:path';

// BusinessAlex's map-icon and song-event assets are opt-in (see LICENSE_ASSETS.md
// and the I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES flag). The
// default build serves an MIT-licensed fallback set from public/images/fallback/.
// This check WARNS (never fails) about any restricted filename that has no fallback
// counterpart yet, so the maintainer knows exactly which placeholders are missing.

type AssetSet = {
  label: string;
  restrictedDir: string;
  fallbackDir: string;
};

const SETS: AssetSet[] = [
  {
    label: 'map icons',
    restrictedDir: path.resolve('public/images/map_icons'),
    fallbackDir: path.resolve('public/images/fallback/map_icons'),
  },
  {
    label: 'song events',
    restrictedDir: path.resolve('public/images/song_events'),
    fallbackDir: path.resolve('public/images/fallback/song_events'),
  },
];

async function listPngs(dir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
        .map((entry) => entry.name),
    );
  } catch (error) {
    // A not-yet-created fallback dir is expected: treat it as "no files yet".
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return new Set();
    }
    throw error;
  }
}

async function checkFallbackAssets(): Promise<void> {
  let totalMissing = 0;

  for (const set of SETS) {
    const restricted = await listPngs(set.restrictedDir);
    const fallback = await listPngs(set.fallbackDir);
    const missing = [...restricted]
      .filter((name) => !fallback.has(name))
      .sort();

    if (missing.length === 0) {
      continue;
    }

    totalMissing += missing.length;
    const relFallback = path.relative(process.cwd(), set.fallbackDir);
    console.warn(
      `\n[fallback-check] ${missing.length} MIT fallback ${set.label} missing in ${relFallback}/:`,
    );
    for (const name of missing) {
      console.warn(`  - ${name}`);
    }
  }

  if (totalMissing > 0) {
    console.warn(
      `\n[fallback-check] Default (no-permission) builds will show broken images for the ${totalMissing} file(s) above until an MIT placeholder is added. Set I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES=TRUE to build with the restricted assets instead.\n`,
    );
  }
}

checkFallbackAssets().catch((error) => {
  console.error('Failed to check fallback assets:', error);
  process.exitCode = 1;
});
