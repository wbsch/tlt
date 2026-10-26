# Updating Items For A New OoTMM Release

This tracker reads item definitions from the OoTMM randomizer’s `gi.yml` and then regenerates the tracker’s item list and display names.

## Prerequisites

- The OoTMM randomizer lives in the `OoTMM/` folder and is treated as an external repository. Update it separately (e.g., `git pull` inside `OoTMM/`).
- Do **not** edit files under `OoTMM/` from this repo.

## Update Steps

1. Update the `OoTMM/` folder to the new release (outside this repo’s code changes).
2. Regenerate the tracker item data from the new `gi.yml`:

```bash
python scripts/sync_gi_items.py
```

This regenerates:

- `packs/ootmm/src/data/giItems.ts` (ID → display name from `gi.yml`)
- `packs/ootmm/src/data/items.ts` (full tracker item database; now includes all `gi.yml` IDs)

3. (Optional) If the new release introduces items that should have special counters or icons, update the heuristics in:

- `scripts/sync_gi_items.py` (`get_max_count`, `get_icon`, `get_category`)

4. Build to ensure everything still compiles:

```bash
npm run build
```

## Notes

- The UI uses `gi.yml`-derived display names via `packs/ootmm/src/data/giItems.ts`, so names like "Zelda’s Letter" come directly from the randomizer.
- The “All Items” list only includes IDs present in `gi.yml`.

# Updating the underlying OoTMMR release

When a new version of the OoTMM randomizer is checked out in the `OoTMM/` folder, you must prepare its toolchain environment before it can be successfully consumed by `The Last Tracker`.

```bash
cd OoTMM

# 1. Install workspace dependencies, but ONLY if they actually changed.
# Most releases touch no dependency manifest, and reinstalling a working
# workspace is slow for no benefit. Check first (substitute the real tags):
git diff --name-only v31.1 v32.0 | grep -E 'package\.json|pnpm-lock\.yaml'
#
# Run the install if that prints something, or if `node_modules/` is absent
# (always the case on a fresh clone and in CI). Otherwise skip to step 2.
# `--ignore-scripts` avoids triggering native compilation.
npx pnpm install --ignore-scripts

# 2. Build just the @ootmm/data package (ALWAYS required — this is what
# actually picks up the new release's data). It only turns the yaml/csv/xml
# sources in `OoTMM/data/` into JSON; it is NOT the ROM/payload build.
# This generates `packages/data/dist/lib/data-*.json` (data-world.json,
# data-entrances.json, data-gossips.json, data-checks.json, ...), which our
# `generate:map-schema` script and the '@ootmm/data' bridge expect to read.
# (Before v33 this was `--filter @ootmm/core build` writing to
# `packages/core/dist/`; v33 removed that script.)
npx pnpm --filter @ootmm/data build

cd ..

# 3. Update the CI OoTMM pin in `.github/workflows/check-most.yml`.
# Resolve the release tag to the commit it points at:
git ls-remote --tags https://github.com/OoTMM/OoTMM.git refs/tags/v32.0 refs/tags/v32.0^{}

# Use the commit from the upstream OoTMM repository for `OOTMM_COMMIT`
# (the peeled `^{}` line for an annotated tag).
# Do not use a local-only performance/test commit from your `OoTMM/` checkout.
# If step 2's build command changed, update the workflow's build step too.

# 4. If the release changed the autotracker-relevant data, regenerate it
# (validate:autotracker-data will fail during check-all/build otherwise).
# Pass a patchfile from a seed generated with THIS release -- see the
# "live_addrs.json" warning below for why this matters:
OOTMM_PATCHFILE=/path/to/OoTMM-Patch-XXXX.ootmm npm run generate:autotracker-data

# 5. Everything should now be ready for our main pipeline checks
npm run check-all
```

### Warning: `live_addrs.json` fails silently

