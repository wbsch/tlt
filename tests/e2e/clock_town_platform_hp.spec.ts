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
 * Additionally enable the OoT Song of Soaring for both ages
 * (songSoaringOot + agelessSoaring, the v31 replacement for
 * crossWarpMm = full).
 */
async function enableOotSoaring(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('songSoaringOot');
  const songSoaringOotCheckbox = page.getByTestId(
    'setting-input-songSoaringOot',
  );
  await expect(songSoaringOotCheckbox).toBeVisible();
  await songSoaringOotCheckbox.check();

  await search.fill('agelessSoaring');
  const agelessSoaringCheckbox = page.getByTestId(
    'setting-input-agelessSoaring',
  );
  await expect(agelessSoaringCheckbox).toBeVisible();
  await agelessSoaringCheckbox.check();

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
 * Grant items via the inventory tab (the item grid does not contain the
 * v31 OoT song extension items such as OOT_SONG_SOARING).
 */
async function grantInventoryItems(
  page: Page,
  itemIds: string[],
): Promise<void> {
  await page.getByTestId('tab-inventory').click();
  for (const itemId of itemIds) {
    const card = page.getByTestId(`inventory-item-card-${itemId}`);
    await expect(card).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
    await card.click();
    await expect(card).toHaveClass(/owned/);
  }
}

test.describe('Clock Town Platform HP with interior ER game links', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('unreachable without items, reachable with OoT Song of Soaring', async ({
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

    // Step 3: Enable the OoT Song of Soaring for both ages
    await enableOotSoaring(page);
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);

    // Step 4: Add items: OOT_OCARINA, OOT_SONG_SOARING, MM_OCARINA, MM_SONG_TIME
    await grantInventoryItems(page, [
      'OOT_OCARINA',
      'OOT_SONG_SOARING',
      'MM_OCARINA',
      'MM_SONG_TIME',
    ]);

    // Step 5: Wait and verify Clock Town Platform HP IS reachable
    await expect
      .poll(
        async () => {
          const result = await queryLocations(page, 'Clock Town Platform HP');
          return result.reachable;
        },
        {
          message:
            '"Clock Town Platform HP" must be reachable with OOT_OCARINA + OOT_SONG_SOARING + MM_OCARINA + MM_SONG_TIME + songSoaringOot + agelessSoaring',
          timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
        },
      )
      .toBeGreaterThan(0);
  });
});
