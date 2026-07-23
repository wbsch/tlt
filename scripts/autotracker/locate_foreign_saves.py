#!/usr/bin/env python3
"""
Find the foreign save (and SharedCustomSave) addresses inside the payload of
a full save RAM dump.

This is a standalone tool that implements the checksum-validated scanning
algorithm originally from the old autotracker's reader.go.

Usage:
  # Step 1: Capture a dump (in-game, paused after save)
  python3 scripts/autotracker/request_full_save_dump.py full-save-dump.json

  # Step 2: Scan the dump for foreign save addresses
  python3 scripts/autotracker/locate_foreign_saves.py full-save-dump.json

  # If you need to override the payload base addresses (rare):
  python3 scripts/autotracker/locate_foreign_saves.py full-save-dump.json \\
      --oot-payload 0x80400000 --mm-payload 0x80730000

Output format is suitable for pasting into live_addrs.json.
"""

import argparse
import json
import struct
import sys


# ═══════════════════════════════════════════════════════════════════════════
#  Constants
# ═══════════════════════════════════════════════════════════════════════════

# MM save structure
MM_SAVE_SIZE         = 0x3CA0
MM_OFF_DAY           = 0x18   # u32 BE
MM_OFF_PLAYER_FORM   = 0x20   # u8 (0-4)
MM_OFF_INV_ITEMS     = 0x70   # u8[48]
MM_OFF_DUNGEON_KEYS  = 0xCA   # s8[9]
MM_OFF_STRAY_FAIRIES = 0xD4   # s8[10]
MM_OFF_CHECKSUM      = 0x100A # u16 BE (additive, byte-wise, excludes these 2 bytes)
MM_EMPTY_ITEM        = 0xFF

# MM foreign save checksum tolerance (when exact match fails)
MAX_MM_CHECKSUM_DELTA = 0x400

# OoT save structure
OOT_SAVE_SIZE         = 0x1354
OOT_OFF_AGE           = 0x04   # u32 BE (0=adult, 1=child)
OOT_OFF_SCENE_ID      = 0x66   # u16 BE
OOT_OFF_INV_ITEMS     = 0x74   # u8[24]
OOT_OFF_DUNGEON_KEYS  = 0xBC   # s8[19]
OOT_OFF_GOLD_TOKENS   = 0xD0   # u16 BE
OOT_OFF_CHECKSUM      = 0x1352 # u16 BE (additive, u16-wise, excludes these 2 bytes)
OOT_EMPTY_ITEM        = 0xFF
OOT_PERM_COUNT        = 124

# OoT foreign save checksum tolerance
MAX_OOT_CHECKSUM_DELTA = 0x1000

# OoT foreign save plausibility
MIN_OOT_EMPTY_SLOTS = 4
MAX_OOT_AGE         = 1
MAX_OOT_GOLD_TOKENS = 100

# SharedCustomSave
SHARED_CUSTOM_SAVE_SIZE = 0x870

# Default payload base addresses (stable across versions)
DEFAULT_OOT_PAYLOAD_BASE = 0x80400000
DEFAULT_MM_PAYLOAD_BASE  = 0x80730000

# Scan step (must be alignment-preserving)
SCAN_STEP = 16


# ═══════════════════════════════════════════════════════════════════════════
#  Checksum functions
# ═══════════════════════════════════════════════════════════════════════════

def mm_checksum(data: bytes) -> int:
    """Additive u16 checksum over MmSave (byte-wise), skipping the checksum field."""
    cs = 0
    for i in range(MM_SAVE_SIZE):
        if i == MM_OFF_CHECKSUM or i == MM_OFF_CHECKSUM + 1:
            continue
        cs += data[i]
    return cs & 0xFFFF


def mm_checksum_delta(data: bytes) -> int | None:
    """Distance between computed and stored checksum (wrapping). Returns None if stored==0."""
    if len(data) < MM_SAVE_SIZE:
        return None
    expected = struct.unpack_from(">H", data, MM_OFF_CHECKSUM)[0]
    if expected == 0:
        return None
    computed = mm_checksum(data)
    delta = abs(computed - expected)
    if delta > 0x8000:
        delta = 0x10000 - delta
    return delta


