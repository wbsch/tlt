#!/usr/bin/env python3
"""
Derive the autotracker "missingPatchfileSymbols" (the foreign-save and
shared-custom-save globals) straight from a *fully built web version* of OoTMM
hosted on ootmm.com -- no toolchain, no local ROM build, stdlib only.

Full write-up, the method, and the version-bump workflow live next to this file
in `DERIVING_SAVE_SYMBOLS.md` -- read that first if you're bumping a version.

WHY THIS EXISTS
---------------
This is THE supported way to get these four addresses. We do not build OoTMM --
no ROM, no payloads, no CMake targets -- so the sibling `find_missing_symbols.py`
(which parses UNSTRIPPED payload ELFs from a local build) is not part of the
workflow; it only helps if such ELFs happen to already exist.

The public website does NOT publish those ELFs. What it *does* publish is enough
to recover the same four addresses:

    ootmm.com/gen/vXX.Y                       (SPA shell)
      -> https://static.ootmm.com/config.json (version -> generator iframe html)
      -> <generator iframe html>              (-> assets/index-*.js)
      -> assets/index-*.js -> App-*.js -> worker-*.js
      -> https://static.ootmm.com/assets/data-<hash>.zip

The zip holds, per game:
  * oot_payload.bin / mm_payload.bin  -- the RAW, STRIPPED payload (a big-endian
    MIPS VRAM image linked at 0x80400000 / 0x80720000; crucially it *includes*
    the zero-filled .bss, so global addresses are inside the file).
  * oot_patch.bin / mm_patch.bin       -- generator patch data (unused here).
  * *_symbols_name.bin / *_symbols_addr.bin -- a tiny (~10 entry) COSMETIC
    symbol table (MUSIC_NAMES, DPAD_COLOR, tunic colors, ...). It does NOT
    contain gMmSave / gOotSave / gSharedCustomSave. (Format: names are
    NUL-separated ASCII; addrs are big-endian u32 at index*4.)

HOW THE ADDRESSES ARE RECOVERED
-------------------------------
The four globals live in .bss (zero) so there is no data signature -- but their
addresses are baked into the payload CODE as `lui/addiu` immediate pairs. We
find them by their block-op call sites:

  * The two FOREIGN saves have vanilla, version-stable sizes:
        OoT payload:  gMmSave  is bzero'd / memcpy'd with size 0x3ca0 (MM save)
        MM  payload:  gOotSave is memcpy'd            with size 0x1354 (OoT save)
    We simulate registers linearly, and at every `jal` (delay-slot applied) we
    snapshot the arg registers $4..$7. Any call where one arg is a vanilla save
    size and another arg is a zero-filled payload address pins the foreign save.

  * gSharedCustomSave sits IMMEDIATELY BEFORE the foreign save (foreign =
    shared + sizeof(SharedCustomSave); observed 0x890 in v31.1, but that size
    grows as OoTMM adds fields, so we do NOT hardcode it). We take the
    zero-filled payload address captured just below the foreign save, and
    report the detected sizeof as (foreign - shared) for a sanity assert.

Cross-checks printed: zero-fill of every block, foreign==shared+detected_size,
the recovered MM gSaveContext anchor (lui 0x801f; addiu -0x990 == 0x801ef670),
and the cosmetic symbol fingerprint.

USAGE
-----
    # fetch straight from the site (default: whatever /config.json calls latest)
    python3 derive_web_symbols.py v31.1
    python3 derive_web_symbols.py --list          # show versions in config.json

    # offline, if you already have the artifacts
    python3 derive_web_symbols.py --zip data-n-2aKpeS.zip
    python3 derive_web_symbols.py --oot oot_payload.bin --mm mm_payload.bin

    # write the values into a live_addrs.json (adds the 4 keys under oot/mm)
    python3 derive_web_symbols.py v32.0 --write \
        packs/ootmm/src/autotracker/data/v32_0/live_addrs.json

Downloaded zips are cached under --cache-dir (default: a system temp dir) so
re-runs are cheap.
"""

import argparse
import io
import json
import os
import re
import struct
import sys
import tempfile
import urllib.request
import zipfile

STATIC = "https://static.ootmm.com"
CONFIG_URL = f"{STATIC}/config.json"
UA = "Mozilla/5.0 (derive_web_symbols.py; OoTMM autotracker tooling)"

# Vanilla (version-stable) save sizes, per payload. These are the *foreign*
# save that each payload embeds as a real global.
FOREIGN = {
    "oot": {"symbol": "gMmSave", "size": 0x3CA0},   # MM save embedded in OoT
    "mm":  {"symbol": "gOotSave", "size": 0x1354},  # OoT save embedded in MM
}
PAYLOAD_BASE = {"oot": 0x80400000, "mm": 0x80720000}
# Expected VRAM window for the .bss globals (base + ~0x40000 .. base + ~0x60000).
BSS_LO_OFF, BSS_HI_OFF = 0x40000, 0x60000


