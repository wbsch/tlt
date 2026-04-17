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
  /** Resolve a websocket check entry to one or more tracker location IDs. */
  resolveCheckToLocationIds?: (check: AutotrackerCheck) => string[];
  /** Called when the autotracker has a new collected-location state. */
  onCollectedLocationsUpdate?: (locationIds: string[]) => void;
}

interface ItemMessage {
  type: 'item';
  diff: boolean;
  refresh: boolean;
  items: AutotrackerItem[];
}

export interface AutotrackerCheck {
  id?: string;
  name?: string;
  checked: boolean;
}

interface CheckMessage {
  type: 'check';
  diff: boolean;
  refresh: boolean;
  checks: AutotrackerCheck[];
}

interface LocationMessage {
  type: 'location';
  refresh: boolean;
  game: string;
  sceneId: number;
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
const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';

interface AutotrackerBottleSlotMapping {
  autotrackerId: string;
  trackerItemId: string;
  gridRef: string;
  sharedGridRef?: string;
}

const AUTOTRACKER_BOTTLE_SLOT_MAPPINGS: AutotrackerBottleSlotMapping[] = [
  {
    autotrackerId: 'OOT_BOTTLE_1',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'OOT_BOTTLE_2',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'OOT_BOTTLE_3',
    trackerItemId: 'OOT_BOTTLE_EMPTY',
    gridRef: 'Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'MM_BOTTLE_1',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'MM_BOTTLE_2',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'MM_BOTTLE_3',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'MM_BOTTLE_4',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle4',
    sharedGridRef: 'Shared_Bottle4',
  },
  {
    autotrackerId: 'MM_BOTTLE_5',
    trackerItemId: 'MM_BOTTLE_EMPTY',
    gridRef: 'MM_Bottle5',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_1',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle1',
    sharedGridRef: 'Shared_Bottle1',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_2',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle2',
    sharedGridRef: 'Shared_Bottle2',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_3',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle3',
    sharedGridRef: 'Shared_Bottle3',
  },
  {
    autotrackerId: 'SHARED_BOTTLE_4',
    trackerItemId: 'SHARED_BOTTLE_EMPTY',
    gridRef: 'Shared_Bottle4',
    sharedGridRef: 'Shared_Bottle4',
  },
];

const AUTOTRACKER_BOTTLE_SLOT_MAPPING_BY_ID = new Map(
  AUTOTRACKER_BOTTLE_SLOT_MAPPINGS.map((mapping) => [
    mapping.autotrackerId,
    mapping,
  ]),
);

function makeGridRefStateKey(mapping: AutotrackerBottleSlotMapping): string {
  return `${GRID_REF_STATE_PREFIX}${GRID_REF_ALIAS_PREFIX}${mapping.gridRef}:${mapping.trackerItemId}`;
}

function isSharedBottleMode(availableItemIds: Set<string>): boolean {
  return (
    availableItemIds.has('SHARED_BOTTLE_EMPTY') &&
    !availableItemIds.has('OOT_BOTTLE_EMPTY') &&
    !availableItemIds.has('MM_BOTTLE_EMPTY')
  );
}

function makeSharedGridRefStateKey(
  mapping: AutotrackerBottleSlotMapping,
): string | null {
  if (!mapping.sharedGridRef) {
    return null;
  }

  return `${GRID_REF_STATE_PREFIX}${GRID_REF_ALIAS_PREFIX}${mapping.sharedGridRef}:SHARED_BOTTLE_EMPTY`;
}

function buildTrackerInventoryRecord(
  liveState: Map<string, number>,
  availableItemIds: Set<string>,
): Record<string, number> {
  const record: Record<string, number> = {};
  const sharedBottleMode = isSharedBottleMode(availableItemIds);
  const bottleCounts = new Map<string, number>();
  const sharedBottleGridRefStates = new Set<string>();

  for (const [id, qty] of liveState) {
    if (qty <= 0) {
      continue;
    }

    const bottleSlotMapping = AUTOTRACKER_BOTTLE_SLOT_MAPPING_BY_ID.get(id);
    if (!bottleSlotMapping) {
      record[id] = qty;
      continue;
    }

    if (sharedBottleMode) {
      const sharedGridRefStateKey =
        makeSharedGridRefStateKey(bottleSlotMapping);
      if (sharedGridRefStateKey) {
        record[sharedGridRefStateKey] = 1;
        sharedBottleGridRefStates.add(sharedGridRefStateKey);
      }
      continue;
    }

    record[makeGridRefStateKey(bottleSlotMapping)] = 1;
    bottleCounts.set(
      bottleSlotMapping.trackerItemId,
      (bottleCounts.get(bottleSlotMapping.trackerItemId) ?? 0) + 1,
    );
  }

  if (sharedBottleGridRefStates.size > 0) {
    record.SHARED_BOTTLE_EMPTY =
      (record.SHARED_BOTTLE_EMPTY ?? 0) + sharedBottleGridRefStates.size;
  }

  for (const [itemId, count] of bottleCounts) {
    record[itemId] = (record[itemId] ?? 0) + count;
  }

  return record;
}

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
  let liveChecks = new Map<string, AutotrackerCheck>();
  // Buffer used during full-sync
  let pendingFullState: Map<string, number> | null = null;
  let pendingFullChecks: Map<string, AutotrackerCheck> | null = null;
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
          features: ['items', 'checks'],
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
        pendingFullChecks = new Map();
        isInFullSync = true;
        break;

