import {
  runTestCases,
  resolveEventNameDefault,
  type PathfinderTestAdapter,
  type RunMode,
  type TestCase,
} from './core';

import * as LogicMod from '@ootmm/core/logic/index';
import * as PathfinderMod from '@ootmm/core/logic/pathfind';
import * as LocationsMod from '@ootmm/core/logic/locations';
import * as EntranceMod from '@ootmm/core/logic/entrance';
import * as ItemsMod from '@ootmm/core/items/index';
import * as MonitorMod from '@ootmm/core/monitor';
import * as SettingsMod from '@ootmm/core/settings/index';
import * as TricksMod from '@ootmm/core/settings/tricks';
import * as DataMod from '../ootmm_data_bridge';
import type { PlayerItem, PlayerItems } from '@ootmm/core/items/index';
import type { World } from '@ootmm/core/logic/world';

const nowMs = (): number => Number(process.hrtime.bigint()) / 1_000_000;
let timingLoggingEnabled = false;

const logTiming = (label: string, startMs: number) => {
  if (!timingLoggingEnabled) {
    return;
  }
  const elapsed = (nowMs() - startMs).toFixed(2);
  console.log(`[pathfinder-timing] ${label}: ${elapsed}ms`);
};

const resolveExport = <T>(mod: unknown, key: string): T =>
  (mod as Record<string, T>)?.[key] ??
  (mod as { default: Record<string, T> })?.default?.[key];

const worldState = resolveExport<typeof LogicMod.worldState>(
  LogicMod,
  'worldState',
);
const Pathfinder = resolveExport<typeof PathfinderMod.Pathfinder>(
  PathfinderMod,
  'Pathfinder',
);
const makeLocation = resolveExport<typeof LocationsMod.makeLocation>(
  LocationsMod,
  'makeLocation',
);
const Items = resolveExport<typeof ItemsMod.Items>(ItemsMod, 'Items');
const makePlayerItem = resolveExport<typeof ItemsMod.makePlayerItem>(
  ItemsMod,
  'makePlayerItem',
);
const itemByID = resolveExport<typeof ItemsMod.itemByID>(ItemsMod, 'itemByID');
const Monitor = resolveExport<typeof MonitorMod.Monitor>(MonitorMod, 'Monitor');
const makeSettings = resolveExport<typeof SettingsMod.makeSettings>(
  SettingsMod,
  'makeSettings',
);
const TRICKS = resolveExport<typeof SettingsMod.TRICKS>(SettingsMod, 'TRICKS');
const DEFAULT_TRICKS =
  resolveExport<typeof TricksMod.DEFAULT_TRICKS>(TricksMod, 'DEFAULT_TRICKS') ??
  [];

const _unusedDefaultTricks = DEFAULT_TRICKS;
const ENTRANCES =
  resolveExport<Record<string, unknown>>(DataMod, 'ENTRANCES') ?? {};
const POOL = resolveExport<Record<string, unknown>>(DataMod, 'POOL') ?? {};
const logicPassEntrances = resolveExport<typeof EntranceMod.logicPassEntrances>(
  EntranceMod,
  'logicPassEntrances',
);

type WorldContext = {
  settings: Record<string, unknown>;
  worlds: World[];
  pathfinder: InstanceType<typeof Pathfinder>;
  eventNames: Set<string>;
  settingsPatch: Record<string, unknown>;
  settingsWarnings: string[];
  silverRupeePlacements?: Map<string, PlayerItem>;
};

const MQ_DUNGEON_MAP: Record<string, string> = {
  DekuTree: 'DT',
  DodongoCavern: 'DC',
  JabuJabu: 'JJ',
  ForestTemple: 'Forest',
  FireTemple: 'Fire',
  WaterTemple: 'Water',
  SpiritTemple: 'Spirit',
  ShadowTemple: 'Shadow',
  BottomOfTheWell: 'BotW',
  IceCavern: 'IC',
  GerudoTrainingGrounds: 'GTG',
  GanonsCastle: 'Ganon',
};

const parseValueToken = (raw: string): string | number | boolean => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
};

