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

  return {
    sessionStore,
    startRoomSync,
    $,
    cleanup: () => {
      app.unmount();
      container.remove();
    },
  };
}

describe('CoopPanel × autotracker mutual exclusion (G5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables start and shows a hint while autotracking is active', async () => {
    const panel = mountPanel({ autotrackerActive: true });
    try {
      await flushUi();
      const start = panel.$('coop-start-button') as HTMLButtonElement;

      expect(start.disabled).toBe(true);
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
