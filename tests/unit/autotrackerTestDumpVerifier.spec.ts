import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  verifyTestDump,
  verifyTestDumpsInDirectory,
  type TestDumpFile,
} from '../helpers/autotrackerTestDumpVerifier';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'tests/fixtures/autotracker/test-dumps/oot-full-v32_1.json',
);

function loadValidDump(): TestDumpFile {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as TestDumpFile;
}

function clone(dump: TestDumpFile): TestDumpFile {
  return JSON.parse(JSON.stringify(dump)) as TestDumpFile;
}

describe('verifyTestDump', () => {
  it('accepts a valid committed full-dump fixture', () => {
    expect(verifyTestDump(loadValidDump())).toEqual({ ok: true });
  });

  it('fails when the recorded expected omits an item the dump decodes', () => {
    const dump = clone(loadValidDump());
    dump.expected.items = dump.expected.items.slice(0, -1);

    const result = verifyTestDump(dump);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The dump decodes an item the (corrupted) expected no longer lists.
      expect(result.reason).toContain('unexpected items');
    }
  });

  it('fails when the recorded expected has an extra item the dump lacks', () => {
    const dump = clone(loadValidDump());
    dump.expected.items.push({ id: 'BOGUS_ITEM', qty: 1 });

    const result = verifyTestDump(dump);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('missing items');
    }
  });

  it('fails on an unsupported ootmmVersion', () => {
    const dump = clone(loadValidDump());
    dump.ootmmVersion = '99.0';

    const result = verifyTestDump(dump);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unsupported ootmmVersion');
    }
  });

  it('fails on a missing ootmmVersion', () => {
    const dump = clone(loadValidDump());
    dump.ootmmVersion = null;

    const result = verifyTestDump(dump);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('missing ootmmVersion');
    }
  });
});

describe('verifyTestDumpsInDirectory', () => {
  it('reports a missing directory without throwing', () => {
    const missing = path.join(tmpdir(), 'tlt-no-such-test-dumps');
    expect(verifyTestDumpsInDirectory(missing)).toEqual({
      missingOrEmpty: true,
      dumpsDir: missing,
      files: [],
    });
  });

  it('reports an empty directory without throwing', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'tlt-test-dumps-'));
    try {
      const result = verifyTestDumpsInDirectory(empty);
      expect(result.missingOrEmpty).toBe(true);
      expect(result.files).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
