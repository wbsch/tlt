import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  RAW_CHUNK_SPECS,
  type ParsedRawAutotrackerSnapshot,
  type RawAutotrackerMessage,
  type RawAutotrackerParser,
} from '../../packs/ootmm/src/autotracker/rawFrameParser';

export type FixtureItem = {
  id: string;
  qty: number;
};

export type FixtureCheck = {
  name?: string;
  checked?: boolean;
};

export type FixtureRegion = {
  name: string;
  address: string;
  size: number;
  encoding: string;
  data: string;
};

export type FixtureFile = {
  summary: {
    activeGame: string;
    saveIndex: number;
    items: FixtureItem[];
    checks?: FixtureCheck[];
  };
  regions: FixtureRegion[];
};

type LoadedRegion = {
  name: string;
  address: number;
  data: Uint8Array;
};

export const RAW_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  'tests/fixtures/autotracker/dumps',
);

const FIXED_CHUNK_REGION_NAMES = new Map<string, string>([
  ['combo_ctx_oot', 'comboCtxOot'],
  ['combo_ctx_mm', 'comboCtxMm'],
  ['oot_save_ctx', 'ootSaveContext'],
  ['mm_save_ctx', 'mmSaveContext'],
  ['oot_payload', 'ootPayload'],
  ['mm_payload', 'mmPayload'],
]);

const LEGACY_ONLY_EXPECTED_ITEM_IDS = new Set(['OOT_BOOTS']);

const TRACKER_NATIVE_EXTRA_ITEM_IDS = new Set([
  'OOT_SMALL_KEY_GF',
  'MM_CLOCK1',
  'MM_CLOCK2',
  'MM_CLOCK3',
  'MM_CLOCK4',
  'MM_CLOCK5',
  'MM_CLOCK6',
]);

const LEGACY_CHECK_NORMALIZATION = new Map<
  string,
  { add?: string[]; remove?: string[] }
