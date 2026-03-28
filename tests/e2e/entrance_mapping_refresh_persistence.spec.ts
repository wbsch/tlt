import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  TEST_TIMEOUTS,
  waitForBoot,
} from './helpers/tracker';
import {
  entranceCombobox,
  selectEntranceById,
  clearEntranceMapping,
  expectEntranceSelectedId,
  expectEntranceUnmapped,
} from './helpers/entrance';

const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';
const WINDMILL_ENTRANCE_ID = 'OOT_WINDMILL';

function dekuTreeInput(page: Page) {
  return entranceCombobox(page, 'Deku Tree');
}

function entranceInput(page: Page, label: string) {
  return entranceCombobox(page, label);
}

function mapSubmenuEntranceSelect(page: Page, label: string) {
  return page
    .locator('.map-submenu-panel .map-entrance-list__row')
    .filter({ hasText: label })
    .locator('.map-entrance-list__select');
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

async function applyDungeonErSettings(page: Page): Promise<void> {
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
}

async function applyInteriorErSettings(
  page: Page,
  options?: { gameLinks?: boolean },
): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const search = page.getByTestId('settings-search-input');
  await expect(search).toBeVisible();

  await search.fill('erIndoors');
  const erIndoorsSelect = page.getByTestId('setting-input-erIndoors');
  await expect(erIndoorsSelect).toBeVisible();
  await erIndoorsSelect.selectOption('full');

  await search.fill('erIndoorsMajor');
  const erIndoorsMajorCheckbox = page.getByTestId(
    'setting-input-erIndoorsMajor',
  );
  await expect(erIndoorsMajorCheckbox).toBeVisible();
  await erIndoorsMajorCheckbox.check();

  await search.fill('erIndoorsExtra');
  const erIndoorsExtraCheckbox = page.getByTestId(
    'setting-input-erIndoorsExtra',
  );
  await expect(erIndoorsExtraCheckbox).toBeVisible();
  await erIndoorsExtraCheckbox.check();

  if (options?.gameLinks) {
    await search.fill('erIndoorsGameLinks');
    const erIndoorsGameLinksCheckbox = page.getByTestId(
      'setting-input-erIndoorsGameLinks',
    );
    await expect(erIndoorsGameLinksCheckbox).toBeVisible();
    await erIndoorsGameLinksCheckbox.check();
  }

  const overlay = page.getByTestId('applying-settings-overlay');
  await page.getByTestId('apply-settings-button').click();
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
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

async function resetMapFiltersToAll(page: Page): Promise<void> {
  const locationReachabilityGroup = page.locator(
    '.map-toolbar [aria-label="Location reachability filter"]',
  );
  await expect(locationReachabilityGroup).toBeVisible();
  await locationReachabilityGroup.locator('button').first().click();

  const locationCollectionGroup = page.locator(
    '.map-toolbar [aria-label="Location collection filter"]',
  );
  await expect(locationCollectionGroup).toBeVisible();
  await locationCollectionGroup.locator('button').first().click();

  const entranceReachabilityGroup = page.locator(
    '.map-toolbar [aria-label="Entrance reachability filter"]',
  );
  if ((await entranceReachabilityGroup.count()) > 0) {
    await entranceReachabilityGroup.locator('button').first().click();
  }

  const entranceMappingGroup = page.locator(
    '.map-toolbar [aria-label="Entrance mapping filter"]',
  );
  if ((await entranceMappingGroup.count()) > 0) {
    await entranceMappingGroup.locator('button').first().click();
  }
}

async function openMapSubmenuForEntranceLabel(
  page: Page,
  label: string,
): Promise<void> {
  const submenuMarkers = page.locator(
    '.ootmm-map .map-marker[aria-label^="Submenu marker:"]',
  );
  const count = await submenuMarkers.count();
  const submenuPanel = page.locator('.map-submenu-panel');

  for (let index = 0; index < count; index += 1) {
    await submenuMarkers.nth(index).click({ force: true });
    await expect(submenuPanel).toBeVisible();
    const select = mapSubmenuEntranceSelect(page, label);
    if ((await select.count()) > 0) {
      await expect(select).toBeVisible();
      return;
    }
    await page.keyboard.press('Escape');
    await expect(submenuPanel).toBeHidden();
  }

  expect(count).toBeGreaterThan(0);
  throw new Error(
    `Could not find submenu marker for entrance label "${label}"`,
  );
}

function entranceReachabilityGroup(page: Page) {
  return page.locator(
    '.entrances-panel [aria-label="Entrance reachability filter"]',
  );
}

function entranceMappingGroup(page: Page) {
  return page.locator(
    '.entrances-panel [aria-label="Entrance mapping filter"]',
  );
}

test.describe('Entrance mapping refresh persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Deku Tree can be mapped to Clock Tower Roof via the Entrances UI', async ({
    page,
  }) => {
    await applyDungeonErSettings(page);

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);
    const input = dekuTreeInput(page);
    await expect(input).toBeVisible();
    await selectEntranceById(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expectEntranceSelectedId(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);
  });

  test('Deku Tree mapping can be cleared via Not mapped option', async ({
    page,
  }) => {
    await applyDungeonErSettings(page);

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);
    const input = dekuTreeInput(page);
    await expect(input).toBeVisible();
    await selectEntranceById(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expectEntranceSelectedId(input, CLOCK_TOWER_ROOF_ENTRANCE_ID);
    await clearEntranceMapping(input);
    await expectEntranceUnmapped(dekuTreeInput(page));
  });

  test("Link's House can be mapped to Windmill via the Entrances UI", async ({
    page,
  }) => {
    await applyInteriorErSettings(page);

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);
    const input = entranceInput(page, "Link's House");
    await expect(input).toBeVisible();
    await selectEntranceById(input, WINDMILL_ENTRANCE_ID);

    await expectEntranceSelectedId(input, WINDMILL_ENTRANCE_ID);
  });

  test('Clock Tower and Mask Shop appear when interior game links are enabled', async ({
    page,
  }) => {
    await applyInteriorErSettings(page, { gameLinks: true });

    await openEntrancesTab(page);
    await resetEntranceFiltersToAll(page);

    await expect(entranceInput(page, 'Clock Tower')).toBeVisible();
    await expect(entranceInput(page, 'Market Mask Shop')).toBeVisible();
  });

  test("Link's House can be mapped from the Kokiri Forest map submenu", async ({
    page,
  }) => {
    await applyInteriorErSettings(page);
    await selectMapFromToolbar(page, 'Kokiri Forest');
    await resetMapFiltersToAll(page);
    await openMapSubmenuForEntranceLabel(page, "Link's House");

    const select = mapSubmenuEntranceSelect(page, "Link's House");
    await expect(select).toBeVisible();
    await select.selectOption(WINDMILL_ENTRANCE_ID);

    await expect(select).toHaveValue(WINDMILL_ENTRANCE_ID);
  });

  test('entrance filters stay selected after browser refresh', async ({
    page,
  }) => {
    await applyDungeonErSettings(page);

    await openEntrancesTab(page);

    const reachabilityGroup = entranceReachabilityGroup(page);
    const mappingGroup = entranceMappingGroup(page);
    const unreachableButton = reachabilityGroup.getByRole('button', {
      name: /^Unreachable\b/,
    });
    const mappedButton = mappingGroup.getByRole('button', {
      name: /^Mapped\b/,
    });

    await expect(unreachableButton).toBeVisible();
    await expect(mappedButton).toBeVisible();

    await unreachableButton.click();
    await mappedButton.click();

    await expect(unreachableButton).toHaveClass(/active/);
    await expect(mappedButton).toHaveClass(/active/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await openEntrancesTab(page);

    await expect(
      entranceReachabilityGroup(page).getByRole('button', {
        name: /^Unreachable\b/,
      }),
    ).toHaveClass(/active/);
    await expect(
      entranceMappingGroup(page).getByRole('button', {
        name: /^Mapped\b/,
      }),
    ).toHaveClass(/active/);
  });
});
