#!/usr/bin/env python3
"""
Request a complete save RAM dump from the active autotracker WebSocket server.

Usage: python3 scripts/autotracker/request_full_save_dump.py [output.json] [--live-addrs PATH]

Dumps the full save context, combo context, entire payload region, and
playstate for both OoT and MM in one shot. Only three version-dependent
base addresses are needed: saveCtx, comboCtx, and payload. All three come
from live_addrs.json (auto-discovered). Sizes use the generous upper bounds
from ootmm/addrs.go so the dump always covers the complete region.
"""

import argparse
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


# ═══════════════════════════════════════════════════════════════════════
#  Fixed sizes (from ootmm/addrs.go – not version-dependent)
# ═══════════════════════════════════════════════════════════════════════

OOT_SAVE_CTX_SIZE  = 0x1450
MM_SAVE_CTX_SIZE   = 0x48D0
COMBO_CTX_SIZE     = 0x20
OOT_PAYLOAD_SIZE   = 0x80000   # generous upper bound
MM_PAYLOAD_SIZE    = 0x50000   # generous upper bound

# Playstate (fixed ROM addresses, not version-dependent)
OOT_PLAYSTATE_ADDR = 0x801C84A0
OOT_PLAYSTATE_SIZE = 0x1CA8 + 0x12D   # core + tail
MM_PLAYSTATE_ADDR  = 0x803E6B20
MM_PLAYSTATE_SIZE  = 0x1DD4 + 0x164   # core + tail


# ═══════════════════════════════════════════════════════════════════════
#  live_addrs.json discovery & parsing
# ═══════════════════════════════════════════════════════════════════════

def find_live_addrs_json(explicit_path: str | None = None) -> str:
    if explicit_path:
        if not os.path.isfile(explicit_path):
            print(f"Error: --live-addrs file not found: {explicit_path}")
            sys.exit(1)
        return os.path.abspath(explicit_path)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.normpath(os.path.join(script_dir, "..", ".."))
    data_dir = os.path.join(repo_root, "packs", "ootmm", "src", "autotracker", "data")

    if not os.path.isdir(data_dir):
        print(f"Error: autotracker data directory not found at {data_dir}")
        print("Specify path manually with --live-addrs")
        sys.exit(1)

    candidates = []
    for entry in os.listdir(data_dir):
        candidate = os.path.join(data_dir, entry, "live_addrs.json")
        if os.path.isfile(candidate):
            candidates.append((entry, candidate))

    if not candidates:
        print(f"Error: no live_addrs.json found under {data_dir}")
        sys.exit(1)

    candidates.sort(key=lambda x: x[0])
    version, path = candidates[-1]
    print(f"Auto-discovered live_addrs.json: {version} ({path})")
    return path


def parse_hex_addr(raw, label: str) -> int:
    if not raw or not isinstance(raw, str):
        print(f"Error: {label} is missing in live_addrs.json")
        sys.exit(1)
    raw = raw.strip()
    try:
        return int(raw, 16)
    except ValueError:
        print(f"Error: invalid hex in {label}: {raw!r}")
        sys.exit(1)


def load_base_addrs(path: str) -> dict:
    """Extract only the three essential base addresses per game."""
    with open(path) as f:
        data = json.load(f)

    addrs = {}
    for game in ("oot", "mm"):
        g = data[game]
        addrs[f"{game}_saveCtx"] = parse_hex_addr(g["saveCtx"], f"{game}.saveCtx")
        addrs[f"{game}_comboCtx"] = parse_hex_addr(g["comboCtx"], f"{game}.comboCtx")
        addrs[f"{game}_payload"] = parse_hex_addr(g["payload"], f"{game}.payload")
    return addrs


# ═══════════════════════════════════════════════════════════════════════
#  Chunk builder – just four big blocks per game
# ═══════════════════════════════════════════════════════════════════════

