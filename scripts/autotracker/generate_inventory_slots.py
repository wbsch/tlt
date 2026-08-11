#!/usr/bin/env python3
#this script uses hard coded offsets, is shit and should be rewritten

import argparse
import json
import pathlib
import re
import sys


SLOT_DEFINE_RE = re.compile(r"^#define\s+(ITS_(OOT|MM)_[A-Z0-9_]+)\s+0x([0-9a-fA-F]+)\s*$")
GI_ID_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),")
SOUL_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),\s+type:\s+SOUL,\s+add:\s+\[[A-Z_]+,\s+0x([0-9a-fA-F]+)\]")
COIN_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),.*add:\s+\[COIN,\s+([0-9]+)\]")
CLOCK_GI_RE = re.compile(r"^-\s+\{\s+id:\s+(MM_CLOCK[1-6]),.*add:\s+\[MM_CLOCK,\s+([0-9]+)\]")
SONG_NOTE_GI_RE = re.compile(r"^-\s+\{\s+id:\s+([A-Z0-9_]+),.*add:\s+\[SONG_NOTE,\s+(NOTES_SONG_[A-Z0-9_]+)\]")
NOTE_DEFINE_RE = re.compile(r"^#define\s+(NOTES_SONG_[A-Z0-9_]+)\s+0x([0-9a-fA-F]+)\s*$")
NOTES_MAX_RE = re.compile(r"^#define\s+NOTES_MAX\s+0x([0-9a-fA-F]+)\s*$")
MAX_SONG_NOTE_RE = re.compile(r"^\s*(\d+),\s*//\s*(NOTES_SONG_[A-Z0-9_]+)\s*$")

SHARED_COIN_COUNT = 4

# ── Struct layout constants (from OoTMM headers) ──────────────────────────

XFLAGS_COUNT_OOT = 0x2FA  # from xflags_data.h (v32.0)
XFLAGS_COUNT_MM  = 0x350  # from xflags_data.h (v32.0)
RESPAWN_SIZE     = 0x20   # RespawnData (mm/save.h)
TRAP_MAX         = 7
NOTES_MAX        = 0x26
RUSTY_KEYS_OOT_SIZE = 4
RUSTY_KEYS_MM_SIZE  = 5

