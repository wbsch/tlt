#!/usr/bin/env python3
#this script uses hard coded offsets, is shit and should be rewritten
"""
Derive shared_save_offsets.json from OoTMM struct layout or from a full save dump.

USAGE:
  # Derive from inventory_slots.json (bitmap offsets as anchors) + struct layout:
  python3 scripts/autotracker/derive_shared_save_offsets.py \\
      packs/ootmm/src/autotracker/data/v31_1/inventory_slots.json

  # Derive and validate against a full save dump:
  python3 scripts/autotracker/derive_shared_save_offsets.py \\
      packs/ootmm/src/autotracker/data/v31_1/inventory_slots.json \\
      --dump /tmp/full-save-dump.json

  # Write output to file:
  python3 scripts/autotracker/derive_shared_save_offsets.py \\
      packs/ootmm/src/autotracker/data/v31_1/inventory_slots.json \\
      --write packs/ootmm/src/autotracker/data/v31_1/shared_save_offsets.json
"""

import argparse
import base64
import json
import sys


# ── Struct layout constants (from OoTMM C headers) ──────────────────────

# XFLAGS_COUNT_MM varies per version; it is read from the inventory_slots.json
# xflagsMm bitmap size (see extract_anchors) instead of being hardcoded.

# SharedCustomSave layout (from save.h):
#
#   OotCustomSave oot;              // sizeof(OotCustomSave) = xflagsMm offset
#   MmCustomSave mm;                // sizeof = soulsEnemyOot - ootSize - 0x2C
#   s16 netGiSkip[16];              // 32 = 0x20
#   u16 coins[4];                   // 8
#   u16 ocarinaButtonMaskOot;       // 2
#   u16 ocarinaButtonMaskMm;        // 2
#   u8  soulsEnemyOot[8];           // 8   ← anchor
#   u8  soulsEnemyMm[8];            // 8
#   u8  soulsBossOot[2];            // 2
#   u8  soulsBossMm[1];             // 1
#   u8  soulsNpcOot[8];             // 8
#   u8  soulsNpcMm[8];              // 8
#   u8  soulsAnimalsOot[2];         // 2
#   u8  soulsAnimalsMm[2];          // 2
#   u8  soulsMiscOot[1];            // 1
#   u8  soulsMiscMm[1];             // 1   ← anchor
#   u8  caughtChildFishWeight[20];  // 20
#   u8  caughtAdultFishWeight[20];  // 20
#   u8  caughtFishFlags[5];         // 5
#   RespawnData respawn[1];         // 32 (= 0x20, from mm/save.h)
#   u8  bitfields[2];              // 2  (13 bits of u8 bitfields)
#   u8  traps[7];                  // 7  (TRAP_MAX = 0x07)
#   u8  notes[38];                 // 38 (NOTES_MAX = 0x26)
#   u8  rustyKeysOot[...];         // 4
#   u8  rustyKeysMm[...];          // 5

PRESOULS_SIZE = 0x2C  # netGiSkip[16] + coins[4] + masks[2] + masks[2]
RESPAWN_SIZE = 0x20    # RespawnData (mm/save.h)
BITFIELD_SIZE = 2      # 13 bits packed in 2 bytes
TRAPS_SIZE = 7         # TRAP_MAX = 0x07
NOTES_SIZE = 38        # NOTES_MAX = 0x26
RUSTY_KEYS_OOT_SIZE = 4
RUSTY_KEYS_MM_SIZE = 5


