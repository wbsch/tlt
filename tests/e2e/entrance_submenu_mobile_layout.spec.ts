import { expect, test as base, type Page } from '@playwright/test';
import {
  captureTrackerStorageState,
  gotoTracker,
  TEST_TIMEOUTS,
  type TrackerStorageState,
} from './helpers/tracker';

function mapSubmenuEntranceSelect(page: Page, label: string) {
  return page
    .locator(
      '.map-submenu-panel .map-entrance-list:not(.map-exit-list) .map-entrance-list__row',
    )
    .filter({ hasText: label })
    .locator('.destination-combobox__input')
    .first();
}

function mapSubmenuEntranceInputs(page: Page) {
  return page.locator(
    '.map-submenu-panel .map-entrance-list:not(.map-exit-list) .destination-combobox__input',
  );
}

async function applyInteriorErSettings(page: Page): Promise<void> {
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
  }

  expect(count).toBeGreaterThan(0);
  throw new Error(
    `Could not find submenu marker for entrance label "${label}"`,
  );
}

async function openLowestEntranceSubmenuInput(page: Page) {
  const submenuMarkers = page.locator(
    '.ootmm-map .map-marker[aria-label^="Submenu marker:"]',
  );
  const submenuPanel = page.locator('.map-submenu-panel');
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const viewportHeight = page.viewportSize()?.height ?? 0;
  const count = await submenuMarkers.count();

  let bestMarkerIndex = -1;
  let bestInputIndex = -1;
  let smallestSpaceBelow = Number.POSITIVE_INFINITY;

  for (let markerIndex = 0; markerIndex < count; markerIndex += 1) {
    const marker = submenuMarkers.nth(markerIndex);
    const markerBox = await marker.boundingBox();
    if (
      !markerBox ||
      markerBox.x + markerBox.width <= 0 ||
      markerBox.x >= viewportWidth ||
      markerBox.y + markerBox.height <= 0 ||
      markerBox.y >= viewportHeight
    ) {
      continue;
    }

    await marker.click({ force: true });
    await expect(submenuPanel).toBeVisible();

    const inputs = mapSubmenuEntranceInputs(page);
    const inputCount = await inputs.count();

    for (let inputIndex = 0; inputIndex < inputCount; inputIndex += 1) {
      const inputBox = await inputs.nth(inputIndex).boundingBox();
      if (!inputBox) continue;

      const spaceBelow = viewportHeight - (inputBox.y + inputBox.height);
      if (spaceBelow < smallestSpaceBelow) {
        smallestSpaceBelow = spaceBelow;
        bestMarkerIndex = markerIndex;
        bestInputIndex = inputIndex;
      }
    }
  }

  expect(bestMarkerIndex).toBeGreaterThanOrEqual(0);
  expect(bestInputIndex).toBeGreaterThanOrEqual(0);

  await submenuMarkers.nth(bestMarkerIndex).click({ force: true });
  await expect(submenuPanel).toBeVisible();

  const targetInput = mapSubmenuEntranceInputs(page).nth(bestInputIndex);
  await expect(targetInput).toBeVisible();
  return targetInput;
}

const MOBILE_CONTEXT_OPTIONS = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
} as const;

const test = base.extend<
  Record<string, never>,
  { interiorErMobileStorageState: TrackerStorageState }
>({
  interiorErMobileStorageState: [
    async ({ browser }, use) => {
      const storageState = await captureTrackerStorageState(
        browser,
        applyInteriorErSettings,
        MOBILE_CONTEXT_OPTIONS,
      );
      await use(storageState);
    },
    { scope: 'worker' },
  ],
  context: async ({ browser, interiorErMobileStorageState }, use) => {
    const context = await browser.newContext({
      ...MOBILE_CONTEXT_OPTIONS,
      storageState: interiorErMobileStorageState,
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await gotoTracker(page);
    await use(page);
  },
});

test.describe.configure({ mode: 'parallel' });

test.describe('mobile entrance submenu layout', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('keeps entrance comboboxes inside the submenu panel', async ({
    page,
  }) => {
    await selectMapFromToolbar(page, 'Kokiri Forest');
    await resetMapFiltersToAll(page);
    await openMapSubmenuForEntranceLabel(page, "Link's House");

    const submenuPanel = page.locator('.map-submenu-panel');
    const entranceSelect = mapSubmenuEntranceSelect(page, "Link's House");

    const panelBox = await submenuPanel.boundingBox();
    const inputBox = await entranceSelect.boundingBox();

    expect(panelBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(
      panelBox!.x + panelBox!.width,
    );
  });

  test('opens lower entrance dropdowns upward when needed', async ({
    page,
  }) => {
    await selectMapFromToolbar(page, 'Hyrule Field');
    await resetMapFiltersToAll(page);

    const targetInput = await openLowestEntranceSubmenuInput(page);
    const viewportHeight = page.viewportSize()?.height ?? 0;

    const inputBox = await targetInput.boundingBox();
    expect(inputBox).not.toBeNull();

    await targetInput.click();

    const listbox = targetInput
      .locator('..')
      .locator('.destination-combobox__options');
    await expect(listbox).toBeVisible();

    const listboxBox = await listbox.boundingBox();
    expect(listboxBox).not.toBeNull();
    expect(listboxBox!.y).toBeGreaterThanOrEqual(0);
    expect(listboxBox!.y + listboxBox!.height).toBeLessThanOrEqual(
      viewportHeight,
    );

    const availableBelow = viewportHeight - (inputBox!.y + inputBox!.height);
    if (availableBelow < listboxBox!.height) {
      expect(listboxBox!.y + listboxBox!.height).toBeLessThanOrEqual(
        inputBox!.y + 1,
      );
    }
  });
});