def build_shared_storage(mm_custom_save_size: int) -> dict:
    """Build shared storage layout and fixed offsets from MmCustomSave size."""
    oot_size = 0x380  # sizeof(OotCustomSave) = xflagsMm offset (v32.0)
    mm_size = mm_custom_save_size
    pre_soul = 0x20 + 8 + 2 + 2  # netGiSkip[16] + coins[4] + ocarinaMasks[4] = 0x2C

    # Bitmap offsets (all within gSharedCustomSave)
    xflagsOot      = 0x000
    npcOot         = XFLAGS_COUNT_OOT
    shopsOot       = npcOot + 32
    scrubsOot      = shopsOot + 8
    srOot          = scrubsOot + 8
    xflagsMm       = oot_size  # 0x380
    npcMm          = oot_size + XFLAGS_COUNT_MM  # xflagsMm + XFLAGS_COUNT_MM
    shopsMm        = npcMm + 32
    souls_enemy_oot = oot_size + mm_size + pre_soul
    souls_enemy_mm  = souls_enemy_oot + 8
    souls_boss_oot  = souls_enemy_mm + 8
    souls_boss_mm   = souls_boss_oot + 2
    souls_npc_oot   = souls_boss_mm + 1
    souls_npc_mm    = souls_npc_oot + 8
    souls_animal_oot = souls_npc_mm + 8
    souls_animal_mm  = souls_animal_oot + 2
    souls_misc_oot  = souls_animal_mm + 2
    souls_misc_mm   = souls_misc_oot + 1

    # Fixed (non-bitmap) fields
    half_days       = shopsMm + 4
    coins           = oot_size + mm_size + 0x20  # after netGiSkip[16]
    mask_oot        = coins + 8
    mask_mm         = mask_oot + 2
    child_fish      = souls_misc_mm + 1
    adult_fish      = child_fish + 20
    fish_flags      = adult_fish + 20

    # After fish_flags[5]: align to 4 (RespawnData has Vec3f), then respawn[0x20]
    respawn = (fish_flags + 5 + 3) & ~3
    bitfields = respawn + RESPAWN_SIZE
    # progressiveFlags is the second byte of the bitfield block
    progressive_flags = bitfields + 1
    traps = bitfields + 2
    notes = traps + TRAP_MAX
    rusty_keys = notes + NOTES_MAX

    # Song flag offsets within each custom save (byte holding the song bitfields)
    # fwRespawnDungeonEntrance has u32 members => 4-byte alignment on N64.
    # Account for alignment padding before the array.
    fw_respawn_offset = XFLAGS_COUNT_OOT + 32 + 8 + 8 + 16
    if fw_respawn_offset % 4:
        fw_respawn_offset += 4 - (fw_respawn_offset % 4)
    song_flags_oot = fw_respawn_offset + 2 * 28 + 2
    song_flags_mm = ((half_days + 1 + 3) & ~3) + 3 * 64

    tracked_size = max(
        progressive_flags + 1,       # cover all bitmaps
        notes + NOTES_MAX,
        rusty_keys + RUSTY_KEYS_OOT_SIZE + RUSTY_KEYS_MM_SIZE,
    )

    bitmaps = [
        {"name": "xflagsOot",         "offset": xflagsOot,       "size": XFLAGS_COUNT_OOT},
        {"name": "npcOot",            "offset": npcOot,          "size": 32},
        {"name": "shopsOot",          "offset": shopsOot,        "size": 8},
        {"name": "scrubsOot",         "offset": scrubsOot,       "size": 8},
        {"name": "srOot",             "offset": srOot,           "size": 16},
        {"name": "xflagsMm",          "offset": xflagsMm,        "size": XFLAGS_COUNT_MM},
        {"name": "npcMm",             "offset": npcMm,           "size": 32},
        {"name": "shopsMm",           "offset": shopsMm,         "size": 4},
        {"name": "soulsEnemyOot",     "offset": souls_enemy_oot, "size": 8},
        {"name": "soulsEnemyMm",      "offset": souls_enemy_mm,  "size": 8},
        {"name": "soulsBossOot",      "offset": souls_boss_oot,  "size": 2},
        {"name": "soulsBossMm",       "offset": souls_boss_mm,   "size": 1},
        {"name": "soulsNpcOot",       "offset": souls_npc_oot,   "size": 8},
        {"name": "soulsNpcMm",        "offset": souls_npc_mm,    "size": 8},
        {"name": "soulsAnimalOot",    "offset": souls_animal_oot,"size": 2},
        {"name": "soulsAnimalMm",     "offset": souls_animal_mm, "size": 2},
        {"name": "soulsMiscOot",      "offset": souls_misc_oot,  "size": 1},
        {"name": "soulsMiscMm",       "offset": souls_misc_mm,   "size": 1},
        {"name": "caughtFishFlags",   "offset": fish_flags,      "size": 5},
        {"name": "progressiveFlags",  "offset": progressive_flags,"size": 1},
    ]

    shared = {
        "baseOffset": 0x18000,
        "stride": 0x4000,
        "trackedSize": tracked_size,
        "bitmaps": bitmaps,
    }

    fixed_offsets = {
        "sharedCustomSaveSize": tracked_size,
        "halfDaysOffset": half_days,
        "coinsOffset": coins,
        "ocarinaButtonMaskOotOffset": mask_oot,
        "ocarinaButtonMaskMmOffset": mask_mm,
        "caughtChildFishWeightOffset": child_fish,
        "caughtAdultFishWeightOffset": adult_fish,
        "caughtFishWeightCount": 20,
        "songNotesOffset": notes,
        "songNoteCount": NOTES_MAX,
        "rustyKeysOffset": rusty_keys,
        "rustyKeysOotSize": RUSTY_KEYS_OOT_SIZE,
        "rustyKeysMmSize": RUSTY_KEYS_MM_SIZE,
        "songFlagsOotOffset": song_flags_oot,
        "songFlagsMmOffset": song_flags_mm,
        "bombchuBagFlagsOffset": bitfields,
    }

    return {"shared": shared, "fixedOffsets": fixed_offsets}


