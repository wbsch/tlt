import { expect, test, type Page } from '@playwright/test';
import { resetLocalStorageAndReload, TEST_TIMEOUTS } from './helpers/tracker';

const BUG_REPRO_INVENTORY: Record<string, number> = {
  MM_ARROW_ICE: 1,
  MM_ARROW_LIGHT: 1,
  MM_BOW: 3,
  MM_HOOKSHOT: 1,
  MM_MAGIC_UPGRADE: 2,
  MM_MASK_GIBDO: 1,
  MM_MASK_GORON: 1,
  MM_MASK_ZORA: 1,
  MM_OCARINA: 1,
  MM_SONG_EMPTINESS: 1,
  MM_SONG_EPONA: 1,
  MM_SONG_TIME: 1,
};

function entranceSelect(page: Page, label: string) {
  return page
    .locator('.entrance-row')
    .filter({
      has: page.locator('.entrance-label', { hasText: label }),
    })
    .locator('.entrance-select');
}

async function applyDungeonErSettings(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('erDungeons');
  await expect(page.getByTestId('setting-input-erDungeons')).toBeVisible();
  await page.getByTestId('setting-input-erDungeons').selectOption('full');

  await search.fill('erMajorDungeons');
  await expect(page.getByTestId('setting-input-erMajorDungeons')).toBeVisible();
  await page.getByTestId('setting-input-erMajorDungeons').check();

  await search.fill('erMinorDungeons');
  await expect(page.getByTestId('setting-input-erMinorDungeons')).toBeVisible();
  await page.getByTestId('setting-input-erMinorDungeons').check();

  const overlay = page.getByTestId('applying-settings-overlay');
  await page.getByTestId('apply-settings-button').click();
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

async function openEntrancesTab(page: Page): Promise<void> {
  const sidebarToggle = page.getByTestId('right-sidebar-toggle');
  await expect(sidebarToggle).toBeVisible();
  if ((await sidebarToggle.getAttribute('aria-expanded')) === 'false') {
    await sidebarToggle.click();
  }
  await page.getByTestId('right-sidebar-tab-entrances').click();
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
  }
}

test.describe('Ice Cavern to ISTT disconnect', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('mapping Ice Cavern to Stone Tower Temple Inverted does not leak Zora Fountain gossip reachability', async ({
    page,
  }) => {
    await applyDungeonErSettings(page);
    await openEntrancesTab(page);

    const reachabilityGroup = page.locator(
      '.entrances-panel [aria-label="Entrance reachability filter"]',
    );
    const mappingGroup = page.locator(
      '.entrances-panel [aria-label="Entrance mapping filter"]',
    );
    await reachabilityGroup.getByRole('button', { name: /^All\b/ }).click();
    await mappingGroup.getByRole('button', { name: /^All\b/ }).click();

    const iceCavernSelect = entranceSelect(page, 'Ice Cavern');
    await expect(iceCavernSelect).toBeVisible();
    await iceCavernSelect.selectOption('MM_TEMPLE_STONE_TOWER_INVERTED');
    await expect(iceCavernSelect).toHaveValue('MM_TEMPLE_STONE_TOWER_INVERTED');

    await setInventoryItems(page, BUG_REPRO_INVENTORY);
    await page.getByTestId('right-sidebar-tab-locations').click();
    const locationsPanel = page.locator('.locations-panel');
    await expect(locationsPanel).toBeVisible();

    await locationsPanel
      .getByPlaceholder('Search locations...')
      .fill('Zora Fountain Gossip');
    await locationsPanel
      .locator('[aria-label="Reachability filter"]')
      .getByRole('button', { name: /^Reachable\b/ })
      .click();

    await expect
      .poll(
        async () => await locationsPanel.locator('.location-item').count(),
        { timeout: TEST_TIMEOUTS.SETTINGS_APPLY },
      )
      .toBe(0);

    await locationsPanel
      .locator('[aria-label="Reachability filter"]')
      .getByRole('button', { name: /^Unreachable\b/ })
      .click();

    await expect(
      locationsPanel.getByText('Zora Fountain Gossip Northwest', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      locationsPanel.getByText('Zora Fountain Gossip Near Fairy', {
        exact: true,
      }),
    ).toBeVisible();
  });
});
