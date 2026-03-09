import { expect, test } from '@playwright/test';
import { resetLocalStorageAndReload, TEST_TIMEOUTS } from './helpers/tracker';

async function openEntrancesTab(page: import('@playwright/test').Page) {
  const rightSidebarToggle = page.getByTestId('right-sidebar-toggle');
  await expect(rightSidebarToggle).toBeVisible();
  if ((await rightSidebarToggle.getAttribute('aria-expanded')) === 'false') {
    await rightSidebarToggle.click();
  }
  await page.getByTestId('right-sidebar-tab-entrances').click();
}

async function applyGrottoShuffle(page: import('@playwright/test').Page) {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();
  await search.fill('erGrottos');

  const erGrottosSelect = page.getByTestId('setting-input-erGrottos');
  await expect(erGrottosSelect).toBeVisible();
  await erGrottosSelect.selectOption('full');

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

test.describe('Grotto Entrance Randomizer', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('mapped Deku Theater grotto stays in the reachable list', async ({
    page,
  }) => {
    await applyGrottoShuffle(page);

    await openEntrancesTab(page);

    const dekuTheaterRow = page.locator('.entrance-row').filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Theater' }),
    });
    await expect(dekuTheaterRow).toBeVisible();

    const dekuTheaterSelect = dekuTheaterRow.locator('.entrance-select');
    await expect(dekuTheaterSelect).toBeVisible();

    const roadToIkanaOption = dekuTheaterSelect.locator('option', {
      hasText: 'Road to Ikana Grotto',
    });
    const roadToIkanaValue = await roadToIkanaOption.getAttribute('value');
    expect(roadToIkanaValue).toBeTruthy();
    await dekuTheaterSelect.selectOption(roadToIkanaValue!);
    await expect(dekuTheaterSelect).toHaveValue(roadToIkanaValue!);

    const reachabilityGroup = page.locator(
      '.entrances-panel [aria-label="Entrance reachability filter"]',
    );
    const mappingGroup = page.locator(
      '.entrances-panel [aria-label="Entrance mapping filter"]',
    );
    await expect(reachabilityGroup).toBeVisible();
    await expect(mappingGroup).toBeVisible();

    await reachabilityGroup
      .getByRole('button', { name: /^Reachable\b/ })
      .click();
    await mappingGroup.getByRole('button', { name: /^Mapped\b/ }).click();

    await expect(dekuTheaterRow).toBeVisible({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
  });

  test('graveyard shield grave stays reachable with grotto shuffle', async ({
    page,
  }) => {
    await applyGrottoShuffle(page);
    await openEntrancesTab(page);

    const reachabilityGroup = page.locator(
      '.entrances-panel [aria-label="Entrance reachability filter"]',
    );
    await expect(reachabilityGroup).toBeVisible();
    await reachabilityGroup
      .getByRole('button', { name: /^Reachable\b/ })
      .click();

    const shieldGraveRow = page.locator('.entrance-row').filter({
      has: page.locator('.entrance-label', {
        hasText: 'Graveyard Shield Grave',
      }),
    });

    await expect(shieldGraveRow).toBeVisible({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
  });
});
