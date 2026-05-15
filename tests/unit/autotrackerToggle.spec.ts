import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AutotrackerToggle from '../../packs/ootmm/src/components/AutotrackerToggle.vue';

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

describe('AutotrackerToggle', () => {
  it('starts in keep current state mode from the main button', async () => {
    const updateEnabled = vi.fn();
    const startOverwrite = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AutotrackerToggle, {
      status: 'disconnected',
      enabled: false,
      lastError: null,
      'onUpdate:enabled': updateEnabled,
      onStartOverwrite: startOverwrite,
    });

    try {
      app.mount(container);
      await flushUi();

      const button = container.querySelector(
        '[data-testid="autotracker-button"]',
      );
      expect(button).toBeInstanceOf(HTMLButtonElement);

      (button as HTMLButtonElement).click();
      await flushUi();

      expect(updateEnabled).toHaveBeenCalledTimes(1);
      expect(updateEnabled).toHaveBeenCalledWith(true);
      expect(startOverwrite).not.toHaveBeenCalled();
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it('offers overwrite current state from the overflow menu', async () => {
    const updateEnabled = vi.fn();
    const startOverwrite = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AutotrackerToggle, {
      status: 'disconnected',
      enabled: false,
      lastError: null,
      'onUpdate:enabled': updateEnabled,
      onStartOverwrite: startOverwrite,
    });

    try {
      app.mount(container);
      await flushUi();

      const toggle = container.querySelector(
        '[data-testid="autotracker-dropdown-toggle"]',
      );
      expect(toggle).toBeInstanceOf(HTMLButtonElement);

      (toggle as HTMLButtonElement).click();
      await flushUi();

      const overwriteButton = container.querySelector(
        '[data-testid="autotracker-overwrite-button"]',
      );
      expect(overwriteButton).toBeInstanceOf(HTMLButtonElement);

      (overwriteButton as HTMLButtonElement).click();
      await flushUi();

      expect(startOverwrite).toHaveBeenCalledTimes(1);
      expect(updateEnabled).not.toHaveBeenCalled();
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it('disables the overflow menu while autotracking is already active', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AutotrackerToggle, {
      status: 'connected',
      enabled: true,
      lastError: null,
    });

    try {
      app.mount(container);
      await flushUi();

      const toggle = container.querySelector(
        '[data-testid="autotracker-dropdown-toggle"]',
      );
      expect(toggle).toBeInstanceOf(HTMLButtonElement);
      expect((toggle as HTMLButtonElement).disabled).toBe(true);
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
