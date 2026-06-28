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

async function joinRoom(page: Page, code: string): Promise<void> {
  const input = page.getByTestId('coop-room-code-input');
  await expect(input).toBeVisible();
  await input.fill(code);
  await input.press('Enter');
  // Joining is destructive (adopts the room's state), so it now prompts first.
  await page.getByTestId('coop-join-confirm-apply-button').click();
  await expect(page.getByTestId('coop-status')).toContainText(/Connected/i, {
    timeout: 15_000,
  });
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
    const roomCode = `COOPE2E${Date.now()}`;

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await setRoomSyncUrl(pageA);
      await setRoomSyncUrl(pageB);

      await pageA.goto('/?debug=1&coop=true');
      await waitForBoot(pageA);
      await pageB.goto('/?debug=1&coop=true');
      await waitForBoot(pageB);

      await joinRoom(pageA, roomCode);
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

  test('reset while in coop prompts before leaving the room', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const roomCode = `COOPRESET${Date.now()}`;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await setRoomSyncUrl(page);
      await page.goto('/?debug=1&coop=true');
      await waitForBoot(page);
      await joinRoom(page, roomCode);

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
      await expect(page.getByTestId('coop-status')).toContainText(/Connected/i);

      // Confirm leaves the room (the join UI returns).
      await page.getByTestId('reset-tracker-state-button').click();
      await expect(
        page.getByTestId('reset-tracker-confirm-modal'),
      ).toBeVisible();
      await page.getByTestId('reset-tracker-confirm-apply-button').click();
      await expect(page.getByTestId('coop-start-button')).toBeVisible({
        timeout: TEST_TIMEOUTS.SYNC_POLL,
      });
    } finally {
      await context.close();
    }
  });
});