OOT_OVERRIDES = {
    "STICKS": "STICK",
    "NUTS": "DEKU_NUTS",
    "ARROW_FIRE": "ARROW_FIRE",
    "SPELL_FIRE": "SPELL_FIRE",
    "BOMBCHU": "BOMBCHUS",
    "ARROW_ICE": "ARROW_ICE",
    "SPELL_WIND": "SPELL_WIND",
    "MAGIC_BEAN": "MAGIC_BEAN",
    "HAMMER": "HAMMER",
    "ARROW_LIGHT": "ARROW_LIGHT",
    "SPELL_LOVE": "SPELL_LOVE",
    "BOTTLE": "BOTTLE_1",
    "BOTTLE2": "BOTTLE_2",
    "BOTTLE3": "BOTTLE_3",
    "BOTTLE4": "BOTTLE_4",
    "TRADE_ADULT": "ADULT_TRADE",
    "TRADE_CHILD": "CHILD_TRADE",
}

MM_OVERRIDES = {
    "ARROW_FIRE": "ARROW_FIRE",
    "ARROW_ICE": "ARROW_ICE",
    "ARROW_LIGHT": "ARROW_LIGHT",
    "TRADE1": "TRADE_1",
    "BOMBCHU": "BOMBCHU",
    "STICKS": "STICK",
    "NUTS": "NUT",
    "BEANS": "MAGIC_BEAN",
    "TRADE2": "TRADE_2",
    "KEG": "POWDER_KEG",
    "PICTOBOX": "PICTOGRAPH_BOX",
    "TRADE3": "TRADE_3",
    "BOTTLE": "BOTTLE_1",
    "BOTTLE2": "BOTTLE_2",
    "BOTTLE3": "BOTTLE_3",
    "BOTTLE4": "BOTTLE_4",
    "BOTTLE5": "BOTTLE_5",
    "BOTTLE6": "BOTTLE_6",
}

EXPECTED_SLOT_COUNTS = {
    "OOT": 24,
    "MM": 48,
}

SLOT_QUANTITY_RULES = {
    "ITS_OOT_OCARINA": {"stages": [0x07, 0x08]},
    "ITS_OOT_HOOKSHOT": {"stages": [0x0A, 0x0B]},
    "ITS_OOT_MAGIC_BEAN": {"useBeansCount": True},
    "ITS_OOT_TRADE_ADULT": {
        "stages": [0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x14],
        "maxWithBottle": True,
    },
    "ITS_OOT_TRADE_CHILD": {
        "stages": [0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x9C, 0x9D, 0x14],
        "maxWithBottle": True,
    },
    "ITS_MM_OCARINA": {"stages": [0x05, 0x00]},
    "ITS_MM_TRADE1": {"stages": [0xB0, 0x28, 0x29, 0x2A, 0x2B, 0x2C]},
    "ITS_MM_TRADE2": {"stages": [0xAE, 0xB1, 0xB3, 0x2D, 0x2E]},
    "ITS_MM_HOOKSHOT": {"stages": [0x11, 0x0F]},
    "ITS_MM_GREAT_FAIRY_SWORD": {"stages": [0x10]},
    "ITS_MM_TRADE3": {"stages": [0xAF, 0xB2, 0xB4, 0x2F, 0x30]},
}



