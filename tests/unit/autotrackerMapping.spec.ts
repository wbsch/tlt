import { describe, expect, it } from 'vitest';

import {
  applyDelta,
  translateAutotrackerItems,
  type AutotrackerItem,
} from '@/../packs/ootmm/src/autotracker/autotrackerMapping';

function makeAvailableItemIds(itemIds: string[]) {
  return new Set(itemIds);
}

function makeItemMaxCounts(entries: Record<string, number>) {
  return new Map(Object.entries(entries));
}

describe('autotracker composite item inference', () => {
  it('infers key rings and skeleton keys from completed key counts', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_KEY_RING_FOREST',
      'OOT_KEY_RING_FIRE',
      'OOT_KEY_RING_WATER',
      'OOT_KEY_RING_SPIRIT',
      'OOT_KEY_RING_SHADOW',
      'OOT_KEY_RING_BOTW',
      'OOT_KEY_RING_GTG',
      'OOT_KEY_RING_GANON',
      'OOT_KEY_RING_GF',
      'OOT_KEY_RING_TCG',
      'OOT_KEY_RING',
      'OOT_SKELETON_KEY',
      'MM_KEY_RING_WF',
      'MM_KEY_RING_SH',
      'MM_KEY_RING_GB',
      'MM_KEY_RING_ST',
      'MM_KEY_RING',
      'MM_SKELETON_KEY',
      'SHARED_SKELETON_KEY',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      OOT_SMALL_KEY_FOREST: 5,
      OOT_SMALL_KEY_FIRE: 8,
      OOT_SMALL_KEY_WATER: 6,
      OOT_SMALL_KEY_SPIRIT: 5,
      OOT_SMALL_KEY_SHADOW: 5,
      OOT_SMALL_KEY_BOTW: 3,
      OOT_SMALL_KEY_GTG: 9,
      OOT_SMALL_KEY_GANON: 2,
      OOT_SMALL_KEY_GF: 4,
      OOT_SMALL_KEY_TCG: 6,
      MM_SMALL_KEY_WF: 1,
      MM_SMALL_KEY_SH: 3,
      MM_SMALL_KEY_GB: 1,
      MM_SMALL_KEY_ST: 4,
    });
    const items: AutotrackerItem[] = [
      { id: 'OOT_SMALL_KEY_FOREST', qty: 5 },
      { id: 'OOT_SMALL_KEY_FIRE', qty: 8 },
      { id: 'OOT_SMALL_KEY_WATER', qty: 6 },
      { id: 'OOT_SMALL_KEY_SPIRIT', qty: 5 },
      { id: 'OOT_SMALL_KEY_SHADOW', qty: 5 },
      { id: 'OOT_SMALL_KEY_BOTW', qty: 3 },
      { id: 'OOT_SMALL_KEY_GTG', qty: 9 },
      { id: 'OOT_SMALL_KEY_GANON', qty: 2 },
      { id: 'OOT_SMALL_KEY_GF', qty: 4 },
      { id: 'OOT_SMALL_KEY_TCG', qty: 6 },
      { id: 'MM_SMALL_KEY_WF', qty: 1 },
      { id: 'MM_SMALL_KEY_SH', qty: 3 },
      { id: 'MM_SMALL_KEY_GB', qty: 1 },
      { id: 'MM_SMALL_KEY_ST', qty: 4 },
    ];

    const translated = translateAutotrackerItems(
      items,
      availableItemIds,
      itemMaxCounts,
    );

    expect(translated.OOT_KEY_RING_FOREST).toBe(1);
    expect(translated.OOT_KEY_RING_FIRE).toBe(1);
    expect(translated.OOT_KEY_RING_WATER).toBe(1);
    expect(translated.OOT_KEY_RING_SPIRIT).toBe(1);
    expect(translated.OOT_KEY_RING_SHADOW).toBe(1);
    expect(translated.OOT_KEY_RING_BOTW).toBe(1);
    expect(translated.OOT_KEY_RING_GTG).toBe(1);
    expect(translated.OOT_KEY_RING_GANON).toBe(1);
    expect(translated.OOT_KEY_RING_GF).toBe(1);
    expect(translated.OOT_KEY_RING_TCG).toBe(1);
    expect(translated.OOT_KEY_RING).toBe(1);
    expect(translated.OOT_SKELETON_KEY).toBe(1);

    expect(translated.MM_KEY_RING_WF).toBe(1);
    expect(translated.MM_KEY_RING_SH).toBe(1);
    expect(translated.MM_KEY_RING_GB).toBe(1);
    expect(translated.MM_KEY_RING_ST).toBe(1);
    expect(translated.MM_KEY_RING).toBe(1);
    expect(translated.MM_SKELETON_KEY).toBe(1);
    expect(translated.SHARED_SKELETON_KEY).toBe(1);
  });

  it('requires both games before inferring the shared skeleton key', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_KEY_RING_FOREST',
      'OOT_KEY_RING',
      'SHARED_SKELETON_KEY',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      OOT_SMALL_KEY_FOREST: 5,
    });

    const translated = translateAutotrackerItems(
      [{ id: 'OOT_SMALL_KEY_FOREST', qty: 5 }],
      availableItemIds,
      itemMaxCounts,
    );

    expect(translated.OOT_KEY_RING_FOREST).toBe(1);
    expect(translated.OOT_KEY_RING).toBe(1);
    expect(translated.SHARED_SKELETON_KEY).toBeUndefined();
  });

  it('infers platinum tokens from completed token sets', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_GS_TOKEN',
      'MM_GS_TOKEN_SWAMP',
      'MM_GS_TOKEN_OCEAN',
      'OOT_PLATINUM_TOKEN',
      'MM_PLATINUM_TOKEN',
      'SHARED_PLATINUM_TOKEN',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      OOT_GS_TOKEN: 100,
      MM_GS_TOKEN_SWAMP: 30,
      MM_GS_TOKEN_OCEAN: 30,
    });

    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_GS_TOKEN', qty: 100 },
        { id: 'MM_GS_TOKEN_SWAMP', qty: 30 },
        { id: 'MM_GS_TOKEN_OCEAN', qty: 30 },
      ],
      availableItemIds,
      itemMaxCounts,
    );

    expect(translated.OOT_PLATINUM_TOKEN).toBe(1);
    expect(translated.MM_PLATINUM_TOKEN).toBe(1);
    expect(translated.SHARED_PLATINUM_TOKEN).toBe(1);
  });

  it('infers magical rupee from all available silver groups', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_RUPEE_MAGICAL',
      'OOT_RUPEE_SILVER_DC',
      'OOT_RUPEE_SILVER_BOTW',
      'OOT_POUCH_SILVER_SHADOW_SCYTHE',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      OOT_RUPEE_SILVER_DC: 5,
      OOT_RUPEE_SILVER_BOTW: 5,
    });

    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_RUPEE_SILVER_DC', qty: 5 },
        { id: 'OOT_RUPEE_SILVER_BOTW', qty: 5 },
        { id: 'OOT_POUCH_SILVER_SHADOW_SCYTHE', qty: 1 },
      ],
      availableItemIds,
      itemMaxCounts,
    );

    expect(translated.OOT_RUPEE_MAGICAL).toBe(1);
  });

  it('infers the transcendent fairy from all available fairy groups', () => {
    const availableItemIds = makeAvailableItemIds([
      'MM_TRANSCENDENT_FAIRY',
      'MM_STRAY_FAIRY_TOWN',
      'MM_STRAY_FAIRY_WF',
      'MM_STRAY_FAIRY_SH',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      MM_STRAY_FAIRY_TOWN: 1,
      MM_STRAY_FAIRY_WF: 15,
      MM_STRAY_FAIRY_SH: 15,
    });

    const translated = translateAutotrackerItems(
      [
        { id: 'MM_STRAY_FAIRY_TOWN', qty: 1 },
        { id: 'MM_STRAY_FAIRY_WF', qty: 15 },
        { id: 'MM_STRAY_FAIRY_SH', qty: 15 },
      ],
      availableItemIds,
      itemMaxCounts,
    );

    expect(translated.MM_TRANSCENDENT_FAIRY).toBe(1);
  });

  it('infers the MM bombchu bag from MM bombchu autotracker signals', () => {
    const availableItemIds = makeAvailableItemIds(['MM_BOMBCHU_BAG']);

    const translated = translateAutotrackerItems(
      [{ id: 'MM_BOMBCHU', qty: 1 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.MM_BOMBCHU_BAG).toBe(1);
  });

  it('infers first bombchu bag variants from OOT bombchu raw autotracker IDs', () => {
    const availableItemIds = makeAvailableItemIds(['OOT_BOMBCHU_BAG_FIRST_10']);

    const translated = translateAutotrackerItems(
      [{ id: 'OOT_BOMBCHUS', qty: 1 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.OOT_BOMBCHU_BAG_FIRST_10).toBe(1);
  });

  it('infers the shared bombchu bag from either game bombchu signals', () => {
    const availableItemIds = makeAvailableItemIds(['SHARED_BOMBCHU_BAG']);

    const translated = translateAutotrackerItems(
      [{ id: 'MM_BOMBCHU', qty: 1 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.SHARED_BOMBCHU_BAG).toBe(1);
  });

  it('maps the OOT progressive sword stage from the Kokiri bit and extra-sword level', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_SWORD',
      'OOT_SWORD_MASTER',
    ]);

    // Stage 1: Kokiri bit set, no extra swords.
    const stage1 = translateAutotrackerItems(
      [{ id: 'OOT_SWORD', qty: 0x01 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );
    expect(stage1.OOT_SWORD).toBe(1);
    expect(stage1.OOT_SWORD_KOKIRI).toBeUndefined();

    // Stage 2: Kokiri + Razor (extraSwordsOot = 1).
    const stage2 = translateAutotrackerItems(
      [
        { id: 'OOT_SWORD', qty: 0x01 },
        { id: 'OOT_EXTRA_SWORDS', qty: 1 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );
    expect(stage2.OOT_SWORD).toBe(2);

    // Stage 3: Kokiri + Gilded (extraSwordsOot = 2).
    const stage3 = translateAutotrackerItems(
      [
        { id: 'OOT_EXTRA_SWORDS', qty: 2 },
        { id: 'OOT_SWORD', qty: 0x01 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );
    expect(stage3.OOT_SWORD).toBe(3);
  });

  it('folds the completed MM Goron Lullaby into the progressive half stage', () => {
    // Progressive mode: pool holds two copies of MM_SONG_GORON_HALF and no
    // MM_SONG_GORON. The autotracker still reports the full lullaby via its
    // own quest bit as MM_SONG_GORON, which must map to stage 2 of the
    // progressive item rather than leaking an out-of-pool ID to the pathfinder.
    const availableItemIds = makeAvailableItemIds(['MM_SONG_GORON_HALF']);

    const translated = translateAutotrackerItems(
      [
        { id: 'MM_SONG_GORON_HALF', qty: 1 },
        { id: 'MM_SONG_GORON', qty: 1 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.MM_SONG_GORON_HALF).toBe(2);
    expect(translated.MM_SONG_GORON).toBeUndefined();
  });

  it('folds the completed OOT Goron Lullaby into the progressive half stage', () => {
    // Progressive mode: pool holds two copies of OOT_SONG_GORON_HALF and no
    // OOT_SONG_GORON. The autotracker still reports the full lullaby via the
    // shared custom save as OOT_SONG_GORON, which must map to stage 2 of the
    // progressive item rather than leaking an out-of-pool ID to the pathfinder.
    const availableItemIds = makeAvailableItemIds(['OOT_SONG_GORON_HALF']);

    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_SONG_GORON_HALF', qty: 1 },
        { id: 'OOT_SONG_GORON', qty: 1 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.OOT_SONG_GORON_HALF).toBe(2);
    expect(translated.OOT_SONG_GORON).toBeUndefined();
  });

  it('folds both completed Goron Lullaby signals into the shared progressive half stage', () => {
    // Shared progressive mode: pool holds two copies of SHARED_SONG_GORON_HALF
    // and no full-song ID. The autotracker reports the completed lullaby via
    // the MM quest bit (MM_SONG_GORON) and the OOT shared custom save
    // (OOT_SONG_GORON); both must map to stage 2 of the shared progressive
    // item rather than leaking out-of-pool IDs to the pathfinder.
    const availableItemIds = makeAvailableItemIds(['SHARED_SONG_GORON_HALF']);

    const translated = translateAutotrackerItems(
      [
        { id: 'SHARED_SONG_GORON_HALF', qty: 1 },
        { id: 'MM_SONG_GORON', qty: 1 },
        { id: 'OOT_SONG_GORON', qty: 1 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.SHARED_SONG_GORON_HALF).toBe(2);
    expect(translated.MM_SONG_GORON).toBeUndefined();
    expect(translated.OOT_SONG_GORON).toBeUndefined();
  });

  it('keeps the full MM Goron Lullaby id when not progressive', () => {
    // Full-lullaby mode: pool holds a single MM_SONG_GORON and no half. The
    // autotracker's MM_SONG_GORON signal passes through unchanged.
    const availableItemIds = makeAvailableItemIds(['MM_SONG_GORON']);

    const translated = translateAutotrackerItems(
      [{ id: 'MM_SONG_GORON', qty: 1 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.MM_SONG_GORON).toBe(1);
    expect(translated.MM_SONG_GORON_HALF).toBeUndefined();
  });

  it('keeps the full shared Goron Lullaby id when not progressive', () => {
    // Shared full-lullaby mode: pool holds a single SHARED_SONG_GORON and no
    // half. The autotracker's MM_SONG_GORON / OOT_SONG_GORON signals resolve
    // to the shared full-song ID via resolveTrackerId and pass through.
    const availableItemIds = makeAvailableItemIds(['SHARED_SONG_GORON']);

    const translated = translateAutotrackerItems(
      [
        { id: 'MM_SONG_GORON', qty: 1 },
        { id: 'OOT_SONG_GORON', qty: 1 },
      ],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.SHARED_SONG_GORON).toBe(1);
    expect(translated.MM_SONG_GORON).toBeUndefined();
    expect(translated.OOT_SONG_GORON).toBeUndefined();
  });

  it('keeps individual OOT swords when extra child swords are disabled', () => {
    const availableItemIds = makeAvailableItemIds([
      'OOT_SWORD_KOKIRI',
      'OOT_SWORD_MASTER',
      'OOT_SWORD_KNIFE',
      'OOT_SWORD_BIGGORON',
    ]);

    const translated = translateAutotrackerItems(
      // bit 0 = Kokiri, bit 1 = Master, bit 4 = Biggoron's Sword.
      [{ id: 'OOT_SWORD', qty: 0x13 }],
      availableItemIds,
      makeItemMaxCounts({}),
    );

    expect(translated.OOT_SWORD_KOKIRI).toBe(1);
    expect(translated.OOT_SWORD_MASTER).toBe(1);
    expect(translated.OOT_SWORD_BIGGORON).toBe(1);
    expect(translated.OOT_SWORD_KNIFE).toBe(0);
    expect(translated.OOT_SWORD).toBeUndefined();
  });

  it('ignores the legacy OOT tunic bitmask and keeps direct tunic ids', () => {
    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_TUNIC', qty: 3 },
        { id: 'OOT_TUNIC_GORON', qty: 1 },
        { id: 'OOT_TUNIC_ZORA', qty: 1 },
      ],
      makeAvailableItemIds(['OOT_TUNIC_GORON', 'OOT_TUNIC_ZORA']),
      makeItemMaxCounts({}),
    );

    expect(translated.OOT_TUNIC).toBeUndefined();
    expect(translated.OOT_TUNIC_GORON).toBe(1);
    expect(translated.OOT_TUNIC_ZORA).toBe(1);
  });

  it('ignores the legacy OOT boots bitmask and keeps direct boot ids', () => {
    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_BOOTS', qty: 3 },
        { id: 'OOT_BOOTS_IRON', qty: 1 },
        { id: 'OOT_BOOTS_HOVER', qty: 1 },
      ],
      makeAvailableItemIds(['OOT_BOOTS_IRON', 'OOT_BOOTS_HOVER']),
      makeItemMaxCounts({}),
    );

    expect(translated.OOT_BOOTS).toBeUndefined();
    expect(translated.OOT_BOOTS_IRON).toBe(1);
    expect(translated.OOT_BOOTS_HOVER).toBe(1);
  });

  it('uses the OOT hookshot stage for shared hookshot translation', () => {
    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_HOOKSHOT', qty: 1 },
        { id: 'MM_HOOKSHOT', qty: 2 },
      ],
      makeAvailableItemIds(['SHARED_HOOKSHOT']),
      makeItemMaxCounts({ SHARED_HOOKSHOT: 2 }),
    );

    expect(translated.SHARED_HOOKSHOT).toBe(1);
  });

  it('reaches the second shared hookshot stage from the OOT longshot state', () => {
    const translated = translateAutotrackerItems(
      [
        { id: 'OOT_HOOKSHOT', qty: 2 },
        { id: 'MM_HOOKSHOT', qty: 2 },
      ],
      makeAvailableItemIds(['SHARED_HOOKSHOT']),
      makeItemMaxCounts({ SHARED_HOOKSHOT: 2 }),
    );

    expect(translated.SHARED_HOOKSHOT).toBe(2);
  });

  it('applies derived items after additive deltas', () => {
    const availableItemIds = makeAvailableItemIds([
      'MM_KEY_RING_WF',
      'MM_SKELETON_KEY',
    ]);
    const itemMaxCounts = makeItemMaxCounts({
      MM_SMALL_KEY_WF: 1,
    });
    const currentState = new Map<string, number>();

    const nextState = applyDelta(
      currentState,
      [{ id: 'MM_SMALL_KEY_WF', qty: 1 }],
      availableItemIds,
      itemMaxCounts,
    );

    expect(nextState.get('MM_SMALL_KEY_WF')).toBe(1);
    expect(nextState.get('MM_KEY_RING_WF')).toBe(1);
    expect(nextState.get('MM_SKELETON_KEY')).toBe(1);
  });

  it('offsets absolute wallet levels when child wallets are disabled', () => {
    const translated = translateAutotrackerItems(
      [{ id: 'OOT_WALLET', qty: 2 }],
      makeAvailableItemIds(['OOT_WALLET']),
      makeItemMaxCounts({ OOT_WALLET: 3 }),
      { childWalletsEnabled: false },
    );

    expect(translated.OOT_WALLET).toBe(1);
  });

  it('keeps absolute wallet levels aligned when child wallets are enabled', () => {
    const translated = translateAutotrackerItems(
      [{ id: 'OOT_WALLET', qty: 2 }],
      makeAvailableItemIds(['OOT_WALLET']),
      makeItemMaxCounts({ OOT_WALLET: 3 }),
      { childWalletsEnabled: true },
    );

    expect(translated.OOT_WALLET).toBe(2);
  });

  it('maps bottomless wallet signals onto the shared wallet max stage', () => {
    const translated = translateAutotrackerItems(
      [{ id: 'OOT_WALLET5', qty: 1 }],
      makeAvailableItemIds(['SHARED_WALLET']),
      makeItemMaxCounts({ SHARED_WALLET: 4 }),
      { childWalletsEnabled: false },
    );

    expect(translated.SHARED_WALLET).toBe(4);
  });

  it('treats wallet deltas as additive even without child wallets', () => {
    const nextState = applyDelta(
      new Map<string, number>(),
      [{ id: 'OOT_WALLET', qty: 1 }],
      makeAvailableItemIds(['OOT_WALLET']),
      makeItemMaxCounts({ OOT_WALLET: 3 }),
      { childWalletsEnabled: false },
    );

    expect(nextState.get('OOT_WALLET')).toBe(1);
  });
});
