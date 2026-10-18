#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["pillow>=10.0.0"]
# ///

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, replace
from pathlib import Path

from PIL import Image


# Built-in preset: split the tracked map icon spritesheets into the asset folders.
# Source PNGs and metadata are expected at these fixed locations; output files are
# intentionally overwritten.
MAP_ICONS_INFO = Path("public/images/Spritesheet_Information.txt")
MAP_ICONS_SPEC_NAME = "map_icons.png"
MAP_ICONS_TARGETS: tuple[tuple[Path, Path], ...] = (
    (Path("public/images/map_icons.png"), Path("public/images/map_icons")),
    (
        Path("public/images/map_icons_mit.png"),
        Path("public/images/fallback/map_icons"),
    ),
)


@dataclass(frozen=True)
class SheetSpec:
    sheet_filename: str
    sprite_w: int
    sprite_h: int
    names: list[str]


@dataclass(frozen=True)
class GridSpec:
    cols: int
    rows: int
    expected: int


@dataclass(frozen=True)
class ExportStats:
    sheet: str
    count: int
    folder: Path


class ParseError(ValueError):
    pass


class ValidationError(ValueError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split spritesheets into named PNG files based on metadata."
    )
    parser.add_argument(
        "--info",
        default="Spritesheet_Information.txt",
        type=Path,
        help="Path to metadata file.",
    )
    parser.add_argument(
        "--sheets-dir",
        default="ceoalex_ootmm_spritemaps",
        type=Path,
        help="Directory containing source spritesheet PNGs.",
    )
    parser.add_argument(
        "--out-dir",
        default="ceoalex_ootmm_spritemaps/extracted",
        type=Path,
        help="Output directory for extracted sprites.",
    )
    parser.add_argument(
        "--preset",
        choices=["map-icons"],
        help="Use a built-in preset instead of --info/--sheets-dir/--out-dir.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing sprite files instead of refusing to run.",
    )
    return parser.parse_args()


def split_top_level_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    depth = 0
    start: int | None = None

    for idx, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = idx
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                raise ParseError("Unbalanced braces in metadata.")
            if depth == 0 and start is not None:
                blocks.append(text[start : idx + 1])
                start = None

    if depth != 0:
        raise ParseError("Unbalanced braces in metadata.")
    if not blocks:
        raise ParseError("No sheet blocks found in metadata.")
    return blocks


def parse_sheet_block(block: str) -> SheetSpec:
    sheet_match = re.search(r'Sheet:\s*"([^"]+)"', block)
    width_match = re.search(r"width:\s*(\d+)", block)
    height_match = re.search(r"height:\s*(\d+)", block)
    names_match = re.search(r"Names:\s*\{(.*?)\}", block, flags=re.DOTALL)

    if not sheet_match:
        raise ParseError(f"Missing Sheet field in block: {block[:120]!r}")
    if not width_match or not height_match:
        raise ParseError(f"Missing Dimensions width/height in block: {block[:120]!r}")
    if not names_match:
        raise ParseError(f"Missing Names field in block: {block[:120]!r}")

    names_raw = names_match.group(1)
    names = [token.strip() for token in names_raw.split(",")]
    names = [name for name in names if name]

    if not names:
        raise ParseError(f"Names list is empty for sheet {sheet_match.group(1)!r}")

    return SheetSpec(
        sheet_filename=sheet_match.group(1),
        sprite_w=int(width_match.group(1)),
        sprite_h=int(height_match.group(1)),
        names=names,
    )


def parse_info(path: Path) -> list[SheetSpec]:
    if not path.is_file():
        raise FileNotFoundError(f"Metadata file not found: {path}")

    text = path.read_text(encoding="utf-8")
    blocks = split_top_level_blocks(text)
    specs = [parse_sheet_block(block) for block in blocks]

    seen_sheets: set[str] = set()
    for spec in specs:
        if spec.sheet_filename in seen_sheets:
            raise ParseError(f"Duplicate Sheet entry: {spec.sheet_filename}")
        seen_sheets.add(spec.sheet_filename)
    return specs


def slugify(name: str, index: int) -> str:
    slug = name.lower()
    slug = slug.replace("&", "_and_")
    slug = slug.replace("'", "")
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = re.sub(r"_+", "_", slug).strip("_")
    if not slug:
        slug = f"sprite_{index + 1}"
    return slug


