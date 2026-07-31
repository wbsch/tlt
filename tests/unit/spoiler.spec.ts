import { describe, expect, it } from 'vitest';
import {
  getSpoilerLogPlayerOptions,
  isAutotrackingSupportedSpoilerVersion,
  parseSpoilerLog,
} from '../../packs/ootmm/src/utils/spoiler';

describe('spoiler parsing', () => {
  it('extracts the OoTMM version from the spoiler header', () => {
    const parsed = parseSpoilerLog(`Seed: example-seed
Version: 9.9.9-test
SettingsString: ABCD1234

Settings
  mode: single
`);

    expect(parsed.ootmmVersion).toBe('9.9.9-test');
  });

  it('accepts supported spoiler versions for autotracking', () => {
    expect(isAutotrackingSupportedSpoilerVersion('v30.1')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('30.1')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('v31.0')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('31.0')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('v31.1')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('31.1')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('v32.0')).toBe(true);
    expect(isAutotrackingSupportedSpoilerVersion('32.0')).toBe(true);
  });

  it('rejects unsupported spoiler versions for autotracking', () => {
    expect(isAutotrackingSupportedSpoilerVersion(null)).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('')).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('v30.0')).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('30.2')).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('30.10')).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('30.1.2')).toBe(false);
    expect(isAutotrackingSupportedSpoilerVersion('v30.1-beta')).toBe(false);
  });

  it('detects multiworld players from mode and player count', () => {
    const parsed = parseSpoilerLog(`Settings
  mode: multi
  players: 2

Locations
  World 1
  Kokiri Forest (1):
    Kokiri Sword Chest: Player 2 Bow
  World 2
  Deku Tree (2):
    Compass Chest: Player 1 Hookshot
`);

    expect(parsed.startingItemsPlayers).toEqual([]);
    expect(getSpoilerLogPlayerOptions(parsed)).toEqual([1, 2]);
  });

  it('applies world-scoped spoiler settings for the selected player', () => {
    const playerOne = parseSpoilerLog(
      `Settings
  mode: multi
  players: 2

World Flags
  World 1
    Master Quest Dungeons:
      - Deku Tree
  World 2
    Master Quest Dungeons:
      - Forest Temple
`,
      { player: 1 },
    );
    const playerTwo = parseSpoilerLog(
      `Settings
  mode: multi
  players: 2

World Flags
  World 1
    Master Quest Dungeons:
      - Deku Tree
  World 2
    Master Quest Dungeons:
      - Forest Temple
`,
      { player: 2 },
    );

    expect(playerOne.worldFlags['Master Quest Dungeons']).toEqual({
      type: 'specific',
      values: ['Deku Tree'],
    });
    expect(playerTwo.worldFlags['Master Quest Dungeons']).toEqual({
      type: 'specific',
      values: ['Forest Temple'],
    });
  });

  it('captures POCKET region location placements', () => {
    const parsed = parseSpoilerLog(`Location List (2)
  POCKET (2):
    OOT Starting Ocarina: Ocarina
    OOT Starting Sword: Kokiri Sword
`);

    const pocketPlacements = parsed.locationPlacements.filter(
      (p) => p.region === 'POCKET',
    );
    expect(pocketPlacements).toHaveLength(2);
    expect(pocketPlacements[0]).toMatchObject({
      location: 'OOT Starting Ocarina',
      item: 'Ocarina',
      region: 'POCKET',
    });
    expect(pocketPlacements[1]).toMatchObject({
      location: 'OOT Starting Sword',
      item: 'Kokiri Sword',
      region: 'POCKET',
    });
  });

  it('captures POCKET region placements per world in multiworld', () => {
    const parsed = parseSpoilerLog(`Settings
  mode: multi
  players: 2

Location List (4)
  World 1 (2)
  POCKET (1):
    OOT Starting Ocarina: Ocarina
  World 2 (2)
  POCKET (1):
    OOT Starting Sword: Kokiri Sword
`);

    const world1Pocket = parsed.locationPlacements.filter(
      (p) => p.region === 'POCKET' && p.world === 1,
    );
    const world2Pocket = parsed.locationPlacements.filter(
      (p) => p.region === 'POCKET' && p.world === 2,
    );
    expect(world1Pocket).toHaveLength(1);
    expect(world1Pocket[0].item).toBe('Ocarina');
    expect(world2Pocket).toHaveLength(1);
    expect(world2Pocket[0].item).toBe('Kokiri Sword');
  });
});
