/**
 * Icon mapping for OoTMM items
 * Maps item IDs to their corresponding image paths in images/
 * Based on EmoTracker pack structure
 */

import { withBasePath } from '../utils/assetPath';

function expandGroupedItemIdKeys<T>(
  source: Record<string, T>,
): Record<string, T> {
  const expanded: Record<string, T> = {};

  for (const [rawKey, value] of Object.entries(source)) {
    const keys = rawKey
      .split('|')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);

    if (keys.length === 0) continue;
    for (const key of keys) {
      expanded[key] = value;
    }
  }

  return expanded;
}

const RAW_ITEM_ICONS: Record<string, string> = {
  // === OOT ITEMS ===

  // Equipment
  OOT_BOOMERANG: 'images/boomerang.png',
  OOT_LENS: 'images/lens.png',
  OOT_HAMMER: 'images/hammer.png',
  OOT_MAGIC_BEAN: 'images/bean.png',
  OOT_POWDER_KEG: 'images/items/mm_keg.png',

  // Arrows
  OOT_ARROW_FIRE: 'images/arrow_fire.png',
  OOT_ARROW_ICE: 'images/arrow_ice.png',
  OOT_ARROW_LIGHT: 'images/arrow_light.png',

  // Spells
  OOT_SPELL_FIRE: 'images/din.png',
  OOT_SPELL_WIND: 'images/farore.png',
  OOT_SPELL_LOVE: 'images/nayru.png',

  // Swords
  OOT_SWORD_KOKIRI: 'images/sword1.png',
  OOT_SWORD_MASTER: 'images/sword2.png',
  OOT_SWORD_BIGGORON: 'images/sword3.png',
  OOT_SWORD_KNIFE: 'images/sword_giants_knife.png',
  OOT_SPIN_UPGRADE: 'images/great_spin_attack.png',
  OOT_GREAT_FAIRY_SWORD: 'images/items/mm_fairysword.png',

  // Shields
  OOT_SHIELD_DEKU: 'images/shield1.png',
  OOT_SHIELD_HYLIAN: 'images/shield2.png',
  OOT_SHIELD_MIRROR: 'images/shield3.png',

  // Boots
  OOT_BOOTS_IRON: 'images/boots_iron.png',
  OOT_BOOTS_HOVER: 'images/boots_hover.png',

  // Tunics
  OOT_TUNIC_GORON: 'images/redtunic.png',
  OOT_TUNIC_ZORA: 'images/bluetunic.png',

  // Songs
  OOT_SONG_ZELDA: 'images/song_zelda.png',
  OOT_SONG_EPONA: 'images/song_epona.png',
  OOT_SONG_SARIA: 'images/song_saria.png',
  OOT_SONG_SUN: 'images/song_sun.png',
  OOT_SONG_TIME: 'images/song_time.png',
  OOT_SONG_STORMS: 'images/song_storm.png',
  OOT_SONG_TP_FOREST: 'images/song_forest.png',
  OOT_SONG_TP_FIRE: 'images/song_fire.png',
  OOT_SONG_TP_WATER: 'images/song_water.png',
  OOT_SONG_TP_SPIRIT: 'images/song_spirit.png',
  OOT_SONG_TP_SHADOW: 'images/song_shadow.png',
  OOT_SONG_TP_LIGHT: 'images/song_light.png',
  OOT_SONG_EMPTINESS: 'images/song_elegy.png',
  OOT_SONG_SOARING: 'images/song_soaring.png',
  OOT_SONG_HEALING: 'images/song_healing.png',
  OOT_SONG_AWAKENING: 'images/song_sonata.png',
  OOT_SONG_GORON: 'images/song_lullaby.png',
  OOT_SONG_ZORA: 'images/song_bossa_nova.png',
  OOT_SONG_ORDER: 'images/song_oath.png',
  OOT_SONG_NOTE_ZELDA: 'images/song_zelda.png',
  OOT_SONG_NOTE_EPONA: 'images/song_epona.png',
  OOT_SONG_NOTE_SARIA: 'images/song_saria.png',
  OOT_SONG_NOTE_SUN: 'images/song_sun.png',
  OOT_SONG_NOTE_TIME: 'images/song_time.png',
  OOT_SONG_NOTE_STORMS: 'images/song_storm.png',
  OOT_SONG_NOTE_TP_FOREST: 'images/song_forest.png',
  OOT_SONG_NOTE_TP_FIRE: 'images/song_fire.png',
  OOT_SONG_NOTE_TP_WATER: 'images/song_water.png',
  OOT_SONG_NOTE_TP_SPIRIT: 'images/song_spirit.png',
  OOT_SONG_NOTE_TP_SHADOW: 'images/song_shadow.png',
  OOT_SONG_NOTE_TP_LIGHT: 'images/song_light.png',
  OOT_SONG_NOTE_EMPTINESS: 'images/song_elegy.png',
  OOT_SONG_NOTE_SOARING: 'images/song_soaring.png',
  OOT_SONG_NOTE_HEALING: 'images/song_healing.png',
  OOT_SONG_NOTE_AWAKENING: 'images/song_sonata.png',
  OOT_SONG_NOTE_GORON: 'images/song_lullaby.png',
  OOT_SONG_NOTE_ZORA: 'images/song_bossa_nova.png',
  OOT_SONG_NOTE_ORDER: 'images/song_oath.png',

  // Bottles
  OOT_BOTTLE_RUTO_LETTER: 'images/bottle_letter.png',
  OOT_BOTTLE_EMPTY: 'images/bottle.png',

  // Quest items
  OOT_SKELETON_KEY: 'images/key_skeleton.png',
  OOT_RUPEE_MAGICAL: 'images/rupee_magical.png',
  OOT_GS_TOKEN: 'images/skulltula_token.png',
  OOT_PLATINUM_TOKEN: 'images/skulltula_platinum.png',

  OOT_STONE_OF_AGONY: 'images/agony.png',
  OOT_GERUDO_CARD: 'images/gerudocard.png',

  // Coins
  OOT_COIN_RED: 'images/coin_red.png',
  OOT_COIN_GREEN: 'images/coin_green.png',
  OOT_COIN_BLUE: 'images/coin_blue.png',
  OOT_COIN_YELLOW: 'images/coin_yellow.png',

  // Rupees
  OOT_RUPEE_SILVER_DC: 'images/rupee.png',
  OOT_RUPEE_SILVER_BOTW: 'images/rupee.png',
  OOT_RUPEE_SILVER_SPIRIT_CHILD: 'images/rupee.png',
  OOT_RUPEE_SILVER_SPIRIT_SUN: 'images/rupee.png',
  OOT_RUPEE_SILVER_SPIRIT_BOULDERS: 'images/rupee.png',
  OOT_RUPEE_SILVER_SPIRIT_LOBBY: 'images/rupee.png',
  OOT_RUPEE_SILVER_SPIRIT_ADULT: 'images/rupee.png',
  OOT_RUPEE_SILVER_SHADOW_SCYTHE: 'images/rupee.png',
  OOT_RUPEE_SILVER_SHADOW_PIT: 'images/rupee.png',
  OOT_RUPEE_SILVER_SHADOW_SPIKES: 'images/rupee.png',
  OOT_RUPEE_SILVER_SHADOW_BLADES: 'images/rupee.png',
  OOT_RUPEE_SILVER_IC_SCYTHE: 'images/rupee.png',
  OOT_RUPEE_SILVER_IC_BLOCK: 'images/rupee.png',
  OOT_RUPEE_SILVER_GTG_SLOPES: 'images/rupee.png',
  OOT_RUPEE_SILVER_GTG_LAVA: 'images/rupee.png',
  OOT_RUPEE_SILVER_GTG_WATER: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_SPIRIT: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_LIGHT: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_FIRE: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_FOREST: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_SHADOW: 'images/rupee.png',
  OOT_RUPEE_SILVER_GANON_WATER: 'images/rupee.png',
  OOT_POUCH_SILVER_DC: 'images/rupee.png',
  OOT_POUCH_SILVER_BOTW: 'images/rupee.png',
  OOT_POUCH_SILVER_SPIRIT_CHILD: 'images/rupee.png',
  OOT_POUCH_SILVER_SPIRIT_SUN: 'images/rupee.png',
  OOT_POUCH_SILVER_SPIRIT_BOULDERS: 'images/rupee.png',
  OOT_POUCH_SILVER_SPIRIT_LOBBY: 'images/rupee.png',
  OOT_POUCH_SILVER_SPIRIT_ADULT: 'images/rupee.png',
  OOT_POUCH_SILVER_SHADOW_SCYTHE: 'images/rupee.png',
  OOT_POUCH_SILVER_SHADOW_PIT: 'images/rupee.png',
  OOT_POUCH_SILVER_SHADOW_SPIKES: 'images/rupee.png',
  OOT_POUCH_SILVER_SHADOW_BLADES: 'images/rupee.png',
  OOT_POUCH_SILVER_IC_SCYTHE: 'images/rupee.png',
  OOT_POUCH_SILVER_IC_BLOCK: 'images/rupee.png',
  OOT_POUCH_SILVER_GTG_SLOPES: 'images/rupee.png',
  OOT_POUCH_SILVER_GTG_LAVA: 'images/rupee.png',
  OOT_POUCH_SILVER_GTG_WATER: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_SPIRIT: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_LIGHT: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_FIRE: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_FOREST: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_SHADOW: 'images/rupee.png',
  OOT_POUCH_SILVER_GANON_WATER: 'images/rupee.png',

  // Fish
  OOT_FISHING_POND_CHILD_FISH_7LBS: 'images/fish.png',
  OOT_FISHING_POND_ADULT_FISH_8LBS: 'images/fish.png',
  OOT_FISHING_POND_CHILD_LOACH_14LBS: 'images/fish_loach.png',
  OOT_FISHING_POND_ADULT_LOACH_29LBS: 'images/fish_loach.png',

  // Buttons
  OOT_BUTTON_A: 'images/button_a.png',
  OOT_BUTTON_C_DOWN: 'images/button_down.png',
  OOT_BUTTON_C_LEFT: 'images/button_left.png',
  OOT_BUTTON_C_RIGHT: 'images/button_right.png',
  OOT_BUTTON_C_UP: 'images/button_up.png',

  // Masks
  OOT_MASK_KEATON: 'images/keaton.png',
  OOT_MASK_SKULL: 'images/skull.png',
  OOT_MASK_SPOOKY: 'images/spooky.png',
  OOT_MASK_BUNNY: 'images/bunny.png',
  OOT_MASK_TRUTH: 'images/truth.png',
  OOT_MASK_GORON: 'images/items/mm_goron.png',
  OOT_MASK_ZORA: 'images/items/mm_zora.png',
  OOT_MASK_GERUDO: 'images/gerudo.png',
  OOT_MASK_BLAST: 'images/items/mm_blast.png',
  OOT_MASK_STONE: 'images/items/mm_stone.png',
  OOT_MASK_KAMARO: 'images/items/mm_kamaro.png',

  // Trade sequence
  OOT_CHICKEN: 'images/cucco.png',
  OOT_WEIRD_EGG: 'images/egg.png',
  OOT_ZELDA_LETTER: 'images/letter.png',
  OOT_POCKET_EGG: 'images/egg.png',
  OOT_POCKET_CUCCO: 'images/cucco.png',
  OOT_COJIRO: 'images/cojiro.png',
  OOT_ODD_MUSHROOM: 'images/mushroom.png',
  OOT_ODD_POTION: 'images/medicine.png',
  OOT_POACHER_SAW: 'images/saw.png',
  OOT_BROKEN_GORON_SWORD: 'images/broken_sword.png',
  OOT_PRESCRIPTION: 'images/perscription.png',
  OOT_EYEBALL_FROG: 'images/frog.png',
  OOT_EYE_DROPS: 'images/eyedrops.png',
  OOT_CLAIM_CHECK: 'images/claim.png',

  // Bombchus
  OOT_BOMBCHU_10: 'images/bombchu.png',
  OOT_BOMBCHU_BAG: 'images/bombchu_bag.png',

  // Dungeon items - keys
  OOT_SMALL_KEY_FOREST: 'images/small_key.png',
  OOT_SMALL_KEY_FIRE: 'images/small_key.png',
  OOT_SMALL_KEY_WATER: 'images/small_key.png',
  OOT_SMALL_KEY_SPIRIT: 'images/small_key.png',
  OOT_SMALL_KEY_SHADOW: 'images/small_key.png',
  OOT_SMALL_KEY_GANON: 'images/small_key.png',
  OOT_SMALL_KEY_GTG: 'images/small_key.png',
  OOT_SMALL_KEY_BOTW: 'images/small_key.png',
  OOT_SMALL_KEY_GF: 'images/small_key.png',
  OOT_SMALL_KEY_TCG: 'images/small_key.png',
  OOT_KEY_RING_FOREST: 'images/small_key.png',
  OOT_KEY_RING_FIRE: 'images/small_key.png',
  OOT_KEY_RING_WATER: 'images/small_key.png',
  OOT_KEY_RING_SPIRIT: 'images/small_key.png',
  OOT_KEY_RING_SHADOW: 'images/small_key.png',
  OOT_KEY_RING_GANON: 'images/small_key.png',
  OOT_KEY_RING_GTG: 'images/small_key.png',
  OOT_KEY_RING_BOTW: 'images/small_key.png',
  OOT_KEY_RING_GF: 'images/small_key.png',
  OOT_KEY_RING_TCG: 'images/small_key.png',

  // Dungeon items - boss keys
  OOT_BOSS_KEY_FOREST: 'images/boss_key.png',
  OOT_BOSS_KEY_FIRE: 'images/boss_key.png',
  OOT_BOSS_KEY_WATER: 'images/boss_key.png',
  OOT_BOSS_KEY_SPIRIT: 'images/boss_key.png',
  OOT_BOSS_KEY_SHADOW: 'images/boss_key.png',
  OOT_BOSS_KEY_GANON: 'images/boss_key.png',

  // Dungeon rewards
  OOT_STONE_EMERALD: 'images/spiritual_stone_kokiri.png',
  OOT_STONE_RUBY: 'images/spiritual_stone_goron.png',
  OOT_STONE_SAPPHIRE: 'images/spiritual_stone_zora.png',
  OOT_MEDALLION_FOREST: 'images/forestmedallion.png',
  OOT_MEDALLION_FIRE: 'images/firemedallion.png',
  OOT_MEDALLION_WATER: 'images/watermedallion.png',
  OOT_MEDALLION_SPIRIT: 'images/spiritmedallion.png',
  OOT_MEDALLION_SHADOW: 'images/shadowmedallion.png',
  OOT_MEDALLION_LIGHT: 'images/lightmedallion.png',

  // === MM ITEMS ===

  // Equipment
  MM_BOMBCHU: 'images/items/mm_bombchu.png',
  MM_BOMBCHU_BAG: 'images/bombchu_bag.png',
  MM_STICK: 'images/deku_stick.png',
  MM_NUTS_10: 'images/items/mm_nut.png',
  MM_MAGIC_BEAN: 'images/items/mm_bean.png',
  MM_POWDER_KEG: 'images/items/mm_keg.png',
  MM_PICTOGRAPH_BOX: 'images/items/mm_box.png',
  MM_LENS: 'images/items/mm_lens.png',
  MM_GREAT_FAIRY_SWORD: 'images/items/mm_fairysword.png',
  MM_HAMMER: 'images/hammer.png',

  // Arrows
  MM_ARROW_FIRE: 'images/arrow_fire.png',
  MM_ARROW_ICE: 'images/arrow_ice.png',
  MM_ARROW_LIGHT: 'images/arrow_light.png',

  // Spells
  MM_SPELL_FIRE: 'images/din.png',
  MM_SPELL_WIND: 'images/farore.png',
  MM_SPELL_LOVE: 'images/nayru.png',

  // Shields
  MM_SHIELD_HERO: 'images/items/mm_shield.png',
  MM_SHIELD_MIRROR: 'images/items/mm_mirror.png',
  MM_SHIELD_DEKU: 'images/shield1.png',

  // Boots
  MM_BOOTS_IRON: 'images/boots_iron.png',
  MM_BOOTS_HOVER: 'images/boots_hover.png',

  // Tunics
  MM_TUNIC_GORON: 'images/redtunic.png',
  MM_TUNIC_ZORA: 'images/bluetunic.png',

  MM_BOOMERANG: 'images/boomerang.png',

  // Songs
  MM_SONG_TIME: 'images/song_time.png',
  MM_SONG_HEALING: 'images/song_healing.png',
  MM_SONG_EPONA: 'images/song_epona.png',
  MM_SONG_SOARING: 'images/song_soaring.png',
  MM_SONG_STORMS: 'images/song_storm.png',
  MM_SONG_SUN: 'images/song_sun.png',
  MM_SONG_AWAKENING: 'images/song_sonata.png',
  MM_SONG_GORON: 'images/song_lullaby.png',
  MM_SONG_ZORA: 'images/song_bossa_nova.png',
  MM_SONG_EMPTINESS: 'images/song_elegy.png',
  MM_SONG_ORDER: 'images/song_oath.png',
  MM_SONG_ZELDA: 'images/song_zelda.png',
  MM_SONG_SARIA: 'images/song_saria.png',
  MM_SONG_TP_FOREST: 'images/song_forest.png',
  MM_SONG_TP_FIRE: 'images/song_fire.png',
  MM_SONG_TP_WATER: 'images/song_water.png',
  MM_SONG_TP_SPIRIT: 'images/song_spirit.png',
  MM_SONG_TP_SHADOW: 'images/song_shadow.png',
  MM_SONG_TP_LIGHT: 'images/song_light.png',
  MM_SONG_NOTE_AWAKENING: 'images/song_sonata.png',
  MM_SONG_NOTE_EMPTINESS: 'images/song_elegy.png',
  MM_SONG_NOTE_EPONA: 'images/song_epona.png',
  MM_SONG_NOTE_GORON: 'images/song_lullaby.png',
  MM_SONG_NOTE_HEALING: 'images/song_healing.png',
  MM_SONG_NOTE_ORDER: 'images/song_oath.png',
  MM_SONG_NOTE_SOARING: 'images/song_soaring.png',
  MM_SONG_NOTE_STORMS: 'images/song_storm.png',
  MM_SONG_NOTE_SUN: 'images/song_sun.png',
  MM_SONG_NOTE_TIME: 'images/song_time.png',
  MM_SONG_NOTE_ZORA: 'images/song_bossa_nova.png',
  MM_SONG_NOTE_ZELDA: 'images/song_zelda.png',
  MM_SONG_NOTE_SARIA: 'images/song_saria.png',
  MM_SONG_NOTE_TP_FOREST: 'images/song_forest.png',
  MM_SONG_NOTE_TP_FIRE: 'images/song_fire.png',
  MM_SONG_NOTE_TP_WATER: 'images/song_water.png',
  MM_SONG_NOTE_TP_SPIRIT: 'images/song_spirit.png',
  MM_SONG_NOTE_TP_SHADOW: 'images/song_shadow.png',
  MM_SONG_NOTE_TP_LIGHT: 'images/song_light.png',

  // Swords
  MM_SPIN_UPGRADE: 'images/great_spin_attack.png',

  // Rupees
  MM_RUPEE_SILVER: 'images/rupee.png',

  // Quest items
  MM_STRAY_FAIRY_TOWN: 'images/items/mm_clocktown_stray_fairy.png',
  MM_STRAY_FAIRY_WF: 'images/items/mm_woodfall_stray_fairy.png',
  MM_STRAY_FAIRY_SH: 'images/items/mm_snowhead_stray_fairy.png',
  MM_STRAY_FAIRY_GB: 'images/items/mm_greatbay_stray_fairy.png',
  MM_STRAY_FAIRY_ST: 'images/items/mm_stonetower_stray_fairy.png',
  MM_MOON_TEAR: 'images/items/mm_tear.png',
  MM_ROOM_KEY: 'images/items/mm_roomkey.png',
  MM_LETTER_TO_KAFEI: 'images/items/mm_letter.png',
  MM_LETTER_TO_MAMA: 'images/items/mm_delivery.png',
  MM_PENDANT_OF_MEMORIES: 'images/items/mm_pendant.png',
  MM_GS_TOKEN_SWAMP: 'images/items/mm_skulltulla_woodfall.png',
  MM_GS_TOKEN_OCEAN: 'images/items/mm_skulltulla_greatbay.png',
  MM_PLATINUM_TOKEN: 'images/skulltula_platinum.png',
  MM_SKELETON_KEY: 'images/key_skeleton.png',
  MM_STONE_OF_AGONY: 'images/agony.png',
  MM_TRANSCENDENT_FAIRY: 'images/stray_fairy_transcendent.png',
  MM_BOMBER_NOTEBOOK: 'images/bombers_notebook.png',

  // Buttons
  MM_BUTTON_A: 'images/button_a.png',
  MM_BUTTON_C_DOWN: 'images/button_down.png',
  MM_BUTTON_C_LEFT: 'images/button_left.png',
  MM_BUTTON_C_RIGHT: 'images/button_right.png',
  MM_BUTTON_C_UP: 'images/button_up.png',

  // Deeds
  MM_DEED_LAND: 'images/items/mm_deed1.png',
  MM_DEED_SWAMP: 'images/items/mm_deed2.png',
  MM_DEED_MOUNTAIN: 'images/items/mm_deed3.png',
  MM_DEED_OCEAN: 'images/items/mm_deed4.png',

  // Bottles
  MM_BOTTLE_EMPTY: 'images/items/mm_bottle.png',
  MM_BOTTLED_GOLD_DUST: 'images/items/mm_dust.png',

  // Transformation masks
  MM_MASK_DEKU: 'images/items/mm_deku.png',
  MM_MASK_GORON: 'images/items/mm_goron.png',
  MM_MASK_ZORA: 'images/items/mm_zora.png',
  MM_MASK_FIERCE_DEITY: 'images/items/mm_fiercedeity.png',
  MM_MASK_GIANT: 'images/items/mm_giant.png',

  // Regular masks
  MM_MASK_POSTMAN: 'images/items/mm_postman.png',
  MM_MASK_ALL_NIGHT: 'images/items/mm_allnight.png',
  MM_MASK_BLAST: 'images/items/mm_blast.png',
  MM_MASK_STONE: 'images/items/mm_stone.png',
  MM_MASK_GREAT_FAIRY: 'images/items/mm_greatfairy.png',
  MM_MASK_KEATON: 'images/items/mm_keaton.png',
  MM_MASK_BREMEN: 'images/items/mm_bremen.png',
  MM_MASK_BUNNY: 'images/items/mm_bunny.png',
  MM_MASK_DON_GERO: 'images/items/mm_dongero.png',
  MM_MASK_SCENTS: 'images/items/mm_scents.png',
  MM_MASK_ROMANI: 'images/items/mm_romanimask.png',
  MM_MASK_TROUPE_LEADER: 'images/items/mm_troupe.png',
  MM_MASK_KAFEI: 'images/items/mm_kafeimask.png',
  MM_MASK_COUPLE: 'images/items/mm_couple.png',
  MM_MASK_TRUTH: 'images/items/mm_maskoftruth.png',
  MM_MASK_KAMARO: 'images/items/mm_kamaro.png',
  MM_MASK_GIBDO: 'images/items/mm_gibdo.png',
  MM_MASK_GARO: 'images/items/mm_garo.png',
  MM_MASK_CAPTAIN: 'images/items/mm_captain.png',
  MM_MASK_GERUDO: 'images/gerudo.png',
  MM_MASK_SKULL: 'images/skull.png',
  MM_MASK_SPOOKY: 'images/spooky.png',

  // Boss remains
  MM_REMAINS_ODOLWA: 'images/items/mm_odolwa.png',
  MM_REMAINS_GOHT: 'images/items/mm_goht.png',
  MM_REMAINS_GYORG: 'images/items/mm_gyorg.png',
  MM_REMAINS_TWINMOLD: 'images/items/mm_twinmold.png',

  // Dungeon items
  MM_SMALL_KEY_WF: 'images/small_key.png',
  MM_SMALL_KEY_SH: 'images/small_key.png',
  MM_SMALL_KEY_GB: 'images/small_key.png',
  MM_SMALL_KEY_ST: 'images/small_key.png',
  MM_KEY_RING_WF: 'images/small_key.png',
  MM_KEY_RING_SH: 'images/small_key.png',
  MM_KEY_RING_GB: 'images/small_key.png',
  MM_KEY_RING_ST: 'images/small_key.png',
  MM_BOSS_KEY_WF: 'images/boss_key.png',
  MM_BOSS_KEY_SH: 'images/boss_key.png',
  MM_BOSS_KEY_GB: 'images/boss_key.png',
  MM_BOSS_KEY_ST: 'images/boss_key.png',

  // Owl statues
  MM_OWL_CLOCK_TOWN: 'images/activated_owl_statue.png',
  MM_OWL_SOUTHERN_SWAMP: 'images/activated_owl_statue.png',
  MM_OWL_WOODFALL: 'images/activated_owl_statue.png',
  MM_OWL_MILK_ROAD: 'images/activated_owl_statue.png',
  MM_OWL_MOUNTAIN_VILLAGE: 'images/activated_owl_statue.png',
  MM_OWL_SNOWHEAD: 'images/activated_owl_statue.png',
  MM_OWL_GREAT_BAY: 'images/activated_owl_statue.png',
  MM_OWL_ZORA_CAPE: 'images/activated_owl_statue.png',
  MM_OWL_IKANA_CANYON: 'images/activated_owl_statue.png',
  MM_OWL_STONE_TOWER: 'images/activated_owl_statue.png',

  // Clock items
  MM_CLOCK1: 'images/clock_1.png',
  MM_CLOCK2: 'images/clock_2.png',
  MM_CLOCK3: 'images/clock_3.png',
  MM_CLOCK4: 'images/clock_4.png',
  MM_CLOCK5: 'images/clock_5.png',
  MM_CLOCK6: 'images/clock_6.png',

  // === SPECIAL GRID ITEMS ===
  // These are custom items used in itemGrids.json that aren't actual game items

  // === SHARED ITEMS ===
  SHARED_ARROW_FIRE: 'images/arrow_fire.png',
  SHARED_ARROW_ICE: 'images/arrow_ice.png',
  SHARED_ARROW_LIGHT: 'images/arrow_light.png',
  SHARED_LENS: 'images/lens.png',
  SHARED_MASK_GORON: 'images/items/mm_goron.png',
  SHARED_MASK_ZORA: 'images/items/mm_zora.png',
  SHARED_MASK_BUNNY: 'images/bunny.png',
  SHARED_MASK_KEATON: 'images/keaton.png',
  SHARED_MASK_TRUTH: 'images/truth.png',
  SHARED_MASK_BLAST: 'images/items/mm_blast.png',
  SHARED_MASK_STONE: 'images/items/mm_stone.png',
  SHARED_SPIN_UPGRADE: 'images/great_spin_attack.png',
  SHARED_STONE_OF_AGONY: 'images/agony.png',
  SHARED_SPELL_FIRE: 'images/din.png',
  SHARED_SPELL_WIND: 'images/farore.png',
  SHARED_SPELL_LOVE: 'images/nayru.png',
  SHARED_SONG_EPONA: 'images/song_epona.png',
  SHARED_SONG_STORMS: 'images/song_storm.png',
  SHARED_SONG_TIME: 'images/song_time.png',
  SHARED_SONG_SUN: 'images/song_sun.png',
  SHARED_SONG_EMPTINESS: 'images/song_elegy.png',
  SHARED_SONG_NOTE_EPONA: 'images/song_epona.png',
  SHARED_SONG_NOTE_STORMS: 'images/song_storm.png',
  SHARED_SONG_NOTE_TIME: 'images/song_time.png',
  SHARED_SONG_NOTE_SUN: 'images/song_sun.png',
  SHARED_SONG_NOTE_EMPTINESS: 'images/song_elegy.png',
  SHARED_BOMBCHU: 'images/bombchu.png',
  SHARED_BOMBCHU_BAG: 'images/bombchu_bag.png',
  SHARED_HAMMER: 'images/hammer.png',
  SHARED_BOOTS_IRON: 'images/boots_iron.png',
  SHARED_BOOTS_HOVER: 'images/boots_hover.png',
  SHARED_TUNIC_GORON: 'images/redtunic.png',
  SHARED_TUNIC_ZORA: 'images/bluetunic.png',
  SHARED_SKELETON_KEY: 'images/key_skeleton.png',
  SHARED_BUTTON_A: 'images/button_a.png',
  SHARED_BUTTON_C_DOWN: 'images/button_down.png',
  SHARED_BUTTON_C_LEFT: 'images/button_left.png',
  SHARED_BUTTON_C_RIGHT: 'images/button_right.png',
  SHARED_BUTTON_C_UP: 'images/button_up.png',
  SHARED_BOTTLE_EMPTY: 'images/bottle.png',
  SHARED_BOTTLED_GOLD_DUST: 'images/items/mm_dust.png',
  SHARED_BOTTLE_RUTO_LETTER: 'images/bottle_letter.png',
  SHARED_TRIFORCE: 'images/triforce_piece.png',
  SHARED_TRIFORCE_POWER: 'images/triforce_piece.png',
  SHARED_TRIFORCE_WISDOM: 'images/triforce_piece.png',
  SHARED_TRIFORCE_COURAGE: 'images/triforce_piece.png',
  SHARED_SHIELD_DEKU: 'images/shield1.png',
  SHARED_SHIELD_HYLIAN: 'images/shield2.png',
  SHARED_SHIELD_MIRROR: 'images/shield3.png',
  SHARED_PLATINUM_TOKEN: 'images/skulltula_platinum.png',
};

