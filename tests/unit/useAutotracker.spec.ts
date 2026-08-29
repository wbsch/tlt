import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  parseRawMessageMock,
  resetRawParserMock,
  createRawAutotrackerParserMock,
} = vi.hoisted(() => ({
  parseRawMessageMock: vi.fn(),
  resetRawParserMock: vi.fn(),
  createRawAutotrackerParserMock: vi.fn(),
}));

vi.mock('@/../packs/ootmm/src/autotracker/rawFrameParser', () => ({
  RAW_CHUNK_SPECS_BY_GAME: {
    oot: [
      { name: 'oot_save_state', address: 0x8011a5d4, length: 3888 },
      { name: 'oot_foreign_mm_save', address: 0x80443970, length: 15520 },
      { name: 'oot_shared_custom_save', address: 0x80443100, length: 2118 },
      { name: 'oot_runtime_combo_config', address: 0x804416c8, length: 732 },
      {
        name: 'oot_runtime_silver_rupee_data',
        address: 0x8042ec10,
        length: 72,
      },
      { name: 'oot_runtime_max_keys', address: 0x80441c78, length: 21 },
      { name: 'oot_playstate_scene', address: 0x801c8544, length: 2 },
      { name: 'oot_playstate_room', address: 0x801da15c, length: 1 },
      { name: 'oot_playstate_link_age', address: 0x801da288, length: 1 },
      { name: 'oot_playstate_flags', address: 0x801ca1d8, length: 20 },
    ],
    mm: [
      { name: 'mm_save_state', address: 0x801ef6b0, length: 3868 },
      { name: 'mm_cycle_flags', address: 0x801f35d8, length: 2400 },
      { name: 'mm_foreign_oot_save', address: 0x807729f0, length: 4948 },
      { name: 'mm_shared_custom_save', address: 0x80772180, length: 2118 },
      { name: 'mm_runtime_combo_config', address: 0x80770b18, length: 732 },
      { name: 'mm_playstate_scene', address: 0x803e6bc4, length: 2 },
      { name: 'mm_playstate_room', address: 0x803ff200, length: 1 },
      { name: 'mm_playstate_flags', address: 0x803e8978, length: 32 },
    ],
  },
  createRawAutotrackerParser: (options: unknown) => {
    createRawAutotrackerParserMock(options);
    return Promise.resolve({
      parse: parseRawMessageMock,
      reset: resetRawParserMock,
    });
  },
}));

import {
  useAutotracker,
  type AutotrackerCheck,
  type AutotrackerSyncPhase,
} from '@/../packs/ootmm/src/autotracker/useAutotracker';
import { resolveAutotrackerCheckToLocationIds } from '@/../packs/ootmm/src/autotracker/checkMapping';

