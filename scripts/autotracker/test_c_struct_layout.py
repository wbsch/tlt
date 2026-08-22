#!/usr/bin/env python3
"""Tests for the C struct layout engine used to derive save offsets.

The failure mode these guard against is silence: an offset that is wrong but
plausible produces autotracker data that validates fine and misreads memory at
runtime. So every case here pins an exact byte offset, and the "unsupported C"
cases assert that we raise instead of guessing.
"""

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from c_struct_layout import LayoutError, build_layouter, parse_defines  # noqa: E402

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def layout_of(source, name="S", defines=()):
    return build_layouter({"test.h": source}, defines=defines).layout(name)


def offsets(result):
    return {f["name"]: f["offset"] for f in result["fields"]}


class BitfieldTests(unittest.TestCase):
    def test_bitfields_pack_into_storage_units(self):
        # 1+1+2+2+2 exactly fills byte 0, so the 9th bit opens byte 1. This is
        # the real SharedCustomSave bombchuBagFlags/progressiveFlags split.
        result = layout_of("""
            typedef struct {
                u8 a:1; u8 b:1; u8 c:2; u8 d:2; u8 e:2;
                u8 f:1; u8 g:2;
                u8 tail[3];
            } S;
        """)
        off = offsets(result)
        self.assertEqual([off["a"], off["b"], off["c"], off["d"], off["e"]], [0] * 5)
        self.assertEqual(off["f"], 1)
        self.assertEqual(off["g"], 1)
        self.assertEqual(off["tail"], 2)
        self.assertEqual(result["raw_size"], 5)

    def test_bitfield_does_not_straddle_its_unit(self):
        # 6 bits used, a 4-bit field cannot fit in the remaining 2 -> new unit.
        result = layout_of("typedef struct { u8 a:6; u8 b:4; u8 c; } S;")
        off = offsets(result)
        self.assertEqual((off["a"], off["b"], off["c"]), (0, 1, 2))

    def test_non_bitfield_closes_the_unit(self):
        result = layout_of("typedef struct { u8 a:1; u8 b; u8 c:1; } S;")
        off = offsets(result)
        self.assertEqual((off["a"], off["b"], off["c"]), (0, 1, 2))

    def test_bitfield_wider_than_its_type_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("typedef struct { u8 a:9; } S;")


class AlignmentTests(unittest.TestCase):
    def test_member_alignment_inserts_padding(self):
        result = layout_of("typedef struct { u8 a; u32 b; u8 c; } S;")
        self.assertEqual(offsets(result)["b"], 4)
        self.assertEqual(result["raw_size"], 9)
        self.assertEqual(result["size"], 12)  # padded to the u32 alignment

    def test_aligned_attribute_raises_struct_alignment(self):
        result = layout_of("typedef struct ALIGNED(16) { u8 a[17]; } S;")
        self.assertEqual(result["raw_size"], 17)
        self.assertEqual(result["size"], 32)
        self.assertEqual(result["align"], 16)

    def test_nested_struct_alignment_propagates(self):
        result = layout_of("""
            typedef struct ALIGNED(16) { u8 x; } Inner;
            typedef struct { u8 a; Inner inner; u8 b; } S;
        """)
        off = offsets(result)
        self.assertEqual(off["inner"], 16)
        self.assertEqual(off["inner.x"], 16)
        self.assertEqual(off["b"], 32)


class AggregateTests(unittest.TestCase):
    def test_union_members_share_offset_and_take_max_size(self):
        result = layout_of("""
            typedef union { u8 small; u32 big; } U;
            typedef struct { u8 lead; U u; u8 trail; } S;
        """)
        off = offsets(result)
        self.assertEqual(off["u"], 4)
        self.assertEqual(off["u.small"], 4)
        self.assertEqual(off["u.big"], 4)
        self.assertEqual(off["trail"], 8)

    def test_anonymous_struct_in_union_promotes_members(self):
        # This is MmCustomSave.ootSongs: a union of a bitfield struct and a u8.
        result = layout_of("""
            typedef struct {
                u8 lead;
                union { struct { u8 songSaria:1; u8 songZelda:1; }; u8 value; } songs;
                u8 trail;
            } S;
        """)
        off = offsets(result)
        self.assertEqual(off["songs"], 1)
        self.assertEqual(off["songs.songSaria"], 1)
        self.assertEqual(off["songs.value"], 1)
        self.assertEqual(off["trail"], 2)

    def test_array_of_structs_advances_by_full_size(self):
        result = layout_of("""
            typedef struct { u32 a; u32 b; } Item;
            typedef struct { Item items[3]; u8 tail; } S;
        """)
        self.assertEqual(offsets(result)["tail"], 24)


