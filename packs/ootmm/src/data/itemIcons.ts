/**
 * Icon mapping for OoTMM items
 * Maps item IDs to their corresponding image paths in images/
 * Based on EmoTracker pack structure
 */

import { withBasePath } from '../utils/assetPath'

const RAW_ITEM_ICONS: Record<string, string> = {
  // === OOT ITEMS ===

  // Equipment
  'OOT_STICK': 'images/deku_stick.png',
  'OOT_NUT': 'images/nut.png',
  'OOT_NUT_UPGRADE': 'images/nut.png',
  'OOT_BOMB_BAG': 'images/bomb.png',
  'OOT_BOW': 'images/bow.png',
  'OOT_SLINGSHOT': 'images/slingshot.png',
  'OOT_BOOMERANG': 'images/boomerang.png',
  'OOT_HOOKSHOT': 'images/hookshot.png',
  'OOT_LONGSHOT': 'images/longshot.png',
  'OOT_LENS': 'images/lens.png',
  'OOT_HAMMER': 'images/hammer.png',
  'OOT_OCARINA': 'images/fairyocarina.png',
  'OOT_MAGIC_BEAN': 'images/bean.png',

  // Arrows
  'OOT_ARROW_FIRE': 'images/arrow_fire.png',
  'OOT_ARROW_ICE': 'images/arrow_ice.png',
  'OOT_ARROW_LIGHT': 'images/arrow_light.png',

  // Spells
  'OOT_SPELL_FIRE': 'images/din.png',
  'OOT_SPELL_WIND': 'images/farore.png',
  'OOT_SPELL_LOVE': 'images/nayru.png',

  // Swords
  'OOT_SWORD_KOKIRI': 'images/sword1.png',
  'OOT_SWORD_MASTER': 'images/sword2.png',
  'OOT_SWORD_GORON': 'images/sword3.png',
  'OOT_SWORD': 'images/sword1.png',
  'OOT_SWORD_BIGGORON': 'images/sword3.png',
  'OOT_SPIN_UPGRADE': 'images/items/mm_spin.png',

  // Shields
  'OOT_SHIELD_DEKU': 'images/shield1.png',
  'OOT_SHIELD_HYLIAN': 'images/shield2.png',
  'OOT_SHIELD_MIRROR': 'images/shield3.png',
  'OOT_SHIELD': 'images/shield1.png',

  // Boots
  'OOT_BOOTS_IRON': 'images/boots_iron.png',
  'OOT_BOOTS_HOVER': 'images/boots_hover.png',

  // Tunics
  'OOT_TUNIC_GORON': 'images/redtunic.png',
  'OOT_TUNIC_ZORA': 'images/bluetunic.png',

  // Songs
  'OOT_SONG_ZELDA': 'images/song_zelda.png',
  'OOT_SONG_EPONA': 'images/song_epona.png',
  'OOT_SONG_SARIA': 'images/song_saria.png',
  'OOT_SONG_SUN': 'images/song_sun.png',
  'OOT_SONG_TIME': 'images/song_time.png',
  'OOT_SONG_STORMS': 'images/song_storms.png',
  'OOT_SONG_TP_FOREST': 'images/song_minuet.png',
  'OOT_SONG_TP_FIRE': 'images/song_bolero.png',
  'OOT_SONG_TP_WATER': 'images/song_serenade.png',
  'OOT_SONG_TP_SPIRIT': 'images/song_requiem.png',
  'OOT_SONG_TP_SHADOW': 'images/song_nocturne.png',
  'OOT_SONG_TP_LIGHT': 'images/song_prelude.png',
  'OOT_SONG_EMPTINESS': 'images/items/mm_elegy.png',
  'OOT_SONG_NOTE_ZELDA': 'images/song_zelda.png',
  'OOT_SONG_NOTE_EPONA': 'images/song_epona.png',
  'OOT_SONG_NOTE_SARIA': 'images/song_saria.png',
  'OOT_SONG_NOTE_SUN': 'images/song_sun.png',
  'OOT_SONG_NOTE_TIME': 'images/song_time.png',
  'OOT_SONG_NOTE_STORMS': 'images/song_storms.png',
  'OOT_SONG_NOTE_TP_FOREST': 'images/song_minuet.png',
  'OOT_SONG_NOTE_TP_FIRE': 'images/song_bolero.png',
  'OOT_SONG_NOTE_TP_WATER': 'images/song_serenade.png',
  'OOT_SONG_NOTE_TP_SPIRIT': 'images/song_requiem.png',
  'OOT_SONG_NOTE_TP_SHADOW': 'images/song_nocturne.png',
  'OOT_SONG_NOTE_TP_LIGHT': 'images/song_prelude.png',
  'OOT_SONG_NOTE_EMPTINESS': 'images/items/mm_elegy.png',

  // Bottles
  'OOT_BOTTLE_RUTO_LETTER': 'images/bottle_letter.png',
  'OOT_BOTTLE_EMPTY': 'images/bottle.png',
  'bottle1': 'images/bottle.png',
  'bottle2': 'images/bottle.png',
  'bottle3': 'images/bottle.png',

  // Upgrades
  'OOT_SCALE': 'images/scale1.png',
  'OOT_SCALE_SILVER': 'images/scale1.png',
  'OOT_SCALE_GOLD': 'images/scale2.png',
  'OOT_MAGIC_UPGRADE': 'images/magic1.png',
  'OOT_STRENGTH': 'images/lift1.png',
  'OOT_STRENGTH2': 'images/lift2.png',
  'OOT_STRENGTH3': 'images/lift3.png',
  'OOT_WALLET': 'images/wallet.png',
  'OOT_WALLET1': 'images/wallet1.png',
  'OOT_WALLET2': 'images/wallet2.png',

  // Quest items
  'OOT_SKELETON_KEY': 'images/key_skeleton.png',
  'OOT_RUPEE_MAGICAL': 'images/rupee_magical.png',
  'OOT_GS_TOKEN': 'images/skulltula_token.png',
  'OOT_STONE_OF_AGONY': 'images/agony.png',
  'OOT_GERUDO_CARD': 'images/gerudocard.png',

  // Coins
  'OOT_COIN_RED': 'images/coin_red.png',
  'OOT_COIN_GREEN': 'images/coin_green.png',
  'OOT_COIN_BLUE': 'images/coin_blue.png',
  'OOT_COIN_YELLOW': 'images/coin_yellow.png',

  // Rupees
  'OOT_RUPEE_SILVER_DC': 'images/rupee.png',
  'OOT_RUPEE_SILVER_BOTW': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SPIRIT_CHILD': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SPIRIT_SUN': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SPIRIT_BOULDERS': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SPIRIT_LOBBY': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SPIRIT_ADULT': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SHADOW_SCYTHE': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SHADOW_PIT': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SHADOW_SPIKES': 'images/rupee.png',
  'OOT_RUPEE_SILVER_SHADOW_BLADES': 'images/rupee.png',
  'OOT_RUPEE_SILVER_IC_SCYTHE': 'images/rupee.png',
  'OOT_RUPEE_SILVER_IC_BLOCK': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GTG_SLOPES': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GTG_LAVA': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GTG_WATER': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_SPIRIT': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_LIGHT': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_FIRE': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_FOREST': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_SHADOW': 'images/rupee.png',
  'OOT_RUPEE_SILVER_GANON_WATER': 'images/rupee.png',
  'OOT_POUCH_SILVER_DC': 'images/rupee.png',
  'OOT_POUCH_SILVER_BOTW': 'images/rupee.png',
  'OOT_POUCH_SILVER_SPIRIT_CHILD': 'images/rupee.png',
  'OOT_POUCH_SILVER_SPIRIT_SUN': 'images/rupee.png',
  'OOT_POUCH_SILVER_SPIRIT_BOULDERS': 'images/rupee.png',
  'OOT_POUCH_SILVER_SPIRIT_LOBBY': 'images/rupee.png',
  'OOT_POUCH_SILVER_SPIRIT_ADULT': 'images/rupee.png',
  'OOT_POUCH_SILVER_SHADOW_SCYTHE': 'images/rupee.png',
  'OOT_POUCH_SILVER_SHADOW_PIT': 'images/rupee.png',
  'OOT_POUCH_SILVER_SHADOW_SPIKES': 'images/rupee.png',
  'OOT_POUCH_SILVER_SHADOW_BLADES': 'images/rupee.png',
  'OOT_POUCH_SILVER_IC_SCYTHE': 'images/rupee.png',
  'OOT_POUCH_SILVER_IC_BLOCK': 'images/rupee.png',
  'OOT_POUCH_SILVER_GTG_SLOPES': 'images/rupee.png',
  'OOT_POUCH_SILVER_GTG_LAVA': 'images/rupee.png',
  'OOT_POUCH_SILVER_GTG_WATER': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_SPIRIT': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_LIGHT': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_FIRE': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_FOREST': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_SHADOW': 'images/rupee.png',
  'OOT_POUCH_SILVER_GANON_WATER': 'images/rupee.png',

  // Fish
  'OOT_FISHING_POND_CHILD_FISH_8LBS': 'images/Fish.png',
  'OOT_FISHING_POND_ADULT_FISH_8LBS': 'images/Fish.png',
  'OOT_FISHING_POND_CHILD_LOACH_16LBS': 'images/Fish.png',
  'OOT_FISHING_POND_ADULT_LOACH_30LBS': 'images/Fish.png',

  // Buttons
  'OOT_BUTTON_A': 'images/button_a.png',
  'OOT_BUTTON_C_DOWN': 'images/button_down.png',
  'OOT_BUTTON_C_LEFT': 'images/button_left.png',
  'OOT_BUTTON_C_RIGHT': 'images/button_right.png',
  'OOT_BUTTON_C_UP': 'images/button_up.png',

  // Masks
  'OOT_MASK_KEATON': 'images/keaton.png',
  'OOT_MASK_SKULL': 'images/skull.png',
  'OOT_MASK_SPOOKY': 'images/spooky.png',
  'OOT_MASK_BUNNY': 'images/bunny.png',
  'OOT_MASK_TRUTH': 'images/truth.png',
  'OOT_MASK_GORON': 'images/items/mm_goron.png',
  'OOT_MASK_ZORA': 'images/items/mm_zora.png',
  'OOT_MASK_GERUDO': 'images/gerudo.png',
  'OOT_MASK_BLAST': 'images/items/mm_blast.png',
  'OOT_MASK_STONE': 'images/items/mm_stone.png',

  // Trade sequence
  'OOT_CHICKEN': 'images/cucco.png',
  'OOT_WEIRD_EGG': 'images/egg.png',
  'OOT_ZELDA_LETTER': 'images/letter.png',
  'OOT_POCKET_EGG': 'images/egg.png',
  'OOT_POCKET_CUCCO': 'images/cucco.png',
  'OOT_COJIRO': 'images/cojiro.png',
  'OOT_ODD_MUSHROOM': 'images/mushroom.png',
  'OOT_ODD_POTION': 'images/medicine.png',
  'OOT_POACHER_SAW': 'images/saw.png',
  'OOT_BROKEN_GORON_SWORD': 'images/broken_sword.png',
  'OOT_PRESCRIPTION': 'images/perscription.png',
  'OOT_EYEBALL_FROG': 'images/frog.png',
  'OOT_EYE_DROPS': 'images/eyedrops.png',
  'OOT_CLAIM_CHECK': 'images/claim.png',

  // Bombchus
  'EVENT_OOT_BOMBCHU': 'images/bombchu.png',
  'OOT_BOMBCHU': 'images/bombchu.png',
  'OOT_BOMBCHU_5': 'images/bombchu.png',
  'OOT_BOMBCHU_10': 'images/bombchu.png',
  'OOT_BOMBCHU_20': 'images/bombchu.png',
  'OOT_BOMBCHU_BAG': 'images/bombchu_bag.png',

  // Dungeon items - keys
  'OOT_SMALL_KEY_FOREST': 'images/small_key.png',
  'OOT_SMALL_KEY_FIRE': 'images/small_key.png',
  'OOT_SMALL_KEY_WATER': 'images/small_key.png',
  'OOT_SMALL_KEY_SPIRIT': 'images/small_key.png',
  'OOT_SMALL_KEY_SHADOW': 'images/small_key.png',
  'OOT_SMALL_KEY_GANON': 'images/small_key.png',
  'OOT_SMALL_KEY_GTG': 'images/small_key.png',
  'OOT_SMALL_KEY_BOTW': 'images/small_key.png',
  'OOT_SMALL_KEY_GF': 'images/small_key.png',
  'OOT_SMALL_KEY_TCG': 'images/small_key.png',
  'OOT_KEY_RING_FOREST': 'images/small_key.png',
  'OOT_KEY_RING_FIRE': 'images/small_key.png',
  'OOT_KEY_RING_WATER': 'images/small_key.png',
  'OOT_KEY_RING_SPIRIT': 'images/small_key.png',
  'OOT_KEY_RING_SHADOW': 'images/small_key.png',
  'OOT_KEY_RING_GANON': 'images/small_key.png',
  'OOT_KEY_RING_GTG': 'images/small_key.png',
  'OOT_KEY_RING_BOTW': 'images/small_key.png',
  'OOT_KEY_RING_GF': 'images/small_key.png',
  'OOT_KEY_RING_TCG': 'images/small_key.png',

  // Dungeon items - boss keys
  'OOT_BOSS_KEY_FOREST': 'images/boss_key.png',
  'OOT_BOSS_KEY_FIRE': 'images/boss_key.png',
  'OOT_BOSS_KEY_WATER': 'images/boss_key.png',
  'OOT_BOSS_KEY_SPIRIT': 'images/boss_key.png',
  'OOT_BOSS_KEY_SHADOW': 'images/boss_key.png',
  'OOT_BOSS_KEY_GANON': 'images/boss_key.png',

  // Dungeon rewards
  'OOT_STONE_EMERALD': 'images/stones.png',
  'OOT_STONE_RUBY': 'images/stones.png',
  'OOT_STONE_SAPPHIRE': 'images/stones.png',
  'OOT_MEDALLION_FOREST': 'images/forestmedallion.png',
  'OOT_MEDALLION_FIRE': 'images/firemedallion.png',
  'OOT_MEDALLION_WATER': 'images/watermedallion.png',
  'OOT_MEDALLION_SPIRIT': 'images/spiritmedallion.png',
  'OOT_MEDALLION_SHADOW': 'images/shadowmedallion.png',
  'OOT_MEDALLION_LIGHT': 'images/lightmedallion.png',

  // === MM ITEMS ===

  // Equipment
  'MM_OCARINA': 'images/items/mm_ocarina.png',
  'MM_BOW': 'images/items/mm_bow.png',
  'MM_BOMB_BAG': 'images/items/mm_bomb.png',
  'MM_BOMBCHU': 'images/items/mm_bombchu.png',
  'MM_BOMBCHU_BAG': 'images/bombchu_bag.png',
  'MM_STICK': 'images/deku_stick.png',
  'MM_NUTS_10': 'images/items/mm_nut.png',
  'MM_NUT_UPGRADE': 'images/items/mm_nut.png',
  'MM_MAGIC_BEAN': 'images/items/mm_bean.png',
  'MM_POWDER_KEG': 'images/items/mm_keg.png',
  'MM_PICTOGRAPH_BOX': 'images/items/mm_box.png',
  'MM_LENS': 'images/items/mm_lens.png',
  'MM_HOOKSHOT': 'images/items/mm_hookshot.png',
  'MM_GREAT_FAIRY_SWORD': 'images/items/mm_fairysword.png',
  'MM_HAMMER': 'images/hammer.png',

  // Arrows
  'MM_ARROW_FIRE': 'images/arrow_fire.png',
  'MM_ARROW_ICE': 'images/arrow_ice.png',
  'MM_ARROW_LIGHT': 'images/arrow_light.png',

  // Spells
  'MM_SPELL_FIRE': 'images/din.png',
  'MM_SPELL_WIND': 'images/farore.png',
  'MM_SPELL_LOVE': 'images/nayru.png',

  // Shields
  'MM_SHIELD_HERO': 'images/items/mm_shield.png',
  'MM_SHIELD_MIRROR': 'images/items/mm_mirror.png',
  'MM_SHIELD_DEKU': 'images/shield1.png',

  // Boots
  'MM_BOOTS_IRON': 'images/boots_iron.png',
  'MM_BOOTS_HOVER': 'images/boots_hover.png',

  // Tunics
  'MM_TUNIC_GORON': 'images/redtunic.png',
  'MM_TUNIC_ZORA': 'images/bluetunic.png',

  // Songs
  'MM_SONG_TIME': 'images/items/mm_songoftime.png',
  'MM_SONG_HEALING': 'images/items/mm_healing.png',
  'MM_SONG_EPONA': 'images/items/mm_epona.png',
  'MM_SONG_SOARING': 'images/items/mm_soaring.png',
  'MM_SONG_STORMS': 'images/items/mm_songofstorms.png',
  'MM_SONG_SUN': 'images/song_sun.png',
  'MM_SONG_AWAKENING': 'images/items/mm_sonata.png',
  'MM_SONG_GORON': 'images/items/mm_lullaby.png',
  'MM_SONG_GORON_HALF': 'images/items/mm_half_lullaby.png',
  'MM_SONG_ZORA': 'images/items/mm_bossanova.png',
  'MM_SONG_EMPTINESS': 'images/items/mm_elegy.png',
  'MM_SONG_ORDER': 'images/items/mm_oath.png',
  'MM_SONG_NOTE_AWAKENING': 'images/items/mm_sonata.png',
  'MM_SONG_NOTE_EMPTINESS': 'images/items/mm_elegy.png',
  'MM_SONG_NOTE_EPONA': 'images/items/mm_epona.png',
  'MM_SONG_NOTE_GORON': 'images/items/mm_lullaby.png',
  'MM_SONG_NOTE_HEALING': 'images/items/mm_healing.png',
  'MM_SONG_NOTE_ORDER': 'images/items/mm_oath.png',
  'MM_SONG_NOTE_SOARING': 'images/items/mm_soaring.png',
  'MM_SONG_NOTE_STORMS': 'images/items/mm_songofstorms.png',
  'MM_SONG_NOTE_SUN': 'images/song_sun.png',
  'MM_SONG_NOTE_TIME': 'images/items/mm_songoftime.png',
  'MM_SONG_NOTE_ZORA': 'images/items/mm_bossanova.png',

  // Swords
  'MM_SWORD': 'images/items/mm_kokiri.png',
  'MM_SPIN_UPGRADE': 'images/items/mm_spin.png',

  // Upgrades
  'MM_WALLET': 'images/items/mm_wallet.png',
  'MM_MAGIC_UPGRADE': 'images/items/mm_magic1.png',
  'MM_STRENGTH': 'images/lift1.png',
  'MM_SCALE': 'images/scale1.png',

  // Rupees
  'MM_RUPEE_SILVER': 'images/rupee.png',

  // Quest items
  'MM_STRAY_FAIRY_TOWN': 'images/items/mm_clocktown_stray_fairy.png',
  'MM_STRAY_FAIRY_WF': 'images/items/mm_woodfall_stray_fairy.png',
  'MM_STRAY_FAIRY_SH': 'images/items/mm_snowhead_stray_fairy.png',
  'MM_STRAY_FAIRY_GB': 'images/items/mm_greatbay_stray_fairy.png',
  'MM_STRAY_FAIRY_ST': 'images/items/mm_stonetower_stray_fairy.png',
  'MM_MOON_TEAR': 'images/items/mm_tear.png',
  'MM_ROOM_KEY': 'images/items/mm_roomkey.png',
  'MM_LETTER_TO_KAFEI': 'images/items/mm_letter.png',
  'MM_LETTER_TO_MAMA': 'images/items/mm_delivery.png',
  'MM_PENDANT_OF_MEMORIES': 'images/items/mm_pendant.png',
  'MM_GS_TOKEN_SWAMP': 'images/items/mm_skulltulla_woodfall.png',
  'MM_GS_TOKEN_OCEAN': 'images/items/mm_skulltulla_greatbay.png',
  'MM_SKELETON_KEY': 'images/key_skeleton.png',
  'MM_STONE_OF_AGONY': 'images/agony.png',
  "MM_TRANSCENDENT_FAIRY": 'images/items/mm_clocktown_stray_fairy.png',

  // Buttons
  'MM_BUTTON_A': 'images/button_a.png',
  'MM_BUTTON_C_DOWN': 'images/button_down.png',
  'MM_BUTTON_C_LEFT': 'images/button_left.png',
  'MM_BUTTON_C_RIGHT': 'images/button_right.png',
  'MM_BUTTON_C_UP': 'images/button_up.png',

  // Deeds
  'MM_DEED_LAND': 'images/items/mm_deed1.png',
  'MM_DEED_SWAMP': 'images/items/mm_deed2.png',
  'MM_DEED_MOUNTAIN': 'images/items/mm_deed3.png',
  'MM_DEED_OCEAN': 'images/items/mm_deed4.png',

  // Bottles
  'MM_BOTTLE_EMPTY': 'images/items/mm_bottle.png',
  'MM_BOTTLED_GOLD_DUST': 'images/items/mm_dust.png',
  'mm_bottle1': 'images/items/mm_bottle.png',
  'mm_bottle2': 'images/items/mm_bottle.png',
  'mm_bottle3': 'images/items/mm_bottle.png',
  'mm_bottle4': 'images/items/mm_bottle.png',
  'mm_bottle5': 'images/items/mm_bottle.png',

  // Transformation masks
  'MM_MASK_DEKU': 'images/items/mm_deku.png',
  'MM_MASK_GORON': 'images/items/mm_goron.png',
  'MM_MASK_ZORA': 'images/items/mm_zora.png',
  'MM_MASK_FIERCE_DEITY': 'images/items/mm_fiercedeity.png',
  'MM_MASK_GIANT': 'images/items/mm_giant.png',

  // Regular masks
  'MM_MASK_POSTMAN': 'images/items/mm_postman.png',
  'MM_MASK_ALL_NIGHT': 'images/items/mm_allnight.png',
  'MM_MASK_BLAST': 'images/items/mm_blast.png',
  'MM_MASK_STONE': 'images/items/mm_stone.png',
  'MM_MASK_GREAT_FAIRY': 'images/items/mm_greatfairy.png',
  'MM_MASK_KEATON': 'images/items/mm_keaton.png',
  'MM_MASK_BREMEN': 'images/items/mm_bremen.png',
  'MM_MASK_BUNNY': 'images/items/mm_bunny.png',
  'MM_MASK_DON_GERO': 'images/items/mm_dongero.png',
  'MM_MASK_SCENTS': 'images/items/mm_scents.png',
  'MM_MASK_ROMANI': 'images/items/mm_romanimask.png',
  'MM_MASK_TROUPE_LEADER': 'images/items/mm_troupe.png',
  'MM_MASK_KAFEI': 'images/items/mm_kafeimask.png',
  'MM_MASK_COUPLE': 'images/items/mm_couple.png',
  'MM_MASK_TRUTH': 'images/items/mm_maskoftruth.png',
  'MM_MASK_KAMARO': 'images/items/mm_kamaro.png',
  'MM_MASK_GIBDO': 'images/items/mm_gibdo.png',
  'MM_MASK_GARO': 'images/items/mm_garo.png',
  'MM_MASK_CAPTAIN': 'images/items/mm_captain.png',

  // Boss remains
  'MM_REMAINS_ODOLWA': 'images/items/mm_odolwa.png',
  'MM_REMAINS_GOHT': 'images/items/mm_goht.png',
  'MM_REMAINS_GYORG': 'images/items/mm_gyorg.png',
  'MM_REMAINS_TWINMOLD': 'images/items/mm_twinmold.png',

  // Dungeon items
  'MM_SMALL_KEY_WF': 'images/small_key.png',
  'MM_SMALL_KEY_SH': 'images/small_key.png',
  'MM_SMALL_KEY_GB': 'images/small_key.png',
  'MM_SMALL_KEY_ST': 'images/small_key.png',
  'MM_BOSS_KEY_WF': 'images/boss_key.png',
  'MM_BOSS_KEY_SH': 'images/boss_key.png',
  'MM_BOSS_KEY_GB': 'images/boss_key.png',
  'MM_BOSS_KEY_ST': 'images/boss_key.png',

  // Owl statues
  'MM_OWL_CLOCK_TOWN': 'images/activated_owl_statue.png',
  'MM_OWL_SOUTHERN_SWAMP': 'images/activated_owl_statue.png',
  'MM_OWL_WOODFALL': 'images/activated_owl_statue.png',
  'MM_OWL_MILK_ROAD': 'images/activated_owl_statue.png',
  'MM_OWL_MOUNTAIN_VILLAGE': 'images/activated_owl_statue.png',
  'MM_OWL_SNOWHEAD': 'images/activated_owl_statue.png',
  'MM_OWL_GREAT_BAY': 'images/activated_owl_statue.png',
  'MM_OWL_ZORA_CAPE': 'images/activated_owl_statue.png',
  'MM_OWL_IKANA_CANYON': 'images/activated_owl_statue.png',
  'MM_OWL_STONE_TOWER': 'images/activated_owl_statue.png',

  // Clock items
  'MM_CLOCK1': 'images/clock_1.png',
  'MM_CLOCK2': 'images/clock_2.png',
  'MM_CLOCK3': 'images/clock_3.png',
  'MM_CLOCK4': 'images/clock_4.png',
  'MM_CLOCK5': 'images/clock_5.png',
  'MM_CLOCK6': 'images/clock_6.png',
  'MM_CLOCK': 'images/clock_1.png',

  // === SPECIAL GRID ITEMS ===
  // These are custom items used in item_grids.json that aren't actual game items

  'triforce': 'images/triforce_piece.png',
  'gossip_stone': 'images/gossip_stone.png',
  'mm_spinattack': 'images/items/mm_spin.png',

  // Dungeon indicators
  'forest': 'images/forestmedallion.png',
  'fire': 'images/firemedallion.png',
  'water': 'images/watermedallion.png',
  'spirit': 'images/spiritmedallion.png',
  'shadow': 'images/shadowmedallion.png',
  'light': 'images/lightmedallion.png',
  'free': 'images/lightmedallion.png',
  'deku': 'images/emerald.png',
  'dodongo': 'images/ruby.png',
  'jabu': 'images/sapphire.png',

  'mm_woodfall': 'images/items/mm_odolwa.png',
  'mm_snowhead': 'images/items/mm_goht.png',
  'mm_great_bay': 'images/items/mm_gyorg.png',
  'mm_stone_tower': 'images/items/mm_twinmold.png',

  // Labels
  'free_label': 'images/label_free.png',
  'th_label': 'images/label_th.png',
  'mm_woodfall_label': 'images/label_forest.png',
  'mm_snowhead_label': 'images/label_fire.png',
  'mm_greatbay_label': 'images/label_water.png',
  'mm_stonetower_label': 'images/label_spirit.png',

  // MQ settings
  'oot_foresttemple_label': 'images/label_forest.png',
  'oot_firetemple_label': 'images/label_fire.png',
  'oot_watertemple_label': 'images/label_water.png',
  'oot_spirittemple_label': 'images/label_spirit.png',
  'oot_shadowtemple_label': 'images/label_shadow.png',
  'oot_ganoncastle_label': 'images/label_gc.png',
  'oot_gerudotraining_label': 'images/label_gtg.png',
  'oot_gerudofortress_label': 'images/label_th.png',
  'setting_mq_DekuTree': 'images/label_deku.png',
  'setting_mq_DodongoCavern': 'images/label_dodongo.png',
  'setting_mq_Jabu-Jabu': 'images/label_jabu.png',
  'oot_ice_label': 'images/label_ice.png',
  'oot_well_label': 'images/label_botw.png',
  'oot_chestgame_label': 'images/lens.png',

  // === SHARED ITEMS ===
  'SHARED_BOW': 'images/bow.png',
  'SHARED_BOMB_BAG': 'images/bomb.png',
  'SHARED_MAGIC_UPGRADE': 'images/magic1.png',
  'SHARED_ARROW_FIRE': 'images/arrow_fire.png',
  'SHARED_ARROW_ICE': 'images/arrow_ice.png',
  'SHARED_ARROW_LIGHT': 'images/arrow_light.png',
  'SHARED_HOOKSHOT': 'images/hookshot.png',
  'SHARED_LENS': 'images/lens.png',
  'SHARED_OCARINA': 'images/fairyocarina.png',
  'SHARED_SWORD': 'images/sword1.png',
  'SHARED_SHIELD': 'images/shield1.png',
  'SHARED_MASK_GORON': 'images/items/mm_goron.png',
  'SHARED_MASK_ZORA': 'images/items/mm_zora.png',
  'SHARED_MASK_BUNNY': 'images/bunny.png',
  'SHARED_MASK_KEATON': 'images/keaton.png',
  'SHARED_MASK_TRUTH': 'images/truth.png',
  'SHARED_MASK_BLAST': 'images/items/mm_blast.png',
  'SHARED_MASK_STONE': 'images/items/mm_stone.png',
  'SHARED_WALLET': 'images/wallet.png',
  'SHARED_RUPEE_SILVER': 'images/rupee.png',
  'SHARED_HEART_CONTAINER': 'images/system/heartcontainer.png',
  'SHARED_HEART_PIECE': 'images/system/heartpiece.png',
  'SHARED_STRENGTH': 'images/lift1.png',
  'SHARED_SCALE': 'images/scale1.png',
  'SHARED_SPIN_UPGRADE': 'images/items/mm_spin.png',
  'SHARED_STONE_OF_AGONY': 'images/agony.png',
  'SHARED_NUT_UPGRADE': 'images/nut.png',
  'SHARED_STICK_UPGRADE': 'images/deku_stick.png',
  'SHARED_SPELL_FIRE': 'images/din.png',
  'SHARED_SPELL_WIND': 'images/farore.png',
  'SHARED_SPELL_LOVE': 'images/nayru.png',
  'SHARED_SONG_EPONA': 'images/song_epona.png',
  'SHARED_SONG_STORMS': 'images/song_storms.png',
  'SHARED_SONG_TIME': 'images/song_time.png',
  'SHARED_SONG_SUN': 'images/song_sun.png',
  'SHARED_SONG_EMPTINESS': 'images/items/mm_elegy.png',
  'SHARED_SONG_NOTE_EPONA': 'images/song_epona.png',
  'SHARED_SONG_NOTE_STORMS': 'images/song_storms.png',
  'SHARED_SONG_NOTE_TIME': 'images/song_time.png',
  'SHARED_SONG_NOTE_SUN': 'images/song_sun.png',
  'SHARED_SONG_NOTE_EMPTINESS': 'images/items/mm_elegy.png',
  'SHARED_BOMBCHU': 'images/bombchu.png',
  'SHARED_BOMBCHU_BAG': 'images/bombchu_bag.png',
  'SHARED_HAMMER': 'images/hammer.png',
  'SHARED_BOOTS_IRON': 'images/boots_iron.png',
  'SHARED_BOOTS_HOVER': 'images/boots_hover.png',
  'SHARED_TUNIC_GORON': 'images/redtunic.png',
  'SHARED_TUNIC_ZORA': 'images/bluetunic.png',
  'SHARED_SKELETON_KEY': 'images/key_skeleton.png',
  'SHARED_BUTTON_A': 'images/button_a.png',
  'SHARED_BUTTON_C_DOWN': 'images/button_down.png',
  'SHARED_BUTTON_C_LEFT': 'images/button_left.png',
  'SHARED_BUTTON_C_RIGHT': 'images/button_right.png',
  'SHARED_BUTTON_C_UP': 'images/button_up.png',
  'SHARED_BOTTLE_EMPTY': 'images/bottle.png',
  'SHARED_BOTTLE_POTION_RED': 'images/bottle_red.png',
  'SHARED_BOTTLED_GOLD_DUST': 'images/items/mm_dust.png',
  'SHARED_BOTTLE_CHATEAU': 'images/items/mm_chateau.png',
  'SHARED_BOTTLE_MILK': 'images/bottle_milk.png',
  'SHARED_BOTTLE_RUTO_LETTER': 'images/bottle_letter.png',
  'SHARED_TRIFORCE': 'images/triforce_piece.png',
  'SHARED_TRIFORCE_POWER': 'images/triforce_piece.png',
  'SHARED_TRIFORCE_WISDOM': 'images/triforce_piece.png',
  'SHARED_TRIFORCE_COURAGE': 'images/triforce_piece.png',
  'SHARED_SHIELD_DEKU': 'images/shield1.png',
  'SHARED_SHIELD_HYLIAN': 'images/shield2.png',
  'SHARED_SHIELD_MIRROR': 'images/shield3.png',
}

export const ITEM_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_ITEM_ICONS).map(([key, value]) => [key, withBasePath(value)]),
)

// Default fallback icon
export const DEFAULT_ICON = withBasePath('images/unknown.png')

/**
 * Get the icon path for an item ID
 */
export function getItemIcon(itemId: string): string {
  return ITEM_ICONS[itemId] || DEFAULT_ICON
}

/**
 * Check if an item has a custom icon
 */
export function hasItemIcon(itemId: string): boolean {
  return itemId in ITEM_ICONS
}