def oot_checksum(data: bytes) -> int:
    """Additive u16 checksum over OotSave (u16-wise), skipping the checksum field."""
    cs = 0
    for i in range(0, OOT_SAVE_SIZE, 2):
        if i == OOT_OFF_CHECKSUM:
            continue
        cs += struct.unpack_from(">H", data, i)[0]
    return cs & 0xFFFF


def oot_checksum_delta(data: bytes) -> int | None:
    """Distance between computed and stored checksum (wrapping). Returns None if stored==0."""
    if len(data) < OOT_SAVE_SIZE:
        return None
    expected = struct.unpack_from(">H", data, OOT_OFF_CHECKSUM)[0]
    if expected == 0:
        return None
    computed = oot_checksum(data)
    delta = abs(computed - expected)
    if delta > 0x8000:
        delta = 0x10000 - delta
    return delta


# ═══════════════════════════════════════════════════════════════════════════
#  Plausibility checks
# ═══════════════════════════════════════════════════════════════════════════

def is_plausible_mm_save(data: bytes) -> bool:
    """Quick structural plausibility for MM save (cheap, before checksum)."""
    player_form = data[MM_OFF_PLAYER_FORM]
    if player_form > 4:
        return False

    day = struct.unpack_from(">I", data, MM_OFF_DAY)[0]
    if day > 4:
        return False

    items = data[MM_OFF_INV_ITEMS:MM_OFF_INV_ITEMS + 48]
    empty_slots = sum(1 for b in items if b == MM_EMPTY_ITEM)
    if empty_slots < 16:
        return False

    for i in range(9):
        key = struct.unpack_from("b", data, MM_OFF_DUNGEON_KEYS + i)[0]
        if key < -1 or key > 9:
            return False

    for i in range(10):
        fairy = struct.unpack_from("b", data, MM_OFF_STRAY_FAIRIES + i)[0]
        if fairy < 0 or fairy > 15:
            return False

    return True


def is_plausible_oot_save(data: bytes) -> bool:
    """Quick structural plausibility for OoT save (cheap, before checksum)."""
    age = struct.unpack_from(">I", data, OOT_OFF_AGE)[0]
    if age > MAX_OOT_AGE:
        return False

    scene_id = struct.unpack_from(">H", data, OOT_OFF_SCENE_ID)[0]
    if scene_id >= OOT_PERM_COUNT:
        return False

    items = data[OOT_OFF_INV_ITEMS:OOT_OFF_INV_ITEMS + 24]
    empty_slots = sum(1 for b in items if b == OOT_EMPTY_ITEM)
    if empty_slots < MIN_OOT_EMPTY_SLOTS:
        return False

    gold_tokens = struct.unpack_from(">H", data, OOT_OFF_GOLD_TOKENS)[0]
    if gold_tokens > MAX_OOT_GOLD_TOKENS:
        return False

    for i in range(19):
        key = struct.unpack_from("b", data, OOT_OFF_DUNGEON_KEYS + i)[0]
        if key < -1 or key > 9:
            return False

    return True


# ═══════════════════════════════════════════════════════════════════════════
#  Scanners
# ═══════════════════════════════════════════════════════════════════════════

