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

# 1. Install workspace dependencies without triggering native compilation scripts
npx pnpm install --ignore-scripts

# 2. Build just the @ootmm/core package
# This generates `packages/core/dist/data-*.json` (data-world.json,
# data-entrances.json, data-gossips.json, ...), which our
# `generate:map-schema` script and the '@ootmm/data' bridge expect to read.
npx pnpm --filter @ootmm/core build

cd ..

# 3. If the release changed the autotracker-relevant data, regenerate it
# (validate:autotracker-data will fail during check-all/build otherwise):
npm run generate:autotracker-data

# 4. Everything should now be ready for our main pipeline checks
npm run check-all
```

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
