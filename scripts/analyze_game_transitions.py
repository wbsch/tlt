#!/usr/bin/env python3
"""Analyze game transitions (OoT <-> MM) in a raw-capture JSONL.

Complements analyze_raw_capture.py (which covers OoT *scene* transitions).
This script reports, for every frame:

  * the game, sequence and receive timestamp,
  * the wall-clock gap since the previous frame (a large gap is the
    emulator loading the other game), and
  * the plausibility of the active save context, using the SAME rules the
    frontend parser applies (isPlausibleOotSave / isPlausibleMmSave).

A game switch is marked whenever two consecutive frames carry a different
`game` field.  The plausibility columns let you spot "garbage" save data that
arrives right after a switch and would be rejected by the parser.
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

# MM save-context offsets (from rawFrameParser.ts).
MM_OFF_PLAYER_FORM = 0x20
MM_OFF_DAY = 0x18
MM_OFF_EQUIPMENT = 0x6C
MM_OFF_PERM_SCENES = 0x0F8
MM_PERM_ENTRY_SIZE = 0x1C
MM_PERM_COUNT = 120
MM_CTX_OFF_CYCLE_FLAGS = 0x3F68
MM_CYCLE_FLAGS_SIZE = MM_PERM_COUNT * 0x14


def u16(buf, off):
    return (buf[off] << 8) | buf[off + 1]


def u32(buf, off):
    return (
        (buf[off] << 24)
        | (buf[off + 1] << 16)
        | (buf[off + 2] << 8)
        | buf[off + 3]
    )


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


def describe_oot(sc):
    age = u32(sc, OOT_OFF_AGE)
    scene = u16(sc, OOT_OFF_SCENE_ID)
    gold = u16(sc, OOT_OFF_GOLD_TOKENS)
    perm_nz = region_nonzero(sc, OOT_OFF_PERM, OOT_PERM_COUNT * OOT_PERM_ENTRY_SIZE)
    plausible = age <= 1 and scene < OOT_PERM_COUNT and gold <= 100 and perm_nz
    return (
        f"age={age} scene={scene} gold={gold} permNZ={int(perm_nz)} "
        f"PLAUS={plausible}"
    )


def describe_mm(sc):
    pf = sc[MM_OFF_PLAYER_FORM]
    day = u32(sc, MM_OFF_DAY)
    eq = u16(sc, MM_OFF_EQUIPMENT)
    scene_nz = region_nonzero(sc, MM_OFF_PERM_SCENES, MM_PERM_COUNT * MM_PERM_ENTRY_SIZE)
    cycle_nz = region_nonzero(sc, MM_CTX_OFF_CYCLE_FLAGS, MM_CYCLE_FLAGS_SIZE)
    all_zero = (not eq) and (not scene_nz) and (not cycle_nz)
    plausible = pf <= 4 and day <= 4
    return (
        f"pf={pf} day={day} eq=0x{eq:04X} sceneNZ={int(scene_nz)} "
        f"cycleNZ={int(cycle_nz)} allZero={all_zero} PLAUS={plausible}"
    )


def describe_shared(shared):
    """Compact summary of the decoded shared custom-save state (if present)."""
    if not shared:
        return ""
    coins = shared.get("coins")
    coins_s = (
        ",".join(str(c) if c is not None else "?" for c in coins)
        if isinstance(coins, list)
        else "?"
    )
    ocarina_oot = shared.get("ocarinaButtonMaskOot")
    ocarina_mm = shared.get("ocarinaButtonMaskMm")
    return (
        f"shared[halfDays={shared.get('halfDays')} coins=[{coins_s}] "
        f"ocarinaOot=0x{ocarina_oot:04X}" if isinstance(ocarina_oot, int) else
        f"shared[halfDays={shared.get('halfDays')} coins=[{coins_s}] ocarinaOot=?"
    ) + (
        f" ocarinaMm=0x{ocarina_mm:04X}" if isinstance(ocarina_mm, int) else
        " ocarinaMm=?"
    ) + (
        f" extraSwordsOot={shared.get('extraSwordsOot')} "
        f"bombchuOot={shared.get('bombchuBagOot')} "
        f"bombchuMm={shared.get('bombchuBagMm')}]"
    )


def analyze(path):
    frames = load(path)
    if not frames:
        print("no frames")
        return

    print(f"total frames: {len(frames)}")
    print(
        f"{'seq':>4} {'game':<6} {'recvMs':>9} {'gapMs':>8}  save-plausibility"
    )
    print("-" * 80)

    prev_game = None
    prev_recv = None
    switches = 0
    for fr in frames:
        game = fr["game"]
        seq = fr["sequence"]
        recv = fr["recvMs"]
        gap = (recv - prev_recv) if prev_recv is not None else 0.0

        sc = save_chunk(fr)
        desc = ""
        if sc is not None:
            desc = describe_oot(sc) if game == "OoT" else describe_mm(sc)

        marker = ""
        if prev_game is not None and prev_game != game:
            marker = "  <<< GAME SWITCH"
            switches += 1

        print(
            f"{seq:>4} {game:<6} {recv:>9.1f} {gap:>8.1f}  {desc}{marker}"
        )
        shared = fr.get("decoded", {}).get("shared")
        if shared:
            print(f"      {describe_shared(shared)}")

        prev_game = game
        prev_recv = recv

    print("-" * 80)
    print(f"game switches detected: {switches}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "raw-capture.jsonl"
    analyze(path)
