#!/usr/bin/env python3
"""Cross-check the Python struct layout against a real C compiler.

`c_struct_layout` models the N64 ABI in Python. This module checks that model
against the only authority that really knows: a C compiler. It re-emits the
parsed typedefs as a self-contained translation unit, compiles it with the host
`cc`, and reads the offsets back out via `__builtin_offsetof`.

This is an *optional oracle*, never part of generating data:

  * no compiler, or a probe that will not build -> skip, quietly. The tracker
    must build on machines with no C toolchain.
  * compiler and engine disagree -> that is a real defect in one of them, and
    the caller should treat it as a failure.

Why a host compiler can answer a question about N64 layout: the probe declares
its own fixed-width typedefs rather than including OoTMM's `types.h` (whose
`u32` is `unsigned long` -- 4 bytes on N64, 8 on x86-64). For the primitives
these save structs use, x86-64 SysV and MIPS o32 agree on size, alignment and
struct packing. Byte offsets of byte-aligned bitfields also coincide; only the
bit position *within* a byte flips with endianness, and we compare byte offsets.

Bitfields have no address, so `offsetof` cannot reach them. The probe finds
their byte by zeroing an instance, setting a single bit, and scanning -- which
is why it must be run, not merely compiled.

Run directly to see the comparison:

    python3 scripts/autotracker/c_probe.py [--ootmm-repo OoTMM]
"""

import argparse
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

from c_struct_layout import PRIMITIVE_SIZES, parse_members

C_PRELUDE = """\
/* Fixed-width typedefs matching the N64 target, deliberately NOT OoTMM's
   types.h (its u32 is `unsigned long`, which is 8 bytes on a 64-bit host). */
typedef unsigned char  u8;   typedef signed char  s8;
typedef unsigned short u16;  typedef signed short s16;
typedef unsigned int   u32;  typedef signed int   s32;
#define ALIGNED(x) __attribute__((aligned(x)))
"""


class ProbeUnavailable(Exception):
    """The probe could not be built or run. Never a data defect -- skip."""


def _member_type_names(body, typedefs):
    """Typedef names referenced by a struct body, including inline aggregates."""
    names = []
    for member in parse_members(body):
        if member["kind"] == "aggregate":
            names.extend(_member_type_names(member["body"], typedefs))
        elif member["type"] not in PRIMITIVE_SIZES and member["type"] in typedefs:
            names.append(member["type"])
    return names


def ordered_dependencies(root, typedefs):
    """`root` and every typedef it transitively needs, in valid C declaration order."""
    order, seen = [], set()

    def walk(name):
        if name in seen or name not in typedefs:
            return
        seen.add(name)
        for dep in _member_type_names(typedefs[name]["body"], typedefs):
            walk(dep)
        order.append(name)

    walk(root)
    return order


def c_member_path(name, by_name):
    """Turn a layout path into one C can address (`respawn.pos` -> `respawn[0].pos`)."""
    segments, prefix = [], []
    for segment in name.split("."):
        prefix.append(segment)
        entry = by_name.get(".".join(prefix))
        if entry is None:
            return None
        segments.append(f"{segment}[0]" if entry.get("array") else segment)
    return ".".join(segments)


