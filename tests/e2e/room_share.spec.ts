import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEST_TIMEOUTS, waitForBoot } from './helpers/tracker';

const RELAY_HOST = '127.0.0.1';
const RELAY_PORT = 8765;
const RELAY_ORIGIN = 'http://localhost:5173';
const BOMB_TEST_ID = 'inventory-item-card-OOT_BOMB_BAG';
const SWORD_TEST_ID = 'inventory-item-card-OOT_SWORD_KOKIRI';

let relayProcess: ChildProcess | null = null;
let relayOwnedByTest = false;
let relayStderr = '';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOwnedClass(className: string | null): boolean {
  return (className ?? '').split(/\s+/).includes('owned');
}

async function isOwned(page: Page, testId: string): Promise<boolean> {
  const className = await page.getByTestId(testId).getAttribute('class');
  return isOwnedClass(className);
}

function canConnectToRelay(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: RELAY_HOST, port: RELAY_PORT }, () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForRelayReady(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnectToRelay()) return;
    if (relayProcess && relayProcess.exitCode !== null) {
      throw new Error(
        `Sync relay exited before becoming ready: ${relayStderr || '(no stderr)'}`,
      );
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for sync relay on port ${RELAY_PORT}`);
}

async function ensureRelayAvailable(): Promise<void> {
  if (await canConnectToRelay()) return;

  const dbPath = path.join(
    os.tmpdir(),
    `tlt-room-share-e2e-${process.pid}-${Date.now()}.sqlite3`,
  );
  relayStderr = '';
  relayProcess = spawn(
    'python3',
    [
      'server/relay.py',
      '--host',
      RELAY_HOST,
      '--port',
      String(RELAY_PORT),
      '--db',
      dbPath,
      '--allow-origin',
      RELAY_ORIGIN,
      '--log-level',
      'WARNING',
    ],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  relayOwnedByTest = true;

  relayProcess.stderr?.setEncoding('utf8');
  relayProcess.stderr?.on('data', (chunk: string | Buffer) => {
    relayStderr += String(chunk);
    if (relayStderr.length > 8_000) {
      relayStderr = relayStderr.slice(-8_000);
    }
  });

  await waitForRelayReady();
}

async function stopOwnedRelay(): Promise<void> {
  if (!relayOwnedByTest || !relayProcess) return;
  const proc = relayProcess;
  relayProcess = null;
  relayOwnedByTest = false;
  if (proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, 5_000);
    proc.once('exit', () => {
      clearTimeout(timeoutId);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

async function setRoomSyncUrl(page: Page): Promise<void> {
  await page.addInitScript((url: string) => {
    (
      window as Window & { VITE_TLT_COOP_WS_URL?: string }
    ).VITE_TLT_COOP_WS_URL = url;
    Object.defineProperty(window, '__TLT_COOP_WS_URL__', {
      configurable: true,
      value: url,
    });
  }, `ws://${RELAY_HOST}:${RELAY_PORT}/`);
}

// The room creator clicks the COOP button and confirms the explanation modal. A
// random code is generated and the share URL is shown once in a "room created"
// modal, which we read the code back from so a peer can join.
async function createRoom(page: Page): Promise<string> {
  await page.goto('/?debug=1&coop=true');
  await waitForBoot(page);
  await page.getByTestId('coop-button').click();
  await page.getByTestId('coop-start-confirm-apply-button').click();
  // The URL only appears once the relay has actually accepted us and created
  // the room; until then the modal shows a spinner.
  const urlField = page.getByTestId('coop-created-url');
  await expect(urlField).toBeVisible({ timeout: 15_000 });
  const shareUrl = await urlField.inputValue();
  await page.getByTestId('coop-created-done-button').click();
  const code = shareUrl.match(/coop-room=([A-Za-z0-9]+)/)?.[1];
  if (!code) throw new Error('Expected a room code after starting coop');
  return code;
}

// Joining is link-only: opening a coop URL with the room code in the hash
// prompts for confirmation (joining replaces local state) before connecting and
// adopting the room's shared state. The modal appears before the tracker
// initializes, so confirm first, then wait for boot.
async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto(`/?debug=1&coop=true#coop-room=${code}`);
  await page.getByTestId('coop-join-confirm-apply-button').click();
  await waitForBoot(page);
  await expect(page.getByTestId('coop-button')).toHaveClass(
    /coop-button--active/,
    { timeout: 15_000 },
  );
}

