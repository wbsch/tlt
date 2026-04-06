import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeHashPayloadToSnapshot,
  parseSharePayloadFromLocationHash,
} from '@/utils/shareState';
import { OoTMMTracker } from '@packs/ootmm/tracker';
import { filterEntranceOverridesForSettings } from '@packs/ootmm/utils/entranceRandomization';

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
  it('auto-collects pre-completed dungeon checks without making the dungeon reachable', async () => {
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

    const preCompletedLocationIds = tracker.getPreCompletedLocationIds();
    const result = tracker.checkReachability(
      new Map(
        Object.entries(
          (session.inventoryById as Record<string, number> | undefined) ?? {},
        ),
      ),
    );
    const reachableEntranceIds =
      (result.extra?.reachableEntranceIds as string[] | undefined) ?? [];

    expect(
      preCompletedLocationIds.some((id) =>
        id.startsWith('MM Great Bay Temple Entrance Chest@'),
      ),
    ).toBe(true);
    expect(reachableEntranceIds).not.toContain('MM_TEMPLE_GREAT_BAY');
    expect(reachableEntranceIds).not.toContain('MM_GREAT_BAY_FROM_TEMPLE');
    expect(
      result.reachableLocationIds.filter((id) =>
        id.includes('MM Great Bay Temple'),
      ),
    ).toHaveLength(0);
  }, 30000);
});
