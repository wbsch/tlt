import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAutotracker,
  type AutotrackerCheck,
  type AutotrackerProtocolMode,
  type AutotrackerSyncPhase,
} from '@/../packs/ootmm/src/autotracker/useAutotracker';
import { resolveAutotrackerCheckToLocationIds } from '@/../packs/ootmm/src/autotracker/checkMapping';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  sentMessages: string[] = [];
  url: string;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sentMessages.push(message);
  }

  close() {
    return undefined;
  }

  emitOpen() {
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      {
        data: JSON.stringify(payload),
      } as MessageEvent,
    );
  }

  emitError() {
    this.onerror?.call(this as unknown as WebSocket, new Event('error'));
  }
}

describe('useAutotracker checks', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies full-sync collected locations from check messages', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const collectedLocationUpdates: string[][] = [];
    const phases: AutotrackerSyncPhase[] = [];
    const availableItemIds = ref(new Set<string>(['OOT_BOW']));
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory, meta) => {
        inventoryUpdates.push(inventory);
        phases.push(meta.phase);
      },
      resolveCheckToLocationIds: (check: AutotrackerCheck) => {
        if (check.name === 'Market Pot House Adult Pot 3') {
          return ['OOT Market Pot House Adult Pot 3@0'];
        }
        if (check.name === 'Market Pot House Adult Pot 6') {
          return ['OOT Market Pot House Adult Pot 6@0'];
        }
        return [];
      },
      onCollectedLocationsUpdate: (locationIds) => {
        collectedLocationUpdates.push(locationIds);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    expect(JSON.parse(socket.sentMessages[0])).toEqual({
      type: 'handshake',
      features: ['items', 'checks'],
      flags: { protocol: 'legacy' },
    });

    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [{ id: 'OOT_BOW', qty: 1 }],
    });
    socket.emitMessage({
      type: 'check',
      diff: false,
      refresh: false,
      checks: [
        { name: 'Market Pot House Adult Pot 3', checked: true },
        { name: 'Market Pot House Adult Pot 6', checked: true },
      ],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });

    expect(inventoryUpdates).toEqual([{ OOT_BOW: 1 }]);
    expect(phases).toEqual(['initial']);
    expect(collectedLocationUpdates).toEqual([
      [
        'OOT Market Pot House Adult Pot 3@0',
        'OOT Market Pot House Adult Pot 6@0',
      ],
    ]);
  });

  it('tries game-prefixed fallbacks for unprefixed check names', () => {
    const resolved = resolveAutotrackerCheckToLocationIds(
      {
        name: 'Market Pot House Adult Pot 3',
      },
      (code) => {
        if (code === 'OOT Market Pot House Adult Pot 3') {
          return ['OOT Market Pot House Adult Pot 3@0'];
        }
        return [];
      },
    );

    expect(resolved).toEqual(['OOT Market Pot House Adult Pot 3@0']);
  });

  it('maps bottle slot autotracker items to bottle grid refs and empty bottle counts', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(
      new Set<string>([
        'OOT_BOTTLE_EMPTY',
        'MM_BOTTLE_EMPTY',
        'SHARED_BOTTLE_EMPTY',
      ]),
    );
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'OOT_BOTTLE_2', qty: 1 },
        { id: 'MM_BOTTLE_5', qty: 3 },
        { id: 'SHARED_BOTTLE_3', qty: 2 },
      ],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });

    expect(inventoryUpdates).toEqual([
      {
        OOT_BOTTLE_EMPTY: 2,
        MM_BOTTLE_EMPTY: 1,
        SHARED_BOTTLE_EMPTY: 1,
        '__grid_ref_state__:__grid_ref__:Bottle1:OOT_BOTTLE_EMPTY': 1,
        '__grid_ref_state__:__grid_ref__:Bottle2:OOT_BOTTLE_EMPTY': 1,
        '__grid_ref_state__:__grid_ref__:MM_Bottle5:MM_BOTTLE_EMPTY': 1,
        '__grid_ref_state__:__grid_ref__:Shared_Bottle3:SHARED_BOTTLE_EMPTY': 1,
      },
    ]);
  });

  it("does not count Ruto's Letter as an extra empty bottle slot", async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(
      new Set<string>(['OOT_BOTTLE_EMPTY', 'OOT_BOTTLE_RUTO_LETTER']),
    );
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'OOT_BOTTLE_2', qty: 1 },
        { id: 'OOT_BOTTLE_RUTO_LETTER', qty: 1 },
      ],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });

    expect(inventoryUpdates).toEqual([
      {
        OOT_BOTTLE_EMPTY: 1,
        OOT_BOTTLE_RUTO_LETTER: 1,
        '__grid_ref_state__:__grid_ref__:Bottle1:OOT_BOTTLE_EMPTY': 1,
      },
    ]);
  });

  it('maps OOT and MM bottle slot signals onto shared bottle refs when shared bottles are enabled', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(new Set<string>(['SHARED_BOTTLE_EMPTY']));
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'MM_BOTTLE_1', qty: 1 },
        { id: 'SHARED_BOTTLE_2', qty: 1 },
        { id: 'MM_BOTTLE_5', qty: 3 },
      ],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });

    expect(inventoryUpdates).toEqual([
      {
        SHARED_BOTTLE_EMPTY: 2,
        '__grid_ref_state__:__grid_ref__:Shared_Bottle1:SHARED_BOTTLE_EMPTY': 1,
        '__grid_ref_state__:__grid_ref__:Shared_Bottle2:SHARED_BOTTLE_EMPTY': 1,
      },
    ]);
  });

  it('marks diff refreshes as live updates after the initial full sync', async () => {
    const phases: AutotrackerSyncPhase[] = [];
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(new Set<string>(['OOT_BOW', 'OOT_BOMB_BAG']));
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory, meta) => {
        inventoryUpdates.push(inventory);
        phases.push(meta.phase);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [{ id: 'OOT_BOW', qty: 1 }],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: true,
      refresh: true,
      items: [{ id: 'OOT_BOMB_BAG', qty: 1 }],
    });

    expect(phases).toEqual(['initial', 'live']);
    expect(inventoryUpdates).toEqual([
      { OOT_BOW: 1 },
      { OOT_BOMB_BAG: 1, OOT_BOW: 1 },
    ]);
  });

  it('rebuilds shared hookshot state for MM-only deltas in shared mode', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(new Set<string>(['SHARED_HOOKSHOT']));
    const itemMaxCounts = ref(
      new Map<string, number>([['SHARED_HOOKSHOT', 2]]),
    );

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [{ id: 'OOT_HOOKSHOT', qty: 1 }],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: true,
      refresh: true,
      items: [{ id: 'MM_HOOKSHOT', qty: 1 }],
    });

    expect(inventoryUpdates).toEqual([
      { SHARED_HOOKSHOT: 1 },
      { SHARED_HOOKSHOT: 1 },
    ]);
  });

  it('rebuilds bottomless wallet deltas to the tracker max stage', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(new Set<string>(['SHARED_WALLET']));
    const itemMaxCounts = ref(new Map<string, number>([['SHARED_WALLET', 4]]));

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [{ id: 'OOT_WALLET', qty: 2 }],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: true,
      refresh: true,
      items: [{ id: 'OOT_WALLET5', qty: 1 }],
    });

    expect(inventoryUpdates).toEqual([
      { SHARED_WALLET: 1 },
      { SHARED_WALLET: 4 },
    ]);
  });

  it('rebuilds adult trade bitmasks from raw deltas before translating', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(
      new Set<string>(['OOT_POCKET_EGG', 'OOT_ODD_POTION']),
    );
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
      },
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: false,
      refresh: false,
      items: [{ id: 'OOT_ADULT_TRADE', qty: 17 }],
    });
    socket.emitMessage({
      type: 'refresh',
      refresh: true,
    });
    socket.emitMessage({
      type: 'item',
      diff: true,
      refresh: true,
      items: [{ id: 'OOT_ADULT_TRADE', qty: -1 }],
    });

    expect(inventoryUpdates).toEqual([
      { OOT_ODD_POTION: 1, OOT_POCKET_EGG: 1 },
      { OOT_ODD_POTION: 1 },
    ]);
  });

  it('requests only active-game raw memory areas in raw mode', async () => {
    const autotracker = useAutotracker({
      availableItemIds: ref(new Set<string>()),
      itemMaxCounts: ref(new Map<string, number>()),
      protocolMode: ref<AutotrackerProtocolMode>('raw'),
      onInventoryUpdate: () => {},
    });

    autotracker.enabled.value = true;
    await nextTick();

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();

    const handshake = JSON.parse(socket.sentMessages[0]);
    expect(handshake).toMatchObject({
      type: 'handshake',
      features: ['raw'],
      flags: { protocol: 'raw' },
      memoryAreas: {
        oot: expect.arrayContaining([
          'oot_save_ctx',
          'oot_foreign_mm_save',
          'oot_shared_custom_save',
          'oot_runtime_combo_config',
          'oot_runtime_silver_rupee_data',
          'oot_runtime_max_keys',
          'oot_playstate_core',
          'oot_playstate_tail',
        ]),
        mm: expect.arrayContaining([
          'mm_save_ctx',
          'mm_foreign_oot_save',
          'mm_shared_custom_save',
          'mm_runtime_combo_config',
          'mm_playstate_core',
          'mm_playstate_tail',
        ]),
      },
    });
    expect(handshake.memoryAreas.oot).not.toContain('mm_save_ctx');
    expect(handshake.memoryAreas.mm).not.toContain('oot_save_ctx');
    expect(handshake.memoryAreas.oot).not.toContain('combo_ctx_oot');
    expect(handshake.memoryAreas.mm).not.toContain('combo_ctx_mm');
    expect(handshake.memoryAreas.oot).not.toContain('oot_payload');
    expect(handshake.memoryAreas.mm).not.toContain('mm_payload');
  });

  it('probes autotracker availability via handshake acknowledgement', async () => {
    const autotracker = useAutotracker({
      availableItemIds: ref(new Set<string>()),
      itemMaxCounts: ref(new Map<string, number>()),
      onInventoryUpdate: () => {},
    });

    const availabilityPromise = autotracker.probeAvailability(50);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitOpen();
    expect(JSON.parse(socket.sentMessages[0])).toEqual({
      type: 'handshake',
      features: ['items', 'checks'],
      flags: { protocol: 'legacy' },
    });

    socket.emitMessage({
      type: 'handshAck',
      version: '0.1.0',
      name: 'ootmm-autotracker',
      refresh: true,
    });

    await expect(availabilityPromise).resolves.toBe(true);
    expect(autotracker.enabled.value).toBe(false);
  });

  it('reports unavailable when the autotracker probe errors', async () => {
    const autotracker = useAutotracker({
      availableItemIds: ref(new Set<string>()),
      itemMaxCounts: ref(new Map<string, number>()),
      onInventoryUpdate: () => {},
    });

    const availabilityPromise = autotracker.probeAvailability(50);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emitError();

    await expect(availabilityPromise).resolves.toBe(false);
    expect(autotracker.enabled.value).toBe(false);
  });
});
