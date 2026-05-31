import { describe, expect, it } from 'vitest';

import {
  RAW_CHUNK_SPECS,
  createRawAutotrackerParser,
} from '@/../packs/ootmm/src/autotracker/rawFrameParser';
import {
  buildRawMessage,
  parseFixture,
  parsedCheckSet,
} from '../helpers/autotrackerFixtures';

const OOT_SAVE_SCENE_FLAGS_OFFSET = 0x0d0;
const OOT_SAVE_SCENE_OFFSET = 0x62;
const OOT_PERM_ENTRY_SIZE = 0x1c;
const MM_PLAYSTATE_SWITCH1_FLAGS_OFFSET = 4;
const MM_PLAYSTATE_CHEST_FLAGS_OFFSET = 16;
const MM_PLAYSTATE_COLLECT_FLAGS_OFFSET = 28;

function setU16BE(data: Uint8Array, offset: number, value: number) {
  data[offset] = (value >>> 8) & 0xff;
  data[offset + 1] = value & 0xff;
}

function setU32BE(data: Uint8Array, offset: number, value: number) {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function zeroOotSceneChestFlags(data: Uint8Array, sceneId: number) {
  const offset = OOT_SAVE_SCENE_FLAGS_OFFSET + sceneId * OOT_PERM_ENTRY_SIZE;
  setU32BE(data, offset, 0);
}

function replaceChunkData(
  fixtureName: string,
  sequence: number,
  overrides: ReadonlyMap<string, Uint8Array>,
) {
  const { fixture, message } = buildRawMessage(fixtureName, sequence);
  const seenChunkNames = new Set<string>();

  const chunks = message.chunks.map((chunk) => {
    seenChunkNames.add(chunk.name);
    const data = overrides.get(chunk.name);
    if (!data) {
      return chunk;
    }

    return {
      ...chunk,
      length: data.length,
      data: Buffer.from(data).toString('base64'),
    };
  });

  for (const [name, data] of overrides) {
    if (seenChunkNames.has(name)) {
      continue;
    }

    const spec = RAW_CHUNK_SPECS.find((entry) => entry.name === name);
    if (!spec) {
      throw new Error(`Unknown raw chunk override ${name}`);
    }

    chunks.push({
      name,
      address: spec.address,
      length: data.length,
      data: Buffer.from(data).toString('base64'),
    });
  }

  return {
    fixture,
    message: {
      ...message,
      chunks,
    },
  };
}

function buildOotLiveSceneMessage(
  fixtureName: string,
  sequence: number,
  options: {
    liveSceneId: number;
    saveSceneId?: number;
    currentRoom?: number;
    linkAgeOnLoad?: number;
    chestFlags?: number;
    collectFlags?: number;
    tempCollectFlags?: number;
  },
) {
  const base = buildRawMessage(fixtureName, sequence);
  const saveChunk = base.message.chunks.find(
    (chunk) => chunk.name === 'oot_save_state',
  );
  const sceneChunk = base.message.chunks.find(
    (chunk) => chunk.name === 'oot_playstate_scene',
  );
  const roomChunk = base.message.chunks.find(
    (chunk) => chunk.name === 'oot_playstate_room',
  );
  const linkAgeChunk = base.message.chunks.find(
    (chunk) => chunk.name === 'oot_playstate_link_age',
  );
  const flagsChunk = base.message.chunks.find(
    (chunk) => chunk.name === 'oot_playstate_flags',
  );

  if (!saveChunk) {
    throw new Error(`Fixture ${fixtureName} is missing oot_save_state`);
  }

  const saveData = Uint8Array.from(Buffer.from(saveChunk.data, 'base64'));
  zeroOotSceneChestFlags(saveData, 40);
  zeroOotSceneChestFlags(saveData, 85);
  setU16BE(
    saveData,
    OOT_SAVE_SCENE_OFFSET,
    options.saveSceneId ?? options.liveSceneId,
  );

  const sceneData = new Uint8Array(sceneChunk?.length ?? 2);
  setU16BE(sceneData, 0, options.liveSceneId);

  const roomData = new Uint8Array(roomChunk?.length ?? 1);
  roomData[0] = options.currentRoom ?? 0;

  const linkAgeData = new Uint8Array(linkAgeChunk?.length ?? 1);
  linkAgeData[0] = options.linkAgeOnLoad ?? 1;

  const flagsData = new Uint8Array(flagsChunk?.length ?? 20);
  setU32BE(flagsData, 0, options.chestFlags ?? 0);
  setU32BE(flagsData, 12, options.collectFlags ?? 0);
  setU32BE(flagsData, 16, options.tempCollectFlags ?? 0);

  const baseMessage = replaceChunkData(
    fixtureName,
    sequence,
    new Map([
      ['oot_save_state', saveData],
      ['oot_playstate_scene', sceneData],
      ['oot_playstate_room', roomData],
      ['oot_playstate_link_age', linkAgeData],
      ['oot_playstate_flags', flagsData],
    ]),
  );

  return {
    fixture: base.fixture,
    message: {
      ...baseMessage.message,
      chunks: baseMessage.message.chunks.filter(
        (chunk) => !chunk.name.startsWith('oot_save_state_'),
      ),
    },
  };
}

function buildMmLiveSceneMessage(
  fixtureName: string,
  sequence: number,
  options: {
    liveSceneId: number;
    currentRoom?: number;
    switch0Flags?: number;
    switch1Flags?: number;
    chestFlags?: number;
    collectFlags?: number;
  },
) {
  const sceneData = new Uint8Array(2);
  setU16BE(sceneData, 0, options.liveSceneId);

  const roomData = new Uint8Array(1);
  roomData[0] = options.currentRoom ?? 0;

  const flagsData = new Uint8Array(32);
  setU32BE(flagsData, 0, options.switch0Flags ?? 0);
  setU32BE(
    flagsData,
    MM_PLAYSTATE_SWITCH1_FLAGS_OFFSET,
    options.switch1Flags ?? 0,
  );
  setU32BE(flagsData, MM_PLAYSTATE_CHEST_FLAGS_OFFSET, options.chestFlags ?? 0);
  setU32BE(
    flagsData,
    MM_PLAYSTATE_COLLECT_FLAGS_OFFSET,
    options.collectFlags ?? 0,
  );

  return replaceChunkData(
    fixtureName,
    sequence,
    new Map([
      ['mm_playstate_scene', sceneData],
      ['mm_playstate_room', roomData],
      ['mm_playstate_flags', flagsData],
    ]),
  );
}

function getChecks(
  fixtureName: string,
  sequence = 1,
  parser = createRawAutotrackerParser(),
): Set<string> {
  return parsedCheckSet(
    parseFixture(parser, fixtureName, sequence).parsed.checks,
  );
}

function expectOnlyAddedChecks(
  beforeChecks: Set<string>,
  afterChecks: Set<string>,
  expectedAdded: string[],
) {
  const added = [...afterChecks]
    .filter((name) => !beforeChecks.has(name))
    .sort((left, right) => left.localeCompare(right));

  for (const name of beforeChecks) {
    expect(afterChecks.has(name)).toBe(true);
  }

  expect(added).toEqual(
    [...expectedAdded].sort((left, right) => left.localeCompare(right)),
  );
}

function expectChecksAbsent(checks: Set<string>, names: string[]) {
  for (const name of names) {
    expect(checks.has(name)).toBe(false);
  }
}

describe('raw frame snapshot transitions', () => {
  it('ignores OoT live scene flags when live and saved scenes disagree', () => {
    const fixtureName = 'after-bombchu-2-20260501-202008.json';
    const parser = createRawAutotrackerParser();

    const mixedScene = parser.parse(
      buildOotLiveSceneMessage(fixtureName, 1, {
        liveSceneId: 85,
        saveSceneId: 40,
        chestFlags: 0x00000001,
      }).message,
    );
    const stableScene = parser.parse(
      buildOotLiveSceneMessage(fixtureName, 2, {
        liveSceneId: 85,
        saveSceneId: 85,
        chestFlags: 0x00000001,
      }).message,
    );

    if (!mixedScene || !stableScene) {
      throw new Error('Failed to parse synthetic OoT mismatch frames');
    }

    const mixedChecks = parsedCheckSet(mixedScene.checks);
    const stableChecks = parsedCheckSet(stableScene.checks);

    expect(mixedChecks.has('Kokiri Forest Kokiri Sword Chest')).toBe(false);
    expect(mixedScene.items.length).toBeGreaterThan(0);
    expect(stableScene).not.toBeNull();
    expect(stableChecks.has('Kokiri Forest Kokiri Sword Chest')).toBe(true);
  });

  it('ignores the first OoT live-scene sample after a scene change', () => {
    const fixtureName = 'after-bombchu-2-20260501-202008.json';
    const parser = createRawAutotrackerParser();

    const previousScene = parser.parse(
      buildOotLiveSceneMessage(fixtureName, 1, {
        liveSceneId: 40,
        saveSceneId: 40,
        chestFlags: 0x0000000f,
      }).message,
    );
    const mixedScene = parser.parse(
      buildOotLiveSceneMessage(fixtureName, 2, {
        liveSceneId: 85,
        saveSceneId: 85,
        chestFlags: 0x0000000f,
      }).message,
    );
    const stableScene = parser.parse(
      buildOotLiveSceneMessage(fixtureName, 3, {
        liveSceneId: 85,
        saveSceneId: 85,
        chestFlags: 0x00000001,
      }).message,
    );

    if (!previousScene || !stableScene) {
      throw new Error('Failed to parse synthetic OoT transition frames');
    }

    const previousChecks = parsedCheckSet(previousScene.checks);
    const stableChecks = parsedCheckSet(stableScene.checks);

    expect(previousChecks.has("Mido's House Top Left")).toBe(true);
    expect(previousChecks.has("Mido's House Top Right")).toBe(true);
    expect(previousChecks.has("Mido's House Bottom Left")).toBe(true);
    expect(previousChecks.has("Mido's House Bottom Right")).toBe(true);
    expect(previousChecks.has('Kokiri Forest Kokiri Sword Chest')).toBe(false);

    expect(mixedScene).toBeNull();

    expect(stableChecks.has('Kokiri Forest Kokiri Sword Chest')).toBe(true);
  });

  it('ignores the first MM live-scene sample after a scene change', () => {
    const fixtureName =
      'mm-without-initial-song-of-healing-20260501-143756.json';
    const parser = createRawAutotrackerParser();

    const previousScene = parser.parse(
      buildMmLiveSceneMessage(fixtureName, 1, {
        liveSceneId: 5,
        chestFlags: 0,
      }).message,
    );
    const mixedScene = parser.parse(
      buildMmLiveSceneMessage(fixtureName, 2, {
        liveSceneId: 6,
        chestFlags: 0x00000001,
      }).message,
    );
    const stableScene = parser.parse(
      buildMmLiveSceneMessage(fixtureName, 3, {
        liveSceneId: 6,
        chestFlags: 0x00000001,
      }).message,
    );

    expect(previousScene).not.toBeNull();
    expect(mixedScene).toBeNull();
    expect(stableScene).not.toBeNull();
  });

  it('ignores the first MM frame after switching from OoT', () => {
    const ootFixture = 'after-bombchu-2-20260501-202008.json';
    const mmFixture = 'mm-without-initial-song-of-healing-20260501-143756.json';
    const parser = createRawAutotrackerParser();

    const ootScene = parser.parse(
      buildOotLiveSceneMessage(ootFixture, 1, {
        liveSceneId: 40,
        saveSceneId: 40,
      }).message,
    );
    const firstMmScene = parser.parse(
      buildMmLiveSceneMessage(mmFixture, 2, {
        liveSceneId: 6,
      }).message,
    );
    const stableMmScene = parser.parse(
      buildMmLiveSceneMessage(mmFixture, 3, {
        liveSceneId: 6,
      }).message,
    );

    expect(ootScene).not.toBeNull();
    expect(firstMmScene).toBeNull();
    expect(stableMmScene).not.toBeNull();
  });

  it('tracks the Initial Song of Healing extra-flag transition', () => {
    const parser = createRawAutotrackerParser();
    const withoutChecks = getChecks(
      'mm-without-initial-song-of-healing-20260501-143756.json',
      1,
      parser,
    );
    const withChecks = getChecks(
      'mm-with-initial-song-of-healing-20260501-143938.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(withoutChecks, withChecks, [
      'Initial Song of Healing',
    ]);
  });

  it('keeps Honey and Darling rewards absent in the false-positive fixture', () => {
    const checks = getChecks('honey-darling-false-20260429-204043.json');

    expectChecksAbsent(checks, [
      'Honey & Darling Reward Any Day',
      'Honey & Darling Reward All Days',
    ]);
  });

  it('tracks the Tingle map fallback pair without leaking extra map checks', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-tingle-20260501-170052.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-tingle-20260501-170137.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Tingle Map Clock Town',
      'Tingle Map Woodfall',
    ]);
    expectChecksAbsent(afterChecks, [
      'Tingle Map Snowhead',
      'Tingle Map Ranch',
      'Tingle Map Great Bay',
      'Tingle Map Ikana',
    ]);
  });

  it('tracks the Madame Aroma fallback pair without removing prior checks', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-madame-aroma-20260501-170327.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-madame-aroma-20260501-170357.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      "Mayor's Office Kafei's Mask",
    ]);
  });

  it('tracks the Stock Pot Inn room key fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-anju-key-20260501-170709.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-anju-key-20260501-170751.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Stock Pot Inn Room Key',
    ]);
  });

  it('tracks the Town Archery fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-archery-20260501-170932.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-archery-20260501-171131.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, ['Town Archery Reward 1']);
    expectChecksAbsent(afterChecks, [
      'Town Archery Reward 2',
      'Swamp Archery Reward 1',
      'Swamp Archery Reward 2',
    ]);
  });

  it('tracks Bombchu Bowling reward progression across the snapshot trio', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-bombchu-bowling-20260501-201613.json',
      1,
      parser,
    );
    const afterFirstChecks = getChecks(
      'after-bomchu-1-20260501-201847.json',
      2,
      parser,
    );
    const afterSecondChecks = getChecks(
      'after-bombchu-2-20260501-202008.json',
      3,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterFirstChecks, [
      'Bombchu Bowling Reward 1',
    ]);
    expectOnlyAddedChecks(afterFirstChecks, afterSecondChecks, [
      'Bombchu Bowling Reward 2',
    ]);
  });

  it('tracks the Zora Diving Game fallback pair', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-diving-game-20260501-205252.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-diving-game-20260501-205332.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, [
      'Zora Domain Diving Game',
    ]);
  });

  it('tracks the Goron Tunic fallback pair without leaking unrelated extra flags', () => {
    const parser = createRawAutotrackerParser();
    const beforeChecks = getChecks(
      'before-goron-20260501-185643.json',
      1,
      parser,
    );
    const afterChecks = getChecks(
      'after-goron-20260501-185719.json',
      2,
      parser,
    );

    expectOnlyAddedChecks(beforeChecks, afterChecks, ['Goron City Tunic']);
    expectChecksAbsent(beforeChecks, [
      'Fishing Pond Adult',
      'Fishing Pond Child',
      'Zora Domain Tunic',
      'Lake Hylia Fire Arrow',
      'Treasure Chest Game Buy Key',
      'Death Mountain Trail Biggoron Sword',
      'Kakariko Potion Shop Odd Potion',
    ]);
    expectChecksAbsent(afterChecks, [
      'Fishing Pond Adult',
      'Fishing Pond Child',
      'Zora Domain Tunic',
      'Lake Hylia Fire Arrow',
      'Treasure Chest Game Buy Key',
      'Death Mountain Trail Biggoron Sword',
      'Kakariko Potion Shop Odd Potion',
    ]);
  });

  it('keeps the expanded MM extra-flag fallbacks absent across the May 1 fixtures', () => {
    const blockedChecks = [
      'Clock Town Postman Hat',
      'Milk Bar Troupe Leader Mask',
      'Moon Fierce Deity Mask',
      'Clock Tower Roof Skull Kid Ocarina',
      'Oath to Order',
      'Clock Town Guru-Guru Mask Bremen',
      'Deku Shrine Mask of Scents',
      'Termina Field Kamaro Mask',
      'Astral Observatory Moon Tear',
      'Lottery Prize Night 1',
      'Lottery Prize Night 2',
      'Lottery Prize Night 3',
    ];

    for (const fixtureName of [
      'before-madame-aroma-20260501-170327.json',
      'after-madame-aroma-20260501-170357.json',
      'before-anju-key-20260501-170709.json',
      'after-anju-key-20260501-170751.json',
    ]) {
      expectChecksAbsent(getChecks(fixtureName), blockedChecks);
    }
  });
});