# --------------------------------------------------------------------------- #
# Fetch / discovery
# --------------------------------------------------------------------------- #
def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def resolve_zip_url(version):
    """Crawl config.json -> iframe -> js bundles until we find the data zip."""
    cfg = json.loads(http_get(CONFIG_URL))
    if version in (None, "latest", "stable"):
        vers = sorted(
            (v for v in cfg if re.fullmatch(r"v\d+\.\d+(\.\d+)?", v)),
            key=lambda s: [int(x) for x in s[1:].split(".")],
        )
        if not vers:
            raise SystemExit("no numeric versions in config.json")
        version = vers[-1]
    if version not in cfg:
        raise SystemExit(f"version {version!r} not in config.json; try --list")
    iframe = cfg[version]["generator"]["iframe"]["path"]

    seen, queue = set(), [f"{STATIC}/{iframe}"]
    asset_re = re.compile(r"assets/[A-Za-z0-9_.\-]+\.js")
    zip_re = re.compile(r"(?:https?://static\.ootmm\.com/)?assets/[A-Za-z0-9_.\-]+\.zip")
    for _ in range(40):  # depth/breadth cap
        if not queue:
            break
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            text = http_get(url).decode("latin-1")
        except Exception:
            continue
        m = zip_re.search(text)
        if m:
            path = m.group(0).split("assets/")[-1]
            return version, f"{STATIC}/assets/{path}"
        for a in asset_re.findall(text):
            nxt = f"{STATIC}/{a}"
            if nxt not in seen:
                queue.append(nxt)
    raise SystemExit(
        f"could not auto-locate the data zip for {version} (auto-fetch is only "
        f"known to work for v31.0+; older bundles lay the data out differently).\n"
        f"Fallback: open https://ootmm.com/gen/{version} in a browser, watch the "
        f"Network tab for a request to static.ootmm.com/assets/data-*.zip, download "
        f"it, and re-run with:  --zip <that-file>")


def get_zip_bytes(args):
    """Return (version, source_str, zip_bytes)."""
    if args.zip:
        with open(args.zip, "rb") as fh:
            return None, args.zip, fh.read()
    version, url = resolve_zip_url(args.version)
    os.makedirs(args.cache_dir, exist_ok=True)
    cache = os.path.join(args.cache_dir, os.path.basename(url))
    if os.path.exists(cache):
        with open(cache, "rb") as fh:
            return version, url, fh.read()
    print(f"# downloading {url}", file=sys.stderr)
    blob = http_get(url)
    with open(cache, "wb") as fh:
        fh.write(blob)
    return version, url, blob


# --------------------------------------------------------------------------- #
# Payload analysis
# --------------------------------------------------------------------------- #
def sx16(x):
    return x - 0x10000 if x & 0x8000 else x


def apply_reg(reg, w):
    """Apply an instruction's effect on the (lui/addiu/ori/move) register file."""
    op = w >> 26
    rs, rt, rd, imm, fn = (w >> 21) & 31, (w >> 16) & 31, (w >> 11) & 31, w & 0xFFFF, w & 0x3F
    if op == 15:                                   # lui rt, imm
        reg[rt] = (imm << 16) & 0xFFFFFFFF
    elif op == 9:                                  # addiu rt, rs, imm
        reg[rt] = ((reg[rs] + sx16(imm)) & 0xFFFFFFFF) if reg[rs] is not None else None
    elif op == 13:                                 # ori rt, rs, imm
        reg[rt] = ((reg[rs] | imm) & 0xFFFFFFFF) if reg[rs] is not None else None
    elif op == 0 and fn in (0x21, 0x25):           # addu / or  (move idiom)
        if rt == 0:
            reg[rd] = reg[rs]
        elif rs == 0:
            reg[rd] = reg[rt]
        else:
            reg[rd] = None
    elif op == 0 and fn not in (0x08, 0x09):       # other R-type writes rd
        reg[rd] = None
    elif op in (32, 33, 34, 35, 36, 37, 38, 39, 48, 49, 55):  # loads clobber rt
        reg[rt] = None
    reg[0] = 0
    return reg


def is_zero_block(data, base, addr, size):
    off = addr - base
    return 0 <= off and off + size <= len(data) and not any(data[off:off + size])