SOUL_SOURCE_SPECS = [
    {"prefix": "OOT_SOUL_ENEMY_", "block": "soulsEnemyOot"},
    {"prefix": "OOT_SOUL_BOSS_", "block": "soulsBossOot"},
    {"prefix": "OOT_SOUL_NPC_", "block": "soulsNpcOot"},
    {"prefix": "OOT_SOUL_ANIMAL_", "block": "soulsAnimalOot"},
    {"prefix": "OOT_SOUL_MISC_", "block": "soulsMiscOot"},
    {"prefix": "MM_SOUL_ENEMY_", "block": "soulsEnemyMm"},
    {"prefix": "MM_SOUL_BOSS_", "block": "soulsBossMm"},
    {"prefix": "MM_SOUL_NPC_", "block": "soulsNpcMm"},
    {"prefix": "MM_SOUL_ANIMAL_", "block": "soulsAnimalMm"},
    {"prefix": "MM_SOUL_MISC_", "block": "soulsMiscMm"},
]

SPECIAL_ITEM_SOURCES = [
    {"itemId": "OOT_KEY_RING_FOREST", "source": {"kind": "oot-derived-key-ring", "record": 3}},
    {"itemId": "OOT_KEY_RING_FIRE", "source": {"kind": "oot-derived-key-ring", "record": 4}},
    {"itemId": "OOT_KEY_RING_WATER", "source": {"kind": "oot-derived-key-ring", "record": 5}},
    {"itemId": "OOT_KEY_RING_SPIRIT", "source": {"kind": "oot-derived-key-ring", "record": 6}},
    {"itemId": "OOT_KEY_RING_SHADOW", "source": {"kind": "oot-derived-key-ring", "record": 7}},
    {"itemId": "OOT_KEY_RING_BOTW", "source": {"kind": "oot-derived-key-ring", "record": 8}},
    {"itemId": "OOT_KEY_RING_GTG", "source": {"kind": "oot-derived-key-ring", "record": 11}},
    {"itemId": "OOT_KEY_RING_GF", "source": {"kind": "oot-derived-key-ring", "record": 12}},
    {"itemId": "OOT_KEY_RING_GANON", "source": {"kind": "oot-derived-key-ring", "record": 13}},
    {"itemId": "OOT_KEY_RING_TCG", "source": {"kind": "oot-derived-key-ring", "record": 16}},
    {"itemId": "OOT_SKELETON_KEY", "source": {"kind": "oot-derived-skeleton-key"}},
    {"itemId": "MM_KEY_RING_WF", "source": {"kind": "mm-derived-key-ring", "record": 0}},
    {"itemId": "MM_KEY_RING_SH", "source": {"kind": "mm-derived-key-ring", "record": 1}},
    {"itemId": "MM_KEY_RING_GB", "source": {"kind": "mm-derived-key-ring", "record": 2}},
    {"itemId": "MM_KEY_RING_ST", "source": {"kind": "mm-derived-key-ring", "record": 3}},
    {"itemId": "OOT_PLATINUM_TOKEN", "source": {"kind": "oot-derived-platinum-token"}},
    {"itemId": "MM_PLATINUM_TOKEN", "source": {"kind": "mm-derived-platinum-token"}},
    {"itemId": "OOT_RUPEE_MAGICAL", "source": {"kind": "oot-derived-magical-rupee"}},
    {"itemId": "MM_SKELETON_KEY", "source": {"kind": "mm-derived-skeleton-key"}},
    {"itemId": "MM_TRANSCENDENT_FAIRY", "source": {"kind": "mm-derived-transcendent-fairy"}},
    {"itemId": "OOT_SCALE_BRONZE", "source": {"kind": "shared-bitmap-bit", "block": "progressiveFlags", "bit": 4}},
    {"itemId": "MM_SCALE_BRONZE", "source": {"kind": "shared-bitmap-bit", "block": "progressiveFlags", "bit": 3}},
    {"itemId": "MM_HAMMER", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 5}},
    {"itemId": "MM_GREAT_FAIRY_SWORD", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 6}},
    {"itemId": "MM_BOOMERANG", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 7}},
    {"itemId": "MM_SLINGSHOT", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 9}},
    {"itemId": "MM_MASK_GERUDO", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 12}},
    {"itemId": "MM_MASK_SKULL", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 13}},
    {"itemId": "MM_MASK_SPOOKY", "source": {"kind": "oot-extra-bit", "record": 4, "bit": 15}},
    {"itemId": "OOT_GREAT_FAIRY_SWORD", "source": {"kind": "oot-extra-bit", "record": 1, "bit": 10}},
    {"itemId": "OOT_POWDER_KEG", "source": {"kind": "oot-extra-byte-nonzero", "record": 20, "byte": 0}},
    {"itemId": "MM_SPELL_FIRE", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 10}},
    {"itemId": "MM_MOON_TEAR", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 11}},
    {"itemId": "MM_DEED_LAND", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 12}},
    {"itemId": "MM_DEED_SWAMP", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 13}},
    {"itemId": "MM_DEED_MOUNTAIN", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 14}},
    {"itemId": "MM_DEED_OCEAN", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 15}},
    {"itemId": "MM_SPELL_WIND", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 5}},
    {"itemId": "MM_BOOTS_IRON", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 6}},
    {"itemId": "MM_TUNIC_GORON", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 7}},
    {"itemId": "MM_ROOM_KEY", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 8}},
    {"itemId": "MM_LETTER_TO_MAMA", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 9}},
    {"itemId": "MM_SPELL_LOVE", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 0}},
    {"itemId": "MM_BOOTS_HOVER", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 1}},
    {"itemId": "MM_TUNIC_ZORA", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 2}},
    {"itemId": "MM_LETTER_TO_KAFEI", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 3}},
    {"itemId": "MM_PENDANT_OF_MEMORIES", "source": {"kind": "oot-extra-bit", "record": 5, "bit": 4}},
    {"itemId": "OOT_WALLET5", "source": {"kind": "oot-extra-bit", "record": 2, "bit": 7}},
    {"itemId": "MM_WALLET5", "source": {"kind": "oot-extra-bit", "record": 13, "bit": 31}},
    {"itemId": "MM_STONE_OF_AGONY", "source": {"kind": "oot-extra-bit", "record": 13, "bit": 1}},
    {"itemId": "OOT_SPIN_UPGRADE", "source": {"kind": "oot-extra-bit", "record": 2, "bit": 26}},
    {"itemId": "MM_SPIN_UPGRADE", "source": {"kind": "mm-week-event-bit", "byte": 23, "bit": 1}},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate autotracker inventory slot mappings from an OoTMM checkout."
    )
    parser.add_argument(
        "--ootmm-repo",
        required=True,
        help="Path to the OoTMM repository root.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to the output inventory_slots.json file.",
    )
    parser.add_argument(
        "--mm-custom-save-size",
        type=lambda x: int(x, 0),
        default=0x440,
        help="sizeof(MmCustomSave) in hex (default: 0x440 for v31.1/v32.0). Use 0x430 for v30.1.",
    )
    parser.add_argument(
        "--shared-save-offsets-output",
        help="Optional path to also write the fixed offsets as shared_save_offsets.json.",
    )
    return parser.parse_args()


