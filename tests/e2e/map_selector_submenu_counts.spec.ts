import { expect, test, type Page } from '@playwright/test';
import {
  gotoTracker,
  readReachableFraction,
  TEST_TIMEOUTS,
  waitForReachableFraction,
} from './helpers/tracker';
import { entranceCombobox, selectEntranceByLabel } from './helpers/entrance';

/**
 * Set the map toolbar filters so all markers are potentially visible.
 * Adapted from map_marker_visibility.spec.ts.
 */
async function normalizeMapVisibilityFilters(page: Page): Promise<void> {
  const toolbar = page.locator('.map-toolbar');

  await toolbar
    .locator('[aria-label="Location reachability filter"]')
    .getByRole('button', { name: 'All', exact: true })
    .click();

  await toolbar
    .locator('[aria-label="Location collection filter"]')
    .getByRole('button', { name: 'All', exact: true })
    .click();

  for (const label of ['Gossip Stones', 'Unshuffled']) {
    const checkbox = toolbar
      .locator('.map-toolbar-toggle-label')
      .filter({ hasText: label })
      .locator('input[type="checkbox"]');
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  }
}

/**
 * Open the map selector dropdown and return the visible count text
 * for the map option whose title matches the given text.
 */
async function getMapSelectorCount(
  page: Page,
  mapTitle: string,
): Promise<number> {
  const input = page.locator('#map-selector');
  await input.click();

  // Wait for the dropdown to appear
  const listbox = page.locator('#map-selector-listbox');
  await expect(listbox).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });

  // Find the option whose title matches
  const option = listbox
    .locator('.map-selector-option')
    .filter({ hasText: mapTitle })
    .first();

  const countSpan = option.locator('.map-selector-option-count');
  const countText = await countSpan.textContent();

  // Count is formatted as "(42)" or "(42 / 5)"
  const match = countText?.match(/\((\d+)/);
  if (!match) {
    throw new Error(
      `Could not parse count from "${countText}" for map "${mapTitle}"`,
    );
  }

  // Close dropdown by pressing Escape
  await page.keyboard.press('Escape');

  return Number(match[1]);
}

/**
 * Apply entrance randomization settings via the Settings UI.
 */
async function applyInteriorShuffleSettings(page: Page): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  // Search for and configure Interiors Shuffle
  await search.fill('Interiors Shuffle');
  const erIndoorsSelect = page.getByTestId('setting-input-erIndoors');
  await expect(erIndoorsSelect).toBeVisible();
  await erIndoorsSelect.selectOption('full');

  await search.fill('Shuffle Most Interiors');
  const erIndoorsMajorCheckbox = page.getByTestId(
    'setting-input-erIndoorsMajor',
  );
  await expect(erIndoorsMajorCheckbox).toBeVisible();
  await erIndoorsMajorCheckbox.check();

  // Apply settings
  const overlay = page.getByTestId('applying-settings-overlay');
  const undoButton = page.getByRole('button', { name: /Undo/i });
  await page.getByTestId('apply-settings-button').click();
  await expect(undoButton).toBeEnabled({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

test.describe('Map Selector Submenu Check Counts', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
    // Normalise visibility filters so all markers are counted,
    // regardless of the default filter state.
    await normalizeMapVisibilityFilters(page);
  });

  test('shows correct Kokiri Forest count with default ER-off settings', async ({
    page,
  }) => {
    // Kokiri Forest has multiple submenu markers with entrance bindings.
    // Without the fix, entrance-bound markers outside active ER pools
    // (like Mido's House, Know It All House, etc.) were excluded from
    // the count. With the fix, they are included via fallback to the
    // source entrance ID when no ER override exists.
    //
    // With all visibility filters set to "All", Kokiri Forest shows 36
    // visible checks.
    const count = await getMapSelectorCount(page, 'OOT Kokiri Forest');
    expect(count).toBeGreaterThanOrEqual(36);
  });

  test('shows correct Kokiri Forest count with Interiors Shuffle Full', async ({
    page,
  }) => {
    // Apply Interiors Shuffle settings that activate the ER pool for
    // interiors. With ER active, entrances without an explicit override
    // are in the shuffle pool but their destination is unknown.
    // Mido's House (4 chests) has no override → excluded from count.
    // The count should be 32 (36 - 4 Mido's House).
    await applyInteriorShuffleSettings(page);

    // Wait for reachability recalc after ER is activated
    await page.getByTestId('tab-items').click();
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);

    // Re-apply visibility filters (they may reset after settings apply)
    await normalizeMapVisibilityFilters(page);

    const count = await getMapSelectorCount(page, 'OOT Kokiri Forest');
    expect(count).toBe(32);
  });

  test('shows correct Kokiri Forest count with overridden interior', async ({
    page,
  }) => {
    // Apply Interiors Shuffle Full
    await applyInteriorShuffleSettings(page);

    // Navigate to Items tab and wait for reachability
    await page.getByTestId('tab-items').click();
    await waitForReachableFraction(page, TEST_TIMEOUTS.BOOT_REACHABLE);

    // Override one entrance to move Know It All House → Saria's House,
    // while leaving Mido's House un-overridden.
    const rightSidebarToggle = page.getByTestId('right-sidebar-toggle');
    await expect(rightSidebarToggle).toHaveAttribute('aria-expanded', 'true');

    const entrancesTab = page.getByTestId('right-sidebar-tab-entrances');
    await expect(entrancesTab).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // Find and remap "Know It All House" → "Saria's House"
    const knowItAllInput = entranceCombobox(page, 'Know It All House');
    await expect(knowItAllInput).toBeVisible();
    await selectEntranceByLabel(knowItAllInput, "Saria's House");

    // Wait for reinit after the override change
    await expect
      .poll(
        async () => {
          const frac = await readReachableFraction(page);
          return frac.reachable;
        },
        { timeout: TEST_TIMEOUTS.SETTINGS_APPLY },
      )
      .toBeGreaterThan(0);

    // Re-apply visibility filters (they may reset after reinit)
    await normalizeMapVisibilityFilters(page);

    // Mido's House is in the active pool with no override → excluded.
    // Know It All House is mapped to Saria's House — its codes are already
    // contributed by the existing Saria's House marker, so no net change.
    // The count should still be 32 (36 total - 4 Mido's House).
    const count = await getMapSelectorCount(page, 'OOT Kokiri Forest');
    expect(count).toBe(32);
  });
});
