import { expect, test } from '@playwright/test';
import {
  readReachableFraction,
  resetLocalStorageAndReload,
  waitForReachableFraction,
} from './helpers/tracker';

test.describe('Dungeon Entrance Randomizer', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('mapping and unmapping a dungeon entrance changes reachability', async ({
    page,
  }) => {
    // --- Step 1: Set erDungeons to "full" via settings ---
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();
    await search.fill('erDungeons');

    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    const overlay = page.getByTestId('applying-settings-overlay');
    const undoButton = page.getByRole('button', { name: /Undo/i });
    await page.getByTestId('apply-settings-button').click();
    await expect(undoButton).toBeEnabled({ timeout: 15_000 });
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    // --- Step 2: Record baseline reachable count (ER on, no overrides) ---
    await page.getByTestId('tab-items').click();
    const baseline = await waitForReachableFraction(page, 15_000);
    expect(baseline.total).toBeGreaterThan(0);
    expect(baseline.reachable).toBeLessThan(baseline.total);

    // --- Step 3: Open entrances panel, map Deku Tree → Forest Temple ---
    // The entrances sidebar should be visible now that ER is active.
    // Click the toggle button to open it if collapsed.
    const entrancesToggle = page.locator('.entrances-toggle');
    await expect(entrancesToggle).toBeVisible({ timeout: 5_000 });

    const isExpanded = await entrancesToggle.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await entrancesToggle.click();
    }

    // Find the entrance row for "Deku Tree" – the label text contains "Deku Tree"
    const dekuTreeRow = page.locator('.entrance-row').filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Tree' }),
    });
    await expect(dekuTreeRow).toBeVisible();

    // Select "Forest Temple" as the destination
    const dekuTreeSelect = dekuTreeRow.locator('.entrance-select');
    await expect(dekuTreeSelect).toBeVisible();

    // Find the option whose text contains "Forest Temple"
    const forestTempleOption = dekuTreeSelect.locator('option', {
      hasText: 'Forest Temple',
    });
    const forestTempleValue = await forestTempleOption.getAttribute('value');
    expect(forestTempleValue).toBeTruthy();
    await dekuTreeSelect.selectOption(forestTempleValue!);

    // --- Step 4: Wait for reinit, verify more checks reachable ---
    // The debounced reinitialize takes ~350ms + processing time
    await page.waitForTimeout(500);
    await expect
      .poll(
        async () => {
          const frac = await readReachableFraction(page);
          return frac.reachable;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(baseline.reachable);

    const afterMapping = await readReachableFraction(page);
    expect(afterMapping.reachable).toBeGreaterThan(baseline.reachable);

    // --- Step 5: Unmap Deku Tree (set back to "Not mapped") ---
    await dekuTreeSelect.selectOption('');

    // --- Step 6: Wait for reinit, verify fewer checks reachable ---
    await page.waitForTimeout(500);
    await expect
      .poll(
        async () => {
          const frac = await readReachableFraction(page);
          return frac.reachable;
        },
        { timeout: 15_000 },
      )
      .toBeLessThan(afterMapping.reachable);

    const afterUnmap = await readReachableFraction(page);
    expect(afterUnmap.reachable).toBeLessThan(afterMapping.reachable);
    // Should be back to around baseline
    expect(afterUnmap.reachable).toBe(baseline.reachable);
  });
});
