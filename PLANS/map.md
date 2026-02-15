## Map View Plan (Merged With User Input Overrides)

## Summary

- Rendering stack: `DOM + Vue layers`.
- Marker strategy: mixed (`per-check` in sparse areas, grouped in dense areas).
- Navigation v1: pan + wheel/pinch zoom.

## Canonical Marker Schema

```ts
type MapMarkerDef = {
  coords: [number, number];
  image: string;
  overlays?: Array<
    | 'child'
    | 'adult'
    | 'jp_only'
    | 'na_only'
    | 'day1'
    | 'day2'
    | 'day3'
    | 'night'
    | 'day'
    | 'broken'
  >;
  codes: string | string[];
};
```

Example:

```js
{
  coords: [123, 456],
  image: "business_scrub_oot",
  overlays: ["child", "night", "broken"],
  codes: "OOT Bottom of the Well Grass 01"
}
```

Runtime note:

- In source JSON, marker `mapId` is implicit from the containing map file.
- Loader may derive an internal/runtime `mapId` field for debugging and future global features.

## Image Handling

- `image` currently maps conceptually to `images/map_icons/<image>.png`.
- Do not hardcode storage path or extension in component logic.
- Add an asset resolver abstraction so image source can be moved later without changing marker data format.
- Base icon + overlays are one combined click target.

## Overlay Rules (Authoritative)

- Overlays are optional; empty array is valid.
- If `overlays` is empty, render no default overlays.
- Overlay placement:
  - top-left: `child` / `adult` / `jp_only` / `na_only` / `day1` / `day2` / `day3`
  - bottom-left: `night` / `day`
  - top-right: `broken` -> `images/attributes/broken_actor.png`
  - bottom-right: `count`
- Top-left asset source rules:
  - `child` / `adult` / `day1` / `day2` / `day3` use `images/attributes/<overlay>.png` when rendered as single overlays.
  - `jp_only` and `na_only` MUST be loaded from `images/attributes_wide/<overlay>.png` (not from `images/attributes/`).
  - `day1` + `day2` + `day3` are never all present at once.
  - If exactly two of (`day1`, `day2`, `day3`) are present, render exactly one combined top-left overlay from `images/attributes_wide/`:
    - `day1` + `day2` -> `day1_and_2.png`
    - `day1` + `day3` -> `day1_and_3.png`
    - `day2` + `day3` -> `day2_and_3.png`
  - If exactly one of (`day1`, `day2`, `day3`) is present, render its single image from `images/attributes/`.
- `count` overlay:
  - ALWAYS active (if number of reachable checks >1, so not for only 1 reachable), not listed in `overlays` array
  - based on number of currently reachable checks for that marker.
  - intended for multi-check markers (`codes` array / count > 1).
  - render digits using `images/numbers/<digit>.png`.
  - support multi-digit values (e.g. `12` uses two digit icons, right-aligned in bottom-right).

## Codes Semantics (Authoritative)

- `codes` type: `string | string[]`.

For `codes: string`:

- Visibility: marker is shown when that location is reachable and not checked.
- Click: mark that location checked.

For `codes: string[]`:

- Visibility: marker is shown when at least one location in array is reachable and unchecked.
- Click behavior:
  - If only one code effectively available, allow direct check toggle.
  - If more than one code, open popup first.
  - Popup includes:
    - each individual location/code as clickable row
    - `Mark all checked` action
  - `Mark all checked` only checks currently reachable locations.

Future override support:

- Add a visibility mode switch, defaulting to `reachable-unchecked`:

```ts
type MarkerVisibilityMode = 'reachable-unchecked' | 'reachable-any';
```

- v1 behavior uses `reachable-unchecked`. `reachable-any` can be enabled later to keep checked markers visible.

## Popup Requirements

- Popup content is fully interactive (buttons/links/icons/overlays).
- Popup can display marker icon and overlays.
- Popup rows represent individual checks with their current reachable/checked state.
- Keep keyboard support (`Esc`, focusable controls).

## UI Architecture

