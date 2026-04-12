import { expect, test } from '@playwright/test';
import { gotoTracker, TEST_TIMEOUTS } from './helpers/tracker';
import { entranceCombobox, selectEntranceByLabel } from './helpers/entrance';

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

async function setInventoryItems(
  page: import('@playwright/test').Page,
  itemIds: string[],
) {
  await page.getByTestId('tab-inventory').click();

  for (const itemId of itemIds) {
    const card = page.getByTestId(`inventory-item-card-${itemId}`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(card).toHaveClass(/owned/);
  }
}

async function selectMapFromToolbar(
  page: import('@playwright/test').Page,
  mapNeedle: string,
) {
  await page.getByTestId('tab-world').click();
  const mapSelector = page.locator('#map-selector');
  await expect(mapSelector).toBeVisible();
  await mapSelector.click();
  await mapSelector.fill(mapNeedle);
  const option = page
    .locator('#map-selector-listbox .map-selector-option')
    .filter({ hasText: mapNeedle })
    .first();
  await expect(option).toBeVisible();
  await option.click();
}

test.describe('Grotto Entrance Randomizer', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('mapped Deku Theater grotto stays in the reachable list', async ({
    page,
  }) => {
    await applyGrottoShuffle(page);

    await openEntrancesTab(page);

    const dekuTheaterRow = page.locator('.entrance-row:not(.exit-row)').filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Theater' }),
    });
    await expect(dekuTheaterRow).toBeVisible();

    const dekuTheaterInput = entranceCombobox(page, 'Deku Theater');
    await selectEntranceByLabel(dekuTheaterInput, 'Road to Ikana Grotto');

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

    const shieldGraveRow = page.locator('.entrance-row:not(.exit-row)').filter({
      has: page.locator('.entrance-label', {
        hasText: 'Graveyard Shield Grave',
      }),
    });

    await expect(shieldGraveRow).toBeVisible({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
  });

  test('mapped Swamp gossip grotto shows Ocean gossip stones as reachable', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();
    await search.fill('games');

    const gamesSelect = page.getByTestId('setting-input-games');
    await expect(gamesSelect).toBeVisible();
    await gamesSelect.selectOption('mm');

    await applyGrottoShuffle(page);
    await openEntrancesTab(page);

    const reachabilityGroup = page.locator(
      '.entrances-panel [aria-label="Entrance reachability filter"]',
    );
    await expect(reachabilityGroup).toBeVisible();
    await reachabilityGroup.getByRole('button', { name: /^All\b/ }).click();

    const swampGossipRow = page.locator('.entrance-row:not(.exit-row)').filter({
      has: page.locator('.entrance-label', {
        hasText: 'Swamp Gossip Grotto',
      }),
    });
    await expect(swampGossipRow).toBeVisible();

    const swampGossipInput = entranceCombobox(page, 'Swamp Gossip Grotto');
    await selectEntranceByLabel(swampGossipInput, 'Ocean Gossip Grotto');

    await setInventoryItems(page, ['MM_OCARINA', 'MM_SONG_TIME']);
    await selectMapFromToolbar(page, 'MM Termina Field');

    const mappedSwampMarker = page.locator(
      '.ootmm-map .map-marker[data-code-list*="MM Termina Field Gossip Grotto Leftmost"][style*="left: 832px"][style*="top: 275px"]',
    );

    await expect(mappedSwampMarker).toBeVisible({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
  });
});
