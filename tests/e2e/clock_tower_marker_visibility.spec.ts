import { expect, test } from '@playwright/test';
import { resetLocalStorageAndReload } from './helpers/tracker';

const TERMINA_FIELD_MAP_ID = 'mm_termina_field';
const CLOCK_TOWER_ROOF_ENTRANCE_ID = 'MM_CLOCK_TOWER_ROOF';
const NON_SELF_DESTINATION_ENTRANCE_ID = 'OOT_DEKU_TREE';

type VueInternalComponent = {
  setupState?: Record<string, unknown>;
};

type VueHostElement = HTMLElement & {
  __vueParentComponent?: VueInternalComponent;
};

async function setActiveMap(
  page: import('@playwright/test').Page,
  mapId: string,
) {
  await page.evaluate((nextMapId) => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as VueHostElement).__vueParentComponent
      : null;
    const setup = component?.setupState;
    if (!setup || typeof setup.activeMapId !== 'string') {
      throw new Error('Could not resolve activeMapId ref');
    }
    setup.activeMapId = nextMapId;
  }, mapId);
}

async function normalizeMapVisibilityFilters(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(() => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as VueHostElement).__vueParentComponent
      : null;
    const setup = component?.setupState;
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

async function applyErSettings(
  page: import('@playwright/test').Page,
  settings: Record<string, unknown>,
) {
  await page.evaluate(async (nextSettings) => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as VueHostElement).__vueParentComponent
      : null;
    const setup = component?.setupState;
    const applySettings = setup?.handleSettingsChange;
    if (typeof applySettings !== 'function') {
      throw new Error('Could not resolve settings apply handler');
    }
    await applySettings(nextSettings);
  }, settings);

  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: 15_000,
  });
}

async function setEntranceOverride(
  page: import('@playwright/test').Page,
  src: string,
  dst: string | null,
) {
  await page.evaluate(
    async ({ nextSrc, nextDst }) => {
      const app = document.querySelector('#app') as HTMLElement & {
        __vue_app__?: { config: { globalProperties: { $pinia: unknown } } };
      };
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | {
            _s: Map<
              string,
              {
                setEntranceOverride: (
                  srcId: string,
                  dstId: string | null,
                ) => void;
              }
            >;
          }
        | undefined;
      const store = pinia?._s.get('ootmm-session');
      if (!store) throw new Error('Store not found');
      store.setEntranceOverride(nextSrc, nextDst);

      const waitForApply = async () => {
        const start = performance.now();
        while (performance.now() - start < 15_000) {
          if (!store.isApplyingSettings) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            if (!store.isApplyingSettings) return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      };
      await waitForApply();
    },
    { nextSrc: src, nextDst: dst },
  );
}

async function isClockTowerRoofMarkerVisible(
  page: import('@playwright/test').Page,
): Promise<boolean> {
  return page.evaluate(() => {
    const mapRoot = document.querySelector('.ootmm-map');
    const component = mapRoot
      ? (mapRoot as VueHostElement).__vueParentComponent
      : null;
    const setup = component?.setupState;
    const rawMarkerViewModels = setup?.markerViewModels;
    const markerViewModels = Array.isArray(rawMarkerViewModels)
      ? rawMarkerViewModels
      : Array.isArray(rawMarkerViewModels?.value)
        ? rawMarkerViewModels.value
        : [];
    const visibleMarkers = markerViewModels.filter(
      (marker: { isVisible?: boolean }) => Boolean(marker?.isVisible),
    );

    return visibleMarkers.some((marker: { submenuMarkers?: unknown[] }) => {
      if (!Array.isArray(marker?.submenuMarkers)) return false;
      return marker.submenuMarkers.some((submenuMarker) => {
        const codeList = (submenuMarker as { codeList?: unknown }).codeList;
        if (!Array.isArray(codeList)) return false;
        return codeList.some(
          (code) =>
            typeof code === 'string' &&
            code.includes('MM Clock Tower Roof Skull Kid Ocarina'),
        );
      });
    });
  });
}

test.describe('Clock Tower marker visibility', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Clock Tower Roof checks on Termina Field are visible only when unshuffled or self-mapped', async ({
    page,
  }) => {
    await setActiveMap(page, TERMINA_FIELD_MAP_ID);
    await normalizeMapVisibilityFilters(page);

    const baseSettings = await page.evaluate(() => {
      const app = document.querySelector('#app') as HTMLElement & {
        __vue_app__?: { config: { globalProperties: { $pinia: unknown } } };
      };
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s: Map<string, { trackerSettings?: Record<string, unknown> }> }
        | undefined;
      const store = pinia?._s.get('ootmm-session');
      return { ...(store?.trackerSettings ?? {}) };
    });

    await applyErSettings(page, {
      ...baseSettings,
      games: 'ootmm',
      erDungeons: 'full',
      erMoon: true,
    });

    await setEntranceOverride(page, CLOCK_TOWER_ROOF_ENTRANCE_ID, null);
    await setActiveMap(page, TERMINA_FIELD_MAP_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), { timeout: 15_000 })
      .toBe(false);

    await setEntranceOverride(
      page,
      CLOCK_TOWER_ROOF_ENTRANCE_ID,
      NON_SELF_DESTINATION_ENTRANCE_ID,
    );
    await setActiveMap(page, TERMINA_FIELD_MAP_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), { timeout: 15_000 })
      .toBe(false);

    await setEntranceOverride(
      page,
      CLOCK_TOWER_ROOF_ENTRANCE_ID,
      CLOCK_TOWER_ROOF_ENTRANCE_ID,
    );
    await setActiveMap(page, TERMINA_FIELD_MAP_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), { timeout: 15_000 })
      .toBe(true);

    await applyErSettings(page, {
      ...baseSettings,
      games: 'ootmm',
      erDungeons: 'none',
      erMoon: false,
    });
    await setActiveMap(page, TERMINA_FIELD_MAP_ID);
    await expect
      .poll(() => isClockTowerRoofMarkerVisible(page), { timeout: 15_000 })
      .toBe(true);
  });
});
