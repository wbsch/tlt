#!/usr/bin/env python3
"""
Request a complete save dump from the active autotracker WebSocket server
and save it to a file.

Usage: python3 scripts/autotracker/request_full_save_dump.py [output.json]

Connects to the autotracker at ws://127.0.0.1:17026/, requests ALL save
context chunks (OoT + MM full save contexts, combo config, shared saves,
playstate data), and writes whatever the server sends into a JSON file.
"""

import asyncio
import json
import os
import sys
import time

try:
    import websockets
except ImportError:
    print("Error: 'websockets' module not found. Install with: pip install websockets")
    sys.exit(1)


# ── Addresses from live_addrs.json (generated at patch time) ─────────
ADDR_OOT_SAVE_CTX = 0x8011A5D0
ADDR_MM_SAVE_CTX = 0x801EF670
ADDR_OOT_COMBO_CTX = 0x80006584
ADDR_MM_COMBO_CTX = 0x80098280
ADDR_OOT_COMBO_CONFIG_LIVE = 0x804416C8
ADDR_MM_COMBO_CONFIG_LIVE = 0x80770B18
ADDR_OOT_SILVER_RUPEE_LIVE = 0x8042EC10
ADDR_OOT_MAX_KEYS_LIVE = 0x80441C78

# Fallback addresses for dynamically-discovered areas
ADDR_OOT_FOREIGN_MM_SAVE_LIVE = 0x80443970
ADDR_OOT_SHARED_CUSTOM_SAVE_LIVE = 0x80443100
ADDR_MM_FOREIGN_OOT_SAVE_LIVE = 0x807729F0
ADDR_MM_SHARED_CUSTOM_SAVE_LIVE = 0x80772180

# ── Save area sizes from ootmm/addrs.go and rawFrameParser.ts ────────
OOT_SAVE_CTX_SIZE = 0x1450       # gSaveContext full size
OOT_SAVE_USED_SIZE = 0x1354      # Save portion
MM_SAVE_CTX_SIZE = 0x48D0        # gMmSave full size
MM_SAVE_USED_SIZE = 0x3CA0       # Save portion
COMBO_CTX_SIZE = 0x20
COMBO_CONFIG_LIVE_SIZE = 0x2DC
SILVER_RUPEE_DATA_SIZE = 18 * 4  # 18 sets × uint32
MAX_KEYS_BLOCK_SIZE = 17 + 4     # 17 scenes + header
SHARED_CUSTOM_SAVE_SIZE = 0x870

# Playstate sizes from raw_frame.go
OOT_PLAYSTATE_CORE_SIZE = 0x1CA8
OOT_PLAYSTATE_TAIL_SIZE = 0x12D
MM_PLAYSTATE_CORE_SIZE = 0x1DD4
MM_PLAYSTATE_TAIL_SIZE = 0x164

# MM cycle flags: 120 scenes × 0x14 stride
MM_CYCLE_FLAGS_OFFSET = 0x3F68
MM_CYCLE_FLAGS_SIZE = 120 * 0x14

# Playstate base addresses
ADDR_OOT_PLAYSTATE = 0x801C84A0
ADDR_MM_PLAYSTATE = 0x803E6B20

# ── Chunk specs ──────────────────────────────────────────────────────
OOT_CHUNKS = [
    {"name": "oot_save_ctx", "address": ADDR_OOT_SAVE_CTX, "length": OOT_SAVE_CTX_SIZE},
    {"name": "oot_combo_ctx", "address": ADDR_OOT_COMBO_CTX, "length": COMBO_CTX_SIZE},
    {"name": "oot_foreign_mm_save", "address": ADDR_OOT_FOREIGN_MM_SAVE_LIVE, "length": MM_SAVE_CTX_SIZE},
    {"name": "oot_shared_custom_save", "address": ADDR_OOT_SHARED_CUSTOM_SAVE_LIVE, "length": SHARED_CUSTOM_SAVE_SIZE},
    {"name": "oot_runtime_combo_config", "address": ADDR_OOT_COMBO_CONFIG_LIVE, "length": COMBO_CONFIG_LIVE_SIZE},
    {"name": "oot_runtime_silver_rupee_data", "address": ADDR_OOT_SILVER_RUPEE_LIVE, "length": SILVER_RUPEE_DATA_SIZE},
    {"name": "oot_runtime_max_keys", "address": ADDR_OOT_MAX_KEYS_LIVE, "length": MAX_KEYS_BLOCK_SIZE},
    {"name": "oot_playstate_core", "address": ADDR_OOT_PLAYSTATE, "length": OOT_PLAYSTATE_CORE_SIZE},
    {"name": "oot_playstate_tail", "address": ADDR_OOT_PLAYSTATE + OOT_PLAYSTATE_CORE_SIZE, "length": OOT_PLAYSTATE_TAIL_SIZE},
]

