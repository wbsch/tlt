#!/usr/bin/env python3
"""Verify OoT<->MM game-transition capture for garbage frames and constancy.

For a raw-capture JSONL of an OoT<->MM transition, this script:

  1. Lists every game switch and every frame whose save context is
     implausible (garbage) — the same plausibility rules the frontend parser
     applies (isPlausibleOotSave / isPlausibleMmSave).
  2. For each contiguous run of frames of the same game, checks that the
     item/location-relevant fields stay CONSTANT across the run.  Any
     fluctuation within a run would indicate garbage data being mixed into an
     otherwise-stable snapshot stream.
"""
import base64
import json
import sys

# OoT save-context offsets (from rawFrameParser.ts).
OOT_OFF_AGE = 0x04
OOT_OFF_SCENE_ID = 0x66
OOT_OFF_GOLD_TOKENS = 0x0D0
OOT_OFF_PERM = 0x0D4
OOT_PERM_ENTRY_SIZE = 0x1C
OOT_PERM_COUNT = 124
OOT_OFF_INV_ITEMS = 0x74
OOT_ITEM_SLOT_COUNT = 24

# MM save-context offsets (from rawFrameParser.ts).
MM_OFF_PLAYER_FORM = 0x20
MM_OFF_DAY = 0x18
MM_OFF_EQUIPMENT = 0x6C
MM_OFF_PERM_SCENES = 0x0F8
MM_PERM_ENTRY_SIZE = 0x1C
MM_PERM_COUNT = 120
MM_CTX_OFF_CYCLE_FLAGS = 0x3F68
MM_CYCLE_FLAGS_SIZE = MM_PERM_COUNT * 0x14
MM_OFF_INV_ITEMS = 0x70
MM_ITEM_SLOT_COUNT = 48


def u16(buf, off):
    return (buf[off] << 8) | buf[off + 1]


def u32(buf, off):
    return (
        (buf[off] << 24)
        | (buf[off + 1] << 16)
        | (buf[off + 2] << 8)
        | buf[off + 3]
    ) & 0xFFFFFFFF


def region_nonzero(buf, start, length):
    for i in range(start, min(start + length, len(buf))):
        if buf[i] != 0:
            return True
    return False


def load(path):
    frames = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    return frames


def save_chunk(frame):
    for chunk in frame.get("chunks", []):
        if chunk["name"].endswith("save_ctx"):
            return base64.b64decode(chunk["data"])
    return None


def oot_plausible(sc):
    age = u32(sc, OOT_OFF_AGE)
    scene = u16(sc, OOT_OFF_SCENE_ID)
    gold = u16(sc, OOT_OFF_GOLD_TOKENS)
    perm_nz = region_nonzero(sc, OOT_OFF_PERM, OOT_PERM_COUNT * OOT_PERM_ENTRY_SIZE)
    return age <= 1 and scene < OOT_PERM_COUNT and gold <= 100 and perm_nz


def mm_plausible(sc):
    pf = sc[MM_OFF_PLAYER_FORM]
    day = u32(sc, MM_OFF_DAY)
    return pf <= 4 and day <= 4


def oot_item_loc_fingerprint(sc):
    """Tuple of item/location-relevant fields for OoT."""
    inv = tuple(sc[OOT_OFF_INV_ITEMS : OOT_OFF_INV_ITEMS + OOT_ITEM_SLOT_COUNT])
    perm = tuple(
        sc[OOT_OFF_PERM + i * OOT_PERM_ENTRY_SIZE : OOT_OFF_PERM + (i + 1) * OOT_PERM_ENTRY_SIZE]
        for i in range(OOT_PERM_COUNT)
    )
    return (inv, perm)


def mm_item_loc_fingerprint(sc):
    """Tuple of item/location-relevant fields for MM."""
    inv = tuple(sc[MM_OFF_INV_ITEMS : MM_OFF_INV_ITEMS + MM_ITEM_SLOT_COUNT])
    perm = tuple(
        sc[MM_OFF_PERM_SCENES + i * MM_PERM_ENTRY_SIZE : MM_OFF_PERM_SCENES + (i + 1) * MM_PERM_ENTRY_SIZE]
        for i in range(MM_PERM_COUNT)
    )
    cycle = tuple(
        sc[MM_CTX_OFF_CYCLE_FLAGS + i * 0x14 : MM_CTX_OFF_CYCLE_FLAGS + (i + 1) * 0x14]
        for i in range(MM_PERM_COUNT)
    )
    return (inv, perm, cycle)


def main(path):
    frames = load(path)
    t0 = frames[0]["recvMs"] if frames else 0

    print(f"total frames: {len(frames)}")
    print()

    # 1) Game switches + garbage frames
    print("=" * 90)
    print("1) GAME SWITCHES AND GARBAGE (implausible) FRAMES")
    print("=" * 90)
    prev_game = None
    switches = 0
    garbage = []
    for fr in frames:
        game = fr["game"]
        seq = fr["sequence"]
        sc = save_chunk(fr)
        plausible = True
        if sc is not None:
            plausible = oot_plausible(sc) if game == "OoT" else mm_plausible(sc)
        is_switch = prev_game is not None and prev_game != game
        if is_switch:
            switches += 1
            print(f"  GAME SWITCH #{switches}: {prev_game} -> {game} at seq {seq} "
                  f"(t={(fr['recvMs']-t0)/1000:.3f}s)")
        if not plausible:
            garbage.append(fr)
            print(f"  GARBAGE frame: seq {seq} game={game} "
                  f"(t={(fr['recvMs']-t0)/1000:.3f}s)  PLAUS=False")
        prev_game = game

    print(f"\n  total game switches: {switches}")
    print(f"  total garbage frames: {len(garbage)}")

    # 2) Constancy of item/location fields within each same-game run
    print()
    print("=" * 90)
    print("2) ITEM/LOCATION FIELD CONSTANCY WITHIN EACH SAME-GAME RUN")
    print("=" * 90)
    print("   (a run = contiguous frames of the same game; a change in the")
    print("    item/location fingerprint within a run indicates garbage)")
    print()

    runs = []
    cur_game = None
    cur = []
    for fr in frames:
        game = fr["game"]
        if game != cur_game:
            if cur:
                runs.append((cur_game, cur))
            cur_game = game
            cur = [fr]
        else:
            cur.append(fr)
    if cur:
        runs.append((cur_game, cur))

    all_const = True
    for game, run in runs:
        fps = []
        for fr in run:
            sc = save_chunk(fr)
            if sc is None:
                fps.append(None)
            else:
                fps.append(
                    oot_item_loc_fingerprint(sc)
                    if game == "OoT"
                    else mm_item_loc_fingerprint(sc)
                )
        # Compare only plausible frames' fingerprints.
        distinct = set()
        for fp in fps:
            if fp is not None:
                distinct.add(fp)
        const = len(distinct) <= 1
        all_const = all_const and const
        print(f"  Run: {game}  frames={len(run)}  seq {run[0]['sequence']}..{run[-1]['sequence']}  "
              f"distinct item/loc fingerprints={len(distinct)}  {'CONSTANT' if const else 'VARIED!'}")

    print()
    print("=" * 90)
    print(f"OVERALL: item/location fields {'CONSTANT within every run' if all_const else 'VARIED within some run'}")
    print("=" * 90)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "raw-capture-2026-08-21T11-06-40-911Z.jsonl"
    main(path)
