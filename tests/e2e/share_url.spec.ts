import { expect, test, type Page } from '@playwright/test';
import {
  resetLocalStorageAndReload,
  waitForAllReachable,
  waitForBoot,
} from './helpers/tracker';

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

test.describe('share URL import/export', () => {
  test('roundtrips full tracker progress through URL hash', async ({
    page,
  }) => {
    // This test performs two full boot cycles (initial + after share-URL
    // import) and hydrates the entire tracker state, so give it extra time.
    test.setTimeout(120_000);
    await installClipboardStub(page);
    await resetLocalStorageAndReload(page);

    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    await page.getByTestId('export-state-button').click();
    const shareUrl = await readCopiedShareUrl(page);
    expect(shareUrl).toContain('#s=v1.');

    await page.evaluate(() => window.localStorage.clear());
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    const importedReachable = await waitForAllReachable(page);
    expect(importedReachable.total).toBeGreaterThan(0);
    expect(importedReachable.reachable).toBe(importedReachable.total);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });

  test('canceling import preserves existing local progress', async ({
    page,
  }) => {
    await installClipboardStub(page);
    await resetLocalStorageAndReload(page);

    await page.getByTestId('export-state-button').click();
    const baselineShareUrl = await readCopiedShareUrl(page);
    expect(baselineShareUrl).toContain('#s=v1.');

    await page.getByTestId('debug-activate-all-button').click();
    await waitForAllReachable(page);

    let dialogType = '';
    let dialogMessage = '';
    const dialogHandled = new Promise<void>((resolve, reject) => {
      page.once('dialog', (dialog) => {
        dialogType = dialog.type();
        dialogMessage = dialog.message();
        void dialog.dismiss().then(resolve).catch(reject);
      });
    });

    await page.goto(baselineShareUrl, { waitUntil: 'domcontentloaded' });
    await dialogHandled;
    expect(dialogType).toBe('confirm');
    expect(dialogMessage).toContain(
      'replace your current local tracker progress',
    );

    await waitForBoot(page);
    const afterCancel = await waitForAllReachable(page);
    expect(afterCancel.total).toBeGreaterThan(0);
    expect(afterCancel.reachable).toBe(afterCancel.total);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('');
  });
});
