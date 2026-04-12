import { expect, test, type Page } from '@playwright/test';
import { gotoTracker, TEST_TIMEOUTS } from './helpers/tracker';

const MQ_GOSSIP_COORDS: [number, number] = [278, 337];
const NON_MQ_GOSSIP_COORDS: [number, number] = [341, 313];
const MQ_DUNGEON_CODES = [
  'DT',
  'DC',
  'JJ',
  'Forest',
  'Fire',
  'Water',
  'Spirit',
  'Shadow',
  'BotW',
  'IC',
  'GTG',
  'Ganon',
] as const;

type Scenario = {
  includeDc: boolean;
  values: string[];
};

function shuffle<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildRandomScenario(includeDc: boolean): Scenario {
  const nonDc = MQ_DUNGEON_CODES.filter((code) => code !== 'DC');
  const shuffled = shuffle(nonDc);
  const count = Math.floor(Math.random() * (nonDc.length + 1));
  const values = shuffled.slice(0, count);
  if (includeDc) values.push('DC');
  return { includeDc, values };
}

/**
 * Select a map by typing its title into the map selector combobox.
 */
async function selectMap(page: Page, mapTitle: string): Promise<void> {
  const input = page.locator('#map-selector');
  await input.click();
  await input.fill(mapTitle);
  const option = page
    .locator('.map-selector-option')
    .filter({ hasText: mapTitle })
    .first();
  await expect(option).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
  await option.click();
}

/**
 * Set the map toolbar filters so all markers are potentially visible.
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
 * Configure MQ dungeon setting to "specific" with the given dungeon codes
 * via the Settings UI tab, then apply.
 */
async function applyMqDungeonSpecificSetting(
  page: Page,
  values: string[],
): Promise<void> {
  await page.getByTestId('tab-settings').click();

  const mqSelect = page.getByTestId('setting-input-mqDungeons');
  await expect(mqSelect).toBeVisible({
    timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
  });

  await mqSelect.selectOption('specific');

  const settingBlock = page.getByTestId('setting-mqDungeons');
  await expect(
    settingBlock.locator('.setting-multiselect-options'),
  ).toBeVisible();

  const valuesSet = new Set(values);
  const options = settingBlock.locator('.multiselect-option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const dataValue = await option.getAttribute('data-value');
    if (!dataValue) continue;
    const input = option.locator('input[type="checkbox"]');
    const shouldBeChecked = valuesSet.has(dataValue);
    const isChecked = await input.isChecked();
    if (shouldBeChecked && !isChecked) {
      await input.check();
    } else if (!shouldBeChecked && isChecked) {
      await input.uncheck();
    }
  }

  await page.getByTestId('apply-settings-button').click();
  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

/**
 * Locate a gossip-stone map marker at exact pixel coordinates.
 */
function gossipStoneAt(page: Page, coords: [number, number]) {
  return page
    .locator(
      `.map-marker[style*="left: ${coords[0]}px"][style*="top: ${coords[1]}px"]`,
    )
    .filter({ has: page.locator('img[src*="gossip_stone"]') });
}

test.describe('OoTMM map marker visibility', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('Dodongo gossip stones switch visibility based on mqDungeons containing DC', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.getByTestId('tab-world').click();
    await selectMap(page, 'OOT Dodongos Cavern');
    await normalizeMapVisibilityFilters(page);

    const scenarios: Scenario[] = [];
    for (let i = 0; i < 6; i += 1) {
      scenarios.push(buildRandomScenario(i % 2 === 0));
    }

    for (const scenario of scenarios) {
      await applyMqDungeonSpecificSetting(page, scenario.values);

      // Return to world tab to verify map markers
      await page.getByTestId('tab-world').click();

      const mqStone = gossipStoneAt(page, MQ_GOSSIP_COORDS);
      const nonMqStone = gossipStoneAt(page, NON_MQ_GOSSIP_COORDS);

      if (scenario.includeDc) {
        await expect(mqStone).toBeVisible({
          timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
        });
        await expect(nonMqStone).toHaveCount(0);
      } else {
        await expect(nonMqStone).toBeVisible({
          timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
        });
        await expect(mqStone).toHaveCount(0);
      }
    }
  });
});
