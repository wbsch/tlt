#!/usr/bin/env python3
"""Analyze a raw-capture JSONL for scene-transition timing."""
import base64
import json
import sys
from collections import defaultdict

OOT_OFF_PERM = 0x0D4
OOT_PERM_ENTRY_SIZE = 0x1C  # chest@+0, switch0@+4, clearedRoom@+8, collect@+12


def u16(buf, off):
    return (buf[off] << 8) | buf[off + 1]


def u32(buf, off):
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) & 0xFFFFFFFF


def load(path):
    frames = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            frames.append(json.loads(line))
    return frames


def decode_chunks(frame):
    out = {}
    for c in frame.get("chunks", []):
        out[c["name"]] = base64.b64decode(c["data"])
    return out


def fmt_shared(shared):
    """Compact one-line summary of the decoded shared custom-save state."""
    if not shared:
        return ""
    coins = shared.get("coins")
    coins_s = (
        ",".join(str(c) if c is not None else "?" for c in coins)
        if isinstance(coins, list)
        else "?"
    )
    parts = [
        f"halfDays={shared.get('halfDays')}",
        f"coins=[{coins_s}]",
        f"ocarinaOot=0x{shared.get('ocarinaButtonMaskOot'):04X}"
        if isinstance(shared.get("ocarinaButtonMaskOot"), int)
        else "ocarinaOot=?",
        f"ocarinaMm=0x{shared.get('ocarinaButtonMaskMm'):04X}"
        if isinstance(shared.get("ocarinaButtonMaskMm"), int)
        else "ocarinaMm=?",
        f"extraSwordsOot={shared.get('extraSwordsOot')}",
        f"bombchuOot={shared.get('bombchuBagOot')}",
        f"bombchuMm={shared.get('bombchuBagMm')}",
    ]
    return "  shared: " + " ".join(parts)


