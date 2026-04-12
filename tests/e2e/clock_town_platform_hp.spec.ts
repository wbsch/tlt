import { expect, test, type Page } from '@playwright/test';
import {
  gotoTracker,
  TEST_TIMEOUTS,
  waitForReachableFraction,
} from './helpers/tracker';

/**
 * Apply interior ER settings with game-link entrances shuffled:
 * - erIndoors = full
 * - erIndoorsMajor = true
 * - erIndoorsGameLinks = true
 */
async function applyInteriorErWithGameLinks(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('erIndoors');
  const erIndoorsSelect = page.getByTestId('setting-input-erIndoors');
  await expect(erIndoorsSelect).toBeVisible();
  await erIndoorsSelect.selectOption('full');

  await search.fill('erIndoorsMajor');
  const erIndoorsMajorCheckbox = page.getByTestId(
    'setting-input-erIndoorsMajor',
  );
  await expect(erIndoorsMajorCheckbox).toBeVisible();
  await erIndoorsMajorCheckbox.check();

  await search.fill('erIndoorsGameLinks');
  const erIndoorsGameLinksCheckbox = page.getByTestId(
    'setting-input-erIndoorsGameLinks',
  );
  await expect(erIndoorsGameLinksCheckbox).toBeVisible();
  await erIndoorsGameLinksCheckbox.check();

  const overlay = page.getByTestId('applying-settings-overlay');
  await page.getByTestId('apply-settings-button').click();
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

/**
 * Additionally enable Cross-Games MM Song of Soaring = Child & Adult.
 */
async function enableCrossWarpMm(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('crossWarpMm');
  const crossWarpMmSelect = page.getByTestId('setting-input-crossWarpMm');
  await expect(crossWarpMmSelect).toBeVisible();
  await crossWarpMmSelect.selectOption('full');

  await search.fill('mmPreActivatedOwls');
  const owlsInput = page.getByTestId('setting-input-mmPreActivatedOwls');
  await expect(owlsInput).toBeVisible();
  await owlsInput.selectOption('specific');
  const clockTownOwl = page
    .locator('.multiselect-option')
    .filter({ hasText: 'Clock Town' })
    .locator('input[type="checkbox"]');
  await clockTownOwl.check();

  const overlay = page.getByTestId('applying-settings-overlay');
  await page.getByTestId('apply-settings-button').click();
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

/**
 * Ensure the right sidebar is open and the Locations tab is selected.
 */
async function openLocationsTab(page: Page): Promise<void> {
  const toggle = page.getByTestId('right-sidebar-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
  await page.getByTestId('right-sidebar-tab-locations').click();
}

/**
 * Search for a term in the Locations panel and return reachability info.
 */
async function queryLocations(
  page: Page,
  searchTerm: string,
): Promise<{ total: number; reachable: number }> {
  await openLocationsTab(page);

  const locationsPanel = page.locator('.locations-panel');
  await expect(locationsPanel).toBeVisible({
    timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
  });

  // Reset reachability filter to show all
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
 * Click an item in the item grid by its image alt text.
 */
async function clickItem(page: Page, itemId: string): Promise<void> {
  const img = page.locator(`img[alt="${itemId}"]`);
  await expect(img).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
  await img.locator('..').click();
}

test.describe('Clock Town Platform HP with interior ER game links', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('unreachable without items, reachable with soaring + crossWarpMm', async ({
    page,
  }) => {
    // Step 1: Apply interior ER with game links
    await applyInteriorErWithGameLinks(page);
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);

    // Step 2: Verify Clock Town Platform HP is NOT reachable (no items)
    const before = await queryLocations(page, 'Clock Town Platform HP');
    expect(
      before.total,
      '"Clock Town Platform HP" should exist in the locations list',
    ).toBeGreaterThan(0);
    expect(
      before.reachable,
      '"Clock Town Platform HP" must NOT be reachable without items',
    ).toBe(0);

    // Step 3: Enable Cross-Games MM Song of Soaring = Child & Adult
    await enableCrossWarpMm(page);
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);

    // Step 4: Add items: OOT_OCARINA, MM_OCARINA, MM_SONG_SOARING, MM_SONG_TIME
    await page.getByTestId('tab-items').click();
    await clickItem(page, 'OOT_OCARINA');
    await clickItem(page, 'MM_OCARINA');
    await clickItem(page, 'MM_SONG_SOARING');
    await clickItem(page, 'MM_SONG_TIME');

    // Step 5: Wait and verify Clock Town Platform HP IS reachable
    await expect
      .poll(
        async () => {
          const result = await queryLocations(page, 'Clock Town Platform HP');
          return result.reachable;
        },
        {
          message:
            '"Clock Town Platform HP" must be reachable with OOT_OCARINA + MM_OCARINA + MM_SONG_SOARING + MM_SONG_TIME + crossWarpMm=full',
          timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
        },
      )
      .toBeGreaterThan(0);
  });
});
