/**
 * Maps OoTMM spoiler-log version strings to autotracker data directories.
 *
 * The version normalization strips an optional leading "v" and replaces "."
 * with "_" so that "v30.1" → "v30_1" and "30.1" → "v30_1".
 *
 * Available versions are explicitly listed here.  New OoTMM versions are
 * only enabled for autotracking after manual review, even when the
 * corresponding data directory already exists on disk.
 */

export type AutotrackerDataVersion = {
  /** Normalized directory name, e.g. "v30_1". */
  dirName: string;
  /** Human-readable label, e.g. "30.1". */
  label: string;
};

/** All autotracker data versions that are explicitly enabled. */
const AUTOTRACKER_DATA_VERSIONS: AutotrackerDataVersion[] = [
  { dirName: 'v30_1', label: '30.1' },
  { dirName: 'v31_0', label: '31.0' },
  { dirName: 'v31_1', label: '31.1' },
];

/** Default version used when no spoiler log has been imported. */
const DEFAULT_DATA_VERSION: AutotrackerDataVersion =
  AUTOTRACKER_DATA_VERSIONS[AUTOTRACKER_DATA_VERSIONS.length - 1];

/**
 * Normalize a raw spoiler-log version string (e.g. "v30.1", "30.1") into a
 * directory-name fragment like "v30_1".
 */
export function normalizeSpoilerVersionToDirName(
  rawVersion: string | null | undefined,
): string {
  if (!rawVersion) {
    return DEFAULT_DATA_VERSION.dirName;
  }

  const trimmed = rawVersion.trim();
  // Strip optional leading "v" and replace dots with underscores.
  const normalized = trimmed.replace(/^v/i, '').replace(/\./g, '_');

  return `v${normalized}`;
}

/**
 * Resolve a spoiler-log version string to the matching AutotrackerDataVersion.
 * Returns the default version if no match is found.
 */
export function resolveAutotrackerDataVersion(
  rawVersion: string | null | undefined,
): AutotrackerDataVersion {
  const dirName = normalizeSpoilerVersionToDirName(rawVersion);
  const match = AUTOTRACKER_DATA_VERSIONS.find((v) => v.dirName === dirName);
  return match ?? DEFAULT_DATA_VERSION;
}

/**
 * Check whether the given spoiler-log version has a matching autotracker data
 * directory.  Returns false for unknown / unsupported versions.
 */
export function hasAutotrackerDataForVersion(
  rawVersion: string | null | undefined,
): boolean {
  const dirName = normalizeSpoilerVersionToDirName(rawVersion);
  return AUTOTRACKER_DATA_VERSIONS.some((v) => v.dirName === dirName);
}

/**
 * Return the directory name (e.g. "v30_1") for the default data version.
 */
export function getDefaultDataVersionDirName(): string {
  return DEFAULT_DATA_VERSION.dirName;
}

/**
 * Return a human-readable sorted list of supported version labels,
 * e.g. "30.1, 31.0, 31.1".
 */
export function getSupportedVersionLabels(): string {
  return AUTOTRACKER_DATA_VERSIONS.map((v) => v.label).join(', ');
}

export { AUTOTRACKER_DATA_VERSIONS, DEFAULT_DATA_VERSION };