def tracker_id_for(slot_name: str, game: str) -> str:
    suffix = slot_name.removeprefix(f"ITS_{game}_")
    overrides = OOT_OVERRIDES if game == "OOT" else MM_OVERRIDES
    suffix = overrides.get(suffix, suffix)
    return f"{game}_{suffix}"


def extract_slots(items_header: pathlib.Path) -> dict[str, list[dict[str, object]]]:
    slots: dict[str, list[dict[str, object]]] = {"OOT": [], "MM": []}

    for line in items_header.read_text(encoding="utf-8").splitlines():
        match = SLOT_DEFINE_RE.match(line)
        if not match:
            continue

        slot_name, game, raw_index = match.groups()
        index = int(raw_index, 16)
        entry = {
            "index": index,
            "slot": slot_name,
            "itemId": tracker_id_for(slot_name, game),
        }
        quantity = SLOT_QUANTITY_RULES.get(slot_name)
        if quantity is not None:
            entry["quantity"] = quantity
        slots[game].append(entry)

    for game, entries in slots.items():
        entries.sort(key=lambda entry: int(entry["index"]))
        expected = EXPECTED_SLOT_COUNTS[game]
        if len(entries) != expected:
            raise ValueError(
                f"expected {expected} {game} slots in {items_header}, found {len(entries)}"
            )

        indices = [int(entry["index"]) for entry in entries]
        if indices != list(range(expected)):
            raise ValueError(f"{game} slot indices are not contiguous: {indices}")

    return {"oot": slots["OOT"], "mm": slots["MM"]}


