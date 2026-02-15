import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAP_ICON_INDEX } from '../packs/ootmm/src/data/maps/mapIconIndex.ts';

const MAPS_DIR = path.resolve('packs/ootmm/src/data/maps');
const TYPES_FILE = path.resolve('packs/ootmm/src/data/maps/types.ts');
const MAP_IMAGES_DIR = path.resolve('public/images/maps');
const WORLD_DATA_FILE = path.resolve(
  'OoTMM/packages/data/dist/data-world.json',
);
const OUTPUT_FILE = path.resolve(
  'packs/ootmm/src/data/schemas/ootmm-map.schema.json',
);

type JsonRecord = Record<string, unknown>;

function toSortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractStringUnionValues(source: string, typeName: string): string[] {
  const typeMatch = source.match(
    new RegExp(`export type ${typeName} =([\\s\\S]*?)\\n\\nexport type`, 'm'),
  );
  if (!typeMatch) {
    throw new Error(`Could not find union definition for ${typeName}`);
  }
  return toSortedUnique(
    typeMatch[1].match(/'([^']+)'/g)?.map((entry) => entry.slice(1, -1)) ?? [],
  );
}

function collectCodesFromUnknown(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) out.add(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCodesFromUnknown(entry, out));
  }
}

function collectCodesFromMarkers(markers: unknown, out: Set<string>): void {
  if (!Array.isArray(markers)) return;
  for (const marker of markers) {
    if (!marker || typeof marker !== 'object') continue;
    const markerObj = marker as JsonRecord;
    collectCodesFromUnknown(markerObj.codes, out);
    if (Array.isArray(markerObj.markers)) {
      for (const submenuEntry of markerObj.markers) {
        if (!submenuEntry || typeof submenuEntry !== 'object') continue;
        collectCodesFromUnknown((submenuEntry as JsonRecord).codes, out);
      }
    }
  }
}

async function loadMapImageNames(): Promise<string[]> {
  const entries = await readdir(MAP_IMAGES_DIR, { withFileTypes: true });
  return toSortedUnique(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
      .map((entry) => entry.name.replace(/\.png$/i, '')),
  );
}

async function loadOverlayNames(): Promise<string[]> {
  const source = await readFile(TYPES_FILE, 'utf8');
  return extractStringUnionValues(source, 'MapMarkerOverlay');
}

async function loadWorldLocationCodes(): Promise<string[]> {
  const worldRaw = await readFile(WORLD_DATA_FILE, 'utf8');
  const world = JSON.parse(worldRaw) as Record<
    string,
    Record<string, Record<string, { locations?: JsonRecord }>>
  >;
  const codes = new Set<string>();
  for (const game of ['oot', 'mm'] as const) {
    const worldByGame = world[game] ?? {};
    for (const areaSet of Object.values(worldByGame)) {
      for (const area of Object.values(areaSet ?? {})) {
        const locations = area?.locations ?? {};
        for (const locationName of Object.keys(locations)) {
          const prefixed = `${game.toUpperCase()} ${locationName}`.trim();
          if (prefixed.length > 0) {
            codes.add(prefixed);
          }
        }
      }
    }
  }
  return toSortedUnique(codes);
}

async function loadCodesFromMapFiles(): Promise<string[]> {
  const entries = await readdir(MAPS_DIR, { withFileTypes: true });
  const mapJsonFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        !entry.name.endsWith('.schema.json'),
    )
    .map((entry) => path.join(MAPS_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const codes = new Set<string>();
  for (const mapPath of mapJsonFiles) {
    const raw = await readFile(mapPath, 'utf8');
    const data = JSON.parse(raw) as JsonRecord;
    collectCodesFromMarkers(data.markers, codes);
  }
  return toSortedUnique(codes);
}

async function generateMapSchema(): Promise<void> {
  const markerImages = toSortedUnique(MAP_ICON_INDEX);
  const [mapImages, overlays, worldCodes, mapCodes] = await Promise.all([
    loadMapImageNames(),
    loadOverlayNames(),
    loadWorldLocationCodes(),
    loadCodesFromMapFiles(),
  ]);
  const codes = toSortedUnique([...worldCodes, ...mapCodes]);

  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://the-last-tracker.local/schemas/ootmm-map.schema.json',
    title: 'OoTMM Map Definition',
    type: 'object',
    additionalProperties: false,
    required: ['id', 'title', 'image', 'width', 'height', 'markers'],
    properties: {
      $schema: {
        type: 'string',
        description: 'Optional editor schema reference.',
      },
      id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      image: {
        type: 'string',
        enum: mapImages,
      },
      width: { type: 'number' },
      height: { type: 'number' },
      markers: {
        type: 'array',
        items: {
          anyOf: [
            { $ref: '#/$defs/checkMarker' },
            { $ref: '#/$defs/submenuMarker' },
          ],
        },
      },
    },
    $defs: {
      markerImage: {
        type: 'string',
        enum: markerImages,
      },
      overlay: {
        type: 'string',
        enum: overlays,
      },
      overlays: {
        type: 'array',
        items: { $ref: '#/$defs/overlay' },
        uniqueItems: true,
      },
      codeValue: {
        type: 'string',
        enum: codes,
      },
      codes: {
        anyOf: [
          { $ref: '#/$defs/codeValue' },
          {
            type: 'array',
            items: { $ref: '#/$defs/codeValue' },
            minItems: 1,
            uniqueItems: true,
          },
        ],
      },
      coords: {
        type: 'array',
        prefixItems: [{ type: 'number' }, { type: 'number' }],
        minItems: 2,
        maxItems: 2,
      },
      submenuEntry: {
        type: 'object',
        additionalProperties: false,
        required: ['image', 'codes'],
        properties: {
          image: { $ref: '#/$defs/markerImage' },
          overlays: { $ref: '#/$defs/overlays' },
          codes: { $ref: '#/$defs/codes' },
        },
      },
      checkMarker: {
        type: 'object',
        additionalProperties: false,
        required: ['coords', 'image', 'codes'],
        properties: {
          coords: { $ref: '#/$defs/coords' },
          image: { $ref: '#/$defs/markerImage' },
          overlays: { $ref: '#/$defs/overlays' },
          type: { const: 'check' },
          codes: { $ref: '#/$defs/codes' },
        },
      },
      submenuMarker: {
        type: 'object',
        additionalProperties: false,
        required: ['coords', 'image', 'type', 'markers'],
        properties: {
          coords: { $ref: '#/$defs/coords' },
          image: { $ref: '#/$defs/markerImage' },
          overlays: { $ref: '#/$defs/overlays' },
          type: { const: 'submenu' },
          markers: {
            type: 'array',
            items: { $ref: '#/$defs/submenuEntry' },
            minItems: 1,
          },
        },
      },
    },
  };

  const output = `${JSON.stringify(schema, null, 2)}\n`;
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, output, 'utf8');
  console.log(
    `Generated schema -> ${path.relative(process.cwd(), OUTPUT_FILE)} (${markerImages.length} marker images, ${overlays.length} overlays, ${codes.length} codes)`,
  );
}

generateMapSchema().catch((error) => {
  console.error('Failed to generate map schema:', error);
  process.exitCode = 1;
});
