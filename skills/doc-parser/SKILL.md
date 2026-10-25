---
name: doc-parser
description: >-
  Parse complex documents with IBM's open-source Docling library, which
  turns PDFs and Office files into structured Markdown or JSON. Use when a
  user asks to parse a document with tables, extract figures from a document, handle multi-column
  layouts, convert a complex PDF to structured data, extract content from
  academic papers, or process documents with mixed layouts. Handles tables,
  figures, headers, footers, and multi-column text.
license: Apache-2.0
compatibility: "Requires Python 3.10+ with the docling package (pulls in PyTorch)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  tags: "parsing, docling, tables, figures, layout"
  repository: https://github.com/docling-project/docling
  use-cases: "Extract tables and figures from academic papers with complex layouts, Parse financial reports with multi-column formats and embedded charts, Convert complex documents to clean Markdown or JSON preserving structure"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Document Parser

## Overview

Parse complex documents containing tables, figures, multi-column layouts, headers, and mixed content using the Docling library (originally from IBM Research, now an open-source LF AI & Data project). This skill goes beyond simple text extraction by understanding document structure, detecting layout regions, and preserving the logical reading order across complex formatting.

## Instructions

When a user asks to parse a complex document or extract structured content from a document with tables, figures, or multi-column layouts, follow these steps:

### Step 1: Install docling

```bash
python -m venv .venv && .venv/bin/pip install docling
```

Docling needs Python 3.10+ and depends on PyTorch. On a Linux machine without a GPU, `pip install docling --extra-index-url https://download.pytorch.org/whl/cpu` avoids the large CUDA wheels. The first conversion downloads the layout and table models from Hugging Face, so allow time and network access once.

For a quick one-off, the CLI writes Markdown to the output folder (add `--to json` or `--to html` for other formats):

```bash
.venv/bin/docling Q3-report.pdf --output converted/
```

### Step 2: Load and convert the document

Use `DocumentConverter` to parse the document. Reuse one converter for many files; creating it is the expensive part.

```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("paper.pdf")        # a local path or an http(s) URL
doc = result.document                          # a DoclingDocument
```

Supported inputs include PDF, DOCX, XLSX, PPTX, HTML, Markdown, CSV, EPUB, images (PNG, JPEG, TIFF, BMP, WEBP), and more; the current list is in the "Supported formats" page of the docling documentation. Legacy `.doc`/`.xls`/`.ppt` and RTF need LibreOffice installed. To limit work on a long PDF, pass `page_range=(1, 20)` to `convert()`.

### Step 3: Export to the desired format

**Markdown** (headings, tables, lists):

```python
markdown = doc.export_to_markdown()
```

**Lossless JSON** (the full document tree, reloadable later):

```python
import json
with open("paper.json", "w") as fp:
    json.dump(doc.export_to_dict(), fp, indent=2)
```

`doc.save_as_markdown("paper.md")`, `doc.save_as_json("paper.json")` and `doc.save_as_html("paper.html")` write files directly.

### Step 4: Handle specific content types

**Tables**: pass the document to `export_to_dataframe` (the argument is required in current versions) and write CSV:

```python
from pathlib import Path

def save_tables(doc, output_dir="tables"):
    Path(output_dir).mkdir(exist_ok=True)
    for i, table in enumerate(doc.tables, start=1):
        df = table.export_to_dataframe(doc=doc)
        df.to_csv(f"{output_dir}/table_{i}.csv", index=False)
    return len(doc.tables)
```

**Figures**: pictures are in `doc.pictures`. To save the image files, ask the PDF pipeline to keep them:

```python
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

options = PdfPipelineOptions()
options.images_scale = 2.0               # about 144 DPI
options.generate_picture_images = True
converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
doc = converter.convert("paper.pdf").document

for n, picture in enumerate(doc.pictures, start=1):
    page = picture.prov[0].page_no if picture.prov else None
    print(n, page, picture.caption_text(doc) or "no caption")
    picture.get_image(doc).save(f"figure_{n}.png")
```

**Reading order and sections**: `for item, level in doc.iterate_items():` walks headings, paragraphs, tables and pictures in reading order.

