<h1 align="center">
  <img src="https://www.thelasttracker.org/images/thelasttracker.avif" alt="definitely not a unicorn" width="192" />
</h1>

The Last Tracker (TLT) is a modular web tracker for randomized games.

It is live at [www.thelasttracker.org](https://www.thelasttracker.org/)

Yes, the tracker name and logo are a reference to an 80s movie. No, it does not make a whole lot of sense. It was the best name we could come up with though. Plus, there's a ~~unicorn~~ horsey, so deal with it.

Right now, this repository ships with one tracker pack only:

- `OoTMM`: Ocarina of Time / Majora's Mask Randomizer

## What It Does

The OoTMM pack is a map tracker with full logic, meaning it knows which checks are currently accessible based on the settings used as well as the items the player has found so far.

It:

- Tracks inventory and checked locations.
- Computes reachability using OoTMMR logic.
- Shows map-based check markers with reachability and collected state.
- Supports spoiler log import (file picker or drag-and-drop).
- Supports most relevant settings and tricks.
- Includes undo/redo functionality.
- Automatically persists tracker/UI state across browser sessions.

## Unsupported Settings

All settings that were available in the randomizer's code on March 15, 2026 (Version 30.1) are supported by this tracker. Excluded from this are:

- All Entrance Randomizer settings except Dungeon Entrance Shuffle and Grotto Shuffle

There are a few settings the tracker does not represent because they are not relevant for tracking (e.g., OoT Shields). Nevertheless, The Last Tracker can be used for all options within those settings -
you will still see what's available for you.

## Dev / Build Requirements

- `OoTMM` source tree present at `./OoTMM`
- Prebuilt OoTMM core artifacts available at `OoTMM/packages/core/lib/combo`

## Getting Started

```bash
npm install
npm run dev
```

Dev server default:

- `http://localhost:5173`

Production build:

```bash
npm run build
```

## Useful Commands

- `npm run format`
- `npm run lint`
- `npm run type-check`
- `npm run audit:images` (writes `reports/image-usage-report.json` with needed/missing/unused image assets)
- `npm run test:e2e`
- `node --import tsx scripts/pathfinder-tests/reachability_full_inventory.ts` (logic reachability sanity check)

## Debug / Dev Flags

- `?debug=1`
  - Enables the **Debug: Activate All** button in the app header.
- `?devmode=1`
  - Enables map-dev mode UI for map marker diagnostics.

Example:

- `http://localhost:5173/?debug=1`
- `http://localhost:5173/?debug=1&devmode=1`

## Credits

- Reachability calculation makes direct use of the [OoTMM randomizer core logic](https://github.com/OoTMM/OoTMM)
- Maps, map marker icons, and certain other images used throughout the tracker are Copyright (c) BusinessAlex. Contact for those assets: BusinessAlex on Discord.
- If you clone/reuse the tracker, these assets must be replaced unless you have explicit permission from BusinessAlex to continue using them.

## Licensing

- Source code: [MIT License](./LICENSE.txt)
- Images and map-related assets: [Asset License Notice](./LICENSE_ASSETS.md)
