import { describe, expect, it } from 'vitest';

import { resolveMarkerImage } from '@/../packs/ootmm/src/data/maps/assets';
import { PUBLIC_IMAGE_ASSET_VERSIONS } from '@/../packs/ootmm/src/generated/publicImageAssetVersions';
import { withBasePath } from '@/../packs/ootmm/src/utils/assetPath';

describe('asset paths', () => {
  it('appends content versions for known public image assets', () => {
    const version = PUBLIC_IMAGE_ASSET_VERSIONS['images/unknown.png'];

    expect(withBasePath('images/unknown.png')).toBe(
      `./images/unknown.png?v=${version}`,
    );
  });

  it('preserves existing query strings and hashes when appending versions', () => {
    const version = PUBLIC_IMAGE_ASSET_VERSIONS['images/unknown.png'];

    expect(withBasePath('/images/unknown.png?size=small#preview')).toBe(
      `./images/unknown.png?size=small&v=${version}#preview`,
    );
  });

  it('does not add duplicate version query params', () => {
    expect(withBasePath('/images/unknown.png?v=existing#preview')).toBe(
      './images/unknown.png?v=existing#preview',
    );
  });

  it('leaves unknown assets and directory paths unversioned', () => {
    expect(withBasePath('images/not-present.png')).toBe(
      './images/not-present.png',
    );
    expect(withBasePath('images/map_icons')).toBe('./images/map_icons');
  });

  it('versions map marker image URLs using the full file path', () => {
    const version = PUBLIC_IMAGE_ASSET_VERSIONS['images/map_icons/chest.png'];

    expect(resolveMarkerImage('chest')).toBe(
      `./images/map_icons/chest.png?v=${version}`,
    );
  });
});
