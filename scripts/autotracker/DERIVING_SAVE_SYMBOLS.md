# Deriving the autotracker save-global addresses (`missingPatchfileSymbols`)

Instructions for future me. This is about the four `live_addrs.json` values that
the OoTMM `.ootmm` patchfile does **not** contain:

| game | key in `live_addrs.json` | payload symbol      | what it is                                         |
| ---- | ------------------------ | ------------------- | -------------------------------------------------- |
| oot  | `sharedCustomSaveLive`   | `gSharedCustomSave` | OoTMM shared custom save (in OoT payload)          |
| oot  | `foreignSaveLive`        | `gMmSave`           | the embedded **MM** save (foreign), size `0x3ca0`  |
| mm   | `sharedCustomSaveLive`   | `gSharedCustomSave` | OoTMM shared custom save (in MM payload)           |
| mm   | `foreignSaveLive`        | `gOotSave`          | the embedded **OoT** save (foreign), size `0x1354` |

`rawFrameParser.ts` reads them as `liveAddrs.<game>.foreignSaveLive` /
`.sharedCustomSaveLive` (with **stale** hardcoded fallbacks — don't trust those,
they lag several versions). Wrong addresses = the tracker silently reads garbage
for foreign-game/shared state, so get these right on every OoTMM version bump.

## Ground rule: never build OoTMM

**Do not build OoTMM to get these addresses — not the ROM, not the payloads, not
the CMake targets. The published web build is enough.** Everything below works
off the artifacts `ootmm.com` already ships. If a step seems to call for a local
build, that step is wrong; stop and say so rather than kicking off a toolchain.

## Why they're "missing"

They live in `.bss` (zero-initialised), so they have no data signature, and they
are **not** exported by the patchfile nor by the website's cosmetic symbol table.

So we recover them from the live website: `derive_web_symbols.py` (this dir)
pulls the _stripped_ payload the web generator ships and scans the payload code
for the addresses. This is **the** method — see the workflow below.

> Sibling script `find_missing_symbols.py` parses the UNSTRIPPED payload ELFs
> (`oot`/`mm` CMake targets built with `-Wl,--emit-relocs`) instead. It is kept
> only for the case where such ELFs already exist on disk — it is **not** a
> reason to produce them. Building OoTMM to feed it is out of scope.

## How the website ships the data

The generator runs client-side and downloads a per-version, content-hashed zip.
The chain (all under `https://static.ootmm.com`, hashes change every release):

```
ootmm.com/gen/vXX.Y                       (SPA shell)
  -> static.ootmm.com/config.json         (version -> generator iframe html path)
  -> <iframe html>  -> assets/index-*.js -> App-*.js -> worker-*.js
  -> static.ootmm.com/assets/data-<hash>.zip
```

Inside the zip, per game:

- `oot_payload.bin` / `mm_payload.bin` — raw **stripped** big-endian MIPS VRAM
  image, linked at `0x80400000` / `0x80720000`, **including the zero-filled
  `.bss`** (so the globals are addressable inside the file).
- `*_symbols_name.bin` / `*_symbols_addr.bin` — only ~10 **cosmetic** patch
  symbols (`MUSIC_NAMES`, `DPAD_COLOR`, tunic colours…). Names are NUL-separated
  ASCII; addrs are **big-endian** u32 at `index*4`. Does **not** contain the
  save globals — it's just a build fingerprint here.
- `*_patch.bin`, plus a pile of cosmetic/asset `.bin`/`.zobj`/`.zovlx` files.

There is **no** `.elf`/`.map`/`.sym`/debug file anywhere. That's the whole
reason the code-scan below exists.

## The code-scan method

The addresses are baked into the payload code as `lui/addiu` immediate pairs. We
simulate registers linearly and, at every `jal` (applying the branch **delay
slot** first, which is where MIPS sets the last arg), snapshot `$4..$7`:

- **Foreign save** — found by its vanilla, version-stable size: a call where one
  arg is `0x3ca0` (OoT payload → `gMmSave`) or `0x1354` (MM payload → `gOotSave`)
  and another arg is a zero-filled payload address. (`bzero(ptr,size)` and
  `memcpy(dst,src,size)` are both captured.)
- **`gSharedCustomSave`** — sits immediately before the foreign save. It's the
  captured zero-filled block whose own copy size ends exactly at the foreign base
  (`shared + shared_size == foreign`, small alignment pad tolerated). Its size is
  **not** hardcoded — it grows as OoTMM adds fields (`0x890` in v31.x, `0x8a0` in
  v32.0), so we read it, we don't assume it.

