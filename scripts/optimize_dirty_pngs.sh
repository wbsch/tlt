#!/usr/bin/env bash

set -euo pipefail

declare -a png_paths=()
declare -A seen_paths=()

collect_paths() {
  while IFS= read -r -d '' file_path; do
    if [[ -f "$file_path" && -z "${seen_paths["$file_path"]+x}" ]]; then
      seen_paths["$file_path"]=1
      png_paths+=("$file_path")
    fi
  done < <("$@")
}

if ! command -v oxipng >/dev/null 2>&1; then
  echo "Required command not found: oxipng" >&2
  exit 1
fi

collect_paths git diff --name-only -z --diff-filter=ACMR -- '*.png'
collect_paths git diff --cached --name-only -z --diff-filter=ACMR -- '*.png'
collect_paths git ls-files --others --exclude-standard -z -- '*.png'

if [[ ${#png_paths[@]} -eq 0 ]]; then
  echo "No dirty .png files found."
  exit 0
fi

echo "Optimizing ${#png_paths[@]} dirty .png file(s) with oxipng -Zao6..."
oxipng -Zao6 "${png_paths[@]}"
