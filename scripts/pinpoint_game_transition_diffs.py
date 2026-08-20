#!/usr/bin/env python3
"""Pinpoint which frames differ within each same-game run (garbage vs genuine)."""
import base64
import json
import sys

OOT_OFF_AGE = 0x04
OOT_OFF_SCENE_ID = 0x66
OOT_OFF_GOLD_TOKENS = 0x0D0
OOT_OFF_PERM = 0x0D4
OOT_PERM_ENTRY_SIZE = 0x1C
OOT_PERM_COUNT = 124
OOT_OFF_INV_ITEMS = 0x74
OOT_ITEM_SLOT_COUNT = 24

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


def oot_fp(sc):
    inv = tuple(sc[OOT_OFF_INV_ITEMS : OOT_OFF_INV_ITEMS + OOT_ITEM_SLOT_COUNT])
    perm = tuple(
        sc[OOT_OFF_PERM + i * OOT_PERM_ENTRY_SIZE : OOT_OFF_PERM + (i + 1) * OOT_PERM_ENTRY_SIZE]
        for i in range(OOT_PERM_COUNT)
    )
    return (inv, perm)


def mm_fp(sc):
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
    t0 = frames[0]["recvMs"]

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

    for game, run in runs:
        fps = []
        for fr in run:
            sc = save_chunk(fr)
            fps.append(None if sc is None else (oot_fp(sc) if game == "OoT" else mm_fp(sc)))
        # Find the dominant fingerprint among plausible frames.
        from collections import Counter
        plausible_fps = [fp for fp in fps if fp is not None]
        counts = Counter(plausible_fps)
        dominant = counts.most_common(1)[0][0]
        print(f"\nRun {game} seq {run[0]['sequence']}..{run[-1]['sequence']} "
              f"({len(run)} frames):")
        for fr, fp in zip(run, fps):
            sc = save_chunk(fr)
            plausible = True
            if sc is not None:
                plausible = oot_plausible(sc) if game == "OoT" else mm_plausible(sc)
            tag = "OK" if (fp is not None and fp == dominant) else "DIFF"
            print(f"  seq {fr['sequence']:5d} t={(fr['recvMs']-t0)/1000:8.3f}s "
                  f"plausible={plausible}  {tag}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "raw-capture-2026-08-21T11-06-40-911Z.jsonl"
    main(path)
