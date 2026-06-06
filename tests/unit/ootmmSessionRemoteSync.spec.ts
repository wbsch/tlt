import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';
import {
  OOTMM_LOCAL_SESSION_ID,
  type OoTMMSyncOperationEnvelope,
} from '@packs/ootmm/stores/ootmmSessionSync';

describe('ootmm session remote sync', () => {
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
      opId: Math.random().toString(36).substring(7),
      actorId: 'remote-test-actor',
      lamport: 1,
      ts: Date.now(),
      op,
    };
    opsChannel.postMessage(envelope);
  }

  it('applies remote entrance overrides without polluting undo history', async () => {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.startLocalSessionSync();

    // Trigger explicit single override
    pushRemoteOp({
      type: 'world.set_entrance_override',
      src: 'OOT_GF_ENTRANCE',
      dst: 'MM_CLOCK_TOWN_ENTRANCE',
    });

    // Wait a brief moment for BroadcastChannel event to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sessionStore.entranceOverrides).toEqual({
      OOT_GF_ENTRANCE: 'MM_CLOCK_TOWN_ENTRANCE',
    });
    // History should remain empty for remote events
    expect(sessionStore.undoHistory).toHaveLength(0);

    // Trigger multiple overrides
    pushRemoteOp({
      type: 'world.set_entrance_overrides',
      overrides: {
        A: 'B',
        C: 'D',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sessionStore.entranceOverrides).toEqual({
      A: 'B',
      C: 'D',
    });
    // History should remain empty for remote events
    expect(sessionStore.undoHistory).toHaveLength(0);

    sessionStore.stopLocalSessionSync();
  });
});
