import { expect, test } from '@playwright/test';
import {
  readTrackerStats,
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForAllReachable,
  waitForBoot,
  waitForReachableFraction,
} from './helpers/tracker';

const BUILD_COMMIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUILD_COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

test.describe('OoTMM smoke', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('boot and shell render', async ({ page }) => {
    await waitForBoot(page);

    await expect(page.getByTestId('tab-settings')).toBeVisible();
    await expect(page.getByTestId('tab-items')).toBeVisible();
    await expect(page.getByTestId('tab-inventory')).toBeVisible();
    await expect(page.getByTestId('tab-world')).toBeVisible();
    await expect(page.getByTestId('tab-tricks')).toBeVisible();

    const stats = await readTrackerStats(page);
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.checked).toBeGreaterThanOrEqual(0);
    expect(stats.remaining).toBeGreaterThanOrEqual(0);
  });

  test('info modal shows build metadata footer', async ({ page }) => {
    await page.getByTestId('info-impressum-button').click();
    await expect(page.getByTestId('info-impressum-modal')).toBeVisible();

    const buildCommitDate = await page
      .getByTestId('info-build-commit-date')
      .textContent();
    const buildCommitHash = await page
      .getByTestId('info-build-commit-hash')
      .textContent();
    const ootmmVersionTag = await page
      .getByTestId('info-ootmm-version-tag')
      .textContent();

    expect(buildCommitDate?.trim()).toMatch(BUILD_COMMIT_DATE_PATTERN);
    expect(buildCommitHash?.trim()).toMatch(BUILD_COMMIT_HASH_PATTERN);
    expect(ootmmVersionTag?.trim()).toBeTruthy();
  });

  test('debug activate-all reaches all checks', async ({ page }) => {
    await page.getByTestId('debug-activate-all-button').click();

    const reachable = await waitForAllReachable(page);
    expect(reachable.total).toBeGreaterThan(0);
    expect(reachable.reachable).toBe(reachable.total);
  });

  test('settings apply flow handles long operation', async ({ page }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();
    await search.fill('preCompletedDungeons');

    const settingInput = page.getByTestId('setting-input-preCompletedDungeons');
    await expect(settingInput).toBeVisible();

    const initial = await settingInput.isChecked();
    await settingInput.setChecked(!initial);

    const overlay = page.getByTestId('applying-settings-overlay');
    const undoButton = page.getByRole('button', { name: /Undo/i });
    await page.getByTestId('apply-settings-button').click();
    // Overlay visibility can be very brief; treat "apply finished" as the
    // stable condition and only assert overlay is not blocking afterwards.
    await expect(undoButton).toBeEnabled({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
    await expect(overlay).toBeHidden({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });

    await page.getByTestId('tab-items').click();
    const reachable = await waitForReachableFraction(
      page,
      TEST_TIMEOUTS.BOOT_REACHABLE,
    );
    expect(reachable.total).toBeGreaterThan(0);
  });

  test('tricks explicit apply uses apply button flow', async ({ page }) => {
    await page.getByTestId('tab-tricks').click();

    const firstTrick = page
      .locator('.trick-label input[type="checkbox"]')
      .first();
    await expect(firstTrick).toBeVisible();
    const initial = await firstTrick.isChecked();
    await firstTrick.click();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.waitForTimeout(250);
    await expect(overlay).toHaveCount(0);

    await page.getByTestId('apply-tricks-button').click();
    // Overlay visibility can be very brief when the main thread is blocked
    // by tracker initialization; just verify the apply completes.
    await expect(overlay).toBeHidden({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });

    await page.getByTestId('tab-tricks').click();
    if (initial) {
      await expect(firstTrick).not.toBeChecked();
    } else {
      await expect(firstTrick).toBeChecked();
    }
  });

  test('tricks reset to defaults clears pending changes', async ({ page }) => {
    await page.getByTestId('tab-tricks').click();

    const firstTrick = page
      .locator('.trick-label input[type="checkbox"]')
      .first();
    await expect(firstTrick).toBeVisible();
    const initial = await firstTrick.isChecked();
    await firstTrick.click();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.waitForTimeout(250);
    await expect(overlay).toHaveCount(0);

    await page.getByTestId('reset-tricks-button').click();
    if (initial) {
      await expect(firstTrick).toBeChecked();
    } else {
      await expect(firstTrick).not.toBeChecked();
    }

    await page.getByTestId('tab-items').click();
    await page.waitForTimeout(250);
    await expect(overlay).toHaveCount(0);
  });

  test('tricks auto-apply when leaving tab with unsaved changes', async ({
    page,
  }) => {
    await page.getByTestId('tab-tricks').click();

    const firstTrick = page
      .locator('.trick-label input[type="checkbox"]')
      .first();
    await expect(firstTrick).toBeVisible();
    const initial = await firstTrick.isChecked();
    await firstTrick.click();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('tab-items').click();
    // Overlay visibility can be very brief when the main thread is blocked
    // by tracker initialization; just verify the apply completes.
    await expect(overlay).toBeHidden({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });

    await page.getByTestId('tab-tricks').click();
    if (initial) {
      await expect(firstTrick).not.toBeChecked();
    } else {
      await expect(firstTrick).toBeChecked();
    }
  });

  test('tricks tab switch without edits does not apply settings', async ({
    page,
  }) => {
    await page.getByTestId('tab-tricks').click();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('tab-items').click();
    await page.waitForTimeout(250);
    await expect(overlay).toHaveCount(0);
  });

  test('reset tracker state path recovers cleanly', async ({ page }) => {
    await page.getByTestId('debug-activate-all-button').click();
    const beforeReset = await waitForAllReachable(page);
    expect(beforeReset.reachable).toBe(beforeReset.total);

    await page.getByTestId('reset-tracker-state-button').click();
    await expect(page.getByTestId('reset-tracker-confirm-modal')).toBeVisible();
    await page.getByTestId('reset-tracker-confirm-apply-button').click();
    await waitForBoot(page);

    const afterReset = await waitForReachableFraction(
      page,
      TEST_TIMEOUTS.BOOT_REACHABLE,
    );
    expect(afterReset.total).toBeGreaterThan(0);
  });

  test('reset tracker state can be cancelled', async ({ page }) => {
    await page.getByTestId('debug-activate-all-button').click();
    const beforeCancel = await waitForAllReachable(page);
    expect(beforeCancel.reachable).toBe(beforeCancel.total);

    await page.getByTestId('reset-tracker-state-button').click();
    const modal = page.getByTestId('reset-tracker-confirm-modal');
    await expect(modal).toBeVisible();

    await page.getByTestId('reset-tracker-confirm-cancel-button').click();
    await expect(modal).toBeHidden();

    const afterCancel = await waitForAllReachable(page);
    expect(afterCancel.reachable).toBe(afterCancel.total);
    expect(afterCancel.total).toBe(beforeCancel.total);
  });
});
