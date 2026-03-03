import { expect, test, type Page } from '@playwright/test';
import { resetLocalStorageAndReload } from './helpers/tracker';

const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';

function dekuTreeSelect(page: Page) {
  return page
    .locator('.entrance-row')
    .filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Tree' }),
    })
    .locator('.entrance-select');
}

async function openEntrancesTab(page: Page): Promise<void> {
  const sidebarToggle = page.getByTestId('right-sidebar-toggle');
  await expect(sidebarToggle).toBeVisible();
  if ((await sidebarToggle.getAttribute('aria-expanded')) === 'false') {
    await sidebarToggle.click();
  }
  await page.getByTestId('right-sidebar-tab-entrances').click();
}

async function resetEntranceFiltersToAll(page: Page): Promise<void> {
  const reachabilityGroup = page.locator(
    '.entrances-panel [aria-label="Entrance reachability filter"]',
  );
  await expect(reachabilityGroup).toBeVisible();
  await reachabilityGroup.locator('button').first().click();

  const mappingGroup = page.locator(
    '.entrances-panel [aria-label="Entrance mapping filter"]',
  );
  await expect(mappingGroup).toBeVisible();
  await mappingGroup.locator('button').first().click();
}

test.describe('Entrance mapping refresh persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Deku Tree can be mapped to Clock Tower Roof via the Entrances UI', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();

    await search.fill('erDungeons');
    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    await search.fill('erMoon');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    await erMoonCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);
    const select = dekuTreeSelect(page);
    await expect(select).toBeVisible();
    await select.selectOption(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expect(select).toHaveValue(CLOCK_TOWER_ROOF_ENTRANCE_ID);
  });

  test('Deku Tree mapping can be cleared via Not mapped option', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();

    await search.fill('erDungeons');
    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    await search.fill('erMoon');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    await erMoonCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);
    const select = dekuTreeSelect(page);
    await expect(select).toBeVisible();
    await select.selectOption(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expect(select).toHaveValue(CLOCK_TOWER_ROOF_ENTRANCE_ID);
    await select.selectOption('');
    await expect(dekuTreeSelect(page)).toHaveValue('');
  });
});
