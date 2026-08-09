#!/usr/bin/env python3
"""
Derive the autotracker `combo_config_layout.json` -- the per-version tail
layout of the OoTMM `ComboConfig` struct -- from two complementary sources,
mirroring how `derive_web_symbols.py` sources `live_addrs.json`:

  Quelle A (primary, ground truth): the OoTMM repo header
      packages/generator/include/combo/config.h
      at the release tag (the struct the payload is compiled from). Member
      offsets are computed with C alignment rules (u8/s8=1, u16/s16=2,
      u32/s32=4; struct alignment = largest member). `PRICES_MAX` is not
      defined in any checked-in header -- it is derived from
      packages/logic/src/price.ts (sum of the PRICE_COUNTS ranges = 141).

  Quelle B (verification): a scan of the *shipped* payload code from the
      ootmm.com data zip (same zip fetch/cache helpers and MIPS register
      simulation as derive_web_symbols.py). It finds the offsets the compiled
      code actually accesses, proving the struct JSON matches the payload
      players run. OoT and MM payloads must yield identical offsets (one
      layout serves both games).

Full write-up and the version-bump workflow live next to this file in
`DERIVING_SAVE_SYMBOLS.md` -- read that first if you're bumping a version.

USAGE
  # Quelle A: from the OoTMM repo header (the tag must exist in the checkout)
  python3 scripts/autotracker/derive_combo_config_layout.py \
      --ootmm-repo OoTMM --version v32.0

  # Quelle B: from a web data zip (like derive_web_symbols.py)
  python3 scripts/autotracker/derive_combo_config_layout.py \
      --zip /tmp/data-xxxx.zip --combo-base-oot 0x80449b28 --combo-base-mm 0x8076a5d8

  # Quelle B with auto-fetch (like derive_web_symbols.py): pass --version
  # without --ootmm-repo
  python3 scripts/autotracker/derive_combo_config_layout.py \
      --version v32.0 --combo-base-oot 0x80449b28 --combo-base-mm 0x8076a5d8

  # Both, and write the JSON only when the scan confirms the struct layout:
  python3 scripts/autotracker/derive_combo_config_layout.py \
      --ootmm-repo OoTMM --version v32.0 \
      --verify-zip /tmp/data-xxxx.zip \
      --write packs/ootmm/src/autotracker/data/v32_0/combo_config_layout.json

If --combo-base-oot/--combo-base-mm are omitted, the comboConfigLive values
from the autotracker data dirs' live_addrs.json are used (run
`derive_web_symbols.py`/`export_live_addrs.py` FIRST -- a stale base shifts
every scan hit and fails the cross-checks).
"""

import argparse
import io
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import zipfile
from types import SimpleNamespace

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from derive_web_symbols import apply_reg, get_zip_bytes, sx16  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DATA_BASE = os.path.join(
    REPO_ROOT, "packs", "ootmm", "src", "autotracker", "data"
)

CONFIG_H_REPO_PATH = "packages/generator/include/combo/config.h"
PRICE_TS_REPO_PATH = "packages/logic/src/price.ts"

# Hardcoded fixed offsets the parser (rawFrameParser.ts) reads WITHOUT going
# through combo_config_layout.json. They are stable anchors across layouts: if
# any of them changes, the parser's OOT_COMBO_CONFIG_* constants must be
# updated too -- refuse to write silently.
ANCHORS = {
    "mq": 0x9C,
    "config": 0xEC,
    "special": 0x12C,
    "prices": 0x15C,
    "triforcePieces": 0x276,
    "triforceGoal": 0x278,
    "hints": 0x27A,
}

# Parser constants in rawFrameParser.ts that depend on the struct shape but
# are NOT part of combo_config_layout.json (the JSON only carries offsets).
# If any of these changes, the parser constants must be updated too.
PARSER_CONSTANTS = {
    "special_count": 5,      # OOT_COMBO_CONFIG_SPECIAL_COUNT
    "special_size": 8,       # OOT_COMBO_CONFIG_SPECIAL_SIZE
    "prices_count": 141,     # OOT_COMBO_CONFIG_PRICE_COUNT
    "boss_count": 12,        # OOT_COMBO_CONFIG_BOSS_COUNT
    "song_events_count": 0x12,  # OOT_COMBO_CONFIG_SONG_EVENT_COUNT
}

