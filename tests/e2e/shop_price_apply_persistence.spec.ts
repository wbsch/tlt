import {
  expect,
  test as base,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  captureTrackerStorageState,
  gotoTracker,
  TEST_TIMEOUTS,
  type TrackerStorageState,
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

async function prepareRandomizedShopPriceState(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('setting-input-shopShuffleOot').selectOption('full');
  await page.getByTestId('setting-input-priceOotShops').selectOption('random');
  await applySettingsAndWait(page);
}

const test = base.extend<
  Record<string, never>,
  { randomizedShopPriceStorageState: TrackerStorageState }
>({
  randomizedShopPriceStorageState: [
    async ({ browser }, use) => {
      const storageState = await captureTrackerStorageState(
        browser,
        prepareRandomizedShopPriceState,
      );
      await use(storageState);
    },
    { scope: 'worker' },
  ],
  context: async ({ browser, randomizedShopPriceStorageState }, use) => {
    const context = await browser.newContext({
      storageState: randomizedShopPriceStorageState,
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await gotoTracker(page);
    await use(page);
  },
});

test.describe.configure({ mode: 'parallel' });

test.describe('Shop price apply + persistence', () => {
  test('initializes randomized shop prices with 0 when switching price shuffle modes', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const row = await getTargetLocationRow(page);
    const priceInput = row.locator('.shop-price-input');
    await expect(priceInput).toBeVisible();
    await expect(priceInput).toHaveValue('0');

    await priceInput.fill('100');
    await expect(priceInput).toHaveValue('100');

    await page.getByTestId('tab-settings').click();
    await page
      .getByTestId('setting-input-priceOotShops')
      .selectOption('weighted');
    await applySettingsAndWait(page);

    const rowAfterModeChange = await getTargetLocationRow(page);
    const priceInputAfterModeChange =
      rowAfterModeChange.locator('.shop-price-input');
    await expect(priceInputAfterModeChange).toBeVisible();
    await expect(priceInputAfterModeChange).toHaveValue('0');
  });

  test('shows Kakariko Bazaar Item 1 price input after apply and keeps edited value after refresh', async ({
    page,
  }) => {
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
