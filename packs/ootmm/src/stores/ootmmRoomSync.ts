import { isSafeKey, safeJsonParse } from '@/utils/safeJson';
import type {
  OoTMMSyncOperation,
  OoTMMSyncOperationEnvelope,
} from './ootmmSessionSync';

const PROTOCOL_SCHEMA = 1;
const STATE_SCHEMA = 1;
const STATE_TYPE = 'ootmm-session';
// Must be >= the server's MAX_MESSAGE_BYTES so legit full-state snapshots and
// ops are never rejected at the transport layer.
const MAX_MESSAGE_LENGTH = 768 * 1024;
const MAX_SEEN_OP_IDS = 2_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

export type OoTMMRoomSessionSnapshot = {
  inventoryById: Record<string, number>;
  collectedLocationIds: string[];
  junkLocationIds: string[];
  preCompletedDungeons: string[];
  songEvents: Record<string, number>;
  shopPrices: Record<string, number>;
  trackerSettings: Record<string, unknown>;
  entranceOverrides: Record<string, string>;
  hasImportedSpoilerLog: boolean;
  importedSpoilerLogVersion: string | null;
  spoilerFishItemIds: string[];
};

export type OoTMMRoomSnapshotEnvelope = {
  protocolSchema: number;
  stateSchema: number;
  stateType: string;
  sessionId: string;
  baselineSeq: number;
  capturedAt: number;
  state: OoTMMRoomSessionSnapshot;
  extensions?: Record<string, unknown>;
};

export type OoTMMRoomSyncCallbacks = {
  onRemoteOperation: (envelope: OoTMMSyncOperationEnvelope) => void;
  onSnapshot: (
    snapshotEnvelope: OoTMMRoomSnapshotEnvelope,
  ) => Promise<void> | void;
  // Fired when the relay echoes back one of our own ops. The relay persists an
  // op before broadcasting it, so the echo doubles as a durable ack: an op
  // whose echo arrived can never be lost to a server crash or socket death.
  onOperationAck?: (opId: string) => void;
  onPresenceChange?: (peerCount: number) => void;
  onRemoteActivity?: () => void;
  onConnectionChange?: (
    state: 'connecting' | 'connected' | 'disconnected',
  ) => void;
};

export type OoTMMRoomSyncConnection = {
  // Returns the wire opId when the op was actually handed to an open socket,
  // or null when it wasn't sent. "Sent" is not "delivered": the caller must
  // keep the op queued until onOperationAck reports the relay echoed it back.
  publish: (op: OoTMMSyncOperation) => string | null;
  disconnect: () => void;
};

export type OoTMMRoomSyncOptions = {
  url: string;
  roomId: string;
  roomKey: string;
  // Called on every (re)connect to seed a brand-new room. The server ignores
  // the seed when the room already exists, so re-capturing live state each time
  // means a vanished room (pruned / DB reset) is re-seeded with our *current*
  // state rather than a stale snapshot frozen at coop-start.
  captureSeedSnapshot?: () => OoTMMRoomSnapshotEnvelope | null;
  actorId: string;
  callbacks: OoTMMRoomSyncCallbacks;
};

type JoinedMessage = {
  type: 'joined';
  roomId: string;
  baselineSeq: number;
  peerCount: number;
};

type PeersMessage = {
  type: 'peers';
  peerCount: number;
};

type RoomEventMessage = {
  type: 'op';
  serverSeq: number;
  envelope: {
    protocolSchema: number;
    sessionId: string;
    opId: string;
    actorId: string;
    clientClock: number;
    ts: number;
    op: OoTMMSyncOperation;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function randomId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!isSafeKey(value)) return null;
  return value;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  const numeric = normalizeNumber(value);
  if (numeric === null) return null;
  if (numeric < 0 || Math.floor(numeric) !== numeric) return null;
  return numeric;
}

function markSeen(
  seenOpIds: Set<string>,
  seenOrder: string[],
  opId: string,
): void {
  if (seenOpIds.has(opId)) return;
  seenOpIds.add(opId);
  seenOrder.push(opId);
  if (seenOrder.length <= MAX_SEEN_OP_IDS) return;
  const removed = seenOrder.shift();
  if (removed) seenOpIds.delete(removed);
}

