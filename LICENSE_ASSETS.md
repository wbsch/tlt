# Asset License Notice

This repository's source code is licensed under the MIT License (see `LICENSE.txt`).

However, images, map assets, map marker icons, and similar media files are **not** licensed under MIT unless explicitly stated otherwise in the asset file itself.

In particular, maps, map marker icons, and certain other images used throughout the tracker are Copyright (c) BusinessAlex.

You may not reuse, redistribute, or sublicense those assets without explicit permission from the asset copyright holder.

## Opt-in build flag for restricted assets

The map marker icons (`public/images/map_icons/`) and song-event icons (`public/images/song_events/`) are **opt-in**. By default the build substitutes an MIT-licensed placeholder set from `public/images/fallback/`, and the restricted assets are pruned from the build output.

Only a build that explicitly asserts permission uses the restricted assets:

```
I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES=TRUE
```

Set this flag (env var or a gitignored `.env.local`) **only** if you have obtained permission from BusinessAlex. See `public/images/fallback/README.md` for how the fallback set is structured.