test.describe('coop room share', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await ensureRelayAvailable();
  });

  test.afterAll(async () => {
    await stopOwnedRelay();
  });

  test('two coop peers stay in sync on inventory changes', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await setRoomSyncUrl(pageA);
      await setRoomSyncUrl(pageB);

      // pageA creates the room; pageB joins it via the shared link.
      const roomCode = await createRoom(pageA);
      await joinRoom(pageB, roomCode);

      await pageA.getByTestId('tab-inventory').click();
      await pageB.getByTestId('tab-inventory').click();

      await expect.poll(() => isOwned(pageA, BOMB_TEST_ID)).toBe(false);
      await expect.poll(() => isOwned(pageB, BOMB_TEST_ID)).toBe(false);

      await pageA.getByTestId(BOMB_TEST_ID).click();
      await expect.poll(() => isOwned(pageA, BOMB_TEST_ID)).toBe(true);
      await expect
        .poll(() => isOwned(pageB, BOMB_TEST_ID), {
          timeout: TEST_TIMEOUTS.SYNC_POLL,
        })
        .toBe(true);

      await pageB.getByTestId(SWORD_TEST_ID).click();
      await expect.poll(() => isOwned(pageB, SWORD_TEST_ID)).toBe(true);
      await expect
        .poll(() => isOwned(pageA, SWORD_TEST_ID), {
          timeout: TEST_TIMEOUTS.SYNC_POLL,
        })
        .toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('creating a room shows the share URL once', async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await setRoomSyncUrl(page);
      await page.goto('/?debug=1&coop=true');
      await waitForBoot(page);

      await page.getByTestId('coop-button').click();
      await page.getByTestId('coop-start-confirm-apply-button').click();

      const modal = page.getByTestId('coop-created-modal');
      await expect(modal).toBeVisible();
      // The URL only shows once the relay has created the room.
      await expect(page.getByTestId('coop-created-url')).toHaveValue(
        /coop-room=[A-Za-z0-9]+/,
        { timeout: 15_000 },
      );
      // Points the user at the persistent way to re-copy the link.
      await expect(modal).toContainText(/COPY COOP URL/i);

      // Dismissing it leaves us connected and it doesn't pop back up.
      await page.getByTestId('coop-created-done-button').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('coop-button')).toHaveClass(
        /coop-button--active/,
        { timeout: 15_000 },
      );
      await expect(modal).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('shows a spinner until the room is created; cancel backs out', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // Point coop at a dead relay so the connection never completes — the room
      // is never actually created, so no URL should appear.
      await page.addInitScript(() => {
        Object.defineProperty(window, '__TLT_COOP_WS_URL__', {
          configurable: true,
          value: 'ws://127.0.0.1:9/',
        });
      });
      await page.goto('/?debug=1&coop=true');
      await waitForBoot(page);

      await page.getByTestId('coop-button').click();
      await page.getByTestId('coop-start-confirm-apply-button').click();

      const modal = page.getByTestId('coop-created-modal');
      await expect(modal).toBeVisible();
      await expect(page.getByTestId('coop-created-spinner')).toBeVisible();
      // No URL while the room isn't actually created.
      await expect(page.getByTestId('coop-created-url')).toHaveCount(0);

      // Cancel backs all the way out — no lingering room.
      await page.getByTestId('coop-created-cancel-button').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('coop-button')).toHaveAttribute(
        'title',
        /Not connected/i,
      );
    } finally {
      await context.close();
    }
  });

  test('reset while in coop prompts before leaving the room', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await setRoomSyncUrl(page);
      await createRoom(page);

      // Reset must prompt with a coop-aware modal — never silently leave.
      await page.getByTestId('reset-tracker-state-button').click();
      const modal = page.getByTestId('reset-tracker-confirm-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(/Leave coop and reset/i);
      await expect(
        page.getByTestId('reset-tracker-confirm-apply-button'),
      ).toContainText(/Leave Coop & Reset/i);

      // Cancel keeps us in the room.
      await page.getByTestId('reset-tracker-confirm-cancel-button').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('coop-button')).toHaveClass(
        /coop-button--active/,
      );

      // Confirm leaves the room (the COOP button returns to its idle state).
      await page.getByTestId('reset-tracker-state-button').click();
      await expect(
        page.getByTestId('reset-tracker-confirm-modal'),
      ).toBeVisible();
      await page.getByTestId('reset-tracker-confirm-apply-button').click();
      await expect(page.getByTestId('coop-button')).toHaveAttribute(
        'title',
        /Not connected/i,
        { timeout: TEST_TIMEOUTS.SYNC_POLL },
      );
    } finally {
      await context.close();
    }
  });

  test('clicking COOP to leave prompts; cancel stays, confirm leaves', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await setRoomSyncUrl(page);
      await createRoom(page);

      // Clicking the connected COOP button must prompt — never drop out of the
      // room on a stray click.
      await page.getByTestId('coop-button').click();
      const modal = page.getByTestId('coop-leave-confirm-modal');
      await expect(modal).toBeVisible();

      // Cancel keeps us in the room.
      await page.getByTestId('coop-leave-confirm-cancel-button').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('coop-button')).toHaveClass(
        /coop-button--active/,
      );

      // Confirm leaves the room (the COOP button returns to its idle state).
      await page.getByTestId('coop-button').click();
      await page.getByTestId('coop-leave-confirm-apply-button').click();
      await expect(page.getByTestId('coop-button')).toHaveAttribute(
        'title',
        /Not connected/i,
        { timeout: TEST_TIMEOUTS.SYNC_POLL },
      );
    } finally {
      await context.close();
    }
  });

  test('opening a coop link prompts before joining; cancel does not join', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await setRoomSyncUrl(page);
      // Opening a link must prompt before replacing local state — never join
      // silently. Cancelling leaves us unconnected with a usable tracker.
      await page.goto('/?debug=1&coop=true#coop-room=COOPLINK1');
      const modal = page.getByTestId('coop-join-confirm-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(/replaces your current tracker state/i);

      await page.getByTestId('coop-join-confirm-cancel-button').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('joining-coop-overlay')).toBeHidden();
      await waitForBoot(page);
      await expect(page.getByTestId('coop-button')).toBeVisible();
      await expect(page.getByTestId('coop-button')).toHaveAttribute(
        'title',
        /Not connected/i,
      );
    } finally {
      await context.close();
    }
  });
});
