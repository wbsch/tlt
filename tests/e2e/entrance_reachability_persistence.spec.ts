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

const CLOCK_TOWER_ROOF_ITEMS: Record<string, number> = {
  MM_OCARINA: 1,
  MM_BOW: 1,
  MM_SONG_TIME: 1,
};

const KOKIRI_FOREST_MAP_ID = 'oot_kokiri_forest';
const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';
const DEKU_TREE_ENTRANCE_ID = 'OOT_DEKU_TREE';

function dekuTreeSelect(page: import('@playwright/test').Page) {
  return page
    .locator('.entrance-row')
    .filter({
      has: page.locator('.entrance-label', { hasText: 'Deku Tree' }),
    })
    .locator('.entrance-select');
}

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

async function isLocationReachableByName(
  page: import('@playwright/test').Page,
  locationName: string,
): Promise<boolean> {
  return page.evaluate((targetName) => {
    const app = document.querySelector('#app') as HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $pinia: unknown } } };
    };
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | {
          _s: Map<
            string,
            {
              allLocations?: Array<{ id: string; name?: string }>;
              reachableLocationIds?: string[];
            }
          >;
        }
      | undefined;
    const store = pinia?._s.get('ootmm-session');
    if (!store) return false;

    const allLocations = Array.isArray(store.allLocations)
      ? store.allLocations
      : [];
    const target = allLocations.find(
      (location) => location.name === targetName,
    );
    if (!target?.id) return false;

    const reachableSet = new Set(
      Array.isArray(store.reachableLocationIds)
        ? store.reachableLocationIds
        : [],
    );
    return reachableSet.has(target.id);
  }, locationName);
}

async function setActiveMapId(
  page: import('@playwright/test').Page,
  mapId: string,
): Promise<void> {
  await page.evaluate((nextMapId) => {
    const trackerRoot = document.querySelector('.ootmm-tracker') as
      | (HTMLElement & {
          __vueParentComponent?: {
            setupState?: Record<string, unknown>;
          };
        })
      | null;
    const setup = trackerRoot?.__vueParentComponent?.setupState;
    if (!setup || typeof setup.activeMapId !== 'string') {
      throw new Error('Could not resolve activeMapId ref');
    }
    setup.activeMapId = nextMapId;
  }, mapId);
}

async function normalizeMapVisibilityFilters(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.evaluate(() => {
    const trackerRoot = document.querySelector('.ootmm-tracker') as
      | (HTMLElement & {
          __vueParentComponent?: {
            setupState?: Record<string, unknown>;
          };
        })
      | null;
    const setup = trackerRoot?.__vueParentComponent?.setupState;
    if (!setup) {
      throw new Error('Could not resolve tracker setup state');
    }

    setup.locationsSearchQuery = '';
    setup.locationsSelectedCategory = 'all';
    setup.locationsReachabilityFilter = 'all';
    setup.locationsCollectionFilter = 'all';
    setup.locationsShowGossipStones = true;
    setup.locationsShowUnshuffled = true;
  });
}

async function isCodeVisibleInCurrentMapSubmenus(
  page: import('@playwright/test').Page,
  codeNeedle: string,
): Promise<boolean> {
  return page.evaluate((needle) => {
    const mapRoot = document.querySelector('.ootmm-map') as
      | (HTMLElement & {
          __vueParentComponent?: {
            setupState?: Record<string, unknown>;
          };
        })
      | null;
    const setup = mapRoot?.__vueParentComponent?.setupState;
    const rawMarkerViewModels = setup?.markerViewModels as
      | unknown[]
      | { value?: unknown[] }
      | undefined;
    const markerViewModels = Array.isArray(rawMarkerViewModels)
      ? rawMarkerViewModels
      : Array.isArray(rawMarkerViewModels?.value)
        ? rawMarkerViewModels.value
        : [];
    const visibleMarkers = markerViewModels.filter(
      (marker) =>
        Boolean((marker as { isVisible?: boolean })?.isVisible) &&
        Array.isArray(
          (marker as { submenuMarkers?: unknown[] })?.submenuMarkers,
        ),
    ) as Array<{ submenuMarkers: unknown[] }>;

    return visibleMarkers.some((marker) =>
      marker.submenuMarkers.some((submenuMarker) => {
        const codeList = (submenuMarker as { codeList?: unknown }).codeList;
        if (!Array.isArray(codeList)) return false;
        return codeList.some(
          (code) => typeof code === 'string' && code.includes(needle),
        );
      }),
    );
  }, codeNeedle);
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

  test('Clock Tower Roof Skull Kid Ocarina is visible in Deku Tree submenu when Deku Tree is mapped to Clock Tower Roof', async ({
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

    await expect(select).toHaveValue(CLOCK_TOWER_ROOF_ENTRANCE_ID);

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
    }, CLOCK_TOWER_ROOF_ITEMS);

    await expect
      .poll(
        () =>
          isLocationReachableByName(
            page,
            'MM Clock Tower Roof Skull Kid Ocarina',
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    await setActiveMapId(page, KOKIRI_FOREST_MAP_ID);
    await normalizeMapVisibilityFilters(page);
    await expect
      .poll(
        () =>
          isCodeVisibleInCurrentMapSubmenus(
            page,
            'MM Clock Tower Roof Skull Kid Ocarina',
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
  });
});
