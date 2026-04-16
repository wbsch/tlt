import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAutotracker,
  type AutotrackerCheck,
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
    const availableItemIds = ref(new Set<string>(['OOT_BOW']));
    const itemMaxCounts = ref(new Map<string, number>());

    const autotracker = useAutotracker({
      availableItemIds,
      itemMaxCounts,
      onInventoryUpdate: (inventory) => {
        inventoryUpdates.push(inventory);
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
});
