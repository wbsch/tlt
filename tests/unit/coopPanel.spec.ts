import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoopPanel from '../../packs/ootmm/src/components/CoopPanel.vue';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

const ROOM_CODE = 'ROOMCODE1';

function mountPanel(props: { autotrackerActive?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const sessionStore = useOoTMMSessionStore();
  const startRoomSync = vi
    .spyOn(sessionStore, 'startRoomSync')
    .mockImplementation(() => {});

  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp(CoopPanel, props);
  app.use(pinia);
  app.mount(container);

  const $ = (testid: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

  async function typeCodeAndJoin() {
    const input = $('coop-room-code-input') as HTMLInputElement;
    input.value = ROOM_CODE;
    input.dispatchEvent(new Event('input'));
    await flushUi();
    $('coop-join-button')!.click();
    await flushUi();
  }

  return {
    sessionStore,
    startRoomSync,
    $,
    typeCodeAndJoin,
    cleanup: () => {
      app.unmount();
      container.remove();
    },
  };
}

describe('CoopPanel join confirmation (G4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts before joining instead of joining immediately', async () => {
    const panel = mountPanel();
    try {
      await panel.typeCodeAndJoin();
      // The confirm modal is shown and we have NOT joined yet.
      expect(panel.$('coop-join-confirm-modal')).not.toBeNull();
      expect(panel.startRoomSync).not.toHaveBeenCalled();
    } finally {
      panel.cleanup();
    }
  });

  it('joins with the entered code after confirming', async () => {
    const panel = mountPanel();
    try {
      await panel.typeCodeAndJoin();
      panel.$('coop-join-confirm-apply-button')!.click();
      await flushUi();
      expect(panel.startRoomSync).toHaveBeenCalledTimes(1);
      expect(panel.startRoomSync).toHaveBeenCalledWith({ roomCode: ROOM_CODE });
      // Modal is dismissed after confirming.
      expect(panel.$('coop-join-confirm-modal')).toBeNull();
    } finally {
      panel.cleanup();
    }
  });

  it('does not join when the prompt is cancelled', async () => {
    const panel = mountPanel();
    try {
      await panel.typeCodeAndJoin();
      panel.$('coop-join-confirm-cancel-button')!.click();
      await flushUi();
      expect(panel.startRoomSync).not.toHaveBeenCalled();
      expect(panel.$('coop-join-confirm-modal')).toBeNull();
    } finally {
      panel.cleanup();
    }
  });
});

describe('CoopPanel × autotracker mutual exclusion (G5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables start/join and shows a hint while autotracking is active', async () => {
    const panel = mountPanel({ autotrackerActive: true });
    try {
      await flushUi();
      const start = panel.$('coop-start-button') as HTMLButtonElement;
      const join = panel.$('coop-join-button') as HTMLButtonElement;
      const input = panel.$('coop-room-code-input') as HTMLInputElement;

      expect(start.disabled).toBe(true);
      expect(join.disabled).toBe(true);
      expect(input.disabled).toBe(true);
      expect(panel.$('coop-autotracker-blocked-hint')).not.toBeNull();
    } finally {
      panel.cleanup();
    }
  });

  it('does not start a room when start is clicked while autotracking', async () => {
    const panel = mountPanel({ autotrackerActive: true });
    try {
      await flushUi();
      panel.$('coop-start-button')!.click();
      await flushUi();
      expect(panel.startRoomSync).not.toHaveBeenCalled();
    } finally {
      panel.cleanup();
    }
  });

  it('shows no blocking hint when autotracking is inactive', async () => {
    const panel = mountPanel({ autotrackerActive: false });
    try {
      await flushUi();
      expect(panel.$('coop-autotracker-blocked-hint')).toBeNull();
      expect((panel.$('coop-start-button') as HTMLButtonElement).disabled).toBe(
        false,
      );
    } finally {
      panel.cleanup();
    }
  });
});
