import { expect, test, type Page } from '@playwright/test';
import { resetLocalStorageAndReload, TEST_TIMEOUTS } from './helpers/tracker';
import {
  entranceCombobox,
  selectEntranceById,
  clearEntranceMapping,
} from './helpers/entrance';

const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';
const NON_SELF_DESTINATION_ENTRANCE_ID = 'OOT_DEKU_TREE';
const CLOCK_TOWER_ROOF_CHECK_NEEDLE = 'MM Clock Tower Roof Skull Kid Ocarina';

function clockTowerRoofInput(page: Page) {
  return entranceCombobox(page, 'Clock Tower Roof');
}

async function openEntrancesTab(page: Page): Promise<void> {
  const sidebarToggle = page.getByTestId('right-sidebar-toggle');
  await expect(sidebarToggle).toBeVisible();
  if ((await sidebarToggle.getAttribute('aria-expanded')) === 'false') {
    await sidebarToggle.click();
  }
  await page.getByTestId('right-sidebar-tab-entrances').click();
}

async function resetEntranceFiltersToAll(page: Page): Promise<void> {
  const reachabilityGroup = page.locator(
    '.entrances-panel [aria-label="Entrance reachability filter"]',
  );
  await expect(reachabilityGroup).toBeVisible();
  await reachabilityGroup.locator('button').first().click();

  const mappingGroup = page.locator(
    '.entrances-panel [aria-label="Entrance mapping filter"]',
  );
  await expect(mappingGroup).toBeVisible();
  await mappingGroup.locator('button').first().click();
}

async function applyErSettings(
  page: Page,
  values: { erDungeons: 'full' | 'none'; erMoon: boolean },
): Promise<void> {
  await page.getByTestId('tab-settings').click();
  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('Dungeon Entrance Shuffle');
  const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
  await expect(erDungeonsSelect).toBeVisible();
  await erDungeonsSelect.selectOption(values.erDungeons);

  if (values.erDungeons === 'full') {
    await search.fill('Shuffle Major Dungeons');
    const erMajorDungeonsCheckbox = page.getByTestId(
      'setting-input-erMajorDungeons',
    );
    await expect(erMajorDungeonsCheckbox).toBeVisible();
    await erMajorDungeonsCheckbox.check();

    await search.fill('Clock Tower Roof');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    if (values.erMoon) {
      await erMoonCheckbox.check();
    } else {
      await erMoonCheckbox.uncheck();
    }
  }

  await page.getByTestId('apply-settings-button').click();
  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

async function setClockTowerRoofOverride(
  page: Page,
  destination: string | null,
): Promise<void> {
  await openEntrancesTab(page);
  await resetEntranceFiltersToAll(page);
  const input = clockTowerRoofInput(page);
  await expect(input).toBeVisible();
  if (destination) {
    await selectEntranceById(input, destination);
  } else {
    // If already mapped, clear it; if unmapped, nothing to do
    const selected = await input.getAttribute('data-selected');
    if (selected) {
      await clearEntranceMapping(input);
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

async function normalizeMapVisibilityFilters(page: Page): Promise<void> {
  await page.getByTestId('tab-world').click();

  const reachabilityGroup = page.getByRole('group', {
    name: 'Location reachability filter',
  });
  await expect(reachabilityGroup).toBeVisible();
  await reachabilityGroup.getByRole('button', { name: 'All' }).click();

  const collectionGroup = page.getByRole('group', {
    name: 'Location collection filter',
  });
  await expect(collectionGroup).toBeVisible();
  await collectionGroup.getByRole('button', { name: 'All' }).click();

  const visibilityToggles = page.getByRole('group', {
    name: 'Location visibility toggles',
  });
  await expect(visibilityToggles).toBeVisible();
  await visibilityToggles
    .getByRole('checkbox', { name: 'Unshuffled Tokens/Fairies' })
    .check();
  await visibilityToggles
    .getByRole('checkbox', { name: 'Gossip Stones' })
    .check();
}

async function isClockTowerRoofMarkerVisible(page: Page): Promise<boolean> {
  await selectMapFromToolbar(page, 'Termina Field');
  const safeNeedle = CLOCK_TOWER_ROOF_CHECK_NEEDLE.replace(/"/g, '\\"');
  const marker = page
    .locator(`.ootmm-map .map-marker[data-code-list*="${safeNeedle}"]`)
    .first();
  return (await marker.count()) > 0 && (await marker.isVisible());
}

test.describe('Clock Tower marker visibility', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Clock Tower Roof checks on Termina Field are visible only when unshuffled or self-mapped', async ({
    page,
  }) => {
    await selectMapFromToolbar(page, 'Termina Field');
    await normalizeMapVisibilityFilters(page);

    await applyErSettings(page, { erDungeons: 'full', erMoon: true });

    await setClockTowerRoofOverride(page, null);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBe(false);

    await setClockTowerRoofOverride(page, NON_SELF_DESTINATION_ENTRANCE_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBe(false);

    await setClockTowerRoofOverride(page, CLOCK_TOWER_ROOF_ENTRANCE_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBe(true);

    await applyErSettings(page, { erDungeons: 'none', erMoon: false });
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toBe(true);
  });
});
