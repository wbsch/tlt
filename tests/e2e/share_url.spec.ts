import { expect, test, type Page } from '@playwright/test';
import { deflateRaw } from 'pako';
import {
  gotoTracker,
  TEST_TIMEOUTS,
  waitForAllReachable,
  waitForBoot,
} from './helpers/tracker';

const textEncoder = new TextEncoder();

async function installClipboardStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TLT_LAST_CLIPBOARD_WRITE__', {
      configurable: true,
      writable: true,
      value: '',
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (
            window as Window & { __TLT_LAST_CLIPBOARD_WRITE__?: string }
          ).__TLT_LAST_CLIPBOARD_WRITE__ = text;
        },
      },
    });
  });
}

function encodeSharePayload(snapshot: unknown): string {
  const jsonBytes = textEncoder.encode(JSON.stringify(snapshot));
  const compressed = deflateRaw(jsonBytes);
  return `v1.${Buffer.from(compressed).toString('base64url')}`;
}

function buildShareUrl(baseUrl: string, snapshot: unknown): string {
  const next = new URL(baseUrl);
  next.hash = `s=${encodeSharePayload(snapshot)}`;
  return next.toString();
}

async function readCopiedShareUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    return (
      (
        window as Window & {
          __TLT_LAST_CLIPBOARD_WRITE__?: string;
        }
      ).__TLT_LAST_CLIPBOARD_WRITE__ ?? ''
    );
  });
}

async function readPersistedJson(
  page: Page,
  storageKey: string,
): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }, storageKey);
}

test.describe.configure({ mode: 'parallel' });

