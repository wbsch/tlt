import { expect, test, type Page } from '@playwright/test';
import { gotoTracker, TEST_TIMEOUTS, waitForBoot } from './helpers/tracker';
import {
  clearEntranceMapping,
  entranceCombobox,
  expectEntranceSelectedId,
  expectEntranceUnmapped,
  selectEntranceById,
} from './helpers/entrance';

const BOMB_TEST_ID = 'inventory-item-card-OOT_BOMB_BAG';
const SWORD_TEST_ID = 'inventory-item-card-OOT_SWORD_KOKIRI';
const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';

async function isOwned(page: Page, testId: string): Promise<boolean> {
  const className = await page.getByTestId(testId).getAttribute('class');
  return (className ?? '').split(/\s+/).includes('owned');
}

async function enableDungeonEntranceSyncScenario(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('Dungeon Entrance Shuffle');
  const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
  await expect(erDungeonsSelect).toBeVisible();
  await erDungeonsSelect.selectOption('full');

  await search.fill('Shuffle Major Dungeons');
  const erMajorDungeonsCheckbox = page.getByTestId(
    'setting-input-erMajorDungeons',
  );
  await expect(erMajorDungeonsCheckbox).toBeVisible();
  await erMajorDungeonsCheckbox.check();

  await search.fill('Clock Tower Roof');
  const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
  await expect(erMoonCheckbox).toBeVisible();
  await erMoonCheckbox.check();

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

test.describe('multi-tab sync', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('syncs gameplay changes across two tabs without overwriting', async ({
    page,
  }) => {
    const pageTwo = await page.context().newPage();
    await pageTwo.goto('/?debug=1');
    await waitForBoot(pageTwo);

    await expect(page.getByTestId('multi-tab-sync-badge')).toBeVisible({
      timeout: TEST_TIMEOUTS.DEFAULT_EXPECT,
    });
    await expect(pageTwo.getByTestId('multi-tab-sync-badge')).toBeVisible({
      timeout: TEST_TIMEOUTS.DEFAULT_EXPECT,
    });

    await page.getByTestId('tab-inventory').click();
    await pageTwo.getByTestId('tab-inventory').click();

    await page.getByTestId(BOMB_TEST_ID).click();
    await pageTwo.getByTestId(SWORD_TEST_ID).click();

    await expect
      .poll(async () => {
        const bombOwned = await isOwned(page, BOMB_TEST_ID);
        const swordOwned = await isOwned(page, SWORD_TEST_ID);
        return bombOwned && swordOwned;
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const bombOwned = await isOwned(pageTwo, BOMB_TEST_ID);
        const swordOwned = await isOwned(pageTwo, SWORD_TEST_ID);
        return bombOwned && swordOwned;
      })
      .toBe(true);

    await pageTwo.close();
  });

  test('reset in one tab propagates to the other tab', async ({ page }) => {
    const pageTwo = await page.context().newPage();
    await pageTwo.goto('/?debug=1');
    await waitForBoot(pageTwo);

    await page.getByTestId('tab-inventory').click();
    await pageTwo.getByTestId('tab-inventory').click();

    await page.getByTestId(BOMB_TEST_ID).click();
    await expect.poll(() => isOwned(pageTwo, BOMB_TEST_ID)).toBe(true);

    await page.getByTestId('reset-tracker-state-button').click();
    await expect(page.getByTestId('reset-tracker-confirm-modal')).toBeVisible();
    await page.getByTestId('reset-tracker-confirm-apply-button').click();

    // Reset switches the active tab back to 'grid', so re-open "All Items"
    // on page 1 before checking the owned class.
    await page.getByTestId('tab-inventory').click();

    await expect
      .poll(() => isOwned(page, BOMB_TEST_ID), {
        timeout: TEST_TIMEOUTS.SYNC_POLL,
      })
      .toBe(false);
    await expect
      .poll(() => isOwned(pageTwo, BOMB_TEST_ID), {
        timeout: TEST_TIMEOUTS.SYNC_POLL,
      })
      .toBe(false);

    await pageTwo.close();
  });

  test('entrance mappings propagate across two tabs', async ({ page }) => {
    await enableDungeonEntranceSyncScenario(page);

    const pageTwo = await page.context().newPage();
    await pageTwo.goto('/?debug=1');
    await waitForBoot(pageTwo);

    await openEntrancesTab(page);
    await openEntrancesTab(pageTwo);

    const dekuTreeInput = entranceCombobox(page, 'Deku Tree');
    const dekuTreeInputTwo = entranceCombobox(pageTwo, 'Deku Tree');

    await expect(dekuTreeInput).toBeVisible();
    await expect(dekuTreeInputTwo).toBeVisible();

    await selectEntranceById(dekuTreeInput, CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expectEntranceSelectedId(dekuTreeInput, CLOCK_TOWER_ROOF_ENTRANCE_ID);
    await expect
      .poll(async () => {
        return await dekuTreeInputTwo.getAttribute('data-selected');
      })
      .toBe(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await clearEntranceMapping(dekuTreeInputTwo);

    await expectEntranceUnmapped(dekuTreeInputTwo);
    await expect
      .poll(async () => {
        return await dekuTreeInput.getAttribute('data-selected');
      })
      .toBe('');

    await pageTwo.close();
  });
});