const parseSettings = (
  tokens: string[],
): { patch: Record<string, unknown>; warnings: string[] } => {
  const patch: Record<string, unknown> = {};
  const warnings: string[] = [];
  const mqDungeons = new Set<string>();

  for (const token of tokens) {
    if (!token.startsWith('setting_')) {
      warnings.push(
        `Unknown setting token (missing setting_ prefix): ${token}`,
      );
      continue;
    }
    const body = token.slice('setting_'.length);
    const lastUnderscore = body.lastIndexOf('_');
    if (lastUnderscore === -1) {
      warnings.push(`Malformed setting token: ${token}`);
      continue;
    }
    const keyRaw = body.slice(0, lastUnderscore);
    const valueRaw = body.slice(lastUnderscore + 1);
    const value = parseValueToken(valueRaw);

    if (keyRaw.startsWith('mq_')) {
      const dungeonName = keyRaw.slice('mq_'.length);
      const dungeonCode = MQ_DUNGEON_MAP[dungeonName];
      if (!dungeonCode) {
        warnings.push(`Unknown MQ dungeon name: ${dungeonName}`);
        continue;
      }
      if (value === true) {
        mqDungeons.add(dungeonCode);
      } else if (value === false) {
        mqDungeons.delete(dungeonCode);
      } else {
        warnings.push(`MQ dungeon setting must be true/false: ${token}`);
      }
      continue;
    }

    patch[keyRaw] = value;
  }

  if (mqDungeons.size > 0) {
    patch.mqDungeons = {
      type: 'specific',
      values: Array.from(mqDungeons).sort(),
    };
  }

  return { patch, warnings };
};

