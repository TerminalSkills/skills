---
name: table-extractor
description: >-
  Extract tables from PDFs with high accuracy using camelot. Handles complex
  table structures including merged cells, multi-line rows, and spanning
  headers. Use when a user asks to extract a table from a PDF, pull tabular
  data from a document, convert PDF tables to CSV or Excel, or parse
  structured tables from reports.
license: Apache-2.0
compatibility: "Requires Python 3.10+ and camelot-py 1.0 or newer (2.0.0 current). Ghostscript is optional since 1.0; pdfium is the default backend. Text-based PDFs only; scans need OCR first."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/camelot-dev/camelot
  category: data-ai
  tags: ["table-extraction", "pdf", "camelot", "csv", "spreadsheet"]
  use-cases:
    - "Extract complex tables from PDF reports into CSV or Excel"
    - "Batch extract all tables from a multi-page PDF document"
    - "Convert financial statements or data tables from PDF to structured data"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Table Extractor

## Overview

Extract tables from PDF documents using camelot-py (2.0). Camelot offers lattice (ruled tables), stream and network (whitespace-based), and hybrid parsers, plus an optional neural `ml` flavor for borderless tables, and handles multi-line rows and spanning headers with some post-processing. Outputs clean DataFrames that can be exported to CSV, Excel, or JSON.

## Instructions

When a user asks you to extract tables from a PDF, follow this process:

### Step 1: Install and verify dependencies

```bash
pip install camelot-py pandas
python -c "import camelot; print(camelot.__version__)"
```

Since Camelot 1.0 Ghostscript is no longer required: pages are rasterized with pdfium, which installs with pip. Install the `ghostscript` extra (plus the Ghostscript system package) only if you want that backend. If `import cv2` fails and the environment also has the full `opencv-python`, uninstall `opencv-python`; Camelot needs `opencv-python-headless`. Camelot reads text-based PDFs only; for scans, run `ocrmypdf` first (or install the `ocr`/`ml` extras and use `flavor="ml"`).

If Camelot cannot be installed, fall back to pdfplumber:

```bash
pip install pdfplumber pandas
```

### Step 2: Inspect the PDF to locate tables

```python
import camelot

# Quick scan: how many tables are in the document?
tables = camelot.read_pdf("document.pdf", pages="all", flavor="lattice")
print(f"Found {len(tables)} tables using lattice detection")

# If no tables found, try stream detection (for borderless tables).
# flavor="auto" lets Camelot probe the first page and pick lattice or network.
if len(tables) == 0:
    tables = camelot.read_pdf("document.pdf", pages="all", flavor="stream")
    print(f"Found {len(tables)} tables using stream detection")

# Summary of each table
for i, table in enumerate(tables):
    print(f"\nTable {i}: {table.shape[0]} rows x {table.shape[1]} cols (page {table.page})")
    print(f"Accuracy: {table.accuracy:.1f}%  whitespace: {table.whitespace:.1f}%")
    print(table.parsing_report)   # also holds a 0-1 "confidence" score
    print(table.df.head(3))
```

### Step 3: Choose the right extraction flavor

**Lattice flavor** (for tables with visible borders/gridlines):

```python
tables = camelot.read_pdf(
    "document.pdf",
    pages="1,2,3",        # Specific pages
    flavor="lattice",
    line_scale=40,         # Adjust line detection sensitivity
    process_background=True # Detect lines on colored backgrounds
)
```

**Stream flavor** (for borderless tables, whitespace-separated). `flavor="network"` and `flavor="hybrid"` are alternative text-alignment parsers worth trying when stream splits columns badly:

```python
tables = camelot.read_pdf(
    "document.pdf",
    pages="1",
    flavor="stream",
    edge_tol=50,          # Tolerance for edge detection
    row_tol=10,           # Tolerance for grouping text into rows
    columns=["72,200,350,500"]  # Manual column boundaries if auto-detect fails
)
```

### Step 4: Clean and process extracted tables

```python
import pandas as pd

for i, table in enumerate(tables):
    df = table.df

    # Promote first row to header if it contains column names
    if df.iloc[0].str.match(r'^[A-Za-z]').all():
        df.columns = df.iloc[0]
        df = df[1:].reset_index(drop=True)

    # Clean whitespace and newlines within cells
    df = df.apply(lambda col: col.str.strip().str.replace(r'\n', ' ', regex=True))

    # Remove completely empty rows
    df = df.dropna(how='all').replace('', pd.NA).dropna(how='all')

    # Convert numeric columns
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col].str.replace(',', '').str.replace('$', ''))
        except (ValueError, AttributeError):
            pass  # Keep as string

    print(f"\nCleaned Table {i}:")
    print(df.head())
```

