import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type MapSchema = {
  $defs?: {
    entranceMenuConfig?: {
      properties?: {
        entranceIds?: {
          items?: {
            enum?: string[];
          };
        };
      };
    };
    submenuEntry?: {
      properties?: Record<string, unknown>;
    };
    submenuMarker?: {
      properties?: Record<string, unknown>;
    };
    songEventMenu?: {
      properties?: {
        eventId?: { enum?: number[] };
        game?: { enum?: string[] };
      };
    };
  };
};

describe('ootmm map schema', () => {
  it('includes boss entrance ids in the tracked entrance enum', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve('packs/ootmm/src/data/schemas/ootmm-map.schema.json'),
        'utf8',
      ),
    ) as MapSchema;

    const entranceIds =
      schema.$defs?.entranceMenuConfig?.properties?.entranceIds?.items?.enum ??
      [];

    expect(entranceIds).toContain('OOT_BOSS_TEMPLE_FOREST');
    expect(entranceIds).toContain('MM_BOSS_TEMPLE_WOODFALL');
  });

  it('accepts the anchored flag on submenu entries', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve('packs/ootmm/src/data/schemas/ootmm-map.schema.json'),
        'utf8',
      ),
    ) as MapSchema;

    const submenuEntryProps = schema.$defs?.submenuEntry?.properties ?? {};
    expect(submenuEntryProps).toHaveProperty('anchored');
    expect(submenuEntryProps.anchored).toEqual({ type: 'boolean' });
  });

  it('supports song event menus on submenu entries', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve('packs/ootmm/src/data/schemas/ootmm-map.schema.json'),
        'utf8',
      ),
    ) as MapSchema;

    const submenuEntryProps = schema.$defs?.submenuEntry?.properties ?? {};
    expect(submenuEntryProps).toHaveProperty('songEventMenu');
  });

  it('supports song event menus on submenu markers', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve('packs/ootmm/src/data/schemas/ootmm-map.schema.json'),
        'utf8',
      ),
    ) as MapSchema;

    const submenuMarkerProps = schema.$defs?.submenuMarker?.properties ?? {};
    expect(submenuMarkerProps).toHaveProperty('songEventMenu');

    const songEventMenuProps = schema.$defs?.songEventMenu?.properties ?? {};
    expect(songEventMenuProps.eventId?.enum).toContain(0);
    expect(songEventMenuProps.eventId?.enum).toContain(30);
    expect(songEventMenuProps.game?.enum).toEqual(['oot', 'mm']);
  });
});
