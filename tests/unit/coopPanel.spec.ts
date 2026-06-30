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
  const leaveRoom = vi
    .spyOn(sessionStore, 'leaveRoom')
    .mockImplementation(() => {});

  const container = document.createElement('div');
  document.body.append(container);
  const requestStart = vi.fn();
  const blocked = vi.fn();
  const app = createApp(CoopPanel, {
    ...props,
    onRequestStart: requestStart,
    onBlocked: blocked,
  });
  app.use(pinia);
  app.mount(container);

  const $ = (testid: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

  return {
    sessionStore,
    leaveRoom,
    requestStart,
    blocked,
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

  it('disables the COOP button and shows a hint while autotracking is active', async () => {
    const panel = mountPanel({ autotrackerActive: true });
    try {
      await flushUi();
      const button = panel.$('coop-button') as HTMLButtonElement;

      // Disabled-looking via aria-disabled (not native disabled) so the click
      // still reaches the handler and can open the explainer.
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(panel.$('coop-autotracker-blocked-hint')).not.toBeNull();
    } finally {
      panel.cleanup();
    }
  });

  it('reports blocked (no start) when the COOP button is clicked while autotracking', async () => {
    const panel = mountPanel({ autotrackerActive: true });
    try {
      await flushUi();
      panel.$('coop-button')!.click();
      await flushUi();
      expect(panel.requestStart).not.toHaveBeenCalled();
      expect(panel.blocked).toHaveBeenCalledTimes(1);
    } finally {
      panel.cleanup();
    }
  });

  it('requests a start (no direct room creation) when idle and not autotracking', async () => {
    const panel = mountPanel({ autotrackerActive: false });
    try {
      await flushUi();
      expect(panel.$('coop-autotracker-blocked-hint')).toBeNull();
      expect(
        (panel.$('coop-button') as HTMLButtonElement).getAttribute(
          'aria-disabled',
        ),
      ).toBe('false');

      panel.$('coop-button')!.click();
      await flushUi();
      expect(panel.requestStart).toHaveBeenCalledTimes(1);
    } finally {
      panel.cleanup();
    }
  });
});