1. Create `packs/ootmm/src/components/OoTMMMap.vue`.
2. Render layers:

- map base image
- marker buttons (`16x16` default icon size)
- overlay sublayer inside each marker
- popup layer (interactive)

3. Wire state from existing stores:

- `reachableLocationIdSet`
- `collectedLocationIds`
- no settings/context dependency for overlays in v1 (overlay rendering uses marker data only).

## Map Definitions (v1)

Use a per-map contract that contains its own markers:

```ts
type MapDef = {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  markers: MapMarkerDef[];
};
```

- `image` is resolved by the map asset resolver.
- `width`/`height` define coordinate-space dimensions for marker placement and pan/zoom bounds.
- `OoTMMMap` receives one selected `activeMap`, so marker filtering is not needed inside the map component.

## Filesystem Layout (Preferred)

- Map images:
  - `public/images/maps/<map-id>.png`
- Map data (one file per map):
  - `packs/ootmm/src/data/maps/<map-id>.json`
- Optional aggregator:
  - `packs/ootmm/src/data/maps/index.ts` that imports all map JSON files and exports `MapDef[]`.

Example `packs/ootmm/src/data/maps/oot_overworld.json`:

```json
{
  "id": "oot_overworld",
  "title": "OOT Overworld",
  "image": "oot_overworld",
  "width": 4096,
  "height": 3072,
  "markers": [
    {
      "coords": [123, 456],
      "image": "business_scrub_oot",
      "codes": "OOT Bottom of the Well Grass 01"
    }
  ]
}
```

## Pan/Zoom

- Implement transformed viewport with:
  - drag pan
  - wheel zoom
  - pinch zoom
  - clamped scale and bounded panning.
- Keep marker hitboxes aligned under transforms.
- Default constants for v1:
  - min scale: `0.5`
  - max scale: `3`
  - initial scale: fit map to viewport (`contain`)
  - wheel zoom factor: `1.1` per step
  - pan bounds: clamp to map extents after transform (no elastic overscroll in v1)

## Public Interfaces To Add

1. `MapMarkerViewModel`

- `id`, `coords`, `image`, `overlays`, `codes`, `reachableCount`, `checkedCount`, `isVisible`.

2. `MapPopupPayload`

- `markerId`, `title`, `entries[]`, `canMarkAll`, `markAllAffectsReachableOnly`.

3. `OoTMMMap` props/emits

- Props: `activeMap`, `reachableIds`, `collectedIds`.
- Emits:
  - `toggle-collected(checkId)`
  - `mark-all-reachable(checkIds[])`
  - `open-popup(markerId)`
  - `close-popup()`.

Parent responsibility:

- Manage map tabs/selection and pass the selected `activeMap` into `OoTMMMap`.

## Implementation Steps

1. Add per-map JSON definitions in `packs/ootmm/src/data/maps/` and load them via an index module.
2. Add asset resolver for `image`/overlay/digit icon paths (no hardcoded map-icons dependency in marker schema).
3. Implement `OoTMMMap.vue` base rendering + marker click target composition.
4. Implement overlays (including multi-digit `count`).
5. Implement `codes` semantics and popup logic exactly as above.
6. Integrate with session store collected/reachable state.
7. Add pan/zoom and keep pointer behavior stable.

## Tests / Validation

1. Single-code marker:

- visible only when reachable + unchecked; click checks it.

2. Multi-code marker:

- visible when any code reachable + unchecked.
- popup appears when multiple checks are present.
- `Mark all checked` affects reachable checks only.

3. Overlay rendering:

- no overlays rendered when list is empty (except if count >1)
- position mapping is correct for all overlay types.
- count overlay renders multi-digit values with number images.

4. Interaction:

- marker + overlays behave as one click target.
- popup controls are clickable and keyboard accessible.

5. Navigation:

- marker hitboxes stay aligned under pan/zoom.

6. Tracker integrity:

- `Debug: Activate All` still reaches all checks.

7. Build:

- `npm run build` succeeds.

## Constraints

- Do not modify `OoTMM/` (external library repo).
