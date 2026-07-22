# MIT-licensed fallback assets

The tracker's map marker icons (`public/images/map_icons/`) and song-event icons
(`public/images/song_events/`) are **Copyright (c) BusinessAlex** and may not be
redistributed or reused without permission (see `../../../LICENSE_ASSETS.md`).

To keep the default build free of those assets, they are **opt-in**. Unless the build
flag

```
I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES=TRUE
```

is set, the app loads the **MIT-licensed placeholder icons in this folder instead**:

- `fallback/map_icons/<name>.png` — used in place of `images/map_icons/<name>.png`
- `fallback/song_events/<name>.png` — used in place of `images/song_events/<name>.png`

## Requirements for files placed here

- Must be **MIT-licensed** (or otherwise freely redistributable) artwork you own or are
  permitted to ship.
- **Mirror the filenames** of the restricted set so every referenced icon resolves. The
  easiest approach is a 1:1 filename match for every `.png` in `../map_icons/` and
  `../song_events/`. A missing file just renders as a broken image in the default build.

`npm run generate:fallback-check` (also run automatically in `predev`/`prebuild`) prints a
warning listing any restricted filename that has no fallback counterpart yet.

When the permission flag _is_ set, this folder is pruned out of the build output entirely.