const normalizeItems = (
  items: string[],
): { counts: Map<string, number>; unknownItems: string[] } => {
  const counts = new Map<string, number>();
  const unknownItems: string[] = [];
  let ootWalletLevel = 0;
  let mmWalletLevel = 0;
  let ootHookshotLevel = 0;
  let mmHookshotLevel = 0;
  let ootStrengthLevel = 0;
  let mmSwordLevel = 0;
  let mmClockLevel = 0;

  const medallions = [
    'OOT_MEDALLION_FOREST',
    'OOT_MEDALLION_FIRE',
    'OOT_MEDALLION_WATER',
    'OOT_MEDALLION_SPIRIT',
    'OOT_MEDALLION_SHADOW',
    'OOT_MEDALLION_LIGHT',
  ];

  const addCount = (id: string, count: number) => {
    if (count <= 0) return;
    counts.set(id, (counts.get(id) ?? 0) + count);
  };

  for (const token of items) {
    const [rawId, countRaw] = token.split(':');
    const count = countRaw ? Number(countRaw) : 1;
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }

    if (rawId.startsWith('OOT_WALLET')) {
      const suffix = rawId.slice('OOT_WALLET'.length);
      if (suffix === '') {
        ootWalletLevel = Math.max(ootWalletLevel, count);
      } else if (/^\d+$/.test(suffix)) {
        const level = Number(suffix) + 1;
        ootWalletLevel = Math.max(ootWalletLevel, level);
      } else {
        unknownItems.push(rawId);
      }
      continue;
    }

    if (rawId.startsWith('MM_WALLET')) {
      const suffix = rawId.slice('MM_WALLET'.length);
      if (suffix === '') {
        mmWalletLevel = Math.max(mmWalletLevel, count);
      } else if (/^\d+$/.test(suffix)) {
        const level = Number(suffix) + 1;
        mmWalletLevel = Math.max(mmWalletLevel, level);
      } else {
        unknownItems.push(rawId);
      }
      continue;
    }

    if (rawId === 'OOT_HOOKSHOT') {
      ootHookshotLevel = Math.max(ootHookshotLevel, 1);
      continue;
    }
    if (rawId === 'OOT_LONGSHOT') {
      ootHookshotLevel = Math.max(ootHookshotLevel, 2);
      continue;
    }
    if (rawId === 'MM_HOOKSHOT') {
      mmHookshotLevel = Math.max(mmHookshotLevel, 2);
      continue;
    }
    if (rawId === 'MM_LONGSHOT') {
      mmHookshotLevel = Math.max(mmHookshotLevel, 2);
      continue;
    }

    if (rawId === 'OOT_STRENGTH') {
      ootStrengthLevel = Math.max(ootStrengthLevel, Math.max(1, count));
      continue;
    }
    if (rawId.startsWith('OOT_STRENGTH')) {
      const suffix = rawId.slice('OOT_STRENGTH'.length);
      if (/^\d+$/.test(suffix)) {
        ootStrengthLevel = Math.max(ootStrengthLevel, Number(suffix));
        continue;
      }
    }

    if (rawId === 'MM_SWORD') {
      mmSwordLevel = Math.max(mmSwordLevel, Math.max(1, count));
      continue;
    }
    if (rawId === 'MM_SWORD_KOKIRI') {
      mmSwordLevel = Math.max(mmSwordLevel, 1);
      continue;
    }
    if (rawId === 'MM_SWORD_RAZOR') {
      mmSwordLevel = Math.max(mmSwordLevel, 2);
      continue;
    }
    if (rawId === 'MM_SWORD_GILDED') {
      mmSwordLevel = Math.max(mmSwordLevel, 3);
      continue;
    }

    if (rawId.startsWith('MM_CLOCK')) {
      const suffix = rawId.slice('MM_CLOCK'.length);
      if (suffix === '') {
        mmClockLevel = Math.max(mmClockLevel, count);
      } else if (/^\d+$/.test(suffix)) {
        mmClockLevel = Math.max(mmClockLevel, Number(suffix));
      } else {
        unknownItems.push(rawId);
      }
      continue;
    }

    if (rawId === 'OOT_LIGHT_ARROWS') {
      addCount('OOT_ARROW_LIGHT', count);
      continue;
    }

    if (rawId === 'OOT_MEDALLION') {
      const total = Math.min(Math.floor(count), medallions.length);
      for (let i = 0; i < total; i++) {
        addCount(medallions[i], 1);
      }
      continue;
    }

    addCount(rawId, count);
  }

  if (ootWalletLevel > 0) {
    addCount('OOT_WALLET', ootWalletLevel);
  }
  if (mmWalletLevel > 0) {
    addCount('MM_WALLET', mmWalletLevel);
  }
  if (ootHookshotLevel > 0) {
    addCount('OOT_HOOKSHOT', ootHookshotLevel);
  }
  if (mmHookshotLevel > 0) {
    addCount('MM_HOOKSHOT', mmHookshotLevel);
  }
  if (ootStrengthLevel > 0) {
    addCount('OOT_STRENGTH', ootStrengthLevel);
  }
  if (mmSwordLevel > 0) {
    addCount('MM_SWORD', mmSwordLevel);
  }
  if (mmClockLevel > 0) {
    addCount('MM_CLOCK', mmClockLevel);
  }

  return { counts, unknownItems };
};

const buildPlayerItems = (
  items: Map<string, number>,
): { playerItems: PlayerItems; unknownItems: string[] } => {
  const playerItems: PlayerItems = new Map();
  const cache = new Map<string, PlayerItem>();
  const unknownItems: string[] = [];

  for (const [itemId, count] of items) {
    let item = (Items as Record<string, unknown>)[itemId];
    if (!item) {
      try {
        item = itemByID(itemId);
      } catch {
        item = undefined;
      }
    }
    if (!item) {
      unknownItems.push(itemId);
      continue;
    }
    const cacheKey = item.id;
    let playerItem = cache.get(cacheKey);
    if (!playerItem) {
      playerItem = makePlayerItem(item, 0);
      cache.set(cacheKey, playerItem);
    }
    const prev = playerItems.get(playerItem) ?? 0;
    playerItems.set(playerItem, prev + count);
  }

  return { playerItems, unknownItems };
};