def locate_foreign_mm_save(payload: bytes, payload_base: int) -> int | None:
    """
    Scan OoT's payload for the foreign MM save (gMmSave).

    Phase 1: exact checksum match + plausibility.
    Phase 2: closest checksum delta within tolerance + plausibility.
    """
    # Phase 1: exact match
    for offset in range(0, len(payload) - MM_SAVE_SIZE + 1, SCAN_STEP):
        candidate = payload[offset:offset + MM_SAVE_SIZE]
        if not is_plausible_mm_save(candidate):
            continue
        expected = struct.unpack_from(">H", candidate, MM_OFF_CHECKSUM)[0]
        if expected == 0:
            continue
        if mm_checksum(candidate) == expected:
            return payload_base + offset

    # Phase 2: best delta
    best_offset = -1
    best_delta = MAX_MM_CHECKSUM_DELTA + 1
    for offset in range(0, len(payload) - MM_SAVE_SIZE + 1, SCAN_STEP):
        candidate = payload[offset:offset + MM_SAVE_SIZE]
        if not is_plausible_mm_save(candidate):
            continue
        delta = mm_checksum_delta(candidate)
        if delta is None or delta > MAX_MM_CHECKSUM_DELTA:
            continue
        if delta < best_delta:
            best_delta = delta
            best_offset = offset

    if best_offset >= 0:
        return payload_base + best_offset
    return None


def locate_foreign_oot_save(payload: bytes, payload_base: int) -> int | None:
    """
    Scan MM's payload for the foreign OoT save (gOotSave).

    Phase 1: exact checksum match + plausibility + shared prefix plausibility.
    Phase 2: exact checksum + plausibility (no shared prefix).
    Phase 3: best checksum delta within tolerance + plausibility.
    """
    # Phase 1: exact checksum + plausibility + shared prefix plausibility
    for offset in range(0, len(payload) - OOT_SAVE_SIZE + 1, SCAN_STEP):
        candidate = payload[offset:offset + OOT_SAVE_SIZE]
        if not is_plausible_oot_save(candidate):
            continue
        expected = struct.unpack_from(">H", candidate, OOT_OFF_CHECKSUM)[0]
        if expected == 0:
            continue
        if oot_checksum(candidate) != expected:
            continue
        if _has_plausible_shared_prefix(payload, offset):
            return payload_base + offset

    # Phase 2: exact checksum + plausibility (without shared prefix requirement)
    for offset in range(0, len(payload) - OOT_SAVE_SIZE + 1, SCAN_STEP):
        candidate = payload[offset:offset + OOT_SAVE_SIZE]
        if not is_plausible_oot_save(candidate):
            continue
        expected = struct.unpack_from(">H", candidate, OOT_OFF_CHECKSUM)[0]
        if expected == 0:
            continue
        if oot_checksum(candidate) == expected:
            return payload_base + offset

    # Phase 3: best delta + plausibility
    best_offset = -1
    best_delta = MAX_OOT_CHECKSUM_DELTA + 1
    for offset in range(0, len(payload) - OOT_SAVE_SIZE + 1, SCAN_STEP):
        candidate = payload[offset:offset + OOT_SAVE_SIZE]
        if not is_plausible_oot_save(candidate):
            continue
        delta = oot_checksum_delta(candidate)
        if delta is None or delta > MAX_OOT_CHECKSUM_DELTA:
            continue
        if delta < best_delta:
            best_delta = delta
            best_offset = offset

    if best_offset >= 0:
        return payload_base + best_offset
    return None


def _has_plausible_shared_prefix(payload: bytes, offset: int) -> bool:
    """
    Check if the SharedCustomSave immediately before this OoT save looks valid.
    SharedCustomSave is always immediately before gOotSave/gMmSave in the payload.
    """
    if offset < SHARED_CUSTOM_SAVE_SIZE:
        return False
    start = offset - SHARED_CUSTOM_SAVE_SIZE
    # Simple structural check: shared save starts with a recognizable header
    # (at minimum, the netGiSkip fields are reasonable)
    shared = payload[start:start + SHARED_CUSTOM_SAVE_SIZE]
    return _is_plausible_shared_custom_save(shared)


def _is_plausible_shared_custom_save(data: bytes) -> bool:
    """Minimal structural check for SharedCustomSave."""
    if len(data) < SHARED_CUSTOM_SAVE_SIZE:
        return False
    # SharedCustomSave layout (0x870 bytes):
    # Offset 0: netGiSkip[2] (2 bytes each, OoT then MM)
    # These are small values (0-16 typically)
    for off in (0, 2):
        val = struct.unpack_from(">H", data, off)[0]
        if val > 16:
            return False
    return True