export const ITEM_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(expandGroupedItemIdKeys(RAW_ITEM_ICONS)).map(
    ([key, value]) => [key, withBasePath(value)],
  ),
);

const GRID_TEXT_LABELS: Record<string, string> = {
  '10': '10',
  '20': '20',
  '30': '30',
  '40': '40',
  '50': '50',
  '99': '99',
  '200': '200',
  '500': '500',
  '999': '999',
  '9999': '9999',
  free_label: 'Free',
  mm_woodfall_label: 'Wood',
  mm_snowhead_label: 'Snow',
  mm_greatbay_label: 'Bay',
  mm_stonetower_label: 'Stone',
  oot_dekutree_label: 'Deku',
  oot_dc_label: 'DC',
  oot_jabu_label: 'Jabu',
  oot_foresttemple_label: 'Frst',
  oot_firetemple_label: 'Fire',
  oot_watertemple_label: 'Water',
  oot_spirittemple_label: 'Sprt',
  oot_spirittemple_silver_label: 'Sprt',
  oot_shadowtemple_label: 'Shdw',
  oot_shadowtemple_silver_label: 'Shdw',
  oot_ganoncastle_label: 'GC',
  oot_ganoncastle_silver_label: 'GC',
  oot_gerudotraining_label: 'GTG',
  oot_gerudotraining_silver_label: 'GTG',
  oot_gerudofortress_label: 'TH',
  oot_ice_label: 'Ice',
  oot_well_label: 'BotW',
  oot_well_silver_label: 'BotW',
  oot_chestgame_label: 'Chest',
};