def load_inventory_slots(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def extract_anchors(slots: dict) -> dict:
    """Extract key bitmap offsets from inventory_slots.json."""
    shared = slots["catalog"]["shared"]
    bitmaps = {bm["name"]: bm for bm in shared["bitmaps"]}
    return {
        "xflagsOotSize": bitmaps["xflagsOot"]["size"],
        "xflagsMm": bitmaps["xflagsMm"]["offset"],
        "xflagsMmSize": bitmaps["xflagsMm"]["size"],
        "soulsEnemyOot": bitmaps["soulsEnemyOot"]["offset"],
        "soulsMiscMm": bitmaps["soulsMiscMm"]["offset"],
        "trackedSize": shared["trackedSize"],
    }


def compute_offsets(anchors: dict) -> dict:
    """Compute all fixed offsets from bitmap anchors + struct layout."""
    xflags_oot_size = anchors["xflagsOotSize"]
    oot_size = anchors["xflagsMm"]          # sizeof(OotCustomSave)
    mm_size = (anchors["soulsEnemyOot"]      # soulsEnemyOot
               - oot_size - PRESOULS_SIZE)    # minus OotCustomSave minus pre-soul fields
    half_days = oot_size + anchors["xflagsMmSize"] + 32 + 4  # xflagsMm + npcMm[32] + shopsMm[4]

    coins = oot_size + mm_size + 0x20       # after both custom saves + netGiSkip[16]
    mask_oot = coins + 8                     # after coins[4]
    mask_mm = mask_oot + 2                   # after mask_oot

    souls_misc_mm = anchors["soulsMiscMm"]
    child_fish = souls_misc_mm + 1
    adult_fish = child_fish + 20
    fish_flags = adult_fish + 20

    # RespawnData starts after fish_flags[5]; needs 4-byte alignment on MIPS
    respawn = fish_flags + 5
    respawn = (respawn + 3) & ~3  # align to 4-byte boundary
    bitfields = respawn + RESPAWN_SIZE
    traps = bitfields + BITFIELD_SIZE
    notes = traps + TRAPS_SIZE
    rusty_keys = notes + NOTES_SIZE

    shared_size = max(
        anchors["trackedSize"],
        rusty_keys + RUSTY_KEYS_OOT_SIZE + RUSTY_KEYS_MM_SIZE,
        notes + NOTES_SIZE,
        bitfields + BITFIELD_SIZE + 1,  # bombchuBagFlagsOffset + 1
    )

    # song flag offsets within each custom save
    # OotCustomSave: xflags[n] + npc[32] + shops[8] + scrubs[8] + sr[16]
    #   + fwRespawnDungeonEntrance[2] (28 each) + powderKegTimer(2) -> bitfields
    # fwRespawnDungeonEntrance has u32 members => 4-byte alignment on N64.
    # Account for alignment padding before the array.
    fw_respawn_offset = xflags_oot_size + 32 + 8 + 8 + 16
    if fw_respawn_offset % 4:
        fw_respawn_offset += 4 - (fw_respawn_offset % 4)
    song_flags_oot = fw_respawn_offset + 2 * 28 + 2
    # MmCustomSave: halfDays(1) + padding(1 for 4-byte align) + 3*RespawnData arrays(3*64)
    song_flags_mm = (half_days + 1 + 3) & ~3  # round past halfDays to 4-byte boundary
    song_flags_mm += 3 * 64  # fw[2] + fwRespawnTop[2] + fwRespawnDungeonEntrance[2]

    return {
        "sharedCustomSaveSize": shared_size,
        "halfDaysOffset": half_days,
        "coinsOffset": coins,
        "ocarinaButtonMaskOotOffset": mask_oot,
        "ocarinaButtonMaskMmOffset": mask_mm,
        "caughtChildFishWeightOffset": child_fish,
        "caughtAdultFishWeightOffset": adult_fish,
        "caughtFishWeightCount": 20,
        "songNotesOffset": notes,
        "songNoteCount": NOTES_SIZE,
        "rustyKeysOffset": rusty_keys,
        "rustyKeysOotSize": RUSTY_KEYS_OOT_SIZE,
        "rustyKeysMmSize": RUSTY_KEYS_MM_SIZE,
        "songFlagsOotOffset": song_flags_oot,
        "songFlagsMmOffset": song_flags_mm,
        "bombchuBagFlagsOffset": bitfields,
    }


def validate_with_dump(offsets: dict, dump_path: str, game: str = "OoT") -> bool:
    """Cross-check computed offsets against a full save dump."""
    with open(dump_path) as f:
        dump = json.load(f)

    messages = dump.get("messages", [])
    for msg in messages:
        if msg["game"] != game:
            continue
        chunks = {c["name"]: c for c in msg.get("chunks", [])}
        if "oot_payload" not in chunks:
            continue

        payload = base64.b64decode(chunks["oot_payload"]["data"])

        # gSharedCustomSave address is version-dependent – auto-discover from live_addrs.json
        import os as _os2
        script_dir = _os2.path.dirname(_os2.path.abspath(__file__))
        repo_root = _os2.path.normpath(_os2.path.join(script_dir, "..", ".."))
        data_dir = _os2.path.join(repo_root, "packs", "ootmm", "src", "autotracker", "data")
        candidates = sorted(
            (entry, _os2.path.join(data_dir, entry, "live_addrs.json"))
            for entry in _os2.listdir(data_dir)
            if _os2.path.isfile(_os2.path.join(data_dir, entry, "live_addrs.json"))
        )
        if not candidates:
            print("Warning: no live_addrs.json found, falling back to hardcoded address")
            gSharedCustomSave = 0x8044B520
        else:
            with open(candidates[-1][1]) as _f2:
                _la = json.load(_f2)
            gSharedCustomSave = int(_la["oot"]["sharedCustomSaveLive"], 16)
        payload_base = 0x80400000
        shared_off = gSharedCustomSave - payload_base
        shared = payload[shared_off:shared_off + offsets["sharedCustomSaveSize"]]

        ok = True
        checks = {
            "coins": (
                offsets["coinsOffset"], 8,
                "first two coins should be non-negative u16 values",
            ),
            "ocarinaButtonMaskOot": (
                offsets["ocarinaButtonMaskOotOffset"], 2,
                "should be valid button mask (0 or 0xffff)",
            ),
            "notes": (
                offsets["songNotesOffset"], offsets["songNoteCount"],
                "each note byte should be 0..max_notes (typically 6)",
            ),
        }

        for name, (off, size, desc) in checks.items():
            chunk = shared[off:off + min(size, 8)]
            hex_str = " ".join(f"{b:02x}" for b in chunk)
            # Check notes have reasonable values
            if name == "notes" and size >= 38:
                all_ok = all(b <= 6 for b in shared[off:off + size])
                status = "✓" if all_ok else "✗ (values > 6)"
                print(f"  {name} @ 0x{off:04X}: {hex_str}... {status}  ({desc})")
                if not all_ok:
                    ok = False
            else:
                print(f"  {name} @ 0x{off:04X}: {hex_str}  ({desc})")

        print(f"\n  Song note bytes: {list(shared[offsets['songNotesOffset']:offsets['songNotesOffset']+38])}")
        print(f"  OoT Saria (index 8): {shared[offsets['songNotesOffset'] + 8]}")
        print(f"  MM Time (index 24): {shared[offsets['songNotesOffset'] + 24]}")

        if ok:
            print("\n  All validations passed ✓")
        else:
            print("\n  Some validations failed ✗")
        return ok

    print(f"  No {game} data found in dump")
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Derive shared_save_offsets.json from bitmap offsets and struct layout."
    )
    parser.add_argument(
        "inventory_slots",
        help="Path to inventory_slots.json (provides bitmap offsets as anchors).",
    )
    parser.add_argument(
        "--dump",
        default=None,
        help="Path to a full-save-dump.json for cross-validation.",
    )
    parser.add_argument(
        "--write",
        default=None,
        help="Write the derived offsets to this JSON file.",
    )
    parser.add_argument(
        "--game",
        default="OoT",
        help="Which game's payload to use for dump validation (default: OoT).",
    )
    args = parser.parse_args()

    slots = load_inventory_slots(args.inventory_slots)
    anchors = extract_anchors(slots)
    offsets = compute_offsets(anchors)

    print("Anchor values:")
    print(f"  xflagsOot    = {anchors['xflagsOotSize']} bytes")
    print(f"  xflagsMm     = 0x{anchors['xflagsMm']:04X}  (sizeof OotCustomSave)")
    print(f"  soulsEnemyOot = 0x{anchors['soulsEnemyOot']:04X}")
    print(f"  soulsMiscMm  = 0x{anchors['soulsMiscMm']:04X}")
    oot_size = anchors["xflagsMm"]
    mm_size = anchors["soulsEnemyOot"] - oot_size - PRESOULS_SIZE
    print(f"  → sizeof(MmCustomSave) = 0x{mm_size:X} ({mm_size})")
    print()

    print("Derived offsets:")
    for key, val in sorted(offsets.items()):
        if isinstance(val, int) and val >= 0x100:
            print(f"  {key:30s} = {val:5d}  (0x{val:04X})")
        else:
            print(f"  {key:30s} = {val}")
    print()

    if args.dump:
        print("Validating against dump ...")
        validate_with_dump(offsets, args.dump, args.game)

    if args.write:
        output = {
            "schemaVersion": 1,
            "derivedFrom": {
                "method": "struct-layout-from-bitmap-anchors",
                "source": args.inventory_slots,
            },
            **offsets,
        }
        with open(args.write, "w") as f:
            json.dump(output, f, indent=2)
            f.write("\n")
        print(f"\nWritten to {args.write}")


if __name__ == "__main__":
    main()
