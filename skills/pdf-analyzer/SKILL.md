---
name: pdf-analyzer
description: >-
  Extract text, tables, metadata, and structured data from PDF files. Use when
  a user asks to read a PDF, parse a PDF, extract data from a PDF, summarize a
  PDF document, pull tables from a PDF, or convert PDF content to structured
  formats like JSON or CSV. Handles single and multi-page documents, flags
  scanned PDFs for OCR, and reads borderless and password-protected PDFs.
license: Apache-2.0
compatibility: "Python 3.10+; pip install pdfplumber (required) and pymupdf (optional, fallback and speed); OCR needs the Tesseract binary plus pytesseract"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  tags: "pdf, document, extraction, tables, parsing"
---

# PDF Analyzer

## Overview

Extract text, tables, and structured data from PDF files and convert them into usable formats. This skill handles text extraction, table detection, metadata reading, and output formatting for single or multi-page PDFs.

## Instructions

When a user asks you to analyze, read, parse, or extract data from a PDF file, follow these steps:

### Step 1: Identify the PDF and goal

Determine the file path and what the user wants extracted:
- **Full text**: All readable text from every page
- **Tables**: Structured tabular data
- **Metadata**: Title, author, creation date, page count
- **Specific sections**: Targeted content from certain pages
- **Summary**: A condensed version of the document contents

### Step 2: Choose the extraction method

Write a Python script using pdfplumber (prefer it for tables) or PyMuPDF (`import pymupdf`; the old `fitz` name is deprecated and only warns). Pass `password=` for encrypted files; pdfplumber raises an empty `PdfminerException` otherwise.

**For text extraction:**

```python
import pdfplumber

def extract_text(pdf_path, password=None):
    text_by_page = []
    with pdfplumber.open(pdf_path, password=password) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                text_by_page.append({"page": i + 1, "text": text.strip()})
    return text_by_page
```

**For table extraction:**

```python
import pdfplumber
import csv

# Default "lines" strategy needs ruling lines. For borderless tables
# pass the "text" strategy. It returns empty spacer rows (filtered below) and can
# take a title line above the table as the first row, so check the headers.
TEXT_STRATEGY = {"vertical_strategy": "text", "horizontal_strategy": "text"}

def extract_tables(pdf_path, output_csv=None, password=None, text_strategy=False):
    all_tables = []
    settings = TEXT_STRATEGY if text_strategy else None
    with pdfplumber.open(pdf_path, password=password) as pdf:
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables(settings) if settings else page.extract_tables()
            for table in tables:
                headers = table[0]
                rows = [r for r in table[1:] if any(c for c in r)]
                all_tables.append({
                    "page": i + 1,
                    "headers": headers,
                    "rows": rows
                })
    if output_csv and all_tables:
        with open(output_csv, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(all_tables[0]["headers"])
            for table in all_tables:
                writer.writerows(table["rows"])
    return all_tables
```

**For metadata:**

```python
import pdfplumber

def extract_metadata(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        return {
            "pages": len(pdf.pages),
            "metadata": pdf.metadata
        }
```

### Step 3: Run the script and format output

Execute the script, then present results in the format the user needs (plain text, JSON, CSV, markdown table, or summary).

### Step 4: Handle errors gracefully

If extraction fails or comes back empty, check these cases in order:
1. **Encrypted:** `pdfplumber.open` raises `PdfminerException` with no message. Ask the user for the password and retry with `password=...`. Never guess passwords.
2. **Scanned:** a page whose `extract_text()` returns nothing but whose `page.images` is non-empty needs OCR. Tesseract is a system binary, so `pip install pytesseract` alone is not enough. OCR with PyMuPDF, which needs the Tesseract binary and language data:
   ```python
   import pymupdf
   doc = pymupdf.open(pdf_path)
   page = doc[0]  # keep the page in a variable: the text page holds a weak reference to it
   tp = page.get_textpage_ocr(language="eng", dpi=300, full=True)
   text = page.get_text(textpage=tp)
   ```
3. **Borderless tables:** the default pdfplumber strategy returns no tables. Retry with `text_strategy=True`.
4. **Broken parser:** switch from pdfplumber to PyMuPDF (`import pymupdf`), then report which library produced the output.

## Examples

### Example 1: Extract all tables from an invoice PDF

**User request:** "Pull the line items table from invoice.pdf and save as CSV"

**Actions taken:**
1. Open `invoice.pdf` with pdfplumber
2. Detect tables on each page
3. Extract headers and rows
4. Write to `invoice_items.csv`

**Output:**
```
Found 1 table on page 1 with 5 columns: Item, Quantity, Unit Price, Tax, Total
Extracted 12 rows. Saved to invoice_items.csv.

Preview:
| Item            | Quantity | Unit Price | Tax   | Total   |
|-----------------|----------|------------|-------|---------|
| Widget A        | 100      | $2.50      | $25.00| $275.00 |
| Widget B        | 50       | $4.00      | $20.00| $220.00 |
```

### Example 2: Summarize a research paper

**User request:** "Summarize the key findings from paper.pdf"

**Actions taken:**
1. Extract full text from all pages
2. Identify abstract, introduction, results, and conclusion sections
3. Produce a structured summary

**Output:**
```
Document: paper.pdf (14 pages)

Title: Effects of Sleep Duration on Cognitive Performance
Authors: Smith et al., 2024

Key Findings:
- Participants sleeping < 6 hours showed 23% slower reaction times
- Optimal cognitive performance observed at 7-8 hours of sleep
- No significant benefit observed beyond 9 hours

Methods: Randomized controlled trial, n=240, over 12 weeks
Conclusion: 7-8 hours of sleep optimizes cognitive performance in adults
```

## Guidelines

- Always check if the PDF is readable before attempting extraction. Some PDFs are image-only and require OCR.
- For large PDFs (100+ pages), process in batches and show progress.
- When extracting tables, validate that column counts are consistent across rows. Merged cells often cause misalignment.
- Preserve the original page numbers in output so the user can cross-reference.
- If a PDF has both text and scanned pages, extract text where available and flag scanned pages for OCR.
- Never assume table headers. Always use the first row unless the user specifies otherwise.
- For multi-column layouts (academic papers), extract text in reading order, not left-to-right across columns.
- PDFs often hold personal or financial data. Process them locally with the libraries above; do not upload the file to an online converter or OCR service without the user's explicit consent.
- Do not write extracted text or passwords into shared locations or logs. Write outputs next to the source file or where the user asks.
