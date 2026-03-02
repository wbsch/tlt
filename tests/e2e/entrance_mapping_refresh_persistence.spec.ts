import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  waitForBoot,
  waitForReachableFraction,
} from './helpers/tracker';

const DEKU_TREE_ENTRANCE_ID = 'OOT_DEKU_TREE';
const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';

async function readDekuTreeEntranceState(page: Page): Promise<{
  mappedTo: string | null;
  reachable: boolean;
}> {
  return page.evaluate(
    ({ dekuTreeId }) => {
      const rootEl = document.querySelector('.ootmm-tracker');
      const vm = (
        rootEl as {
          __vueParentComponent?: { appContext?: { provides?: unknown } };
        } | null
      )?.__vueParentComponent;
      const provides =
        (vm?.appContext?.provides as
          | Record<PropertyKey, unknown>
          | undefined) ?? {};
      const piniaKey = Object.getOwnPropertySymbols(provides).find((symbol) =>
        String(symbol).includes('pinia'),
      );
      const pinia = piniaKey
        ? (provides[piniaKey] as {
            _s?: Map<
              string,
              {
                entranceOverrides?: Record<string, string>;
                reachableEntranceIdSet?: Set<string>;
              }
            >;
          })
        : null;
      const store = pinia?._s?.get('ootmm-session');

      return {
        mappedTo: store?.entranceOverrides?.[dekuTreeId] ?? null,
        reachable: store?.reachableEntranceIdSet?.has(dekuTreeId) ?? false,
      };
    },
    { dekuTreeId: DEKU_TREE_ENTRANCE_ID },
  );
}

async function readEntranceOverrides(
  page: Page,
): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const rootEl = document.querySelector('.ootmm-tracker');
    const vm = (
      rootEl as {
        __vueParentComponent?: { appContext?: { provides?: unknown } };
      } | null
    )?.__vueParentComponent;
    const provides =
      (vm?.appContext?.provides as Record<PropertyKey, unknown> | undefined) ??
      {};
    const piniaKey = Object.getOwnPropertySymbols(provides).find((symbol) =>
      String(symbol).includes('pinia'),
    );
    const pinia = piniaKey
      ? (provides[piniaKey] as {
          _s?: Map<
            string,
            {
              entranceOverrides?: Record<string, string>;
            }
          >;
        })
      : null;
    const store = pinia?._s?.get('ootmm-session');
    return { ...(store?.entranceOverrides ?? {}) };
  });
}

function dekuTreeSelect(page: Page) {
  return page
    .locator('.entrance-row')
    .filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Tree' }),
    })
    .locator('.entrance-select');
}

test.describe('Entrance mapping refresh persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Deku Tree -> Clock Tower Roof stays mapped and reachable after refresh', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();

    await search.fill('erDungeons');
    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    await search.fill('erMoon');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    await erMoonCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Debug: Activate All' }).click();
    await waitForReachableFraction(page, 20_000);

    await page.getByTestId('right-sidebar-tab-entrances').click();
    const select = dekuTreeSelect(page);
    await expect(select).toBeVisible();
    await select.selectOption(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expect
      .poll(() => readDekuTreeEntranceState(page), { timeout: 15_000 })
      .toMatchObject({
        mappedTo: CLOCK_TOWER_ROOF_ENTRANCE_ID,
        reachable: true,
      });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    await page.getByTestId('right-sidebar-tab-entrances').click();
    const selectAfterRefresh = dekuTreeSelect(page);
    await expect(selectAfterRefresh).toBeVisible();
    await expect(selectAfterRefresh).toHaveValue(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expect
      .poll(() => readDekuTreeEntranceState(page), { timeout: 15_000 })
      .toMatchObject({
        mappedTo: CLOCK_TOWER_ROOF_ENTRANCE_ID,
        reachable: true,
      });
  });

  test('mapped entrances reset when ER settings are disabled', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();

    await search.fill('erDungeons');
    const erDungeonsSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erDungeonsSelect).toBeVisible();
    await erDungeonsSelect.selectOption('full');

    await search.fill('erMoon');
    const erMoonCheckbox = page.getByTestId('setting-input-erMoon');
    await expect(erMoonCheckbox).toBeVisible();
    await erMoonCheckbox.check();

    const overlay = page.getByTestId('applying-settings-overlay');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await page.getByTestId('right-sidebar-tab-entrances').click();
    const select = dekuTreeSelect(page);
    await expect(select).toBeVisible();
    await select.selectOption(CLOCK_TOWER_ROOF_ENTRANCE_ID);

    await expect
      .poll(() => readEntranceOverrides(page), { timeout: 15_000 })
      .toMatchObject({
        [DEKU_TREE_ENTRANCE_ID]: CLOCK_TOWER_ROOF_ENTRANCE_ID,
      });

    await page.getByTestId('tab-settings').click();
    await search.fill('erMoon');
    await erMoonCheckbox.uncheck();
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => readEntranceOverrides(page), { timeout: 15_000 })
      .not.toHaveProperty(DEKU_TREE_ENTRANCE_ID);

    await search.fill('erDungeons');
    await erDungeonsSelect.selectOption('none');
    await page.getByTestId('apply-settings-button').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => readEntranceOverrides(page), { timeout: 15_000 })
      .toEqual({});
  });
});
