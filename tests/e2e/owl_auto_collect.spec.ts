import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetLocalStorageAndReload, TEST_TIMEOUTS } from './helpers/tracker';
import { entranceCombobox, selectEntranceByLabel } from './helpers/entrance';

const REQUIRED_ITEMS: Record<string, number> = {
  OOT_OCARINA: 1,
  OOT_SWORD_MASTER: 1,
  MM_OCARINA: 1,
  MM_SONG_TIME: 1,
  MM_SONG_SOARING: 1,
};

async function applySettings(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('erGrottos');
  await page.getByTestId('setting-input-erGrottos').selectOption('full');

  await search.fill('doorOfTime');
  await page.getByTestId('setting-input-doorOfTime').selectOption('open');

  await search.fill('crossWarpMm');
  await page.getByTestId('setting-input-crossWarpMm').selectOption('full');

  await search.fill('crossAge');
  await page.getByTestId('setting-input-crossAge').check();

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

async function openRightSidebarTab(
  page: Page,
  tab: 'locations' | 'entrances',
): Promise<void> {
  const toggle = page.getByTestId('right-sidebar-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
  await page.getByTestId(`right-sidebar-tab-${tab}`).click();
}

async function mapMountainGossipGrottoToDampeGrave(page: Page): Promise<void> {
  await openRightSidebarTab(page, 'entrances');

  const entrancesPanel = page.locator('.entrances-panel').first();
  await expect(entrancesPanel).toBeVisible();
  await entrancesPanel
    .locator('[aria-label="Entrance reachability filter"]')
    .getByRole('button', { name: /^All \(/ })
    .click();

  const row = page.locator('.entrance-row:not(.exit-row)').filter({
    has: page.locator('.entrance-label', {
      hasText: 'Mountain Gossip Grotto',
    }),
  });
  await expect(row).toBeVisible();

  const input = entranceCombobox(page, 'Mountain Gossip Grotto');
  await selectEntranceByLabel(input, 'Dampe Grave');
}

async function setInventoryItems(
  page: Page,
  items: Record<string, number>,
): Promise<void> {
  await page.getByTestId('tab-inventory').click();
  for (const [itemId, count] of Object.entries(items)) {
    const card = page.getByTestId(`inventory-item-card-${itemId}`);
    await expect(card).toBeVisible();
    for (let i = 0; i < count; i += 1) {
      await card.click();
    }
    await expect(card).toHaveClass(/owned/);
  }
}

async function getLocationRow(page: Page, name: string): Promise<Locator> {
  await openRightSidebarTab(page, 'locations');

  const locationsPanel = page.locator('.locations-panel').first();
  await expect(locationsPanel).toBeVisible();

  await locationsPanel.locator('.category-select').selectOption('all');
  await locationsPanel
    .locator('.segment-group')
    .nth(0)
    .getByRole('button', { name: /^All \(/ })
    .click();
  await locationsPanel
    .locator('.segment-group')
    .nth(1)
    .getByRole('button', { name: /^All \(/ })
    .click();

  const search = locationsPanel.locator('.search-input');
  await expect(search).toBeVisible();
  await search.fill(name);

  const row = page
    .locator('.location-item')
    .filter({
      has: page.locator('.location-name').filter({ hasText: name }),
    })
    .first();

  await expect(row).toBeVisible();
  return row;
}

test.describe('Vanilla owl statue auto-collection', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('reachable vanilla owl statues count as collected for reachability', async ({
    page,
  }) => {
    await applySettings(page);
    await mapMountainGossipGrottoToDampeGrave(page);
    await setInventoryItems(page, REQUIRED_ITEMS);
    const row = await getLocationRow(page, 'Dampe Tomb Reward 2');

    await expect
      .poll(async () => (await row.getAttribute('class')) ?? '')
      .toMatch(/reachable/);
  });
});
