import { expect, test, type Page } from '@playwright/test';
import { resetLocalStorageAndReload } from './helpers/tracker';

const DODONGO_MAP_ID = 'oot_dodongos_cavern';
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

type VisibilitySnapshot = {
  activeMapId: string | null;
  mqStoneVisible: boolean;
  nonMqStoneVisible: boolean;
};

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

type VueInternalComponent = {
  setupState?: Record<string, unknown>;
  props?: Record<string, unknown>;
};

type VueHostElement = HTMLElement & {
  __vueParentComponent?: VueInternalComponent;
};

type MapMarker = {
  image?: string;
  coords?: [number, number];
};

async function setActiveMap(page: Page, mapId: string): Promise<void> {
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

async function normalizeMapVisibilityFilters(page: Page): Promise<void> {
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

async function applyMqDungeonSpecificSetting(
  page: Page,
  values: string[],
): Promise<void> {
  await page.evaluate(async (nextValues) => {
    const trackerRoot = document.querySelector('.ootmm-tracker');
    const component = trackerRoot
      ? (trackerRoot as VueHostElement).__vueParentComponent
      : null;
    const setup = component?.setupState;
    const applySettings = setup?.handleSettingsChange;
    const trackerSettings = setup?.trackerSettings;
    if (typeof applySettings !== 'function' || !trackerSettings) {
      throw new Error('Could not resolve settings apply handler');
    }

    const nextSettings = {
      ...trackerSettings,
      mqDungeons: {
        type: 'specific',
        values: nextValues,
      },
    };

    await applySettings(nextSettings);
  }, values);

  await expect(page.getByTestId('applying-settings-overlay')).toBeHidden({
    timeout: 15_000,
  });
}

async function readDodongoGossipVisibility(
  page: Page,
): Promise<VisibilitySnapshot> {
  return page.evaluate(
    ({ mqCoords, nonMqCoords }) => {
      const mapRoot = document.querySelector('.ootmm-map');
      const component = mapRoot
        ? (mapRoot as VueHostElement).__vueParentComponent
        : null;
      const rawVisibleMarkers = component?.setupState?.visibleMarkers;
      const visibleMarkers = Array.isArray(rawVisibleMarkers)
        ? rawVisibleMarkers
        : Array.isArray(rawVisibleMarkers?.value)
          ? rawVisibleMarkers.value
          : null;
      if (!Array.isArray(visibleMarkers)) {
        throw new Error('Could not resolve map visible markers');
      }

      const hasGossipAt = (coords: [number, number]) =>
        visibleMarkers.some(
          (marker: MapMarker) =>
            marker?.image === 'gossip_stone' &&
            Array.isArray(marker?.coords) &&
            marker.coords[0] === coords[0] &&
            marker.coords[1] === coords[1],
        );

      return {
        activeMapId: component?.props?.activeMap?.id ?? null,
        mqStoneVisible: hasGossipAt(mqCoords),
        nonMqStoneVisible: hasGossipAt(nonMqCoords),
      };
    },
    { mqCoords: MQ_GOSSIP_COORDS, nonMqCoords: NON_MQ_GOSSIP_COORDS },
  );
}

test.describe('OoTMM map marker visibility', () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalStorageAndReload(page);
  });

  test('Dodongo gossip stones switch visibility based on mqDungeons containing DC', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.getByTestId('tab-world').click();
    await normalizeMapVisibilityFilters(page);
    await setActiveMap(page, DODONGO_MAP_ID);

    const scenarios: Scenario[] = [];
    for (let i = 0; i < 6; i += 1) {
      scenarios.push(buildRandomScenario(i % 2 === 0));
    }

    for (const scenario of scenarios) {
      await applyMqDungeonSpecificSetting(page, scenario.values);

      await expect
        .poll(async () => {
          const snapshot = await readDodongoGossipVisibility(page);
          return `${snapshot.activeMapId}|${snapshot.mqStoneVisible}|${snapshot.nonMqStoneVisible}`;
        })
        .toBe(`${DODONGO_MAP_ID}|${scenario.includeDc}|${!scenario.includeDc}`);
    }
  });
});