const buildSilverRupeePlacements = (): Map<string, PlayerItem> => {
  const placements = new Map<string, PlayerItem>();
  const poolEntries: Array<{ entry: unknown; game: 'oot' | 'mm' }> = [];

  if (Array.isArray(POOL?.oot)) {
    for (const entry of POOL.oot) {
      poolEntries.push({ entry, game: 'oot' });
    }
  }
  if (Array.isArray(POOL?.mm)) {
    for (const entry of POOL.mm) {
      poolEntries.push({ entry, game: 'mm' });
    }
  }

  for (const { entry, game } of poolEntries) {
    if ((entry as { type?: string }).type !== 'sr') continue;
    const locationName = (entry as { location?: string }).location;
    const itemId = (entry as { item?: string }).item;
    if (!locationName || !itemId) continue;
    const locationWithPrefix =
      locationName.startsWith('OOT ') || locationName.startsWith('MM ')
        ? locationName
        : `${game === 'mm' ? 'MM' : 'OOT'} ${locationName}`;
    const prefixed = game === 'mm' ? `MM_${itemId}` : `OOT_${itemId}`;
    let item =
      (Items as Record<string, unknown>)[prefixed] ??
      (Items as Record<string, unknown>)[itemId];
    if (!item) {
      try {
        item = itemByID(prefixed);
      } catch {
        try {
          item = itemByID(itemId);
        } catch {
          item = undefined;
        }
      }
    }
    if (!item) continue;
    const loc = makeLocation(locationWithPrefix, 0);
    placements.set(loc, makePlayerItem(item, 0));
  }

  return placements;
};

const silverRupeePlacements = buildSilverRupeePlacements();

const collectEventNames = (worlds: World[]): Set<string> => {
  const events = new Set<string>();
  for (const world of worlds) {
    for (const area of Object.values(world.areas)) {
      for (const eventName of Object.keys(area.events)) {
        events.add(eventName);
      }
    }
  }
  return events;
};

const normalizeLocationId = (locationId: string): string => {
  const atIndex = locationId.lastIndexOf('@');
  if (atIndex === -1) return locationId;
  return locationId.slice(0, atIndex);
};

const nonGlitchTricks = Object.entries(TRICKS ?? {})
  .filter((entry) => !entry[1]?.glitch)
  .map((entry) => entry[0]);

const contextCache = new Map<string, WorldContext>();

const getContext = async (
  settingsTokens: string[],
  tricks: string[],
  entranceOverrides?: Record<string, string>,
): Promise<WorldContext> => {
  const contextStart = nowMs();
  const settingsKey = JSON.stringify(settingsTokens);
  const tricksKey = JSON.stringify(tricks);
  const overridesKey = entranceOverrides
    ? JSON.stringify(Object.entries(entranceOverrides).sort())
    : '';
  const cacheKey = `${settingsKey}::${tricksKey}::${overridesKey}`;
  const cached = contextCache.get(cacheKey);
  if (cached) {
    logTiming('getContext (cache hit)', contextStart);
    return cached;
  }

  const parseStart = nowMs();
  const { patch, warnings } = parseSettings(settingsTokens);
  if (
    !settingsTokens.some((token) => token.startsWith('setting_childWallets_'))
  ) {
    patch.childWallets = true;
  }
  logTiming('getContext parse settings', parseStart);

  const plando = entranceOverrides
    ? { entrances: entranceOverrides }
    : undefined;
  const settingsStart = nowMs();
  const settings = makeSettings({
    ...patch,
    ...(plando ? { plando } : {}),
    tricks,
  });
  logTiming('getContext makeSettings', settingsStart);

  const monitor = new Monitor(
    {
      onLog: () => {},
      onProgress: () => {},
      onWarn: () => {},
    },
    false,
  );

  const opts = {
    settings,
    seed: 'PATHFINDER_TESTS',
    settingsLog: null,
    mode: 'seed' as const,
    cosmetics: {},
    random: {},
  };

  const worldStateStart = nowMs();
  const worldData = await worldState(monitor, opts as Record<string, unknown>);
  logTiming('getContext worldState', worldStateStart);
  const entranceInput = entranceOverrides
    ? { ...worldData, settings: { ...settings, logic: 'none' } }
    : worldData;
  const entranceStart = nowMs();
  const entranceResult = logicPassEntrances(
    entranceInput as Record<string, unknown>,
  );
  logTiming('getContext entrance pass', entranceStart);
  const worlds = entranceResult.worlds;
  const pathfinderStart = nowMs();
  const pathfinder = new Pathfinder(worlds, settings, new Map());
  logTiming('getContext pathfinder init', pathfinderStart);
  const eventsStart = nowMs();
  const eventNames = collectEventNames(worlds);
  logTiming('getContext collect events', eventsStart);

  const context: WorldContext = {
    settings,
    worlds,
    pathfinder,
    eventNames,
    settingsPatch: patch,
    settingsWarnings: warnings,
    silverRupeePlacements:
      settings.silverRupeeShuffle === 'vanilla'
        ? silverRupeePlacements
        : undefined,
  };
  contextCache.set(cacheKey, context);
  logTiming('getContext total (cache miss)', contextStart);
  return context;
};

