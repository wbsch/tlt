import fs from 'node:fs/promises';

export type TestCase = {
  given: {
    items: string[];
    settings?: string[];
    tricks?: string[];
    events?: Record<string, boolean>;
    entrances?: Array<{
      from: string;
      to: string;
      capture_to?: string;
    }>;
  };
  result: {
    available_locations?: string[];
    available_locations_glitched?: string[];
    unavailable_locations?: string[];
    event_raw?: Record<string, boolean>;
  };
};

export type RunMode = 'normal' | 'glitched';

export type RunMeta = {
  index: number;
  workerId?: number;
};

export type RunDebug = {
  settingsPatch?: Record<string, unknown>;
  settingsWarnings?: string[];
  warnings?: string[];
};

export type RunOutput = {
  reachable: Set<string>;
  events: Set<string>;
  eventNames?: Set<string>;
  debug?: RunDebug;
};

export type PathfinderTestAdapter = {
  name: string;
  run: (test: TestCase, mode: RunMode, meta: RunMeta) => Promise<RunOutput>;
  normalizeLocation?: (locationId: string) => string;
  resolveEventName?: (expected: string, events: Set<string>) => string | null;
};

const stripJsonc = (input: string): string => {
  let out = '';
  let inString = false;
  let inSingleComment = false;
  let inMultiComment = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inSingleComment) {
      if (ch === '\n') {
        inSingleComment = false;
        out += ch;
      }
      continue;
    }

    if (inMultiComment) {
      if (ch === '*' && next === '/') {
        inMultiComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inSingleComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inMultiComment = true;
      i++;
      continue;
    }

    out += ch;
  }

  return out;
};

const stripTrailingCommas = (input: string): string => {
  let out = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j++;
      }
      if (j < input.length && (input[j] === ']' || input[j] === '}')) {
        continue;
      }
    }

    out += ch;
  }

  return out;
};

export const parseJsonc = (input: string): unknown => {
  const noComments = stripJsonc(input);
  const noTrailingCommas = stripTrailingCommas(noComments);
  return JSON.parse(noTrailingCommas);
};

export const loadTestCases = async (filePath: string): Promise<TestCase[]> => {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseJsonc(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected test file to contain a top-level array.');
  }
  return parsed as TestCase[];
};