def find_saves(data, base):
    """Return dict with foreign/shared candidates + all captured block ops."""
    n = len(data) // 4
    words = struct.unpack(">%dI" % n, data[:n * 4])
    lo, hi = base + BSS_LO_OFF, base + BSS_HI_OFF

    def zaddr(v):
        return v is not None and lo <= v <= hi and is_zero_block(data, base, v, 4)

    def plausible_size(v):
        return v is not None and 0x40 <= v <= 0x7FFF

    reg = [None] * 32
    reg[0] = 0
    savectx = None                     # recovered from lui 0x801f; addiu -0x990
    captures = {}                      # addr -> {size: count}
    for i, w in enumerate(words):
        op = w >> 26
        # sanity anchor: MM gSaveContext = 0x801ef670
        if op == 15 and (w & 0xFFFF) == 0x801F and i + 1 < n:
            w2 = words[i + 1]
            if (w2 >> 26) == 9 and ((w2 >> 21) & 31) == ((w >> 16) & 31) and sx16(w2 & 0xFFFF) == -0x990:
                savectx = 0x801F0000 - 0x990
        if op == 3:                    # jal: snapshot args with delay slot applied
            snap = apply_reg(reg[:], words[i + 1]) if i + 1 < n else reg
            args = [snap[4], snap[5], snap[6], snap[7]]
            sizes = [a for a in args if plausible_size(a)]
            addrs = [a for a in args if zaddr(a)]
            for a in addrs:
                for s in sizes:
                    if is_zero_block(data, base, a, s):
                        bucket = captures.setdefault(a, {})
                        bucket[s] = bucket.get(s, 0) + 1
        reg = apply_reg(reg, w)
        if op == 0 and (w & 0x3F) == 0x08:   # jr -> function boundary, reset regs
            reg = [None] * 32
            reg[0] = 0
    return words, captures, savectx


def derive_game(data, base):
    game = "oot" if base == PAYLOAD_BASE["oot"] else "mm"
    fsize = FOREIGN[game]["size"]
    _words, captures, savectx = find_saves(data, base)

    # foreign save: the zero-filled addr captured with the vanilla foreign size.
    foreign_hits = {a: cnt.get(fsize, 0) for a, cnt in captures.items() if fsize in cnt}
    foreign = max(foreign_hits, key=foreign_hits.get) if foreign_hits else None

    # gSharedCustomSave sits immediately before the foreign save: its own copy
    # block ends exactly at (or within a small alignment pad of) the foreign
    # base. Pick the captured (addr, size) whose end meets the foreign base,
    # preferring the largest such block (the full-struct memcpy/bzero).
    shared = shared_size = None
    best = -1
    if foreign is not None:
        for a, sizes in captures.items():
            if a >= foreign:
                continue
            for s in sizes:
                if 0 <= foreign - (a + s) <= 0x10 and s > best:
                    best, shared, shared_size = s, a, s

    return {
        "game": game,
        "foreign_symbol": FOREIGN[game]["symbol"],
        "foreign": foreign,
        "foreign_size": fsize,
        "shared": shared,
        "shared_size": shared_size,
        "savectx": savectx,
        "captures": captures,
    }


def decode_symbols(zf, game):
    try:
        names = zf.read(f"{game}_symbols_name.bin")
        addrs = zf.read(f"{game}_symbols_addr.bin")
    except KeyError:
        return []
    parts = [p for p in names.split(b"\x00") if p]
    out = []
    for i, p in enumerate(parts):
        if (i + 1) * 4 <= len(addrs):
            (val,) = struct.unpack_from(">I", addrs, i * 4)   # big-endian
            out.append((p.decode("ascii", "replace"), val))
    return out


# --------------------------------------------------------------------------- #
# Output / write-back
# --------------------------------------------------------------------------- #
def h(v):
    return "0x%08x" % v if v is not None else "(missing)"


def report(game_res, symbols):
    g = game_res["game"].upper()
    print(f"\n### {g} payload  (base {h(PAYLOAD_BASE[game_res['game']])})")
    if symbols:
        print(f"    cosmetic-symbol fingerprint: {symbols[0][0]}={h(symbols[0][1])} "
              f"... ({len(symbols)} entries)")
    f, s = game_res["foreign"], game_res["shared"]
    print(f"    {game_res['foreign_symbol']:<18} -> foreignSaveLive      = {h(f)} "
          f"(size {h(game_res['foreign_size'])})")
    print(f"    {'gSharedCustomSave':<18} -> sharedCustomSaveLive = {h(s)} "
          f"(detected size {h(game_res['shared_size'])})")
    ok = True
    if f is None or s is None:
        ok = False
        print("    !! FAILED to pin one or both globals")
    else:
        adj = (s + game_res["shared_size"] == f)
        print(f"    check: foreign == shared + shared_size : {adj}")
        ok = ok and adj
    if game_res["savectx"] is not None:
        print(f"    anchor: recovered MM gSaveContext = {h(game_res['savectx'])} "
              f"({'OK' if game_res['savectx'] == 0x801EF670 else 'unexpected'})")
    return ok


