import { expect, test } from '@playwright/test';
import { gotoTracker, waitForBoot } from './helpers/tracker';

test.describe('tracker FAQ', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('opens, expands questions, and closes again', async ({ page }) => {
    await waitForBoot(page);

    await page.getByTestId('faq-open-button').click();
    await expect(page.getByTestId('faq-modal')).toBeVisible();
    await expect(page.getByTestId('faq-section-basics')).toBeVisible();
    await expect(page.getByTestId('faq-section-advanced')).toBeVisible();

    const shareStateItem = page.getByTestId('faq-item-share-state');
    await expect(shareStateItem).toBeVisible();
    await shareStateItem.locator('summary').click();
    await expect(shareStateItem).toContainText('Export State');
    await expect(shareStateItem).toContainText('shareable URL');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('faq-modal')).toHaveCount(0);
  });
});