const findEntranceByAreas = (
  fromArea: string,
  toArea: string,
): string | null => {
  for (const [key, value] of Object.entries(ENTRANCES)) {
    const entry = value as { from?: string; to?: string };
    if (entry.from === fromArea && entry.to === toArea) {
      return key;
    }
  }
  return null;
};

const findEntranceByToArea = (toArea: string): string | null => {
  for (const [key, value] of Object.entries(ENTRANCES)) {
    const entry = value as { to?: string };
    if (entry.to === toArea) {
      return key;
    }
  }
  return null;
};

const buildEntranceOverrides = (
  entries: TestCase['given']['entrances'],
): {
  overrides: Record<string, string> | null;
  warnings: string[];
} => {
  if (!entries || entries.length === 0) {
    return { overrides: null, warnings: [] };
  }
  const overrides: Record<string, string> = {};
  const warnings: string[] = [];

  for (const entry of entries) {
    const src = findEntranceByAreas(entry.from, entry.to);
    if (!src) {
      warnings.push(`Unknown entrance from ${entry.from} to ${entry.to}`);
      continue;
    }
    const targetArea = entry.capture_to ?? entry.to;
    const dst = findEntranceByToArea(targetArea);
    if (!dst) {
      warnings.push(`Unknown entrance destination area: ${targetArea}`);
      continue;
    }
    overrides[src] = dst;
  }

  return { overrides, warnings };
};

const runCase = async (test: TestCase, mode: RunMode) => {
  const caseStart = nowMs();
  const warnings: string[] = [];
  const settingsTokens = test.given.settings ?? [];
  const baseTricks = test.given.tricks ?? [];
  const trickSet = new Set(baseTricks);
  if (mode === 'glitched') {
    for (const trick of nonGlitchTricks) {
      trickSet.add(trick);
    }
  }
  const tricks = Array.from(trickSet);

  const entranceResult = buildEntranceOverrides(test.given.entrances);
  warnings.push(...entranceResult.warnings);
  const entranceOverrides = entranceResult.overrides;
  const contextStart = nowMs();
  const context = await getContext(
    settingsTokens,
    tricks,
    entranceOverrides ?? undefined,
  );
  logTiming('runCase getContext', contextStart);
  if (context.settingsWarnings.length > 0) {
    warnings.push(...context.settingsWarnings);
  }
  const itemsStart = nowMs();
  const { counts: itemCounts, unknownItems: normalizedUnknown } =
    normalizeItems(test.given.items ?? []);
  const { playerItems: assumedItems, unknownItems: buildUnknown } =
    buildPlayerItems(itemCounts);
  logTiming('runCase build items', itemsStart);
  const unknownItems = [...normalizedUnknown, ...buildUnknown];
  if (unknownItems.length > 0) {
    warnings.push(`Unknown items: ${unknownItems.join(', ')}`);
  }

  const pathfinderStart = nowMs();
  let state = context.pathfinder.run(null, {
    assumedItems,
    items: context.silverRupeePlacements,
    recursive: true,
    inPlace: false,
  });
  logTiming('runCase pathfinder initial', pathfinderStart);

  const overrides = test.given.events ?? {};
  if (Object.keys(overrides).length > 0) {
    for (const [eventName, value] of Object.entries(overrides)) {
      if (!value) continue;
      const resolved = resolveEventNameDefault(eventName, context.eventNames);
      if (!resolved) {
        warnings.push(`Unknown event override: ${eventName}`);
        continue;
      }
      state.ws[0].newEvents.add(resolved);
    }
    const pathfinderOverrideStart = nowMs();
    state = context.pathfinder.run(state, {
      assumedItems,
      items: context.silverRupeePlacements,
      recursive: true,
      inPlace: true,
    });
    logTiming('runCase pathfinder override', pathfinderOverrideStart);
  }

  const resultsStart = nowMs();
  const reachable = new Set<string>();
  for (const loc of state.locations) {
    reachable.add(String(loc));
  }

  const events = new Set<string>(state.ws[0].events);
  logTiming('runCase collect results', resultsStart);
  logTiming('runCase total', caseStart);

  return {
    reachable,
    events,
    eventNames: context.eventNames,
    debug: {
      settingsPatch: context.settingsPatch,
      settingsWarnings: context.settingsWarnings,
      warnings,
    },
  };
};

