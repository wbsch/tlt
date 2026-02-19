import { expect, test } from '@playwright/test';
import {
  readTrackerStats,
  resetLocalStorageAndReload,
  waitForAllReachable,
  waitForBoot,
  waitForReachableFraction,
} from './helpers/tracker';

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
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toBeHidden({ timeout: 10_000 });

    await page.getByTestId('tab-items').click();
    const reachable = await waitForReachableFraction(page, 15_000);
    expect(reachable.total).toBeGreaterThan(0);
  });

  test('reset tracker state path recovers cleanly', async ({ page }) => {
    await page.getByTestId('debug-activate-all-button').click();
    const beforeReset = await waitForAllReachable(page);
    expect(beforeReset.reachable).toBe(beforeReset.total);

    await page.getByTestId('reset-tracker-state-button').click();
    await expect(page.getByTestId('reset-tracker-confirm-modal')).toBeVisible();
    await page.getByTestId('reset-tracker-confirm-apply-button').click();
    await waitForBoot(page);

    const afterReset = await waitForReachableFraction(page, 15_000);
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
