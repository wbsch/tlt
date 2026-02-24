import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CategoryCounts = {
  existing: number;
  needed: number;
  missing: number;
  unused: number;
};

type ImageUsageReport = {
  generatedAt: string;
  scanned: {
    files: string[];
  };
  counts: {
    existing: number;
    needed: number;
    missing: number;
    unused: number;
  };
  needed: string[];
  missing: string[];
  unused: string[];
  byCategory: Record<string, CategoryCounts>;
};

const ROOT = process.cwd();
const PUBLIC_IMAGES_DIR = path.resolve(ROOT, 'public/images');
const MAP_DATA_DIR = path.resolve(ROOT, 'packs/ootmm/src/data/maps');
const REPORT_FILE = path.resolve(ROOT, 'reports/image-usage-report.json');

const SOURCE_SCAN_ROOTS = ['src', 'packs', 'tests', 'scripts'] as const;
const SOURCE_SCAN_FILES = ['playwright.config.ts'] as const;

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.avif',
  '.svg',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

const TEXT_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.json',
  '.css',
  '.scss',
  '.html',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
]);

const DIRECT_IMAGE_PATH_PATTERN =
  /\/?images\/[A-Za-z0-9_./-]+\.(?:png|avif|svg|jpg|jpeg|webp|gif)/g;

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function toRepoRelative(absolutePath: string): string {
  return toPosixPath(path.relative(ROOT, absolutePath));
}

