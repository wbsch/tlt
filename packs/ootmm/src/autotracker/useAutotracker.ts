import { ref, watch, type Ref } from 'vue';
import {
  applyDelta,
  canApplyAutotrackerDeltaItemsDirectly,
  translateAutotrackerItems,
  type AutotrackerItem,
} from './autotrackerMapping';
import {
  createRawAutotrackerParser,
  RAW_MEMORY_AREAS_BY_GAME,
  type RawAutotrackerMessage,
} from './rawFrameParser';

export type AutotrackerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type AutotrackerProtocolMode = 'legacy' | 'raw';

export type AutotrackerSyncPhase = 'initial' | 'live';

interface AutotrackerUpdateMeta {
  phase: AutotrackerSyncPhase;
}

interface AutotrackerOptions {
  /** Available item IDs from the tracker (setting-dependent). */
  availableItemIds: Ref<Set<string>>;
  /** Effective item max counts from the tracker (setting-dependent). */
  itemMaxCounts: Ref<Map<string, number>>;
  /** WebSocket protocol mode to request from the autotracker server. */
  protocolMode?: Ref<AutotrackerProtocolMode>;
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
  mode?: string;
  features?: string[];
}

type ServerMessage =
  | ItemMessage
  | CheckMessage
  | LocationMessage
  | RefreshMessage
  | HandshakeAckMessage
  | RawAutotrackerMessage;

const DEFAULT_URL = 'ws://localhost:17026/';
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';
const LEGACY_HANDSHAKE_FEATURES = ['items', 'checks'];
const RAW_HANDSHAKE_FEATURES = ['raw'];

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

function normalizeProtocolMode(
  value: string | null | undefined,
): AutotrackerProtocolMode | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'legacy' || normalized === 'raw') {
    return normalized;
  }
  return null;
}

function buildHandshakeMessage(protocolMode: AutotrackerProtocolMode): string {
  return JSON.stringify({
    type: 'handshake',
    features:
      protocolMode === 'raw'
        ? RAW_HANDSHAKE_FEATURES
        : LEGACY_HANDSHAKE_FEATURES,
    flags: {
      protocol: protocolMode,
    },
    ...(protocolMode === 'raw'
      ? {
          memoryAreas: {
            oot: RAW_MEMORY_AREAS_BY_GAME.oot,
            mm: RAW_MEMORY_AREAS_BY_GAME.mm,
          },
        }
      : {}),
  });
}

function sendHandshake(
  socket: WebSocket,
  protocolMode: AutotrackerProtocolMode,
) {
  socket.send(buildHandshakeMessage(protocolMode));
}

