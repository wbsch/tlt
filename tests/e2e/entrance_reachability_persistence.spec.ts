import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForBoot,
} from './helpers/tracker';
import {
  entranceCombobox,
  selectEntranceById,
  expectEntranceSelectedId,
} from './helpers/entrance';

const CLOCK_TOWER_ROOF_ITEMS: Record<string, number> = {
  MM_OCARINA: 1,
  MM_BOW: 1,
  MM_SONG_TIME: 1,
};

const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';

function dekuTreeInput(page: Page) {
  return entranceCombobox(page, 'Deku Tree');
}

async function openEntrancesTab(page: Page): Promise<void> {
  const sidebarToggle = page.getByTestId('right-sidebar-toggle');
  await expect(sidebarToggle).toBeVisible();
  if ((await sidebarToggle.getAttribute('aria-expanded')) === 'false') {
    await sidebarToggle.click();
  }
  await page.getByTestId('right-sidebar-tab-entrances').click();
}

async function readAllEntranceCount(page: Page): Promise<number> {
  await openEntrancesTab(page);
  const allButton = page
    .locator(
      '.entrances-panel [aria-label="Entrance reachability filter"] button',
    )
    .first();
  await expect(allButton).toBeVisible();
  const raw = (await allButton.textContent()) ?? '';
  const match = raw.match(/\((\d+)\)/);
  if (!match) {
    throw new Error(`Could not parse total entrance count from "${raw}"`);
  }
  return Number(match[1]);
}

async function setInventoryItems(
  page: Page,
  items: Record<string, number>,
): Promise<void> {
  await page.getByTestId('tab-inventory').click();
  for (const [itemId, count] of Object.entries(items)) {
    const card = page.getByTestId(`inventory-item-card-${itemId}`);
    await expect(card).toBeVisible();
    for (let i = 0; i < count; i += 1) {
      await card.click();
    }
    if (count > 0) {
      await expect(card).toHaveClass(/owned/);
    }
  }
}

async function selectMapFromToolbar(
  page: Page,
  mapNeedle: string,
): Promise<void> {
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

async function isCheckVisibleInCurrentMapMarkerPopups(
  page: Page,
  checkName: string,
): Promise<boolean> {
  await selectMapFromToolbar(page, 'Kokiri Forest');
  const safeNeedle = checkName.replace(/"/g, '\\"');
  const matchingMarker = page
    .locator(`.ootmm-map .map-marker[data-code-list*="${safeNeedle}"]`)
    .first();
  return (
    (await matchingMarker.count()) > 0 && (await matchingMarker.isVisible())
  );
}

test.describe('Entrance reachability persistence across refresh', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('dungeon entrance panel stays populated after browser refresh with ER enabled', async ({
    page,
  }) => {
    // --- Step 1: Enable dungeon ER (full) ---
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();
    await search.fill('Dungeon Entrance Shuffle');

    const erSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erSelect).toBeVisible();
    await erSelect.selectOption('full');

    await search.fill('Shuffle Major Dungeons');
    const erMajorDungeonsCheckbox = page.getByTestId(
      'setting-input-erMajorDungeons',
    );
    await expect(erMajorDungeonsCheckbox).toBeVisible();
    await erMajorDungeonsCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    const undoButton = page.getByRole('button', { name: /Undo/i });
    await page.getByTestId('apply-settings-button').click();
    await expect(undoButton).toBeEnabled({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });
    await expect(overlay).toBeHidden({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });

    // --- Step 2: Verify entrance panel has dungeon entries before refresh ---
    await expect
      .poll(() => readAllEntranceCount(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBeGreaterThan(0);

    const totalBeforeRefresh = await readAllEntranceCount(page);

    // --- Step 4: Reload the page (simulates browser refresh) ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    // --- Step 5: Verify entrance panel stays populated after refresh ---
    await expect
      .poll(() => readAllEntranceCount(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBe(totalBeforeRefresh);
  });

  test('Clock Tower Roof Skull Kid Ocarina is visible in Deku Tree submenu when Deku Tree is mapped to Clock Tower Roof', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();

    await search.fill('Dungeon Entrance Shuffle');
    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    await search.fill('Shuffle Major Dungeons');
    const erMajorDungeonsCheckbox = page.getByTestId(
      'setting-input-erMajorDungeons',
    );
    await expect(erMajorDungeonsCheckbox).toBeVisible();
    await erMajorDungeonsCheckbox.check();

    await search.fill('Clock Tower Roof');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    await erMoonCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({
      timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
    });

    await page.getByTestId('right-sidebar-tab-entrances').click();
    const input = dekuTreeInput(page);
    await expect(input).toBeVisible();
    await selectEntranceById(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expectEntranceSelectedId(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await setInventoryItems(page, CLOCK_TOWER_ROOF_ITEMS);

    await expect
      .poll(() =>
        isCheckVisibleInCurrentMapMarkerPopups(
          page,
          'Clock Tower Roof Skull Kid Ocarina',
        ),
      )
      .toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    await expect
      .poll(() =>
        isCheckVisibleInCurrentMapMarkerPopups(
          page,
          'Clock Tower Roof Skull Kid Ocarina',
        ),
      )
      .toBe(true);
  });
});
