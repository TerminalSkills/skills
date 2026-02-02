---
name: batch-processor
description: >-
  Process multiple documents in bulk with parallel execution. Use when a user
  asks to batch process files, convert many documents at once, run parallel
  file operations, bulk rename, bulk transform, or process a directory of
  files concurrently. Covers parallel execution, error handling, and progress
  tracking.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["batch", "parallel", "bulk", "processing", "automation"]
  use-cases:
    - "Convert hundreds of files between formats in parallel"
    - "Apply transformations to every file in a directory"
    - "Run bulk data extraction with progress tracking"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Batch Processor

## Overview

Process multiple documents and files in bulk using parallel execution. Handles large-scale file operations including format conversion, data extraction, transformation, and validation across hundreds or thousands of files with configurable concurrency, error recovery, and progress reporting.

## Instructions

When a user asks for batch processing, determine which approach fits their needs:

### Task A: Parallel file processing with shell tools

For simple transformations, use `xargs` or GNU `parallel`:

```bash
# Convert all PNG files to JPEG using ImageMagick (8 parallel jobs)
find ./images -name "*.png" | xargs -P 8 -I {} bash -c \
  'convert "$1" "${1%.png}.jpg"' _ {}

# Process files with GNU parallel and progress bar
find ./docs -name "*.csv" | parallel --bar --jobs 8 \
  'python transform.py {} {.}_processed.csv'

# Bulk compress PDFs (4 parallel jobs)
find ./reports -name "*.pdf" | xargs -P 4 -I {} bash -c \
  'gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook \
   -dNOPAUSE -dBATCH -sOutputFile="{}.compressed" "{}" && mv "{}.compressed" "{}"'
```

### Task B: Python batch processor with concurrency control

Create a reusable batch processing script:

```python
import asyncio
import os
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class BatchResult:
    total: int = 0
    success: int = 0
    failed: int = 0
    errors: list = field(default_factory=list)

async def process_file(filepath: Path, semaphore: asyncio.Semaphore) -> tuple[bool, str]:
    async with semaphore:
        try:
            # Replace with actual processing logic
            content = filepath.read_text()
            output = content.upper()  # Example transformation
            out_path = filepath.with_suffix('.processed' + filepath.suffix)
            out_path.write_text(output)
            return True, str(filepath)
        except Exception as e:
            return False, f"{filepath}: {e}"

async def batch_process(
    input_dir: str,
    pattern: str = "*.*",
    max_concurrent: int = 10
) -> BatchResult:
    semaphore = asyncio.Semaphore(max_concurrent)
    files = list(Path(input_dir).glob(pattern))
    result = BatchResult(total=len(files))

    tasks = [process_file(f, semaphore) for f in files]
    for coro in asyncio.as_completed(tasks):
        success, msg = await coro
        if success:
            result.success += 1
        else:
            result.failed += 1
            result.errors.append(msg)
        # Progress reporting
        done = result.success + result.failed
        print(f"\rProgress: {done}/{result.total}", end="", flush=True)

    print()  # Newline after progress
    return result

if __name__ == "__main__":
    result = asyncio.run(batch_process("./input", pattern="*.txt", max_concurrent=8))
    print(f"Done: {result.success} succeeded, {result.failed} failed")
    for err in result.errors:
        print(f"  ERROR: {err}")
```

### Task C: Batch processing with error recovery

For long-running jobs, track progress and allow resuming:

```python
import json
from pathlib import Path

PROGRESS_FILE = ".batch_progress.json"

def load_progress() -> set:
    if Path(PROGRESS_FILE).exists():
        return set(json.loads(Path(PROGRESS_FILE).read_text()))
    return set()

def save_progress(completed: set):
    Path(PROGRESS_FILE).write_text(json.dumps(list(completed)))

def batch_with_resume(input_dir: str, pattern: str = "*.*"):
    completed = load_progress()
    files = [f for f in Path(input_dir).glob(pattern) if str(f) not in completed]
    print(f"Resuming: {len(completed)} done, {len(files)} remaining")

    for i, filepath in enumerate(files):
        try:
            process_single_file(filepath)  # Your processing function
            completed.add(str(filepath))
            if i % 10 == 0:  # Checkpoint every 10 files
                save_progress(completed)
        except KeyboardInterrupt:
            save_progress(completed)
            print(f"\nSaved progress at {len(completed)} files")
            raise
        except Exception as e:
            print(f"Error on {filepath}: {e}")

    save_progress(completed)
    Path(PROGRESS_FILE).unlink()  # Clean up on completion
```

### Task D: Shell-based batch with logging

```bash
#!/bin/bash
INPUT_DIR="$1"
OUTPUT_DIR="$2"
LOG_FILE="batch_$(date +%Y%m%d_%H%M%S).log"
PARALLEL_JOBS=8
TOTAL=$(find "$INPUT_DIR" -type f | wc -l)
COUNT=0

mkdir -p "$OUTPUT_DIR"

process_file() {
    local file="$1"
    local outfile="$OUTPUT_DIR/$(basename "$file")"
    # Replace with your processing command
    cp "$file" "$outfile" 2>&1
    echo $?
}

export -f process_file
export OUTPUT_DIR

find "$INPUT_DIR" -type f | parallel --jobs "$PARALLEL_JOBS" --bar \
  --joblog "$LOG_FILE" process_file {}

echo "Results logged to $LOG_FILE"
awk 'NR>1 {if($7!=0) fail++; else ok++} END {print ok" succeeded, "fail" failed"}' "$LOG_FILE"
```

## Examples

### Example 1: Convert a directory of Markdown files to PDF

**User request:** "Convert all 200 Markdown files in docs/ to PDF"

```bash
# Install pandoc if needed
# Process in parallel with 6 workers
find ./docs -name "*.md" | parallel --bar --jobs 6 \
  'pandoc {} -o {.}.pdf --pdf-engine=xelatex'
echo "Conversion complete. Check for errors above."
```

### Example 2: Extract text from hundreds of images

**User request:** "OCR all scanned documents in the scans/ folder"

```bash
# Using tesseract with parallel processing
find ./scans -name "*.png" -o -name "*.jpg" | parallel --bar --jobs 4 \
  'tesseract {} {.} -l eng 2>/dev/null && echo "OK: {}"'
```

### Example 3: Bulk resize images for web

**User request:** "Resize all product images to 800px wide, keep aspect ratio"

```bash
mkdir -p ./resized
find ./products -name "*.jpg" | xargs -P 8 -I {} bash -c \
  'convert "$1" -resize 800x -quality 85 "./resized/$(basename $1)"' _ {}
echo "Resized $(ls ./resized | wc -l) images"
```

## Guidelines

- Always test batch operations on a small subset (5-10 files) before processing the full set.
- Set a reasonable concurrency limit. Start with CPU core count for CPU-bound tasks, or 2-4x for I/O-bound tasks.
- Implement progress reporting so users can monitor long-running jobs.
- Write errors to a log file rather than stopping the entire batch.
- Create a checkpoint/resume mechanism for batches over 100 files.
- Back up original files or write output to a separate directory; never overwrite in place without confirmation.
- Use `--dry-run` flags in scripts to preview operations before executing.
- Monitor system resources (RAM, disk space) during large batch operations.
