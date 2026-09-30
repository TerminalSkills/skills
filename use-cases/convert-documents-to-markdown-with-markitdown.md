---
title: Convert a Document Archive to Searchable Markdown with MarkItDown
slug: convert-documents-to-markdown-with-markitdown
description: Turn a mixed folder of PDF, Word, Excel and PowerPoint files into clean Markdown with a full-text index, for teams feeding documents to an LLM.
skills:
  - markitdown
  - uv
  - sqlite
category: documents
tags:
  - markitdown
  - document-conversion
  - markdown
  - rag-ingestion
  - full-text-search
---

## The Problem

Priya Raman runs operations at Fernhill Studio, a 22-person architecture practice. Six years of project knowledge sits in `project-archive/`: 340 files, a mix of PDF reports, Word contracts, Excel cost plans and PowerPoint planning decks. When a new project starts, someone spends half a day opening files one by one to find how a similar fire strategy or drainage condition was handled last time.

Priya wants the archive readable by the studio's internal assistant. The assistant accepts Markdown, not binary files, and the studio has no budget for a document-processing platform. Copying text out by hand takes about four minutes per file, close to 23 hours for the archive, and the tables in the cost plans come out scrambled.

## The Solution

Use **markitdown** to convert every file to Markdown locally, **uv** to run the tool and the scripts without touching the system Python, and **sqlite** to build a full-text index over the result.

```bash
npx terminal-skills install markitdown uv sqlite
```

## Step-by-Step Walkthrough

### 1. Install MarkItDown and test one file

```text
Install MarkItDown and show me what our Harbour Street fire strategy PDF looks like as Markdown.
```

The agent installs the command-line tool in its own environment and converts a single file first, so quality problems show up before the batch run:

```bash
uv tool install 'markitdown[all]'
markitdown project-archive/2026/harbour-street/fire-strategy-rev-c.pdf -o fire-strategy-rev-c.md
markitdown project-archive/2026/harbour-street/cost-plan-stage-3.xlsx
```

The spreadsheet arrives as one heading per sheet with a Markdown table underneath, which is exactly what the assistant needs.

### 2. Convert the whole archive

```text
Convert everything under project-archive/ to Markdown. Keep the folder structure and give me a report of what worked.
```

The agent writes `convert_archive.py`. The comment block at the top lets uv install MarkItDown for this script only:

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["markitdown[all]"]
# ///
import csv
from pathlib import Path

from markitdown import FileConversionException, MarkItDown, UnsupportedFormatException

SOURCE, TARGET = Path("project-archive"), Path("archive-md")
WANTED = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".msg", ".html", ".csv"}

md = MarkItDown(enable_plugins=False)
rows = []
for path in sorted(SOURCE.rglob("*")):
    if not path.is_file() or path.suffix.lower() not in WANTED:
        continue
    try:
        text = md.convert_local(path).markdown.strip()
    except (FileConversionException, UnsupportedFormatException) as exc:
        rows.append([str(path), "failed", 0, type(exc).__name__])
        continue
    out = TARGET / path.relative_to(SOURCE).with_suffix(".md")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text + "\n", encoding="utf-8")
    rows.append([str(path), "empty" if len(text) < 50 else "ok", len(text), str(out)])

with open("conversion-report.csv", "w", newline="", encoding="utf-8") as fh:
    csv.writer(fh).writerows([["source", "status", "chars", "detail"], *rows])

for status in ("ok", "empty", "failed"):
    print(status, sum(1 for r in rows if r[1] == status))
```

```bash
uv run convert_archive.py
```

```text
ok 318
empty 19
failed 3
```

`convert_local()` is used instead of `convert()` because the script should only ever read local files. `conversion-report.csv` lists each source file with its status.

### 3. Recover the scanned files

```text
19 files came out empty. They are scanned surveys. Can you get the text out of those?
```

MarkItDown does not OCR on its own, so scans convert to an empty string without an error. The agent enables the `markitdown-ocr` plugin, which sends page images to a vision model. The OpenAI client reads its key from the environment.

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["markitdown[all]", "markitdown-ocr", "openai"]
# ///
import csv
from pathlib import Path

from markitdown import MarkItDown
from openai import OpenAI

md = MarkItDown(enable_plugins=True, llm_client=OpenAI(max_retries=5), llm_model="gpt-4o")

with open("conversion-report.csv", encoding="utf-8") as fh:
    scans = [row for row in csv.DictReader(fh) if row["status"] == "empty"]

for row in scans:
    text = md.convert_local(row["source"]).markdown.strip()
    Path(row["detail"]).write_text(text + "\n", encoding="utf-8")
    print(f"{row['source']}: {len(text)} chars")
```

```bash
uv run ocr_scans.py
```

Priya approves this step first: the scans leave the building, and each page is a paid model call.

### 4. Build a full-text index

```text
Put the Markdown into something I can search from the terminal.
```

```python
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

with closing(sqlite3.connect("archive.db")) as conn:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("DROP TABLE IF EXISTS docs")
    conn.execute("CREATE VIRTUAL TABLE docs USING fts5(path, body)")
    files = sorted(Path("archive-md").rglob("*.md"))
    conn.executemany(
        "INSERT INTO docs (path, body) VALUES (?, ?)",
        [(str(f), f.read_text(encoding="utf-8")) for f in files],
    )
    conn.commit()
    print(f"indexed {len(files)} documents")
    hits = conn.execute(
        "SELECT path, snippet(docs, 1, '[', ']', ' ... ', 10) FROM docs "
        "WHERE docs MATCH ? ORDER BY rank LIMIT 5",
        (sys.argv[1],),
    )
    for path, snippet in hits:
        print(f"{path}: {snippet}")
```

```bash
uv run --no-project build_index.py '"smoke ventilation"'
```

```text
indexed 337 documents
archive-md/2026/harbour-street/fire-strategy-rev-c.md:  ... stair core relies on natural [smoke ventilation] via a 1.0 m2 vent ...
archive-md/2024/quay-works/fire-strategy-rev-a.md:  ... mechanical [smoke ventilation] to the basement car park ...
```

## Real-World Example

Priya ran the four steps on a Tuesday afternoon. Of 340 files, 318 converted on the first pass. The 19 scanned surveys went through the OCR plugin after she approved the cost. Three files failed with `FileConversionException`: password-protected fee proposals. She exported unlocked copies and converted them the next morning.

The result is `archive-md/`, 340 Markdown files that mirror the original folders, and `archive.db`, a single 41 MB file the assistant queries. The manual route would have taken about 23 hours of copying. The scripted one took an afternoon, most of it spent checking the report. The first real question, how smoke ventilation was handled on earlier residential schemes, returned two precedents in under a second.

## Related Skills

- [markitdown](/skills/markitdown) — converts each PDF, Word, Excel and PowerPoint file to Markdown and runs the OCR plugin on scans
- [uv](/skills/uv) — installs the MarkItDown command and runs the scripts with their dependencies declared inline
- [sqlite](/skills/sqlite) — stores the Markdown in an FTS5 table for ranked full-text search
