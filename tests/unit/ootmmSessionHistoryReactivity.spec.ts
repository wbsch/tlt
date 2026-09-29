import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { isReactive } from 'vue';
import { useOoTMMSessionStore } from '../../packs/ootmm/src/stores/ootmmSession';

/**
 * Regression guard for a severe interaction-performance bug.
 *
 * The undo/redo snapshot lists must NOT be reactive. They only ever need to be
 * *replaced* (the `canUndo`/`canRedo` computeds read `.length`), and each entry
 * is a deep copy of the whole session (inventory, spoiler placements, hint
 * tracker, …). Pinia's `$subscribe` — used by the localStorage persistence
 * plugin — deep-watches the entire store state, so if these snapshots were made
 * reactive, every single store mutation (e.g. marking one check as collected)
 * would traverse every node of up to HISTORY_LIMIT stored snapshots. With a
 * full spoiler log that is hundreds of thousands of nodes per click, taking the
 * interaction from ~50ms to multiple seconds.
 */
describe('ootmm session undo/redo history reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps history snapshots non-reactive so deep watchers skip them', () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.toggleCollectedLocation('OOT_KF_MIDOS_TOP_LEFT_CHEST');

    expect(sessionStore.undoHistory).toHaveLength(1);
    expect(sessionStore.undoHistory[0]).toBeDefined();

    // The container and its entries must stay raw: this is what stops Pinia's
    // deep `$subscribe` from walking into the snapshots on every mutation.
    expect(isReactive(sessionStore.undoHistory)).toBe(false);
    expect(isReactive(sessionStore.undoHistory[0])).toBe(false);
  });

  it('still exposes reactive canUndo/canRedo driven by history length', async () => {
    const sessionStore = useOoTMMSessionStore();

    expect(sessionStore.canUndo).toBe(false);
    expect(sessionStore.canRedo).toBe(false);

    sessionStore.toggleCollectedLocation('OOT_KF_MIDOS_TOP_LEFT_CHEST');
    expect(sessionStore.canUndo).toBe(true);

    await sessionStore.undo();
    expect(sessionStore.canUndo).toBe(false);
    expect(sessionStore.canRedo).toBe(true);

    await sessionStore.redo();
    expect(sessionStore.canUndo).toBe(true);
    expect(sessionStore.canRedo).toBe(false);

    sessionStore.clearHistory();
    expect(sessionStore.canUndo).toBe(false);
    expect(sessionStore.canRedo).toBe(false);
  });

  it('keeps spoiler placements shallow so they are not deep-proxied', () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.setSpoilerPlacements([
      {
        itemId: 'MM_BOMBS_10',
        itemName: '10 Bombs (MM)',
        locationId: 'MM Bomb Shop Item 1@0',
        locationName: 'MM Bomb Shop Item 1',
      },
    ]);

    // Deep-proxying ~2000 placement records made Pinia's deep `$subscribe`
    // (persistence) and every `JSON.stringify` of the session walk the whole
    // array on each store mutation. Shallow refs keep the records raw.
    expect(isReactive(sessionStore.spoilerPlacements)).toBe(false);
    expect(isReactive(sessionStore.spoilerPlacements[0])).toBe(false);

    // Derived lookups must still recompute when the array is replaced.
    expect(sessionStore.spoilerItemToLocationIds.MM_BOMBS_10).toEqual([
      'MM Bomb Shop Item 1@0',
    ]);
    expect(sessionStore.spoilerLocationToItemId['MM Bomb Shop Item 1@0']).toBe(
      'MM_BOMBS_10',
    );
  });
});
