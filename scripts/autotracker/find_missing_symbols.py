#!/usr/bin/env python3
"""
Extract the OoTMM payload symbol addresses the autotracker needs but which the
patchfile does NOT export (the `missingPatchfileSymbols`), by reading the
UNSTRIPPED payload ELFs produced by the generator build.

NOT THE NORMAL PATH. Use the sibling `derive_web_symbols.py`, which recovers the
same addresses from the STRIPPED payloads the website already ships. Full
write-up and the version-bump workflow: see `DERIVING_SAVE_SYMBOLS.md` here.

This script only helps if UNSTRIPPED payload ELFs (CMake targets `oot` and `mm`)
already exist on disk from some earlier build. Building OoTMM just to run this is
explicitly out of scope -- don't. Given the ELFs, it needs nothing but Python 3:
no toolchain, no binutils; the ELF symbol table is parsed directly.

Usage:
    python3 find_autotracker_symbols.py [PATH ...]

PATH may be the ELF files themselves, or a directory to search recursively.
With no PATH it searches the current dir and ./packages/generator/build.
The ELFs are the `add_executable(oot ...)` / `add_executable(mm ...)` outputs,
i.e. files literally named `oot` and `mm` in your CMake build dir (built with
-Wl,--emit-relocs, so they are not stripped).

Symbols we pull out
  OoT payload (linked at 0x80400000):
    gMmSave            -> oot.foreignSaveLive       (the foreign MM save)
    gSharedCustomSave  -> oot.sharedCustomSaveLive
  MM payload (linked at 0x80720000):
    gOotSave           -> mm.foreignSaveLive        (the foreign OoT save)
    gSharedCustomSave  -> mm.sharedCustomSaveLive

Validation anchors (must match the v31.1 values already in live_addrs.json,
otherwise the ELF is not v31.1 / not the right build):
    OoT gComboConfig     == 0x80449ad8   (comboConfigLive)
    OoT gSilverRupeeData == 0x80434c0c   (runtimeSilverRupeeDataLive)
    OoT g + 0x20         == 0x8044a098   (runtimeMaxKeysLive)  => g == 0x8044a078
    OoT gSaveContext     == 0x8011a5d0   (saveCtx, from linker script)
    MM  gComboConfig     == 0x8076a5c8   (comboConfigLive)
    MM  gSaveContext     == 0x801ef670   (saveCtx, from linker script)
"""

import json
import os
import struct
import sys

SHN_UNDEF = 0
SHT_SYMTAB = 2

EXPECTED = {
    "oot": {
        "gComboConfig": 0x80449AD8,
        "gSilverRupeeData": 0x80434C0C,
        "g+0x20": 0x8044A098,
        "gSaveContext": 0x8011A5D0,
    },
    "mm": {
        "gComboConfig": 0x8076A5C8,
        "gSaveContext": 0x801EF670,
    },
}

PAYLOAD_BASE = {"oot": 0x80400000, "mm": 0x80720000}


