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
});
