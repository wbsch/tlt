#!/usr/bin/env python3
"""Check stability of item/location byte regions across a raw-capture JSONL.

For every consecutive same-game run of frames, this script:

  * extracts the save-context chunk (`oot_save_ctx` / `mm_save_ctx`) and the
    live play-state flags chunk (`oot_playstate_flags` / `mm_playstate_flags`),
  * reports which byte offsets change *anywhere* within the run (full-chunk
    diff),
  * verifies that the offsets the parser reads for ITEMS and LOCATIONS are
    byte-stable (i.e. none of the changing offsets fall inside those regions),
    and
  * reports which shared custom-save slices (`*_shared_custom_save_*`) change
    anywhere within the run.

Offsets mirror rawFrameParser.ts:
  OOT_OFF_INV_ITEMS=0x74, OOT_OFF_PERM=0xd4 (124*0x1c), GS=0xe9c,
  events chk/item/misc=0xed4/0xef0/0xef8
  MM_OFF_EQUIPMENT=0x6c, MM_OFF_INV_ITEMS=0x70, MM_OFF_PERM_SCENES=0xf8
  (120*0x1c), MM_OFF_SKULL_*=0xec0, MM_OFF_WEEK_EVENT_REG=0xef8,
  MM_CTX_OFF_CYCLE_FLAGS=0x3f68 (120*0x14)
"""
import base64
import json
import sys
from collections import defaultdict

OOT_PERM_COUNT = 124
OOT_PERM_ENTRY = 0x1C
MM_PERM_COUNT = 120
MM_PERM_ENTRY = 0x1C

# (start, end_exclusive, label) regions of interest for OoT.
OOT_ITEM_RANGES = [
    (0x74, 0x74 + 24, "inv_items"),
    (0x8C, 0x8C + 15, "inv_ammo"),
    (0x9B, 0x9C, "beans"),
    (0x9C, 0x9E, "equipment"),
    (0xA0, 0xA4, "upgrades"),
    (0xA4, 0xA8, "quest_items"),
    (0xA8, 0xA8 + 20, "dungeon_items"),
    (0xBC, 0xBC + 19, "dungeon_keys"),
    (0xD0, 0xD2, "gold_tokens"),
]
OOT_LOC_RANGES = [
    (0xD4, 0xD4 + OOT_PERM_COUNT * OOT_PERM_ENTRY, "perm_scene_flags"),
    (0xE9C, 0xE9C + 6 * 4, "gs_flags"),
    (0xED4, 0xED4 + 14 * 2, "events_chk"),
    (0xEF0, 0xEF0 + 4 * 2, "events_item"),
    (0xEF8, 0xEF8 + 30 * 2, "events_misc"),
]

# (start, end_exclusive, label) regions of interest for MM.
MM_ITEM_RANGES = [
    (0x6C, 0x6E, "equipment"),
    (0x70, 0x70 + 48, "inv_items"),
    (0xA0, 0xA0 + 24, "inv_ammo"),
    (0xB8, 0xBC, "upgrades"),
    (0xBC, 0xC0, "quest_items"),
    (0xC0, 0xC0 + 10, "dungeon_items"),
    (0xCA, 0xCA + 9, "dungeon_keys"),
    (0xD4, 0xD4 + 10, "stray_fairies"),
]
MM_LOC_RANGES = [
    (0xF8, 0xF8 + MM_PERM_COUNT * MM_PERM_ENTRY, "perm_scene_flags"),
    (0xEC0, 0xEC2, "skull_swamp"),
    (0xEC2, 0xEC4, "skull_ocean"),
    (0xEF8, 0xEF8 + 100, "week_event_reg"),
    (0x3F68, 0x3F68 + MM_PERM_COUNT * 0x14, "cycle_flags"),
]

VOLATILE_LABELS = {
    # (game, start) -> description of expected volatile field
    ("OoT", 0x66): "scene_id (save ctx)",
    ("OoT", 0x6A): "?",
    ("MM", 0x0C): "time",
    ("MM", 0x18): "day",
    ("MM", 0x20): "player_form",
}


def load(path):
    frames = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    return frames


def chunk(fr, name):
    for c in fr.get("chunks", []):
        if c["name"] == name:
            return base64.b64decode(c["data"])
    return None


def shared_chunks(fr, game):
    """Return {chunk_name: bytes} for all shared custom-save chunks of a game."""
    prefix = f"{game.lower()}_shared_custom_save_"
    out = {}
    for c in fr.get("chunks", []):
        if c["name"].startswith(prefix):
            out[c["name"]] = base64.b64decode(c["data"])
    return out


