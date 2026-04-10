import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetLocalStorageAndReload, TEST_TIMEOUTS } from './helpers/tracker';

const REWARD_ITEM_ID = 'OOT_STONE_EMERALD';

async function getGridItem(page: Page, itemId: string): Promise<Locator> {
  const tile = page.locator(`[data-grid-item-id="${itemId}"]`).first();
  await expect(tile).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
  return tile;
}

async function longPressGridItem(page: Page, itemId: string): Promise<void> {
  const tile = await getGridItem(page, itemId);
  const box = await tile.boundingBox();
  if (!box) {
    throw new Error(`Expected bounding box for grid item ${itemId}`);
  }

  const clientX = box.x + box.width / 2;
  const clientY = box.y + box.height / 2;

  await tile.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  await page.waitForTimeout(550);
  await tile.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
}

test.describe('mobile dungeon reward menu', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('opens on long press and applies the selected dungeon layout', async ({
    page,
  }) => {
    await resetLocalStorageAndReload(page);
    await page.getByTestId('tab-items').click();

    const tile = await getGridItem(page, REWARD_ITEM_ID);

    await longPressGridItem(page, REWARD_ITEM_ID);

    const menu = page.getByTestId(`grid-wheel-menu-${REWARD_ITEM_ID}`);
    await expect(menu).toBeVisible({ timeout: TEST_TIMEOUTS.DEFAULT_EXPECT });
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(844);
    await menu.getByRole('button', { name: /Forest Temple/i }).click();
    await expect(menu).toHaveCount(0);
    await expect(tile.locator('.item-wheel-text-label')).toHaveText('Frst');

    await longPressGridItem(page, REWARD_ITEM_ID);
    const reopenedMenu = page.getByTestId(`grid-wheel-menu-${REWARD_ITEM_ID}`);
    await expect(reopenedMenu).toBeVisible({
      timeout: TEST_TIMEOUTS.DEFAULT_EXPECT,
    });
    await reopenedMenu
      .getByTestId(`grid-wheel-option-${REWARD_ITEM_ID}-0`)
      .click();
    await expect(reopenedMenu).toHaveCount(0);
    await expect(tile.locator('.item-wheel-text-label')).toHaveCount(0);
    await expect(tile.locator('.item-wheel-overlay')).toHaveCount(0);
  });
});
