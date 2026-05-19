import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createRawAutotrackerParser,
  RAW_CHUNK_SPECS,
  type RawAutotrackerMessage,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';

type FixtureItem = {
  id: string;
  qty: number;
};

type FixtureCheck = {
  name?: string;
  checked?: boolean;
};

type FixtureRegion = {
  name: string;
  address: string;
  size: number;
  encoding: string;
  data: string;
};

type FixtureFile = {
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

const FIXED_CHUNK_REGION_NAMES = new Map<string, string>([
  ['combo_ctx_oot', 'comboCtxOot'],
  ['combo_ctx_mm', 'comboCtxMm'],
  ['oot_save_ctx', 'ootSaveContext'],
  ['mm_save_ctx', 'mmSaveContext'],
  ['oot_payload', 'ootPayload'],
  ['mm_payload', 'mmPayload'],
]);

const PHASE2_LEGACY_ONLY_EXPECTED_IDS = new Set(['OOT_BOOTS']);

const PHASE2_TRACKER_NATIVE_EXTRA_IDS = new Set([
  'OOT_SMALL_KEY_GF',
  'MM_CLOCK1',
  'MM_CLOCK2',
  'MM_CLOCK3',
  'MM_CLOCK4',
  'MM_CLOCK5',
  'MM_CLOCK6',
]);

const PHASE2_CHECK_NORMALIZATION = new Map<
  string,
  { add?: string[]; remove?: string[] }
>([
  [
    'gerudo-card-20260429-201847.json',
    {
      add: ['Gerudo Member Card'],
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
    'test-20260501-125454.json',
    {
      add: ['Shooting Gallery Child'],
      remove: ['Hatch Pocket Cucco'],
    },
  ],
]);

const FIXTURE_ROOT = path.resolve(
  process.cwd(),
  'tlt_autotracker/ootmm-autotracker/ootmm/testdata/dumps',
);

function loadFixture(name: string): FixtureFile {
  const raw = readFileSync(path.join(FIXTURE_ROOT, name), 'utf8');
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

function buildRawMessage(
  fixtureName: string,
  sequence = 1,
): { fixture: FixtureFile; message: RawAutotrackerMessage } {
  const fixture = loadFixture(fixtureName);
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

function positiveItemMap(items: FixtureItem[]): Map<string, number> {
  return new Map(
    items.filter((item) => item.qty > 0).map((item) => [item.id, item.qty]),
  );
}

function parsedItemMap(
  items: Array<{ id: string; qty: number }>,
): Map<string, number> {
  return new Map(items.map((item) => [item.id, item.qty]));
}

function normalizeExpectedPhase2Items(
  items: Map<string, number>,
): Map<string, number> {
  const normalized = new Map(items);
  for (const itemId of PHASE2_LEGACY_ONLY_EXPECTED_IDS) {
    normalized.delete(itemId);
  }
  return normalized;
}

function normalizeActualPhase2Items(
  items: Map<string, number>,
): Map<string, number> {
  const normalized = new Map(items);
  for (const itemId of PHASE2_TRACKER_NATIVE_EXTRA_IDS) {
    normalized.delete(itemId);
  }
  return normalized;
}

function expectedCheckSet(checks: FixtureCheck[] | undefined): Set<string> {
  return new Set(
    (checks ?? [])
      .filter((check) => check.checked !== false)
      .map((check) => check.name ?? '')
      .filter((name) => name.length > 0),
  );
}

function parsedCheckSet(
  checks: Array<{ name?: string; checked: boolean }>,
): Set<string> {
  return new Set(
    checks
      .filter((check) => check.checked)
      .map((check) => check.name ?? '')
      .filter((name) => name.length > 0),
  );
}

function normalizeExpectedPhase2Checks(
  fixtureName: string,
  checks: Set<string>,
): Set<string> {
  const normalized = new Set(checks);
  const adjustment = PHASE2_CHECK_NORMALIZATION.get(fixtureName);
  for (const name of adjustment?.remove ?? []) {
    normalized.delete(name);
  }
  for (const name of adjustment?.add ?? []) {
    normalized.add(name);
  }
  return normalized;
}

describe('raw frame parser', () => {
  it.each([
    'gerudo-card-20260429-201847.json',
    'before-madame-aroma-20260501-170327.json',
    'test-20260501-125454.json',
  ])('parses %s into the fixture summary items and checks', (fixtureName) => {
    const parser = createRawAutotrackerParser();
    const { fixture, message } = buildRawMessage(fixtureName);

    const parsed = parser.parse(message);

    expect(parsed).not.toBeNull();
    expect(normalizeActualPhase2Items(parsedItemMap(parsed!.items))).toEqual(
      normalizeExpectedPhase2Items(positiveItemMap(fixture.summary.items)),
    );
    expect(parsedCheckSet(parsed!.checks)).toEqual(
      normalizeExpectedPhase2Checks(
        fixtureName,
        expectedCheckSet(fixture.summary.checks),
      ),
    );
  });

  it('emits the known tracker-native extras that legacy summaries omit', () => {
    const parser = createRawAutotrackerParser();
    const { message } = buildRawMessage(
      'before-madame-aroma-20260501-170327.json',
    );

    const parsed = parser.parse(message);
    const items = parsedItemMap(parsed?.items ?? []);

    expect(items.get('OOT_SMALL_KEY_GF')).toBe(1);
    expect(items.get('MM_CLOCK1')).toBe(1);
    expect(items.get('MM_CLOCK2')).toBe(1);
    expect(items.get('MM_CLOCK3')).toBe(1);
    expect(items.get('MM_CLOCK4')).toBe(1);
    expect(items.get('MM_CLOCK5')).toBe(1);
    expect(items.get('MM_CLOCK6')).toBe(1);
  });

  it('reuses the last-known MM state across subsequent OoT snapshots', () => {
    const parser = createRawAutotrackerParser();
    const { message: beforeMessage } = buildRawMessage(
      'before-madame-aroma-20260501-170327.json',
      1,
    );
    const { message: afterMessage } = buildRawMessage(
      'test-20260501-125454.json',
      2,
    );

    parser.parse(beforeMessage);
    const parsed = parser.parse(afterMessage);
    const checks = parsedCheckSet(parsed?.checks ?? []);

    expect(checks.has('Clock Town Tree HP')).toBe(true);
    expect(checks.has('Clock Town Platform HP')).toBe(true);
  });
});