def validate_sheet(spec: SheetSpec, image_size: tuple[int, int]) -> GridSpec:
    img_w, img_h = image_size
    if spec.sprite_w <= 0 or spec.sprite_h <= 0:
        raise ValidationError(
            f"{spec.sheet_filename}: sprite dimensions must be positive, got "
            f"{spec.sprite_w}x{spec.sprite_h}"
        )
    if img_w % spec.sprite_w != 0 or img_h % spec.sprite_h != 0:
        raise ValidationError(
            f"{spec.sheet_filename}: image dimensions {img_w}x{img_h} are not divisible "
            f"by sprite dimensions {spec.sprite_w}x{spec.sprite_h}"
        )

    cols = img_w // spec.sprite_w
    rows = img_h // spec.sprite_h
    expected = cols * rows
    if len(spec.names) > expected:
        raise ValidationError(
            f"{spec.sheet_filename}: names count ({len(spec.names)}) exceeds "
            f"sprite slots ({expected})"
        )
    return GridSpec(cols=cols, rows=rows, expected=expected)


def target_folder_for_sheet(spec: SheetSpec, out_dir: Path) -> Path:
    return out_dir / Path(spec.sheet_filename).stem


def ensure_folders_do_not_exist(specs: list[SheetSpec], out_dir: Path) -> None:
    conflicts = [target_folder_for_sheet(spec, out_dir) for spec in specs]
    existing = [path for path in conflicts if path.exists()]
    if existing:
        joined = ", ".join(str(path) for path in existing)
        raise FileExistsError(
            f"Refusing to run because output folder(s) already exist: {joined}"
        )


def export_sheet(
    spec: SheetSpec,
    sheets_dir: Path,
    out_dir: Path,
    *,
    overwrite: bool = False,
    target_folder: Path | None = None,
) -> ExportStats:
    sheet_path = sheets_dir / spec.sheet_filename
    if not sheet_path.is_file():
        raise FileNotFoundError(f"Sheet image not found: {sheet_path}")

    if target_folder is None:
        target_folder = target_folder_for_sheet(spec, out_dir)
    target_folder.mkdir(parents=True, exist_ok=overwrite)

    with Image.open(sheet_path) as img:
        grid = validate_sheet(spec, img.size)
        used_names: dict[str, int] = {}

        for idx, name in enumerate(spec.names):
            row = idx // grid.cols
            col = idx % grid.cols
            left = col * spec.sprite_w
            top = row * spec.sprite_h
            right = left + spec.sprite_w
            bottom = top + spec.sprite_h

            base = slugify(name, idx)
            count = used_names.get(base, 0) + 1
            used_names[base] = count
            file_stem = base if count == 1 else f"{base}_{count}"
            out_path = target_folder / f"{file_stem}.png"

            sprite = img.crop((left, top, right, bottom))
            sprite.save(out_path, format="PNG")

    return ExportStats(sheet=spec.sheet_filename, count=len(spec.names), folder=target_folder)


def load_sheet_spec(info: Path, sheet_filename: str) -> SheetSpec:
    for spec in parse_info(info):
        if spec.sheet_filename == sheet_filename:
            return spec
    raise ParseError(f"Sheet {sheet_filename!r} not found in metadata: {info}")


def run(info: Path, sheets_dir: Path, out_dir: Path) -> int:
    specs = parse_info(info)
    ensure_folders_do_not_exist(specs, out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    stats: list[ExportStats] = []
    for spec in specs:
        stats.append(export_sheet(spec, sheets_dir, out_dir))

    for item in stats:
        print(f"{item.sheet}: exported {item.count} sprites -> {item.folder}")
    return 0


def run_map_icons(overwrite: bool) -> int:
    """Split the map icon sheets using the sprite names from the metadata file."""
    base_spec = load_sheet_spec(MAP_ICONS_INFO, MAP_ICONS_SPEC_NAME)

    # Validate everything up front so a typo does not leave a half-written set.
    for source, target_folder in MAP_ICONS_TARGETS:
        if not source.is_file():
            raise FileNotFoundError(f"Sheet image not found: {source}")
        if target_folder.exists() and not overwrite:
            raise FileExistsError(
                f"Refusing to run because output folder already exists: {target_folder} "
                "(pass --overwrite to replace existing files)"
            )

    stats: list[ExportStats] = []
    for source, target_folder in MAP_ICONS_TARGETS:
        # The metadata (and therefore the sprite names) comes from map_icons.png;
        # the MIT variant has the same layout but lands in the fallback folder.
        spec = replace(base_spec, sheet_filename=source.name)
        stats.append(
            export_sheet(
                spec,
                source.parent,
                target_folder.parent,
                overwrite=overwrite,
                target_folder=target_folder,
            )
        )

    for item in stats:
        print(f"{item.sheet}: exported {item.count} sprites -> {item.folder}")
    return 0


def main() -> int:
    args = parse_args()
    try:
        if args.preset == "map-icons":
            return run_map_icons(args.overwrite)
        return run(args.info, args.sheets_dir, args.out_dir)
    except (ParseError, ValidationError, FileNotFoundError, FileExistsError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
