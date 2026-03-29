import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForReachableFraction,
  waitForAllReachable,
} from './helpers/tracker';

/**
 * Enable the "Clocks" setting via the Settings UI tab, then apply.
 * progressiveClocks defaults to 'separate', so only the checkbox is needed.
 */
async function enableClocksAsItems(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const clocksCheckbox = page.getByTestId('setting-input-clocks');
  await expect(clocksCheckbox).toBeVisible({
    timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
  });
  if (!(await clocksCheckbox.isChecked())) {
    await clocksCheckbox.check();
  }

  await page.getByTestId('apply-settings-button').click();

  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

/**
 * Search for a term in the always-visible Locations sidebar and return
 * the count of total matching and reachable location items.
 */
async function queryLocations(
  page: Page,
  searchTerm: string,
): Promise<{ total: number; reachable: number }> {
  const locationsPanel = page.locator('.locations-panel');
  await expect(locationsPanel).toBeVisible({
    timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
  });

  // Reset reachability filter so all locations are shown
  await locationsPanel
    .locator('[aria-label="Reachability filter"]')
    .getByRole('button', { name: /^All\b/ })
    .click();

  await locationsPanel.getByPlaceholder('Search locations...').fill(searchTerm);

  const allItems = locationsPanel.locator('.location-item');
  const reachableItems = locationsPanel.locator('.location-item.reachable');

  return {
    total: await allItems.count(),
    reachable: await reachableItems.count(),
  };
}

/**
 * Click an item in the item grid by its image alt text. The alt text
 * matches the item ID (e.g. "MM_OCARINA").
 */
async function clickItem(page: Page, itemId: string): Promise<void> {
  const img = page.locator(`img[alt="${itemId}"]`);
  await expect(img).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
  // Click the parent .grid-item div which carries the @click handler
  await img.locator('..').click();
}

const TARGET_LOCATIONS = [
  { search: 'Woods of Mystery Grotto', label: 'Woods of Mystery Grotto' },
  { search: 'Stock Pot Inn Room Key', label: 'Stock Pot Inn Room Key' },
];

test.describe('OoTMM clock gating', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
    await enableClocksAsItems(page);
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);
  });

  test('time-gated checks are unreachable with only ocarina + song of time', async ({
    page,
  }) => {
    // Switch to Items tab and activate only MM_OCARINA + MM_SONG_TIME
    await page.getByTestId('tab-items').click();
    await clickItem(page, 'MM_OCARINA');
    await clickItem(page, 'MM_SONG_TIME');

    // Wait for pathfinder to settle
    await waitForReachableFraction(page, TEST_TIMEOUTS.DEFAULT_EXPECT);

    for (const { search, label } of TARGET_LOCATIONS) {
      const { total, reachable } = await queryLocations(page, search);
      expect(
        total,
        `"${label}" should exist in the locations list`,
      ).toBeGreaterThan(0);
      expect(
        reachable,
        `"${label}" must NOT be reachable without clock items`,
      ).toBe(0);
    }
  });

  test('time-gated checks are reachable with full inventory', async ({
    page,
  }) => {
    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    // Poll until both target locations appear as reachable in the UI
    for (const { search, label } of TARGET_LOCATIONS) {
      await expect
        .poll(
          async () => {
            const { reachable } = await queryLocations(page, search);
            return reachable;
          },
          {
            message: `"${label}" must be reachable with full inventory`,
            timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
          },
        )
        .toBeGreaterThan(0);
    }
  });
});
