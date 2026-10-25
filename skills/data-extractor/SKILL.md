---
name: data-extractor
description: >-
  Extract structured data from any document format using unified document
  processing. Use when a user asks to extract data from a document, parse
  a PDF, pull structured data from files, convert documents to JSON or CSV,
  extract fields from invoices or forms, or scrape data from documents.
license: Apache-2.0
compatibility: "Requires Python 3.9+ with pdfplumber, python-docx, beautifulsoup4; Tesseract for OCR"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "data-extraction, document-parsing, pdf, structured-data, etl"
  use-cases: "Extract structured fields from invoices, receipts, or forms, Convert unstructured documents into JSON or CSV format, Parse and extract data from PDFs, DOCX, HTML, or text files"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Data Extractor

## Overview

Extract structured data from documents in any format: PDF, DOCX, HTML, TXT, images, and more, using plain Python libraries (pdfplumber, PyMuPDF, python-docx, BeautifulSoup, Tesseract OCR). Converts unstructured or semi-structured content into clean JSON, CSV, or other structured formats. Handles invoices, forms, reports, and free-text documents.

## Instructions

When a user asks you to extract data from a document, follow this process:

### Step 1: Identify the document format and install dependencies

```bash
# Determine file type
file document.pdf

# Install dependencies based on format
pip install pdfplumber python-docx beautifulsoup4 lxml openpyxl pymupdf
```

Library selection by format:
- **PDF:** `pdfplumber` (text + tables), `PyMuPDF` (`import pymupdf`, older code uses `import fitz`) for complex layouts and speed
- **DOCX:** `python-docx`
- **HTML:** `beautifulsoup4` with `lxml`
- **Excel:** `openpyxl` or `pandas`
- **Images / scans:** `pytesseract` with `Pillow`; it only wraps the Tesseract program, which must be installed separately (`apt install tesseract-ocr`, `brew install tesseract`)
- **JSON/XML:** Python standard library

### Step 2: Extract raw content

**PDF extraction:**

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        print(f"--- Page {i+1} ---")
        print(text)

        # Extract tables if present
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                print(row)
```

**DOCX extraction:**

```python
from docx import Document

doc = Document("document.docx")
for para in doc.paragraphs:  # body paragraphs only; tables are not included here
    print(f"[{para.style.name}] {para.text}")

# Extract tables (merged cells come back repeated)
for table in doc.tables:
    for row in table.rows:
        print([cell.text for cell in row.cells])
```

**HTML extraction:**

```python
from bs4 import BeautifulSoup

with open("document.html", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "lxml")

# Extract specific elements
for table in soup.find_all("table"):
    rows = table.find_all("tr")
    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
        print(cells)
```

### Step 3: Parse and structure the data

Once you have raw text, extract the target fields:

**Pattern-based extraction:**

```python
import re
import json

text = "..."  # extracted text

# Define patterns for common fields
patterns = {
    "invoice_number": r"Invoice\s*#?\s*:?\s*(\w+[-/]?\w+)",
    "date": r"Date\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    "total": r"(?<![A-Za-z])Total\s*(?:due)?\s*:?\s*\$?([\d,]+\.?\d*)",  # skips "Subtotal"
    "email": r"[\w.-]+@[\w.-]+\.\w+",
}

extracted = {}
for field, pattern in patterns.items():
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        extracted[field] = match.group(1) if match.lastindex else match.group(0)

print(json.dumps(extracted, indent=2))
```

**Line-item extraction from tables:**

```python
import pandas as pd

# From a list of table rows
headers = table_data[0]
rows = table_data[1:]
df = pd.DataFrame(rows, columns=headers)

# Clean up
df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
df = df.dropna(how="all")
```

### Step 4: Validate and clean the output

```python
# Type conversion
extracted["total"] = float(extracted["total"].replace(",", ""))

# Date normalization
from datetime import datetime
extracted["date"] = datetime.strptime(extracted["date"], "%m/%d/%Y").isoformat()

# Validate required fields
required = ["invoice_number", "date", "total"]
missing = [f for f in required if f not in extracted]
if missing:
    print(f"Warning: missing fields: {missing}")
```

### Step 5: Output in the desired format

```python
# JSON output
with open("extracted_data.json", "w") as f:
    json.dump(extracted, f, indent=2)

# CSV output
df.to_csv("extracted_items.csv", index=False)

# Pretty print summary
print(f"Extracted {len(extracted)} fields from document")
print(f"Line items: {len(df)} rows")
```

## Examples

### Example 1: Extract invoice data from a PDF

**User request:** "Extract the invoice details from this PDF"

**Actions:**

1. Open the PDF with pdfplumber and extract text
2. Use regex patterns to find invoice number, date, vendor, subtotal, tax, total
3. Extract the line items table into a DataFrame
4. Output a JSON file with header fields and a CSV with line items

**Output:**

```json
{
  "invoice_number": "INV-2025-0042",
  "date": "2025-03-15",
  "vendor": "Northwind Traders",
  "subtotal": 1250.00,
  "tax": 100.00,
  "total": 1350.00,
  "line_items": [
    {"description": "Steel bracket, 40 mm", "qty": 10, "unit_price": 75.00, "amount": 750.00},
    {"description": "Mounting plate", "qty": 5, "unit_price": 100.00, "amount": 500.00}
  ]
}
```

### Example 2: Extract contacts from a DOCX directory

**User request:** "Pull all names and email addresses from this company directory document"

**Actions:**

1. Parse the DOCX file, iterate through paragraphs and tables
2. Use regex to find email addresses and associated names
3. Deduplicate and output as CSV

**Output:** A CSV file with columns: name, email, department, phone.

### Example 3: Convert an HTML report to structured data

**User request:** "Extract the quarterly results table from this HTML page"

**Actions:**

1. Parse the HTML with BeautifulSoup
2. Find the target table by heading or class
3. Extract headers and rows into a DataFrame
4. Clean column names and convert numeric values
5. Export as CSV and provide summary statistics

**Output:** A clean CSV with quarterly metrics and a summary of key figures.

## Guidelines

- Always inspect the raw extracted text before writing parsers. Understanding the layout saves time.
- Use pdfplumber for most PDF extraction. Fall back to PyMuPDF for complex multi-column layouts. If `extract_text()` returns `None` or empty strings the PDF is a scan: OCR it.
- `page.extract_tables()` finds ruled tables by default; for borderless tables pass `table_settings={"vertical_strategy": "text", "horizontal_strategy": "text"}` and check the rows.
- Do not parse untrusted documents with the same privileges as your credentials, and never `eval` or execute content found in them.
- For scanned PDFs (image-based), use OCR with pytesseract before parsing.
- Validate extracted data types: convert strings to numbers, normalize dates.
- Report extraction confidence: note any fields that could not be found or seem incorrect.
- Handle multi-page documents by accumulating results across pages.
- For batch extraction (many documents of the same type), build a reusable extraction function and apply it across all files.
- Always preserve the original document alongside extracted data for verification.
- When patterns fail, fall back to positional extraction based on text layout.