const GRID_TEXT_LABELS_BY_VALUE = new Map<string, string>(
  Object.entries(GRID_TEXT_LABELS),
);

// Count-based icon variants used only by the Item Grid rendering.
// Index 0 => count 1, index 1 => count 2, ...
interface GridIconVariantContext {
  maxCount?: number;
  availableItemIds?: Set<string>;
  inventory?: Map<string, number>;
  settings?: Record<string, unknown> | null;
}

interface GridIconVariantWhen {
  settings?: Record<string, unknown | unknown[]>;
  hasAnyAvailableItemIds?: string[];
  hasAllAvailableItemIds?: string[];
  hasAnyInventoryItemIds?: string[];
  hasAllInventoryItemIds?: string[];
  minMaxCount?: number;
  maxMaxCount?: number;
}

interface GridIconVariantRule {
  when: GridIconVariantWhen;
  icons: string[];
  overlays?: Array<string | null>;
  startUndimmed?: boolean;
  autoSelectItemId?: string | string[];
  linkedItemIds?: string[];
}

interface GridIconDefaultConfig {
  icons: string[];
  overlays?: Array<string | null>;
  startUndimmed?: boolean;
  autoSelectItemId?: string | string[];
  linkedItemIds?: string[];
}

interface GridWheelOverlayConfig {
  overlays: string[];
  stateItemId?: string;
}

