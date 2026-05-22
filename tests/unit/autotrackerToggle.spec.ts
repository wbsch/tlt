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
      const button = container.querySelector(
        '[data-testid="autotracker-button"]',
      );
      const indicator = container.querySelector(
        '[data-testid="autotracker-button"] .autotracker-indicator',
      );

      expect(toggle).toBeInstanceOf(HTMLButtonElement);
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(indicator).toBeInstanceOf(HTMLSpanElement);
      expect((toggle as HTMLButtonElement).disabled).toBe(true);
      expect(
        (button as HTMLButtonElement).classList.contains(
          'autotracker-button--active',
        ),
      ).toBe(true);
      expect(
        (toggle as HTMLButtonElement).classList.contains(
          'autotracker-dropdown-toggle--active',
        ),
      ).toBe(true);
      expect((indicator as HTMLSpanElement).style.backgroundColor).toBe(
        'rgb(76, 175, 80)',
      );
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it('shows warning styling while autotracking is enabled without a connection', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AutotrackerToggle, {
      status: 'disconnected',
      enabled: true,
      lastError: 'WebSocket error',
    });

    try {
      app.mount(container);
      await flushUi();

      const button = container.querySelector(
        '[data-testid="autotracker-button"]',
      );
      const toggle = container.querySelector(
        '[data-testid="autotracker-dropdown-toggle"]',
      );
      const indicator = container.querySelector(
        '[data-testid="autotracker-button"] .autotracker-indicator',
      );

      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(toggle).toBeInstanceOf(HTMLButtonElement);
      expect(indicator).toBeInstanceOf(HTMLSpanElement);
      expect(
        (button as HTMLButtonElement).classList.contains(
          'autotracker-button--warning',
        ),
      ).toBe(true);
      expect(
        (button as HTMLButtonElement).classList.contains(
          'autotracker-button--active',
        ),
      ).toBe(false);
      expect(
        (toggle as HTMLButtonElement).classList.contains(
          'autotracker-dropdown-toggle--warning',
        ),
      ).toBe(true);
      expect(
        (toggle as HTMLButtonElement).classList.contains(
          'autotracker-dropdown-toggle--active',
        ),
      ).toBe(false);
      expect((indicator as HTMLSpanElement).style.backgroundColor).toBe(
        'rgb(255, 152, 0)',
      );
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it('keeps the outdated-version warning in the button title only', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(AutotrackerToggle, {
      status: 'connected',
      enabled: true,
      lastError: null,
      warningMessage:
        'You are using an outdated autotracker version (0.1.0). Please update to version 0.1.1 or newer.',
    });

    try {
      app.mount(container);
      await flushUi();

      const warning = container.querySelector(
        '[data-testid="autotracker-warning"]',
      );
      const button = container.querySelector(
        '[data-testid="autotracker-button"]',
      );

      expect(warning).toBeNull();
      expect((button as HTMLButtonElement).title).toContain(
        'outdated autotracker version',
      );
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