`generate:autotracker-data` writes a per-version data directory
(`packs/ootmm/src/autotracker/data/v32_0/` and friends). Every file in there is
derived from the checked-out release **except `live_addrs.json`**, which can only
be produced from a real patchfile. Without `OOTMM_PATCHFILE` set, the generator
falls back to `selectSeedFile()` and copies whatever it finds — and because the
base data directory holds no `live_addrs.json`, the fallback lands on the legacy
`tlt_autotracker/ootmm-autotracker/ootmm/live_addrs.json`, which is old and comes
from an unrelated checkout. It does **not** fall back to the previous version's
directory, which is what you would probably expect.

This is easy to miss because nothing complains:

- `validate:autotracker-data` checks only that `live_addrs.json` exists and has
  the right shape (`schemaVersion`, plus `comboCtx`/`saveCtx`/`payload` per game).
  Its _contents_ are compared against a fresh derivation only when
  `OOTMM_PATCHFILE` is set, so without one `check-all` and CI stay green.
- The file is structurally valid, so nothing fails at runtime either. Autotracking
  simply reads the wrong memory addresses and reports nonsense.

So after regenerating, confirm the file really came from this release:

```bash
python3 -c "import json;print(json.load(open('packs/ootmm/src/autotracker/data/v32_0/live_addrs.json'))['generatedFrom'])"
```

If `patchfile` points at someone else's home directory or an old seed, it is
stale — regenerate with `OOTMM_PATCHFILE` set to a seed built from this release.

### If you have no patchfile for the new release

You can still produce a _partial_ `live_addrs.json` without one — but never let
the silent fallback above write it. Delete whatever the generator copied, then:

```bash
# 1. Base file from the checked-out release's headers + linker scripts.
#    Yields comboCtx / saveCtx / payload (enough to pass validation).
python3 scripts/autotracker/export_live_addrs.py --ootmm-repo OoTMM \
    --output packs/ootmm/src/autotracker/data/v32_1/live_addrs.json

# 2. Layer in the two save globals from the published web build.
#    See scripts/autotracker/DERIVING_SAVE_SYMBOLS.md; all check:/anchor:
#    lines must read True/OK before you --write.
python3 scripts/autotracker/derive_web_symbols.py v32.1 --write \
    packs/ootmm/src/autotracker/data/v32_1/live_addrs.json
```

Step 2 fills in the foreign/shared save globals, which the patchfile does not
export — `live_addrs.json` is only complete after both steps (or a patchfile
run).

Related: `packs/ootmm/src/autotracker/data/versions.ts` deliberately gates which
versions are enabled for autotracking. Leave a new version out of that list until
its `live_addrs.json` is confirmed good; adding the data directory alone is safe.

### The shared-save layout is derived, not mirrored

`SharedCustomSave` offsets are laid out from the checked-out headers by
`scripts/autotracker/c_struct_layout.py`, which models the N64 (MIPS o32,
big-endian) ABI: alignment padding, `ALIGNED(n)`, nested and anonymous
structs/unions, bitfield packing, and array counts from `#define`s or enum
constants. `generate_inventory_slots.py` and `derive_shared_save_offsets.py`
both go through it, so they cannot drift apart.

This replaced hand-written offset arithmetic that mirrored the struct. When v32.2
inserted `u8 silverRupees[(SR_MAX + 1) / 2]` between `coins[4]` and
`ocarinaButtonMaskOot`, the mirror kept emitting v32.1's offsets -- and because
both scripts shared the same stale assumption, they agreed with each other and
`shared_save_offsets.json` regenerated byte-identical. Nothing failed.

What this means for a version bump:

- A field inserted mid-struct is now picked up automatically. You do not need to
  diff `save.h` by hand.
- `sizeof(MmCustomSave)` is derived too. The old `--mm-custom-save-size` default
  of `0x440` (with "use 0x430 for v30.1" in its help text) is gone; the flag now
  only cross-checks and fails if it disagrees with the headers.
- If upstream uses C the engine does not model, it **raises** rather than
  guessing. Fix the engine, do not paper over it with a constant.