def _insert_before(obj, anchor, extra):
    """Return obj with `extra` keys placed just before `anchor` (or appended),
    dropping pre-existing copies so re-writes stay idempotent and ordered."""
    out, done = {}, False
    for k, v in obj.items():
        if k in extra:
            continue
        if k == anchor and not done:
            out.update(extra)
            done = True
        out[k] = v
    if not done:
        out.update(extra)
    return out


def write_back(path, results, source_desc, version):
    with open(path) as fh:
        doc = json.load(fh)
    for r in results:
        g = r["game"]
        obj = _insert_before(doc.get(g, {}), "derivation", {
            "sharedCustomSaveLive": h(r["shared"]),
            "foreignSaveLive": h(r["foreign"]),
        })
        d = obj.setdefault("derivation", {})
        d["sharedCustomSaveLive"] = "web-payload-code-scan"
        d["foreignSaveLive"] = "web-payload-code-scan"
        doc[g] = obj
    doc["notDerivableWithoutLinking"] = {"oot": [], "mm": []}
    doc["savesDerivedFrom"] = {
        "method": "web-payload-code-scan",
        "source": f"{source_desc} ({version})" if version else (source_desc or "unknown"),
        "tool": "scripts/autotracker/derive_web_symbols.py",
        "doc": "scripts/autotracker/DERIVING_SAVE_SYMBOLS.md",
        "note": (
            "gMmSave/gOotSave/gSharedCustomSave are absent from the patchfile and "
            "from the site's cosmetic symbol table; addresses were recovered by "
            "scanning the stripped payload code for the bzero/memcpy save-size "
            "signatures. Cross-checked: foreign == shared + detected shared size, "
            "and zero-filled .bss."
        ),
    }
    with open(path, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    print(f"\nwrote foreignSaveLive/sharedCustomSaveLive + savesDerivedFrom into {path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version", nargs="?", default="latest",
                    help="OoTMM version, e.g. v31.1 (default: latest in config.json)")
    ap.add_argument("--list", action="store_true", help="list versions and exit")
    ap.add_argument("--zip", help="use a local data zip instead of fetching")
    ap.add_argument("--oot", help="use a local oot_payload.bin")
    ap.add_argument("--mm", help="use a local mm_payload.bin")
    ap.add_argument("--write", metavar="LIVE_ADDRS_JSON",
                    help="patch this live_addrs.json in place")
    ap.add_argument("--cache-dir", default=os.path.join(tempfile.gettempdir(),
                                                         "ootmm-web-cache"))
    args = ap.parse_args()

    if args.list:
        cfg = json.loads(http_get(CONFIG_URL))
        for v in sorted(cfg):
            print(v)
        return 0

    payloads = {}      # game -> bytes
    version, source_desc = None, None
    if args.oot or args.mm:
        srcs = []
        if args.oot:
            payloads["oot"] = open(args.oot, "rb").read()
            srcs.append(args.oot)
        if args.mm:
            payloads["mm"] = open(args.mm, "rb").read()
            srcs.append(args.mm)
        source_desc = "local payloads: " + ", ".join(srcs)
        symbols = {}
    else:
        version, source_desc, blob = get_zip_bytes(args)
        zf = zipfile.ZipFile(io.BytesIO(blob))
        symbols = {}
        for game in ("oot", "mm"):
            try:
                payloads[game] = zf.read(f"{game}_payload.bin")
                symbols[game] = decode_symbols(zf, game)
            except KeyError:
                pass

    if not payloads:
        raise SystemExit("no payloads found")

    print(f"# OoTMM web symbol derivation" + (f"  (version {version})" if version else ""))
    results, all_ok = [], True
    for game in ("oot", "mm"):
        if game not in payloads:
            continue
        r = derive_game(payloads[game], PAYLOAD_BASE[game])
        all_ok &= report(r, symbols.get(game) if isinstance(symbols, dict) else None)
        results.append(r)

    print("\n" + "=" * 62)
    print("paste-ready values (add under the matching game object):")
    for r in results:
        print(f'  "{r["game"]}": {{ "sharedCustomSaveLive": "{h(r["shared"])}", '
              f'"foreignSaveLive": "{h(r["foreign"])}" }}')

    if args.write:
        if not all_ok:
            print("\nrefusing to --write: a consistency check failed above",
                  file=sys.stderr)
            return 2
        write_back(args.write, results, source_desc, version)
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