def extract_gi_ids(gi_defs: pathlib.Path) -> list[str]:
    gi_ids: list[str] = []

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = GI_ID_RE.match(line)
        if match:
            gi_ids.append(match.group(1))

    return gi_ids


def extract_soul_entries(gi_defs: pathlib.Path) -> list[dict[str, int | str]]:
    soul_entries: list[dict[str, int | str]] = []

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = SOUL_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_add = match.groups()
        soul_entries.append(
            {
                "itemId": item_id,
                "bit": int(raw_add, 16) & 0x0FFF,
            }
        )

    return soul_entries


def extract_coin_entries(gi_defs: pathlib.Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_indices: set[int] = set()

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = COIN_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_index = match.groups()
        index = int(raw_index)
        if item_id in seen_ids:
            raise ValueError(f"duplicate coin item {item_id} in {gi_defs}")
        if index < 0 or index >= SHARED_COIN_COUNT:
            raise ValueError(f"coin item {item_id} has out-of-range index {index}")
        if index in seen_indices:
            raise ValueError(f"duplicate coin index {index} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-coin-count",
                    "index": index,
                },
            }
        )
        seen_ids.add(item_id)
        seen_indices.add(index)

    missing_indices = sorted(set(range(SHARED_COIN_COUNT)) - seen_indices)
    if missing_indices:
        raise ValueError(
            f"missing coin GI entries in {gi_defs} for indices: {', '.join(str(index) for index in missing_indices)}"
        )

    entries.sort(key=lambda entry: int(entry["source"]["index"]))
    return entries


def extract_clock_entries(gi_defs: pathlib.Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_bits: set[int] = set()

    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = CLOCK_GI_RE.match(line)
        if not match:
            continue

        item_id, raw_bit = match.groups()
        bit = int(raw_bit)
        if item_id in seen_ids:
            raise ValueError(f"duplicate clock item {item_id} in {gi_defs}")
        if bit < 0 or bit >= 8:
            raise ValueError(f"clock item {item_id} has out-of-range bit {bit}")
        if bit in seen_bits:
            raise ValueError(f"duplicate clock bit {bit} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-half-day-bit",
                    "bit": bit,
                },
            }
        )
        seen_ids.add(item_id)
        seen_bits.add(bit)

    missing_bits = sorted(set(range(6)) - seen_bits)
    if missing_bits:
        raise ValueError(
            f"missing clock GI entries in {gi_defs} for bits: {', '.join(str(bit) for bit in missing_bits)}"
        )

    entries.sort(key=lambda entry: int(entry["source"]["bit"]))
    return entries


def extract_note_indices(notes_header: pathlib.Path) -> dict[str, int]:
    note_indices: dict[str, int] = {}
    note_count: int | None = None

    for line in notes_header.read_text(encoding="utf-8").splitlines():
        match = NOTE_DEFINE_RE.match(line)
        if match:
            symbol, raw_index = match.groups()
            note_indices[symbol] = int(raw_index, 16)
            continue

        match = NOTES_MAX_RE.match(line)
        if match:
            note_count = int(match.group(1), 16)

    if note_count is None:
        raise ValueError(f"missing NOTES_MAX in {notes_header}")
    if len(note_indices) != note_count:
        raise ValueError(
            f"expected {note_count} song note defines in {notes_header}, found {len(note_indices)}"
        )

    indices = sorted(note_indices.values())
    if indices != list(range(note_count)):
        raise ValueError(f"song note indices are not contiguous: {indices}")

    return note_indices


