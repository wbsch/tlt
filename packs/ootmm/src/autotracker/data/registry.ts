/**
 * Autotracker data registry – loads all versioned data files at build time
 * via import.meta.glob and exposes them at runtime by version directory name.
 *
 * This is separate from versions.ts (which controls which versions are
 * "enabled" for spoiler-log matching).  The registry simply makes ALL
 * on-disk data available; versions.ts decides which ones to use.
 */

const MODULES = import.meta.glob<{ default: unknown }>(
  ['./*/*.json', '!./*/special_locations_fallbacks_*.lock.json'],
  { eager: true },
);

/**
 * Return a versioned data file by directory name and file name.
 *
 * Example: getVersionedDataFile('v31_0', 'inventory_slots.json')
 */
export function getVersionedDataFile(
  dirName: string,
  fileName: string,
): unknown {
  const key = `./${dirName}/${fileName}`;
  const mod = MODULES[key];
  if (!mod) {
    throw new Error(`No autotracker data file for ${dirName}/${fileName}`);
  }
  return mod.default;
}
