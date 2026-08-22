#!/usr/bin/env python3
"""Lay out C structs from OoTMM headers using the N64 (MIPS o32, big-endian) ABI.

WHY THIS EXISTS
---------------
The autotracker needs byte offsets inside `gSharedCustomSave`, which exists only
as a C declaration. There is nothing to reuse from OoTMM: its TypeScript side
models world/logic/settings data, never save memory, because the generator
patches ROMs rather than reading live RAM. We are the only consumer that cares
where a field lands at runtime.

The old approach mirrored those structs as hand-written offset arithmetic
(`pre_soul = 0x20 + 8 + 2 + 2`). When v32.2 inserted `silverRupees[]` into the
middle of SharedCustomSave, every later offset moved and the arithmetic kept
emitting the previous version's numbers -- silently, because the two scripts that
mirrored the struct shared the same stale assumption and so agreed with each
other. This module parses the headers instead, so a mid-struct insert is picked
up by construction.

SCOPE
-----
Only the subset of C that appears in OoTMM's save headers: fixed-width typedefs,
float, nested/anonymous structs and unions, bitfields, arrays sized by macros or
enum constants, and `ALIGNED(n)`. Anything else raises -- a wrong offset is far
worse than a crash, since it produces plausible nonsense at runtime.

Bitfields follow the big-endian MIPS rule: allocation starts at the most
significant bit of the storage unit, and a field never straddles a unit, so
`u8 a:1; u8 b:2;` share byte 0 while a 9th bit opens byte 1.
"""

import re


class LayoutError(Exception):
    """Raised when a header uses C we do not model. Never guess an offset."""


# (size, alignment) of the primitives used by OoTMM's save headers.
PRIMITIVE_SIZES = {
    "u8": (1, 1), "s8": (1, 1), "char": (1, 1),
    "u16": (2, 2), "s16": (2, 2),
    "u32": (4, 4), "s32": (4, 4), "int": (4, 4), "float": (4, 4),
    "u64": (8, 8), "s64": (8, 8), "double": (8, 8),
}

_COMMENT_RE = re.compile(r"/\*.*?\*/|//[^\n]*", re.DOTALL)
_ALIGNED_RE = re.compile(r"\bALIGNED\s*\(\s*(\d+)\s*\)")
# Horizontal whitespace only: a plain \s+ spans newlines and would let a
# valueless #define swallow the following line as its body.
_H = r"[^\S\n]"
_DEFINE_RE = re.compile(
    rf"^{_H}*#{_H}*define{_H}+([A-Za-z_]\w*){_H}+([^\n]+?){_H}*$",
    re.MULTILINE,
)


def strip_comments(text):
    return _COMMENT_RE.sub(" ", text)


# --------------------------------------------------------------------------- #
# Preprocessor conditionals
# --------------------------------------------------------------------------- #
def _eval_condition(cond, defines):
    """Evaluate a #if condition. Only defined()/!defined() forms are modelled."""
    cond = cond.strip()
    negate = False
    if cond.startswith("!"):
        negate, cond = True, cond[1:].strip()
    m = re.fullmatch(r"defined\s*\(\s*([A-Za-z_]\w*)\s*\)", cond)
    if not m:
        m = re.fullmatch(r"defined\s+([A-Za-z_]\w*)", cond)
    if not m:
        raise LayoutError(f"unsupported preprocessor condition: {cond!r}")
    value = m.group(1) in defines
    return (not value) if negate else value