- `npm run test:scripts` covers the engine, including a golden test that lays out
  the checked-out `SharedCustomSave` and compares it to the committed
  `shared_save_offsets.json`.

The layout model is cross-checked against a real C compiler by
`scripts/autotracker/c_probe.py`, which re-emits the parsed typedefs as a
self-contained C file, compiles it, and reads the offsets back via
`__builtin_offsetof`. Run it directly to see the comparison:

```bash
python3 scripts/autotracker/c_probe.py
```

It is deliberately optional and cannot break a build: with no compiler on PATH,
or if the emitted probe will not compile, it skips. Only an actual disagreement
between the compiler and the engine fails, because that means one of them is
wrong about a real offset. `npm run test:scripts` runs it that way.

The probe declares its own fixed-width typedefs instead of including OoTMM's
`types.h` -- whose `u32` is `unsigned long`, 4 bytes on N64 but 8 on a 64-bit
host. For the primitives these structs use, x86-64 and MIPS o32 agree on size,
alignment and packing, and byte offsets of byte-aligned bitfields coincide too
(only the bit position within a byte flips with endianness).

Two independent cross-checks remain worth running after a bump:

- `python3 scripts/autotracker/derive_shared_save_offsets.py --inventory-slots
packs/ootmm/src/autotracker/data/<version>/inventory_slots.json` confirms the
  two generated files agree, and `--dump <full-save-dump.json>` checks the
  offsets against real hardware memory.
- `derive_web_symbols.py` reports a `detected size` for `gSharedCustomSave` read
  out of the real payload. `sharedCustomSaveSize` rounded up to 16 (the struct is
  `ALIGNED(16)`) must equal it -- e.g. v32.2's 2212 -> `0x8b0`.

Worked example of why a uniform delta is the wrong mental model: v32.2's insert
is 9 bytes plus 1 byte of realignment for the `u16` masks, so fields after it
moved by 10 -- except those past `respawn[]`, which moved by only 8, because the
4-byte alignment padding in front of `RespawnData` absorbed the other 2.

### Dealing with Upstream Restructuring

If `check-all` or `build` fails after an update, it is highly likely that `OoTMM` refactored its internal file structure. You will typically see Vite Rollup errors, "module not found" errors, or missing-file errors from the generator scripts.

To fix this:

1. Search within the `OoTMM/packages/` directory (and the top-level `OoTMM/data/` directory) to see where the missing files (like `logic/...`, `items/...`, or `settings/...`) were relocated.
2. Update the explicit path aliases in both `vite.config.ts` (under `resolve.alias`) and `tsconfig.json` (under `compilerOptions.paths`) to point perfectly to the new, granular locations.
3. Remove trailing file extensions (e.g., `.js`) in imports if the randomizer rewrites those endpoints into pure TypeScript.

Reference: how things are wired now (state after v33.0):

- The yaml/csv/xml sources live in the top-level `OoTMM/data/` directory
  (e.g. `data/defs/gi.yml`, check definitions in `data/checks/{oot,mm}/*.xml`).
- `@ootmm/data` is its own package again (`packages/data/`, removed in v31 and
  restored in v33). Its build writes the JSON to `packages/data/dist/lib/` and
  its sources are `packages/data/lib/index.ts`.
- The tracker's `@ootmm/data` alias points at `scripts/ootmm_data_bridge.ts`,
  which re-exports everything from `OoTMM/packages/data/lib/index.ts`. The
  alias also shadows the package for OoTMM's own sources, so the re-export
  must stay complete. The bridge additionally rebuilds two exports upstream
  removed:
  - `POOL` (per-game, unprefixed records) from `CHECKS` (`data-checks.json`,
    the successor of `data-pool.json` since v33; game-prefixed locations,
    items and scenes).
  - `RAW_HINTS_DATA` from `GOSSIPS` (`data-gossips.json`, the successor of
    `data-hints-raw.json` since v31).