def extract_note_max_counts(item_add_source: pathlib.Path) -> dict[str, int]:
    note_max_counts: dict[str, int] = {}
    in_song_note_array = False

    for line in item_add_source.read_text(encoding="utf-8").splitlines():
        if not in_song_note_array:
            if "const u8 kMaxSongNotes[] = {" in line:
                in_song_note_array = True
            continue

        if line.strip() == "};":
            break

        match = MAX_SONG_NOTE_RE.match(line)
        if not match:
            continue

        raw_count, symbol = match.groups()
        note_max_counts[symbol] = int(raw_count)

    if not note_max_counts:
        raise ValueError(f"missing kMaxSongNotes entries in {item_add_source}")

    return note_max_counts


def extract_song_note_entries(
    gi_defs: pathlib.Path,
    notes_header: pathlib.Path,
    item_add_source: pathlib.Path,
) -> list[dict[str, object]]:
    note_indices = extract_note_indices(notes_header)
    note_max_counts = extract_note_max_counts(item_add_source)

    missing_max_counts = sorted(set(note_indices) - set(note_max_counts))
    if missing_max_counts:
        raise ValueError(
            f"missing song note max counts in {item_add_source}: {', '.join(missing_max_counts)}"
        )

    entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_symbols: set[str] = set()
    for line in gi_defs.read_text(encoding="utf-8").splitlines():
        match = SONG_NOTE_GI_RE.match(line)
        if not match:
            continue

        item_id, note_symbol = match.groups()
        if item_id in seen_ids:
            raise ValueError(f"duplicate song note item {item_id} in {gi_defs}")
        if note_symbol not in note_indices:
            raise ValueError(f"unknown song note symbol {note_symbol} in {gi_defs}")
        if note_symbol in seen_symbols:
            raise ValueError(f"duplicate song note symbol {note_symbol} in {gi_defs}")

        entries.append(
            {
                "itemId": item_id,
                "source": {
                    "kind": "shared-song-note",
                    "index": note_indices[note_symbol],
                    "max": note_max_counts[note_symbol],
                },
            }
        )
        seen_ids.add(item_id)
        seen_symbols.add(note_symbol)

    missing_symbols = sorted(set(note_indices) - seen_symbols)
    if missing_symbols:
        raise ValueError(f"missing song note GI entries in {gi_defs}: {', '.join(missing_symbols)}")

    return entries


def collect_prefixed_ids(gi_ids: list[str], prefix: str) -> list[str]:
    return [item_id for item_id in gi_ids if item_id.startswith(prefix)]


def ensure_ids_exist(gi_ids: list[str], required_ids: list[str], label: str) -> None:
    available = set(gi_ids)
    missing = [item_id for item_id in required_ids if item_id not in available]
    if missing:
        raise ValueError(f"missing {label} IDs in gi.yml: {', '.join(missing)}")


def build_catalog(
    gi_defs: pathlib.Path,
    notes_header: pathlib.Path,
    item_add_source: pathlib.Path,
    doors_header: pathlib.Path,
    shared_storage: dict[str, object],
) -> dict[str, object]:
    gi_ids = extract_gi_ids(gi_defs)
    soul_entries = extract_soul_entries(gi_defs)
    coin_entries = extract_coin_entries(gi_defs)
    clock_entries = extract_clock_entries(gi_defs)
    song_note_entries = extract_song_note_entries(gi_defs, notes_header, item_add_source)
    bitmap_sizes = {bitmap["name"]: bitmap["size"] for bitmap in shared_storage["bitmaps"]}

    items: list[dict[str, object]] = []
    for spec in SOUL_SOURCE_SPECS:
        prefixed_souls = [entry for entry in soul_entries if str(entry["itemId"]).startswith(spec["prefix"])]
        max_bits = bitmap_sizes[spec["block"]] * 8
        used_bits: set[int] = set()
        for entry in prefixed_souls:
            item_id = str(entry["itemId"])
            bit = int(entry["bit"])
            if bit >= max_bits:
                raise ValueError(
                    f"{item_id} references out-of-range bit {bit} for {spec['block']}"
                )
            if bit in used_bits:
                raise ValueError(f"duplicate bit {bit} in {spec['block']}")
            used_bits.add(bit)
            items.append(
                {
                    "itemId": item_id,
                    "source": {
                        "kind": "shared-bitmap-bit",
                        "block": spec["block"],
                        "bit": bit,
                    },
                }
            )

    items.extend(song_note_entries)
    items.extend(coin_entries)
    items.extend(clock_entries)

    ensure_ids_exist(gi_ids, [entry["itemId"] for entry in SPECIAL_ITEM_SOURCES], "special item")
    items.extend(SPECIAL_ITEM_SOURCES)

    rusty_key_entries = generate_rusty_key_sources(doors_header, gi_ids)
    items.extend(rusty_key_entries)

    return {
        "shared": shared_storage,
        "items": items,
    }