class ConstantTests(unittest.TestCase):
    def test_array_count_from_define_and_expression(self):
        result = layout_of("""
            #define SR_MAX 0x12
            typedef struct { u8 packed[(SR_MAX + 1) / 2]; u8 tail; } S;
        """)
        self.assertEqual(offsets(result)["tail"], 9)  # C truncating division

    def test_array_count_from_implicit_enum_value(self):
        result = layout_of("""
            enum { A, B, C, DOORID_OOT_MAX };
            typedef struct { u8 keys[(DOORID_OOT_MAX + 7) / 8]; u8 tail; } S;
        """)
        self.assertEqual(offsets(result)["tail"], 1)

    def test_valueless_define_does_not_swallow_the_next_line(self):
        # Regression: a \\s+ separator spans newlines, so an include guard's
        # `#define FOO` would eat the following `#define BAR 3` as its body.
        env = parse_defines("#define GUARD\n#define XFLAGS_COUNT_OOT 0x2fa\n")
        self.assertEqual(env, {"XFLAGS_COUNT_OOT": 0x2FA})

    def test_unknown_constant_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("typedef struct { u8 a[NOPE]; } S;")


class ConditionalTests(unittest.TestCase):
    SOURCE = """
        typedef struct {
            u8 always;
        #if defined(DEBUG)
            u8 cheats[4];
        #endif
            u8 tail;
        } S;
    """

    def test_undefined_conditional_block_is_excluded(self):
        self.assertEqual(offsets(layout_of(self.SOURCE))["tail"], 1)

    def test_defined_conditional_block_is_included(self):
        result = layout_of(self.SOURCE, defines=("DEBUG",))
        self.assertEqual(offsets(result)["tail"], 5)

    def test_else_branch(self):
        source = """
            typedef struct {
            #if defined(GAME_OOT)
                u8 oot[2];
            #else
                u8 mm[8];
            #endif
                u8 tail;
            } S;
        """
        self.assertEqual(offsets(layout_of(source))["tail"], 8)
        self.assertEqual(offsets(layout_of(source, defines=("GAME_OOT",)))["tail"], 2)

    def test_unmodelled_condition_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("#if VERSION > 3\ntypedef struct { u8 a; } S;\n#endif")


class UnsupportedCTests(unittest.TestCase):
    def test_multi_declarator_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("typedef struct { u8 a, b; } S;")

    def test_unknown_type_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("typedef struct { Widget a; } S;")

    def test_pointer_member_raises(self):
        with self.assertRaises(LayoutError):
            layout_of("typedef struct { u8* p; } S;")


class CheckedOutHeadersTests(unittest.TestCase):
    """Golden test: the engine must reproduce the shipped data for this checkout."""

    def test_shared_custom_save_matches_committed_offsets(self):
        from generate_inventory_slots import build_shared_storage, load_save_layout

        ootmm = REPO_ROOT / "OoTMM"
        if not (ootmm / "packages/generator/include/combo/save.h").is_file():
            self.skipTest("no OoTMM checkout")

        import subprocess

        tag = subprocess.run(
            ["git", "-C", str(ootmm), "describe", "--tags", "--abbrev=0"],
            capture_output=True, text=True,
        )
        if tag.returncode != 0:
            self.skipTest("OoTMM checkout is not on a tag")
        dirname = "v" + tag.stdout.strip().lstrip("v").replace(".", "_")
        committed = (REPO_ROOT / "packs/ootmm/src/autotracker/data" / dirname
                     / "shared_save_offsets.json")
        if not committed.is_file():
            self.skipTest(f"no committed data for {dirname}")

        _, shared_layout = load_save_layout(ootmm)
        derived = build_shared_storage(shared_layout)["fixedOffsets"]
        self.assertEqual(derived, json.loads(committed.read_text()))


if __name__ == "__main__":
    unittest.main()