- Logic lives in `packages/logic/src/` (aliased as `@ootmm/core/logic`). Two
  logic submodules have dedicated aliases: `entrance` → `solver/entrances.ts`
  and `is-shuffled` → `helpers.ts`. Since v33 `items/` lives in
  `packages/logic/src/items/` (still aliased as `@ootmm/core/items`), and
  `monitor.ts` and `settings/` stay in `packages/core/src/`.
- Upstream's own sources deep-import `@ootmm/core/src/...`, which needs its
  own alias ahead of the bare `@ootmm/core` one in `vite.config.ts`.
- `@ootmm/logic` and `@ootmm/data` imports _inside_ OoTMM resolve through
  OoTMM's pnpm workspace symlinks (`packages/*/node_modules/@ootmm/`), so the
  pnpm install in step 1 must have run at least once.
- Since v33 `World` has no `checks` record anymore: the static check data is
  `CHECKS_BY_LOCATION` from `@ootmm/data`, and each world only keeps
  `world.checkItems: Map<location, Item>`. The tracker's `getWorldCheck()`
  (`packs/ootmm/src/tracker.ts`) rebuilds the old record. The old `id`
  (shop/scrub flag, npc name) is folded into `key`
  (`ov << 24 | scene << 16 | value`, MM sets bit 31), and npc names come
  from a reverse `NPC` lookup. OoT MQ scrubs carry `0x80` in their flag, so
  the price slot is `flag & 0x7f`. The check type `fairy_spot` became
  `fairy-spot`.
- Upstream stopped exporting the `LogicPassEntrances` class; the tracker now
  calls the exported `logicPassEntrances(input)` wrapper instead.
- Python scripts that read OoTMM data (`scripts/sync_gi_items.py`,
  `scripts/check_map_locations.py`) read from `OoTMM/data/` and
  `OoTMM/packages/data/dist/lib/`. The MM boss clear-state discovery in
  `generate_special_locations.py` reads `packages/logic/src/data/boss.ts`.
- The autotracker generators (`scripts/autotracker/*.py`) read the v33 data
  from `OoTMM/packages/data/dist/lib/` (`data-checks.json`,
  `data-checks-xflags.json`, `data-npc.json`) instead of the removed
  `packages/generator/include/combo/xflags_data.h`, `xflag_table_*.bin` and
  `data/pool/*.csv`. `xflags` is now one global bitmap shared by both games
  (`XFLAGS_COUNT` lives in the generated
  `packages/data/dist/include/combo/data/xflags.h`), so
  `inventory_slots.py` maps both `xflagsOot` and `xflagsMm` onto it.
- v33 also removed the leading `playerId` from `ComboConfig`. The autotracker
  no longer reads that struct at all (the vanilla/MQ split and the bronze-scale
  setting come from the spoiler log), so the version-specific
  `combo_config_layout.json` files and `derive_combo_config_layout.py` are gone.
- `derive_web_symbols.py`'s zip discovery now follows Vite's relative dynamic
  imports (`./App-*.js`), which is how the v33 web build reaches
  `worker-*.js` and from there `assets/data-*.zip`. So
  `generate:autotracker-data` can derive the foreign/shared save addresses for
  a new version on its own.

Upstream also renames, merges or removes locations between releases. After a
bump, compare the old and new location sets and remove stale codes from the
maps (`packs/ootmm/src/data/maps/*.json`), `scripts/map_duplicate_whitelist.txt`
and `packs/ootmm/src/data/hintCheckLocations.ts`. The unit test
`hintCheckLocations.spec.ts` catches stale hint codes, but stale map codes
are not reported. For example, v33 removed `OOT MQ Ice Cavern Sheik Song`
(merged into `OOT Ice Cavern Sheik Song`), Kokiri Forest `Grass {Child,Adult}
Near Crawl 7/8` and `Gerudo Fortress Pot Jail 3 1/2`.

After a data update, `python3 scripts/check_map_locations.py` may report new
locations that are not yet placed on any tracker map — that is content work,
not a pipeline failure (the build only warns).