def build_chunks(addrs: dict) -> tuple[list[dict], list[dict]]:
    oot = [
        {"name": "oot_save_ctx",    "address": addrs["oot_saveCtx"],  "length": OOT_SAVE_CTX_SIZE},
        {"name": "oot_combo_ctx",   "address": addrs["oot_comboCtx"], "length": COMBO_CTX_SIZE},
        {"name": "oot_payload",     "address": addrs["oot_payload"],  "length": OOT_PAYLOAD_SIZE},
        {"name": "oot_playstate",   "address": OOT_PLAYSTATE_ADDR,    "length": OOT_PLAYSTATE_SIZE},
    ]
    mm = [
        {"name": "mm_save_ctx",     "address": addrs["mm_saveCtx"],   "length": MM_SAVE_CTX_SIZE},
        {"name": "mm_combo_ctx",    "address": addrs["mm_comboCtx"],  "length": COMBO_CTX_SIZE},
        {"name": "mm_payload",      "address": addrs["mm_payload"],   "length": MM_PAYLOAD_SIZE},
        {"name": "mm_playstate",    "address": MM_PLAYSTATE_ADDR,     "length": MM_PLAYSTATE_SIZE},
    ]
    return oot, mm


# ═══════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════

async def main():
    parser = argparse.ArgumentParser(
        description="Dump complete save RAM from the autotracker WebSocket server."
    )
    parser.add_argument(
        "output", nargs="?", default="full-save-dump.json",
        help="Output JSON file path (default: full-save-dump.json)",
    )
    parser.add_argument(
        "--live-addrs", default=None,
        help="Path to live_addrs.json (auto-discovered if omitted)",
    )
    parser.add_argument(
        "--duration", type=float, default=5.0,
        help="Capture window in seconds (default: 5.0)",
    )
    args = parser.parse_args()

    output_path = os.path.abspath(args.output)
    live_addrs_path = find_live_addrs_json(args.live_addrs)
    print(f"Loading addresses from: {live_addrs_path}")
    addrs = load_base_addrs(live_addrs_path)
    oot_chunks, mm_chunks = build_chunks(addrs)

    print("\nChunks to request:")
    for label, chunks in [("OoT", oot_chunks), ("MM", mm_chunks)]:
        for c in chunks:
            print(f"  {c['name']:20s}  0x{c['address']:08X}  ({c['length']:#x} bytes = {c['length']:,} bytes)")

    print(f"\nConnecting to ws://127.0.0.1:17026/ ...")
    messages = []

    try:
        async with websockets.connect(
            "ws://127.0.0.1:17026/",
            extra_headers={"Origin": "http://localhost:5173"},
            max_size=50 * 1024 * 1024,
        ) as ws:
            handshake = {
                "type": "handshake",
                "features": ["raw"],
                "memoryAreas": {"oot": oot_chunks, "mm": mm_chunks},
            }
            await ws.send(json.dumps(handshake))
            print("Handshake sent, waiting for data ...")

            deadline = time.monotonic() + args.duration
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    print(f"\nCapture window ({args.duration}s) elapsed.")
                    break

                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break

                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                t = data.get("type")
                if t == "handshAck":
                    print(f"Handshake acknowledged: v{data.get('version')} ({data.get('name')})")
                elif t == "raw":
                    n = data.get("sequence", "?")
                    game = data.get("game", "?")
                    si = data.get("saveIndex", "?")
                    nc = len(data.get("chunks", []))
                    total = sum(c.get("length", 0) for c in data.get("chunks", []))
                    print(f"  raw[{n}]: game={game}, saveIndex={si}, chunks={nc}, total={total:,} bytes")
                    messages.append(data)
                elif t == "error":
                    print(f"Server error: {data.get('message')}")

    except websockets.exceptions.ConnectionClosed as e:
        if not messages:
            print(f"WebSocket closed unexpectedly: {e}")
            sys.exit(1)
    except (OSError, websockets.exceptions.InvalidURI) as e:
        print(f"Connection error: {e}")
        print("Make sure the autotracker is running on ws://127.0.0.1:17026/")
        sys.exit(1)

    if not messages:
        print("No raw messages received.")
        sys.exit(1)

    # Keep only the last message per game
    latest = {}
    for msg in messages:
        latest[msg["game"]] = msg

    dump = {
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalMessagesCaptured": len(messages),
        "messages": list(latest.values()),
    }

    with open(output_path, "w") as f:
        json.dump(dump, f, indent=2)

    print(f"\nSaved {len(latest)} snapshot(s) ({len(messages)} total messages) to {output_path}")
    for msg in latest.values():
        print(f"  {msg['game']}: saveIndex={msg.get('saveIndex')}")
        for c in msg.get("chunks", []):
            print(f"    {c['name']:20s}  {c['length']:,} bytes at 0x{c['address']:08X}")


if __name__ == "__main__":
    asyncio.run(main())