export function useAutotracker(options: AutotrackerOptions) {
  const status = ref<AutotrackerStatus>('disconnected');
  const enabled = ref(false);
  const url = ref(DEFAULT_URL);
  const lastError = ref<string | null>(null);
  const rawParser = createRawAutotrackerParser();

  function childWalletsEnabled(): boolean {
    return options.childWalletsEnabled?.value ?? false;
  }

  function requestedProtocolMode(): AutotrackerProtocolMode {
    return options.protocolMode?.value ?? 'legacy';
  }

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let negotiatedProtocolMode: AutotrackerProtocolMode = requestedProtocolMode();
  let hasReceivedRawSnapshot = false;

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
    negotiatedProtocolMode = requestedProtocolMode();
    hasReceivedRawSnapshot = false;

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
      sendHandshake(ws!, requestedProtocolMode());
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
        negotiatedProtocolMode =
          normalizeProtocolMode(msg.mode) ?? requestedProtocolMode();
        if (negotiatedProtocolMode === 'legacy') {
          // Server will send a full sync automatically after handshake.
          pendingFullRawState = new Map();
          pendingFullChecks = new Map();
          isInFullSync = true;
        } else {
          pendingFullRawState = null;
          pendingFullChecks = null;
          isInFullSync = false;
        }
        break;

      case 'item':
        processItemMessage(msg as ItemMessage);
        break;

      case 'check':
        processCheckMessage(msg as CheckMessage);
        break;

      case 'raw':
        processRawMessage(msg as RawAutotrackerMessage);
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

  function replaceLiveChecks(checks: AutotrackerCheck[]) {
    liveChecks = new Map();
    for (const check of checks) {
      const key = getCheckStateKey(check);
      if (!key || !check.checked) continue;
      liveChecks.set(key, check);
    }
  }

  function processItemMessage(msg: ItemMessage) {
    if (isInFullSync && !msg.diff) {
      pendingFullRawState = applyRawAutotrackerItems(
        pendingFullRawState ?? new Map<string, number>(),
        msg.items,
        false,
      );
    } else if (msg.diff) {
      liveRawState = applyRawAutotrackerItems(liveRawState, msg.items, true);
      if (
        canApplyAutotrackerDeltaItemsDirectly(
          msg.items,
          options.availableItemIds.value,
        )
      ) {
        liveState = applyDelta(
          liveState,
          msg.items,
          options.availableItemIds.value,
          options.itemMaxCounts.value,
          { childWalletsEnabled: childWalletsEnabled() },
        );
      } else {
        // Rebuild translated state from raw values when a raw delta affects
        // non-linear tracker state, such as bitmasks or shared-stage remaps.
        liveState = buildTranslatedAutotrackerState(
          liveRawState,
          options.availableItemIds.value,
          options.itemMaxCounts.value,
          childWalletsEnabled(),
        );
      }
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

  function processRawMessage(msg: RawAutotrackerMessage) {
    const parsed = rawParser.parse(msg);
    if (!parsed) {
      return;
    }

    liveRawState = applyRawAutotrackerItems(new Map(), parsed.items, false);
    liveState = buildTranslatedAutotrackerState(
      liveRawState,
      options.availableItemIds.value,
      options.itemMaxCounts.value,
      childWalletsEnabled(),
    );
    replaceLiveChecks(parsed.checks);

    const phase: AutotrackerSyncPhase = hasReceivedRawSnapshot
      ? 'live'
      : 'initial';
    hasReceivedRawSnapshot = true;
    if (msg.refresh) {
      pushToTracker(phase);
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

    replaceLiveChecks(msg.checks);
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
    hasReceivedRawSnapshot = false;
    negotiatedProtocolMode = requestedProtocolMode();
    rawParser.reset();
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

  function probeAvailability(timeoutMs = 1000): Promise<boolean> {
    if (enabled.value && status.value === 'connected') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let probeSocket: WebSocket | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (available: boolean) => {
        if (settled) return;
        settled = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (probeSocket) {
          probeSocket.onopen = null;
          probeSocket.onmessage = null;
          probeSocket.onerror = null;
          probeSocket.onclose = null;
          probeSocket.close();
          probeSocket = null;
        }

        resolve(available);
      };

      try {
        probeSocket = new WebSocket(url.value);
      } catch {
        finish(false);
        return;
      }

      timeoutId = setTimeout(() => {
        finish(false);
      }, timeoutMs);

      probeSocket.onopen = () => {
        try {
          sendHandshake(probeSocket!, requestedProtocolMode());
        } catch {
          finish(false);
        }
      };

      probeSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          if (msg.type === 'handshAck') {
            finish(true);
          }
        } catch {
          // Ignore malformed messages while probing.
        }
      };

      probeSocket.onerror = () => {
        finish(false);
      };

      probeSocket.onclose = () => {
        finish(false);
      };
    });
  }

  // Watch enable/disable toggle
  watch(enabled, (isEnabled) => {
    if (isEnabled) {
      connect();
    } else {
      disconnect();
    }
  });

  if (options.protocolMode) {
    watch(options.protocolMode, (mode, previousMode) => {
      if (mode === previousMode) {
        return;
      }
      if (enabled.value) {
        connect();
      }
    });
  }

  function destroy() {
    enabled.value = false;
    disconnect();
  }

  return {
    status,
    enabled,
    url,
    lastError,
    probeAvailability,
    destroy,
  };
}
