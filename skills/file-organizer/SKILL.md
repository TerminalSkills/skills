---
name: file-organizer
description: >-
  Organize and rename files based on content analysis. Use when a user asks to
  sort files into folders, rename files by pattern, organize a messy directory,
  categorize documents by type or content, deduplicate files, or clean up
  a downloads folder. Handles smart renaming, content-based sorting, and
  duplicate detection.
license: Apache-2.0
compatibility: "Requires Python 3.8+ for smart rename and duplicate detection scripts"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["files", "organize", "rename", "cleanup", "automation"]
  use-cases:
    - "Sort hundreds of mixed files into categorized folders"
    - "Rename files based on date, content, or metadata"
    - "Find and handle duplicate files across directories"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# File Organizer

## Overview

Organize, rename, and categorize files based on content analysis, metadata, and patterns. Handles messy directories by sorting files into logical folder structures, applying consistent naming conventions, and detecting duplicates. Works with any file type.

## Instructions

When a user asks to organize files, determine which operation they need:

### Task A: Sort files by type into folders

```bash
#!/bin/bash
# organize_by_type.sh - Sort files into folders by extension
SOURCE_DIR="${1:-.}"
DRY_RUN="${2:-false}"

declare -A TYPE_MAP=(
  # Documents
  ["pdf"]="Documents/PDF" ["docx"]="Documents/Word" ["doc"]="Documents/Word"
  ["xlsx"]="Documents/Excel" ["csv"]="Documents/CSV" ["txt"]="Documents/Text"
  # Images
  ["jpg"]="Images" ["jpeg"]="Images" ["png"]="Images"
  ["gif"]="Images" ["svg"]="Images" ["webp"]="Images"
  # Video
  ["mp4"]="Video" ["mkv"]="Video" ["avi"]="Video" ["mov"]="Video"
  # Audio
  ["mp3"]="Audio" ["wav"]="Audio" ["flac"]="Audio"
  # Code
  ["py"]="Code/Python" ["js"]="Code/JavaScript" ["ts"]="Code/TypeScript"
  # Archives
  ["zip"]="Archives" ["tar"]="Archives" ["gz"]="Archives" ["rar"]="Archives"
)

find "$SOURCE_DIR" -maxdepth 1 -type f | while read -r file; do
  ext="${file##*.}"
  ext="${ext,,}"  # lowercase
  dest="${TYPE_MAP[$ext]:-Other}"

  if [ "$DRY_RUN" = "true" ]; then
    echo "[DRY RUN] $file -> $SOURCE_DIR/$dest/"
  else
    mkdir -p "$SOURCE_DIR/$dest"
    mv "$file" "$SOURCE_DIR/$dest/"
    echo "Moved: $(basename "$file") -> $dest/"
  fi
done
```

### Task B: Smart rename based on patterns

```python
import os
import re
from pathlib import Path
from datetime import datetime

def rename_by_pattern(directory: str, pattern: str, dry_run: bool = True):
    """
    Rename files using pattern substitution.
    Patterns: {date}, {n}, {ext}, {name}, {YYYY}, {MM}, {DD}
    """
    files = sorted(Path(directory).iterdir())
    files = [f for f in files if f.is_file()]

    for i, filepath in enumerate(files, 1):
        stat = filepath.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime)

        new_name = pattern
        new_name = new_name.replace("{name}", filepath.stem)
        new_name = new_name.replace("{ext}", filepath.suffix)
        new_name = new_name.replace("{n}", str(i).zfill(3))
        new_name = new_name.replace("{date}", mtime.strftime("%Y-%m-%d"))
        new_name = new_name.replace("{YYYY}", str(mtime.year))
        new_name = new_name.replace("{MM}", str(mtime.month).zfill(2))
        new_name = new_name.replace("{DD}", str(mtime.day).zfill(2))

        new_path = filepath.parent / new_name
        if dry_run:
            print(f"  {filepath.name} -> {new_name}")
        else:
            filepath.rename(new_path)
            print(f"  Renamed: {filepath.name} -> {new_name}")

# Example: rename photos to date-based names
rename_by_pattern("./photos", "{date}_photo_{n}{ext}", dry_run=True)
```

### Task C: Content-based organization using file metadata