**Scanned pages and images**: OCR runs automatically on bitmap content. Pick the language and engine with `--ocr-lang` / `--ocr-engine` on the CLI, or `PdfPipelineOptions.ocr_options`. Use `--no-ocr` to skip it for born-digital PDFs.

### Step 5: Present the results

Format output based on user needs:
- **Full document**: Markdown export with all content preserved
- **Tables only**: CSV files or formatted markdown tables
- **Summary**: Document structure outline with section headings and content types found
- **Specific sections**: Extract targeted parts by heading or page range

## Examples

### Example 1: Parse an academic paper

**User request:** "Parse this research paper and extract all the tables: paper.pdf"

**Actions taken:**
1. Convert paper.pdf using docling
2. Identify 4 tables across 12 pages
3. Export each table as CSV

**Output:**
```
Parsed paper.pdf (12 pages)

Document structure:
  - Title: "Machine Learning Approaches for Climate Prediction"
  - Sections: Abstract, Introduction, Methods, Results, Discussion, References
  - Tables found: 4
  - Figures found: 6

Tables extracted:
  1. table_1.csv - "Dataset Characteristics" (5 cols, 8 rows) - Page 4
  2. table_2.csv - "Model Hyperparameters" (4 cols, 12 rows) - Page 6
  3. table_3.csv - "Performance Comparison" (6 cols, 5 rows) - Page 8
  4. table_4.csv - "Ablation Study Results" (5 cols, 7 rows) - Page 9

All tables saved to current directory.
```

### Example 2: Convert a financial report to Markdown

**User request:** "Convert this quarterly report to Markdown so I can edit it: Q3-report.pdf"

**Actions taken:**
1. Parse Q3-report.pdf with docling (handles multi-column layout)
2. Export as clean Markdown preserving structure

**Output:**
```
Converted Q3-report.pdf to Markdown

Document details:
  - Pages: 24
  - Layout: Multi-column (2-column on pages 3-20)
  - Tables: 8 (all converted to Markdown tables)
  - Figures: 5 (referenced with captions)
  - Sections: 12 headings detected

Output saved to: Q3-report.md (14,200 words)

The multi-column layout has been linearized into single-column reading order.
All tables are preserved as Markdown tables.
```

### Example 3: Pull the line items out of an invoice

**User request:** "Parse this invoice and give me the line items as JSON"

**Actions taken:**
1. Convert invoice.pdf and take the first table (`doc.tables[0]`), which holds the line items
2. Export it with `export_to_dataframe(doc=doc)` and write `df.to_json(orient="records", indent=2)`
3. Read invoice number, date and totals from the Markdown text, since docling returns layout, not named fields

**Output:**
```json
[
  {"Item": "Office Chairs", "Qty": 10, "Unit Price": "299.99", "Total": "2,999.90"},
  {"Item": "Standing Desks", "Qty": 5, "Unit Price": "549.00", "Total": "2,745.00"},
  {"Item": "Monitor Arms", "Qty": 15, "Unit Price": "89.50", "Total": "1,342.50"}
]
```

Column names come from the printed header row and cell values are text, so convert amounts to numbers yourself and check the sum against the invoice total.

## Guidelines

- Docling handles complex layouts automatically including multi-column text, nested tables, and mixed content. Let it do the heavy lifting.
- For very large documents (200+ pages), convert in page ranges (`page_range=(1, 50)`) to manage memory, and use a GPU (`--device cuda`) if one is available.
- `--pipeline vlm` runs a vision-language model (GraniteDocling) instead of the default layout and table models; slower, but sometimes better on messy scans. Check results either way.
- When tables have merged cells or irregular structures, validate the DataFrame output and flag any parsing anomalies.
- Prefer Markdown export for human-readable output and JSON/dict export for programmatic use.
- If docling fails to install or parse a specific format, fall back to pdfplumber for PDFs or python-docx for DOCX files. Pass untrusted files only inside a sandbox or container, as with any parser.
- Always report the document structure (sections, tables, figures found) before detailed output so the user knows what is available.
- For scanned documents without a text layer, docling may use its built-in OCR. If quality is poor, suggest the pdf-ocr skill for better preprocessing.