# (size, alignment) of the C primitives used in config.h.
PRIMITIVE_SIZES = {
    "u8": (1, 1), "s8": (1, 1),
    "u16": (2, 2), "s16": (2, 2),
    "u32": (4, 4), "s32": (4, 4),
    "char": (1, 1), "int": (4, 4),
}

LOAD_KINDS = {32: "lb", 33: "lh", 34: "lwl", 35: "lw", 36: "lbu", 37: "lhu", 38: "lwr"}
STORE_KINDS = {40: "sb", 41: "sh", 42: "swl", 43: "sw", 44: "swr"}


# --------------------------------------------------------------------------- #
# Repo access (Quelle A)
# --------------------------------------------------------------------------- #
def git_show(repo, tag, path):
    """Return the file content at `tag` (git show), or raise SystemExit."""
    out = subprocess.run(
        ["git", "-C", repo, "show", f"{tag}:{path}"],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise SystemExit(
            f"git show {tag}:{path} failed in {repo}:\n{out.stderr.strip()}\n"
            f"Make sure the tag exists locally (git -C {repo} fetch --tags)."
        )
    return out.stdout


# --------------------------------------------------------------------------- #
# price.ts -> PRICES_MAX
# --------------------------------------------------------------------------- #
def _strip_comments(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"//[^\n]*", " ", text)
    return text


def _split_top_level(s, sep=","):
    """Split `s` on `sep` at nesting depth 0 ([] and () aware)."""
    parts, depth, cur = [], 0, []
    for ch in s:
        if ch in "[(":
            depth += 1
        elif ch in "])":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur or parts:
        parts.append("".join(cur).strip())
    return [p for p in parts if p]


def _extract_object(text, name):
    """Return the text between the braces of `(export const) name = { ... };`."""
    m = re.search(
        r"(?:export\s+const|const)\s+" + re.escape(name) + r"\s*=\s*\{", text
    )
    if not m:
        raise ValueError(f"could not find `{name}` in price.ts")
    depth, i = 0, m.end() - 1
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[m.end():i]
        i += 1
    raise ValueError(f"unbalanced braces for `{name}` in price.ts")


def _count_array_literal(text):
    """Number of top-level elements of a single-line JS array literal."""
    text = text.strip()
    if not (text.startswith("[") and text.endswith("]")):
        raise ValueError(f"not an array literal: {text!r}")
    inner = text[1:-1].strip()
    return 0 if not inner else len(_split_top_level(inner))


def compute_prices_max(price_ts):
    """PRICES_MAX == total number of price entries == sum of PRICE_COUNTS.

    Works for both price.ts structures seen in the OoTMM repo:
      - v31.0+: `export const PRICES_RAW = { KEY: [ ... ], ... }` plus
        spread-composed `const OOT_SHOPS = [...A, ...B];` arrays.
      - v30.1:  flat `const KEY = [ ... ];` declarations + spread arrays.
    """
    text = _strip_comments(price_ts)
    env = {}

    def resolve(expr):
        expr = expr.strip()
        if expr.startswith("[") and expr.endswith("]"):
            inner = expr[1:-1].strip()
            if not inner:
                return 0
            total = 0
            for part in _split_top_level(inner):
                if part.startswith("..."):
                    total += resolve(part[3:].strip())
                else:
                    total += 1
            return total
        if "." in expr:
            base, _, key = expr.partition(".")
            if base in env:
                val = env[base][key] if isinstance(env[base], dict) else env[base]
                return val if isinstance(val, int) else resolve(val)
            return resolve(key)
        if expr in env:
            return env[expr] if isinstance(env[expr], int) else resolve(env[expr])
        raise ValueError(f"cannot resolve array expression {expr!r}")

    if "PRICES_RAW" in text:
        raw = {}
        for line in _extract_object(text, "PRICES_RAW").splitlines():
            m = re.match(r"\s*([A-Za-z_]\w*)\s*:\s*(\[[^\]]*\])\s*,?\s*$", line)
            if m:
                raw[m.group(1)] = _count_array_literal(m.group(2))
        env["PRICES_RAW"] = raw

    # Top-level `const NAME = [ ... ];` arrays (both structures). Anchored at
    # the line start so function-local `const`s (e.g. inside defaultPrices)
    # are not picked up.
    for m in re.finditer(
        r"(?m)^(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(\[[^\]]*\]);", text
    ):
        name, arr = m.group(1), m.group(2)
        if name not in env:
            env[name] = resolve(arr)

    total = 0
    for line in _extract_object(text, "PRICES").splitlines():
        m = re.match(r"\s*([A-Za-z_]\w*)(?:\s*:\s*(.+?))?\s*,?\s*$", line)
        if m:
            key = m.group(1)
            if key == "MAX":
                continue
            total += resolve((m.group(2) or key).strip())
    return total


# --------------------------------------------------------------------------- #
# config.h -> struct layout
# --------------------------------------------------------------------------- #
def _extract_typedef_structs(header):
    """Map typedef-name -> struct body text for every `typedef struct {...} N;`."""
    text = _strip_comments(header)
    typedefs = {}
    pos = 0
    while True:
        i = text.find("typedef struct", pos)
        if i < 0:
            break
        j = text.find("{", i)
        if j < 0:
            break
        depth, k = 0, j
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    m = re.match(r"\s*([A-Za-z_]\w*)\s*;", text[k + 1:])
                    if m:
                        typedefs[m.group(1)] = text[j + 1:k]
                    pos = k + 1
                    break
            k += 1
        else:
            break
    return typedefs


MEMBER_RE = re.compile(r"^\s*([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(?:\s*\[([^\]]*)\])?\s*;")


def _resolve_array_count(expr, env):
    expr = expr.strip()
    if not expr:
        return 1
    if re.fullmatch(r"0[xX][0-9a-fA-F]+", expr):
        return int(expr, 16)
    if re.fullmatch(r"\d+", expr):
        return int(expr, 10)
    if expr in env:
        return env[expr]
    raise ValueError(
        f"cannot resolve array count {expr!r} (known macros: {sorted(env)})"
    )


def _resolve_type(tname, typedefs, memo):
    if tname in PRIMITIVE_SIZES:
        return PRIMITIVE_SIZES[tname]
    if tname in memo:
        return memo[tname]
    if tname not in typedefs:
        raise ValueError(
            f"unknown member type {tname!r} (known: {sorted(typedefs)})"
        )
    _fields, size, align = layout_struct(typedefs[tname], typedefs, {}, memo)
    memo[tname] = (size, align)
    return size, align


def layout_struct(body, typedefs, array_env, memo):
    """C-layout a struct body; return (fields, raw size, struct alignment)."""
    offset = 0
    struct_align = 1
    fields = []
    for line in body.splitlines():
        m = MEMBER_RE.match(line)
        if not m:
            continue
        tname, fname, arr = m.group(1), m.group(2), m.group(3)
        size, align = _resolve_type(tname, typedefs, memo)
        count = _resolve_array_count(arr, array_env) if arr else 1
        if offset % align:
            offset += align - (offset % align)
        fields.append({
            "name": fname,
            "offset": offset,
            "size": size * count,
            "type": tname,
            "count": count,
            "align": align,
        })
        offset += size * count
        struct_align = max(struct_align, align)
    return fields, offset, struct_align


def derive_layout(header, prices_max):
    """Compute the ComboConfig layout from the raw header text.

    Returns (layout, info, errors). `layout` is the combo_config_layout.json
    dict; `info` carries extra offsets for verification; `errors` non-empty
    means the fixed parser offsets changed and nothing should be written.
    """
    typedefs = _extract_typedef_structs(header)
    if "ComboConfig" not in typedefs:
        raise SystemExit("ComboConfig typedef not found in config.h")
    memo = {}
    fields, raw_size, struct_align = layout_struct(
        typedefs["ComboConfig"], typedefs, {"PRICES_MAX": prices_max}, memo
    )
    by_name = {f["name"]: f for f in fields}

    errors = []
    for label, expect in ANCHORS.items():
        got = by_name.get(label, {}).get("offset")
        if got != expect:
            errors.append(
                f"anchor {label}: expected 0x{expect:03x}, computed "
                f"0x{got:03x} -- the fixed offsets in rawFrameParser.ts "
                f"(OOT_COMBO_CONFIG_*) must be updated; refusing to write"
            )

    special = by_name["special"]
    if special["count"] != PARSER_CONSTANTS["special_count"]:
        errors.append(
            f"special[] count {special['count']} != "
            f"{PARSER_CONSTANTS['special_count']} (OOT_COMBO_CONFIG_SPECIAL_COUNT)"
        )
    special_size = memo.get("SpecialCond", (None, None))[0]
    if special_size != PARSER_CONSTANTS["special_size"]:
        errors.append(
            f"SpecialCond size {special_size} != "
            f"{PARSER_CONSTANTS['special_size']} (OOT_COMBO_CONFIG_SPECIAL_SIZE)"
        )
    prices = by_name["prices"]
    if prices["count"] != PARSER_CONSTANTS["prices_count"]:
        errors.append(
            f"prices[] count {prices['count']} != "
            f"{PARSER_CONSTANTS['prices_count']} (OOT_COMBO_CONFIG_PRICE_COUNT)"
        )
    boss = by_name["boss"]
    if boss["count"] != PARSER_CONSTANTS["boss_count"]:
        errors.append(
            f"boss[] count {boss['count']} != "
            f"{PARSER_CONSTANTS['boss_count']} (OOT_COMBO_CONFIG_BOSS_COUNT)"
        )
    song = next((f for f in fields if f["name"].startswith("songEvents")), None)
    if song is None:
        errors.append("no songEvents* field found")
    elif song["count"] != PARSER_CONSTANTS["song_events_count"]:
        errors.append(
            f"{song['name']} count {song['count']} != "
            f"{PARSER_CONSTANTS['song_events_count']} "
            f"(OOT_COMBO_CONFIG_SONG_EVENT_COUNT)"
        )

    static = by_name["staticHintsImportance"]
    layout = {
        "size": raw_size,  # end of last used field, no tail padding
        "staticHintsOffset": static["offset"],
        "staticHintCount": static["count"],
        "bossOffset": boss["offset"],
        "strayFairyRewardCountOffset": by_name["strayFairyRewardCount"]["offset"],
        "bombchuBehaviorOotOffset": by_name["bombchuBehaviorOot"]["offset"],
        "bombchuBehaviorMmOffset": by_name["bombchuBehaviorMm"]["offset"],
        "songEventsOffset": song["offset"],
    }
    padded = (raw_size + struct_align - 1) // struct_align * struct_align
    info = {
        "gi_zora_sapphire_offset": by_name["giZoraSapphire"]["offset"],
        "static_hints_end": static["offset"] + static["count"],
        "song_events_mm_present": any(
            f["name"] == "songEventsMm" for f in fields
        ),
        "song_events_count": song["count"],
        "sizeof_padded": padded,
        "struct_align": struct_align,
        "prices_max": prices_max,
        "boss_count": boss["count"],
    }
    return layout, info, errors


# --------------------------------------------------------------------------- #
# Payload scan (Quelle B)
# --------------------------------------------------------------------------- #
def scan_payload(data, base, window=0x300):
    """Simulate registers linearly; collect (offset -> set of access kinds)
    for every load/store whose effective address lands in
    [base, base + window)."""
    n = len(data) // 4
    words = struct.unpack(">%dI" % n, data[:n * 4])
    reg = [None] * 32
    reg[0] = 0
    hits = {}
    for i, w in enumerate(words):
        op = w >> 26
        if op in LOAD_KINDS or op in STORE_KINDS:
            rs = (w >> 21) & 31
            if reg[rs] is not None:
                eff = (reg[rs] + sx16(w & 0xFFFF)) & 0xFFFFFFFF
                if base <= eff < base + window:
                    kind = LOAD_KINDS.get(op) or STORE_KINDS[op]
                    hits.setdefault(eff - base, set()).add(kind)
        reg = apply_reg(reg, w)
        if op == 0 and (w & 0x3F) == 0x08:  # jr -> function boundary
            reg = [None] * 32
            reg[0] = 0
    return hits


def derive_tail_from_hits(hits):
    """Tail offsets visible in the payload scan (v31.0+ layout heuristics):
    boss is the start of the u8 chain boss[12], strayFairyRewardCount,
    bombchuBehaviorOot, bombchuBehaviorMm, directly followed by songEvents.

    Candidate selection: boss must be the first lbu access *after* the
    staticHints `lb` accesses (staticHints is s8[], read signed; boss and the
    following u8 fields are read unsigned). The plan's naive "smallest lbu
    >= 0x2a0" is not enough: the OoT payload also reads the hints region's
    ganonBossKey (lbu @0x2a2/0x2a3), which sits before staticHints. The
    candidate whose chain (boss+12/+13/+14 all lbu) validates wins.
    Returns (derived_dict, error_string)."""
    lb_offs = sorted(o for o, ks in hits.items() if "lb" in ks)
    lbu_offs = sorted(o for o, ks in hits.items() if "lbu" in ks)
    if not lbu_offs:
        return None, "no lbu access found in window"

    candidates = []
    if lb_offs:
        after_lb = next((o for o in lbu_offs if o > lb_offs[-1]), None)
        if after_lb is not None:
            candidates.append(after_lb)
    candidates.append(next((o for o in lbu_offs if o >= 0x2A0), None))

    def chain_ok(boss):
        return all("lbu" in hits.get(boss + d, set()) for d in (12, 13, 14))

    boss = next((c for c in dict.fromkeys(c for c in candidates if c is not None)
                 if chain_ok(c)), candidates[0])
    stray, oot, mm = boss + 12, boss + 13, boss + 14
    song = mm + 1
    return {
        "boss": boss,
        "strayFairyRewardCount": stray,
        "bombchuBehaviorOot": oot,
        "bombchuBehaviorMm": mm,
        "songEvents": song,
        "size_without_song_events_mm": song + 0x12,
    }, None


def _kinds_line(hits):
    """Compact, human-readable hit summary for the report."""
    by_kind = {}
    for off, ks in sorted(hits.items()):
        for k in sorted(ks):
            by_kind.setdefault(k, []).append(off)
    parts = []
    for k in ("lb", "lbu", "lh", "lhu", "lw", "lwl", "lwr", "sb", "sh", "sw", "swl", "swr"):
        offs = by_kind.get(k)
        if not offs:
            continue
        # group into contiguous runs
        runs, start, prev = [], offs[0], offs[0]
        for o in offs[1:]:
            if o == prev + 1:
                prev = o
                continue
            runs.append((start, prev))
            start = prev = o
        runs.append((start, prev))
        text = ",".join(
            f"0x{a:03x}" if a == b else f"0x{a:03x}-0x{b:03x}" for a, b in runs
        )
        parts.append(f"{k} @{text}")
    return "  ".join(parts)


def verify_layout(layout, info, hits):
    """Check the struct-derived layout is exactly reproduced by the scan.

    Returns a list of (description, ok, required). Non-required checks are
    informational: e.g. giZoraSapphire is only statically accessed by the OoT
    payload (MM never reads it), so it must not block the verification.
    """
    def kinds(o):
        return hits.get(o, set())

    checks = []
    checks.append(("triforcePieces lhu @0x276", "lhu" in kinds(0x276), True))
    checks.append(("triforceGoal lhu @0x278", "lhu" in kinds(0x278), True))
    gi = info["gi_zora_sapphire_offset"]
    checks.append((f"giZoraSapphire lhu @0x{gi:03x} (info)",
                   "lhu" in kinds(gi), False))
    sh = layout["staticHintsOffset"]
    checks.append((
        f"staticHints lb hit in [0x{sh:03x},+{layout['staticHintCount']})",
        any("lb" in ks and sh <= o < sh + layout["staticHintCount"]
            for o, ks in hits.items()),
        True,
    ))
    boss = layout["bossOffset"]
    checks.append((f"boss lbu @0x{boss:03x}", "lbu" in kinds(boss), True))
    for key, label in (
        ("strayFairyRewardCountOffset", "strayFairyRewardCount"),
        ("bombchuBehaviorOotOffset", "bombchuBehaviorOot"),
        ("bombchuBehaviorMmOffset", "bombchuBehaviorMm"),
    ):
        o = layout[key]
        checks.append((f"{label} lbu @0x{o:03x}", "lbu" in kinds(o), True))
    derived, err = derive_tail_from_hits(hits)
    if err:
        checks.append(("scan-derived tail chain", False, True))
    else:
        checks.append((
            "scan-derived boss == struct boss",
            derived["boss"] == boss,
            True,
        ))
        checks.append((
            "scan-derived songEvents == struct songEvents",
            derived["songEvents"] == layout["songEventsOffset"],
            True,
        ))
    return checks


# --------------------------------------------------------------------------- #
# Zip / bases
# --------------------------------------------------------------------------- #
def find_combo_bases(version_tag=None):
    """comboConfigLive per game from the autotracker live_addrs.json files."""
    candidates = []
    if version_tag:
        d = "v" + version_tag.lstrip("v").replace(".", "_")
        candidates.append(os.path.join(DATA_BASE, d))
    if os.path.isdir(DATA_BASE):
        version_dirs = [
            os.path.join(DATA_BASE, x)
            for x in os.listdir(DATA_BASE)
            if re.fullmatch(r"v\d+_\d+", x) and os.path.isdir(os.path.join(DATA_BASE, x))
        ]
        candidates += sorted(
            version_dirs,
            key=lambda p: [int(n) for n in os.path.basename(p)[1:].split("_")],
            reverse=True,
        )
    for d in candidates:
        la = os.path.join(d, "live_addrs.json")
        if not os.path.exists(la):
            continue
        try:
            doc = json.load(open(la))
        except Exception:
            continue
        bases = {}
        for g in ("oot", "mm"):
            v = (doc.get(g) or {}).get("comboConfigLive")
            if v:
                bases[g] = int(v, 16)
        if bases:
            return bases, d
    return {}, None


def load_zip_blob(zip_path):
    with open(zip_path, "rb") as fh:
        return fh.read()


def run_scan_report(zip_blob, zip_desc, combo_bases, layout=None, info=None):
    """Scan both payloads, print a report, optionally verify against the
    struct layout. Returns (all_ok, per_game_derived)."""
    zf = zipfile.ZipFile(io.BytesIO(zip_blob))
    print(f"\n# Quelle B: payload scan  ({zip_desc})")
    all_ok = True
    derived_by_game = {}
    for game in ("oot", "mm"):
        try:
            data = zf.read(f"{game}_payload.bin")
        except KeyError:
            continue
        base = combo_bases.get(game)
        print(f"\n## {game.upper()} payload (combo base "
              f"{('0x%08x' % base) if base else '(missing)'})")
        if base is None:
            print("  !! no combo base (pass --combo-base-%s or fix "
                  "live_addrs.json)" % game)
            all_ok = False
            continue
        hits = scan_payload(data, base)
        print("  hits: " + (_kinds_line(hits) or "(none)"))
        derived, err = derive_tail_from_hits(hits)
        if err:
            print(f"  !! tail derivation failed: {err}")
            all_ok = False
            derived_by_game[game] = None
            continue
        print(
            f"  derived: boss=0x{derived['boss']:03x} "
            f"strayFairy=0x{derived['strayFairyRewardCount']:03x} "
            f"bombchuOot=0x{derived['bombchuBehaviorOot']:03x} "
            f"bombchuMm=0x{derived['bombchuBehaviorMm']:03x} "
            f"songEvents=0x{derived['songEvents']:03x} "
            f"size=0x{derived['size_without_song_events_mm']:03x}"
        )
        derived_by_game[game] = derived
        if layout is not None and info is not None:
            checks = verify_layout(layout, info, hits)
            ok = all(ok for _d, ok, _req in checks if _req)
            all_ok = all_ok and ok
            for desc, ok, _req in checks:
                print(f"  verify: {'OK ' if ok else 'FAIL'} {desc}")

    games = [g for g in derived_by_game if derived_by_game[g] is not None]
    if len(games) >= 2:
        same = all(
            derived_by_game[games[0]][k] == derived_by_game[g][k]
            for g in games[1:] for k in derived_by_game[games[0]]
        )
        print(f"\n  check: {games[0].upper()} and {games[1].upper()} derived "
              f"offsets identical: {same}")
        all_ok = all_ok and same
    elif len(games) == 0 and layout is not None:
        all_ok = False
    return all_ok, derived_by_game


# --------------------------------------------------------------------------- #
# Output / write-back
# --------------------------------------------------------------------------- #
def report_mode_a(layout, info, tag, repo):
    print(f"# ComboConfig layout derivation  (OoTMM {tag}, repo {repo})")
    print(f"  struct source: git {tag}:{CONFIG_H_REPO_PATH}")
    print(f"  PRICES_MAX     = {info['prices_max']} "
          "(sum of PRICE_COUNTS in packages/logic/src/price.ts)")
    print(f"  size           = {layout['size']} (0x{layout['size']:x}) end of "
          f"last used field; C sizeof {info['sizeof_padded']} "
          f"(struct align {info['struct_align']})")
    print("  anchors: " + "  ".join(
        f"{label}@0x{expect:03x}" for label, expect in ANCHORS.items()
    ) + "  (checked)")
    print(f"  staticHintsImportance[{layout['staticHintCount']}] "
          f"@0x{layout['staticHintsOffset']:03x} ({layout['staticHintsOffset']})")
    print(f"  giZoraSapphire             @0x{info['gi_zora_sapphire_offset']:03x} "
          f"({info['gi_zora_sapphire_offset']})")
    print(f"  boss[{info['boss_count']}]                    "
          f"@0x{layout['bossOffset']:03x} ({layout['bossOffset']})")
    print(f"  strayFairyRewardCount      @0x{layout['strayFairyRewardCountOffset']:03x} "
          f"({layout['strayFairyRewardCountOffset']})")
    print(f"  bombchuBehaviorOot         @0x{layout['bombchuBehaviorOotOffset']:03x} "
          f"({layout['bombchuBehaviorOotOffset']})")
    print(f"  bombchuBehaviorMm          @0x{layout['bombchuBehaviorMmOffset']:03x} "
          f"({layout['bombchuBehaviorMmOffset']})")
    print(f"  songEvents{'Oot' if info['song_events_mm_present'] else ''}"
          f"[{info['song_events_count']}] "
          f"@0x{layout['songEventsOffset']:03x} ({layout['songEventsOffset']})")
    if info["song_events_mm_present"]:
        print(f"  songEventsMm[{layout['size'] - layout['songEventsOffset']
                              - info['song_events_count']}] "
              f"@0x{layout['songEventsOffset'] + info['song_events_count']:03x}")
    return True


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--ootmm-repo", metavar="PATH",
                    help="path to the OoTMM checkout (Quelle A)")
    ap.add_argument("--version", metavar="TAG",
                    help="OoTMM version tag, e.g. v32.0 (with --ootmm-repo: "
                         "Quelle A; without: Quelle B auto-fetch)")
    ap.add_argument("--zip", metavar="ZIP",
                    help="local ootmm.com data zip (Quelle B)")
    ap.add_argument("--verify-zip", metavar="ZIP",
                    help="run the payload scan against this zip and only "
                         "--write on exact match with the struct layout")
    ap.add_argument("--combo-base-oot", metavar="HEX",
                    help="comboConfigLive for OoT (default: live_addrs.json)")
    ap.add_argument("--combo-base-mm", metavar="HEX",
                    help="comboConfigLive for MM (default: live_addrs.json)")
    ap.add_argument("--write", metavar="JSON",
                    help="write combo_config_layout.json (requires "
                         "--ootmm-repo/--version)")
    ap.add_argument("--cache-dir",
                    default=os.path.join(tempfile.gettempdir(), "ootmm-web-cache"),
                    help="zip cache for Quelle B auto-fetch "
                         "(default: %(default)s)")
    args = ap.parse_args()

    combo_bases = {}
    if args.combo_base_oot:
        combo_bases["oot"] = int(args.combo_base_oot, 16)
    if args.combo_base_mm:
        combo_bases["mm"] = int(args.combo_base_mm, 16)

    layout = info = None
    errors = []
    all_ok = True
    tag = args.version

    # ---- Quelle A: struct from the repo header --------------------------- #
    if args.ootmm_repo:
        if not args.version:
            ap.error("--ootmm-repo requires --version")
        header = git_show(args.ootmm_repo, args.version, CONFIG_H_REPO_PATH)
        try:
            price_ts = git_show(args.ootmm_repo, args.version, PRICE_TS_REPO_PATH)
        except SystemExit:
            # older tags kept prices at packages/generator/lib/combo/logic/price.ts
            price_ts = git_show(
                args.ootmm_repo, args.version,
                "packages/generator/lib/combo/logic/price.ts",
            )
        prices_max = compute_prices_max(price_ts)
        layout, info, errors = derive_layout(header, prices_max)
        report_mode_a(layout, info, args.version, args.ootmm_repo)
        if errors:
            all_ok = False
            print("\n!! layout checks failed:")
            for e in errors:
                print(f"   - {e}")
            print("!! not writing anything -- update the fixed offsets in "
                  "rawFrameParser.ts (and this script's ANCHORS / "
                  "PARSER_CONSTANTS) first.")
            return 2

    # ---- Quelle B: payload scan ------------------------------------------ #
    zip_blob = zip_desc = None
    if args.verify_zip:
        zip_blob = load_zip_blob(args.verify_zip)
        zip_desc = args.verify_zip
    elif args.zip:
        zip_blob = load_zip_blob(args.zip)
        zip_desc = args.zip
    elif args.version and not args.ootmm_repo:
        ns = SimpleNamespace(zip=None, version=args.version, cache_dir=args.cache_dir)
        _version, zip_desc, zip_blob = get_zip_bytes(ns)

    if zip_blob is not None:
        if not combo_bases:
            combo_bases, src_dir = find_combo_bases(tag)
            if combo_bases:
                print(f"# combo bases from {src_dir}/live_addrs.json: "
                      f"oot 0x{combo_bases.get('oot'):08x}, "
                      f"mm 0x{combo_bases.get('mm'):08x}")
            else:
                print("!! no --combo-base-* given and no comboConfigLive "
                      "found in live_addrs.json", file=sys.stderr)
        scan_ok, _derived = run_scan_report(
            zip_blob, zip_desc, combo_bases, layout, info
        )
        all_ok = all_ok and scan_ok

    # ---- write ----------------------------------------------------------- #
    if args.write:
        if layout is None:
            ap.error("--write requires --ootmm-repo and --version (Quelle A)")
        if args.verify_zip and not all_ok:
            print("\nrefusing to --write: the payload scan did not exactly "
                  "confirm the struct layout", file=sys.stderr)
            return 2
        if errors or not all_ok:
            print("\nrefusing to --write: a check failed above",
                  file=sys.stderr)
            return 2
        with open(args.write, "w") as fh:
            json.dump(layout, fh, indent=2)
            fh.write("\n")
        print(f"\nwrote {args.write}")
        print("json: " + json.dumps(layout))

    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