Cross-checks the tool prints: every block is zero-filled `.bss`;
`foreign == shared + shared_size`; and the MM `gSaveContext` anchor
(`lui 0x801f; addiu -0x990 == 0x801ef670`) is recovered, proving the
disassembly/version is sane. `initCustomSave` in the OoT payload independently
corroborates OoT (it `bzero`s `gSharedCustomSave` at `0x890` then `gMmSave` at
`0x3ca0`, then writes `gMmSave.time = 0x3fff` / `playerForm = 4`).

## Version-bump workflow

```bash
# 1. derive + eyeball (auto-fetches the version's zip; caches it)
python3 scripts/autotracker/derive_web_symbols.py v32.0

# 2. once the checks read True/OK, write them into that version's data file
python3 scripts/autotracker/derive_web_symbols.py v32.0 --write \
    packs/ootmm/src/autotracker/data/v32_0/live_addrs.json

# 3. sanity-gate with the repo validator
npm run validate:autotracker-data

# other handy modes:
python3 scripts/autotracker/derive_web_symbols.py --list          # versions
python3 scripts/autotracker/derive_web_symbols.py --zip local.zip # offline
python3 scripts/autotracker/derive_web_symbols.py --oot a.bin --mm b.bin
```

**Always confirm before trusting the output:** all `check:`/`anchor:` lines must
be `True`/`OK`. If a check fails, do **not** `--write` (the tool refuses anyway).
When that happens, in order:

1. Confirm you got the right zip for the right version (auto-discovery can grab a
   stale cache — delete the cached zip and retry, or pull the zip yourself from
   the browser Network tab and pass `--zip`).
2. Read which check failed. A broken `anchor:` means the disassembly/version is
   off; a broken adjacency `check:` means OoTMM likely moved the save layout, and
   the scan heuristics in `derive_web_symbols.py` need updating.
3. Leave `live_addrs.json` alone and report the failure. Do **not** fall back to
   building OoTMM — hand-verifying the payload beats a local build.

## Known limitations

- Auto-fetch/discovery is only verified for **v31.0+**. Older bundles lay the
  data out differently and the crawler won't find the zip — the tool prints a
  fallback: open `ootmm.com/gen/<version>` in a browser, grab
  `static.ootmm.com/assets/data-*.zip` from the Network tab, and pass `--zip`.
- The scan assumes the current layout (shared save immediately followed by the
  foreign save; vanilla foreign sizes `0x1354`/`0x3ca0`). If OoTMM ever changes
  the save architecture, revisit — the `anchor`/`check` lines will flag it by
  going `False`.

## v31.1 reference values (verified: zero-filled `.bss`, adjacency, anchor)

```
oot.sharedCustomSaveLive = 0x8044b520   (gSharedCustomSave)
oot.foreignSaveLive      = 0x8044bdb0   (gMmSave,  size 0x3ca0)
mm.sharedCustomSaveLive  = 0x8076bc40   (gSharedCustomSave)
mm.foreignSaveLive       = 0x8076c4d0   (gOotSave, size 0x1354)
```

---

# Deriving the ComboConfig tail layout (`combo_config_layout.json`)

Sibling task on every OoTMM version bump: each autotracker data directory
(`v30_1`, `v31_0`, `v31_1`, `v32_0`, …) ships its own
`combo_config_layout.json` — the tail offsets of the `ComboConfig` struct
(`OoTMM/packages/generator/include/combo/config.h`), which the parser
(`rawFrameParser.ts`) uses to validate/locate the combo config in the save
dump. The struct is DMA-loaded wholesale, so its field offsets are
**compile-time constants** baked into the payload. They changed between v30.1
and v31.0 (hints 20→21, `giZoraSapphire` moved, `songEventsMm[13]` appended) —
never assume they stay the same.

## The two sources

- **Quelle A (primary, ground truth):** the repo header at the release tag.
  Offsets are computed with C alignment rules (`u8/s8`=1, `u16/s16`=2,
  `u32/s32`=4; struct alignment = largest member). `PRICES_MAX` (= 141) is not
  in any checked-in header — it's derived from
  `packages/logic/src/price.ts` (sum of the `PRICE_COUNTS` ranges). Only reads
  the OoTMM checkout (`git show <tag>:…`), no build.
- **Quelle B (verification):** a scan of the _shipped_ payload code from the
  ootmm.com data zip (same zip fetch/cache and MIPS register simulation as
  `derive_web_symbols.py`). Finds the offsets the compiled code actually
  accesses, proving the JSON matches what players run. OoT and MM payloads
  must yield identical offsets (one layout serves both games).