def emit_translation_unit(layouter, root, fields):
    """Emit a self-contained C probe that prints sizeof(root) and each field offset."""
    names = ordered_dependencies(root, layouter.typedefs)
    if root not in names:
        raise ProbeUnavailable(f"{root} is not a parsed typedef")

    decls = []
    for name in names:
        entry = layouter.typedefs[name]
        aligned = f" ALIGNED({entry['aligned']})" if entry["aligned"] else ""
        decls.append(f"typedef {entry['aggregate']}{aligned} {{{entry['body']}}} {name};")

    # Only the constants actually referenced, so unrelated macros in these
    # headers can never collide with a type name or a C keyword.
    body_text = " ".join(layouter.typedefs[n]["body"] for n in names)
    referenced = set(re.findall(r"[A-Za-z_]\w*", body_text))
    defines = [f"#define {k} {v}" for k, v in sorted(layouter.env.items())
               if k in referenced]

    lines = [C_PRELUDE, *defines, "", *decls, "", "#include <stdio.h>",
             "int main(void) {",
             f'    printf("{_SIZE_KEY} %d\\n", (int)sizeof({root}));']
    by_name = {f["name"]: f for f in fields}
    for field in fields:
        name = c_member_path(field["name"], by_name)
        if name is None:
            continue
        if field.get("bit_width"):
            # Bitfields are not addressable: set one bit, find the byte.
            lines.append(
                f"    {{ {root} s; unsigned char *b = (unsigned char *)&s; int i;\n"
                f"      __builtin_memset(&s, 0, sizeof s); s.{name} = 1;\n"
                f"      for (i = 0; i < (int)sizeof s; i++) if (b[i])\n"
                f'          {{ printf("{name} %d\\n", i); break; }} }}')
        else:
            lines.append(f'    printf("{name} %d\\n",'
                         f" (int)__builtin_offsetof({root}, {name}));")
    lines.append("    return 0;\n}")
    return "\n".join(lines) + "\n"


_SIZE_KEY = "__sizeof__"


def run_probe(layouter, root, fields):
    """Compile and run the probe; return {field name: offset} plus __sizeof__.

    Raises ProbeUnavailable if there is no compiler or the probe will not build.
    """
    compiler = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    if not compiler:
        raise ProbeUnavailable("no C compiler on PATH")

    source = emit_translation_unit(layouter, root, fields)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        src, exe = tmp / "probe.c", tmp / "probe"
        src.write_text(source, encoding="utf-8")
        build = subprocess.run([compiler, "-o", str(exe), str(src)],
                               capture_output=True, text=True)
        if build.returncode != 0:
            raise ProbeUnavailable(
                f"probe did not compile -- the emitter cannot express this "
                f"release's headers:\n{build.stderr.strip()[:2000]}")
        run = subprocess.run([str(exe)], capture_output=True, text=True)
        if run.returncode != 0:
            raise ProbeUnavailable(f"probe crashed: {run.stderr.strip()[:2000]}")

    offsets = {}
    for line in run.stdout.splitlines():
        key, _, value = line.rpartition(" ")
        offsets[key.replace("[0]", "")] = int(value)
    return offsets


def compare(layouter, layout, root="SharedCustomSave"):
    """Compare every laid-out field against the compiler. Returns a mismatch list."""
    fields = [f for f in layout["fields"] if f["name"]]
    probed = run_probe(layouter, root, fields)

    mismatches = []
    if probed.get(_SIZE_KEY) != layout["size"]:
        mismatches.append((f"sizeof({root})", layout["size"], probed.get(_SIZE_KEY)))
    for field in fields:
        if field["name"] in probed and probed[field["name"]] != field["offset"]:
            mismatches.append((field["name"], field["offset"], probed[field["name"]]))
    return mismatches


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ootmm-repo", default="OoTMM")
    parser.add_argument("--struct", default="SharedCustomSave")
    args = parser.parse_args()

    from generate_inventory_slots import load_save_layout

    layouter, layout = load_save_layout(pathlib.Path(args.ootmm_repo))
    try:
        mismatches = compare(layouter, layout, args.struct)
    except ProbeUnavailable as exc:
        print(f"probe unavailable: {exc}")
        return 0

    count = len([f for f in layout["fields"] if f["name"]])
    if mismatches:
        print(f"{len(mismatches)} of {count} fields disagree with the C compiler:")
        for name, engine, compiler in mismatches:
            print(f"  {name}: engine {engine}, compiler {compiler}")
        return 1
    print(f"{count} fields agree with the C compiler "
          f"(sizeof({args.struct}) = {layout['size']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