```python
import os
import shutil
from pathlib import Path
from datetime import datetime

def organize_by_date(directory: str, date_format: str = "%Y/%Y-%m"):
    """Sort files into year/year-month folders based on modification date."""
    for filepath in Path(directory).iterdir():
        if not filepath.is_file() or filepath.name.startswith('.'):
            continue
        mtime = datetime.fromtimestamp(filepath.stat().st_mtime)
        dest_dir = Path(directory) / mtime.strftime(date_format)
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(filepath), str(dest_dir / filepath.name))
        print(f"  {filepath.name} -> {dest_dir}/")

def organize_by_size(directory: str):
    """Sort files into small/medium/large folders."""
    size_buckets = [
        (1_000_000, "small_under_1MB"),
        (100_000_000, "medium_1MB_to_100MB"),
        (float('inf'), "large_over_100MB")
    ]
    for filepath in Path(directory).iterdir():
        if not filepath.is_file():
            continue
        size = filepath.stat().st_size
        for threshold, folder in size_buckets:
            if size < threshold:
                dest = Path(directory) / folder
                dest.mkdir(exist_ok=True)
                shutil.move(str(filepath), str(dest / filepath.name))
                break
```

### Task D: Find and handle duplicates

```python
import hashlib
from pathlib import Path
from collections import defaultdict

def find_duplicates(directory: str, recursive: bool = True) -> dict[str, list[Path]]:
    """Find duplicate files by content hash."""
    hash_map = defaultdict(list)
    glob_pattern = "**/*" if recursive else "*"

    for filepath in Path(directory).glob(glob_pattern):
        if not filepath.is_file():
            continue
        file_hash = hashlib.md5(filepath.read_bytes()).hexdigest()
        hash_map[file_hash].append(filepath)

    # Return only groups with duplicates
    return {h: paths for h, paths in hash_map.items() if len(paths) > 1}

def report_duplicates(directory: str):
    dupes = find_duplicates(directory)
    total_wasted = 0
    for file_hash, paths in dupes.items():
        size = paths[0].stat().st_size
        wasted = size * (len(paths) - 1)
        total_wasted += wasted
        print(f"\nDuplicate group ({len(paths)} copies, {size:,} bytes each):")
        for p in paths:
            print(f"  {p}")

    print(f"\nTotal duplicates: {sum(len(p)-1 for p in dupes.values())} files")
    print(f"Wasted space: {total_wasted / 1_000_000:.1f} MB")

report_duplicates("./documents")
```

## Examples

### Example 1: Clean up a messy Downloads folder

**User request:** "Organize my Downloads folder, it has 500+ mixed files"

```bash
# First, preview what will happen (dry run)
bash organize_by_type.sh ~/Downloads true

# If the preview looks good, run for real
bash organize_by_type.sh ~/Downloads false
```

Result: Files sorted into `Documents/`, `Images/`, `Video/`, `Audio/`, `Code/`, `Archives/`, and `Other/`.

### Example 2: Rename photos with date-based names

**User request:** "Rename all photos to YYYY-MM-DD format based on when they were taken"

```python
rename_by_pattern(
    "./vacation_photos",
    "{date}_IMG_{n}.jpg",
    dry_run=False
)
# Result: IMG_4521.jpg -> 2025-06-15_IMG_001.jpg
```

### Example 3: Find and report duplicate files

**User request:** "Find all duplicate files in my project and show how much space they waste"

```python
report_duplicates("/home/user/project")
# Output:
# Duplicate group (3 copies, 245,760 bytes each):
#   /home/user/project/assets/logo.png
#   /home/user/project/backup/logo.png
#   /home/user/project/old/logo.png
#
# Total duplicates: 47 files
# Wasted space: 123.4 MB
```

## Guidelines

- Always run with a dry-run or preview mode first before moving or renaming files.
- Never delete files automatically. Move duplicates to a `_duplicates/` staging folder for user review.
- Preserve original file timestamps when moving files with `shutil.move` or `mv -p`.
- Skip hidden files and system files (starting with `.`) by default.
- Handle filename collisions by appending a counter: `file.txt`, `file_1.txt`, `file_2.txt`.
- For large directories (10,000+ files), process in batches and show progress.
- Log all operations to a file so they can be reviewed or undone.
- Use content hashing (MD5 or SHA256) for duplicate detection, not just filename matching.
