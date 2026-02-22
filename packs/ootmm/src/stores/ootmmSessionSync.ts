export const OOTMM_LOCAL_SESSION_ID = 'ootmm:local-default';

const OPS_CHANNEL_NAME = 'tlt:ootmm-session-ops:v1';
const PRESENCE_CHANNEL_NAME = 'tlt:ootmm-session-presence:v1';
const OPS_STORAGE_EVENT_KEY = 'tlt:ootmm-session-op-event:v1';
const PRESENCE_STALE_MS = 15_000;
const PRESENCE_HEARTBEAT_MS = 5_000;
const SCHEMA_VERSION = 1;
const MAX_SEEN_OP_IDS = 2_000;

type SyncOperationBase = {
  type:
    | 'inventory.set_full'
    | 'inventory.set_count'
    | 'locations.set_collected'
    | 'locations.set_ids'
    | 'world.set_precompleted'
    | 'world.set_song_events'
    | 'world.set_shop_prices'
    | 'world.set_shop_price'
    | 'settings.apply'
    | 'settings.patch_special_conds'
    | 'session.reset_defaults';
};

export type OoTMMSyncOperation =
  | (SyncOperationBase & {
      type: 'inventory.set_full';
      inventoryById: Record<string, number>;
    })
  | (SyncOperationBase & {
      type: 'inventory.set_count';
      itemId: string;
      count: number;
    })
  | (SyncOperationBase & {
      type: 'locations.set_collected';
      locationId: string;
      collected: boolean;
    })
  | (SyncOperationBase & {
      type: 'locations.set_ids';
      ids: string[];
    })
  | (SyncOperationBase & {
      type: 'world.set_precompleted';
      ids: string[];
    })
  | (SyncOperationBase & {
      type: 'world.set_song_events';
      events: Record<string, number>;
    })
  | (SyncOperationBase & {
      type: 'world.set_shop_prices';
      prices: Record<string, number>;
    })
  | (SyncOperationBase & {
      type: 'world.set_shop_price';
      locationId: string;
      price: number | null;
    })
  | (SyncOperationBase & {
      type: 'settings.apply';
      settings: Record<string, unknown>;
    })
  | (SyncOperationBase & {
      type: 'settings.patch_special_conds';
      patch: Record<string, unknown>;
    })
  | (SyncOperationBase & {
      type: 'session.reset_defaults';
    });

export type OoTMMSyncOperationEnvelope = {
  schema: number;
  sessionId: string;
  opId: string;
  actorId: string;
  lamport: number;
  ts: number;
  op: OoTMMSyncOperation;
};

type PresenceMessage = {
  sessionId: string;
  actorId: string;
  type: 'hello' | 'ack' | 'heartbeat' | 'bye';
  ts: number;
};

export type OoTMMSessionSyncCallbacks = {
  onRemoteOperation: (envelope: OoTMMSyncOperationEnvelope) => void;
  onPresenceChange?: (peerCount: number) => void;
  onRemoteActivity?: () => void;
};

