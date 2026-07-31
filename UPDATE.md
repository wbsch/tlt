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

# 2. Build just the @ootmm/core package (ALWAYS required — this is what
# actually picks up the new release's data)
# This generates `packages/core/dist/data-*.json` (data-world.json,
# data-entrances.json, data-gossips.json, ...), which our
# `generate:map-schema` script and the '@ootmm/data' bridge expect to read.
npx pnpm --filter @ootmm/core build

cd ..

# 3. Update the CI OoTMM pin in `.github/workflows/check-most.yml`.
# Resolve the release tag to the commit it points at:
git ls-remote --tags https://github.com/OoTMM/OoTMM.git refs/tags/v32.0 refs/tags/v32.0^{}

# Use the commit from the upstream OoTMM repository for `OOTMM_COMMIT`.
# Do not use a local-only performance/test commit from your `OoTMM/` checkout.

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

- `validate:autotracker-data` does not check `live_addrs.json` (it is absent from
  that script's `EXACT_FILES`), so `check-all` and CI stay green.
- The file is structurally valid, so nothing fails at runtime either. Autotracking
  simply reads the wrong memory addresses and reports nonsense.

So after regenerating, confirm the file really came from this release:

```bash
python3 -c "import json;print(json.load(open('packs/ootmm/src/autotracker/data/v32_0/live_addrs.json'))['generatedFrom'])"
```

If `patchfile` points at someone else's home directory or an old seed, it is
stale — regenerate with `OOTMM_PATCHFILE` set to a seed built from this release.

Related: `packs/ootmm/src/autotracker/data/versions.ts` deliberately gates which
versions are enabled for autotracking. Leave a new version out of that list until
its `live_addrs.json` is confirmed good; adding the data directory alone is safe.

### Dealing with Upstream Restructuring

If `check-all` or `build` fails after an update, it is highly likely that `OoTMM` refactored its internal file structure. You will typically see Vite Rollup errors, "module not found" errors, or missing-file errors from the generator scripts.

To fix this:

1. Search within the `OoTMM/packages/` directory (and the top-level `OoTMM/data/` directory) to see where the missing files (like `logic/...`, `items/...`, or `settings/...`) were relocated.
2. Update the explicit path aliases in both `vite.config.ts` (under `resolve.alias`) and `tsconfig.json` (under `compilerOptions.paths`) to point perfectly to the new, granular locations.
3. Remove trailing file extensions (e.g., `.js`) in imports if the randomizer rewrites those endpoints into pure TypeScript.

Reference: state after the v30.1 → v31.0 restructuring (how things are wired now):

- Upstream deleted the `@ootmm/data` package (`packages/data/`). The yaml/csv
  sources moved to the top-level `OoTMM/data/` directory (e.g.
  `data/defs/gi.yml`), and the JSON build outputs are produced by
  `@ootmm/core` into `packages/core/dist/`.
- The tracker's `@ootmm/data` alias points at `scripts/ootmm_data_bridge.ts`,
  which re-exports `OoTMM/packages/core/src/data/data.ts` and reconstructs
  the removed `RAW_HINTS_DATA` export from `data-gossips.json` (the successor
  of `data-hints-raw.json`; its records carry game-prefixed location names).
- The old `packages/generator/lib/combo/logic/` moved to the new
  `packages/logic/src/` package (aliased as `@ootmm/core/logic`); `items/`
  and `monitor.ts` moved into `packages/core/src/`. Two logic submodules were
  renamed and have dedicated aliases: `entrance` → `solver/entrances.ts` and
  `is-shuffled` → `helpers.ts`.
- Upstream stopped exporting the `LogicPassEntrances` class; the tracker now
  calls the exported `logicPassEntrances(input)` wrapper instead.
- Python scripts that read OoTMM data (`scripts/sync_gi_items.py`,
  `scripts/check_map_locations.py`, `scripts/autotracker/*.py`) read from
  `OoTMM/data/` and `OoTMM/packages/core/dist/`. The MM boss clear-state
  discovery in `generate_special_locations.py` reads
  `packages/logic/src/data/boss.ts`.

After a data update, `python3 scripts/check_map_locations.py` may report new
locations that are not yet placed on any tracker map — that is content work,
not a pipeline failure (the build only warns).
