import {
  runTestCases,
  resolveEventNameDefault,
  type PathfinderTestAdapter,
  type RunMode,
  type TestCase,
} from './core';
import os from 'node:os';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as SettingsMod from '@ootmm/core/settings/index';

type CliOptions = {
  filePath: string;
  onlySet?: Set<number>;
  verboseLevel: number;
  warnings: string[];
  headed: boolean;
  url: string;
};

type PageResult = {
  reachable: string[];
  events: string[];
  eventNames: string[];
  warnings: string[];
};

type RunContext = {
  warnings: string[];
  settingsPatch: Record<string, unknown>;
  settingsWarnings: string[];
};

const resolveExport = <T,>(mod: unknown, key: string): T =>
  (mod as Record<string, T>)?.[key] ??
  (mod as { default: Record<string, T> })?.default?.[key];

const TRICKS = resolveExport<Record<string, { glitch?: boolean }>>(SettingsMod, 'TRICKS') ?? {};

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

const nonGlitchTricks = Object.entries(TRICKS)
  .filter((entry) => !entry[1]?.glitch)
  .map((entry) => entry[0]);

const nowMs = (): number => Number(process.hrtime.bigint()) / 1_000_000;
const formatMs = (startMs: number): string => `${(nowMs() - startMs).toFixed(1)}ms`;

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
      warnings.push(`Unknown setting token (missing setting_ prefix): ${token}`);
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

  if (
    !tokens.some((token) => token.startsWith('setting_childWallets_')) &&
    !Object.prototype.hasOwnProperty.call(patch, 'childWallets')
  ) {
    patch.childWallets = true;
  }

  return { patch, warnings };
};

const normalizeItemsForUi = (
  items: string[],
): { counts: Map<string, number>; warnings: string[] } => {
  const counts = new Map<string, number>();
  const warnings: string[] = [];
  let ootWalletLevel = 0;
  let mmWalletLevel = 0;
  let ootHookshotLevel = 0;
  let mmHookshotLevel = 0;
  let ootStrengthLevel = 0;
  let mmSwordLevel = 0;

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
      warnings.push(`Invalid item count token: ${token}`);
      continue;
    }

    if (rawId.startsWith('OOT_WALLET')) {
      const suffix = rawId.slice('OOT_WALLET'.length);
      if (suffix === '') {
        ootWalletLevel = Math.max(ootWalletLevel, count);
      } else if (/^\d+$/.test(suffix)) {
        ootWalletLevel = Math.max(ootWalletLevel, Number(suffix) + 1);
      } else {
        warnings.push(`Unknown OOT wallet token: ${rawId}`);
      }
      continue;
    }

    if (rawId.startsWith('MM_WALLET')) {
      const suffix = rawId.slice('MM_WALLET'.length);
      if (suffix === '') {
        mmWalletLevel = Math.max(mmWalletLevel, count);
      } else if (/^\d+$/.test(suffix)) {
        mmWalletLevel = Math.max(mmWalletLevel, Number(suffix) + 1);
      } else {
        warnings.push(`Unknown MM wallet token: ${rawId}`);
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
      mmHookshotLevel = Math.max(mmHookshotLevel, 1);
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

  if (ootWalletLevel > 0) addCount('OOT_WALLET', ootWalletLevel);
  if (mmWalletLevel > 0) addCount('MM_WALLET', mmWalletLevel);
  if (ootHookshotLevel > 0) addCount('OOT_HOOKSHOT', ootHookshotLevel);
  if (mmHookshotLevel > 0) addCount('MM_HOOKSHOT', mmHookshotLevel);
  if (ootStrengthLevel > 0) addCount('OOT_STRENGTH', ootStrengthLevel);
  if (mmSwordLevel > 0) addCount('MM_SWORD', mmSwordLevel);

  return { counts, warnings };
};

const normalizeLocationId = (locationId: string): string => {
  const atIndex = locationId.lastIndexOf('@');
  if (atIndex === -1) return locationId;
  return locationId.slice(0, atIndex);
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
      for (let i = start; i <= end; i++) indices.add(i);
      continue;
    }
    warnings.push(`Invalid index token: ${part}`);
  }

  return { indices: Array.from(indices).sort((a, b) => a - b), warnings };
};

class WebRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private readonly url: string, private readonly headed: boolean) {}

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async runTest(test: TestCase, mode: RunMode, meta: { index: number }): Promise<{
    reachable: Set<string>;
    events: Set<string>;
    eventNames: Set<string>;
    debug: {
      settingsPatch: Record<string, unknown>;
      settingsWarnings: string[];
      warnings: string[];
    };
  }> {
    const runStart = nowMs();
    const warnings: string[] = [];
    const page = await this.ensurePage();
    await this.resetToCleanState(page);

    const { patch: settingsPatch, warnings: settingsWarnings } = parseSettings(test.given.settings ?? []);
    warnings.push(...settingsWarnings);
    const context: RunContext = {
      warnings,
      settingsPatch,
      settingsWarnings,
    };

    await this.applySettingsViaUi(page, settingsPatch, context);

    const baseTricks = test.given.tricks ?? [];
    const trickSet = new Set(baseTricks);
    if (mode === 'glitched') {
      for (const trick of nonGlitchTricks) {
        trickSet.add(trick);
      }
    }
    await this.applyTricksViaStore(page, Array.from(trickSet).sort(), context);

    await page.getByTestId('tab-items').click();
    await this.waitForReachableReady(page);

    const { counts, warnings: itemWarnings } = normalizeItemsForUi(test.given.items ?? []);
    warnings.push(...itemWarnings);
    await this.clickItems(page, counts, context);

    const pageResult = await this.readResultFromPage(page, test.given.events ?? {});
    warnings.push(...pageResult.warnings);

    console.log(
      `[pathfinder-tests:web] test ${meta.index} (${mode}) finished in ${formatMs(runStart)} ` +
        `(reachable=${pageResult.reachable.length}, events=${pageResult.events.length})`,
    );

    return {
      reachable: new Set(pageResult.reachable),
      events: new Set(pageResult.events),
      eventNames: new Set(pageResult.eventNames),
      debug: {
        settingsPatch,
        settingsWarnings,
        warnings,
      },
    };
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    this.browser = await chromium.launch({ headless: !this.headed });
    this.context = await this.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    this.page = await this.context.newPage();
    return this.page;
  }

  private async resetToCleanState(page: Page): Promise<void> {
    await page.goto(this.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForBoot(page);
  }

  private async waitForBoot(page: Page): Promise<void> {
    await page.getByRole('heading', { name: 'The Last Tracker' }).waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('pack-select').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('pack-select').selectOption('ootmm');
    await this.waitForReachableReady(page);
  }

  private async ensureStatsExpanded(page: Page): Promise<void> {
    const toggle = page.locator('.stats-collapse-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 15_000 });
    const expanded = await toggle.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await toggle.click();
    }
    await page.getByTestId('stats-reachable-value').waitFor({ state: 'visible', timeout: 15_000 });
  }

  private async waitForReachableReady(page: Page): Promise<void> {
    await this.ensureStatsExpanded(page);
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="stats-reachable-value"]');
      const raw = el?.textContent ?? '';
      const match = raw.match(/(\d+)\s*\/\s*(\d+)/);
      if (!match) return false;
      return Number(match[2]) > 0;
    }, { timeout: 15_000 });
  }

  private async applySettingsViaUi(
    page: Page,
    settingsPatch: Record<string, unknown>,
    context: RunContext,
  ): Promise<void> {
    await page.getByTestId('tab-settings').click();
    const searchInput = page.getByTestId('settings-search-input');
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 });
    // Clear search to ensure all settings are visible
    await searchInput.fill('');

    const unsupportedPatch: Record<string, unknown> = {};
    const entries = Object.entries(settingsPatch).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [key, value] of entries) {
      // Try to find the input directly first
      let input = page.getByTestId(`setting-input-${key}`);
      
      // If finding fails (e.g. not rendered or filtered out), check if we need to search
      if ((await input.count()) === 0) {
        // Try searching for the specific setting
        await searchInput.fill(key);
        input = page.getByTestId(`setting-input-${key}`);
        
        if ((await input.count()) === 0) {
          unsupportedPatch[key] = value;
          context.warnings.push(`Setting not exposed in settings tab: ${key}`);
          // Clear search before proceeding to next setting
          await searchInput.fill('');
          continue;
        }
      }

      const control = input.first();
      // Wait for element to be attached to DOM
      await control.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
      
      const kind = await control.evaluate((el) => {
        const htmlEl = el as HTMLInputElement | HTMLSelectElement;
        return {
          tagName: el.tagName.toLowerCase(),
          type: 'type' in htmlEl ? htmlEl.type : '',
        };
      });

      try {
        if (kind.tagName === 'input' && kind.type === 'checkbox') {
          await control.setChecked(Boolean(value));
          // Clear search if we had to use it
          if ((await searchInput.inputValue()) !== '') {
            await searchInput.fill('');
          }
          continue;
        }
        if (kind.tagName === 'select') {
          if (typeof value === 'object' && value !== null) {
            unsupportedPatch[key] = value;
            context.warnings.push(`Cannot map complex setting value to select input: ${key}`);
            if ((await searchInput.inputValue()) !== '') {
              await searchInput.fill('');
            }
            continue;
          }
          await control.selectOption(String(value));
          if ((await searchInput.inputValue()) !== '') {
            await searchInput.fill('');
          }
          continue;
        }
        if (kind.tagName === 'input' && kind.type === 'number') {
          if (typeof value === 'number' && Number.isFinite(value)) {
            await control.fill(String(value));
          } else {
            unsupportedPatch[key] = value;
            context.warnings.push(`Cannot map non-numeric value to number input: ${key}`);
          }
          if ((await searchInput.inputValue()) !== '') {
            await searchInput.fill('');
          }
          continue;
        }
        if (kind.tagName === 'input' && (kind.type === 'text' || kind.type === 'search')) {
          await control.fill(String(value));
          if ((await searchInput.inputValue()) !== '') {
            await searchInput.fill('');
          }
          continue;
        }

        unsupportedPatch[key] = value;
        context.warnings.push(`Unsupported settings control for ${key}: ${kind.tagName}/${kind.type}`);
      } catch (error) {
        unsupportedPatch[key] = value;
        context.warnings.push(
          `Failed to set setting ${key} in UI: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      
      // Clear search if we had to use it
      if ((await searchInput.inputValue()) !== '') {
        await searchInput.fill('');
      }
    }

    await searchInput.fill('');
    await this.clickApplySettings(page);

    if (Object.keys(unsupportedPatch).length > 0) {
      await this.applySettingsPatchViaStore(page, unsupportedPatch, context);
    }
  }

  private async clickApplySettings(page: Page): Promise<void> {
    const applyButton = page.getByTestId('apply-settings-button');
    await applyButton.waitFor({ state: 'visible', timeout: 30_000 });
    await applyButton.click();
    const overlay = page.getByTestId('applying-settings-overlay');
    try {
      await overlay.waitFor({ state: 'visible', timeout: 10_000 });
    } catch {
      // Overlay may be very brief if no effective change; still wait for hidden below.
    }
    await overlay.waitFor({ state: 'hidden', timeout: 60_000 });
    await this.waitForReachableReady(page);
  }

  private async applySettingsPatchViaStore(
    page: Page,
    patch: Record<string, unknown>,
    context: RunContext,
  ): Promise<void> {
    const response = await page.evaluate(async (settingsPatch) => {
      const root = document.querySelector('.ootmm-tracker') as { __vueParentComponent?: unknown } | null;
      const component = (root as { __vueParentComponent?: { setupState?: Record<string, unknown> } } | null)
        ?.__vueParentComponent;
      const sessionStore = component?.setupState?.sessionStore as {
        trackerSettings?: Record<string, unknown>;
        applySettings?: (settings: Record<string, unknown>) => Promise<void>;
      } | undefined;
      if (!sessionStore || typeof sessionStore.applySettings !== 'function') {
        return { ok: false, message: 'Session store unavailable' };
      }
      const nextSettings = {
        ...(sessionStore.trackerSettings ?? {}),
        ...settingsPatch,
      };
      await sessionStore.applySettings(nextSettings);
      return { ok: true as const };
    }, patch);

    if (!response.ok) {
      context.warnings.push(`Failed to apply fallback settings patch: ${response.message}`);
      return;
    }

    await this.waitForReachableReady(page);
  }

  private async applyTricksViaStore(
    page: Page,
    tricks: string[],
    context: RunContext,
  ): Promise<void> {
    const needsApply = await page.evaluate((nextTricks) => {
      const root = document.querySelector('.ootmm-tracker') as { __vueParentComponent?: unknown } | null;
      const component = (root as { __vueParentComponent?: { setupState?: Record<string, unknown> } } | null)
        ?.__vueParentComponent;
      const sessionStore = component?.setupState?.sessionStore as {
        trackerSettings?: Record<string, unknown>;
      } | undefined;
      if (!sessionStore) return false;
      const current = Array.isArray(sessionStore.trackerSettings?.tricks)
        ? (sessionStore.trackerSettings?.tricks as string[]).slice().sort()
        : [];
      if (current.length !== nextTricks.length) return true;
      for (let i = 0; i < current.length; i++) {
        if (current[i] !== nextTricks[i]) return true;
      }
      return false;
    }, tricks);

    if (!needsApply) {
      return;
    }

    const response = await page.evaluate(async (nextTricks) => {
      const root = document.querySelector('.ootmm-tracker') as { __vueParentComponent?: unknown } | null;
      const component = (root as { __vueParentComponent?: { setupState?: Record<string, unknown> } } | null)
        ?.__vueParentComponent;
      const sessionStore = component?.setupState?.sessionStore as {
        trackerSettings?: Record<string, unknown>;
        applySettings?: (settings: Record<string, unknown>) => Promise<void>;
      } | undefined;
      if (!sessionStore || typeof sessionStore.applySettings !== 'function') {
        return { ok: false, message: 'Session store unavailable' };
      }

      const nextSettings = {
        ...(sessionStore.trackerSettings ?? {}),
        tricks: nextTricks,
      };
      await sessionStore.applySettings(nextSettings);
      return { ok: true as const };
    }, tricks);

    if (!response.ok) {
      context.warnings.push(`Failed to apply tricks through store: ${response.message}`);
      return;
    }

    await this.waitForReachableReady(page);
  }

  private async clickItems(
    page: Page,
    counts: Map<string, number>,
    context: RunContext,
  ): Promise<void> {
    const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [itemId, count] of entries) {
      const icon = page.locator(`img.item-icon[alt="${itemId}"]`).first();
      if ((await icon.count()) === 0) {
        context.warnings.push(`Item not present in grid UI: ${itemId}`);
        continue;
      }

      for (let i = 0; i < count; i++) {
        await icon.click({ force: true, timeout: 60000 });
      }
    }

    await this.waitForReachableReady(page);
  }

  private async readResultFromPage(
    page: Page,
    eventOverrides: Record<string, boolean>,
  ): Promise<PageResult> {
    const funcBody = `
      const warnings = [];
      const root = document.querySelector('.ootmm-tracker');
      const component = root?.__vueParentComponent;
      const sessionStore = component?.setupState?.sessionStore;

      if (!sessionStore) {
        return {
          reachable: [],
          events: [],
          eventNames: [],
          warnings: ['Session store unavailable while reading results'],
        };
      }

      const tracker = sessionStore.tracker;

      const eventNames = new Set();
      for (const world of tracker?.worlds ?? []) {
        for (const area of Object.values(world.areas ?? {})) {
          for (const eventName of Object.keys(area.events ?? {})) {
            eventNames.add(eventName);
          }
        }
      }

      function resolveEventName(expected, events) {
        const candidates = [];
        function pushUnique(value) {
          if (!candidates.includes(value)) candidates.push(value);
        }

        pushUnique(expected);
        if (expected.startsWith('EVENT_')) pushUnique(expected.slice('EVENT_'.length));
        if (expected.startsWith('OOT_') || expected.startsWith('MM_')) {
          pushUnique(expected.slice(4));
        }
        if (expected.startsWith('EVENT_OOT_')) {
          pushUnique(expected.slice('EVENT_OOT_'.length));
          pushUnique('OOT_' + expected.slice('EVENT_OOT_'.length));
        }
        if (expected.startsWith('EVENT_MM_')) {
          pushUnique(expected.slice('EVENT_MM_'.length));
          pushUnique('MM_' + expected.slice('EVENT_MM_'.length));
        }
        if (!expected.startsWith('OOT_') && events.has('OOT_' + expected)) {
          pushUnique('OOT_' + expected);
        }
        if (!expected.startsWith('MM_') && events.has('MM_' + expected)) {
          pushUnique('MM_' + expected);
        }

        for (const candidate of candidates) {
          if (events.has(candidate)) return candidate;
        }
        return null;
      }

      let reachable = Array.isArray(sessionStore.reachableLocationIds)
        ? [...sessionStore.reachableLocationIds]
        : [];
      let events = [];

      const inventoryMap = sessionStore.inventoryMap;
      if (tracker && tracker.runPathfinder && inventoryMap instanceof Map) {
        const pathfinderResult = tracker.runPathfinder(inventoryMap);
        let state = pathfinderResult?.state;

        const positiveOverrides = Object.entries(overrides).filter((entry) => entry[1] === true);
        if (
          positiveOverrides.length > 0 &&
          state?.ws?.[0]?.newEvents instanceof Set &&
          tracker.pathfinder?.run &&
          tracker.buildPlayerItemsFromInventory
        ) {
          let added = false;
          const eventUniverse = new Set(eventNames);
          const currentEvents = state.ws[0].events instanceof Set
            ? state.ws[0].events
            : new Set();
          for (const eventName of currentEvents) {
            eventUniverse.add(eventName);
          }
          for (const [eventName] of positiveOverrides) {
            const resolved = resolveEventName(eventName, eventUniverse);
            if (!resolved) {
              warnings.push('Unknown event override: ' + eventName);
              continue;
            }
            state.ws[0].newEvents.add(resolved);
            added = true;
          }

          if (added) {
            const assumedItems = tracker.buildPlayerItemsFromInventory(inventoryMap);
            state = tracker.pathfinder.run(state, {
              assumedItems,
              recursive: true,
              inPlace: true,
              gossips: true,
            });

            const visibleLocationIdSet = new Set(
              Array.isArray(sessionStore.allLocations)
                ? sessionStore.allLocations.map((location) => String(location.id))
                : [],
            );
            const rawLocations = state?.locations ? Array.from(state.locations, (loc) => String(loc)) : [];
            reachable = rawLocations.filter((loc) => visibleLocationIdSet.has(loc));
          }
        }

        if (state?.ws?.[0]?.events instanceof Set) {
          events = Array.from(state.ws[0].events, (eventName) => String(eventName));
        }
      }

      return {
        reachable: Array.from(new Set(reachable)),
        events: Array.from(new Set(events)),
        eventNames: Array.from(eventNames),
        warnings,
      };
    `;

    return page.evaluate(({ body, overrides }) => {
      // eslint-disable-next-line no-new-func
      const func = new Function('overrides', body);
      return func(overrides);
    }, { body: funcBody, overrides: eventOverrides });
  }
}

const printHelp = (): void => {
  console.log('Usage: tsx scripts/pathfinder-tests/run_silke_playwright.ts [options] [file]');
  console.log('Options:');
  console.log('  -h, --help           Show this help and exit');
  console.log('  -v, -vv, -vvv        Increase verbosity');
  console.log('  --only <list>        Only run specified test indices (e.g. 1,3-5)');
  console.log('  --only=<list>        Same as above');
  console.log('  --url <url>          App URL (default: http://localhost:5173/)');
  console.log('  --url=<url>          Same as above');
  console.log('  --headed             Run browser headed');
  console.log('If file is omitted, defaults to tests_silke.jsonc');
};

const parseCli = (): CliOptions => {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let onlyRaw: string | undefined;
  let verboseLevel = 0;
  const warnings: string[] = [];
  let headed = false;
  let url = 'http://localhost:5173/';

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
    if (arg === '--headed') {
      headed = true;
      continue;
    }
    if (arg === '--only') {
      onlyRaw = args[i + 1];
      if (!onlyRaw) warnings.push('Missing value for --only');
      else i++;
      continue;
    }
    if (arg.startsWith('--only=')) {
      onlyRaw = arg.slice('--only='.length);
      if (onlyRaw.length === 0) warnings.push('Missing value for --only');
      continue;
    }
    if (arg === '--url') {
      url = args[i + 1] ?? '';
      if (!url) warnings.push('Missing value for --url');
      else i++;
      continue;
    }
    if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
      if (!url) warnings.push('Missing value for --url');
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

  let onlySet: Set<number> | undefined;
  if (onlyRaw) {
    const parsed = parseOnlyList(onlyRaw);
    warnings.push(...parsed.warnings);
    onlySet = new Set(parsed.indices);
  }

  return {
    filePath: filePath ?? 'tests_silke.jsonc',
    onlySet,
    verboseLevel,
    warnings,
    headed,
    url,
  };
};

const getDefaultWorkerCount = (): number => {
  const parallelism = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  return Math.max(1, Math.floor(parallelism / 2));
};

const main = async () => {
  const options = parseCli();
  for (const warning of options.warnings) {
    console.warn(`[pathfinder-tests] ${warning}`);
  }

  const workerCount = getDefaultWorkerCount();
  const runners = new Map<number, WebRunner>();
  const getRunner = (workerId: number): WebRunner => {
    const existing = runners.get(workerId);
    if (existing) return existing;
    const created = new WebRunner(options.url, options.headed);
    runners.set(workerId, created);
    return created;
  };

  const adapter: PathfinderTestAdapter = {
    name: 'ootmm-web-playwright',
    run: (test, mode, meta) => getRunner(meta.workerId ?? 0).runTest(test, mode, meta),
    normalizeLocation: normalizeLocationId,
    resolveEventName: resolveEventNameDefault,
  };

  try {
    if (options.verboseLevel >= 1) {
      console.log(`[pathfinder-tests] Running with ${workerCount} workers`);
    }

    const summary = await runTestCases(options.filePath, adapter, {
      only: options.onlySet,
      verboseLevel: options.verboseLevel,
      workers: workerCount,
    });

    if (summary.failed === 0) {
      console.log(`[pathfinder-tests:${adapter.name}] ${summary.passed}/${summary.total} passed`);
      return;
    }

    console.log(`[pathfinder-tests:${adapter.name}] ${summary.failed}/${summary.total} failed`);
    for (const failure of summary.failures) {
      console.log(`Test ${failure.index}:`);
      for (const message of failure.messages) {
        console.log(`  - ${message}`);
      }
    }
    process.exitCode = 1;
  } finally {
    await Promise.all(Array.from(runners.values(), (runner) => runner.close()));
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