def analyze(path):
    frames = load(path)
    oot_frames = []
    mm_frames = []
    for fr in frames:
        d = fr.get("decoded", {})
        if "oot" in d:
            oot_frames.append(fr)
        elif "mm" in d:
            mm_frames.append(fr)

    print(f"total frames: {len(frames)}  (OoT: {len(oot_frames)}, MM: {len(mm_frames)})")
    if not frames:
        return

    t0 = frames[0]["tsMs"]
    print(f"first frame wall-clock: {frames[0]['tsMs']}, last: {frames[-1]['tsMs']}, span: {(frames[-1]['tsMs'] - frames[0]['tsMs'])/1000:.2f}s")
    print()

    # Enrich OoT frames with permanent chest/collect flags for the live scene.
    for fr in oot_frames:
        chunks = decode_chunks(fr)
        d = fr["decoded"]["oot"]
        sc = chunks.get("oot_save_ctx")
        scene = d["liveScene"]
        perm = {"chest": None, "collect": None}
        if sc is not None and scene is not None:
            base = OOT_OFF_PERM + scene * OOT_PERM_ENTRY_SIZE
            if base + 16 <= len(sc):
                perm["chest"] = u32(sc, base)
                perm["collect"] = u32(sc, base + 12)
        fr["_perm"] = perm

    # 1) Scene changes
    print("=" * 90)
    print("1) SCENE CHANGES (liveScene transitions)")
    print("=" * 90)
    changes = []
    prev = None
    for fr in frames:
        d = fr.get("decoded", {})
        if "oot" not in d:
            continue
        scene = d["oot"]["liveScene"]
        if prev is not None and scene != prev:
            changes.append((fr, prev, scene))
        prev = scene

    if not changes:
        print("  (no liveScene change detected in OoT frames)")
    for fr, old, new in changes:
        d = fr["decoded"]["oot"]
        dt = (fr["tsMs"] - t0) / 1000
        print(f"  t={dt:7.3f}s  recvMs={fr['recvMs']:8.1f}  seq={fr['sequence']:4d}  "
              f"OoT liveScene {old} -> {new}  (saveScene={d['saveScene']}, room={d['room']}, "
              f"chest=0x{d['chest']:08X}, collect=0x{d['collect']:08X})")

    # 2) Per-scene-change: how long until chest flags matched the new scene.
    print()
    print("=" * 90)
    print("2) CHEST-FLAG SETTLE TIME after each scene change")
    print("=" * 90)
    print("   'settled' = first frame after the change where liveChest == the")
    print("   new scene's permanent chest flags from the save context (and, for")
    print("   collect, liveCollect == permanent collect flags).")
    print()

    # Build the OoT frame sequence in order (subset of frames).
    oot_order = [fr for fr in frames if "oot" in fr.get("decoded", {})]
    idx_by_seq = {fr["sequence"]: i for i, fr in enumerate(oot_order)}

    for fr, old, new in changes:
        d = fr["decoded"]["oot"]
        tchange = (fr["tsMs"] - t0) / 1000
        # stale value = the live chest at the first frame of the new scene
        stale_chest = d["chest"]
        stale_collect = d["collect"]
        # permanent expected flags for the new scene
        exp = fr["_perm"]
        # find this frame's position in oot_order
        pos = idx_by_seq.get(fr["sequence"])
        print(f"  Scene change -> {new} at t={tchange:.3f}s (recvMs={fr['recvMs']:.1f}, seq={fr['sequence']})")
        print(f"    first-frame live flags: chest=0x{stale_chest:08X} collect=0x{stale_collect:08X}")
        print(f"    new-scene permanent:    chest=0x{exp['chest']:08X} collect=0x{exp['collect']:08X}")

        settled = None
        first_flag_change = None
        if pos is not None:
            for j in range(pos + 1, len(oot_order)):
                frj = oot_order[j]
                dj = frj["decoded"]["oot"]
                # ignore frames that themselves belong to a later scene
                if dj["liveScene"] != new:
                    break
                if first_flag_change is None and (dj["chest"] != stale_chest or dj["collect"] != stale_collect):
                    first_flag_change = frj
                if exp["chest"] is not None:
                    if dj["chest"] == exp["chest"] and dj["collect"] == exp["collect"]:
                        settled = frj
                        break

        if settled is not None:
            ds = settled["decoded"]["oot"]
            dt = (settled["tsMs"] - t0) / 1000
            settle_ms = (settled["tsMs"] - fr["tsMs"])
            print(f"    SETTLED at t={dt:.3f}s  -> delay {settle_ms} ms "
                  f"(seq {settled['sequence']}, chest=0x{ds['chest']:08X}, collect=0x{ds['collect']:08X})")
        else:
            print(f"    NEVER settled within this scene visit (no later frame had matching permanent flags)")

        if first_flag_change is not None and first_flag_change is not settled:
            dfc = first_flag_change["decoded"]["oot"]
            dt = (first_flag_change["tsMs"] - t0) / 1000
            print(f"    first flag CHANGE at t={dt:.3f}s  (seq {first_flag_change['sequence']}, "
                  f"chest=0x{dfc['chest']:08X}, collect=0x{dfc['collect']:08X})")
        print()

    # 3) Frames sent between scene changes
    print("=" * 90)
    print("3) FRAMES SENT BETWEEN SCENE CHANGES (and their timestamps)")
    print("=" * 90)
    boundaries = [None] + [fr for fr, _, _ in changes] + [None]
    if len(changes) == 0:
        print(f"  no scene changes; {len(oot_order)} OoT frames total, all with same liveScene")
    for i in range(len(changes) + 1):
        start = boundaries[i]
        end = boundaries[i + 1]
        seg_start = None if start is None else idx_by_seq.get(start["sequence"])
        seg_end = None if end is None else idx_by_seq.get(end["sequence"])
        # slice of oot_order for this segment
        if seg_start is None:
            seg = oot_order[:seg_end]
        elif seg_end is None:
            seg = oot_order[seg_start:]
        else:
            seg = oot_order[seg_start:seg_end]
        if i == 0:
            label = f"before first scene change ({seg[0]['decoded']['oot']['liveScene'] if seg else '?'})"
        else:
            label = f"after change #{i} (scene {changes[i-1][2]})"
        print(f"\n  Segment {i}: {label} -> {len(seg)} OoT frames")
        for frj in seg:
            dj = frj["decoded"]["oot"]
            dt = (frj["tsMs"] - t0) / 1000
            print(f"    t={dt:7.3f}s recvMs={frj['recvMs']:8.1f} seq={frj['sequence']:4d} "
                  f"scene={dj['liveScene']:3d} room={dj['room']:3d} "
                  f"chest=0x{dj['chest']:08X} collect=0x{dj['collect']:08X} temp=0x{dj['tempCollect']:08X}")
            shared = frj.get("decoded", {}).get("shared")
            if shared:
                print(f"      {fmt_shared(shared)}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "raw-capture-2026-08-20T13-04-38-792Z.jsonl"
    analyze(path)
