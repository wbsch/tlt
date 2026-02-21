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
        raise ValueError(f"Ungültiges JSON in {path}: {exc}") from exc

    removed = clean_node(data)
    changed = removed > 0

    if changed and write:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if prettier:
            ok = run_prettier_on_path(path)
            if not ok:
                print(f"Prettier konnte nicht ausgeführt werden für {path} (nicht installiert oder fehlgeschlagen).")

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
        description="Entfernt TODO-Einträge aus codes/Codes, wenn dort mehr als ein Eintrag vorhanden ist."
    )
    parser.add_argument("target", type=Path, help="Pfad zu einer JSON-Datei oder zu einem Verzeichnis")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Änderungen in Dateien schreiben (ohne diese Option nur Vorschau)",
    )
    parser.add_argument(
        "--no-prettier",
        dest="prettier",
        action="store_false",
        help="Prettier vor dem Schreiben nicht ausführen",
    )
    parser.set_defaults(prettier=True)
    args = parser.parse_args()

    target = args.target
    if not target.exists():
        print(f"Pfad existiert nicht: {target}")
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
            mode = "geschrieben" if args.write else "gefunden"
            print(f"{file_path}: {removed} TODO-Einträge {mode}")

    print(
        f"Fertig. Gescannte Dateien: {scanned_files}, geänderte Dateien: {changed_files}, entfernte TODO-Einträge: {total_removed}"
    )
    if not args.write:
        print("Hinweis: Ohne --write wurden keine Dateien geändert.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())