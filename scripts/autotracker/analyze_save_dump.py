#!/usr/bin/env python3
"""
Analyze a full save dump JSON and verify struct offsets for SharedCustomSave.

Run: python3 scripts/autotracker/analyze_save_dump.py /tmp/full-save-dump.json
"""

import base64
import json
import sys


def decode_b64(data_b64: str) -> bytes:
    return base64.b64decode(data_b64)


def hexdump(data: bytes, offset: int = 0, length: int | None = None) -> str:
    """Return a hexdump string of the data."""
    if length is not None:
        data = data[offset:offset + length]
    else:
        data = data[offset:]
    lines = []
    for i in range(0, len(data), 16):
        chunk = data[i:i+16]
        hex_part = ' '.join(f'{b:02x}' for b in chunk)
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        lines.append(f'  {i+offset:08x}  {hex_part:<48s}  |{ascii_part}|')
    return '\n'.join(lines)


def find_pattern(data: bytes, pattern: bytes) -> list[int]:
    """Find all offsets of pattern in data."""
    offsets = []
    start = 0
    while True:
        idx = data.find(pattern, start)
        if idx == -1:
            break
        offsets.append(idx)
        start = idx + 1
    return offsets


def analyze_dump(dump_path: str):
    with open(dump_path) as f:
        dump = json.load(f)

    # The dump has messages per game
    for msg in dump.get("messages", []):
        game = msg["game"]
        print(f"\n{'='*80}")
        print(f"  Game: {game}")
        print(f"  SaveIndex: {msg.get('saveIndex')}")
        print(f"{'='*80}")

        chunks = {c["name"]: c for c in msg.get("chunks", [])}

        # For OoT, the payload contains gSharedCustomSave and gMmSave
        if game == "OoT" and "oot_payload" in chunks:
            payload = decode_b64(chunks["oot_payload"]["data"])

            # gSharedCustomSave and gMmSave addresses are version-dependent.
            # Auto-discover from live_addrs.json like request_full_save_dump.py does.
            import os as _os
            script_dir = _os.path.dirname(_os.path.abspath(__file__))
            repo_root = _os.path.normpath(_os.path.join(script_dir, "..", ".."))
            data_dir = _os.path.join(repo_root, "packs", "ootmm", "src", "autotracker", "data")
            # Pick the latest version directory with a live_addrs.json
            candidates = sorted(
                (entry, _os.path.join(data_dir, entry, "live_addrs.json"))
                for entry in _os.listdir(data_dir)
                if _os.path.isfile(_os.path.join(data_dir, entry, "live_addrs.json"))
            )
            if not candidates:
                print("Error: no live_addrs.json found")
                return
            with open(candidates[-1][1]) as _f:
                _live_addrs = json.load(_f)
            gSharedCustomSave_addr = int(_live_addrs["oot"]["sharedCustomSaveLive"], 16)
            gMmSave_addr = int(_live_addrs["oot"]["foreignSaveLive"], 16)
            payload_base = 0x80400000
            shared_offset = gSharedCustomSave_addr - payload_base
            foreign_offset = gMmSave_addr - payload_base

            shared_size = foreign_offset - shared_offset  # Should be 0x890

            print(f"\n  gSharedCustomSave: 0x{gSharedCustomSave_addr:08X} (payload+0x{shared_offset:X})")
            print(f"  gMmSave:           0x{gMmSave_addr:08X} (payload+0x{foreign_offset:X})")
            print(f"  Shared size:       0x{shared_size:X} ({shared_size} bytes)")
            print(f"  Foreign size:      0x3CA0 (15520 bytes)")

            shared_data = payload[shared_offset:shared_offset + shared_size]

            # Now verify the struct offsets based on the C header
            # From save.h:
            # OotCustomSave oot;      (size unknown)
            # MmCustomSave mm;        (size unknown)
            # s16 netGiSkip[16];      (32 bytes)
            # u16 coins[4];           (8 bytes)
            # u16 ocarinaButtonMaskOot; (2 bytes)
            # u16 ocarinaButtonMaskMm;  (2 bytes)
            # u8 soulsEnemyOot[8];    (8 bytes)
            # u8 soulsEnemyMm[8];     (8 bytes)
            # u8 soulsBossOot[2];     (2 bytes)
            # u8 soulsBossMm[1];      (1 byte)
            # u8 soulsNpcOot[8];      (8 bytes)
            # u8 soulsNpcMm[8];       (8 bytes)
            # u8 soulsAnimalsOot[2];  (2 bytes)
            # u8 soulsAnimalsMm[2];   (2 bytes)
            # u8 soulsMiscOot[1];     (1 byte)
            # u8 soulsMiscMm[1];      (1 byte)
            # u8 caughtChildFishWeight[20]; (20 bytes)
            # u8 caughtAdultFishWeight[20]; (20 bytes)
            # u8 caughtFishFlags[5];  (5 bytes)
            # RespawnData respawn[1]; (0x20 bytes from mm/save.h)
            # bitfields: ~2+ bytes
            # u8 traps[TRAP_MAX];     (7 bytes, TRAP_MAX=0x07)
            # u8 notes[NOTES_MAX];    (0x26 = 38 bytes)
            # u8 rustyKeysOot[...];   (variable)
            # u8 rustyKeysMm[...];    (variable)

            # We know the current offsets from generate_inventory_slots.py:
            # soulsEnemyOot = 0x7CC, soulsEnemyMm = 0x7D4, etc.
            # Let's verify these against the actual memory

            print("\n" + "="*60)
            print("  VERIFYING SOUL BITMAP OFFSETS")
            print("="*60)

            offsets_to_check = {
                "soulsEnemyOot":  0x7CC,
                "soulsEnemyMm":   0x7D4,
                "soulsBossOot":   0x7DC,
                "soulsBossMm":    0x7DE,
                "soulsNpcOot":    0x7DF,
                "soulsNpcMm":     0x7E7,
                "soulsAnimalOot": 0x7EF,
                "soulsAnimalMm":  0x7F1,
                "soulsMiscOot":   0x7F3,
                "soulsMiscMm":    0x7F4,
            }

            for name, off in sorted(offsets_to_check.items(), key=lambda x: x[1]):
                if off + 8 <= len(shared_data):
                    chunk = shared_data[off:off+8]
                    hex_str = ' '.join(f'{b:02x}' for b in chunk)
                    print(f"\n  {name} @ 0x{off:04X} ({off}): {hex_str}")
                    # Show bit interpretation
                    for i, b in enumerate(chunk):
                        bits = ''.join('1' if (b & (1 << j)) else '0' for j in range(8))
                        print(f"    byte[{i}] = 0x{b:02x}  bits(LE): {bits}")

            # Also check the whole range from coins through souls
            print("\n" + "="*60)
            print("  FULL SHARED SAVE DUMP (0x7C0 - 0x860)")
            print("="*60)
            dump_start = 0x7C0
            dump_end = min(0x860, shared_size)
            print(hexdump(shared_data, offset=dump_start, length=dump_end - dump_start))

            # Find the notes array
            print("\n" + "="*60)
            print("  LOOKING FOR NOTES ARRAY (38 bytes = 0x26)")
            print("="*60)
            # The notes array should have recognizable patterns
            # In the snapshot, song_notes starts at 0x8044bd6d
            # That's 0x8044bd6d - 0x8044b520 = 0x84D
            notes_offset = 0x84D
            if notes_offset + 38 <= len(shared_data):
                notes_chunk = shared_data[notes_offset:notes_offset + 38]
                print(f"\n  Notes @ 0x{notes_offset:04X}:")
                for i in range(0, 38, 8):
                    sub = notes_chunk[i:i+8]
                    hex_str = ' '.join(f'{b:02x}' for b in sub)
                    print(f"    [{i:3d}..{i+7:3d}]: {hex_str}")
            else:
                print(f"  WARNING: notes_offset 0x{notes_offset:X} exceeds shared_size 0x{shared_size:X}")

            # Check the traps array (should be 7 bytes before notes)
            traps_offset = notes_offset - 7  # 0x846
            print(f"\n  Traps @ 0x{traps_offset:04X}:")
            if traps_offset + 7 <= len(shared_data):
                traps_chunk = shared_data[traps_offset:traps_offset + 7]
                print(f"    {' '.join(f'{b:02x}' for b in traps_chunk)}")

            # Check progressiveFlags (bitfield) - should be right before traps
            # progressiveFlags offset from generate_inventory_slots.py = 0x845
            prog_offset = 0x845
            print(f"\n  progressiveFlags @ 0x{prog_offset:04X}: 0x{shared_data[prog_offset]:02x}")

            # Also dump around caughtFishFlags area
            print("\n" + "="*60)
            print("  FISH FLAGS & RESPAWN AREA (0x810 - 0x850)")
            print("="*60)
            print(hexdump(shared_data, offset=0x810, length=0x40))

            # Verify the foreign save (gMmSave) contains expected data
            print("\n" + "="*60)
            print("  FOREIGN SAVE (gMmSave) HEADER")
            print("="*60)
            foreign_data = payload[foreign_offset:foreign_offset + 0x3CA0]
            # First 16 bytes: entrance(4), equippedMask(1), isFirstCycle(1), unk_006(1), linkAge(1), cutscene(4), time(2), owlLocation(2)
            print(f"  entrance:     {int.from_bytes(foreign_data[0:4], 'big')}")
            print(f"  equippedMask: {foreign_data[4]}")
            print(f"  isFirstCycle: {foreign_data[5]}")
            print(f"  linkAge:      {foreign_data[7]}")
            print(f"  cutscene:     {int.from_bytes(foreign_data[8:12], 'big')}")
            time_val = int.from_bytes(foreign_data[12:14], 'big')
            print(f"  time:         0x{time_val:04X}")
            owl = int.from_bytes(foreign_data[14:16], 'big')
            print(f"  owlLocation:  0x{owl:04X}")
            isNight = int.from_bytes(foreign_data[18:22], 'big')
            print(f"  isNight:      {isNight}")
            day = int.from_bytes(foreign_data[26:30], 'big')
            print(f"  day:          {day}")
            playerForm = foreign_data[30]
            print(f"  playerForm:   {playerForm}")

            # Now verify the snapshot's actual soul data is correct
            # The snapshot gave us specific addresses for each bitmap
            # Let's verify those match what we see at the struct offsets

            print("\n" + "="*60)
            print("  CROSS-CHECK: Snapshot bitmap addresses vs struct offsets")
            print("="*60)
            # From the snapshot attachment:
            snapshot_addrs = {
                "soulsEnemyOot":  0x8044bcec,
                "soulsEnemyMm":   0x8044bcf4,
                "soulsBossOot":   0x8044bcfc,
                "soulsBossMm":    0x8044bcfe,
                "soulsNpcOot":    0x8044bcff,
                "soulsNpcMm":     0x8044bd07,
                "soulsAnimalOot": 0x8044bd0f,
                "soulsAnimalMm":  0x8044bd11,
                "soulsMiscOot":   0x8044bd13,
                "soulsMiscMm":    0x8044bd14,
            }
            for name, addr in sorted(snapshot_addrs.items(), key=lambda x: x[1]):
                offset_in_shared = addr - gSharedCustomSave_addr
                payload_offset = addr - payload_base
                expected = offsets_to_check.get(name)
                match = "✓" if expected is not None and offset_in_shared == expected else "✗"
                print(f"  {name:20s} @ VRAM 0x{addr:08X} = offset 0x{offset_in_shared:04X} (expected 0x{expected:04X}) {match}")

            # Show snapshot data alongside live data
            print("\n" + "="*60)
            print("  SOUL BITMAP DATA (LIVE) vs (SNAPSHOT)")
            print("="*60)
            snapshot_data = {
                "soulsEnemyMm":   bytes([0x00,0x00,0x00,0x00,0xff,0xff,0xff,0xff]),
                "soulsEnemyOot":  bytes([0x00]*8),
                "soulsNpcMm":     bytes([0x00,0x00,0x00,0x00,0x00,0xff,0xff,0xff]),
                "soulsNpcOot":    bytes([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08]),
                "soulsBossMm":    bytes([0x00]),
                "soulsBossOot":   bytes([0x00, 0x00]),
                "soulsAnimalMm":  bytes([0xff, 0xff]),
                "soulsAnimalOot": bytes([0xff, 0xff]),
                "soulsMiscMm":    bytes([0xff]),
                "soulsMiscOot":   bytes([0xff]),
            }
            for name, off in sorted(offsets_to_check.items(), key=lambda x: x[1]):
                size = 8
                live_data = shared_data[off:off+size]
                snap_data = snapshot_data.get(name, b'')
                if len(snap_data) != 8:
                    snap_data = snap_data + b'\x00' * (8 - len(snap_data))
                live_hex = ' '.join(f'{b:02x}' for b in live_data)
                snap_hex = ' '.join(f'{b:02x}' for b in snap_data)
                match = "✓" if live_data == snap_data else "✗ DIFFERS"
                print(f"\n  {name} @ 0x{off:04X}:")
                print(f"    Live:     {live_hex}")
                print(f"    Snapshot: {snap_hex}")
                print(f"    Match: {match}")

        # MM payload analysis
        if game == "MM" and "mm_payload" in chunks:
            payload = decode_b64(chunks["mm_payload"]["data"])
            mm_payload_base = 0x80720000
            mm_shared_addr = 0x8076bc40
            mm_foreign_addr = 0x8076c4d0

            mm_shared_offset = mm_shared_addr - mm_payload_base
            mm_foreign_offset = mm_foreign_addr - mm_payload_base
            mm_shared_size = mm_foreign_offset - mm_shared_offset

            print(f"\n  MM gSharedCustomSave: 0x{mm_shared_addr:08X} (payload+0x{mm_shared_offset:X})")
            print(f"  MM gOotSave:          0x{mm_foreign_addr:08X} (payload+0x{mm_foreign_offset:X})")
            print(f"  MM Shared size:       0x{mm_shared_size:X} ({mm_shared_size} bytes)")

            mm_shared = payload[mm_shared_offset:mm_shared_offset + mm_shared_size]

            print("\n  MM SOUL BITMAP DATA:")
            for name, off in sorted(offsets_to_check.items(), key=lambda x: x[1]):
                if off + 1 <= len(mm_shared):
                    chunk = mm_shared[off:off+8]
                    hex_str = ' '.join(f'{b:02x}' for b in chunk)
                    print(f"    {name} @ 0x{off:04X}: {hex_str}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/full-save-dump.json"
    analyze_dump(path)