      case 'item':
        processItemMessage(msg as ItemMessage);
        break;

      case 'check':
        processCheckMessage(msg as CheckMessage);
        break;

      case 'location':
        break;

      case 'refresh':
        processRefresh();
        break;
    }
  }

  function getCheckStateKey(check: AutotrackerCheck): string | null {
    const id = check.id?.trim();
    if (id) return `id:${id}`;
    const name = check.name?.trim();
    if (name) return `name:${name}`;
    return null;
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

  function processCheckMessage(msg: CheckMessage) {
    if (isInFullSync && !msg.diff) {
      for (const check of msg.checks) {
        const key = getCheckStateKey(check);
        if (!key) continue;
        if (check.checked) {
          pendingFullChecks!.set(key, check);
        } else {
          pendingFullChecks!.delete(key);
        }
      }
      return;
    }

    if (msg.diff) {
      liveChecks = new Map(liveChecks);
      for (const check of msg.checks) {
        const key = getCheckStateKey(check);
        if (!key) continue;
        if (check.checked) {
          liveChecks.set(key, check);
        } else {
          liveChecks.delete(key);
        }
      }
      if (msg.refresh) {
        pushToTracker();
      }
      return;
    }

    liveChecks = new Map();
    for (const check of msg.checks) {
      const key = getCheckStateKey(check);
      if (!key || !check.checked) continue;
      liveChecks.set(key, check);
    }
    if (msg.refresh) {
      pushToTracker();
    }
  }

  function processRefresh() {
    if (isInFullSync && pendingFullState && pendingFullChecks) {
      // Full sync is complete — adopt the buffered state as live
      liveState = pendingFullState;
      liveChecks = pendingFullChecks;
      pendingFullState = null;
      pendingFullChecks = null;
      isInFullSync = false;
      pushToTracker();
    }
  }

  function getCollectedLocationIds(): string[] {
    const resolveCheckToLocationIds = options.resolveCheckToLocationIds;
    if (!resolveCheckToLocationIds) return [];

    const locationIds = new Set<string>();
    for (const check of liveChecks.values()) {
      let resolvedIds: string[] = [];
      try {
        resolvedIds = resolveCheckToLocationIds(check);
      } catch {
        resolvedIds = [];
      }
      for (const locationId of resolvedIds) {
        if (!locationId) continue;
        locationIds.add(locationId);
      }
    }
    return Array.from(locationIds);
  }

  function pushToTracker() {
    const record = buildTrackerInventoryRecord(
      liveState,
      options.availableItemIds.value,
    );
    options.onInventoryUpdate(record);
    options.onCollectedLocationsUpdate?.(getCollectedLocationIds());
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
    pendingFullChecks = null;
    isInFullSync = false;
  }

  function disconnect() {
    cleanup();
    liveState = new Map();
    liveChecks = new Map();
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
