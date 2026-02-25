import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  waitForReachableFraction,
  waitForAllReachable,
} from './helpers/tracker';

/**
 * Apply the "Clocks as Items" setting (progressiveClocks: 'separate',
 * clocks: true) via the tracker's internal settings handler, then wait
 * for the settings overlay to disappear.
 */
async function enableClocksAsItems(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as HTMLElement & { __vueParentComponent?: any })
          .__vueParentComponent
      : null;
    const setup = component?.setupState;
    const applySettings = setup?.handleSettingsChange;
    const trackerSettings = setup?.trackerSettings;
    if (typeof applySettings !== 'function' || !trackerSettings) {
      throw new Error('Could not resolve settings apply handler');
    }

    await applySettings({
      ...trackerSettings,
      clocks: true,
      progressiveClocks: 'separate',
    });
  });

  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: 15_000,
  });
}

/**
 * Read the set of reachable location IDs directly from the tracker's
 * internal state. Returns a plain string array suitable for pattern
 * matching.
 */
async function getReachableLocationIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as HTMLElement & { __vueParentComponent?: any })
          .__vueParentComponent
      : null;
    const setup = component?.setupState;
    const reachable = setup?.reachableLocationIds;
    // The ref holds a Set<string>; unwrap .value if needed
    const raw = reachable?.value ?? reachable;
    if (raw instanceof Set) return [...raw];
    if (Array.isArray(raw)) return raw as string[];
    return [];
  });
}

/**
 * Click an item in the item grid by its image alt text. The alt text
 * matches the item ID (e.g. "MM_OCARINA").
 */
async function clickItem(page: Page, itemId: string): Promise<void> {
  const img = page.locator(`img[alt="${itemId}"]`);
  await expect(img).toBeVisible({ timeout: 5_000 });
  // Click the parent .grid-item div which carries the @click handler
  await img.locator('..').click();
}

const TARGET_LOCATIONS = [
  { pattern: /Woods of Mystery Grotto/i, label: 'Woods of Mystery Grotto' },
  { pattern: /Stock Pot Inn Room Key/i, label: 'Stock Pot Inn Room Key' },
];

test.describe('OoTMM clock gating', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
    await enableClocksAsItems(page);
    await waitForReachableFraction(page, 15_000);
  });

  test('time-gated checks are unreachable with only ocarina + song of time', async ({
    page,
  }) => {
    // Switch to Items tab and activate only MM_OCARINA + MM_SONG_TIME
    await page.getByTestId('tab-items').click();
    await clickItem(page, 'MM_OCARINA');
    await clickItem(page, 'MM_SONG_TIME');

    // Wait for pathfinder to settle
    await waitForReachableFraction(page, 10_000);

    const reachable = await getReachableLocationIds(page);
    for (const { pattern, label } of TARGET_LOCATIONS) {
      const matches = reachable.filter((id) => pattern.test(id));
      expect(
        matches,
        `"${label}" must NOT be reachable without clock items`,
      ).toHaveLength(0);
    }
  });

  test('time-gated checks are reachable with full inventory', async ({
    page,
  }) => {
    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    // Poll until both target locations appear in the reachable set
    // (pathfinder may take a moment to propagate all time-gated checks)
    for (const { pattern, label } of TARGET_LOCATIONS) {
      await expect
        .poll(
          async () => {
            const reachable = await getReachableLocationIds(page);
            return reachable.filter((id) => pattern.test(id)).length;
          },
          {
            message: `"${label}" must be reachable with full inventory`,
            timeout: 15_000,
          },
        )
        .toBeGreaterThan(0);
    }
  });
});
