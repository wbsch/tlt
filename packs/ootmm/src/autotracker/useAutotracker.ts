import { ref, watch, type Ref } from 'vue';
import {
  translateAutotrackerItems,
  type AutotrackerItem,
} from './autotrackerMapping';
import {
  createRawAutotrackerParser,
  RAW_CHUNK_SPECS_BY_GAME,
  type ParsedRawAutotrackerSnapshot,
  type RawAutotrackerGame,
  type RawAutotrackerMessage,
} from './rawFrameParser';

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
  /**
   * Called when the autotracker detects a scene or game change.
   * Fires synchronously in processRawMessage/tryIdleAccept, not via a Vue
   * watcher, so it is guaranteed to run as soon as a new scene is accepted.
   */
  onSceneChange?: (activeGame: RawAutotrackerGame, sceneId: number) => void;
}

export interface AutotrackerCheck {
  id?: string;
  name?: string;
  checked: boolean;
}

interface HandshakeAckMessage {
  type: 'handshAck';
  version: string;
  name: string;
  refresh: boolean;
  mode?: string;
  features?: string[];
}

type ServerMessage = HandshakeAckMessage | RawAutotrackerMessage;

const DEFAULT_URL = 'ws://localhost:17026/';
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const GRID_REF_ALIAS_PREFIX = '__grid_ref__:';
const GRID_REF_STATE_PREFIX = '__grid_ref_state__:';
const RAW_HANDSHAKE_FEATURES = ['raw'];
const MIN_SUPPORTED_AUTOTRACKER_VERSION = '0.1.2';

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
  OOT_BOTTLED_GOLD_DUST: 'OOT_BOTTLE_EMPTY',
  MM_BOTTLED_GOLD_DUST: 'MM_BOTTLE_EMPTY',
  SHARED_BOTTLED_GOLD_DUST: 'SHARED_BOTTLE_EMPTY',
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

function buildHandshakeMessage(): string {
  return JSON.stringify({
    type: 'handshake',
    features: RAW_HANDSHAKE_FEATURES,
    flags: {
      protocol: 'raw',
    },
    memoryAreas: {
      oot: RAW_CHUNK_SPECS_BY_GAME.oot,
      mm: RAW_CHUNK_SPECS_BY_GAME.mm,
    },
  });
}

function sendHandshake(socket: WebSocket) {
  socket.send(buildHandshakeMessage());
}

function parseAutotrackerVersionParts(
  version: string | null | undefined,
): [number, number, number] | null {
  if (typeof version !== 'string') {
    return null;
  }

  const normalizedVersion = version.trim();
  if (!normalizedVersion) {
    return null;
  }

  const match = normalizedVersion.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ];
}

function compareAutotrackerVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const leftParts = parseAutotrackerVersionParts(left);
  const rightParts = parseAutotrackerVersionParts(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] === rightParts[index]) {
      continue;
    }

    return leftParts[index] < rightParts[index] ? -1 : 1;
  }

  return 0;
}

function buildAutotrackerVersionWarning(
  version: string | null | undefined,
): string | null {
  const normalizedVersion = version?.trim() ?? '';
  const comparison = compareAutotrackerVersions(
    normalizedVersion,
    MIN_SUPPORTED_AUTOTRACKER_VERSION,
  );

  if (comparison !== null && comparison >= 0) {
    return null;
  }

  const updateMessage = `Please update to version ${MIN_SUPPORTED_AUTOTRACKER_VERSION} or newer.`;

  if (!normalizedVersion) {
    return `You are using an outdated autotracker version that does not report its version. ${updateMessage}`;
  }

  return `You are using an outdated autotracker version (${normalizedVersion}). ${updateMessage}`;
}

