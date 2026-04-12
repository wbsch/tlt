import { ref, watch, type Ref } from 'vue';
import {
  translateAutotrackerItems,
  applyDelta,
  type AutotrackerItem,
} from './autotrackerMapping';

export type AutotrackerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

interface AutotrackerOptions {
  /** Available item IDs from the tracker (setting-dependent). */
  availableItemIds: Ref<Set<string>>;
  /** Effective item max counts from the tracker (setting-dependent). */
  itemMaxCounts: Ref<Map<string, number>>;
  /** Called when the autotracker has new inventory to apply. */
  onInventoryUpdate: (inventory: Record<string, number>) => void;
}

interface ItemMessage {
  type: 'item';
  diff: boolean;
  refresh: boolean;
  items: AutotrackerItem[];
}

interface RefreshMessage {
  type: 'refresh';
  refresh: true;
}

interface HandshakeAckMessage {
  type: 'handshAck';
  version: string;
  name: string;
  refresh: boolean;
}

type ServerMessage = ItemMessage | RefreshMessage | HandshakeAckMessage;

const DEFAULT_URL = 'ws://localhost:17026/';
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

export function useAutotracker(options: AutotrackerOptions) {
  const status = ref<AutotrackerStatus>('disconnected');
  const enabled = ref(false);
  const url = ref(DEFAULT_URL);
  const lastError = ref<string | null>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;

  // Canonical autotracker state (translated to tracker IDs)
  let liveState = new Map<string, number>();
  // Buffer used during full-sync
  let pendingFullState: Map<string, number> | null = null;
  let isInFullSync = false;

  function connect() {
    cleanup();
    status.value = 'connecting';
    lastError.value = null;

    try {
      ws = new WebSocket(url.value);
    } catch (e) {
      status.value = 'error';
      lastError.value = e instanceof Error ? e.message : String(e);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      // Send handshake
      ws!.send(
        JSON.stringify({
          type: 'handshake',
          features: ['items'],
          flags: {},
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      lastError.value = 'WebSocket error';
      status.value = 'error';
    };

    ws.onclose = () => {
      ws = null;
      if (enabled.value) {
        status.value = 'disconnected';
        scheduleReconnect();
      } else {
        status.value = 'disconnected';
      }
    };
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'handshAck':
        status.value = 'connected';
        // Server will send a full sync automatically after handshake.
        // Prepare buffer.
        pendingFullState = new Map();
        isInFullSync = true;
        break;

      case 'item':
        processItemMessage(msg as ItemMessage);
        break;

      case 'refresh':
        processRefresh();
        break;
    }
  }

  function processItemMessage(msg: ItemMessage) {
    const translated = translateAutotrackerItems(
      msg.items,
      options.availableItemIds.value,
      options.itemMaxCounts.value,
    );

    if (isInFullSync && !msg.diff) {
      // Full sync: set absolute values in the pending buffer
      for (const [id, qty] of Object.entries(translated)) {
        if (qty > 0) {
          pendingFullState!.set(
            id,
            Math.max(pendingFullState!.get(id) ?? 0, qty),
          );
        }
      }
    } else if (msg.diff) {
      // Live delta: apply additively to liveState
      liveState = applyDelta(
        liveState,
        msg.items,
        options.availableItemIds.value,
        options.itemMaxCounts.value,
      );
      if (msg.refresh) {
        pushToTracker();
      }
    } else {
      // Non-diff, non-fullsync (shouldn't happen normally, but handle it)
      for (const [id, qty] of Object.entries(translated)) {
        if (qty > 0) {
          liveState.set(id, qty);
        } else {
          liveState.delete(id);
        }
      }
      if (msg.refresh) {
        pushToTracker();
      }
    }
  }

  function processRefresh() {
    if (isInFullSync && pendingFullState) {
      // Full sync is complete — adopt the buffered state as live
      liveState = pendingFullState;
      pendingFullState = null;
      isInFullSync = false;
      pushToTracker();
    }
  }

  function pushToTracker() {
    const record: Record<string, number> = {};
    for (const [id, qty] of liveState) {
      if (qty > 0) {
        record[id] = qty;
      }
    }
    options.onInventoryUpdate(record);
  }

  function cleanup() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    pendingFullState = null;
    isInFullSync = false;
  }

  function disconnect() {
    cleanup();
    liveState = new Map();
    status.value = 'disconnected';
    lastError.value = null;
    reconnectAttempts = 0;
  }

  function scheduleReconnect() {
    if (!enabled.value) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * 2 ** reconnectAttempts,
      RECONNECT_MAX_DELAY,
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (enabled.value) connect();
    }, delay);
  }

  // Watch enable/disable toggle
  watch(enabled, (isEnabled) => {
    if (isEnabled) {
      connect();
    } else {
      disconnect();
    }
  });

  function destroy() {
    enabled.value = false;
    disconnect();
  }

  return {
    status,
    enabled,
    url,
    lastError,
    destroy,
  };
}
