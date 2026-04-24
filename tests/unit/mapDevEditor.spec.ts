import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import OoTMMMapDevEditor from '../../packs/ootmm/src/components/OoTMMMapDevEditor.vue';
import type { MapDef } from '../../packs/ootmm/src/data/maps/types';

function createTestMap(): MapDef {
  return {
    id: 'test_map',
    title: 'Test Map',
    image: 'test-map.png',
    width: 320,
    height: 240,
    markers: [
      {
        coords: [100, 120],
        image: 'unknown-icon',
        type: 'submenu',
        entranceMenu: {
          entranceIds: ['OOT_TEST_ENTRANCE'],
          display: 'exits',
        },
      },
    ],
  };
}

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

describe('OoTMMMapDevEditor', () => {
  it('preserves entranceMenu display in copied map exports', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(OoTMMMapDevEditor, {
      activeMap: createTestMap(),
      reachableIds: new Set<string>(),
      collectedIds: new Set<string>(),
      selectedMarkerIndex: null,
    });

    try {
      app.mount(container);
      await flushUi();

      const copyButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Copy Map JSON'),
      );
      expect(copyButton).toBeInstanceOf(HTMLButtonElement);

      (copyButton as HTMLButtonElement).click();
      await flushUi();

      expect(writeText).toHaveBeenCalledTimes(1);
      const [payload] = writeText.mock.calls[0] ?? [];
      expect(typeof payload).toBe('string');

      const exportedMap = JSON.parse(payload as string) as MapDef;
      expect(exportedMap.markers[0]?.entranceMenu?.entranceIds).toEqual([
        'OOT_TEST_ENTRANCE',
      ]);
      expect(exportedMap.markers[0]?.entranceMenu?.display).toBe('exits');
    } finally {
      app.unmount();
      container.remove();
    }
  });
});