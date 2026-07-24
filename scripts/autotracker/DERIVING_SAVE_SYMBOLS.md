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
