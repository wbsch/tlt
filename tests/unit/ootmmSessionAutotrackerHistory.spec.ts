import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';

describe('ootmm session autotracker history', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('records an autotracker delta as one undoable step', async () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.applyAutotrackerDelta(
      new Map([
        ['OOT_HOOKSHOT', 1],
        ['MM_BOW', 1],
      ]),
      ['OOT_KF_MIDOS_TOP_LEFT_CHEST', 'MM_CLOCK_TOWN_OCARINA'],
    );

    expect(sessionStore.inventoryById).toEqual({
      OOT_HOOKSHOT: 1,
      MM_BOW: 1,
    });
    expect(sessionStore.collectedLocationIds).toEqual([
      'OOT_KF_MIDOS_TOP_LEFT_CHEST',
      'MM_CLOCK_TOWN_OCARINA',
    ]);
    expect(sessionStore.undoHistory).toHaveLength(1);

    await sessionStore.undo();

    expect(sessionStore.inventoryById).toEqual({});
    expect(sessionStore.collectedLocationIds).toEqual([]);

    await sessionStore.redo();

    expect(sessionStore.inventoryById).toEqual({
      OOT_HOOKSHOT: 1,
      MM_BOW: 1,
    });
    expect(sessionStore.collectedLocationIds).toEqual([
      'OOT_KF_MIDOS_TOP_LEFT_CHEST',
      'MM_CLOCK_TOWN_OCARINA',
    ]);
  });

  it('skips autotracker history entries when the frontend state does not change', () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.applyAutotrackerDelta(
      new Map([
        ['OOT_HOOKSHOT', 1],
        ['MM_BOW', 1],
      ]),
      ['OOT_KF_MIDOS_TOP_LEFT_CHEST', 'MM_CLOCK_TOWN_OCARINA'],
    );

    expect(sessionStore.undoHistory).toHaveLength(1);

    sessionStore.applyAutotrackerDelta(
      new Map([
        ['OOT_HOOKSHOT', 1],
        ['MM_BOW', 1],
      ]),
      ['MM_CLOCK_TOWN_OCARINA', 'OOT_KF_MIDOS_TOP_LEFT_CHEST'],
    );

    expect(sessionStore.undoHistory).toHaveLength(1);
    expect(sessionStore.collectedLocationIds).toEqual([
      'OOT_KF_MIDOS_TOP_LEFT_CHEST',
      'MM_CLOCK_TOWN_OCARINA',
    ]);
  });
});
