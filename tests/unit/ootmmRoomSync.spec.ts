import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';

type Listener = (event: unknown) => void;

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatch('open', new Event('open'));
    });
  }

  addEventListener(name: string, listener: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  removeEventListener(name: string, listener: Listener) {
    this.listeners.get(name)?.delete(listener);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.dispatch('close', new Event('close'));
  }

  emitMessage(data: unknown) {
    this.dispatch('message', { data: JSON.stringify(data) });
  }

  private dispatch(name: string, event: unknown) {
    this.listeners.get(name)?.forEach((listener) => listener(event));
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ootmm room sync', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as { WebSocket: typeof MockWebSocket }).WebSocket =
      MockWebSocket;
    setActivePinia(createPinia());
  });

  afterEach(() => {
    (globalThis as { WebSocket: typeof originalWebSocket }).WebSocket =
      originalWebSocket;
  });

  async function joinRoom(code = 'testroom') {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.startRoomSync({ roomCode: code, url: 'ws://test/' });
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];
    socket.emitMessage({
      type: 'joined',
      roomId: code,
      baselineSeq: 0,
      peerCount: 1,
    });
    socket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: code,
        baselineSeq: 0,
        capturedAt: 0,
        state: {
          inventoryById: {},
          collectedLocationIds: [],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();
    return { sessionStore, socket };
  }

  it('sends a join message with the room code and seed snapshot on connect', async () => {
    const { socket } = await joinRoom('ROOM1');
    const join = JSON.parse(socket.sent[0]);
    expect(join.type).toBe('join');
    expect(join.roomId).toBe('ROOM1');
    expect(join.roomKey).toBe('ROOM1');
    expect(join.actorId).toBeDefined();
    // The seed lets the server populate a brand-new room with our current
    // state instead of handing back an empty document.
    expect(join.snapshotEnvelope).toBeDefined();
    expect(join.snapshotEnvelope.stateType).toBe('ootmm-session');
    expect(join.snapshotEnvelope.state).toBeDefined();
  });

  it('disables undo/redo while in a coop room', async () => {
    const { sessionStore } = await joinRoom('ROOMU');
    sessionStore.toggleCollectedLocation('CHECK_U');
    // A local mutation would normally create undo history, but coop disables it
    // because undo republishes the whole snapshot and clobbers peers.
    expect(sessionStore.canUndo).toBe(false);
    sessionStore.leaveRoom();
    // After leaving, history is available again.
    expect(sessionStore.canUndo).toBe(true);
  });

  it('applies remote ops from the room to local state', async () => {
    const { sessionStore, socket } = await joinRoom();
    socket.emitMessage({
      type: 'op',
      serverSeq: 1,
      envelope: {
        protocolSchema: 1,
        sessionId: 'testroom',
        opId: 'remote-op',
        actorId: 'other-actor',
        clientClock: 1,
        ts: Date.now(),
        op: {
          type: 'locations.set_collected',
          locationId: 'CHECK_X',
          collected: true,
        },
      },
    });
    await flushMicrotasks();
    expect(sessionStore.collectedLocationIds).toContain('CHECK_X');
    expect(sessionStore.undoHistory).toHaveLength(0);
  });

  it('publishes local mutations to the room socket', async () => {
    const { sessionStore, socket } = await joinRoom();
    const before = socket.sent.length;
    sessionStore.toggleCollectedLocation('CHECK_Y');
    const published = socket.sent.slice(before).map((raw) => JSON.parse(raw));
    expect(published.length).toBeGreaterThan(0);
    const opMsg = published.find((m) => m.type === 'op');
    expect(opMsg).toBeDefined();
    expect(opMsg.envelope.op.type).toBe('locations.set_collected');
    expect(opMsg.envelope.op.locationId).toBe('CHECK_Y');
  });

  it('queues disconnected local mutations and replays them after reconnect snapshot', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMQ');
    socket.close();
    await flushMicrotasks();

    sessionStore.toggleCollectedLocation('CHECK_OFFLINE');
    expect(sessionStore.collectedLocationIds).toContain('CHECK_OFFLINE');

    await delay(650);
    await flushMicrotasks();
    const reconnectSocket = MockWebSocket.instances[1];
    expect(reconnectSocket).toBeDefined();
    reconnectSocket.emitMessage({
      type: 'joined',
      roomId: 'ROOMQ',
      baselineSeq: 0,
      peerCount: 1,
    });
    reconnectSocket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: 'ROOMQ',
        baselineSeq: 0,
        capturedAt: 0,
        state: {
          inventoryById: {},
          collectedLocationIds: [],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();

    expect(sessionStore.collectedLocationIds).toContain('CHECK_OFFLINE');
    const replayed = reconnectSocket.sent
      .slice(1)
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(replayed?.envelope.op).toEqual({
      type: 'locations.set_collected',
      locationId: 'CHECK_OFFLINE',
      collected: true,
    });
  });

  it('queues an op published in the socket-death window (G1)', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMD');
    // Simulate the window where the socket is already CLOSING but the 'close'
    // event hasn't fired yet, so coopConnectionState still reads 'connected'.
    // Pre-fix this op went to publish() on a dead socket and was silently
    // dropped (never queued), then reverted by the reconnect snapshot.
    socket.readyState = 2; // CLOSING
    sessionStore.toggleCollectedLocation('CHECK_DYING');
    expect(sessionStore.collectedLocationIds).toContain('CHECK_DYING');

    // Now let the socket actually close and reconnect.
    socket.close();
    await delay(650);
    await flushMicrotasks();
    const reconnectSocket = MockWebSocket.instances[1];
    expect(reconnectSocket).toBeDefined();
    reconnectSocket.emitMessage({
      type: 'joined',
      roomId: 'ROOMD',
      baselineSeq: 0,
      peerCount: 1,
    });
    reconnectSocket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: 'ROOMD',
        baselineSeq: 0,
        capturedAt: 0,
        state: {
          inventoryById: {},
          collectedLocationIds: [],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();

    // The op survived: re-applied on top of the reconnect snapshot and re-sent.
    expect(sessionStore.collectedLocationIds).toContain('CHECK_DYING');
    const replayed = reconnectSocket.sent
      .slice(1)
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(replayed?.envelope.op).toEqual({
      type: 'locations.set_collected',
      locationId: 'CHECK_DYING',
      collected: true,
    });
  });

  it('re-sends a sent-but-unacked op after reconnect (echo ack)', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMA');
    // The op goes out on a live socket, but the server dies before persisting
    // it — no echo ever comes back. Pre-ack this op was considered delivered
    // the moment send() succeeded and was silently lost.
    sessionStore.toggleCollectedLocation('CHECK_INFLIGHT');
    const sentOp = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(sentOp).toBeDefined();

    socket.close();
    await delay(650);
    await flushMicrotasks();
    const reconnectSocket = MockWebSocket.instances[1];
    expect(reconnectSocket).toBeDefined();
    reconnectSocket.emitMessage({
      type: 'joined',
      roomId: 'ROOMA',
      baselineSeq: 0,
      peerCount: 1,
    });
    reconnectSocket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: 'ROOMA',
        baselineSeq: 0,
        capturedAt: 0,
        state: {
          inventoryById: {},
          collectedLocationIds: [],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();

    expect(sessionStore.collectedLocationIds).toContain('CHECK_INFLIGHT');
    const replayed = reconnectSocket.sent
      .slice(1)
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(replayed?.envelope.op).toEqual({
      type: 'locations.set_collected',
      locationId: 'CHECK_INFLIGHT',
      collected: true,
    });
    // The replay is a new wire op, not a byte-for-byte resend.
    expect(replayed?.envelope.opId).not.toBe(sentOp.envelope.opId);
  });

  it('does not replay an op once the relay echo acks it', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMB');
    sessionStore.toggleCollectedLocation('CHECK_ACKED');
    const sentOp = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(sentOp).toBeDefined();

    // The relay persists the op and echoes it back to the sender — that echo
    // is the durable ack that releases it from the pending queue.
    socket.emitMessage({ type: 'op', serverSeq: 1, envelope: sentOp.envelope });
    await flushMicrotasks();

    socket.close();
    await delay(650);
    await flushMicrotasks();
    const reconnectSocket = MockWebSocket.instances[1];
    expect(reconnectSocket).toBeDefined();
    reconnectSocket.emitMessage({
      type: 'joined',
      roomId: 'ROOMB',
      baselineSeq: 1,
      peerCount: 1,
    });
    reconnectSocket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: 'ROOMB',
        baselineSeq: 1,
        capturedAt: 0,
        state: {
          inventoryById: {},
          // The server folded the acked op into its snapshot before dying.
          collectedLocationIds: ['CHECK_ACKED'],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();

    expect(sessionStore.collectedLocationIds).toContain('CHECK_ACKED');
    const replayed = reconnectSocket.sent
      .slice(1)
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'op');
    expect(replayed).toBeUndefined();
  });

  it('compacts queued ops so only the newest same-field edit replays', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMC');
    socket.close();
    await flushMicrotasks();

    sessionStore.toggleCollectedLocation('CHECK_TWICE'); // -> collected
    sessionStore.toggleCollectedLocation('CHECK_TWICE'); // -> uncollected again
    sessionStore.toggleCollectedLocation('CHECK_ONCE');

    await delay(650);
    await flushMicrotasks();
    const reconnectSocket = MockWebSocket.instances[1];
    expect(reconnectSocket).toBeDefined();
    reconnectSocket.emitMessage({
      type: 'joined',
      roomId: 'ROOMC',
      baselineSeq: 0,
      peerCount: 1,
    });
    reconnectSocket.emitMessage({
      type: 'snapshot',
      snapshotEnvelope: {
        protocolSchema: 1,
        stateSchema: 1,
        stateType: 'ootmm-session',
        sessionId: 'ROOMC',
        baselineSeq: 0,
        capturedAt: 0,
        state: {
          inventoryById: {},
          collectedLocationIds: [],
          preCompletedDungeons: [],
          songEvents: {},
          shopPrices: {},
          trackerSettings: {},
          entranceOverrides: {},
          hasImportedSpoilerLog: false,
          importedSpoilerLogVersion: null,
        },
      },
    });
    await flushMicrotasks();

    const collectedOps = reconnectSocket.sent
      .slice(1)
      .map((raw) => JSON.parse(raw))
      .filter(
        (message) =>
          message.type === 'op' &&
          message.envelope.op.type === 'locations.set_collected',
      );
    const twiceOps = collectedOps.filter(
      (message) => message.envelope.op.locationId === 'CHECK_TWICE',
    );
    expect(twiceOps).toHaveLength(1);
    expect(twiceOps[0].envelope.op.collected).toBe(false);
    expect(
      collectedOps.filter(
        (message) => message.envelope.op.locationId === 'CHECK_ONCE',
      ),
    ).toHaveLength(1);
  });

  it('publishes junk location ids to the room socket and applies remote ones', async () => {
    const { sessionStore, socket } = await joinRoom('ROOMJ');
    const before = socket.sent.length;
    sessionStore.setJunkLocationIds(['LOC_A', 'LOC_B']);
    const published = socket.sent.slice(before).map((raw) => JSON.parse(raw));
    const opMsg = published.find(
      (m) => m.type === 'op' && m.envelope.op.type === 'locations.set_junk_ids',
    );
    expect(opMsg).toBeDefined();
    expect([...opMsg.envelope.op.ids].sort()).toEqual(['LOC_A', 'LOC_B']);

    // A remote junk op updates local state without echoing back.
    socket.emitMessage({
      type: 'op',
      serverSeq: 2,
      envelope: {
        protocolSchema: 1,
        sessionId: 'ROOMJ',
        opId: 'remote-junk',
        actorId: 'other-actor',
        clientClock: 5,
        ts: Date.now(),
        op: { type: 'locations.set_junk_ids', ids: ['LOC_C'] },
      },
    });
    await flushMicrotasks();
    expect(sessionStore.junkLocationIds).toEqual(['LOC_C']);
  });

  it('rejects non-alphanumeric room codes before opening a socket', () => {
    const sessionStore = useOoTMMSessionStore();
    sessionStore.startRoomSync({ roomCode: 'bad-room', url: 'ws://test/' });
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(sessionStore.coopRoomCode).toBeNull();
  });

  it('updates peer count from server peers messages', async () => {
    const { sessionStore, socket } = await joinRoom();
    socket.emitMessage({ type: 'peers', peerCount: 3 });
    await flushMicrotasks();
    expect(sessionStore.coopPeerCount).toBe(2);
  });

  it('leaveRoom clears the persisted room code', async () => {
    const { sessionStore } = await joinRoom('ROOMZ');
    expect(sessionStore.coopRoomCode).toBe('ROOMZ');
    sessionStore.leaveRoom();
    expect(sessionStore.coopRoomCode).toBeNull();
    expect(sessionStore.coopPeerCount).toBe(0);
  });

  it('stopRoomSync (transient disconnect) preserves the room code', async () => {
    const { sessionStore } = await joinRoom('ROOMY');
    sessionStore.stopRoomSync();
    expect(sessionStore.coopRoomCode).toBe('ROOMY');
  });
});