const CURRENT_AUTOTRACKER_VERSION = '0.2.2';

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
    parseRawMessageMock.mockReset();
    resetRawParserMock.mockReset();
    createRawAutotrackerParserMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies collected locations from the initial raw snapshot', async () => {
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
      features: ['raw'],
      flags: { protocol: 'raw' },
      memoryAreas: {
        oot: [
          { name: 'oot_save_state', address: 0x8011a5d4, length: 3888 },
          { name: 'oot_foreign_mm_save', address: 0x80443970, length: 15520 },
          { name: 'oot_shared_custom_save', address: 0x80443100, length: 2118 },
          {
            name: 'oot_runtime_combo_config',
            address: 0x804416c8,
            length: 732,
          },
          {
            name: 'oot_runtime_silver_rupee_data',
            address: 0x8042ec10,
            length: 72,
          },
          { name: 'oot_runtime_max_keys', address: 0x80441c78, length: 21 },
          { name: 'oot_playstate_scene', address: 0x801c8544, length: 2 },
          { name: 'oot_playstate_room', address: 0x801da15c, length: 1 },
          { name: 'oot_playstate_link_age', address: 0x801da288, length: 1 },
          { name: 'oot_playstate_flags', address: 0x801ca1d8, length: 20 },
        ],
        mm: [
          { name: 'mm_save_state', address: 0x801ef6b0, length: 3868 },
          { name: 'mm_cycle_flags', address: 0x801f35d8, length: 2400 },
          { name: 'mm_foreign_oot_save', address: 0x807729f0, length: 4948 },
          { name: 'mm_shared_custom_save', address: 0x80772180, length: 2118 },
          {
            name: 'mm_runtime_combo_config',
            address: 0x80770b18,
            length: 732,
          },
          { name: 'mm_playstate_scene', address: 0x803e6bc4, length: 2 },
          { name: 'mm_playstate_room', address: 0x803ff200, length: 1 },
          { name: 'mm_playstate_flags', address: 0x803e8978, length: 32 },
        ],
      },
    });

    parseRawMessageMock.mockReturnValueOnce({
      items: [{ id: 'OOT_BOW', qty: 1 }],
      checks: [
        { name: 'Market Pot House Adult Pot 3', checked: true },
        { name: 'Market Pot House Adult Pot 6', checked: true },
      ],
    });

    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
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

    parseRawMessageMock.mockReturnValueOnce({
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'OOT_BOTTLE_2', qty: 1 },
        { id: 'MM_BOTTLE_5', qty: 3 },
        { id: 'SHARED_BOTTLE_3', qty: 2 },
      ],
      checks: [],
    });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
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

    parseRawMessageMock.mockReturnValueOnce({
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'OOT_BOTTLE_2', qty: 1 },
        { id: 'OOT_BOTTLE_RUTO_LETTER', qty: 1 },
      ],
      checks: [],
    });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });

    expect(inventoryUpdates).toEqual([
      {
        OOT_BOTTLE_EMPTY: 1,
        OOT_BOTTLE_RUTO_LETTER: 1,
        '__grid_ref_state__:__grid_ref__:Bottle1:OOT_BOTTLE_EMPTY': 1,
      },
    ]);
  });

  it('does not count Gold Dust as an extra empty bottle slot', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const availableItemIds = ref(
      new Set<string>(['MM_BOTTLE_EMPTY', 'MM_BOTTLED_GOLD_DUST']),
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

    parseRawMessageMock.mockReturnValueOnce({
      items: [
        { id: 'MM_BOTTLE_1', qty: 7 },
        { id: 'MM_BOTTLE_2', qty: 1 },
        { id: 'MM_BOTTLED_GOLD_DUST', qty: 1 },
      ],
      checks: [],
    });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'Mm',
      saveIndex: 0,
      chunks: [],
    });

    expect(inventoryUpdates).toEqual([
      {
        MM_BOTTLE_EMPTY: 1,
        MM_BOTTLED_GOLD_DUST: 1,
        '__grid_ref_state__:__grid_ref__:MM_Bottle1:MM_BOTTLE_EMPTY': 1,
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

    parseRawMessageMock.mockReturnValueOnce({
      items: [
        { id: 'OOT_BOTTLE_1', qty: 7 },
        { id: 'MM_BOTTLE_1', qty: 1 },
        { id: 'SHARED_BOTTLE_2', qty: 1 },
        { id: 'MM_BOTTLE_5', qty: 3 },
      ],
      checks: [],
    });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });

    expect(inventoryUpdates).toEqual([
      {
        SHARED_BOTTLE_EMPTY: 2,
        '__grid_ref_state__:__grid_ref__:Shared_Bottle1:SHARED_BOTTLE_EMPTY': 1,
        '__grid_ref_state__:__grid_ref__:Shared_Bottle2:SHARED_BOTTLE_EMPTY': 1,
      },
    ]);
  });

  it('marks subsequent raw snapshots as live updates after the initial snapshot', async () => {
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

    parseRawMessageMock
      .mockReturnValueOnce({
        items: [{ id: 'OOT_BOW', qty: 1 }],
        checks: [],
      })
      .mockReturnValueOnce({
        items: [
          { id: 'OOT_BOW', qty: 1 },
          { id: 'OOT_BOMB_BAG', qty: 1 },
        ],
        checks: [],
      });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 2,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
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

    parseRawMessageMock
      .mockReturnValueOnce({
        items: [{ id: 'OOT_HOOKSHOT', qty: 1 }],
        checks: [],
      })
      .mockReturnValueOnce({
        items: [
          { id: 'OOT_HOOKSHOT', qty: 1 },
          { id: 'MM_HOOKSHOT', qty: 1 },
        ],
        checks: [],
      });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 2,
      game: 'MM',
      saveIndex: 0,
      chunks: [],
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

    parseRawMessageMock
      .mockReturnValueOnce({
        items: [{ id: 'OOT_WALLET', qty: 2 }],
        checks: [],
      })
      .mockReturnValueOnce({
        items: [
          { id: 'OOT_WALLET', qty: 2 },
          { id: 'OOT_WALLET5', qty: 1 },
        ],
        checks: [],
      });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 2,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
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

    parseRawMessageMock
      .mockReturnValueOnce({
        items: [{ id: 'OOT_ADULT_TRADE', qty: 17 }],
        checks: [],
      })
      .mockReturnValueOnce({
        items: [{ id: 'OOT_ADULT_TRADE', qty: 16 }],
        checks: [],
      });

    socket.emitOpen();
    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 2,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });

    expect(inventoryUpdates).toEqual([
      { OOT_ODD_POTION: 1, OOT_POCKET_EGG: 1 },
      { OOT_ODD_POTION: 1 },
    ]);
  });

  it('requests only active-game raw memory areas', async () => {
    const autotracker = useAutotracker({
      availableItemIds: ref(new Set<string>()),
      itemMaxCounts: ref(new Map<string, number>()),
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
          expect.objectContaining({ name: 'oot_save_state' }),
          expect.objectContaining({ name: 'oot_foreign_mm_save' }),
          expect.objectContaining({ name: 'oot_shared_custom_save' }),
          expect.objectContaining({ name: 'oot_runtime_combo_config' }),
          expect.objectContaining({ name: 'oot_runtime_silver_rupee_data' }),
          expect.objectContaining({ name: 'oot_runtime_max_keys' }),
          expect.objectContaining({ name: 'oot_playstate_scene' }),
          expect.objectContaining({ name: 'oot_playstate_room' }),
          expect.objectContaining({ name: 'oot_playstate_link_age' }),
          expect.objectContaining({ name: 'oot_playstate_flags' }),
        ]),
        mm: expect.arrayContaining([
          expect.objectContaining({ name: 'mm_save_state' }),
          expect.objectContaining({ name: 'mm_cycle_flags' }),
          expect.objectContaining({ name: 'mm_foreign_oot_save' }),
          expect.objectContaining({ name: 'mm_shared_custom_save' }),
          expect.objectContaining({ name: 'mm_runtime_combo_config' }),
          expect.objectContaining({ name: 'mm_playstate_scene' }),
          expect.objectContaining({ name: 'mm_playstate_room' }),
          expect.objectContaining({ name: 'mm_playstate_flags' }),
        ]),
      },
    });
    expect(
      handshake.memoryAreas.oot.some(
        (area: { name: string }) => area.name === 'mm_save_state',
      ),
    ).toBe(false);
    expect(
      handshake.memoryAreas.mm.some(
        (area: { name: string }) => area.name === 'oot_save_state',
      ),
    ).toBe(false);
    expect(
      handshake.memoryAreas.oot.some(
        (area: { name: string }) => area.name === 'combo_ctx_oot',
      ),
    ).toBe(false);
    expect(
      handshake.memoryAreas.mm.some(
        (area: { name: string }) => area.name === 'combo_ctx_mm',
      ),
    ).toBe(false);
    expect(
      handshake.memoryAreas.oot.some(
        (area: { name: string }) => area.name === 'oot_payload',
      ),
    ).toBe(false);
    expect(
      handshake.memoryAreas.mm.some(
        (area: { name: string }) => area.name === 'mm_payload',
      ),
    ).toBe(false);
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
    expect(JSON.parse(socket.sentMessages[0])).toMatchObject({
      type: 'handshake',
      features: ['raw'],
      flags: { protocol: 'raw' },
    });

    socket.emitMessage({
      type: 'handshAck',
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });

    await expect(availabilityPromise).resolves.toBe(true);
    expect(autotracker.enabled.value).toBe(false);
  });

  it('reports an outdated autotracker version from the handshake ack', async () => {
    const inventoryUpdates: Array<Record<string, number>> = [];
    const autotracker = useAutotracker({
      availableItemIds: ref(new Set<string>()),
      itemMaxCounts: ref(new Map<string, number>()),
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
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });

    expect(autotracker.enabled.value).toBe(false);
    expect(autotracker.status.value).toBe('disconnected');
    expect(autotracker.versionWarning.value).toBe(
      'You are using an outdated autotracker version (0.1.0). Please update to version 0.2.2 or newer.',
    );
    expect(inventoryUpdates).toEqual([]);
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

  it('recreates the raw parser when the spoiler-log version changes', async () => {
    const availableItemIds = ref(new Set<string>());
    const itemMaxCounts = ref(new Map<string, number>());
    const ootmmVersion = ref<string | null>('v31.1');

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      ootmmVersion,
      onInventoryUpdate: () => {},
    });

    // Parser is created once at setup with the initially loaded version.
    expect(createRawAutotrackerParserMock).toHaveBeenCalledTimes(1);
    expect(createRawAutotrackerParserMock).toHaveBeenLastCalledWith({
      ootmmVersion: 'v31.1',
    });

    // A version change (e.g. importing a v32.0 spoiler log after a reset)
    // recreates the parser with the new version instead of keeping the
    // previously loaded tables until a page reload.
    ootmmVersion.value = 'v32.0';
    await nextTick();
    expect(createRawAutotrackerParserMock).toHaveBeenCalledTimes(2);
    expect(createRawAutotrackerParserMock).toHaveBeenLastCalledWith({
      ootmmVersion: 'v32.0',
    });

    // Assigning the same version does not recreate the parser.
    ootmmVersion.value = 'v32.0';
    await nextTick();
    expect(createRawAutotrackerParserMock).toHaveBeenCalledTimes(2);

    // Clearing the spoiler log (Reset Tracker State) recreates without a
    // version, so the parser falls back to the default data tables.
    ootmmVersion.value = null;
    await nextTick();
    expect(createRawAutotrackerParserMock).toHaveBeenCalledTimes(3);
    expect(createRawAutotrackerParserMock).toHaveBeenLastCalledWith({
      ootmmVersion: null,
    });

    autotracker.destroy();
  });

  it('uses the recreated parser for frames arriving after a version change', async () => {
    const availableItemIds = ref(
      new Set<string>(['OOT_BOW', 'OOT_SWORD_KOKIRI']),
    );
    const itemMaxCounts = ref(new Map<string, number>());
    const ootmmVersion = ref<string | null>('v31.1');

    const inventoryUpdates: Array<Record<string, number>> = [];
    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      ootmmVersion,
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
      version: CURRENT_AUTOTRACKER_VERSION,
      name: 'ootmm-autotracker',
      refresh: true,
    });

    // Change the version while autotracking is active, then feed a frame.
    ootmmVersion.value = 'v32.0';
    await nextTick();
    await nextTick();

    parseRawMessageMock.mockReturnValueOnce({
      items: [{ id: 'OOT_BOW', qty: 1 }],
      checks: [],
    });
    socket.emitMessage({
      type: 'raw',
      schemaVersion: '1',
      diff: false,
      refresh: true,
      sequence: 1,
      game: 'OoT',
      saveIndex: 0,
      chunks: [],
    });

    expect(createRawAutotrackerParserMock).toHaveBeenCalledTimes(2);
    expect(createRawAutotrackerParserMock).toHaveBeenLastCalledWith({
      ootmmVersion: 'v32.0',
    });
    // The frame is parsed and pushed as a fresh 'initial' sync.
    expect(inventoryUpdates).toEqual([{ OOT_BOW: 1 }]);

    autotracker.destroy();
  });
});