DOOR_ENUM_RE = re.compile(r"^\s*DOORID_(OOT|MM)_([A-Z0-9_]+),?\s*$")


def generate_rusty_key_sources(doors_header: pathlib.Path, gi_ids: list[str]) -> list[dict[str, object]]:
    """Generate shared-rusty-key catalog entries for every door defined in doors.h."""

    entries: list[dict[str, object]] = []
    game: str | None = None
    index = 0

    for line in doors_header.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line == "};":
            if line == "};":
                game = None
                index = 0
            continue
        if line.startswith("enum"):
            continue

        match = DOOR_ENUM_RE.match(line)
        if not match:
            continue

        game_abbr, door_name = match.groups()
        if door_name == "MAX":
            continue

        game = "oot" if game_abbr == "OOT" else "mm"
        item_id = f"{game_abbr}_RUSTY_KEY_{door_name}"
        byte = index // 8
        bit = index % 8

        entries.append({
            "itemId": item_id,
            "source": {
                "kind": "shared-rusty-key",
                "game": game,
                "byte": byte,
                "bit": bit,
            },
        })
        index += 1

    if not entries:
        raise ValueError(f"no door entries found in {doors_header}")

    ensure_ids_exist(gi_ids, [entry["itemId"] for entry in entries], "rusty key")
    return entries


def main() -> int:
    args = parse_args()
    repo_root = pathlib.Path(args.ootmm_repo).resolve()
    items_header = repo_root / "packages/generator/include/combo/data/items.h"
    gi_defs = repo_root / "data/defs/gi.yml"
    notes_header = repo_root / "packages/generator/include/combo/notes.h"
    item_add_source = repo_root / "packages/generator/src/common/item/item_add.c"
    output_path = pathlib.Path(args.output).resolve()

    if not items_header.is_file():
        print(f"items header not found: {items_header}", file=sys.stderr)
        return 1
    if not gi_defs.is_file():
        print(f"gi definitions not found: {gi_defs}", file=sys.stderr)
        return 1
    if not notes_header.is_file():
        print(f"notes header not found: {notes_header}", file=sys.stderr)
        return 1
    if not item_add_source.is_file():
        print(f"item add source not found: {item_add_source}", file=sys.stderr)
        return 1

    mapping = extract_slots(items_header)
    doors_header = repo_root / "packages/generator/include/combo/doors.h"
    if not doors_header.is_file():
        print(f"doors header not found: {doors_header}", file=sys.stderr)
        return 1

    layout = build_shared_storage(args.mm_custom_save_size)
    mapping["catalog"] = build_catalog(
        gi_defs, notes_header, item_add_source, doors_header, layout["shared"]
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")

    if args.shared_save_offsets_output:
        offsets_path = pathlib.Path(args.shared_save_offsets_output).resolve()
        offsets_path.parent.mkdir(parents=True, exist_ok=True)
        offsets_path.write_text(
            json.dumps(layout["fixedOffsets"], indent=2) + "\n", encoding="utf-8"
        )
        print(f"Fixed offsets written to {offsets_path}")

    print(
        f"MmCustomSave size: 0x{args.mm_custom_save_size:03X}  "
        f"trackedSize: 0x{layout['shared']['trackedSize']:04X}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
