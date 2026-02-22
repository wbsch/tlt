#!/usr/bin/env python3
import argparse
import json
import subprocess
import shutil
from pathlib import Path
from typing import Any


def clean_node(node: Any) -> int:
    removed = 0

    if isinstance(node, dict):
        for key in ("codes", "Codes"):
            value = node.get(key)
            if isinstance(value, list) and len(value) > 1:
                kept = [entry for entry in value if not (isinstance(entry, str) and entry.startswith("TODO"))]
                removed_here = len(value) - len(kept)
                if removed_here > 0:
                    node[key] = kept
                    removed += removed_here

        for child in node.values():
            removed += clean_node(child)

    elif isinstance(node, list):
        for item in node:
            removed += clean_node(item)

    return removed


def run_prettier_on_path(path: Path) -> bool:
    # Try to run a locally installed prettier, fallback to npx/pnpm if available.
    candidates = []
    if shutil.which("prettier"):
        candidates.append(["prettier", "--parser", "json", "--write", str(path)])
    if shutil.which("npx"):
        candidates.append(["npx", "prettier", "--parser", "json", "--write", str(path)])
    if shutil.which("pnpm"):
        candidates.append(["pnpm", "prettier", "--", "--parser", "json", "--write", str(path)])

    for cmd in candidates:
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return True
        except Exception:
            continue

    return False


def process_file(path: Path, write: bool, prettier: bool) -> tuple[int, bool]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc

    removed = clean_node(data)
    changed = removed > 0

    if changed and write:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if prettier:
            ok = run_prettier_on_path(path)
            if not ok:
                print(f"Could not run Prettier for {path} (not installed or execution failed).")

    return removed, changed


def iter_json_files(target: Path):
    if target.is_file():
        if target.suffix.lower() == ".json":
            yield target
        return

    for file_path in target.rglob("*.json"):
        if file_path.is_file():
            yield file_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Removes TODO entries from codes/Codes when there is more than one entry."
    )
    parser.add_argument("target", type=Path, help="Path to a JSON file or a directory")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write changes to files (without this option, preview only)",
    )
    parser.add_argument(
        "--no-prettier",
        dest="prettier",
        action="store_false",
        help="Do not run Prettier before writing",
    )
    parser.set_defaults(prettier=True)
    args = parser.parse_args()

    target = args.target
    if not target.exists():
        print(f"Path does not exist: {target}")
        return 1

    total_removed = 0
    changed_files = 0
    scanned_files = 0

    for file_path in iter_json_files(target):
        scanned_files += 1
        removed, changed = process_file(file_path, write=args.write, prettier=args.prettier)
        if changed:
            changed_files += 1
            total_removed += removed
            mode = "written" if args.write else "found"
            print(f"{file_path}: {removed} TODO entries {mode}")

    print(
        f"Done. Scanned files: {scanned_files}, changed files: {changed_files}, removed TODO entries: {total_removed}"
    )
    if not args.write:
        print("Note: Without --write, no files were changed.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())