def read_elf_symbols(path):
    """Return (dict name->value for defined symbols, e_machine, ei_data)."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"\x7fELF":
        return None
    ei_class = data[4]  # 1=32, 2=64
    ei_data = data[5]   # 1=LE, 2=BE
    end = "<" if ei_data == 1 else ">"

    if ei_class == 1:  # ELF32
        (e_machine,) = struct.unpack_from(end + "H", data, 18)
        (e_shoff,) = struct.unpack_from(end + "I", data, 32)
        e_shentsize, e_shnum = struct.unpack_from(end + "HH", data, 46)

        def sh(i):
            off = e_shoff + i * e_shentsize
            (sh_type,) = struct.unpack_from(end + "I", data, off + 4)
            sh_offset, sh_size, sh_link = struct.unpack_from(end + "III", data, off + 16)
            (sh_entsize,) = struct.unpack_from(end + "I", data, off + 36)
            return sh_type, sh_offset, sh_size, sh_link, sh_entsize

        sym_fmt = end + "IIIBBH"  # name,value,size,info,other,shndx
        sym_sz = 16

        def parse_sym(buf, o):
            st_name, st_value, _sz, _info, _other, st_shndx = struct.unpack_from(sym_fmt, buf, o)
            return st_name, st_value, st_shndx
    else:  # ELF64
        (e_machine,) = struct.unpack_from(end + "H", data, 18)
        (e_shoff,) = struct.unpack_from(end + "Q", data, 40)
        e_shentsize, e_shnum = struct.unpack_from(end + "HH", data, 58)

        def sh(i):
            off = e_shoff + i * e_shentsize
            (sh_type,) = struct.unpack_from(end + "I", data, off + 4)
            sh_offset, sh_size = struct.unpack_from(end + "QQ", data, off + 24)
            (sh_link,) = struct.unpack_from(end + "I", data, off + 40)
            (sh_entsize,) = struct.unpack_from(end + "Q", data, off + 56)
            return sh_type, sh_offset, sh_size, sh_link, sh_entsize

        sym_fmt = end + "IBBHQQ"  # name,info,other,shndx,value,size
        sym_sz = 24

        def parse_sym(buf, o):
            st_name, _info, _other, st_shndx, st_value, _size = struct.unpack_from(sym_fmt, buf, o)
            return st_name, st_value, st_shndx

    syms = {}
    for i in range(e_shnum):
        sh_type, sh_offset, sh_size, sh_link, sh_entsize = sh(i)
        if sh_type != SHT_SYMTAB:
            continue
        _, str_off, str_size, _, _ = sh(sh_link)
        strtab = data[str_off:str_off + str_size]
        count = sh_size // (sh_entsize or sym_sz)
        symtab = data[sh_offset:sh_offset + sh_size]
        for k in range(count):
            st_name, st_value, st_shndx = parse_sym(symtab, k * (sh_entsize or sym_sz))
            if st_name == 0:
                continue
            end_ix = strtab.find(b"\x00", st_name)
            name = strtab[st_name:end_ix].decode("ascii", "replace")
            # Keep the first defined occurrence; ABS symbols (from the linker
            # script, e.g. gSaveContext) have st_shndx == SHN_ABS (0xfff1) which
            # is fine -- only skip truly undefined ones.
            if st_shndx == SHN_UNDEF:
                continue
            if name not in syms:
                syms[name] = st_value & 0xFFFFFFFF
    return syms, e_machine, ei_data


def classify(syms):
    """Return 'oot' or 'mm' based on which foreign-save global is real."""
    has_mm = "gMmSave" in syms and (0x80400000 <= syms["gMmSave"] < 0x80800000)
    has_oot = "gOotSave" in syms and (0x80700000 <= syms["gOotSave"] < 0x80800000)
    if has_mm and not has_oot:
        return "oot"
    if has_oot and not has_mm:
        return "mm"
    # Fallback: use gComboConfig range.
    cc = syms.get("gComboConfig")
    if cc is not None:
        return "oot" if cc < 0x80720000 else "mm"
    return None


def find_elfs(paths):
    out = []
    for p in paths:
        if os.path.isfile(p):
            out.append(p)
        elif os.path.isdir(p):
            for root, _dirs, files in os.walk(p):
                for f in files:
                    fp = os.path.join(root, f)
                    try:
                        with open(fp, "rb") as fh:
                            if fh.read(4) == b"\x7fELF":
                                out.append(fp)
                    except OSError:
                        pass
    return out


def h(v):
    return "0x%08x" % v if v is not None else "(missing)"


def main():
    args = sys.argv[1:]
    if not args:
        args = [".", "packages/generator/build"]
    elfs = find_elfs(args)
    if not elfs:
        print("No ELF files found under:", args, file=sys.stderr)
        return 1

    found = {}  # game -> (path, syms)
    for path in elfs:
        res = read_elf_symbols(path)
        if not res:
            continue
        syms, _mach, _data = res
        if "gComboConfig" not in syms and "gSharedCustomSave" not in syms:
            continue  # not a payload ELF
        game = classify(syms)
        if game and game not in found:
            found[game] = (path, syms)

    if not found:
        print("Found ELF(s) but none look like OoT/MM payloads:", elfs, file=sys.stderr)
        return 1

    result = {}
    all_ok = True
    for game in ("oot", "mm"):
        if game not in found:
            print(f"\n### {game.upper()} payload ELF: NOT FOUND")
            all_ok = False
            continue
        path, syms = found[game]
        print(f"\n### {game.upper()} payload ELF: {path}")
        print(f"    payload base expected {h(PAYLOAD_BASE[game])}")

        foreign_name = "gMmSave" if game == "oot" else "gOotSave"
        foreign = syms.get(foreign_name)
        shared = syms.get("gSharedCustomSave")
        print(f"    {foreign_name:<18} -> foreignSaveLive       = {h(foreign)}")
        print(f"    {'gSharedCustomSave':<18} -> sharedCustomSaveLive  = {h(shared)}")

        # Validation anchors
        print("    validation anchors:")
        for key, exp in EXPECTED[game].items():
            if key == "g+0x20":
                got = syms.get("g")
                got = (got + 0x20) if got is not None else None
            else:
                got = syms.get(key)
            ok = got == exp
            all_ok = all_ok and ok
            print(f"      {key:<18} got {h(got)}  expected {h(exp)}  {'OK' if ok else 'MISMATCH'}")

        result[game] = {
            "foreignSaveLive": h(foreign) if foreign is not None else None,
            "sharedCustomSaveLive": h(shared) if shared is not None else None,
        }

    print("\n" + "=" * 60)
    print("ANCHOR VALIDATION:", "ALL PASS (this is v31.1)" if all_ok
          else "MISMATCH -- ELF is not v31.1 or wrong build; values below are untrusted")
    print("=" * 60)
    print("\nPaste-ready values for packs/ootmm/src/autotracker/data/v31_1/live_addrs.json")
    print("(add these keys inside the existing \"oot\" and \"mm\" objects):\n")
    print(json.dumps(result, indent=2))
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
