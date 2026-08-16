import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';

function polyfillRaf() {
  if (typeof globalThis.requestAnimationFrame === 'function') return;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0);
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe('Foolish hint re-collection (real tracker + ER)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    polyfillRaf();
  });

  it('collects ER-remapped Bombchu Bowling locations into a Foolish-hinted Kokiri Forest', async () => {
    const store = useOoTMMSessionStore();
    const tracker = new OoTMMTracker();
    await tracker.initialize();
    await store.attachTracker(tracker);

    await store.applySettings({
      games: 'ootmm',
      erIndoors: 'full',
      erIndoorsMajor: true,
    });

    store.addFoolishHint({ region: 'OOT_KOKIRI_FOREST' });
    const kokiri = Array.from(
      store.regionToLocationIds.get('OOT_KOKIRI_FOREST') ?? [],
    );
    store.collectLocationIds(kokiri);
    store.addHintProtectedLocationIds(kokiri);

    expect(
      store.regionToLocationIds
        .get('OOT_KOKIRI_FOREST')
        ?.has('OOT Bombchu Bowling Reward 1@0'),
    ).toBe(false);

    store.setEntranceOverride('OOT_HOUSE_MIDO', 'OOT_BOMBCHU_BOWLING');

    // Debounce (350ms) + rAF reinitialize.
    await vi.waitFor(
      () => {
        expect(
          store.regionToLocationIds
            .get('OOT_KOKIRI_FOREST')
            ?.has('OOT Bombchu Bowling Reward 1@0'),
        ).toBe(true);
      },
      { timeout: 5000, interval: 50 },
    );

    expect(new Set(store.collectedLocationIds)).toContain(
      'OOT Bombchu Bowling Reward 1@0',
    );
    expect(new Set(store.collectedLocationIds)).toContain(
      'OOT Bombchu Bowling Reward 2@0',
    );
    expect(store.hintProtectedLocationIds).toContain(
      'OOT Bombchu Bowling Reward 1@0',
    );
    expect(store.hintProtectedLocationIds).toContain(
      'OOT Bombchu Bowling Reward 2@0',
    );
  }, 60000);
});
