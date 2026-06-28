import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';
import {
  OOTMM_LOCAL_SESSION_ID,
  type OoTMMSyncOperationEnvelope,
} from '@packs/ootmm/stores/ootmmSessionSync';
import { getEdgeReverse } from '@packs/ootmm/utils/entranceRandomization';
import type { TrackerPack } from '@/types/tracker';

/**
 * Regression tests from the coop-protocol soundness audit.
 *
 * Each test asserts the *converged* behaviour the protocol must guarantee. They
 * originally documented three real divergence / lost-update bugs; they now pin
 * the fixes:
 *
 *  1. A `settings.patch_special_conds` that arrives while the client is mid
 *     `applySettings` must still be applied (it was silently dropped, while the
 *     relay always merges it). Fixed by deferring remote ops until the local
 *     settings-apply window closes.
 *  2. Entrance-override coupling is re-derived per client but the relay stores
 *     only single edges, so a coupled *delete* must be mirrored to the relay as
 *     both edges or a late joiner re-couples a pair every live peer deleted.
 *  3. "Mark all reachable" is an additive bulk collect; it must emit granular
 *     `locations.set_collected` ops, not a whole-list `locations.set_ids`
 *     replace that clobbers a peer's concurrent collect at the relay.
 */
describe('coop protocol edge cases (audit regressions)', () => {
  let opsChannel: BroadcastChannel;

  beforeEach(() => {
    setActivePinia(createPinia());
    opsChannel = new BroadcastChannel('tlt:ootmm-session-ops:v1');
  });

  afterEach(() => {
    opsChannel.close();
  });

  function pushRemoteOp(op: OoTMMSyncOperationEnvelope['op']) {
    const envelope: OoTMMSyncOperationEnvelope = {
      schema: 1,
      sessionId: OOTMM_LOCAL_SESSION_ID,
      opId: Math.random().toString(36).slice(2),
      actorId: 'remote-test-actor',
      lamport: 1,
      ts: Date.now(),
      op,
    };
    opsChannel.postMessage(envelope);
  }

  // Capture every op a store publishes to the room/relay so a test can mirror
  // the relay's reduction over exactly those ops (the relay has no coupling
  // concept and reduces each op independently).
  function capturePublishedOps(): OoTMMSyncOperationEnvelope['op'][] {
    const published: OoTMMSyncOperationEnvelope['op'][] = [];
    opsChannel.onmessage = (
      event: MessageEvent<OoTMMSyncOperationEnvelope>,
    ) => {
      published.push(event.data.op);
    };
    return published;
  }

  // A minimal tracker whose `initialize` parks on a gate we control, so we can
  // hold the store inside its `isApplyingSettings` window for as long as the
  // test needs. `specialConds` round-trips through setSpecialConds/getSettings,
  // so a patch that *is* applied becomes observable on `trackerSettings` — i.e.
  // a failure is attributable to the dropped op, not to a missing engine.
  function createGatedStubTracker(initGate: Promise<void>): TrackerPack {
    let specialConds: Record<string, unknown> = {};
    return markRaw({
      id: 'stub',
      name: 'stub',
      description: 'stub',
      async initialize(settings: Record<string, unknown>) {
        await initGate;
        specialConds = { ...(settings.specialConds as object | undefined) };
      },
      checkReachability: () => ({
        reachableLocationIds: [],
        newLocationIds: [],
        canComplete: false,
        extra: {},
      }),
      getAllLocations: () => [],
      getSettings: () => ({ specialConds: { ...specialConds } }),
      setSpecialConds(patch: Record<string, unknown>) {
        specialConds = { ...specialConds, ...patch };
      },
      reset: () => {},
    }) as unknown as TrackerPack;
  }

  // --- Scenario 1: special-conds patch must survive a mid-settings-apply ----
  it('applies a remote settings.patch_special_conds that lands mid-settings-apply', async () => {
    const store = useOoTMMSessionStore();
    store.startLocalSessionSync();

    let releaseInit!: () => void;
    const initGate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    await store.attachTracker(createGatedStubTracker(initGate), {
      deferInit: true,
    });

    // A *local* settings change opens the real isApplyingSettings window and
    // parks inside the tracker's gated initialize(). `isApplyingSettings` is
    // set synchronously, before the first await, so it is already true here.
    const applyPromise = store.applySettings({});
    expect(store.isApplyingSettings).toBe(true);

    // Meanwhile a peer toggles a special condition. The relay reducer deep-
    // merges this into trackerSettings.specialConds, so the room state (and
    // every later joiner) sees SHARED_BRIDGE = 1.
    pushRemoteOp({
      type: 'settings.patch_special_conds',
      patch: { SHARED_BRIDGE: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Let the settings apply finish and isApplyingSettings clear.
    releaseInit();
    await applyPromise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The remote patch is deferred until the apply window closes, then applied —
    // so this client converges to the room state instead of silently diverging.
    expect(store.trackerSettings.specialConds).toMatchObject({
      SHARED_BRIDGE: 1,
    });

    store.stopLocalSessionSync();
  });

  // --- Scenario 2: coupled entrance delete stays consistent for late joiners -
  it('keeps a coupled entrance delete consistent for late joiners', async () => {
    // A real involution pair from @ootmm/data: each side is the other's reverse.
    const SRC = 'OOT_DEKU_TREE';
    const DST = 'OOT_DODONGO_CAVERN';
    const REV_OF_SRC = 'OOT_KOKIRI_FOREST_FROM_DEKU_TREE';
    const REV_OF_DST = 'OOT_MOUNTAIN_TRAIL_FROM_DODONGO_CAVERN';

    // Guard the data assumption so this fails loudly (not silently passes) if
    // the entrance pack ever drops these reverses.
    expect(getEdgeReverse(SRC)).toBe(REV_OF_SRC);
    expect(getEdgeReverse(DST)).toBe(REV_OF_DST);

    const published = capturePublishedOps();

    // Editing client: map SRC -> DST (the client couples and also stores the
    // reverse edge), then clear the entrance from its reverse side (the client
    // deletes BOTH coupled edges, so live peers end up with an empty mapping).
    const editor = useOoTMMSessionStore();
    editor.startLocalSessionSync();
    editor.setEntranceOverride(SRC, DST);
    editor.setEntranceOverride(REV_OF_DST, null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const livePeerView = { ...editor.entranceOverrides };
    editor.stopLocalSessionSync();
    expect(livePeerView).toEqual({});

    // Mirror the relay's single-edge reduction over exactly the published ops.
    // The relay has no coupling concept: each set_entrance_override sets or pops
    // one key; set_entrance_overrides replaces the whole map.
    const relayOverrides: Record<string, string> = {};
    for (const op of published) {
      if (op.type === 'world.set_entrance_override') {
        if (op.dst === null || op.dst === '') delete relayOverrides[op.src];
        else relayOverrides[op.src] = op.dst;
      } else if (op.type === 'world.set_entrance_overrides') {
        for (const key of Object.keys(relayOverrides))
          delete relayOverrides[key];
        Object.assign(relayOverrides, op.overrides);
      }
    }

    // Fresh joiner: gets the relay's reduced snapshot and re-couples it. With
    // the coupled delete mirrored to the relay, the forward edge is gone too, so
    // the joiner converges to the (empty) live-peer view.
    setActivePinia(createPinia());
    const joiner = useOoTMMSessionStore();
    joiner.setEntranceOverrides(relayOverrides, { source: 'remote' });

    expect(joiner.entranceOverrides).toEqual(livePeerView);
  });

  // --- Scenario 3: additive bulk collect must not clobber a concurrent collect
  it('preserves a concurrent collect when marking a region reachable', async () => {
    const published = capturePublishedOps();

    const store = useOoTMMSessionStore();
    store.startLocalSessionSync();

    // "Mark all reachable" over a region is additive. It must publish granular
    // collects, never a whole-list set_ids replace.
    store.collectLocationIds(['LOC_A_ONE', 'LOC_A_TWO']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    store.stopLocalSessionSync();

    expect(published.some((op) => op.type === 'locations.set_ids')).toBe(false);
    expect(
      published.filter(
        (op) => op.type === 'locations.set_collected' && op.collected,
      ).length,
    ).toBe(2);

    // Mirror the relay reduction over a peer's prior, concurrent collect: the
    // granular collects merge, so the peer's collect survives.
    const relayCollected = new Set<string>(['LOC_B_PICKUP']);
    for (const op of published) {
      if (op.type === 'locations.set_collected') {
        if (op.collected) relayCollected.add(op.locationId);
        else relayCollected.delete(op.locationId);
      } else if (op.type === 'locations.set_ids') {
        relayCollected.clear();
        for (const id of op.ids) relayCollected.add(id);
      }
    }
    expect(relayCollected.has('LOC_B_PICKUP')).toBe(true);
    expect(relayCollected.has('LOC_A_ONE')).toBe(true);
    expect(relayCollected.has('LOC_A_TWO')).toBe(true);
  });
});