MM_CHUNKS = [
    {"name": "mm_save_ctx", "address": ADDR_MM_SAVE_CTX, "length": MM_SAVE_CTX_SIZE},
    {"name": "mm_combo_ctx", "address": ADDR_MM_COMBO_CTX, "length": COMBO_CTX_SIZE},
    {"name": "mm_foreign_oot_save", "address": ADDR_MM_FOREIGN_OOT_SAVE_LIVE, "length": OOT_SAVE_CTX_SIZE},
    {"name": "mm_shared_custom_save", "address": ADDR_MM_SHARED_CUSTOM_SAVE_LIVE, "length": SHARED_CUSTOM_SAVE_SIZE},
    {"name": "mm_runtime_combo_config", "address": ADDR_MM_COMBO_CONFIG_LIVE, "length": COMBO_CONFIG_LIVE_SIZE},
    {"name": "mm_cycle_flags", "address": ADDR_MM_SAVE_CTX + MM_CYCLE_FLAGS_OFFSET, "length": MM_CYCLE_FLAGS_SIZE},
    {"name": "mm_playstate_core", "address": ADDR_MM_PLAYSTATE, "length": MM_PLAYSTATE_CORE_SIZE},
    {"name": "mm_playstate_tail", "address": ADDR_MM_PLAYSTATE + MM_PLAYSTATE_CORE_SIZE, "length": MM_PLAYSTATE_TAIL_SIZE},
]


def build_handshake():
    return {
        "type": "handshake",
        "features": ["raw"],
        "memoryAreas": {
            "oot": OOT_CHUNKS,
            "mm": MM_CHUNKS,
        },
    }


async def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else "full-save-dump.json"
    output_path = os.path.abspath(output_path)

    print(f"Connecting to autotracker at ws://127.0.0.1:17026/ ...")

    messages = []
    capture_duration = 5.0  # collect messages for this many seconds

    try:
        async with websockets.connect(
            "ws://127.0.0.1:17026/",
            extra_headers={"Origin": "http://localhost:5173"},
            max_size=50 * 1024 * 1024,  # 50 MB max message size
        ) as ws:
            print("WebSocket connected, sending handshake ...")

            handshake = build_handshake()
            await ws.send(json.dumps(handshake))

            deadline = time.monotonic() + capture_duration

            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    print(f"\nCapture window ({capture_duration}s) elapsed.")
                    break

                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    print("\nTimeout reached.")
                    break

                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as e:
                    print(f"Failed to parse message: {e}")
                    continue

                msg_type = data.get("type")

                if msg_type == "handshAck":
                    print(f"Handshake acknowledged: v{data.get('version')} ({data.get('name')})")
                    continue

                if msg_type == "raw":
                    n = data.get("sequence", "?")
                    game = data.get("game", "?")
                    si = data.get("saveIndex", "?")
                    nc = len(data.get("chunks", []))
                    print(f"  raw[{n}]: game={game}, saveIndex={si}, chunks={nc}")
                    messages.append(data)
                    continue

                if msg_type == "error":
                    print(f"Server error: {data.get('message')}")
                    continue

                print(f"Unknown message type: {msg_type}")

    except websockets.exceptions.ConnectionClosed as e:
        if messages:
            print(f"WebSocket closed after receiving {len(messages)} message(s)")
        else:
            print(f"WebSocket closed unexpectedly: {e}")
            sys.exit(1)
    except (OSError, websockets.exceptions.InvalidURI) as e:
        print(f"Connection error: {e}")
        print("Make sure the autotracker is running on ws://127.0.0.1:17026/")
        sys.exit(1)

    if not messages:
        print("No raw messages received.")
        sys.exit(1)

    # Keep only the last message per game (most recent full snapshot)
    latest_by_game = {}
    for msg in messages:
        latest_by_game[msg["game"]] = msg

    dump = {
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalMessagesCaptured": len(messages),
        "messages": list(latest_by_game.values()),
    }

    with open(output_path, "w") as f:
        json.dump(dump, f, indent=2)

    print(f"\nSaved {len(latest_by_game)} snapshot(s) ({len(messages)} total messages) to {output_path}")

    # Print summary
    for msg in latest_by_game.values():
        print(f"\nGame: {msg['game']} (saveIndex={msg.get('saveIndex')})")
        for chunk in msg.get("chunks", []):
            print(f"  {chunk['name']}: {chunk['length']} bytes at 0x{chunk['address']:08X}")


if __name__ == "__main__":
    asyncio.run(main())