const adapter: PathfinderTestAdapter = {
  name: 'ootmm',
  run: (test, mode, meta) => {
    const _unusedMeta = meta;
    return runCase(test, mode);
  },
  normalizeLocation: normalizeLocationId,
  resolveEventName: resolveEventNameDefault,
};

const parseOnlyList = (
  raw: string,
): { indices: number[]; warnings: string[] } => {
  const warnings: string[] = [];
  const indices = new Set<number>();
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      indices.add(Number(part));
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start > end) {
        warnings.push(`Invalid range (start > end): ${part}`);
        continue;
      }
      for (let i = start; i <= end; i++) {
        indices.add(i);
      }
      continue;
    }
    warnings.push(`Invalid index token: ${part}`);
  }

  return { indices: Array.from(indices).sort((a, b) => a - b), warnings };
};

const printHelp = (): void => {
  console.log(
    'Usage: tsx scripts/pathfinder-tests/run_ootmm.ts [options] [file]',
  );
  console.log('Options:');
  console.log('  -h, --help           Show this help and exit');
  console.log('  -d, --debug          Enable pathfinder timing logs');
  console.log('  -v, -vv, -vvv        Increase verbosity');
  console.log(
    '  --only <list>        Only run specified test indices (e.g. 1,3-5)',
  );
  console.log('  --only=<list>        Same as above');
  console.log(
    'If file is omitted, defaults to tests/pathfinder/tests_silke.jsonc',
  );
};

const main = async () => {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let onlyRaw: string | undefined;
  let verboseLevel = 0;
  let debugTiming = false;
  const warnings: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (/^-v+$/.test(arg)) {
      verboseLevel = Math.max(verboseLevel, arg.length - 1);
      continue;
    }
    if (arg === '-d' || arg === '--debug') {
      debugTiming = true;
      continue;
    }
    if (arg === '--only') {
      onlyRaw = args[i + 1];
      if (!onlyRaw) {
        warnings.push('Missing value for --only');
      } else {
        i++;
      }
      continue;
    }
    if (arg.startsWith('--only=')) {
      onlyRaw = arg.slice('--only='.length);
      if (onlyRaw.length === 0) {
        warnings.push('Missing value for --only');
      }
      continue;
    }
    if (arg.startsWith('-')) {
      warnings.push(`Unknown flag: ${arg}`);
      continue;
    }
    if (!filePath) {
      filePath = arg;
      continue;
    }
    warnings.push(`Unexpected argument: ${arg}`);
  }

  const resolvedPath = filePath ?? 'tests/pathfinder/tests_silke.jsonc';
  timingLoggingEnabled = debugTiming || verboseLevel >= 1;
  let onlySet: Set<number> | undefined;
  if (onlyRaw) {
    const parsed = parseOnlyList(onlyRaw);
    warnings.push(...parsed.warnings);
    onlySet = new Set(parsed.indices);
  }

  for (const warning of warnings) {
    console.warn(`[pathfinder-tests] ${warning}`);
  }

  const summary = await runTestCases(resolvedPath, adapter, {
    only: onlySet,
    verboseLevel,
  });

  if (summary.failed === 0) {
    console.log(
      `[pathfinder-tests:${adapter.name}] ${summary.passed}/${summary.total} passed`,
    );
    return;
  }

  console.log(
    `[pathfinder-tests:${adapter.name}] ${summary.failed}/${summary.total} failed`,
  );
  for (const failure of summary.failures) {
    console.log(`Test ${failure.index}:`);
    for (const message of failure.messages) {
      console.log(`  - ${message}`);
    }
  }
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
