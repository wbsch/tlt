import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForBoot,
} from './helpers/tracker';

const TARGET_LOCATION_NAME = 'Kakariko Bazaar Item 1';

async function applySettingsAndWait(page: Page): Promise<void> {
  const overlay = page.getByTestId('applying-settings-overlay');
  const undoButton = page.getByRole('button', { name: /Undo/i });

  await page.getByTestId('apply-settings-button').click();
  await expect(undoButton).toBeEnabled({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

async function getTargetLocationRow(page: Page): Promise<Locator> {
  const locationsPanel = page.locator('.locations-panel').first();
  await expect(locationsPanel).toBeVisible();

  await locationsPanel.locator('.category-select').selectOption('all');

  const reachabilityAllButton = locationsPanel
    .locator('.segment-group')
    .nth(0)
    .getByRole('button', { name: /^All \(/ });
  await reachabilityAllButton.click();

  const collectionAllButton = locationsPanel
    .locator('.segment-group')
    .nth(1)
    .getByRole('button', { name: /^All \(/ });
  await collectionAllButton.click();

  const locationSearch = locationsPanel.locator('.search-input');
  await expect(locationSearch).toBeVisible();
  await locationSearch.fill(TARGET_LOCATION_NAME);

  const row = page
    .locator('.location-item')
    .filter({
      has: page
        .locator('.location-name')
        .filter({ hasText: TARGET_LOCATION_NAME }),
    })
    .first();

  await expect(row).toBeVisible();
  return row;
}

test.describe('Shop price apply + persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('shows Kakariko Bazaar Item 1 price input after apply and keeps edited value after refresh', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    await page.getByTestId('setting-input-shopShuffleOot').selectOption('full');
    await page
      .getByTestId('setting-input-priceOotShops')
      .selectOption('random');
    await applySettingsAndWait(page);

    const row = await getTargetLocationRow(page);
    const priceInput = row.locator('.shop-price-input');
    await expect(priceInput).toBeVisible();

    await priceInput.fill('100');
    await expect(priceInput).toHaveValue('100');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    const rowAfterReload = await getTargetLocationRow(page);
    const priceInputAfterReload = rowAfterReload.locator('.shop-price-input');
    await expect(priceInputAfterReload).toBeVisible();
    await expect(priceInputAfterReload).toHaveValue('100');
  });
});
