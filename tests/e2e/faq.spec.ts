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

    const project64AutotrackingItem = page
      .getByTestId('faq-item-autotracking')
      .filter({ hasText: 'How do I set up autotracking for Project64-EM?' });
    await expect(project64AutotrackingItem).toBeVisible();
    await project64AutotrackingItem.locator('summary').click();
    await expect(project64AutotrackingItem).toContainText('Project64-EM');

    const windowsLink = project64AutotrackingItem.getByRole('link', {
      name: 'Windows',
    });
    await expect(windowsLink).toBeVisible();
    await expect(windowsLink).toHaveAttribute('target', '_blank');
    await expect(windowsLink).toHaveAttribute('rel', 'noopener noreferrer');

    const retroArchAutotrackingItem = page
      .getByTestId('faq-item-autotracking')
      .filter({ hasText: 'How do I set up autotracking for RetroArch?' });
    await expect(retroArchAutotrackingItem).toBeVisible();
    await retroArchAutotrackingItem.locator('summary').click();
    await expect(retroArchAutotrackingItem).toContainText('RetroArch');
    await expect(retroArchAutotrackingItem).toContainText('55355');

    const shareStateItem = page.getByTestId('faq-item-share-state');
    await expect(shareStateItem).toBeVisible();
    await shareStateItem.locator('summary').click();
    await expect(shareStateItem).toContainText('Export State');
    await expect(shareStateItem).toContainText('shareable URL');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('faq-modal')).toHaveCount(0);
  });
});