export type OoTMMSessionSyncConnection = {
  publish: (op: OoTMMSyncOperation) => void;
  disconnect: () => void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function isSyncEnvelope(value: unknown): value is OoTMMSyncOperationEnvelope {
  if (!isObject(value)) return false;
  return (
    value.schema === SCHEMA_VERSION &&
    typeof value.sessionId === 'string' &&
    typeof value.opId === 'string' &&
    typeof value.actorId === 'string' &&
    typeof value.lamport === 'number' &&
    Number.isFinite(value.lamport) &&
    typeof value.ts === 'number' &&
    Number.isFinite(value.ts) &&
    isObject(value.op) &&
    typeof value.op.type === 'string'
  );
}

function isPresenceMessage(value: unknown): value is PresenceMessage {
  if (!isObject(value)) return false;
  return (
    typeof value.sessionId === 'string' &&
    typeof value.actorId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.ts === 'number' &&
    Number.isFinite(value.ts)
  );
}

function readFromStorageEvent(storageValue: string | null): unknown {
  if (!storageValue) return null;
  try {
    return JSON.parse(storageValue) as unknown;
  } catch {
    return null;
  }
}

function safePost(channel: BroadcastChannel | null, message: unknown): void {
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch {
    // Ignore transport-level failures and continue with storage fallback.
  }
}

export function createOoTMMLocalSessionSync(options: {
  actorId?: string;
  sessionId?: string;
  callbacks: OoTMMSessionSyncCallbacks;
}): OoTMMSessionSyncConnection {
  const actorId = options.actorId ?? randomId();
  const sessionId = options.sessionId ?? OOTMM_LOCAL_SESSION_ID;
  const callbacks = options.callbacks;

  let lamportClock = 0;
  const seenOpIds = new Set<string>();
  const seenOpOrder: string[] = [];
  const peerLastSeen = new Map<string, number>();

  const opsChannel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(OPS_CHANNEL_NAME)
      : null;
  const presenceChannel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(PRESENCE_CHANNEL_NAME)
      : null;

  function markSeen(opId: string) {
    if (seenOpIds.has(opId)) return;
    seenOpIds.add(opId);
    seenOpOrder.push(opId);
    if (seenOpOrder.length > MAX_SEEN_OP_IDS) {
      const removed = seenOpOrder.shift();
      if (removed) {
        seenOpIds.delete(removed);
      }
    }
  }

  function prunePeers(now: number) {
    let changed = false;
    for (const [peerActorId, lastSeen] of peerLastSeen.entries()) {
      if (now - lastSeen <= PRESENCE_STALE_MS) continue;
      peerLastSeen.delete(peerActorId);
      changed = true;
    }
    if (changed) {
      callbacks.onPresenceChange?.(peerLastSeen.size);
    }
  }

  function setPeerSeen(peerActorId: string, now: number) {
    peerLastSeen.set(peerActorId, now);
    callbacks.onPresenceChange?.(peerLastSeen.size);
  }

  function handleSyncEnvelope(raw: unknown): void {
    if (!isSyncEnvelope(raw)) return;
    if (raw.sessionId !== sessionId) return;
    if (raw.actorId === actorId) return;
    if (seenOpIds.has(raw.opId)) return;

    lamportClock = Math.max(lamportClock, raw.lamport) + 1;
    markSeen(raw.opId);
    callbacks.onRemoteActivity?.();
    callbacks.onRemoteOperation(raw);
  }

  function handlePresenceMessage(raw: unknown): void {
    if (!isPresenceMessage(raw)) return;
    if (raw.sessionId !== sessionId) return;
    if (raw.actorId === actorId) return;

    const now = Date.now();
    if (raw.type === 'bye') {
      if (peerLastSeen.delete(raw.actorId)) {
        callbacks.onPresenceChange?.(peerLastSeen.size);
      }
      return;
    }

    setPeerSeen(raw.actorId, now);
    prunePeers(now);

    if (raw.type === 'hello') {
      safePost(presenceChannel, {
        sessionId,
        actorId,
        type: 'ack',
        ts: now,
      } satisfies PresenceMessage);
    }
  }

  function publishToStorage(envelope: OoTMMSyncOperationEnvelope): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(OPS_STORAGE_EVENT_KEY, JSON.stringify(envelope));
      window.localStorage.removeItem(OPS_STORAGE_EVENT_KEY);
    } catch {
      // Ignore private mode / quota failures.
    }
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== OPS_STORAGE_EVENT_KEY) return;
    handleSyncEnvelope(readFromStorageEvent(event.newValue));
  };

  const onOpsMessage = (event: MessageEvent<unknown>) => {
    handleSyncEnvelope(event.data);
  };

  const onPresenceMessage = (event: MessageEvent<unknown>) => {
    handlePresenceMessage(event.data);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  opsChannel?.addEventListener('message', onOpsMessage);
  presenceChannel?.addEventListener('message', onPresenceMessage);

  const publishPresence = (type: PresenceMessage['type']) => {
    safePost(presenceChannel, {
      sessionId,
      actorId,
      type,
      ts: Date.now(),
    } satisfies PresenceMessage);
  };

  publishPresence('hello');
  callbacks.onPresenceChange?.(0);

  const heartbeatTimer =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          const now = Date.now();
          publishPresence('heartbeat');
          prunePeers(now);
        }, PRESENCE_HEARTBEAT_MS)
      : null;

  return {
    publish(op) {
      lamportClock += 1;
      const envelope: OoTMMSyncOperationEnvelope = {
        schema: SCHEMA_VERSION,
        sessionId,
        opId: randomId(),
        actorId,
        lamport: lamportClock,
        ts: Date.now(),
        op,
      };
      markSeen(envelope.opId);
      safePost(opsChannel, envelope);
      publishToStorage(envelope);
    },
    disconnect() {
      if (heartbeatTimer !== null && typeof window !== 'undefined') {
        window.clearInterval(heartbeatTimer);
      }
      publishPresence('bye');
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
      opsChannel?.removeEventListener('message', onOpsMessage);
      presenceChannel?.removeEventListener('message', onPresenceMessage);
      opsChannel?.close();
      presenceChannel?.close();
      peerLastSeen.clear();
      callbacks.onPresenceChange?.(0);
    },
  };
}
