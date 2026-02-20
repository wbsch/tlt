import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import { MAP_ICON_INDEX } from '../packs/ootmm/src/data/maps/mapIconIndex.ts';
import {
  buildLocationCodeSet,
  toSortedUnique,
} from '../packs/ootmm/src/data/locationCodeSource.ts';
import type {
  HintsLikeData,
  WorldLikeData,
} from '../packs/ootmm/src/data/locationCodeSource.ts';

const TYPES_FILE = path.resolve('packs/ootmm/src/data/maps/types.ts');
const MAP_IMAGES_DIR = path.resolve('public/images/maps');
const WORLD_DATA_FILE = path.resolve(
  'OoTMM/packages/data/dist/data-world.json',
);
const HINTS_RAW_FILE = path.resolve(
  'OoTMM/packages/data/dist/data-hints-raw.json',
);
const OUTPUT_FILE = path.resolve(
  'packs/ootmm/src/data/schemas/ootmm-map.schema.json',
);

type JsonRecord = Record<string, unknown>;
type HintLocationRecord = { location?: unknown };

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
  const world = JSON.parse(worldRaw) as WorldLikeData;
  return buildLocationCodeSet(world);
}

async function loadHintLocationCodes(): Promise<string[]> {
  const hintsRaw = await readFile(HINTS_RAW_FILE, 'utf8');
  const hints = JSON.parse(hintsRaw) as HintsLikeData;
  return buildLocationCodeSet({}, hints);
}

async function generateMapSchema(): Promise<void> {
  const markerImages = toSortedUnique(MAP_ICON_INDEX);
  const [mapImages, overlays, worldCodes, hintCodes] = await Promise.all([
    loadMapImageNames(),
    loadOverlayNames(),
    loadWorldLocationCodes(),
    loadHintLocationCodes(),
  ]);
  const codes = toSortedUnique([...worldCodes, ...hintCodes]);

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
        anyOf: [
          {
            type: 'string',
            enum: codes,
          },
          {
            type: 'string',
            pattern: '^TODO\\s+[A-Z0-9_-]+\\s+\\d{3}\\s+::\\s+',
          },
        ],
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
  const formattedOutput = await prettier.format(output, {
    ...(await prettier.resolveConfig(OUTPUT_FILE)),
    filepath: OUTPUT_FILE,
  });

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, formattedOutput, 'utf8');
  console.log(
    `Generated schema -> ${path.relative(process.cwd(), OUTPUT_FILE)} (${markerImages.length} marker images, ${overlays.length} overlays, ${codes.length} codes)`,
  );
}

generateMapSchema().catch((error) => {
  console.error('Failed to generate map schema:', error);
  process.exitCode = 1;
});