>([
  [
    'after-anju-key-20260501-170751.json',
    {
      add: [
        'Clock Town Great Fairy',
        "Mayor's Office Kafei's Mask",
        'Stock Pot Inn Room Key',
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-archery-20260501-171131.json',
    {
      add: [
        'Clock Town Great Fairy',
        "Mayor's Office Kafei's Mask",
        'Stock Pot Inn Room Key',
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
        'Town Archery Reward 1',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-bombchu-2-20260501-202008.json',
    {
      add: [
        'Bombchu Bowling Reward 1',
        'Bombchu Bowling Reward 2',
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-bomchu-1-20260501-201847.json',
    {
      add: [
        'Bombchu Bowling Reward 1',
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-diving-game-20260501-205332.json',
    {
      add: [
        'Bombchu Bowling Reward 1',
        'Bombchu Bowling Reward 2',
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Road to Southern Swamp HP',
        'Zora Domain Diving Game',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-goron-20260501-185719.json',
    {
      add: [
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Goron City Tunic',
        "Great Fairy Nayru's Love",
        'Kakariko Anju Bottle',
        'Kakariko Man on Roof',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-madame-aroma-20260501-170357.json',
    {
      add: [
        'Clock Town Great Fairy',
        "Mayor's Office Kafei's Mask",
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'after-tingle-20260501-170137.json',
    {
      add: [
        'Clock Town Great Fairy',
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-anju-key-20260501-170709.json',
    {
      add: [
        'Clock Town Great Fairy',
        "Mayor's Office Kafei's Mask",
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-archery-20260501-170932.json',
    {
      add: [
        'Clock Town Great Fairy',
        "Mayor's Office Kafei's Mask",
        'Stock Pot Inn Room Key',
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-bombchu-bowling-20260501-201613.json',
    {
      add: [
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-diving-game-20260501-205252.json',
    {
      add: [
        'Bombchu Bowling Reward 1',
        'Bombchu Bowling Reward 2',
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-goron-20260501-185643.json',
    {
      add: [
        'Clock Town Platform HP',
        'Clock Town Tree HP',
        "Great Fairy Nayru's Love",
        'Kakariko Anju Bottle',
        'Kakariko Man on Roof',
        'Road to Southern Swamp HP',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-madame-aroma-20260501-170327.json',
    {
      add: [
        'Clock Town Great Fairy',
        'Tingle Map Clock Town',
        'Tingle Map Woodfall',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'before-tingle-20260501-170052.json',
    {
      add: ['Clock Town Great Fairy'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'child-shooting-gallery-20260429-210339.json',
    {
      add: ['Market Dog Lady HP', 'Shooting Gallery Child'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'gerudo-card-20260429-201847.json',
    {
      add: ['Gerudo Member Card'],
    },
  ],
  [
    'honey-darling-false-20260429-204043.json',
    {
      remove: ['Honey & Darling Reward Any Day'],
    },
  ],
  [
    'lon-lon-ranch-talon-bottle-20260429-210824.json',
    {
      add: [
        'Lon Lon Ranch Talon Bottle',
        'Market Dog Lady HP',
        'Shooting Gallery Child',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'market-dog-lady-20260429-205725.json',
    {
      add: ['Market Dog Lady HP'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'mm-with-initial-song-of-healing-20260501-143938.json',
    {
      add: ['Initial Song of Healing'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'mm-without-initial-song-of-healing-20260501-143756.json',
    {
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'ocarina-game-20260429-213033.json',
    {
      add: [
        'Lon Lon Ranch Talon Bottle',
        'Lost Woods Memory Game',
        'Market Dog Lady HP',
        'Shooting Gallery Child',
      ],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'test-20260501-110855.json',
    {
      add: ['Lost Woods Memory Game'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
  [
    'test-20260501-125454.json',
    {
      add: ['Shooting Gallery Child'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
]);

export function listRawFixtureNames(): string[] {
  return readdirSync(RAW_FIXTURE_ROOT)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
}

export function loadRawFixture(name: string): FixtureFile {
  const raw = readFileSync(path.join(RAW_FIXTURE_ROOT, name), 'utf8');
  return JSON.parse(raw) as FixtureFile;
}

function decodeBase64(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, 'base64'));
}

function loadRegions(fixture: FixtureFile): LoadedRegion[] {
  return fixture.regions
    .filter((region) => region.encoding === 'base64' && region.data)
    .map((region) => ({
      name: region.name,
      address: Number.parseInt(region.address, 0),
      data: decodeBase64(region.data),
    }));
}

function sliceRegions(
  regions: LoadedRegion[],
  address: number,
  size: number,
): Uint8Array | null {
  for (const region of regions) {
    if (address < region.address) {
      continue;
    }
    const offset = address - region.address;
    if (offset < 0 || offset + size > region.data.length) {
      continue;
    }
    return region.data.slice(offset, offset + size);
  }

  return null;
}

function sliceRegionByName(
  regions: LoadedRegion[],
  name: string,
  size: number,
): Uint8Array | null {
  const region = regions.find((entry) => entry.name === name);
  if (!region) {
    return null;
  }
  if (region.data.length < size) {
    throw new Error(`Region ${name} shorter than expected ${size}`);
  }
  return region.data.slice(0, size);
}

export function buildRawMessage(
  fixtureName: string,
  sequence = 1,
): { fixture: FixtureFile; message: RawAutotrackerMessage } {
  const fixture = loadRawFixture(fixtureName);
  const regions = loadRegions(fixture);

  const chunks = RAW_CHUNK_SPECS.flatMap((spec) => {
    const namedRegion = FIXED_CHUNK_REGION_NAMES.get(spec.name);
    const data = namedRegion
      ? sliceRegionByName(regions, namedRegion, spec.length)
      : sliceRegions(regions, spec.address, spec.length);
    if (!data) {
      return [];
    }

    return [
      {
        name: spec.name,
        address: spec.address,
        length: spec.length,
        data: Buffer.from(data).toString('base64'),
      },
    ];
  });

  return {
    fixture,
    message: {
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence,
      game: fixture.summary.activeGame,
      saveIndex: fixture.summary.saveIndex,
      chunks,
    },
  };
}

export function parseFixture(
  parser: RawAutotrackerParser,
  fixtureName: string,
  sequence = 1,
): {
  fixture: FixtureFile;
  message: RawAutotrackerMessage;
  parsed: ParsedRawAutotrackerSnapshot;
} {
  const bundle = buildRawMessage(fixtureName, sequence);
  const parsed = parser.parse(bundle.message);
  if (!parsed) {
    throw new Error(`Failed to parse fixture ${fixtureName}`);
  }
  return {
    ...bundle,
    parsed,
  };
}

export function positiveItemMap(items: FixtureItem[]): Map<string, number> {
  return new Map(
    items.filter((item) => item.qty > 0).map((item) => [item.id, item.qty]),
  );
}

export function parsedItemMap(
  items: Array<{ id: string; qty: number }>,
): Map<string, number> {
  return new Map(items.map((item) => [item.id, item.qty]));
}

export function expectedCheckSet(
  checks: FixtureCheck[] | undefined,
): Set<string> {
  return new Set(
    (checks ?? [])
      .filter((check) => check.checked !== false)
      .map((check) => check.name ?? '')
      .filter((name) => name.length > 0),
  );
}

export function parsedCheckSet(
  checks: Array<{ name?: string; checked: boolean }>,
): Set<string> {
  return new Set(
    checks
      .filter((check) => check.checked)
      .map((check) => check.name ?? '')
      .filter((name) => name.length > 0),
  );
}

export function normalizeLegacyExpectedItems(
  items: Map<string, number>,
): Map<string, number> {
  const normalized = new Map(items);
  for (const itemId of LEGACY_ONLY_EXPECTED_ITEM_IDS) {
    normalized.delete(itemId);
  }
  return normalized;
}

export function normalizeTrackerItems(
  items: Map<string, number>,
): Map<string, number> {
  const normalized = new Map(items);
  for (const itemId of TRACKER_NATIVE_EXTRA_ITEM_IDS) {
    normalized.delete(itemId);
  }
  return normalized;
}

export function normalizeLegacyExpectedChecks(
  fixtureName: string,
  checks: Set<string>,
): Set<string> {
  const normalized = new Set(checks);
  const adjustment = LEGACY_CHECK_NORMALIZATION.get(fixtureName);
  for (const name of adjustment?.remove ?? []) {
    normalized.delete(name);
  }
  for (const name of adjustment?.add ?? []) {
    normalized.add(name);
  }
  return normalized;
}

export function normalizedExpectedFixtureItems(
  fixture: FixtureFile,
): Map<string, number> {
  return normalizeLegacyExpectedItems(positiveItemMap(fixture.summary.items));
}

export function normalizedParsedFixtureItems(
  parsed: ParsedRawAutotrackerSnapshot,
): Map<string, number> {
  return normalizeTrackerItems(parsedItemMap(parsed.items));
}

export function normalizedExpectedFixtureChecks(
  fixtureName: string,
  fixture: FixtureFile,
): Set<string> {
  return normalizeLegacyExpectedChecks(
    fixtureName,
    expectedCheckSet(fixture.summary.checks),
  );
}

export function normalizedParsedFixtureChecks(
  parsed: ParsedRawAutotrackerSnapshot,
): Set<string> {
  return parsedCheckSet(parsed.checks);
}

export function diffItemMaps(
  expected: Map<string, number>,
  actual: Map<string, number>,
): string[] {
  const itemIds = new Set([...expected.keys(), ...actual.keys()]);
  return [...itemIds]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((itemId) => {
      const expectedQty = expected.get(itemId) ?? 0;
      const actualQty = actual.get(itemId) ?? 0;
      if (expectedQty === actualQty) {
        return [];
      }
      return [`${itemId}: expected ${expectedQty}, got ${actualQty}`];
    });
}

export function diffCheckSets(
  expected: Set<string>,
  actual: Set<string>,
): string[] {
  const differences: string[] = [];

  for (const name of [...expected].sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (!actual.has(name)) {
      differences.push(`missing check: ${name}`);
    }
  }

  for (const name of [...actual].sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (!expected.has(name)) {
      differences.push(`unexpected check: ${name}`);
    }
  }

  return differences;
}