### Step 5: Handle complex table structures

**Merged cells and spanning headers:**

```python
# Forward-fill merged cells (common in row headers)
df.iloc[:, 0] = df.iloc[:, 0].replace('', pd.NA).ffill()

# Handle multi-level column headers
if df.iloc[0:2].apply(lambda x: x.str.len().mean()).mean() < 20:
    # Combine first two rows as multi-level header
    new_cols = df.iloc[0] + " - " + df.iloc[1]
    df.columns = new_cols.str.strip(" - ")
    df = df[2:].reset_index(drop=True)
```

**Tables spanning multiple pages:**

```python
# Extract from all pages and concatenate
all_tables = camelot.read_pdf("document.pdf", pages="all", flavor="lattice")

# Group tables that are continuations (same column count)
groups = {}
for t in all_tables:
    key = t.shape[1]
    groups.setdefault(key, []).append(t.df)

for col_count, dfs in groups.items():
    combined = pd.concat(dfs, ignore_index=True)
    # Remove duplicate header rows that appear at page breaks
    combined = combined[~combined.duplicated(keep='first')]
```

### Step 6: Export the results

```python
# CSV (one file per table)
for i, table in enumerate(tables):
    table.df.to_csv(f"table_{i+1}.csv", index=False)

# Excel (all tables as separate sheets)
with pd.ExcelWriter("extracted_tables.xlsx") as writer:
    for i, table in enumerate(tables):
        table.df.to_excel(writer, sheet_name=f"Table_{i+1}", index=False)

# JSON
for i, table in enumerate(tables):
    table.df.to_json(f"table_{i+1}.json", orient="records", indent=2)

print(f"Exported {len(tables)} tables")
```

## Examples

### Example 1: Extract financial tables from an annual report

**User request:** "Extract all tables from this annual report PDF"

**Actions:**

1. Scan all pages with lattice flavor (financial reports typically have bordered tables)
2. Identify income statement, balance sheet, and cash flow tables by column headers
3. Clean numeric values (remove $, commas, parentheses for negatives)
4. Export each table to a separate CSV and combine into one Excel workbook

**Output:** "Extracted 7 tables across 42 pages. Exported to extracted_tables.xlsx with sheets: Income_Statement, Balance_Sheet, Cash_Flow, Revenue_Breakdown, Expenses, Quarterly_Summary, KPIs."

### Example 2: Extract a specific table from a research paper

**User request:** "Get the results table from page 8 of this paper"

**Actions:**

1. Target page 8 specifically: `camelot.read_pdf("paper.pdf", pages="8")`
2. If multiple tables on the page, show summaries and let the user pick
3. Clean the extracted table and handle any multi-line cells
4. Export as CSV

**Output:** A single CSV file with the results table, plus a preview of the first few rows printed to the console.

### Example 3: Batch process multiple PDFs

**User request:** "Extract the summary table from each of these 20 monthly reports"

**Actions:**

```python
import glob

results = []
for pdf_path in sorted(glob.glob("reports/*.pdf")):
    tables = camelot.read_pdf(pdf_path, pages="1", flavor="lattice")
    if tables:
        df = tables[0].df  # First table on first page
        df["source_file"] = pdf_path
        results.append(df)

combined = pd.concat(results, ignore_index=True)
combined.to_csv("all_summaries.csv", index=False)
```

**Output:** A single CSV combining the summary table from all 20 reports with a source_file column for traceability.

## Guidelines

- Lattice is the default; use it for bordered tables. Fall back to `stream`, `network` or `hybrid` for borderless tables, or `auto` to let Camelot choose.
- Check `accuracy`, `whitespace` and `confidence` in each table's `parsing_report`. Accuracy below about 80% or high whitespace usually means the wrong flavor or settings; review manually.
- For scanned PDFs, run OCR first (e.g., `ocrmypdf`) before table extraction; Camelot cannot read image-only pages with the lattice or stream flavors.
- When camelot struggles, try pdfplumber as an alternative: `page.extract_table(table_settings={...})`.
- Clean numeric data aggressively: remove currency symbols, commas, and handle parenthesized negatives.
- For tables with merged cells, use forward-fill on the appropriate columns.
- When extracting from multiple pages, watch for repeated header rows at page breaks.
- Always preview the extracted data before exporting to catch alignment or parsing issues.
- Report extraction quality metrics (accuracy, row/column count) so the user can verify correctness.