Stable anchors that must never move (the parser reads them without going
through the JSON): `mq@0x9C`, `config@0xEC`, `special@0x12C`, `prices@0x15C`,
`triforce@0x276/0x278`, `hints@0x27A`. The script refuses to write if any of
them (or the parser's hardcoded `special`/`prices`/`boss`/`songEvents` counts)
changed — update `rawFrameParser.ts` and the script's `ANCHORS`/
`PARSER_CONSTANTS` first.

## Version-bump workflow

```bash
# 1. make sure the OoTMM checkout has the new tag
git -C OoTMM fetch --tags
git -C OoTMM show vX.Y:packages/generator/include/combo/config.h > /dev/null

# 2. address order matters: refresh live_addrs.json FIRST (a stale
#    comboConfigLive shifts every scan hit and fails the verification)
python3 scripts/autotracker/derive_web_symbols.py vX.Y --write \
    packs/ootmm/src/autotracker/data/vX_Y/live_addrs.json

# 3. derive the layout from the repo header and verify it against the
#    version's web zip; writes only when the scan confirms every tail offset
python3 scripts/autotracker/derive_combo_config_layout.py \
    --ootmm-repo OoTMM --version vX.Y \
    --verify-zip <aktueller data-*.zip> \
    --write packs/ootmm/src/autotracker/data/vX_Y/combo_config_layout.json

# 4. eyeball: anchors OK, size sane (0x2E9 for v31.0+), then gate with the
#    repo validator (also blocks stale layouts on future bumps)
npm run validate:autotracker-data
```

Other handy modes:

```bash
# Quelle A only (no zip needed — what `npm run validate:autotracker-data`
# and `generate:autotracker-data` invoke)
python3 scripts/autotracker/derive_combo_config_layout.py \
    --ootmm-repo OoTMM --version vX.Y

# Quelle B only, from a local zip (auto-reads comboConfigLive from
# live_addrs.json; or pass --combo-base-oot/--combo-base-mm explicitly)
python3 scripts/autotracker/derive_combo_config_layout.py \
    --zip /tmp/data-xxxx.zip
python3 scripts/autotracker/derive_combo_config_layout.py \
    --zip /tmp/data-xxxx.zip --combo-base-oot 0x80449b28 --combo-base-mm 0x8076a5d8

# Quelle B with auto-fetch (like derive_web_symbols.py)
python3 scripts/autotracker/derive_combo_config_layout.py \
    --version vX.Y --combo-base-oot 0x80449b28 --combo-base-mm 0x8076a5d8
```

## How the scan finds the tail

For every `lb/lh/lwl/lw/lbu/lhu/lwr`/`sb/sh/swl/sw/swr` whose effective
address lands in `[comboConfigLive, +0x300)`, the offset is recorded with its
access kind. The tail fields then read as:

- `boss` = first `lbu` access **after** the staticHints `lb` accesses
  (staticHints is `s8[]` → read signed; `boss[12]` onward are `u8` → `lbu`).
  The plan's naive "smallest `lbu` ≥ 0x2A0" is NOT enough: the OoT payload
  also reads `ganonBossKey` (`lbu @0x2A2/0x2A3`, inside hints) — the
  `lb`-run discriminator excludes it.
- `strayFairyRewardCount` = `boss+12`, `bombchuBehaviorOot` = `boss+13`,
  `bombchuBehaviorMm` = `boss+14`, `songEvents` = `boss+15` (the u8 chain is
  contiguous). `size` = `songEvents + 0x12`, plus `0xd` if `songEventsMm`
  exists — which the scan cannot see directly (loop-indexed accesses), so it
  comes from Quelle A and is confirmed by the `size`/verify comparison.
- `songEventsOot/Mm` themselves are loop-indexed (no static offset in code) —
  they are not directly hit; `verify` checks them via the chain and the
  struct-derived offsets.
- A wrong/stale `comboConfigLive` shifts every hit by exactly the delta and
  fails the verification — that mismatch is itself the error indicator.

## Fallstricke / notes

- **`giZoraSapphire`** is only statically accessed by the OoT payload (MM
  never reads it) — its `verify` line is informational, not blocking.
- **`staticHintCount`** (20 vs 21) cannot be derived from the scan (only hit
  indices 6/7 or 9-20 appear); it comes from Quelle A and is validated by the
  parser's `validateOotComboConfig` loop bound.
- **size semantics:** the JSON stores the end of the last _used_ field (745 =
  `0x2E9` for v31.0+), not C `sizeof` (which pads to the struct alignment,
  748). The parser only reads `size` bytes, so this is the usable size. The
  v30.1 JSON predates this and stores the padded 732 — historical quirk, not
  worth changing.
- **`validate_data.ts`** regenerates the layout from the repo header on every
  run and requires an exact match — a struct change in a bump blocks the build
  until the JSON (and, if anchors moved, the parser) is updated.
- Auto-fetch/discovery for the zip only works for **v31.0+** (same limitation
  as `derive_web_symbols.py`); older bundles need a manually downloaded zip
  via `--zip`.