def changed_offsets(frames_bytes):
    """Return set of offsets that differ across any consecutive pair."""
    changed = set()
    for a, b in zip(frames_bytes, frames_bytes[1:]):
        if len(a) != len(b):
            n = min(len(a), len(b))
            for i in range(n):
                if a[i] != b[i]:
                    changed.add(i)
        else:
            for i in range(len(a)):
                if a[i] != b[i]:
                    changed.add(i)
    return changed


def describe_ranges(regions, changed):
    bad = []
    for start, end, label in regions:
        hits = sorted(i for i in changed if start <= i < end)
        if hits:
            bad.append((label, start, end, hits))
    return bad


def analyze(path):
    frames = load(path)
    print(f"=== {path}  ({len(frames)} frames) ===\n")

    runs = []
    cur = []
    for fr in frames:
        if cur and cur[-1]["game"] != fr["game"]:
            runs.append(cur)
            cur = []
        cur.append(fr)
    if cur:
        runs.append(cur)

    all_stable = True
    for run in runs:
        game = run[0]["game"]
        seqs = [f["sequence"] for f in run]
        save = [chunk(f, f"{game.lower()}_save_ctx") for f in run]
        flags = [chunk(f, f"{game.lower()}_playstate_flags") for f in run]

        tag = f"{game} seq {seqs[0]}..{seqs[-1]} ({len(run)} frames)"
        print(f"  [{tag}]")

        if any(s is None for s in save):
            print("    save_ctx chunk missing!")
            continue

        # Full save-ctx diff
        sc_changed = changed_offsets(save)
        print(
            f"    save_ctx changed offsets: "
            + (", ".join(f"0x{x:04X}" for x in sorted(sc_changed)) or "(none)")
        )

        if game == "OoT":
            item_regions, loc_regions = OOT_ITEM_RANGES, OOT_LOC_RANGES
        else:
            item_regions, loc_regions = MM_ITEM_RANGES, MM_LOC_RANGES

        item_bad = describe_ranges(item_regions, sc_changed)
        loc_bad = describe_ranges(loc_regions, sc_changed)

        # Live play-state flags diff
        fl_bad = None
        if any(f is not None for f in flags) and all(f is not None for f in flags):
            fl_changed = changed_offsets(flags)
            print(
                "    playstate_flags changed offsets: "
                + (
                    ", ".join(f"0x{x:04X}" for x in sorted(fl_changed))
                    or "(none)"
                )
            )
            if fl_changed:
                fl_bad = sorted(fl_changed)

        # Shared custom-save chunk stability. The shared state is recorded as
        # sparse slices (bitmaps + small tail ranges); report which slices
        # changed anywhere within the run.
        shared_by_name = defaultdict(list)
        for f in run:
            for name, data in shared_chunks(f, game).items():
                shared_by_name[name].append(data)

        shared_bad = []
        if shared_by_name:
            print("    shared custom-save chunks:")
            for name in sorted(shared_by_name):
                datas = shared_by_name[name]
                if len(datas) < 2:
                    print(f"      {name}: only {len(datas)} frame(s) present")
                    continue
                changed = changed_offsets(datas)
                if changed:
                    shared_bad.append((name, sorted(changed)))
                    print(
                        f"      {name}: changed at "
                        + ", ".join(f"0x{x:04X}" for x in sorted(changed))
                    )
                else:
                    print(f"      {name}: stable")

        status = []
        if item_bad:
            all_stable = False
            for label, s, e, hits in item_bad:
                status.append(f"ITEM {label} changed at {[hex(h) for h in hits]}")
        if loc_bad:
            all_stable = False
            for label, s, e, hits in loc_bad:
                status.append(f"LOC {label} changed at {[hex(h) for h in hits]}")
        if fl_bad:
            all_stable = False
            status.append(f"LIVE flags changed at {[hex(h) for h in fl_bad]}")
        if shared_bad:
            all_stable = False
            for name, hits in shared_bad:
                status.append(
                    f"SHARED {name} changed at {[hex(h) for h in hits]}"
                )

        if status:
            for s in status:
                print(f"    >>> UNSTABLE: {s}")
        else:
            print("    items/locations STABLE (no changes in read regions)")

    return all_stable


if __name__ == "__main__":
    paths = sys.argv[1:] or ["raw-capture.jsonl"]
    ok = True
    for p in paths:
        ok = analyze(p) and ok
    print("\nOVERALL:", "STABLE" if ok else "UNSTABLE regions detected")
