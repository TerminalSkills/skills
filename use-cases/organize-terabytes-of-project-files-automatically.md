---
title: "Organize Terabytes of Project Files Automatically"
slug: organize-terabytes-of-project-files-automatically
description: "Sort, rename, and structure thousands of disorganized project files across directories using rule-based automation and batch processing."
skills:
  - file-organizer
  - batch-processor
category: automation
tags:
  - file-management
  - organization
  - batch-processing
  - cleanup
---

# Organize Terabytes of Project Files Automatically

## The Problem

A video production company has about 2 TB of files, some 14,000 items, dumped into flat "Downloads" and "Projects" folders over two years. Camera footage sits next to client contracts, temporary exports next to final deliverables, and five versions of the same file are called things like "final_v2_REAL_final.mp4". Finding a client's raw footage means scrolling through thousands of files, and last week an editor sent a client the wrong project's footage because the names were so similar.

## The Solution

**file-organizer** supplies the classification, rename and duplicate-detection patterns (type and date rules, chunked SHA-256, refuse-to-overwrite moves), and **batch-processor** supplies the parallel, resumable way to run the slow parts (hashing and copying) across terabytes. The rule is the same throughout: plan first, read the plan, then move, and never delete.

## Step-by-Step Walkthrough

### 1. Scan and build a manifest (read-only)

> Scan /data/projects/ recursively and write /reports/file_manifest.csv with path, extension, size, modification time and a hash for every file whose size matches another file. Do not modify anything.

A quick overview before any rules, using only read operations:

```bash
find /data/projects -type f -printf '%s\t%f\n' | awk -F'\t' '
  { n=split($2,a,"."); e=(n>1)?tolower(a[n]):"(none)"; c[e]++; b[e]+=$1 }
  END { for (e in c) printf "%-8s %7d files %8.1f GB\n", e, c[e], b[e]/1e9 }' | sort -k4 -nr | head -15
```

Hashing is the slow step on a multi-terabyte tree because every duplicate candidate must be read in full. Hash only files whose size is shared with another file, and run it with batch-processor's parallel pattern if the disks can keep up (`find ... -print0 | xargs -0 -P 4 sha256sum`; a spinning disk gains little beyond 1-2 jobs). Expect hours, not minutes, on 2 TB of footage.

### 2. Write the rules and produce a plan, not moves

> Write organize.py: client = filename text before the first underscore, destination `/archive/{client}/{year}/{kind}/`, with kind `footage` (.mp4 .mov .mxf), `audio` (.wav .mp3 .aac), `projects` (.prproj .aep .blend) or `contracts` (.pdf .docx). Files without a client prefix or with an unknown type go to `_unsorted`. Exact duplicates (same size and SHA-256) go to `_duplicates`. The `plan` command writes plan.csv and moves nothing.