function normalizeImagePath(value: string): string {
  const normalized = toPosixPath(value).replace(/^\/+/, '');
  return normalized.replace(/^public\//, '');
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isLikelyTextFile(filePath: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getCategory(imagePath: string): string {
  const withoutPrefix = imagePath.startsWith('images/')
    ? imagePath.slice('images/'.length)
    : imagePath;
  const slashIndex = withoutPrefix.indexOf('/');
  return slashIndex >= 0 ? withoutPrefix.slice(0, slashIndex) : 'root';
}

function sortedArray(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function updateCategoryCounts(
  accumulator: Map<string, CategoryCounts>,
  items: Iterable<string>,
  key: keyof CategoryCounts,
): void {
  for (const item of items) {
    const category = getCategory(item);
    const current = accumulator.get(category) ?? {
      existing: 0,
      needed: 0,
      missing: 0,
      unused: 0,
    };
    current[key] += 1;
    accumulator.set(category, current);
  }
}

async function listFilesRecursive(baseDir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function collectDirectImageReferences(source: string): string[] {
  const references: string[] = [];
  const matches = source.matchAll(DIRECT_IMAGE_PATH_PATTERN);

  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;
    const lookbehind = source.slice(Math.max(0, index - 8), index);

    // Skip URL fragments like "https://.../images/..."
    if (lookbehind.includes('://')) continue;

    references.push(normalizeImagePath(raw));
  }

  return references;
}

async function collectSourceReferences(): Promise<{
  references: Set<string>;
  scannedFiles: Set<string>;
}> {
  const references = new Set<string>();
  const scannedFiles = new Set<string>();

  const filesToScan: string[] = [];

  for (const relativeRoot of SOURCE_SCAN_ROOTS) {
    const absoluteRoot = path.resolve(ROOT, relativeRoot);
    const discovered = await listFilesRecursive(absoluteRoot);
    for (const filePath of discovered) {
      if (isLikelyTextFile(filePath)) {
        filesToScan.push(filePath);
      }
    }
  }

  for (const relativeFile of SOURCE_SCAN_FILES) {
    const absoluteFile = path.resolve(ROOT, relativeFile);
    if (isLikelyTextFile(absoluteFile)) {
      filesToScan.push(absoluteFile);
    }
  }

  for (const filePath of filesToScan) {
    let source: string;
    try {
      source = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    scannedFiles.add(toRepoRelative(filePath));
    for (const ref of collectDirectImageReferences(source)) {
      references.add(ref);
    }
  }

  return { references, scannedFiles };
}

function collectMapMarkerImages(node: unknown, output: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectMapMarkerImages(child, output);
    }
    return;
  }

  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (typeof record.image === 'string' && record.image.length > 0) {
    output.add(record.image);
  }

  if (record.markers !== undefined) {
    collectMapMarkerImages(record.markers, output);
  }
}

async function collectMapReferences(): Promise<{
  references: Set<string>;
  scannedFiles: Set<string>;
}> {
  const references = new Set<string>();
  const scannedFiles = new Set<string>();
  const markerImages = new Set<string>();

  let entries: Awaited<ReturnType<typeof readdir>> = [];
  try {
    entries = await readdir(MAP_DATA_DIR, { withFileTypes: true });
  } catch {
    return { references, scannedFiles };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const filePath = path.join(MAP_DATA_DIR, entry.name);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    scannedFiles.add(toRepoRelative(filePath));

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).image === 'string'
    ) {
      const imageName = (parsed as Record<string, unknown>).image as string;
      references.add(`images/maps/${imageName}.png`);
    }

    if (parsed && typeof parsed === 'object') {
      const markers = (parsed as Record<string, unknown>).markers;
      collectMapMarkerImages(markers, markerImages);
    }
  }

  for (const markerImage of markerImages) {
    references.add(`images/map_icons/${markerImage}.png`);
  }

  return { references, scannedFiles };
}

async function collectResolverPotentialReferences(): Promise<{
  references: Set<string>;
  scannedFiles: Set<string>;
}> {
  const references = new Set<string>();
  const scannedFiles = new Set<string>();

  const directories = [
    'public/images/attributes',
    'public/images/attributes_wide',
    'public/images/numbers',
  ];

  for (const relativeDir of directories) {
    const absoluteDir = path.resolve(ROOT, relativeDir);
    const files = await listFilesRecursive(absoluteDir);
    for (const filePath of files) {
      if (!isImageFile(filePath)) continue;
      scannedFiles.add(toRepoRelative(filePath));
      references.add(normalizeImagePath(toRepoRelative(filePath)));
    }
  }

  references.add('images/label_master_quest.png');

  return { references, scannedFiles };
}

async function collectExistingImages(): Promise<Set<string>> {
  const files = await listFilesRecursive(PUBLIC_IMAGES_DIR);
  const existing = new Set<string>();

  for (const filePath of files) {
    if (!isImageFile(filePath)) continue;
    existing.add(normalizeImagePath(toRepoRelative(filePath)));
  }

  return existing;
}

async function main(): Promise<void> {
  const [{ references: sourceRefs, scannedFiles: sourceScanned }, mapData, resolver, existing] =
    await Promise.all([
      collectSourceReferences(),
      collectMapReferences(),
      collectResolverPotentialReferences(),
      collectExistingImages(),
    ]);

  const needed = new Set<string>([
    ...sourceRefs,
    ...mapData.references,
    ...resolver.references,
  ]);
  const missing = new Set<string>();
  const unused = new Set<string>();

  for (const neededPath of needed) {
    if (!existing.has(neededPath)) {
      missing.add(neededPath);
    }
  }

  for (const existingPath of existing) {
    if (!needed.has(existingPath)) {
      unused.add(existingPath);
    }
  }

  const categoryCounts = new Map<string, CategoryCounts>();
  updateCategoryCounts(categoryCounts, existing, 'existing');
  updateCategoryCounts(categoryCounts, needed, 'needed');
  updateCategoryCounts(categoryCounts, missing, 'missing');
  updateCategoryCounts(categoryCounts, unused, 'unused');

  const scannedFiles = sortedArray(
    new Set<string>([
      ...sourceScanned,
      ...mapData.scannedFiles,
      ...resolver.scannedFiles,
    ]),
  );

  const report: ImageUsageReport = {
    generatedAt: new Date().toISOString(),
    scanned: {
      files: scannedFiles,
    },
    counts: {
      existing: existing.size,
      needed: needed.size,
      missing: missing.size,
      unused: unused.size,
    },
    needed: sortedArray(needed),
    missing: sortedArray(missing),
    unused: sortedArray(unused),
    byCategory: Object.fromEntries(
      [...categoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
  };

  await mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Scanned files: ${report.scanned.files.length}`);
  console.log(`Existing images: ${report.counts.existing}`);
  console.log(`Needed images: ${report.counts.needed}`);
  console.log(`Missing images: ${report.counts.missing}`);
  console.log(`Unused images: ${report.counts.unused}`);

  if (report.missing.length > 0) {
    console.log('Missing examples:');
    for (const filePath of report.missing.slice(0, 20)) {
      console.log(`  - ${filePath}`);
    }
  }

  if (report.unused.length > 0) {
    console.log('Unused examples:');
    for (const filePath of report.unused.slice(0, 20)) {
      console.log(`  - ${filePath}`);
    }
  }

  console.log(`Report written: ${toRepoRelative(REPORT_FILE)}`);
}

main().catch((error) => {
  console.error('Failed to audit image usage:', error);
  process.exitCode = 1;
});