test.describe('share URL import/export', () => {
  test.beforeEach(async ({ page }) => {
    await installClipboardStub(page);
    await gotoTracker(page);
  });

  test('roundtrips full tracker progress through URL hash', async ({
    page,
  }) => {
    // This test performs two full boot cycles (initial + after share-URL
    // import) and hydrates the entire tracker state, so give it extra time.
    test.setTimeout(TEST_TIMEOUTS.LONG_OPERATION);

    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    await page.getByTestId('export-state-button').click();
    const shareUrl = await readCopiedShareUrl(page);
    expect(shareUrl).toContain('#s=v1.');

    await page.evaluate(() => window.localStorage.clear());
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    const importDetailsCloseButton = page.getByTestId(
      'share-import-details-close-button',
    );
    if (await importDetailsCloseButton.count()) {
      await importDetailsCloseButton.click();
      await expect(page.getByTestId('share-import-details-modal')).toHaveCount(
        0,
      );
    }
    await waitForBoot(page);
    const importedReachable = await waitForAllReachable(page);
    expect(importedReachable.total).toBeGreaterThan(0);
    expect(importedReachable.reachable).toBe(importedReachable.total);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('drops invalid shared state fields and shows a partial-import warning', async ({
    page,
  }) => {
    const partialShareUrl = buildShareUrl(page.url(), {
      v: 1,
      ignoredTopLevel: true,
      stores: {
        app: {
          selectedPackId: 'evil-pack',
        },
        'ootmm-session': {
          trackerSettings: {
            games: { bad: true },
            players: 'oops',
            specialConds: {
              BRIDGE: { count: 2 },
            },
          },
          entranceOverrides: {
            NOT_A_REAL_ENTRANCE: 'ALSO_NOT_REAL',
          },
        },
        'not-a-real-store': {
          injected: true,
        },
      },
    });

    await page.evaluate(() => window.localStorage.clear());
    await page.goto(partialShareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body.tlt-app-mounted', {
      timeout: TEST_TIMEOUTS.BOOT_SELECTOR,
    });
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('.export-status')?.textContent ?? null,
          ),
        { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
      )
      .toContain('some invalid data was ignored');
    await expect(page.getByTestId('share-import-details-modal')).toBeVisible({
      timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS,
    });
    await expect(page.getByTestId('share-import-details-modal')).toContainText(
      'stores.app.selectedPackId',
      { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
    );
    await expect(page.getByTestId('share-import-details-modal')).toContainText(
      'stores.ootmm-session.trackerSettings.games',
      { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
    );
    await page.getByTestId('share-import-details-close-button').click();
    await expect(page.getByTestId('share-import-details-modal')).toHaveCount(0);
    await page.getByTestId('share-status-details-button').click();
    await expect(page.getByTestId('share-import-details-modal')).toBeVisible({
      timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS,
    });
    await page.getByTestId('share-import-details-close-button').click();
    await expect(page.getByTestId('share-import-details-modal')).toHaveCount(0);
    await waitForBoot(page);
    await expect(page.getByTestId('pack-select')).toHaveValue('ootmm');

    const appState = await readPersistedJson(page, 'tlt:app');
    expect(appState?.selectedPackId).toBe('ootmm');

    const sessionState = await readPersistedJson(page, 'tlt:ootmm-session');
    const trackerSettings = sessionState?.trackerSettings as
      | Record<string, unknown>
      | undefined;
    expect(typeof trackerSettings?.games).toBe('string');
    expect(typeof trackerSettings?.players).toBe('number');
    expect(
      Object.keys(
        (sessionState?.entranceOverrides as Record<string, unknown>) ?? {},
      ),
    ).toHaveLength(0);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('treats tracker-canonicalized shared settings as a partial import', async ({
    page,
  }) => {
    const partialShareUrl = buildShareUrl(page.url(), {
      v: 1,
      stores: {
        app: {
          selectedPackId: 'ootmm',
        },
        'ootmm-session': {
          trackerSettings: {
            games: 'ootmm',
            specialConds: {
              BRIDGE: {
                count: 999,
                stones: 'bad',
              },
            },
          },
        },
      },
    });

    await page.evaluate(() => window.localStorage.clear());
    await page.goto(partialShareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body.tlt-app-mounted', {
      timeout: TEST_TIMEOUTS.BOOT_SELECTOR,
    });
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('.export-status')?.textContent ?? null,
          ),
        { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
      )
      .toContain('some invalid data was ignored');
    await waitForBoot(page);

    const sessionState = await readPersistedJson(page, 'tlt:ootmm-session');
    const bridgeCond = (
      (sessionState?.trackerSettings as Record<string, unknown> | undefined)
        ?.specialConds as Record<string, Record<string, unknown>> | undefined
    )?.BRIDGE;
    expect(bridgeCond?.count).toBe(0);
    expect(bridgeCond?.stones).toBe(false);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('hashchange imports partial shared state and shows the warning after reload', async ({
    page,
  }) => {
    await waitForBoot(page);

    const payload = encodeSharePayload({
      v: 1,
      stores: {
        app: {
          selectedPackId: 'ootmm',
        },
        'ootmm-session': {
          trackerSettings: {
            games: 'ootmm',
            specialConds: {
              BRIDGE: {
                count: 999,
                stones: 'bad',
              },
            },
          },
        },
      },
    });

    await page.evaluate((nextHash) => {
      window.location.hash = nextHash;
    }, `s=${payload}`);

    await page.waitForSelector('body.tlt-app-mounted', {
      timeout: TEST_TIMEOUTS.BOOT_SELECTOR,
    });
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('.export-status')?.textContent ?? null,
          ),
        { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
      )
      .toContain('some invalid data was ignored');
    await waitForBoot(page);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('rejects oversized share payloads without importing anything', async ({
    page,
  }) => {
    const oversizedShareUrl = buildShareUrl(page.url(), {
      v: 1,
      stores: {
        'ootmm-session': {
          trackerSettings: {
            specialConds: {
              HUGE: {
                note: 'x'.repeat(600_000),
              },
            },
          },
        },
      },
    });

    await page.evaluate(() => window.localStorage.clear());
    await page.goto(oversizedShareUrl, { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    await expect(page.locator('.export-status')).toHaveCount(0);
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');

    const sessionState = await readPersistedJson(page, 'tlt:ootmm-session');
    const trackerSettings = sessionState?.trackerSettings as
      | Record<string, unknown>
      | undefined;
    expect(
      Boolean(
        trackerSettings &&
        typeof trackerSettings.specialConds === 'object' &&
        trackerSettings.specialConds !== null &&
        'HUGE' in trackerSettings.specialConds,
      ),
    ).toBe(false);
  });

  test('canceling import preserves existing local progress', async ({
    page,
  }) => {
    await page.getByTestId('export-state-button').click();
    const baselineShareUrl = await readCopiedShareUrl(page);
    expect(baselineShareUrl).toContain('#s=v1.');

    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });

    await page.goto(baselineShareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body.tlt-app-mounted', {
      timeout: TEST_TIMEOUTS.BOOT_SELECTOR,
    });
    await expect(page.getByTestId('share-import-confirm-modal')).toBeVisible({
      timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS,
    });
    await expect(page.getByTestId('share-import-confirm-modal')).toContainText(
      'replace your current local tracker progress',
      { timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS },
    );
    expect(dialogs).toEqual([]);
    await page.getByTestId('share-import-confirm-cancel-button').click();
    await expect(page.getByTestId('share-import-confirm-modal')).toHaveCount(0);

    await waitForBoot(page);
    const afterCancel = await waitForAllReachable(page);
    expect(afterCancel.total).toBeGreaterThan(0);
    expect(afterCancel.reachable).toBe(afterCancel.total);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('confirming import from existing progress uses the in-app modal', async ({
    page,
  }) => {
    const replacementShareUrl = buildShareUrl(page.url(), {
      v: 1,
      stores: {
        app: {
          selectedPackId: 'ootmm',
        },
        'ootmm-session': {
          inventoryById: {
            ITEM_ALPHA: 1,
          },
        },
      },
    });

    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    await page.goto(replacementShareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body.tlt-app-mounted', {
      timeout: TEST_TIMEOUTS.BOOT_SELECTOR,
    });
    await expect(page.getByTestId('share-import-confirm-modal')).toBeVisible({
      timeout: TEST_TIMEOUTS.SHARE_IMPORT_DETAILS,
    });
    await page.getByTestId('share-import-confirm-apply-button').click();

    await waitForBoot(page);
    const sessionState = await readPersistedJson(page, 'tlt:ootmm-session');
    expect(sessionState?.inventoryById).toMatchObject({
      ITEM_ALPHA: 1,
    });
    expect(
      Object.keys(
        (sessionState?.inventoryById as Record<string, unknown>) ?? {},
      ),
    ).toEqual(['ITEM_ALPHA']);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });
});