type GridIconVariantConfig =
  | string[]
  | {
      default: string[] | GridIconDefaultConfig;
      variants?: GridIconVariantRule[];
    };

type GridWheelOverlayDefinition = string[] | GridWheelOverlayConfig;

const WALLET_OVERLAY_VALUES_1 = ['99', '200', '500'];
const WALLET_OVERLAY_VALUES_2 = ['99', '200', '500', '999'];
const WALLET_OVERLAY_VALUES_3 = ['99', '200', '500', '999', '9999'];
const STICK_UPGRADE_OVERLAY_VALUES = ['10', '20', '30'];
const BOMB_AND_NUT_OVERLAY_VALUES = ['20', '30', '40'];
const BOW_OVERLAY_VALUES = ['30', '40', '50'];

const RAW_GRID_ICON_VARIANTS: Record<string, GridIconVariantConfig> = {
  // `when.settings` can include multiple settings at once.
  // Multiple settings are matched with AND logic (all must match).
  // A single setting can accept multiple values via an array (OR logic).
  // Example: settings: { bronzeScale: true, progressiveSwordsOot: ['shared', 'progressive'] }
  // Example: OOT Strength upgrade levels
  'OOT_STRENGTH|MM_STRENGTH|SHARED_STRENGTH': [
    'images/lift1.png',
    'images/lift2.png',
    'images/lift3.png',
  ],

  // OOT Scale: default has 2 levels, bronze setting adds a 3rd pre-stage.
  // Driven by tracker setting values.
  'OOT_SCALE|MM_SCALE|SHARED_SCALE': {
    default: ['images/scale1.png', 'images/scale2.png'],
    variants: [
      {
        when: {
          settings: {
            bronzeScale: true,
          },
        },
        icons: [
          'images/scale_bronze.png',
          'images/scale1.png',
          'images/scale2.png',
        ],
      },
    ],
  },

  'OOT_WALLET|SHARED_WALLET': {
    default: {
      icons: [
        'images/items/mm_wallet.png',
        'images/items/mm_wallet.png',
        'images/items/mm_wallet.png',
      ],
      overlays: WALLET_OVERLAY_VALUES_1,
      startUndimmed: true,
    },
    variants: [
      {
        when: {
          settings: {
            childWallets: false,
            colossalWallets: true,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_2,
        startUndimmed: true,
      },
      {
        when: {
          settings: {
            childWallets: false,
            colossalWallets: true,
            bottomlessWallets: true,
          },
        },
        icons: [
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_3,
        startUndimmed: true,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: false,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_1,
        startUndimmed: false,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: true,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_2,
        startUndimmed: false,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: true,
            bottomlessWallets: true,
          },
        },
        icons: [
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
          'images/items/mm_wallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_3,
        startUndimmed: false,
      },
    ],
  },
  MM_WALLET: {
    default: {
      icons: [
        'images/items/mm_wallet99.png',
        'images/items/mm_wallet.png',
        'images/items/mm_giantwallet.png',
      ],
      overlays: WALLET_OVERLAY_VALUES_1,
      startUndimmed: true,
    },
    variants: [
      {
        when: {
          settings: {
            childWallets: false,
            colossalWallets: true,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet99.png',
          'images/items/mm_wallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_2,
        startUndimmed: true,
      },
      {
        when: {
          settings: {
            childWallets: false,
            colossalWallets: true,
            bottomlessWallets: true,
          },
        },
        icons: [
          'images/items/mm_wallet99.png',
          'images/items/mm_wallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_3,
        startUndimmed: true,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: false,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet99.png',
          'images/items/mm_wallet.png',
          'images/items/mm_giantwallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_1,
        startUndimmed: false,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: true,
            bottomlessWallets: false,
          },
        },
        icons: [
          'images/items/mm_wallet99.png',
          'images/items/mm_wallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_2,
        startUndimmed: false,
      },
      {
        when: {
          settings: {
            childWallets: true,
            colossalWallets: true,
            bottomlessWallets: true,
          },
        },
        icons: [
          'images/items/mm_wallet99.png',
          'images/items/mm_wallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
          'images/items/mm_giantwallet.png',
        ],
        overlays: WALLET_OVERLAY_VALUES_3,
        startUndimmed: false,
      },
    ],
  },
  OOT_STICK_UPGRADE: {
    default: {
      icons: ['images/stick.png', 'images/stick.png', 'images/stick.png'],
      overlays: STICK_UPGRADE_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'OOT_STICK',
    },
  },
  MM_STICK_UPGRADE: {
    default: {
      icons: ['images/stick.png', 'images/stick.png', 'images/stick.png'],
      overlays: STICK_UPGRADE_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'MM_STICK',
    },
  },
  SHARED_STICK_UPGRADE: {
    default: {
      icons: ['images/stick.png', 'images/stick.png', 'images/stick.png'],
      overlays: STICK_UPGRADE_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'SHARED_STICK',
    },
  },
  OOT_NUT_UPGRADE: {
    default: {
      icons: ['images/nut.png', 'images/nut.png', 'images/nut.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'OOT_NUTS_5',
    },
  },
  SHARED_NUT_UPGRADE: {
    default: {
      icons: ['images/nut.png', 'images/nut.png', 'images/nut.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'SHARED_NUTS_5',
    },
  },
  MM_NUT_UPGRADE: {
    default: {
      icons: ['images/nut.png', 'images/nut.png', 'images/nut.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'MM_NUTS_5',
    },
  },
  OOT_BOMB_BAG: {
    default: {
      icons: ['images/bomb.png', 'images/bomb.png', 'images/bomb.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'OOT_BOMBS_10',
    },
  },
  MM_BOMB_BAG: {
    default: {
      icons: ['images/bomb.png', 'images/bomb.png', 'images/bomb.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'MM_BOMBS_10',
    },
  },
  SHARED_BOMB_BAG: {
    default: {
      icons: ['images/bomb.png', 'images/bomb.png', 'images/bomb.png'],
      overlays: BOMB_AND_NUT_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'SHARED_BOMBS_10',
    },
  },
  OOT_BOW: {
    default: {
      icons: ['images/bow.png', 'images/bow.png', 'images/bow.png'],
      overlays: BOW_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'OOT_ARROWS_10',
    },
  },
  SHARED_BOW: {
    default: {
      icons: ['images/bow.png', 'images/bow.png', 'images/bow.png'],
      overlays: BOW_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'SHARED_ARROWS_10',
    },
  },
  MM_BOW: {
    default: {
      icons: [
        'images/items/mm_bow.png',
        'images/items/mm_bow.png',
        'images/items/mm_bow.png',
      ],
      overlays: BOW_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'MM_ARROWS_10',
    },
  },
  OOT_BOTTLE_EMPTY: {
    default: {
      icons: [
        'images/bottle.png',
        'images/bottle_red.png',
        'images/bottle_green.png',
        'images/bottle_blue.png',
        'images/bottle_fire.png',
        'images/bottle_milk.png',
      ],
      startUndimmed: false,
      linkedItemIds: [
        'OOT_BOTTLE_EMPTY',
        'OOT_BOTTLE_POTION_RED',
        'OOT_BOTTLE_POTION_GREEN',
        'OOT_BOTTLE_POTION_BLUE',
        'OOT_BOTTLE_BLUE_FIRE',
        'OOT_BOTTLE_MILK',
      ],
    },
  },
  MM_BOTTLE_EMPTY: {
    default: {
      icons: [
        'images/bottle.png',
        'images/bottle_red.png',
        'images/bottle_green.png',
        'images/bottle_blue.png',
        'images/bottle_fire.png',
        'images/bottle_milk.png',
        'images/items/mm_chateau.png',
      ],
      startUndimmed: false,
      linkedItemIds: [
        'MM_BOTTLE_EMPTY',
        'MM_BOTTLE_POTION_RED',
        'MM_BOTTLE_POTION_GREEN',
        'MM_BOTTLE_POTION_BLUE',
        'MM_BOTTLE_BLUE_FIRE',
        'MM_BOTTLE_MILK',
        'MM_BOTTLE_CHATEAU',
      ],
    },
  },
  SHARED_BOTTLE_EMPTY: {
    default: {
      icons: [
        'images/bottle.png',
        'images/bottle_red.png',
        'images/bottle_green.png',
        'images/bottle_blue.png',
        'images/bottle_fire.png',
        'images/bottle_milk.png',
        'images/items/mm_chateau.png',
      ],
      startUndimmed: false,
      linkedItemIds: [
        'SHARED_BOTTLE_EMPTY',
        'SHARED_BOTTLE_POTION_RED',
        'SHARED_BOTTLE_POTION_GREEN',
        'SHARED_BOTTLE_POTION_BLUE',
        'SHARED_BOTTLE_BLUE_FIRE',
        'SHARED_BOTTLE_MILK',
        'SHARED_BOTTLE_CHATEAU',
      ],
    },
  },
  OOT_SLINGSHOT: {
    default: {
      icons: [
        'images/slingshot.png',
        'images/slingshot.png',
        'images/slingshot.png',
      ],
      overlays: BOW_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'OOT_SEEDS_30',
    },
  },
  MM_SLINGSHOT: {
    default: {
      icons: [
        'images/slingshot.png',
        'images/slingshot.png',
        'images/slingshot.png',
      ],
      overlays: BOW_OVERLAY_VALUES,
      startUndimmed: false,
      autoSelectItemId: 'MM_SEEDS_30',
    },
  },
  'OOT_HOOKSHOT|SHARED_HOOKSHOT': {
    default: {
      icons: ['images/hookshot.png', 'images/longshot.png'],
      startUndimmed: false,
    },
  },
  MM_HOOKSHOT: {
    default: {
      icons: ['images/items/mm_hookshot.png'],
      startUndimmed: false,
    },
    variants: [
      {
        when: {
          settings: {
            shortHookshotMm: true,
          },
        },
        icons: ['images/hookshotd.png', 'images/items/mm_hookshot.png'],
        startUndimmed: false,
      },
    ],
  },
  'OOT_OCARINA|SHARED_OCARINA': {
    default: {
      icons: ['images/fairyocarina.png', 'images/ocarina.png'],
      startUndimmed: false,
    },
  },
  MM_OCARINA: {
    default: {
      icons: ['images/items/mm_ocarina.png'],
      startUndimmed: false,
    },
    variants: [
      {
        when: {
          settings: {
            fairyOcarinaMm: true,
          },
        },
        icons: ['images/fairyocarina.png', 'images/items/mm_ocarina.png'],
        startUndimmed: false,
      },
    ],
  },
  OOT_MAGIC_UPGRADE: {
    default: {
      icons: ['images/magic1.png', 'images/magic2.png'],
      startUndimmed: false,
      autoSelectItemId: 'OOT_MAGIC_JAR_SMALL',
    },
  },
  SHARED_MAGIC_UPGRADE: {
    default: {
      icons: ['images/magic1.png', 'images/magic2.png'],
      startUndimmed: false,
      autoSelectItemId: 'SHARED_MAGIC_JAR_SMALL',
    },
  },
  MM_MAGIC_UPGRADE: {
    default: {
      icons: ['images/items/mm_magic1.png', 'images/items/mm_magic2.png'],
      startUndimmed: false,
      autoSelectItemId: 'MM_MAGIC_JAR_SMALL',
    },
  },
  'OOT_SWORD|SHARED_SWORD': {
    default: {
      icons: ['images/sword1.png'],
      startUndimmed: false,
    },
    variants: [
      {
        when: {
          settings: {
            extraChildSwordsOot: true,
          },
        },
        icons: [
          'images/sword1.png',
          'images/items/mm_razor.png',
          'images/items/mm_gilded.png',
        ],
        startUndimmed: false,
      },
    ],
  },
  MM_SWORD: {
    default: {
      icons: [
        'images/items/mm_kokiri.png',
        'images/items/mm_razor.png',
        'images/items/mm_gilded.png',
      ],
      startUndimmed: false,
    },
  },
  MM_SONG_GORON_HALF: {
    default: {
      icons: ['images/song_intro.png', 'images/song_lullaby.png'],
      startUndimmed: false,
    },
  },
  OOT_SONG_GORON_HALF: {
    default: {
      icons: ['images/song_intro.png', 'images/song_lullaby.png'],
      startUndimmed: false,
    },
  },
};

export const FREE_REWARD_LABEL_ITEM_ID = 'free_label';

export const DUNGEON_REWARD_ITEM_IDS = [
  'OOT_STONE_EMERALD',
  'OOT_STONE_RUBY',
  'OOT_STONE_SAPPHIRE',
  'OOT_MEDALLION_FOREST',
  'OOT_MEDALLION_FIRE',
  'OOT_MEDALLION_WATER',
  'OOT_MEDALLION_SPIRIT',
  'OOT_MEDALLION_SHADOW',
  'OOT_MEDALLION_LIGHT',
  'MM_REMAINS_ODOLWA',
  'MM_REMAINS_GOHT',
  'MM_REMAINS_GYORG',
  'MM_REMAINS_TWINMOLD',
] as const;

export const DUNGEON_REWARD_REGION_LABELS = [
  { regionName: 'Deku Tree', labelItemId: 'oot_dekutree_label' },
  { regionName: "Dodongo's Cavern", labelItemId: 'oot_dc_label' },
  { regionName: "Jabu-Jabu's Belly", labelItemId: 'oot_jabu_label' },
  { regionName: 'Forest Temple', labelItemId: 'oot_foresttemple_label' },
  { regionName: 'Fire Temple', labelItemId: 'oot_firetemple_label' },
  { regionName: 'Water Temple', labelItemId: 'oot_watertemple_label' },
  { regionName: 'Spirit Temple', labelItemId: 'oot_spirittemple_label' },
  { regionName: 'Shadow Temple', labelItemId: 'oot_shadowtemple_label' },
  { regionName: 'Woodfall Temple', labelItemId: 'mm_woodfall_label' },
  { regionName: 'Snowhead Temple', labelItemId: 'mm_snowhead_label' },
  { regionName: 'Great Bay Temple', labelItemId: 'mm_greatbay_label' },
  { regionName: 'Stone Tower Temple', labelItemId: 'mm_stonetower_label' },
] as const;

const REWARD_DUNGEON_LABEL_OVERLAYS = [
  FREE_REWARD_LABEL_ITEM_ID,
  ...DUNGEON_REWARD_REGION_LABELS.map(({ labelItemId }) => labelItemId),
];

const RAW_GRID_WHEEL_OVERLAYS: Record<string, GridWheelOverlayDefinition> = {
  [DUNGEON_REWARD_ITEM_IDS.join('|')]: REWARD_DUNGEON_LABEL_OVERLAYS,
};

interface ResolvedGridWheelOverlayConfig {
  values: string[];
  overlays: Array<string | null>;
  stateItemId: string;
}

const GRID_WHEEL_OVERLAY_STATE_PREFIX = '__grid_wheel_overlay_state__:';

function makeGridWheelOverlayStateItemId(itemId: string): string {
  return `${GRID_WHEEL_OVERLAY_STATE_PREFIX}${itemId}`;
}

function normalizeGridWheelOverlayConfig(
  config: GridWheelOverlayDefinition,
): GridWheelOverlayConfig {
  if (Array.isArray(config)) {
    return { overlays: config };
  }

  return {
    overlays: config.overlays,
    stateItemId: config.stateItemId,
  };
}

function resolveGridOverlayImageValue(value: string): string | null {
  if (!value || GRID_TEXT_LABELS_BY_VALUE.has(value)) {
    return null;
  }

  return ITEM_ICONS[value] || withBasePath(value);
}

const GRID_WHEEL_OVERLAYS: Record<string, ResolvedGridWheelOverlayConfig> =
  Object.fromEntries(
    Object.entries(expandGroupedItemIdKeys(RAW_GRID_WHEEL_OVERLAYS)).map(
      ([key, rawConfig]) => {
        const normalizedConfig = normalizeGridWheelOverlayConfig(rawConfig);
        return [
          key,
          {
            values: normalizedConfig.overlays,
            overlays: normalizedConfig.overlays.map((value) =>
              resolveGridOverlayImageValue(value),
            ),
            stateItemId:
              normalizedConfig.stateItemId ||
              makeGridWheelOverlayStateItemId(key),
          },
        ];
      },
    ),
  );

interface ResolvedGridIconConfig {
  icons: string[];
  overlayValues?: Array<string | null>;
  overlays?: Array<string | null>;
  startUndimmed: boolean;
  autoSelectItemIds?: string[];
  linkedItemIds?: string[];
}

function normalizeGridAutoSelectItemIds(
  itemIds: string | string[] | undefined,
): string[] | undefined {
  if (!itemIds) return undefined;

  const normalized = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(
    (itemId) => typeof itemId === 'string' && itemId.length > 0,
  );

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGridIconDefaultConfig(
  config: string[] | GridIconDefaultConfig,
): GridIconDefaultConfig {
  if (Array.isArray(config)) {
    return { icons: config, overlays: undefined, startUndimmed: false };
  }
  return {
    icons: config.icons,
    overlays: config.overlays,
    startUndimmed: !!config.startUndimmed,
    autoSelectItemId: config.autoSelectItemId,
    linkedItemIds: config.linkedItemIds,
  };
}

function withBasePathForVariantConfig(
  config: GridIconVariantConfig,
): GridIconVariantConfig {
  if (Array.isArray(config)) {
    return config.map((value) => withBasePath(value));
  }

  const normalizedDefault = normalizeGridIconDefaultConfig(config.default);

  return {
    default: {
      icons: normalizedDefault.icons.map((value) => withBasePath(value)),
      overlays: normalizedDefault.overlays,
      startUndimmed: normalizedDefault.startUndimmed,
      autoSelectItemId: normalizedDefault.autoSelectItemId,
      linkedItemIds: normalizedDefault.linkedItemIds,
    },
    variants: config.variants?.map((variant) => ({
      when: variant.when,
      icons: variant.icons.map((value) => withBasePath(value)),
      overlays: variant.overlays,
      startUndimmed: variant.startUndimmed,
      autoSelectItemId: variant.autoSelectItemId,
      linkedItemIds: variant.linkedItemIds,
    })),
  };
}

export const GRID_ICON_VARIANTS: Record<string, GridIconVariantConfig> =
  Object.fromEntries(
    Object.entries(expandGroupedItemIdKeys(RAW_GRID_ICON_VARIANTS)).map(
      ([key, config]) => [key, withBasePathForVariantConfig(config)],
    ),
  );

function hasAny(set: Set<string>, values: string[]): boolean {
  return values.some((value) => set.has(value));
}

function hasAll(set: Set<string>, values: string[]): boolean {
  return values.every((value) => set.has(value));
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function valueMatchesExpected(
  actual: unknown,
  expected: unknown | unknown[],
): boolean {
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((expectedValue) => {
    if (actual === expectedValue) return true;

    const expectedBool = coerceBoolean(expectedValue);
    if (expectedBool !== null) {
      const actualBool = coerceBoolean(actual);
      if (actualBool !== null) return actualBool === expectedBool;
    }

    return false;
  });
}

function matchesVariantRule(
  when: GridIconVariantWhen,
  context: GridIconVariantContext,
): boolean {
  const settings = context.settings;
  const availableItemIds = context.availableItemIds;
  const inventory = context.inventory;
  const inventoryIds = inventory
    ? new Set(
        [...inventory.entries()]
          .filter(([, count]) => count > 0)
          .map(([id]) => id),
      )
    : null;

  if (when.settings) {
    if (!settings) return false;
    for (const [settingKey, expectedValue] of Object.entries(when.settings)) {
      if (!valueMatchesExpected(settings[settingKey], expectedValue))
        return false;
    }
  }

  if (typeof when.minMaxCount === 'number') {
    if (
      typeof context.maxCount !== 'number' ||
      context.maxCount < when.minMaxCount
    )
      return false;
  }
  if (typeof when.maxMaxCount === 'number') {
    if (
      typeof context.maxCount !== 'number' ||
      context.maxCount > when.maxMaxCount
    )
      return false;
  }

  if (when.hasAnyAvailableItemIds?.length) {
    if (
      !availableItemIds ||
      !hasAny(availableItemIds, when.hasAnyAvailableItemIds)
    )
      return false;
  }
  if (when.hasAllAvailableItemIds?.length) {
    if (
      !availableItemIds ||
      !hasAll(availableItemIds, when.hasAllAvailableItemIds)
    )
      return false;
  }

  if (when.hasAnyInventoryItemIds?.length) {
    if (!inventoryIds || !hasAny(inventoryIds, when.hasAnyInventoryItemIds))
      return false;
  }
  if (when.hasAllInventoryItemIds?.length) {
    if (!inventoryIds || !hasAll(inventoryIds, when.hasAllInventoryItemIds))
      return false;
  }

  return true;
}

function getResolvedGridIconVariants(
  itemId: string,
  context: GridIconVariantContext,
): ResolvedGridIconConfig | null {
  const config = GRID_ICON_VARIANTS[itemId];
  if (!config) return null;

  if (Array.isArray(config)) {
    return {
      icons: config,
      overlayValues: undefined,
      overlays: undefined,
      startUndimmed: false,
    };
  }

  if (config.variants && config.variants.length > 0) {
    const matched = config.variants.find((variant) =>
      matchesVariantRule(variant.when, context),
    );
    if (matched && matched.icons.length > 0) {
      return {
        icons: matched.icons,
        overlayValues: matched.overlays,
        overlays: matched.overlays?.map((value) =>
          value ? resolveGridOverlayImageValue(value) : null,
        ),
        startUndimmed: !!matched.startUndimmed,
        autoSelectItemIds: normalizeGridAutoSelectItemIds(
          matched.autoSelectItemId,
        ),
        linkedItemIds: matched.linkedItemIds,
      };
    }
  }

  const normalizedDefault = normalizeGridIconDefaultConfig(config.default);
  return normalizedDefault.icons.length > 0
    ? {
        icons: normalizedDefault.icons,
        overlayValues: normalizedDefault.overlays,
        overlays: normalizedDefault.overlays?.map((value) =>
          value ? resolveGridOverlayImageValue(value) : null,
        ),
        startUndimmed: normalizedDefault.startUndimmed || false,
        autoSelectItemIds: normalizeGridAutoSelectItemIds(
          normalizedDefault.autoSelectItemId,
        ),
        linkedItemIds: normalizedDefault.linkedItemIds,
      }
    : null;
}

function getResolvedGridWheelOverlayConfig(
  itemId: string,
): ResolvedGridWheelOverlayConfig | null {
  return GRID_WHEEL_OVERLAYS[itemId] || null;
}

function normalizeGridWheelOverlayStage(
  stage: number,
  overlayCount: number,
): number {
  if (!Number.isFinite(stage) || overlayCount <= 0) return 0;

  const normalizedStage = Math.max(0, Math.floor(stage));
  if (normalizedStage === 0) return 0;

  return ((normalizedStage - 1) % overlayCount) + 1;
}

function getResolvedGridVariantIndex(
  count: number,
  resolved: ResolvedGridIconConfig,
): number {
  const normalizedCount = Math.max(count, 0);
  const levelCount = resolved.startUndimmed
    ? normalizedCount + 1
    : Math.max(normalizedCount, 1);
  return Math.min(levelCount, resolved.icons.length) - 1;
}

// Default fallback icon
export const DEFAULT_ICON = withBasePath('images/unknown.png');

/**
 * Get the icon path for an item ID
 */
export function getItemIcon(itemId: string): string {
  return ITEM_ICONS[itemId] || DEFAULT_ICON;
}

export function getGridTextLabel(value: string): string | null {
  if (!value) return null;
  return GRID_TEXT_LABELS_BY_VALUE.get(value) || null;
}

const GRID_ICON_BADGE_LABELS: Record<string, string> = {
  MM_OWL_CLOCK_TOWN: 'Town',
  MM_OWL_SOUTHERN_SWAMP: 'Swmp',
  MM_OWL_WOODFALL: 'Wood',
  MM_OWL_MILK_ROAD: 'Milk',
  MM_OWL_MOUNTAIN_VILLAGE: 'Mtn',
  MM_OWL_SNOWHEAD: 'Snow',
  MM_OWL_GREAT_BAY: 'Bay',
  MM_OWL_ZORA_CAPE: 'Zora',
  MM_OWL_IKANA_CANYON: 'Ikana',
  MM_OWL_STONE_TOWER: 'Stone',

  // Silver Rupees – Spirit Temple
  OOT_RUPEE_SILVER_SPIRIT_CHILD: 'Child',
  OOT_POUCH_SILVER_SPIRIT_CHILD: 'Child',
  OOT_RUPEE_SILVER_SPIRIT_SUN: 'Sun',
  OOT_POUCH_SILVER_SPIRIT_SUN: 'Sun',
  OOT_RUPEE_SILVER_SPIRIT_BOULDERS: 'Bouldr',
  OOT_POUCH_SILVER_SPIRIT_BOULDERS: 'Bouldr',
  OOT_RUPEE_SILVER_SPIRIT_LOBBY: 'Lobby',
  OOT_POUCH_SILVER_SPIRIT_LOBBY: 'Lobby',
  OOT_RUPEE_SILVER_SPIRIT_ADULT: 'Adult',
  OOT_POUCH_SILVER_SPIRIT_ADULT: 'Adult',

  // Silver Rupees – Gerudo Training Ground
  OOT_RUPEE_SILVER_GTG_SLOPES: 'Slopes',
  OOT_POUCH_SILVER_GTG_SLOPES: 'Slopes',
  OOT_RUPEE_SILVER_GTG_LAVA: 'Lava',
  OOT_POUCH_SILVER_GTG_LAVA: 'Lava',
  OOT_RUPEE_SILVER_GTG_WATER: 'Water',
  OOT_POUCH_SILVER_GTG_WATER: 'Water',

  // Silver Rupees – Shadow Temple
  OOT_RUPEE_SILVER_SHADOW_SCYTHE: 'Scythe',
  OOT_POUCH_SILVER_SHADOW_SCYTHE: 'Scythe',
  OOT_RUPEE_SILVER_SHADOW_PIT: 'Pit',
  OOT_POUCH_SILVER_SHADOW_PIT: 'Pit',
  OOT_RUPEE_SILVER_SHADOW_SPIKES: 'Spikes',
  OOT_POUCH_SILVER_SHADOW_SPIKES: 'Spikes',
  OOT_RUPEE_SILVER_SHADOW_BLADES: 'Blades',
  OOT_POUCH_SILVER_SHADOW_BLADES: 'Blades',

  // Silver Rupees – Ice Cavern
  OOT_RUPEE_SILVER_IC_SCYTHE: 'Scythe',
  OOT_POUCH_SILVER_IC_SCYTHE: 'Scythe',
  OOT_RUPEE_SILVER_IC_BLOCK: 'Block',
  OOT_POUCH_SILVER_IC_BLOCK: 'Block',

  // Silver Rupees – Ganon's Castle
  OOT_RUPEE_SILVER_GANON_SPIRIT: 'Spirit',
  OOT_POUCH_SILVER_GANON_SPIRIT: 'Spirit',
  OOT_RUPEE_SILVER_GANON_LIGHT: 'Light',
  OOT_POUCH_SILVER_GANON_LIGHT: 'Light',
  OOT_RUPEE_SILVER_GANON_FIRE: 'Fire',
  OOT_POUCH_SILVER_GANON_FIRE: 'Fire',
  OOT_RUPEE_SILVER_GANON_FOREST: 'Forest',
  OOT_POUCH_SILVER_GANON_FOREST: 'Forest',
  OOT_RUPEE_SILVER_GANON_SHADOW: 'Shadow',
  OOT_POUCH_SILVER_GANON_SHADOW: 'Shadow',
  OOT_RUPEE_SILVER_GANON_WATER: 'Water',
  OOT_POUCH_SILVER_GANON_WATER: 'Water',

  // Silver Rupees – Other
  OOT_RUPEE_SILVER_DC: 'DC',
  OOT_POUCH_SILVER_DC: 'DC',
  OOT_RUPEE_SILVER_BOTW: 'Well',
  OOT_POUCH_SILVER_BOTW: 'Well',
};

export function getGridIconBadge(itemId: string): string | null {
  if (!itemId) return null;
  return GRID_ICON_BADGE_LABELS[itemId] || null;
}

/**
 * Get Item Grid icon path for an item ID and count.
 * If variants are configured, count>0 uses the corresponding variant icon.
 * Falls back to the regular item icon mapping for all other cases.
 */
export function getGridItemIcon(
  itemId: string,
  count: number,
  context: GridIconVariantContext = {},
): string {
  const resolved = getResolvedGridIconVariants(itemId, context);
  if (!resolved || resolved.icons.length === 0) {
    return getItemIcon(itemId);
  }

  const variantIndex = getResolvedGridVariantIndex(count, resolved);
  return resolved.icons[variantIndex] || getItemIcon(itemId);
}

/**
 * Get Item Grid overlay path for an item ID and count.
 * Returns null when no overlay is configured for the active stage.
 */
export function getGridItemOverlay(
  itemId: string,
  count: number,
  context: GridIconVariantContext = {},
): string | null {
  const resolved = getResolvedGridIconVariants(itemId, context);
  if (!resolved || !resolved.overlays || resolved.overlays.length === 0) {
    return null;
  }

  const variantIndex = getResolvedGridVariantIndex(count, resolved);
  return resolved.overlays[variantIndex] || null;
}

export function getGridItemOverlayValue(
  itemId: string,
  count: number,
  context: GridIconVariantContext = {},
): string | null {
  const resolved = getResolvedGridIconVariants(itemId, context);
  if (
    !resolved ||
    !resolved.overlayValues ||
    resolved.overlayValues.length === 0
  ) {
    return null;
  }

  const variantIndex = getResolvedGridVariantIndex(count, resolved);
  return resolved.overlayValues[variantIndex] || null;
}

export function getGridItemOverlayText(
  itemId: string,
  count: number,
  context: GridIconVariantContext = {},
): string | null {
  const overlayValue = getGridItemOverlayValue(itemId, count, context);
  return overlayValue ? getGridTextLabel(overlayValue) : null;
}

/**
 * Get the inventory-backed state item ID used for mouse-wheel grid overlays.
 */
export function getGridWheelOverlayStateItemId(itemId: string): string | null {
  return getResolvedGridWheelOverlayConfig(itemId)?.stateItemId || null;
}

/**
 * Get the number of selectable mouse-wheel overlays configured for a grid item.
 */
export function getGridWheelOverlayStageCount(itemId: string): number {
  return getResolvedGridWheelOverlayConfig(itemId)?.overlays.length || 0;
}

/**
 * Resolve a configured mouse-wheel overlay value to its 1-based stage index.
 * Returns 0 when the overlay is not configured for the item.
 */
export function getGridWheelOverlayStageForValue(
  itemId: string,
  overlayValue: string,
): number {
  const resolved = getResolvedGridWheelOverlayConfig(itemId);
  if (!resolved || !overlayValue) return 0;

  const normalizedOverlay = resolveGridOverlayImageValue(overlayValue);
  const stageIndex = resolved.values.findIndex(
    (value, index) =>
      value === overlayValue ||
      (normalizedOverlay !== null &&
        resolved.overlays[index] === normalizedOverlay),
  );
  return stageIndex >= 0 ? stageIndex + 1 : 0;
}

/**
 * Get the currently selected mouse-wheel overlay stage for a grid item.
 * Stage 0 means "no overlay selected".
 */
export function getGridWheelOverlayStage(
  itemId: string,
  context: GridIconVariantContext = {},
): number {
  const resolved = getResolvedGridWheelOverlayConfig(itemId);
  if (!resolved || !context.inventory) return 0;

  return normalizeGridWheelOverlayStage(
    context.inventory.get(resolved.stateItemId) || 0,
    resolved.overlays.length,
  );
}

/**
 * Get the currently selected mouse-wheel overlay path for a grid item.
 */
export function getGridWheelOverlay(
  itemId: string,
  context: GridIconVariantContext = {},
): string | null {
  const resolved = getResolvedGridWheelOverlayConfig(itemId);
  if (!resolved || resolved.overlays.length === 0) return null;

  const stage = getGridWheelOverlayStage(itemId, context);
  if (stage <= 0) return null;

  return resolved.overlays[stage - 1] || null;
}

export function getGridWheelOverlayValue(
  itemId: string,
  context: GridIconVariantContext = {},
): string | null {
  const resolved = getResolvedGridWheelOverlayConfig(itemId);
  if (!resolved || resolved.values.length === 0) return null;

  const stage = getGridWheelOverlayStage(itemId, context);
  if (stage <= 0) return null;

  return resolved.values[stage - 1] || null;
}

export interface GridWheelOverlayOption {
  stage: number;
  value: string;
  overlay: string | null;
}

export function getGridWheelOverlayOptions(
  itemId: string,
): GridWheelOverlayOption[] {
  const resolved = getResolvedGridWheelOverlayConfig(itemId);
  if (!resolved || resolved.values.length === 0) {
    return [];
  }

  return resolved.values.map((value, index) => ({
    stage: index + 1,
    value,
    overlay: resolved.overlays[index] || null,
  }));
}

/**
 * Check whether a grid item should start undimmed at count=0.
 */
export function startsGridItemUndimmed(
  itemId: string,
  context: GridIconVariantContext = {},
): boolean {
  const resolved = getResolvedGridIconVariants(itemId, context);
  if (!resolved) return false;
  return resolved.startUndimmed;
}

/**
 * Get inventory item IDs that should be auto-selected alongside the grid item.
 */
export function getGridItemAutoSelectItemIds(
  itemId: string,
  context: GridIconVariantContext = {},
): string[] | null {
  const resolved = getResolvedGridIconVariants(itemId, context);
  return resolved?.autoSelectItemIds || null;
}

/**
 * Backwards-compatible singular accessor for grid auto-select item IDs.
 */
export function getGridItemAutoSelectItemId(
  itemId: string,
  context: GridIconVariantContext = {},
): string | null {
  return getGridItemAutoSelectItemIds(itemId, context)?.[0] || null;
}

/**
 * Get linked inventory item IDs for a grid item progression.
 * Stage 1 maps to index 0, stage 2 to index 1, etc.
 */
export function getGridItemLinkedItemIds(
  itemId: string,
  context: GridIconVariantContext = {},
): string[] | null {
  const resolved = getResolvedGridIconVariants(itemId, context);
  return resolved?.linkedItemIds || null;
}

/**
 * Get the max logical count implied by the Item Grid definition itself.
 * This is derived from linked progression items or from the number of
 * count-based icon stages when the grid defines multiple visible states.
 */
export function getGridItemDefinedMaxCount(
  itemId: string,
  context: GridIconVariantContext = {},
): number | null {
  const resolved = getResolvedGridIconVariants(itemId, context);
  if (!resolved || resolved.icons.length === 0) return null;

  if (resolved.linkedItemIds && resolved.linkedItemIds.length > 1) {
    return resolved.linkedItemIds.length;
  }

  const definedMaxCount = resolved.startUndimmed
    ? resolved.icons.length - 1
    : resolved.icons.length;

  return definedMaxCount > 1 ? definedMaxCount : null;
}

/**
 * Check whether an item has count-based Item Grid icon variants.
 */
export function hasGridIconVariants(
  itemId: string,
  context: GridIconVariantContext = {},
): boolean {
  const resolved = getResolvedGridIconVariants(itemId, context);
  return !!resolved && resolved.icons.length > 1;
}

/**
 * Check if an item has a custom icon
 */
export function hasItemIcon(itemId: string): boolean {
  return itemId in ITEM_ICONS;
}
