/**
 * Connects to the autotracker Go backend WebSocket and dumps raw scene data.
 * Run with: npx tsx scripts/autotracker-dump-scene.ts
 */
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:17026/';

function decodeBase64(encoded: string): Uint8Array {
  return new Uint8Array(
    atob(encoded)
      .split('')
      .map((c) => c.charCodeAt(0)),
  );
}

function parseSceneId(chunks: { name: string; data: string }[]): void {
  for (const chunk of chunks) {
    if (chunk.name === 'mm_playstate_scene') {
      const data = decodeBase64(chunk.data);
      if (data.length >= 2) {
        const sceneId = (data[0] << 8) | data[1];
        console.log(`MM play state scene: ${sceneId}`);
      }
    }
    if (chunk.name === 'oot_playstate_scene') {
      const data = decodeBase64(chunk.data);
      if (data.length >= 2) {
        const sceneId = (data[0] << 8) | data[1];
        console.log(`OoT play state scene: ${sceneId}`);
      }
    }
    if (chunk.name === 'oot_save_state_scene') {
      const data = decodeBase64(chunk.data);
      if (data.length >= 2) {
        const sceneId = (data[0] << 8) | data[1];
        console.log(`OoT save state scene: ${sceneId}`);
      }
    }
  }
}

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected! Sending handshake...');
  const handshake = {
    type: 'handshake',
    features: ['raw'],
    memoryAreas: {
      oot: [
        'oot_save_state_scene',
        'oot_save_state',
        'oot_playstate_scene',
        'oot_playstate_room',
        'oot_playstate_link_age',
        'oot_playstate_flags',
        'oot_foreign_mm_save',
        'oot_foreign_mm_day',
        'oot_foreign_mm_cycle_flags',
        'oot_shared_custom_save_bitmap_0',
        'oot_runtime_combo_config',
        'oot_runtime_silver_rupee_data',
        'oot_runtime_max_keys',
      ],
      mm: [
        'mm_save_state',
        'mm_save_state_day',
        'mm_save_state_time',
        'mm_save_state_week_event_reg',
        'mm_foreign_oot_save',
        'mm_shared_custom_save_bitmap_0',
        'mm_runtime_combo_config',
        'mm_playstate_scene',
        'mm_playstate_room',
        'mm_playstate_flags',
      ],
    },
  };
  ws.send(JSON.stringify(handshake));
});

ws.on('message', (raw: Buffer) => {
  const text = raw.toString('utf-8');
  try {
    const msg = JSON.parse(text);
    if (msg.type === 'handshake_ack') {
      console.log(
        `Handshake ACK: protocol=${msg.protocol} features=${msg.features}`,
      );
    } else if (msg.type === 'raw') {
      const game = msg.game || '?';
      const seq = msg.sequence || 0;
      const diff = msg.diff ? ' (diff)' : '';
      const refresh = msg.refresh ? ' (refresh)' : '';
      console.log(`\n--- Frame #${seq} game=${game}${diff}${refresh} ---`);
      if (msg.chunks) {
        parseSceneId(msg.chunks);
        // Print all chunk names
        for (const c of msg.chunks) {
          console.log(`  chunk: ${c.name} len=${c.length}`);
        }
      }
    }
  } catch (_e) {
    console.log('Unparseable message:', text.substring(0, 200));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('Disconnected');
});

// Keep running for 30 seconds
setTimeout(() => {
  console.log('\nTimeout reached. Closing.');
  ws.close();
  process.exit(0);
}, 30000);
