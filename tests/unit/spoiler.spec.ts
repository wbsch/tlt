import { describe, expect, it } from 'vitest';
import {
  getSpoilerLogPlayerOptions,
  parseSpoilerLog,
} from '../../packs/ootmm/src/utils/spoiler';

describe('spoiler parsing', () => {
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
});
