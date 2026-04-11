/// <reference types="node" />

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  decodeHashPayloadToSnapshot,
  parseSharePayloadFromLocationHash,
} from '../../src/utils/shareState';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';
import { filterEntranceOverridesForSettings } from '../../packs/ootmm/src/utils/entranceRandomization';

function loadSavedDebugSession() {
  const html = readFileSync('public/debug.html', 'utf8');
  const href = html.match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error('Saved debug state link not found');

  const payload = parseSharePayloadFromLocationHash(new URL(href).hash);
  if (!payload) throw new Error('Saved debug state payload missing');

  const { snapshot } = decodeHashPayloadToSnapshot(payload);
  return snapshot.stores['ootmm-session'] ?? {};
}

describe('preCompletedDungeons', () => {
  it('keeps GBT itself unreachable while still exposing the entrance row', async () => {
    const session = loadSavedDebugSession();
    const settings = structuredClone(
      (session.trackerSettings as Record<string, unknown> | undefined) ?? {},
    );
    const overrides = filterEntranceOverridesForSettings(
      structuredClone(
        (session.entranceOverrides as Record<string, string> | undefined) ?? {},
      ),
      settings,
    );

    const tracker = new OoTMMTracker();
    await tracker.initialize({
      ...settings,
      plando: {
        ...((settings.plando as Record<string, unknown> | undefined) ?? {}),
        ...(Object.keys(overrides).length > 0 ? { entrances: overrides } : {}),
      },
    });

    tracker.setPreCompletedDungeons(
      ((session.preCompletedDungeons as string[] | undefined) ?? []).slice(),
    );

    const inventory = new Map(
      Object.entries(
        (session.inventoryById as Record<string, number> | undefined) ?? {},
      ),
    );
    const result = tracker.checkReachability(inventory);
    const reachableEntranceIds = new Set(
      (result.extra?.reachableEntranceIds as string[] | undefined) ?? [],
    );

    expect(reachableEntranceIds).toContain('MM_TEMPLE_GREAT_BAY');
    expect(reachableEntranceIds).not.toContain('MM_GREAT_BAY_FROM_TEMPLE');
    expect(
      result.reachableLocationIds.filter((id: string) =>
        id.includes('MM Great Bay Temple'),
      ),
    ).toHaveLength(0);
  }, 30000);
});