# ═══════════════════════════════════════════════════════════════════════════
#  Dump file handling
# ═══════════════════════════════════════════════════════════════════════════

def _find_chunk_in_list(chunks: list[dict], name: str) -> dict | None:
    """Find a chunk by name in a list of chunks."""
    for c in chunks:
        if c.get("name") == name:
            return c
    return None


def extract_payload(dump: dict, game: str) -> tuple[bytes, int] | None:
    """
    Extract the payload bytes and its VRAM base address from a dump.

    Supports two dump formats:
    1. Flat: {"chunks": [{"name": "oot_payload", ...}]}
    2. Messages: {"messages": [{"game": "OoT", "chunks": [{"name": "oot_payload", ...}]}]}
    """
    import base64

    payload_chunk = None

    # Format 1: top-level chunks
    if "chunks" in dump:
        payload_chunk = _find_chunk_in_list(dump["chunks"], f"{game}_payload")

    # Format 2: messages-based dump (from request_full_save_dump.py)
    if payload_chunk is None and "messages" in dump:
        for msg in dump["messages"]:
            msg_game = msg.get("game", "").lower()
            if msg_game != game:
                continue
            chunk = _find_chunk_in_list(msg.get("chunks", []), f"{game}_payload")
            if chunk:
                payload_chunk = chunk
                break

    if payload_chunk is None:
        print(f"  (no {game}_payload chunk found in dump)")
        return None

    addr = payload_chunk.get("address")
    if not addr:
        print(f"Error: {game}_payload chunk missing 'address'.")
        return None

    raw = payload_chunk.get("data")
    if not raw:
        print(f"Error: {game}_payload chunk missing 'data'.")
        return None

    # Both formats use base64-encoded binary
    try:
        data = base64.b64decode(raw)
    except Exception as e:
        print(f"Error decoding base64 for {game}_payload: {e}")
        return None

    return data, addr