```python
#!/usr/bin/env python3
"""organize.py plan SRC ARCHIVE   -> writes plan.csv, moves nothing
organize.py apply plan.csv       -> performs the moves, writes moves.log (old,new)"""
import csv
import datetime
import hashlib
import shutil
import sys
from pathlib import Path

KINDS = {".mp4": "footage", ".mov": "footage", ".mxf": "footage", ".wav": "audio", ".mp3": "audio",
         ".aac": "audio", ".prproj": "projects", ".aep": "projects", ".blend": "projects",
         ".pdf": "contracts", ".docx": "contracts"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def free(dest: Path, taken: set) -> Path:
    n, cand = 1, dest
    while cand in taken or cand.exists():  # same name twice: add -2, -3, ... instead of skipping
        n += 1
        cand = dest.with_name(f"{dest.stem}-{n}{dest.suffix}")
    taken.add(cand)
    return cand


def plan(src: Path, archive: Path):
    seen: dict[tuple[int, str], Path] = {}
    taken: set[Path] = set()  # destinations already planned, so same-named files never collide
    rows = []
    files = [p for p in sorted(src.rglob("*")) if p.is_file() and not p.is_symlink()]
    sizes: dict[int, int] = {}
    for p in files:
        sizes[p.stat().st_size] = sizes.get(p.stat().st_size, 0) + 1
    for p in files:
        client, _, rest = p.stem.partition("_")
        kind = KINDS.get(p.suffix.lower())
        if not kind or not rest:
            rows.append((p, free(archive / "_unsorted" / p.name, taken), "move"))
            continue
        year = datetime.datetime.fromtimestamp(p.stat().st_mtime).year
        dest = archive / client / str(year) / kind / p.name
        size = p.stat().st_size
        key = (size, sha256(p) if sizes[size] > 1 else "")  # hash only files that share a size
        if key in seen:  # exact duplicate: quarantine, never delete
            rows.append((p, free(archive / "_duplicates" / p.name, taken), "duplicate-of " + str(seen[key])))
        else:
            seen[key] = p
            rows.append((p, free(dest, taken), "move"))
    with open("plan.csv", "w", newline="") as f:
        csv.writer(f).writerows([("src", "dst", "note")] + [(str(a), str(b), c) for a, b, c in rows])
    print(f"{len(rows)} files planned; review plan.csv. Nothing was moved.")


def apply(plan_csv: str):
    with open(plan_csv, newline="") as f, open("moves.log", "a", newline="") as log:
        w = csv.writer(log)
        for r in csv.DictReader(f):
            src, dst = Path(r["src"]), Path(r["dst"])
            if dst.exists() or not src.exists():  # never overwrite, never guess
                print("SKIP", src, "->", dst)
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            part = dst.with_name(dst.name + ".part")  # a cross-filesystem copy never leaves a half file at dst
            shutil.move(src, part)
            part.rename(dst)
            w.writerow([src, dst])


if __name__ == "__main__":
    if sys.argv[1] == "plan":
        plan(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        apply(sys.argv[2])
```

Tested on a small fixture tree: `plan` listed five files, wrote `plan.csv` and left every file in place; a duplicate was routed to `_duplicates`; two files with the same name got `-2` suffixes instead of colliding; a second `apply` skipped everything because the destinations existed.

### 3. Dry run: review the plan, then apply

```console
$ python3 organize.py plan /data/projects /archive
14012 files planned; review plan.csv. Nothing was moved.
$ grep -c ',duplicate-of ' plan.csv                              # exact duplicates headed for quarantine
$ grep _unsorted plan.csv | head -50                            # spot-check the misses
```

Review `plan.csv` with the editors (a spreadsheet works), fix the rules, and re-run `plan` until the unsorted list is acceptable. Only then run:

```console
$ python3 organize.py apply plan.csv
```

If `/archive` is on the same filesystem as the source, each move is an instant rename; across filesystems it is a full copy followed by a delete, which takes as long as the disks need, so run it under `tmux`. `apply` never overwrites, logs each `old,new` pair to `moves.log` (the undo map), and can simply be run again after an interruption: a copy interrupted midway leaves only a `.part` file, never a truncated file at the final name (delete stray `.part` files after an interruption).

### 4. Review duplicates, then reclaim space deliberately

Nothing is deleted by the script. After the editors have looked through `/archive/_duplicates` and `/archive/_unsorted`, remove duplicates yourself, listing before deleting:

```console
$ du -sh /archive/_duplicates
$ find /archive/_duplicates -type f | head -20
```

Hash equality only catches byte-identical files. A re-encoded video is a different file; compare duration and resolution (`ffprobe`) before treating it as a duplicate.

## Real-World Example

The production company ran the plan on a Saturday over a snapshot-backed copy. The plan showed roughly 1,800 exact duplicates and 2,300 files it could not classify; the editors fixed three client-name spellings in the rules, re-ran the plan, and approved it. The hashing pass took most of the weekend, while the moves, being on one filesystem, finished in minutes. Duplicates sat in quarantine for two weeks before the team deleted them and recovered several hundred gigabytes.

## Tips

- Always read the plan before `apply`; naming conventions are never as consistent as they look.
- Keep `plan.csv` and `moves.log` with the archive; they are the map back to the original layout.
- Take a backup or snapshot before the first real run.
- Run the plan monthly against a single inbox folder so the archive stays tidy.

## Related Skills

- **file-organizer** for classification, rename and duplicate patterns.
- **batch-processor** for parallel, resumable processing of large trees.