function parseMessage(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null;
  if (raw.length > MAX_MESSAGE_LENGTH) return null;
  try {
    const parsed = safeJsonParse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeOperationEnvelope(
  value: unknown,
  roomId: string,
): RoomEventMessage['envelope'] | null {
  if (!isObject(value)) return null;
  const protocolSchema = normalizeNonNegativeInteger(value.protocolSchema);
  const sessionId = normalizeString(value.sessionId);
  const opId = normalizeString(value.opId);
  const actorId = normalizeString(value.actorId);
  const clientClock = normalizeNonNegativeInteger(value.clientClock);
  const ts = normalizeNonNegativeInteger(value.ts);
  if (
    protocolSchema !== PROTOCOL_SCHEMA ||
    sessionId !== roomId ||
    !opId ||
    !actorId ||
    clientClock === null ||
    ts === null
  ) {
    return null;
  }
  if (!isObject(value.op) || typeof value.op.type !== 'string') return null;
  return {
    protocolSchema,
    sessionId,
    opId,
    actorId,
    clientClock,
    ts,
    op: value.op as OoTMMSyncOperation,
  };
}

function normalizeJoinedMessage(
  value: Record<string, unknown>,
  roomId: string,
): JoinedMessage | null {
  if (value.type !== 'joined') return null;
  const joinedRoomId = normalizeString(value.roomId);
  const baselineSeq = normalizeNonNegativeInteger(value.baselineSeq);
  const peerCount = normalizeNonNegativeInteger(value.peerCount);
  if (joinedRoomId !== roomId || baselineSeq === null || peerCount === null) {
    return null;
  }
  return {
    type: 'joined',
    roomId: joinedRoomId,
    baselineSeq,
    peerCount,
  };
}

function normalizePeersMessage(
  value: Record<string, unknown>,
): PeersMessage | null {
  if (value.type !== 'peers') return null;
  const peerCount = normalizeNonNegativeInteger(value.peerCount);
  if (peerCount === null) return null;
  return { type: 'peers', peerCount };
}

function normalizeSnapshotEnvelope(
  value: unknown,
  roomId: string,
): OoTMMRoomSnapshotEnvelope | null {
  if (!isObject(value)) return null;
  const protocolSchema = normalizeNonNegativeInteger(value.protocolSchema);
  const stateSchema = normalizeNonNegativeInteger(value.stateSchema);
  const stateType = normalizeString(value.stateType);
  const sessionId = normalizeString(value.sessionId);
  const baselineSeq = normalizeNonNegativeInteger(value.baselineSeq);
  const capturedAt = normalizeNonNegativeInteger(value.capturedAt);
  if (
    protocolSchema !== PROTOCOL_SCHEMA ||
    stateSchema !== STATE_SCHEMA ||
    stateType !== STATE_TYPE ||
    sessionId !== roomId ||
    baselineSeq === null ||
    capturedAt === null ||
    !isObject(value.state)
  ) {
    return null;
  }

  return {
    protocolSchema,
    stateSchema,
    stateType,
    sessionId,
    baselineSeq,
    capturedAt,
    state: value.state as OoTMMRoomSessionSnapshot,
    ...(isObject(value.extensions)
      ? { extensions: value.extensions as Record<string, unknown> }
      : {}),
  };
}

export function createOoTMMRoomSessionSync(
  options: OoTMMRoomSyncOptions,
): OoTMMRoomSyncConnection {
  const { url, roomId, roomKey, captureSeedSnapshot, actorId, callbacks } =
    options;
  let socket: WebSocket | null = null;
  let disposed = false;
  let allowReconnect = true;
  let reconnectDelayMs = 500;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let clientClock = 0;
  let joined = false;
  let ready = false;
  let pendingPeerCount = 0;
  let seenOpIds = new Set<string>();
  let seenOpOrder: string[] = [];
  let messageQueue: Promise<void> = Promise.resolve();

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function updateConnectionState(
    state: 'connecting' | 'connected' | 'disconnected',
  ) {
    callbacks.onConnectionChange?.(state);
  }

  function resetSessionState() {
    joined = false;
    ready = false;
    pendingPeerCount = 0;
    seenOpIds = new Set();
    seenOpOrder = [];
  }

  function scheduleReconnect() {
    if (disposed || !allowReconnect || reconnectTimer !== null) return;
    updateConnectionState('disconnected');
    callbacks.onPresenceChange?.(0);
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function handleClose() {
    socket = null;
    resetSessionState();
    // Always reflect the closed socket in the UI, even when reconnect is
    // suppressed (e.g. the server rejected us) — otherwise the panel stays
    // stuck on "Connected".
    updateConnectionState('disconnected');
    scheduleReconnect();
  }

  function closeAndStop(reason: string) {
    allowReconnect = false;
    socket?.close(1008, reason);
  }

  function handleServerEvent(message: RoomEventMessage) {
    if (message.envelope.actorId === actorId) {
      callbacks.onOperationAck?.(message.envelope.opId);
      return;
    }
    if (seenOpIds.has(message.envelope.opId)) return;

    clientClock = Math.max(clientClock, message.envelope.clientClock) + 1;
    markSeen(seenOpIds, seenOpOrder, message.envelope.opId);
    callbacks.onRemoteActivity?.();
    callbacks.onRemoteOperation({
      schema: message.envelope.protocolSchema,
      sessionId: message.envelope.sessionId,
      opId: message.envelope.opId,
      actorId: message.envelope.actorId,
      lamport: message.envelope.clientClock,
      ts: message.envelope.ts,
      op: message.envelope.op,
    });
  }

  async function handleMessage(raw: unknown): Promise<void> {
    const message = parseMessage(raw);
    if (!message) {
      closeAndStop('invalid message');
      return;
    }

    if (message.type === 'joined') {
      const joinedMessage = normalizeJoinedMessage(message, roomId);
      if (!joinedMessage) {
        closeAndStop('invalid joined');
        return;
      }
      joined = true;
      pendingPeerCount = joinedMessage.peerCount;
      return;
    }

    if (message.type === 'snapshot') {
      if (!joined) {
        closeAndStop('snapshot before joined');
        return;
      }
      const snapshotEnvelope = normalizeSnapshotEnvelope(
        message.snapshotEnvelope,
        roomId,
      );
      if (!snapshotEnvelope) {
        closeAndStop('invalid snapshot');
        return;
      }
      await callbacks.onSnapshot(snapshotEnvelope);
      callbacks.onRemoteActivity?.();
      callbacks.onPresenceChange?.(Math.max(0, pendingPeerCount - 1));
      reconnectDelayMs = 500;
      ready = true;
      updateConnectionState('connected');
      return;
    }

    if (message.type === 'peers') {
      const peersMessage = normalizePeersMessage(message);
      if (!peersMessage) {
        closeAndStop('invalid peers');
        return;
      }
      callbacks.onPresenceChange?.(Math.max(0, peersMessage.peerCount - 1));
      return;
    }

    if (message.type === 'op') {
      const serverSeq = normalizeNonNegativeInteger(message.serverSeq);
      const envelope = normalizeOperationEnvelope(message.envelope, roomId);
      if (serverSeq === null || !envelope) {
        closeAndStop('invalid op');
        return;
      }
      if (!ready) {
        closeAndStop('op before snapshot');
        return;
      }
      handleServerEvent({
        type: 'op',
        serverSeq,
        envelope,
      });
      return;
    }

    if (message.type === 'error') {
      const reason =
        typeof message.message === 'string' ? message.message : 'server error';
      console.error('[OoTMM Sync] Room relay rejected the connection:', reason);
      // A rejection during the join handshake (e.g. an unknown/invalid room) is
      // fatal — stop reconnecting so we don't hammer the relay. Once we're live,
      // an error is per-op (realistically the snapshot-size cap); let the server
      // close the socket and reconnect rather than killing the whole session.
      if (!ready) {
        closeAndStop(reason);
      }
      return;
    }

    closeAndStop('unsupported message');
  }

  function connect() {
    if (disposed) return;
    allowReconnect = true;
    clearReconnectTimer();
    resetSessionState();
    updateConnectionState('connecting');

    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.addEventListener('open', () => {
      const seedSnapshot = captureSeedSnapshot?.() ?? null;
      nextSocket.send(
        JSON.stringify({
          type: 'join',
          roomId,
          roomKey,
          actorId,
          ...(seedSnapshot ? { snapshotEnvelope: seedSnapshot } : {}),
        }),
      );
    });

    nextSocket.addEventListener('message', (event) => {
      messageQueue = messageQueue
        .then(() => handleMessage(event.data))
        .catch((error) => {
          console.error('[OoTMM Sync] Failed to process room message:', error);
          nextSocket.close();
        });
    });

    nextSocket.addEventListener('error', () => {
      // Let the close event drive reconnects; browsers provide little detail here.
    });

    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) return;
      handleClose();
    });
  }

  connect();

  return {
    publish(op) {
      // Return the wire opId only when the op was actually put on the wire
      // (null covers the window where the socket is already CLOSING but the
      // connection state ref still says 'connected'). The caller keeps the op
      // queued until the relay's echo acks that opId, so an op that dies in
      // flight is replayed after the reconnect snapshot.
      if (!ready || !socket || socket.readyState !== WebSocket.OPEN) {
        return null;
      }
      clientClock += 1;
      const opId = randomId();
      markSeen(seenOpIds, seenOpOrder, opId);
      socket.send(
        JSON.stringify({
          type: 'op',
          envelope: {
            protocolSchema: PROTOCOL_SCHEMA,
            sessionId: roomId,
            opId,
            actorId,
            clientClock,
            ts: Date.now(),
            op,
          },
        }),
      );
      return opId;
    },
    disconnect() {
      disposed = true;
      allowReconnect = false;
      clearReconnectTimer();
      updateConnectionState('disconnected');
      callbacks.onPresenceChange?.(0);
      if (socket) {
        const currentSocket = socket;
        socket = null;
        currentSocket.close();
      }
      resetSessionState();
    },
  };
}

export function defaultRoomSyncUrl(): string {
  if (typeof window !== 'undefined') {
    const override = (window as Window & { __TLT_COOP_WS_URL__?: string })
      .__TLT_COOP_WS_URL__;
    if (override) return override;
  }
  const envUrl = (import.meta as unknown as { env?: Record<string, string> })
    .env?.VITE_TLT_COOP_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window === 'undefined') return 'ws://localhost:8765/';
  const { protocol, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${host}/coop/ws`;
}
