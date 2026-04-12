import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoTracker, TEST_TIMEOUTS, waitForBoot } from './helpers/tracker';

function moonAccessCard(page: Page): Locator {
  return page
    .locator('.special-card')
    .filter({
      has: page.locator('.special-title', { hasText: 'Moon Access' }),
    })
    .first();
}

async function expandSpecialConditionCard(card: Locator): Promise<void> {
  const toggle = card.getByRole('button', { name: /Show|Hide/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

function specialConditionFieldToggle(card: Locator, label: string): Locator {
  return card
    .locator('.special-field')
    .filter({ hasText: label })
    .locator('input[type="checkbox"]');
}

async function applySettingsAndWait(page: Page): Promise<void> {
  const overlay = page.getByTestId('applying-settings-overlay');
  const undoButton = page.getByRole('button', { name: /Undo/i });

  await page.getByTestId('apply-settings-button').click();
  await expect(undoButton).toBeEnabled({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
  await expect(overlay).toBeHidden({
    timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
  });
}

async function readMoonSpecialCondFromLocalStorage(
  page: Page,
): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('tlt:ootmm-session:v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      trackerSettings?: {
        specialConds?: {
          MOON?: Record<string, unknown>;
        };
      };
    };
    return parsed.trackerSettings?.specialConds?.MOON ?? {};
  });
}

test.describe('Special condition refresh persistence', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTracker(page);
  });

  test('Moon Access special condition keeps edited values after refresh', async ({
    page,
  }) => {
    await page.getByTestId('tab-settings').click();

    const moonCard = moonAccessCard(page);
    await expect(moonCard).toBeVisible();
    await expandSpecialConditionCard(moonCard);

    const remainsToggle = specialConditionFieldToggle(moonCard, 'Boss Remains');
    const stonesToggle = specialConditionFieldToggle(
      moonCard,
      'Spiritual Stones',
    );
    const countInput = moonCard.locator('.special-count-input');

    await expect(remainsToggle).toBeChecked();
    await stonesToggle.setChecked(true);
    await remainsToggle.setChecked(false);
    await countInput.fill('1');

    await applySettingsAndWait(page);

    await expect(stonesToggle).toBeChecked();
    await expect(remainsToggle).not.toBeChecked();
    await expect(countInput).toHaveValue('1');

    await expect
      .poll(async () => readMoonSpecialCondFromLocalStorage(page), {
        timeout: TEST_TIMEOUTS.SETTINGS_APPLY,
      })
      .toMatchObject({
        stones: true,
        remains: false,
        count: 1,
      });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.getByTestId('tab-settings').click();

    const moonCardAfterReload = moonAccessCard(page);
    await expect(moonCardAfterReload).toBeVisible();
    await expandSpecialConditionCard(moonCardAfterReload);

    const remainsToggleAfterReload = specialConditionFieldToggle(
      moonCardAfterReload,
      'Boss Remains',
    );
    const stonesToggleAfterReload = specialConditionFieldToggle(
      moonCardAfterReload,
      'Spiritual Stones',
    );
    const countInputAfterReload = moonCardAfterReload.locator(
      '.special-count-input',
    );

    await expect(stonesToggleAfterReload).toBeChecked();
    await expect(remainsToggleAfterReload).not.toBeChecked();
    await expect(countInputAfterReload).toHaveValue('1');

    await expect(await readMoonSpecialCondFromLocalStorage(page)).toMatchObject(
      {
        stones: true,
        remains: false,
        count: 1,
      },
    );
  });
});
