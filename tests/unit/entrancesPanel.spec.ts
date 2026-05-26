import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import OoTMMEntrances from '../../packs/ootmm/src/components/OoTMMEntrances.vue';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';
import { useOoTMMUiStore } from '@packs/ootmm/stores/ootmmUi';

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

describe('OoTMMEntrances', () => {
  it('renders boss entrances in their own pool section when boss shuffle is active', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const sessionStore = useOoTMMSessionStore();
    const uiStore = useOoTMMUiStore();

    sessionStore.trackerSettings = {
      games: 'ootmm',
      erBoss: 'full',
    };
    uiStore.entrancesReachabilityFilter = 'all';
    uiStore.entrancesMappingFilter = 'all';

    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(OoTMMEntrances);
    app.use(pinia);

    try {
      app.mount(container);
      await flushUi();

      expect(container.textContent).toContain('Boss Entrances');
      expect(container.textContent).toContain('Forest Temple Boss');
      expect(container.textContent).toContain('Woodfall Temple Boss');
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