def apply_conditionals(text, defines):
    """Keep only the lines of `text` that survive #if/#ifdef with `defines`.

    Raises on any conditional we cannot evaluate, so an unmodelled `#if` can
    never silently drop or admit a struct member.
    """
    out = []
    stack = []  # (currently_taken, any_branch_taken_yet)
    for line in text.splitlines():
        stripped = line.strip()
        directive = re.match(r"#\s*(ifdef|ifndef|if|elif|else|endif)\b(.*)", stripped)
        if directive:
            kind, rest = directive.group(1), directive.group(2)
            if kind in ("ifdef", "ifndef", "if"):
                if kind == "ifdef":
                    taken = rest.strip() in defines
                elif kind == "ifndef":
                    taken = rest.strip() not in defines
                else:
                    taken = _eval_condition(rest, defines)
                parent_live = all(t for t, _ in stack)
                stack.append((taken and parent_live, taken))
            elif kind == "elif":
                if not stack:
                    raise LayoutError("#elif without #if")
                _, seen = stack[-1]
                taken = (not seen) and _eval_condition(rest, defines)
                parent_live = all(t for t, _ in stack[:-1])
                stack[-1] = (taken and parent_live, seen or taken)
            elif kind == "else":
                if not stack:
                    raise LayoutError("#else without #if")
                _, seen = stack[-1]
                parent_live = all(t for t, _ in stack[:-1])
                stack[-1] = ((not seen) and parent_live, True)
            else:
                if not stack:
                    raise LayoutError("#endif without #if")
                stack.pop()
            continue
        if all(t for t, _ in stack):
            out.append(line)
    if stack:
        raise LayoutError("unterminated #if in header")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Constant environment (#define + enum constants)
# --------------------------------------------------------------------------- #
def parse_defines(text):
    """Integer-valued object-like #defines. Non-integer macros are skipped."""
    env = {}
    for name, body in _DEFINE_RE.findall(strip_comments(text)):
        body = body.strip()
        if re.fullmatch(r"0[xX][0-9a-fA-F]+", body):
            env[name] = int(body, 16)
        elif re.fullmatch(r"-?\d+", body):
            env[name] = int(body, 10)
    return env


def parse_enums(text, env=None):
    """Enum constants, including implicit sequential values (e.g. DOORID_*_MAX)."""
    env = dict(env or {})
    text = strip_comments(text)
    out = {}
    for match in re.finditer(r"\benum\b[^{;]*\{", text):
        start = match.end()
        depth, i = 1, start
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        if depth:
            raise LayoutError("unterminated enum body")
        next_value = 0
        for item in text[start:i - 1].split(","):
            item = item.strip()
            if not item:
                continue
            if "=" in item:
                name, expr = item.split("=", 1)
                next_value = eval_int_expr(expr, {**env, **out})
                name = name.strip()
            else:
                name = item
            if not re.fullmatch(r"[A-Za-z_]\w*", name):
                raise LayoutError(f"unsupported enumerator: {item!r}")
            out[name] = next_value
            next_value += 1
    return out


_EXPR_TOKEN_RE = re.compile(r"[A-Za-z_]\w*|0[xX][0-9a-fA-F]+|\d+|[()+\-*/]|\s+")


def eval_int_expr(expr, env):
    """Evaluate a C integer constant expression (C truncating division)."""
    expr = expr.strip()
    pos, tokens = 0, []
    while pos < len(expr):
        m = _EXPR_TOKEN_RE.match(expr, pos)
        if not m:
            raise LayoutError(f"cannot parse expression {expr!r}")
        token = m.group(0)
        pos = m.end()
        if token.strip():
            tokens.append(token)

    python_expr = []
    for token in tokens:
        if re.fullmatch(r"[A-Za-z_]\w*", token):
            if token not in env:
                raise LayoutError(
                    f"unknown constant {token!r} in expression {expr!r}"
                )
            python_expr.append(str(env[token]))
        elif re.fullmatch(r"0[xX][0-9a-fA-F]+", token):
            python_expr.append(str(int(token, 16)))
        else:
            python_expr.append(token)
    joined = "".join(python_expr)
    if not re.fullmatch(r"[\d()+\-*/ ]+", joined):
        raise LayoutError(f"unsupported expression {expr!r}")
    try:
        value = eval(joined, {"__builtins__": {}}, {})  # noqa: S307 - digits/ops only
    except Exception as exc:  # pragma: no cover - defensive
        raise LayoutError(f"cannot evaluate {expr!r}: {exc}") from exc
    if isinstance(value, float):  # C integer division truncates toward zero
        value = int(value)
    return int(value)


# --------------------------------------------------------------------------- #
# Declaration parsing
# --------------------------------------------------------------------------- #
_MEMBER_RE = re.compile(
    r"^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*"
    r"(?:\[([^\]]*)\])?\s*"
    r"(?::\s*(\d+))?$"
)
_AGGREGATE_HEAD_RE = re.compile(r"^(struct|union)\b")


def _match_brace(text, open_index):
    depth, i = 0, open_index
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise LayoutError("unbalanced braces")


def parse_members(body):
    """Parse a struct/union body into an ordered list of member descriptors."""
    members = []
    i, n = 0, len(body)
    while i < n:
        if body[i] in " \t\r\n;":
            i += 1
            continue

        rest = body[i:]
        head = _AGGREGATE_HEAD_RE.match(rest)
        brace = rest.find("{")
        semi = rest.find(";")
        if head and brace != -1 and (semi == -1 or brace < semi):
            aggregate = head.group(1)
            aligned = _ALIGNED_RE.search(rest[:brace])
            close = _match_brace(body, i + brace)
            end = body.find(";", close)
            if end == -1:
                raise LayoutError("inline aggregate without terminating ';'")
            declarator = body[close + 1:end].strip()
            name, array = None, None
            if declarator:
                m = re.fullmatch(r"([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?", declarator)
                if not m:
                    raise LayoutError(f"unsupported declarator {declarator!r}")
                name, array = m.group(1), m.group(2)
            members.append({
                "kind": "aggregate",
                "aggregate": aggregate,
                "body": body[i + brace + 1:close],
                "name": name,
                "array": array,
                "aligned": int(aligned.group(1)) if aligned else None,
            })
            i = end + 1
            continue

        if semi == -1:
            leftover = rest.strip()
            if leftover:
                raise LayoutError(f"trailing declaration without ';': {leftover!r}")
            break
        decl = rest[:semi].strip()
        i += semi + 1
        if not decl:
            continue
        if "," in decl:
            raise LayoutError(f"multi-declarator members are not modelled: {decl!r}")
        m = _MEMBER_RE.fullmatch(decl)
        if not m:
            raise LayoutError(f"unsupported member declaration: {decl!r}")
        members.append({
            "kind": "field",
            "type": m.group(1),
            "name": m.group(2),
            "array": m.group(3),
            "bits": int(m.group(4)) if m.group(4) else None,
        })
    return members


def extract_typedefs(text):
    """Map typedef name -> aggregate descriptor for `typedef struct/union {...} N;`."""
    text = strip_comments(text)
    typedefs = {}
    pos = 0
    while True:
        start = text.find("typedef", pos)
        if start < 0:
            break
        head = re.match(r"typedef\s+(struct|union)\b", text[start:])
        if not head:
            pos = start + len("typedef")
            continue
        brace = text.find("{", start)
        if brace < 0:
            break
        semi = text.find(";", start)
        if semi != -1 and semi < brace:  # e.g. `typedef struct Foo Foo;`
            pos = semi + 1
            continue
        close = _match_brace(text, brace)
        end = text.find(";", close)
        if end < 0:
            break
        name = text[close + 1:end].strip()
        if re.fullmatch(r"[A-Za-z_]\w*", name):
            aligned = _ALIGNED_RE.search(text[start:brace])
            typedefs[name] = {
                "aggregate": head.group(1),
                "body": text[brace + 1:close],
                "aligned": int(aligned.group(1)) if aligned else None,
            }
        pos = end + 1
    return typedefs


# --------------------------------------------------------------------------- #
# Layout
# --------------------------------------------------------------------------- #
def _align_up(value, alignment):
    remainder = value % alignment
    return value if not remainder else value + alignment - remainder


class Layouter:
    """Lays out aggregates from a typedef table plus a constant environment."""

    def __init__(self, typedefs, env):
        self.typedefs = typedefs
        self.env = env
        self._memo = {}

    def sizeof(self, type_name):
        return self.type_info(type_name)[0]

    def type_info(self, type_name):
        if type_name in PRIMITIVE_SIZES:
            return PRIMITIVE_SIZES[type_name]
        if type_name in self._memo:
            return self._memo[type_name]
        if type_name not in self.typedefs:
            raise LayoutError(
                f"unknown type {type_name!r} "
                f"(known: {sorted(self.typedefs)})"
            )
        result = self.layout(type_name)
        self._memo[type_name] = (result["size"], result["align"])
        return self._memo[type_name]

    def layout(self, type_name):
        if type_name not in self.typedefs:
            raise LayoutError(f"unknown aggregate {type_name!r}")
        entry = self.typedefs[type_name]
        return self._layout_aggregate(entry)

    def _layout_aggregate(self, entry):
        members = parse_members(entry["body"])
        if entry["aggregate"] == "union":
            fields, size, align = self._layout_union(members)
        else:
            fields, size, align = self._layout_struct(members)
        if entry.get("aligned"):
            align = max(align, entry["aligned"])
        return {
            "fields": fields,
            "size": _align_up(size, align),
            "raw_size": size,
            "align": align,
        }

    def _member_layout(self, member):
        """Return (fields, size, align) for one member's own type."""
        if member["kind"] == "aggregate":
            sub = self._layout_aggregate(member)
            return sub["fields"], sub["size"], sub["align"]
        size, align = self.type_info(member["type"])
        sub_fields = []
        if member["type"] in self.typedefs:
            sub_fields = self.layout(member["type"])["fields"]
        return sub_fields, size, align

    def _count(self, member):
        if not member.get("array"):
            return 1
        return eval_int_expr(member["array"], self.env)

    @staticmethod
    def _emit(fields, name, offset, sub_fields, **extra):
        entry = {"name": name, "offset": offset, **extra}
        fields.append(entry)
        for sub in sub_fields:
            child = dict(sub)
            child["offset"] = sub["offset"] + offset
            child["name"] = f"{name}.{sub['name']}" if name else sub["name"]
            fields.append(child)

    def _layout_struct(self, members):
        fields, offset, struct_align = [], 0, 1
        unit_start, unit_size, bit_pos = None, 0, 0

        for member in members:
            if member["kind"] == "field" and member["bits"] is not None:
                width = member["bits"]
                size, align = self.type_info(member["type"])
                if size not in (1, 2, 4, 8):
                    raise LayoutError(f"odd bitfield base type {member['type']!r}")
                if width > size * 8:
                    raise LayoutError(f"bitfield {member['name']!r} wider than its type")
                fits = (
                    unit_start is not None
                    and unit_size == size
                    and bit_pos + width <= size * 8
                )
                if not fits:
                    offset = _align_up(offset, align)
                    unit_start, unit_size, bit_pos = offset, size, 0
                    offset += size
                # Big-endian MIPS fills each unit from its most significant bit.
                self._emit(
                    fields, member["name"], unit_start + bit_pos // 8, [],
                    size=0, type=member["type"], count=1,
                    bit_offset=bit_pos % 8, bit_width=width,
                )
                bit_pos += width
                struct_align = max(struct_align, align)
                continue

            unit_start, bit_pos = None, 0
            sub_fields, size, align = self._member_layout(member)
            count = self._count(member)
            offset = _align_up(offset, align)
            if member.get("name"):
                self._emit(
                    fields, member["name"], offset,
                    sub_fields if count == 1 else [],
                    size=size * count, count=count,
                    type=member.get("type", member.get("aggregate")),
                )
            else:  # anonymous struct/union: members promote into the parent
                self._emit(fields, "", offset, sub_fields)
            offset += size * count
            struct_align = max(struct_align, align)

        return fields, offset, struct_align

    def _layout_union(self, members):
        fields, size, union_align = [], 0, 1
        for member in members:
            if member["kind"] == "field" and member["bits"] is not None:
                raise LayoutError("bitfields directly inside a union are not modelled")
            sub_fields, msize, align = self._member_layout(member)
            count = self._count(member)
            if member.get("name"):
                self._emit(
                    fields, member["name"], 0,
                    sub_fields if count == 1 else [],
                    size=msize * count, count=count,
                    type=member.get("type", member.get("aggregate")),
                )
            else:
                self._emit(fields, "", 0, sub_fields)
            size = max(size, msize * count)
            union_align = max(union_align, align)
        return fields, size, union_align


def build_layouter(headers, defines=(), extra_env=None):
    """Build a Layouter from header texts.

    `headers` maps a label to raw header text. Conditionals are resolved with
    `defines` (anything absent counts as undefined), then #define and enum
    constants from every header form the array-count environment.
    """
    env = dict(extra_env or {})
    typedefs = {}
    for text in headers.values():
        resolved = apply_conditionals(text, set(defines))
        env.update(parse_defines(resolved))
        env.update(parse_enums(resolved, env))
        typedefs.update(extract_typedefs(resolved))
    return Layouter(typedefs, env)
