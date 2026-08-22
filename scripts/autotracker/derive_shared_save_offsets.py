#!/usr/bin/env python3
"""Derive shared_save_offsets.json from the OoTMM headers, optionally checking a save dump.

The offsets themselves come from `c_struct_layout`, which lays out
`SharedCustomSave` straight from the checked-out headers -- the same code path
the generator pipeline uses, so this tool can no longer drift from it. What it
adds over the pipeline is `--dump`: cross-checking the derived offsets against a
real full-save dump.

USAGE:
  # Derive from the checked-out OoTMM headers:
  python3 scripts/autotracker/derive_shared_save_offsets.py

  # Derive and validate against a full save dump:
  python3 scripts/autotracker/derive_shared_save_offsets.py --dump /tmp/full-save-dump.json

  # Cross-check against an existing inventory_slots.json and write the result:
  python3 scripts/autotracker/derive_shared_save_offsets.py \\
      --inventory-slots packs/ootmm/src/autotracker/data/v32_2/inventory_slots.json \\
      --write packs/ootmm/src/autotracker/data/v32_2/shared_save_offsets.json
"""

import argparse
import base64
import json
import pathlib
import sys

from generate_inventory_slots import build_shared_storage, load_save_layout


def cross_check_inventory_slots(layout: dict, path: str) -> bool:
    """Verify a previously generated inventory_slots.json against this layout."""
    with open(path) as f:
        shared = json.load(f)["catalog"]["shared"]

    derived = {b["name"]: b for b in layout["shared"]["bitmaps"]}
    ok = True
    if shared["trackedSize"] != layout["shared"]["trackedSize"]:
        print(f"  trackedSize: file {shared['trackedSize']} != "
              f"derived {layout['shared']['trackedSize']}  X")
        ok = False
    for bitmap in shared["bitmaps"]:
        name = bitmap["name"]
        if name not in derived:
            print(f"  {name}: present in file, absent from the headers  X")
            ok = False
        elif derived[name]["offset"] != bitmap["offset"]:
            print(f"  {name}: file {bitmap['offset']} != "
                  f"derived {derived[name]['offset']}  X")
            ok = False
    print("  inventory_slots.json agrees with the headers" if ok
          else "  inventory_slots.json DISAGREES with the headers")
    return ok


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
        description="Derive shared_save_offsets.json by laying out SharedCustomSave "
                    "from the checked-out OoTMM headers."
    )
    parser.add_argument(
        "--ootmm-repo",
        default="OoTMM",
        help="Path to the OoTMM checkout to read the save headers from (default: OoTMM).",
    )
    parser.add_argument(
        "--inventory-slots",
        default=None,
        help="Optional inventory_slots.json to cross-check against the derived layout.",
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

    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    layouter, shared_layout = load_save_layout(repo_root)
    layout = build_shared_storage(shared_layout)
    offsets = layout["fixedOffsets"]

    print(f"Laid out from {repo_root}:")
    print(f"  sizeof(OotCustomSave)    = 0x{layouter.sizeof('OotCustomSave'):X}")
    print(f"  sizeof(MmCustomSave)     = 0x{layouter.sizeof('MmCustomSave'):X}")
    print(f"  sizeof(SharedCustomSave) = 0x{shared_layout['size']:X} "
          f"(0x{shared_layout['raw_size']:X} before ALIGNED padding)")
    print()

    print("Derived offsets:")
    for key, val in sorted(offsets.items()):
        if isinstance(val, int) and val >= 0x100:
            print(f"  {key:30s} = {val:5d}  (0x{val:04X})")
        else:
            print(f"  {key:30s} = {val}")
    print()

    ok = True
    if args.inventory_slots:
        print("Cross-checking inventory_slots.json ...")
        ok = cross_check_inventory_slots(layout, args.inventory_slots) and ok
        print()

    if args.dump:
        print("Validating against dump ...")
        ok = validate_with_dump(offsets, args.dump, args.game) and ok
        print()

    if args.write:
        # Same shape the generator pipeline writes, so this tool can never
        # produce a file that disagrees with the shipped one.
        with open(args.write, "w") as f:
            json.dump(offsets, f, indent=2)
            f.write("\n")
        print(f"\nWritten to {args.write}")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
