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
  category: ai-tools
  tags:
    - ocr
    - document-processing
    - tables
    - handwriting
    - forms
    - data-extraction
    - chandra
  use-cases:
    - "Extract data from complex invoices with multi-column tables"
    - "Read handwritten medical forms and convert to structured data"
    - "Process architectural drawings with mixed text, numbers, and symbols"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Chandra OCR

Extract text from complex documents — tables, forms, handwriting, and full page layouts — using [Chandra](https://github.com/datalab-to/chandra), a high-accuracy OCR engine built for real-world document complexity.

## Installation

```bash
pip install chandra-ocr
```

For GPU acceleration (recommended for batch processing):

```bash
pip install chandra-ocr[gpu]
```

Verify installation:

```python
import chandra
print(chandra.__version__)
```

## Basic Usage

### Extract Text from an Image

```python
from chandra import OCR

ocr = OCR()

# Single image
result = ocr.read("document.png")
print(result.text)

# From a PDF
result = ocr.read("report.pdf")
for page in result.pages:
    print(f"--- Page {page.number} ---")
    print(page.text)
```

### Extract with Layout Preservation

```python
result = ocr.read("document.png", preserve_layout=True)

# Access structured blocks
for block in result.blocks:
    print(f"Type: {block.type}")  # paragraph, table, header, handwriting
    print(f"Text: {block.text}")
    print(f"Confidence: {block.confidence:.2f}")
    print(f"Bounding box: {block.bbox}")
```

## Table Extraction

Chandra excels at detecting and extracting complex tables — multi-column, merged cells, nested headers.

```python
result = ocr.read("invoice.png", extract_tables=True)

for table in result.tables:
    print(f"Table with {table.rows} rows x {table.cols} columns")

    # Access as list of lists
    for row in table.data:
        print(row)

    # Export to pandas DataFrame
    df = table.to_dataframe()
    print(df.head())

    # Export to CSV
    table.to_csv("extracted_table.csv")
```

### Handling Merged Cells

```python
result = ocr.read("complex_report.pdf", extract_tables=True)

for table in result.tables:
    # Access cell-level metadata
    for cell in table.cells:
        print(f"Row {cell.row}, Col {cell.col}: {cell.text}")
        print(f"  Spans: {cell.rowspan}x{cell.colspan}")
        print(f"  Confidence: {cell.confidence:.2f}")
```

## Handwriting Recognition

```python
result = ocr.read("handwritten_form.jpg", mode="handwriting")

for block in result.blocks:
    if block.type == "handwriting":
        print(f"Handwritten text: {block.text}")
        print(f"Confidence: {block.confidence:.2f}")
```

### Mixed Documents (Print + Handwriting)

```python
result = ocr.read("filled_form.png", mode="mixed")

for block in result.blocks:
    label = "✍️" if block.type == "handwriting" else "📝"
    print(f"{label} {block.text} (conf: {block.confidence:.2f})")
```

## Layout Analysis

Detect document structure — headers, paragraphs, tables, images, footers.

```python
result = ocr.read("annual_report.pdf", analyze_layout=True)

for page in result.pages:
    print(f"--- Page {page.number} ---")
    for element in page.layout:
        print(f"  [{element.type}] {element.text[:80]}...")
        print(f"  Position: {element.bbox}")
```

## Batch Processing

```python
import glob
from chandra import OCR

ocr = OCR(device="cuda")  # GPU for speed

files = glob.glob("documents/*.pdf")

for file_path in files:
    result = ocr.read(file_path, extract_tables=True)
    
    # Export structured JSON
    output = {
        "file": file_path,
        "pages": len(result.pages),
        "text": result.text,
        "tables": [t.to_dict() for t in result.tables],
        "confidence": result.avg_confidence
    }
    
    import json
    out_path = file_path.replace(".pdf", ".json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
```

## Integration with Data Pipelines

### Extract → Validate → Push to API

```python
from chandra import OCR
import requests

ocr = OCR()

def process_claim_form(image_path: str) -> dict:
    result = ocr.read(image_path, mode="mixed", extract_tables=True)
    
    extracted = {}
    for block in result.blocks:
        extracted[block.label] = {
            "value": block.text,
            "confidence": block.confidence,
            "needs_review": block.confidence < 0.85
        }
    
    return extracted

def submit_to_system(data: dict, api_url: str):
    # Flag low-confidence fields for human review
    review_fields = {k: v for k, v in data.items() if v["needs_review"]}
    
    payload = {
        "fields": {k: v["value"] for k, v in data.items()},
        "needs_review": bool(review_fields),
        "review_fields": list(review_fields.keys())
    }
    
    response = requests.post(api_url, json=payload)
    return response.json()
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `"auto"` | Detection mode: `auto`, `print`, `handwriting`, `mixed` |
| `preserve_layout` | `False` | Maintain spatial positioning of text |
| `extract_tables` | `False` | Detect and extract tables as structured data |
| `analyze_layout` | `False` | Full layout analysis with element classification |
| `device` | `"cpu"` | Processing device: `cpu` or `cuda` |
| `language` | `"en"` | Primary language hint for recognition |
| `dpi` | `300` | DPI for PDF rasterization |

## Tips

- Use `device="cuda"` for batch processing — 5-10x faster than CPU
- Set `dpi=300` or higher for scanned documents to improve accuracy
- For forms with checkboxes, use `mode="mixed"` to detect both print and marks
- Confidence threshold of 0.85 is a good default for human review routing
- Pre-process images (deskew, denoise) for better results on poor-quality scans
