import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForBoot,
} from './helpers/tracker';

const BOMB_TEST_ID = 'inventory-item-card-OOT_BOMB_BAG';
const SWORD_TEST_ID = 'inventory-item-card-OOT_SWORD_KOKIRI';

async function isOwned(page: Page, testId: string): Promise<boolean> {
  const className = await page.getByTestId(testId).getAttribute('class');
  return (className ?? '').split(/\s+/).includes('owned');
}

test.describe('multi-tab sync', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
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
});
