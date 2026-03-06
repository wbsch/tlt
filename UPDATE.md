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

# 2. Build just the @ootmm/data package
# This generates `packages/data/dist/data-world.json`, which our `generate:map-schema` script expects to read.
npx pnpm --filter @ootmm/data build

cd ..

# 3. Everything should now be ready for our main pipeline checks
npm run check-all
```

### Dealing with Upstream Restructuring
If `check-all` or `build` fails after an update, it is highly likely that `OoTMM` refactored its internal file structure (e.g. splitting `@ootmm/core` into `core`, `generator`, etc.). You will typically see Vite Rollup errors, "module not found" errors, or circular export references (`DEFAULT_SETTINGS cannot be exported from index.ts`).

To fix this:
1. Search within the `OoTMM/packages/` directory to see where the missing files (like `logic/...`, `items/...`, or `settings/...`) were relocated.
2. Update the explicit path aliases in both `vite.config.ts` (under `resolve.alias`) and `tsconfig.json` (under `compilerOptions.paths`) to point perfectly to the new, granular locations.
3. Remove trailing file extensions (e.g., `.js`) in imports if the randomizer rewrites those endpoints into pure TypeScript.
