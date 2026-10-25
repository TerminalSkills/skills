---
name: pdf-merge-split
description: >-
  Combine multiple PDFs into one or split a PDF into separate files. Use when a
  user asks to merge PDFs, combine PDF files, join documents together, split a
  PDF into pages, extract pages from a PDF, or separate a PDF into parts.
  Supports page range selection and custom ordering.
license: Apache-2.0
compatibility: "Requires Python 3.9+ with pypdf (pip install pypdf); pikepdf optional"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  repository: https://github.com/py-pdf/pypdf
  tags: "pdf, merge, split, combine, pages"
  use-cases: "Merge multiple report PDFs into a single document for distribution, Split a large PDF into individual chapters or page ranges, Extract specific pages from a PDF to create a new document"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# PDF Merge & Split

## Overview

Combine multiple PDF files into a single document or split a PDF into separate files by page ranges. This skill handles merging in a specified order, splitting by page numbers, extracting specific pages, and adding bookmarks per merged file, and dealing with encrypted input. It uses `pypdf`, the maintained successor of PyPDF2 (PyPDF2 is no longer developed and its `PdfMerger` is gone from pypdf).

## Instructions

When a user asks to merge or split PDF files, follow these steps:

### Step 1: Determine the operation

Ask or infer what the user needs:
- **Merge**: Combine multiple PDFs into one output file
- **Split by pages**: Break a single PDF into multiple files by page ranges
- **Extract pages**: Pull specific pages out into a new PDF
- **Split by size**: Divide a PDF into chunks of N pages each

### Step 2: Validate the input files

Check that all input files exist and are valid PDFs:

```python
import os
from pypdf import PdfReader

def validate_pdfs(file_paths):
    results = []
    for path in file_paths:
        if not os.path.exists(path):
            results.append({"file": path, "status": "not found"})
            continue
        try:
            reader = PdfReader(path)
            results.append({
                "file": path,
                "status": "valid",
                "pages": len(reader.pages)
            })
        except Exception as e:
            results.append({"file": path, "status": f"invalid: {e}"})
    return results
```

### Step 3: Perform the operation

**For merging:**

```python
from pypdf import PdfWriter

def merge_pdfs(input_paths, output_path):
    writer = PdfWriter()
    for path in input_paths:
        # outline_item adds a bookmark named after the file
        writer.append(path, outline_item=os.path.splitext(os.path.basename(path))[0])
    writer.write(output_path)
    writer.close()
    return output_path
```

`writer.append(path, pages=(0, 3))` takes only pages 1-3 (0-based, end exclusive) and `pages=[0, 4, 8]` takes those pages. A merged document keeps the pages' content and links, but form fields with the same name across files can clash.

**For splitting by page ranges:**

```python
from pypdf import PdfReader, PdfWriter

def split_pdf(input_path, ranges, output_dir="."):
    reader = PdfReader(input_path)
    output_files = []
    for i, (start, end) in enumerate(ranges):
        writer = PdfWriter()
        for page_num in range(start - 1, min(end, len(reader.pages))):
            writer.add_page(reader.pages[page_num])
        output_path = os.path.join(output_dir, f"split_{i+1}_pages_{start}-{end}.pdf")
        with open(output_path, "wb") as f:
            writer.write(f)
        output_files.append(output_path)
    return output_files
```

**For extracting specific pages:**

```python
def extract_pages(input_path, page_numbers, output_path):
    reader = PdfReader(input_path)
    writer = PdfWriter()
    for page_num in page_numbers:
        if 1 <= page_num <= len(reader.pages):
            writer.add_page(reader.pages[page_num - 1])
    with open(output_path, "wb") as f:
        writer.write(f)
    return output_path
```

### Step 4: Verify and report results

After the operation, verify the output:
1. Confirm the output file exists and is a valid PDF
2. Report the page count of each output file
3. Show file sizes for the user

## Examples

### Example 1: Merge three reports into one

**User request:** "Combine report-q1.pdf, report-q2.pdf, and report-q3.pdf into annual-report.pdf"

**Actions taken:**
1. Validate all three input files
2. Merge in the specified order
3. Write to annual-report.pdf

**Output:**
```
Merged 3 PDF files into annual-report.pdf

Input files:
  1. report-q1.pdf (12 pages)
  2. report-q2.pdf (15 pages)
  3. report-q3.pdf (11 pages)

Output: annual-report.pdf (38 pages, 2.4 MB)
```

### Example 2: Split a PDF into chapters

**User request:** "Split textbook.pdf into separate files: pages 1-30, 31-55, 56-80"

**Actions taken:**
1. Validate textbook.pdf (80 pages)
2. Split into three page ranges
3. Save each range as a separate file

**Output:**
```
Split textbook.pdf into 3 files:

  1. split_1_pages_1-30.pdf   (30 pages, 1.1 MB)
  2. split_2_pages_31-55.pdf  (25 pages, 0.9 MB)
  3. split_3_pages_56-80.pdf  (25 pages, 0.8 MB)

All files saved to current directory.
```

### Example 3: Extract specific pages

**User request:** "Pull out pages 5, 12, and 18-22 from presentation.pdf"

**Actions taken:**
1. Parse the page specification: [5, 12, 18, 19, 20, 21, 22]
2. Extract those pages from presentation.pdf
3. Save as extracted_pages.pdf

**Output:**
```
Extracted 7 pages from presentation.pdf

Pages extracted: 5, 12, 18, 19, 20, 21, 22
Output: extracted_pages.pdf (7 pages, 540 KB)
```

## Guidelines

- Always validate input files before processing. Report clear errors for missing or corrupt files.
- Preserve the original files. Never modify input PDFs in place.
- When merging, respect the order specified by the user. If no order is given, use alphabetical.
- Use 1-based page numbering in all user-facing output to match what users see in PDF viewers.
- For encrypted PDFs, `len(reader.pages)` raises `FileNotDecryptedError` until `reader.decrypt(password)` succeeds. Ask the user for the password; never try to guess or crack one.
- When splitting, create descriptive filenames that include page ranges.
- Report file sizes alongside page counts so the user knows the output scale.
- Install with `pip install pypdf`. Do not use the abandoned `PyPDF2` package in new code. For damaged files or heavy rewriting, `pikepdf` (`pdf.pages.extend(src.pages)`) is a sturdier alternative.
- For a quick merge without Python, poppler-utils has `pdfunite a.pdf b.pdf out.pdf` and `pdfseparate -f 1 -l 3 in.pdf page-%d.pdf` (one file per page).