# ═══════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Locate foreign save addresses (gMmSave, gOotSave, gSharedCustomSave) "
                    "in a full save dump."
    )
    parser.add_argument(
        "dump", help="Path to full-save-dump.json (from request_full_save_dump.py)"
    )
    parser.add_argument(
        "--oot-payload", type=lambda x: int(x, 16),
        default=None, help="OoT payload VRAM base address (default: from dump or 0x80400000)"
    )
    parser.add_argument(
        "--mm-payload", type=lambda x: int(x, 16),
        default=None, help="MM payload VRAM base address (default: from dump or 0x80730000)"
    )
    args = parser.parse_args()

    # Load dump
    with open(args.dump) as f:
        dump = json.load(f)

    # Get payloads from dump
    oot_result = extract_payload(dump, "oot")
    mm_result = extract_payload(dump, "mm")

    if not oot_result and not mm_result:
        print("Error: no payload data found in dump.")
        sys.exit(1)

    # Determine payload base addresses
    oot_data, oot_payload_base = oot_result if oot_result else (None, None)
    mm_data, mm_payload_base = mm_result if mm_result else (None, None)

    if args.oot_payload is not None:
        oot_payload_base = args.oot_payload
    elif oot_payload_base is None:
        oot_payload_base = DEFAULT_OOT_PAYLOAD_BASE

    if args.mm_payload is not None:
        mm_payload_base = args.mm_payload
    elif mm_payload_base is None:
        mm_payload_base = DEFAULT_MM_PAYLOAD_BASE

    # ── Scan OoT payload for foreign MM save ──
    print("=" * 60)
    print("  Foreign Save Locator")
    print("=" * 60)

    if oot_data:
        print(f"\nScanning OoT payload (0x{oot_payload_base:08X}, {len(oot_data):,} bytes)...")
        mm_addr = locate_foreign_mm_save(oot_data, oot_payload_base)
        if mm_addr:
            offset = mm_addr - oot_payload_base
            shared_addr = mm_addr - SHARED_CUSTOM_SAVE_SIZE

            # Verify with checksum
            slice_start = offset
            slice_end = offset + MM_SAVE_SIZE
            mm_candidate = oot_data[slice_start:slice_end]
            cs_expected = struct.unpack_from(">H", mm_candidate, MM_OFF_CHECKSUM)[0]
            cs_actual = mm_checksum(mm_candidate)
            day = struct.unpack_from(">I", mm_candidate, MM_OFF_DAY)[0]
            form = mm_candidate[MM_OFF_PLAYER_FORM]

            print(f"  ✓ gMmSave (foreignSaveLive) = 0x{mm_addr:08X}")
            print(f"    offset in payload: 0x{offset:X}")
            print(f"    checksum: stored=0x{cs_expected:04X} computed=0x{cs_actual:04X} {'✓' if cs_expected == cs_actual else '(!)'}")
            print(f"    day={day} playerForm={form}")
            print(f"  ✓ gSharedCustomSave (sharedCustomSaveLive) = 0x{shared_addr:08X}")
            print(f"    (gMmSave - 0x{SHARED_CUSTOM_SAVE_SIZE:X})")
        else:
            print("  ✗ gMmSave NOT FOUND in OoT payload.")
    else:
        print("\n  (no OoT payload in dump — skipping MM save search)")

    # ── Scan MM payload for foreign OoT save ──
    if mm_data:
        print(f"\nScanning MM payload (0x{mm_payload_base:08X}, {len(mm_data):,} bytes)...")
        oot_addr = locate_foreign_oot_save(mm_data, mm_payload_base)
        if oot_addr:
            offset = oot_addr - mm_payload_base
            shared_addr = oot_addr - SHARED_CUSTOM_SAVE_SIZE

            oot_candidate = mm_data[offset:offset + OOT_SAVE_SIZE]
            cs_expected = struct.unpack_from(">H", oot_candidate, OOT_OFF_CHECKSUM)[0]
            cs_actual = oot_checksum(oot_candidate)
            age = struct.unpack_from(">I", oot_candidate, OOT_OFF_AGE)[0]
            scene = struct.unpack_from(">H", oot_candidate, OOT_OFF_SCENE_ID)[0]

            print(f"  ✓ gOotSave (foreignSaveLive) = 0x{oot_addr:08X}")
            print(f"    offset in payload: 0x{offset:X}")
            print(f"    checksum: stored=0x{cs_expected:04X} computed=0x{cs_actual:04X} {'✓' if cs_expected == cs_actual else '(!)'}")
            print(f"    age={age} sceneID={scene}")
            print(f"  ✓ gSharedCustomSave (sharedCustomSaveLive) = 0x{shared_addr:08X}")
            print(f"    (gOotSave - 0x{SHARED_CUSTOM_SAVE_SIZE:X})")
        else:
            print("  ✗ gOotSave NOT FOUND in MM payload.")
    else:
        print("\n  (no MM payload in dump — skipping OoT save search)")

    # ── live_addrs.json snippet ──
    print("\n" + "=" * 60)
    print("  live_addrs.json snippet")
    print("=" * 60)
    print("Add / update these entries in packs/ootmm/src/autotracker/data/<version>/live_addrs.json:")
    print()

    if oot_data and mm_addr:
        print('  In "oot" section:')
        print(f'    "foreignSaveLive": "0x{mm_addr:08x}",')
        print(f'    "sharedCustomSaveLive": "0x{shared_addr:08x}",')
        print(f'  Derivation: "dump-locate-scan"')
        print()

    if mm_data and oot_addr:
        print('  In "mm" section:')
        print(f'    "foreignSaveLive": "0x{oot_addr:08x}",')
        shared_addr_mm = oot_addr - SHARED_CUSTOM_SAVE_SIZE
        print(f'    "sharedCustomSaveLive": "0x{shared_addr_mm:08x}",')
        print(f'  Derivation: "dump-locate-scan"')

    print()


if __name__ == "__main__":
    main()
