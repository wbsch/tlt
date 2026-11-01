import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OoTMMTracker } from '../../packs/ootmm/src/tracker';
import {
  filterEntranceOverridesForSettings,
  getActiveEntranceKeys,
} from '../../packs/ootmm/src/utils/entranceRandomization';
import { decodeHashPayloadToSnapshot } from '../../src/utils/shareState';

describe('traceLocationPath', () => {
  it('reconstructs a multi-step path for reachable interior checks', async () => {
    const tracker = new OoTMMTracker();
    await tracker.initialize();

    const inventory = tracker.getItemMaxCounts();
    const result = tracker.traceLocationPath(
      'OOT Kakariko Bazaar Item 1@0',
      inventory,
    );

    expect(result.reachable).toBe(true);
    expect(result.areaPath).not.toBeNull();
    expect(result.areaPath?.length).toBeGreaterThan(1);
    expect(result.areaPath?.at(-1)).toBe('OOT Kakariko Bazaar');
    expect(result.areaPath).toContain('OOT Kakariko');
  }, 30000);

  it('keeps the parent chain of age-swapped areas (test preset regression)', async () => {
    // `?preset=test` reaches this check through an age swap. The swapped area
    // used to be recorded as a root because the source area was not yet in the
    // pathfinder state, which made the trace stop at the check's own room.
    const config = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'public/shared-states.json'),
        'utf8',
      ),
    ) as Record<string, string>;
    const hashContent = config.test.replace(/^#/, '');
    const encodedPayload = new URLSearchParams(hashContent).get('s');
    expect(encodedPayload).toBeTruthy();

    const { snapshot } = decodeHashPayloadToSnapshot(encodedPayload!);
    const session = snapshot.stores['ootmm-session'] as {
      trackerSettings: Record<string, unknown>;
      entranceOverrides?: Record<string, string>;
      preCompletedDungeons?: string[];
    };
    const settings = session.trackerSettings;
    const existingPlando = (settings.plando as Record<string, unknown>) ?? {};
    const { entrances: _stale, ...cleanPlando } = existingPlando;
    const isErActive = getActiveEntranceKeys(settings).size > 0;
    const normalizedOverrides = filterEntranceOverridesForSettings(
      session.entranceOverrides ?? {},
      settings,
    );
    const settingsWithEntrances = {
      ...settings,
      plando: {
        ...cleanPlando,
        ...(isErActive && Object.keys(normalizedOverrides).length > 0
          ? { entrances: { ...normalizedOverrides } }
          : {}),
      },
    };

    const tracker = new OoTMMTracker();
    await tracker.initialize(
      settingsWithEntrances as Parameters<OoTMMTracker['initialize']>[0],
    );
    tracker.setPreCompletedDungeons(session.preCompletedDungeons ?? []);

    const result = tracker.traceLocationPath(
      'OOT Dodongo Cavern Pot Green Room Pot 1@0',
      tracker.getItemMaxCounts(),
    );

    expect(result.reachable).toBe(true);
    expect(result.areaPath?.[0]).toBe('OOT SPAWN');
    expect(result.areaPath?.at(-1)).toBe('OOT Dodongo Cavern Green Room');
    expect(result.areaPath?.length).toBeGreaterThan(1);
  }, 30000);
});
