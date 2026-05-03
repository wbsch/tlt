import { ref, watch, type Ref } from 'vue';
import {
  translateAutotrackerItems,
  type AutotrackerItem,
} from './autotrackerMapping';

export type AutotrackerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type AutotrackerSyncPhase = 'initial' | 'live';

interface AutotrackerUpdateMeta {
  phase: AutotrackerSyncPhase;
}

interface AutotrackerOptions {
  /** Available item IDs from the tracker (setting-dependent). */
  availableItemIds: Ref<Set<string>>;
  /** Effective item max counts from the tracker (setting-dependent). */
  itemMaxCounts: Ref<Map<string, number>>;
  /** Whether child wallets are enabled in the current tracker settings. */
  childWalletsEnabled?: Ref<boolean>;
  /** Called when the autotracker has new inventory to apply. */
  onInventoryUpdate: (
    inventory: Record<string, number>,
    meta: AutotrackerUpdateMeta,
  ) => void;
  /** Resolve a websocket check entry to one or more tracker location IDs. */
  resolveCheckToLocationIds?: (check: AutotrackerCheck) => string[];
  /** Called when the autotracker has a new collected-location state. */
  onCollectedLocationsUpdate?: (
    locationIds: string[],
    meta: AutotrackerUpdateMeta,
  ) => void;
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

type ServerMessage =
  | ItemMessage
  | CheckMessage
  | LocationMessage
  | RefreshMessage
  | HandshakeAckMessage;

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

const SEPARATELY_TRACKED_BOTTLE_CONTENT_BASE_IDS: Record<string, string> = {
  OOT_BOTTLE_RUTO_LETTER: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLE_RUTO_LETTER: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLE_RUTO_LETTER: 'SHARED_BOTTLE_EMPTY',
};

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
  const separatelyTrackedBottleContentCounts = new Map<string, number>();

  for (const [id, qty] of liveState) {
    if (qty <= 0) {
      continue;
    }

    const separateBottleContentBaseItemId =
      SEPARATELY_TRACKED_BOTTLE_CONTENT_BASE_IDS[id];
    if (separateBottleContentBaseItemId) {
      separatelyTrackedBottleContentCounts.set(
        separateBottleContentBaseItemId,
        (separatelyTrackedBottleContentCounts.get(
          separateBottleContentBaseItemId,
        ) ?? 0) + qty,
      );
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

  for (const [baseItemId, count] of separatelyTrackedBottleContentCounts) {
    if (count <= 0) {
      continue;
    }

    const currentBottleCount = record[baseItemId] ?? 0;
    const suppressedCount = Math.min(currentBottleCount, count);
    if (suppressedCount <= 0) {
      continue;
    }

    if (currentBottleCount === suppressedCount) {
      delete record[baseItemId];
    } else {
      record[baseItemId] = currentBottleCount - suppressedCount;
    }

    const matchingGridRefStateKeys = Object.keys(record).filter(
      (key) =>
        key.startsWith(GRID_REF_STATE_PREFIX) && key.endsWith(`:${baseItemId}`),
    );

    for (const key of matchingGridRefStateKeys.slice(-suppressedCount)) {
      delete record[key];
    }
  }

  return record;
}

function applyRawAutotrackerItems(
  currentState: Map<string, number>,
  items: AutotrackerItem[],
  diff: boolean,
): Map<string, number> {
  const next = new Map(currentState);

  for (const { id, qty } of items) {
    const nextQty = diff ? (next.get(id) ?? 0) + qty : qty;
    if (nextQty > 0) {
      next.set(id, nextQty);
    } else {
      next.delete(id);
    }
  }

  return next;
}

function buildTranslatedAutotrackerState(
  rawState: Map<string, number>,
  availableItemIds: Set<string>,
  itemMaxCounts: Map<string, number>,
  childWalletsEnabled: boolean,
): Map<string, number> {
  const translated = translateAutotrackerItems(
    Array.from(rawState, ([id, qty]) => ({ id, qty })),
    availableItemIds,
    itemMaxCounts,
    { childWalletsEnabled },
  );

  return new Map(Object.entries(translated).filter(([, qty]) => qty > 0));
}

export function useAutotracker(options: AutotrackerOptions) {
  const status = ref<AutotrackerStatus>('disconnected');
  const enabled = ref(false);
  const url = ref(DEFAULT_URL);
  const lastError = ref<string | null>(null);

  function childWalletsEnabled(): boolean {
    return options.childWalletsEnabled?.value ?? false;
  }

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;

  // Canonical autotracker state (translated to tracker IDs)
  let liveRawState = new Map<string, number>();
  let liveState = new Map<string, number>();
  let liveChecks = new Map<string, AutotrackerCheck>();
  // Buffer used during full-sync
  let pendingFullRawState: Map<string, number> | null = null;
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
        pendingFullRawState = new Map();
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
    if (isInFullSync && !msg.diff) {
      pendingFullRawState = applyRawAutotrackerItems(
        pendingFullRawState ?? new Map<string, number>(),
        msg.items,
        false,
      );
    } else if (msg.diff) {
      // Rebuild translated state from raw values so non-linear mappings
      // (bitmasks, progressive decompositions) resolve deltas correctly.
      liveRawState = applyRawAutotrackerItems(liveRawState, msg.items, true);
      liveState = buildTranslatedAutotrackerState(
        liveRawState,
        options.availableItemIds.value,
        options.itemMaxCounts.value,
        childWalletsEnabled(),
      );
      if (msg.refresh) {
        pushToTracker('live');
      }
    } else {
      // Non-diff, non-fullsync (shouldn't happen normally, but handle it)
      liveRawState = applyRawAutotrackerItems(liveRawState, msg.items, false);
      liveState = buildTranslatedAutotrackerState(
        liveRawState,
        options.availableItemIds.value,
        options.itemMaxCounts.value,
        childWalletsEnabled(),
      );
      if (msg.refresh) {
        pushToTracker('live');
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
        pushToTracker('live');
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
      pushToTracker('live');
    }
  }

  function processRefresh() {
    if (isInFullSync && pendingFullRawState && pendingFullChecks) {
      // Full sync is complete — adopt the buffered state as live
      liveRawState = pendingFullRawState;
      liveState = buildTranslatedAutotrackerState(
        liveRawState,
        options.availableItemIds.value,
        options.itemMaxCounts.value,
        childWalletsEnabled(),
      );
      liveChecks = pendingFullChecks;
      pendingFullRawState = null;
      pendingFullChecks = null;
      isInFullSync = false;
      pushToTracker('initial');
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

  function pushToTracker(phase: AutotrackerSyncPhase) {
    const record = buildTrackerInventoryRecord(
      liveState,
      options.availableItemIds.value,
    );
    options.onInventoryUpdate(record, { phase });
    options.onCollectedLocationsUpdate?.(getCollectedLocationIds(), { phase });
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
    pendingFullRawState = null;
    pendingFullChecks = null;
    isInFullSync = false;
  }

  function disconnect() {
    cleanup();
    liveRawState = new Map();
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
