import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAutotracker,
  type AutotrackerCheck,
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
      flags: {},
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
});
