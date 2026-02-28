import { expect, test } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  waitForBoot,
  waitForReachableFraction,
} from './helpers/tracker';

/**
 * Items that together make OOT Forest Temple entrance reachable:
 *   OOT_OCARINA, OOT_HOOKSHOT, OOT_SWORD_MASTER, OOT_SONG_SARIA, OOT_SONG_TIME
 */
const FOREST_TEMPLE_ITEMS: Record<string, number> = {
  OOT_OCARINA: 1,
  OOT_HOOKSHOT: 1,
  OOT_SWORD_MASTER: 1,
  OOT_SONG_SARIA: 1,
  OOT_SONG_TIME: 1,
};

/** Read reachable entrance IDs from the Pinia store inside the page. */
async function getReachableEntranceIds(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  return page.evaluate(() => {
    const app = document.querySelector('#app') as HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $pinia: unknown } } };
    };
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s: Map<string, { reachableEntranceIdSet: Set<string> }> }
      | undefined;
    const store = pinia?._s.get('ootmm-session');
    if (!store) return [];
    return Array.from(store.reachableEntranceIdSet ?? []);
  });
}

test.describe('Entrance reachability persistence across refresh', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Forest Temple entrance stays reachable after browser refresh with ER and items', async ({
    page,
  }) => {
    // --- Step 1: Enable dungeon ER (full) ---
    await page.getByTestId('tab-settings').click();

    const search = page.getByTestId('settings-search-input');
    await expect(search).toBeVisible();
    await search.fill('erDungeons');

    const erSelect = page.getByTestId('setting-input-erDungeons');
    await expect(erSelect).toBeVisible();
    await erSelect.selectOption('full');

    const overlay = page.getByTestId('applying-settings-overlay');
    const undoButton = page.getByRole('button', { name: /Undo/i });
    await page.getByTestId('apply-settings-button').click();
    await expect(undoButton).toBeEnabled({ timeout: 15_000 });
    await expect(overlay).toBeHidden({ timeout: 15_000 });

    // --- Step 2: Activate required items via store API ---
    await page.getByTestId('tab-items').click();
    await waitForReachableFraction(page, 15_000);

    await page.evaluate((items) => {
      const app = document.querySelector('#app') as HTMLElement & {
        __vue_app__?: { config: { globalProperties: { $pinia: unknown } } };
      };
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | {
            _s: Map<
              string,
              {
                setInventoryFromMap: (inv: Map<string, number>) => void;
              }
            >;
          }
        | undefined;
      const store = pinia?._s.get('ootmm-session');
      if (!store) throw new Error('Store not found');
      store.setInventoryFromMap(new Map(Object.entries(items)));
    }, FOREST_TEMPLE_ITEMS);

    // --- Step 3: Verify Forest Temple is reachable before refresh ---
    await expect
      .poll(() => getReachableEntranceIds(page), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['OOT_TEMPLE_FOREST']));

    const reachableBefore = await getReachableEntranceIds(page);
    expect(reachableBefore).toContain('OOT_TEMPLE_FOREST');

    // --- Step 4: Reload the page (simulates browser refresh) ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    // --- Step 5: Verify Forest Temple is still reachable after refresh ---
    await expect
      .poll(() => getReachableEntranceIds(page), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['OOT_TEMPLE_FOREST']));

    const reachableAfter = await getReachableEntranceIds(page);
    expect(reachableAfter).toContain('OOT_TEMPLE_FOREST');
  });
});
