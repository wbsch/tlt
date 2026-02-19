import { expect, type Locator, type Page } from '@playwright/test';

const FRACTION_PATTERN = /(\d+)\s*\/\s*(\d+)/;
const NUMBER_PATTERN = /^\d+$/;

export type ReachableFraction = {
  reachable: number;
  total: number;
};

export type TrackerStats = {
  reachable: number;
  total: number;
  checked: number;
  remaining: number;
};

function parseReachableFraction(raw: string): ReachableFraction {
  const match = raw.match(FRACTION_PATTERN);
  if (!match) {
    throw new Error(`Expected reachable fraction in "${raw}"`);
  }

  return {
    reachable: Number(match[1]),
    total: Number(match[2]),
  };
}

function parseInteger(raw: string, label: string): number {
  const normalized = raw.trim();
  if (!NUMBER_PATTERN.test(normalized)) {
    throw new Error(`Expected ${label} to be an integer, got "${raw}"`);
  }
  return Number(normalized);
}

async function readText(locator: Locator): Promise<string> {
  const raw = await locator.textContent();
  if (!raw) {
    throw new Error('Expected non-empty text content');
  }
  return raw.trim();
}

export async function ensureStatsExpanded(page: Page): Promise<void> {
  const toggle = page.locator('.stats-collapse-toggle');
  await expect(toggle).toBeVisible();

  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('stats-reachable-value')).toBeVisible();
}

export async function readReachableFraction(
  page: Page,
): Promise<ReachableFraction> {
  await ensureStatsExpanded(page);
  const reachableText = await readText(
    page.getByTestId('stats-reachable-value'),
  );
  return parseReachableFraction(reachableText);
}

export async function readTrackerStats(page: Page): Promise<TrackerStats> {
  const reachable = await readReachableFraction(page);
  const checked = parseInteger(
    await readText(page.getByTestId('stats-checked-value')),
    'checked stat',
  );
  const remaining = parseInteger(
    await readText(page.getByTestId('stats-remaining-value')),
    'remaining stat',
  );

  return {
    reachable: reachable.reachable,
    total: reachable.total,
    checked,
    remaining,
  };
}

export async function waitForReachableFraction(
  page: Page,
  timeout = 10_000,
): Promise<ReachableFraction> {
  await ensureStatsExpanded(page);

  await expect
    .poll(
      async () => {
        const { total } = await readReachableFraction(page);
        return total > 0;
      },
      { timeout },
    )
    .toBe(true);

  return readReachableFraction(page);
}

export async function waitForAllReachable(
  page: Page,
  timeout = 20_000,
): Promise<ReachableFraction> {
  await ensureStatsExpanded(page);

  await expect
    .poll(
      async () => {
        const { reachable, total } = await readReachableFraction(page);
        return total > 0 && reachable === total;
      },
      { timeout },
    )
    .toBe(true);

  return readReachableFraction(page);
}

export async function waitForBoot(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'The Last Tracker' }),
  ).toBeVisible();
  await expect(page.getByTestId('pack-select')).toBeVisible();
  await expect(page.getByTestId('pack-select')).toHaveValue('ootmm');
  await waitForReachableFraction(page, 15_000);
}

export async function resetLocalStorageAndReload(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForBoot(page);
}
