---
name: chandra-ocr
description: >-
  Extract text from complex documents using Chandra OCR — handles tables, forms, handwriting,
  and full page layouts with high accuracy. Use when: extracting data from scanned documents,
  reading complex tables from PDFs/images, processing handwritten forms.
license: Apache-2.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags:
    - ocr
    - document-processing
    - tables
    - handwriting
    - data-extraction
---

# Chandra OCR

Extract text from complex documents — tables, forms, handwriting, and full page layouts — using [Chandra](https://github.com/datalab-to/chandra), a high-accuracy OCR engine built for real-world document complexity.

## Overview

Chandra OCR handles the document types that trip up standard OCR: multi-column tables with merged cells, mixed print and handwriting, and complex page layouts. It outputs structured data (DataFrames, JSON) and supports GPU acceleration for batch processing.

## Instructions

### Installation

```bash
pip install chandra-ocr
```

For GPU acceleration (recommended for batch processing):

```bash
pip install chandra-ocr[gpu]
```

### Basic Text Extraction

```python
from chandra import OCR

ocr = OCR()

result = ocr.read("document.png")
print(result.text)

# From a PDF
result = ocr.read("report.pdf")
for page in result.pages:
    print(f"--- Page {page.number} ---")
    print(page.text)
```

### Layout-Preserved Extraction

```python
result = ocr.read("document.png", preserve_layout=True)

for block in result.blocks:
    print(f"Type: {block.type}")  # paragraph, table, header, handwriting
    print(f"Text: {block.text}")
    print(f"Confidence: {block.confidence:.2f}")
```

### Table Extraction

```python
result = ocr.read("invoice.png", extract_tables=True)

for table in result.tables:
    print(f"Table: {table.rows} rows x {table.cols} columns")
    df = table.to_dataframe()
    print(df.head())
    table.to_csv("extracted_table.csv")
```

### Handwriting Recognition

```python
result = ocr.read("handwritten_form.jpg", mode="handwriting")

for block in result.blocks:
    if block.type == "handwriting":
        print(f"Handwritten: {block.text} (conf: {block.confidence:.2f})")
```

### Mixed Documents (Print + Handwriting)

```python
result = ocr.read("filled_form.png", mode="mixed")

for block in result.blocks:
    print(f"[{block.type}] {block.text} (conf: {block.confidence:.2f})")
```

### Batch Processing

```python
import glob
from chandra import OCR
import json

ocr = OCR(device="cuda")
files = glob.glob("documents/*.pdf")

for file_path in files:
    result = ocr.read(file_path, extract_tables=True)
    output = {
        "file": file_path,
        "pages": len(result.pages),
        "text": result.text,
        "tables": [t.to_dict() for t in result.tables],
    }
    with open(file_path.replace(".pdf", ".json"), "w") as f:
        json.dump(output, f, indent=2)
```

## Examples

### Example 1: Extract Invoice Tables to CSV

```python
from chandra import OCR

ocr = OCR()
result = ocr.read("invoice-2025-0342.pdf", extract_tables=True)

for i, table in enumerate(result.tables):
    df = table.to_dataframe()
    df.to_csv(f"invoice_table_{i}.csv", index=False)
    print(f"Table {i}: {table.rows} rows — columns: {list(df.columns)}")
# Output:
# Table 0: 12 rows — columns: ['Item', 'Qty', 'Unit Price', 'Total']
# Table 1: 3 rows — columns: ['Tax Type', 'Rate', 'Amount']
```

### Example 2: Process Handwritten Medical Forms

```python
from chandra import OCR
import requests

ocr = OCR()

result = ocr.read("patient_intake_form.jpg", mode="mixed", extract_tables=True)

extracted = {}
for block in result.blocks:
    extracted[block.label] = {
        "value": block.text,
        "confidence": block.confidence,
        "needs_review": block.confidence < 0.85,
    }

review_fields = {k: v for k, v in extracted.items() if v["needs_review"]}
print(f"Fields needing review: {list(review_fields.keys())}")
# Output:
# Fields needing review: ['allergies', 'signature']
```

## Guidelines

- Use `device="cuda"` for batch processing — 5-10x faster than CPU
- Set `dpi=300` or higher for scanned documents to improve accuracy
- For forms with checkboxes, use `mode="mixed"` to detect both print and marks
- Confidence threshold of 0.85 is a good default for human review routing
- Pre-process images (deskew, denoise) for better results on poor-quality scans

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `"auto"` | Detection mode: `auto`, `print`, `handwriting`, `mixed` |
| `preserve_layout` | `False` | Maintain spatial positioning of text |
| `extract_tables` | `False` | Detect and extract tables as structured data |
| `device` | `"cpu"` | Processing device: `cpu` or `cuda` |
| `language` | `"en"` | Primary language hint |
| `dpi` | `300` | DPI for PDF rasterization |