export function useAutotracker(options: AutotrackerOptions) {
  const status = ref<AutotrackerStatus>('disconnected');
  const enabled = ref(false);
  const url = ref(DEFAULT_URL);
  const lastError = ref<string | null>(null);
  const versionWarning = ref<string | null>(null);

  /** Current active game detected by the autotracker. */
  const activeGame = ref<RawAutotrackerGame | null>(null);
  /** Current OoT scene ID (from save context). */
  const ootSceneId = ref(0);
  /** Current MM scene ID (from live play state). */
  const mmSceneId = ref(0);

  /** Tracked scene key for the onSceneChange callback. */
  let lastTrackedSceneKey = '';

  /**
   * Called from processRawMessage and tryIdleAccept to fire the
   * onSceneChange callback synchronously when the active game or scene
   * ID changes.
   */
  function notifySceneChange(parsed: ParsedRawAutotrackerSnapshot): void {
    const sceneKey =
      parsed.activeGame === 'OoT'
        ? `OoT:${parsed.ootSceneId}`
        : `MM:${parsed.mmSceneId}`;
    if (sceneKey !== lastTrackedSceneKey && options.onSceneChange) {
      lastTrackedSceneKey = sceneKey;
      const sceneId =
        parsed.activeGame === 'OoT' ? parsed.ootSceneId : parsed.mmSceneId;
      options.onSceneChange(parsed.activeGame, sceneId);
    }
  }

  const rawParser = createRawAutotrackerParser();

  function childWalletsEnabled(): boolean {
    return options.childWalletsEnabled?.value ?? false;
  }

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let hasReceivedRawSnapshot = false;
  let preserveVersionWarningOnDisable = false;
  let lastRawMessage: RawAutotrackerMessage | null = null;
  let idleAcceptTimer: ReturnType<typeof setTimeout> | null = null;
  let wasEverOpened = false;

  // Canonical autotracker state (translated to tracker IDs)
  let liveRawState = new Map<string, number>();
  let liveState = new Map<string, number>();
  let liveChecks = new Map<string, AutotrackerCheck>();

  function connect() {
    cleanup();
    status.value = 'connecting';
    lastError.value = null;
    versionWarning.value = null;
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
      wasEverOpened = true;
      sendHandshake(ws!);
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
      const hadBeenOpened = wasEverOpened;
      ws = null;
      if (enabled.value) {
        status.value = 'disconnected';
        scheduleReconnect(hadBeenOpened);
      } else {
        status.value = 'disconnected';
      }
    };
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'handshAck':
        {
          const warning = buildAutotrackerVersionWarning(msg.version);
          if (warning) {
            versionWarning.value = warning;
            preserveVersionWarningOnDisable = true;
            disconnect(true);
            enabled.value = false;
            break;
          }

          status.value = 'connected';
        }
        break;

      case 'raw':
        processRawMessage(msg as RawAutotrackerMessage);
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

  function processRawMessage(msg: RawAutotrackerMessage) {
    if (!enabled.value) {
      return;
    }

    lastRawMessage = msg;

    const parsed = rawParser.parse(msg);
    if (!parsed) {
      // Frame was deferred (scene transition in progress). Start a timer so
      // that after 1 s of silence the pending transition is accepted.
      if (!idleAcceptTimer) {
        idleAcceptTimer = setTimeout(() => {
          idleAcceptTimer = null;
          tryIdleAccept();
        }, 1000);
      }
      return;
    }

    // Frame was accepted – cancel any pending idle-accept timer.
    if (idleAcceptTimer) {
      clearTimeout(idleAcceptTimer);
      idleAcceptTimer = null;
    }

    activeGame.value = parsed.activeGame;
    ootSceneId.value = parsed.ootSceneId;
    mmSceneId.value = parsed.mmSceneId;

    // Synchronous scene-change notification (not reliant on Vue watchers).
    // Only fires when the game or scene ID actually changes.
    notifySceneChange(parsed);

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

  /**
   * After 1 s of silence from the autotracker, re-parse the last message.
   * The parser's timeout-based acceptance will then accept any pending
   * transition that has been stable for ≥ 1 s.
   */
  function tryIdleAccept() {
    if (!lastRawMessage) {
      return;
    }
    const parsed = rawParser.parse(lastRawMessage);
    if (!parsed) {
      return;
    }

    activeGame.value = parsed.activeGame;
    ootSceneId.value = parsed.ootSceneId;
    mmSceneId.value = parsed.mmSceneId;

    // Synchronous scene-change notification (not reliant on Vue watchers).
    notifySceneChange(parsed);

    liveRawState = applyRawAutotrackerItems(new Map(), parsed.items, false);
    liveState = buildTranslatedAutotrackerState(
      liveRawState,
      options.availableItemIds.value,
      options.itemMaxCounts.value,
      childWalletsEnabled(),
    );
    replaceLiveChecks(parsed.checks);

    pushToTracker('live');
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
    if (idleAcceptTimer) {
      clearTimeout(idleAcceptTimer);
      idleAcceptTimer = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    hasReceivedRawSnapshot = false;
    wasEverOpened = false;
    rawParser.reset();
    lastRawMessage = null;
    lastTrackedSceneKey = '';
  }

  function disconnect(preserveVersionWarning = false) {
    cleanup();
    liveRawState = new Map();
    liveState = new Map();
    liveChecks = new Map();
    activeGame.value = null;
    ootSceneId.value = 0;
    mmSceneId.value = 0;
    lastTrackedSceneKey = '';
    status.value = 'disconnected';
    lastError.value = null;
    if (!preserveVersionWarning) {
      versionWarning.value = null;
    }
    reconnectAttempts = 0;
  }

  /**
   * Schedule a reconnect attempt.  When the WebSocket was never successfully
   * opened (e.g. because the user hasn't accepted Chrome's localhost permission
   * dialog yet), use a much longer base delay so the dialog doesn't flicker
   * or close before the user can interact with it.
   */
  function scheduleReconnect(hadBeenOpened = true) {
    if (!enabled.value) return;
    const baseDelay = hadBeenOpened
      ? RECONNECT_BASE_DELAY
      : RECONNECT_BASE_DELAY * 5;
    const delay = Math.min(
      baseDelay * 2 ** reconnectAttempts,
      RECONNECT_MAX_DELAY,
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      if (enabled.value) connect();
    }, delay);
  }

  /**
   * Check whether the autotracker is reachable.
   *
   * If the main connection is already established we return true immediately.
   * If it's currently connecting we wait for that attempt to settle instead of
   * opening a *second* WebSocket to the same URL – duplicate connections can
   * confuse Chrome's localhost-permission dialog and make it close before the
   * user can interact with it.
   */
  function probeAvailability(timeoutMs = 1000): Promise<boolean> {
    if (enabled.value && status.value === 'connected') {
      return Promise.resolve(true);
    }

    // If the main connection is still in flight, wait for it to settle
    // rather than opening a duplicate WebSocket.
    if (enabled.value && status.value === 'connecting') {
      return new Promise((resolve) => {
        const stopWatch = watch(status, (newStatus) => {
          if (newStatus === 'connected') {
            stopWatch();
            resolve(true);
          } else if (newStatus === 'disconnected' || newStatus === 'error') {
            stopWatch();
            resolve(false);
          }
        });
      });
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
          sendHandshake(probeSocket!);
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
      disconnect(preserveVersionWarningOnDisable);
      preserveVersionWarningOnDisable = false;
    }
  });

  function destroy() {
    enabled.value = false;
    disconnect();
  }

  function resetSceneTracking(): void {
    lastTrackedSceneKey = '';
  }

  return {
    status,
    enabled,
    url,
    lastError,
    versionWarning,
    activeGame,
    ootSceneId,
    mmSceneId,
    probeAvailability,
    destroy,
    resetSceneTracking,
  };
}