export const resolveEventNameDefault = (
  expected: string,
  events: Set<string>,
): string | null => {
  const candidates: string[] = [];

  const pushUnique = (value: string) => {
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  pushUnique(expected);

  if (expected.startsWith('EVENT_')) {
    pushUnique(expected.slice('EVENT_'.length));
  }

  if (expected.startsWith('OOT_') || expected.startsWith('MM_')) {
    pushUnique(expected.slice(4));
  }

  if (expected.startsWith('EVENT_OOT_')) {
    pushUnique(expected.slice('EVENT_OOT_'.length));
    pushUnique(`OOT_${expected.slice('EVENT_OOT_'.length)}`);
  }

  if (expected.startsWith('EVENT_MM_')) {
    pushUnique(expected.slice('EVENT_MM_'.length));
    pushUnique(`MM_${expected.slice('EVENT_MM_'.length)}`);
  }

  if (!expected.startsWith('OOT_') && events.has(`OOT_${expected}`)) {
    pushUnique(`OOT_${expected}`);
  }

  if (!expected.startsWith('MM_') && events.has(`MM_${expected}`)) {
    pushUnique(`MM_${expected}`);
  }

  for (const candidate of candidates) {
    if (events.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

const normalizeSet = (
  values: Set<string>,
  normalize: (value: string) => string,
): Set<string> => {
  const result = new Set<string>();
  for (const value of values) {
    result.add(normalize(value));
  }
  return result;
};

export type TestRunSummary = {
  total: number;
  passed: number;
  failed: number;
  failures: Array<{
    index: number;
    messages: string[];
  }>;
};

export type TestRunOptions = {
  only?: Set<number>;
  verboseLevel?: number;
  workers?: number;
};

const formatDuration = (ms: number): string => `${ms.toFixed(1)}ms`;

const toSortedArray = (values: Iterable<string>): string[] =>
  Array.from(values).sort((a, b) => a.localeCompare(b));

const formatList = (values: Iterable<string>): string =>
  toSortedArray(values).join(', ');

export const runTestCases = async (
  filePath: string,
  adapter: PathfinderTestAdapter,
  options: TestRunOptions = {},
): Promise<TestRunSummary> => {
  const tests = await loadTestCases(filePath);
  const failures: TestRunSummary['failures'] = [];
  const normalizeLocation =
    adapter.normalizeLocation ?? ((value: string) => value);
  const resolveEventName = adapter.resolveEventName ?? resolveEventNameDefault;
  const verboseLevel = options.verboseLevel ?? 0;
  const plannedIndices = options.only
    ? Array.from(options.only)
        .filter((index) => index >= 0 && index < tests.length)
        .sort((a, b) => a - b)
    : Array.from({ length: tests.length }, (_, index) => index);
  const totalPlanned = plannedIndices.length;
  const totalStart = Date.now();
  const requestedWorkers = options.workers ?? 1;
  const workerCount =
    Number.isFinite(requestedWorkers) && requestedWorkers > 0
      ? Math.max(1, Math.floor(requestedWorkers))
      : 1;
  const activeWorkers =
    totalPlanned > 0 ? Math.min(workerCount, totalPlanned) : 1;

  const runSingleTest = async (
    index: number,
    position: number,
    workerId: number,
  ): Promise<void> => {
    const test = tests[index];
    const ordinal = position + 1;
    const failureMessages: string[] = [];
    const runStart = Date.now();

    if (verboseLevel >= 1) {
      console.log(`Running test ${ordinal}/${totalPlanned} (index ${index})`);
    }

    if (verboseLevel >= 2) {
      console.log(
        `Test ${index} input:\n${JSON.stringify(test.given, null, 2)}`,
      );
      console.log(
        `Test ${index} expected:\n${JSON.stringify(test.result, null, 2)}`,
      );
    }

    const normal = await adapter.run(test, 'normal', { index, workerId });
    const glitched = await adapter.run(test, 'glitched', { index, workerId });

    const debug = normal.debug;
    if (debug?.warnings && debug.warnings.length > 0) {
      for (const warning of debug.warnings) {
        console.warn(`[pathfinder-tests] Test ${index}: ${warning}`);
      }
    }

    if (verboseLevel >= 3) {
      if (debug?.settingsPatch) {
        console.log(
          `Test ${index} settings patch:\n${JSON.stringify(debug.settingsPatch, null, 2)}`,
        );
      }
      if (debug?.settingsWarnings && debug.settingsWarnings.length > 0) {
        console.log(
          `Test ${index} settings warnings: ${debug.settingsWarnings.join(', ')}`,
        );
      }
    }

    const normalReachable = normalizeSet(normal.reachable, normalizeLocation);
    const glitchedReachable = normalizeSet(
      glitched.reachable,
      normalizeLocation,
    );

    const expectedAvailable = test.result.available_locations ?? [];
    const missingExpectedNormal: string[] = [];
    for (const loc of expectedAvailable) {
      const normalized = normalizeLocation(loc);
      if (!normalReachable.has(normalized)) {
        failureMessages.push(`Expected reachable (normal): ${loc}`);
        missingExpectedNormal.push(loc);
      }
    }

    const expectedGlitched = test.result.available_locations_glitched ?? [];
    const missingExpectedGlitched: string[] = [];
    for (const loc of expectedGlitched) {
      const normalized = normalizeLocation(loc);
      if (!glitchedReachable.has(normalized)) {
        failureMessages.push(`Expected reachable (glitched): ${loc}`);
        missingExpectedGlitched.push(loc);
      }
    }

    const expectedUnavailable = test.result.unavailable_locations ?? [];
    const unexpectedNormal: string[] = [];
    const unexpectedGlitched: string[] = [];
    for (const loc of expectedUnavailable) {
      const normalized = normalizeLocation(loc);
      if (normalReachable.has(normalized)) {
        failureMessages.push(`Expected unreachable (normal): ${loc}`);
        unexpectedNormal.push(loc);
      }
      if (glitchedReachable.has(normalized)) {
        failureMessages.push(`Expected unreachable (glitched): ${loc}`);
        unexpectedGlitched.push(loc);
      }
    }

    const expectedEvents = test.result.event_raw ?? {};
    const eventUniverse = normal.eventNames ?? normal.events;
    const eventMapping: Array<[string, string | null]> = [];
    const eventMismatches: string[] = [];
    for (const [eventName, expectedValue] of Object.entries(expectedEvents)) {
      const resolved = resolveEventName(eventName, eventUniverse);
      eventMapping.push([eventName, resolved]);
      if (!resolved) {
        failureMessages.push(`Event not found in world: ${eventName}`);
        eventMismatches.push(`${eventName} (missing)`);
        continue;
      }
      const hasEvent = normal.events.has(resolved);
      if (expectedValue && !hasEvent) {
        failureMessages.push(`Expected event true: ${eventName}`);
        eventMismatches.push(`${eventName}: expected true, got false`);
      }
      if (!expectedValue && hasEvent) {
        failureMessages.push(`Expected event false: ${eventName}`);
        eventMismatches.push(`${eventName}: expected false, got true`);
      }
    }

    const testDuration = Date.now() - runStart;
    if (verboseLevel >= 1) {
      console.log(`Test ${index} runtime: ${formatDuration(testDuration)}`);
    }

    if (failureMessages.length > 0) {
      if (verboseLevel >= 1) {
        const itemsCount = test.given.items?.length ?? 0;
        const settingsCount = test.given.settings?.length ?? 0;
        const tricksCount = test.given.tricks?.length ?? 0;
        const entrancesCount = test.given.entrances?.length ?? 0;
        console.log(
          `Test ${index} failed (items=${itemsCount}, settings=${settingsCount}, tricks=${tricksCount}, entrances=${entrancesCount})`,
        );
      }

      if (verboseLevel >= 2) {
        console.log(
          `Test ${index} actual reachable (normal): ${formatList(normal.reachable)}`,
        );
        console.log(
          `Test ${index} actual reachable (glitched): ${formatList(glitched.reachable)}`,
        );
        console.log(
          `Test ${index} actual events (normal): ${formatList(normal.events)}`,
        );
        if (missingExpectedNormal.length > 0) {
          console.log(
            `Test ${index} missing expected (normal): ${missingExpectedNormal.join(', ')}`,
          );
        }
        if (missingExpectedGlitched.length > 0) {
          console.log(
            `Test ${index} missing expected (glitched): ${missingExpectedGlitched.join(', ')}`,
          );
        }
        if (unexpectedNormal.length > 0) {
          console.log(
            `Test ${index} unexpected reachable (normal): ${unexpectedNormal.join(', ')}`,
          );
        }
        if (unexpectedGlitched.length > 0) {
          console.log(
            `Test ${index} unexpected reachable (glitched): ${unexpectedGlitched.join(', ')}`,
          );
        }
        if (eventMismatches.length > 0) {
          console.log(
            `Test ${index} event mismatches: ${eventMismatches.join('; ')}`,
          );
        }
      }

      failures.push({
        index,
        messages: failureMessages,
      });
    } else if (verboseLevel >= 3) {
      console.log(
        `Test ${index} actual reachable (normal): ${formatList(normal.reachable)}`,
      );
      console.log(
        `Test ${index} actual reachable (glitched): ${formatList(glitched.reachable)}`,
      );
      console.log(
        `Test ${index} actual events (normal): ${formatList(normal.events)}`,
      );
    }

    if (verboseLevel >= 3) {
      if (normalReachable.size > 0) {
        console.log(
          `Test ${index} normalized reachable ids (normal): ${formatList(normalReachable)}`,
        );
      }
      if (glitchedReachable.size > 0) {
        console.log(
          `Test ${index} normalized reachable ids (glitched): ${formatList(glitchedReachable)}`,
        );
      }
      if (eventMapping.length > 0) {
        const mappingText = eventMapping
          .map(
            ([expected, resolved]) => `${expected} -> ${resolved ?? 'missing'}`,
          )
          .join(', ');
        console.log(`Test ${index} event mapping: ${mappingText}`);
      }
    }
  };

  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let workerId = 0; workerId < activeWorkers; workerId++) {
    workers.push(
      (async () => {
        while (true) {
          const position = cursor;
          cursor++;
          if (position >= plannedIndices.length) {
            return;
          }
          const index = plannedIndices[position];
          await runSingleTest(index, position, workerId);
        }
      })(),
    );
  }
  await Promise.all(workers);

  failures.sort((a, b) => a.index - b.index);

  const total = totalPlanned;
  const failed = failures.length;
  const passed = total - failed;

  if (verboseLevel >= 1) {
    const totalDuration = Date.now() - totalStart;
    console.log(`Total runtime: ${formatDuration(totalDuration)}`);
  }

  return { total, passed, failed, failures };
};
