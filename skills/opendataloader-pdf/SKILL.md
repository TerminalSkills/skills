---
name: opendataloader-pdf
description: >-
  Parse PDFs into AI-ready structured data — extract text, tables, images,
  and metadata with high accuracy. Use when: processing PDF documents for RAG,
  extracting data from invoices/contracts, building document processing pipelines.
license: Apache-2.0
compatibility: "Java 11+, REST API available"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [pdf, parsing, document-processing, rag, data-extraction]
  use-cases:
    - "Extract structured data from invoices, contracts, and reports"
    - "Parse PDFs for RAG ingestion with table and image extraction"
    - "Build an automated PDF processing pipeline for document analysis"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenDataLoader PDF — AI-Ready Document Parsing

## Overview

Parse PDF documents into clean, structured data optimized for AI consumption. Extract text with layout preservation, tables as structured JSON, images with captions, and rich metadata. Ideal for RAG pipelines, document analysis, and data extraction workflows.

## Instructions

### Step 1: Choose Your Parsing Strategy

| PDF Type | Best Approach | Tool |
|----------|---------------|------|
| Text-native (digital) | Direct text extraction | pdfplumber, PyMuPDF |
| Scanned / image-based | OCR pipeline | Tesseract, EasyOCR |
| Tables-heavy | Table-aware extraction | Camelot, pdfplumber |
| Complex layouts | Vision LLM | Claude/GPT-4o vision |

### Step 2: Set Up the Python Pipeline

```bash
pip install pdfplumber pymupdf camelot-py[cv] Pillow
# For OCR: pip install pytesseract easyocr
```

### Step 3: Extract Text with Layout Awareness

```python
import pdfplumber

def extract_text_structured(pdf_path):
    """Extract text preserving document structure."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text(layout=True)
            words = page.extract_words(keep_blank_chars=True, extra_attrs=['fontname', 'size'])
            headers = [w for w in words if w['size'] > 14]
            pages.append({
                'page': i + 1, 'text': text,
                'headers': [h['text'] for h in headers],
                'word_count': len(words)
            })
    return pages
```

### Step 4: Extract Tables as Structured Data

```python
def extract_tables(pdf_path):
    """Extract tables as list of dicts."""
    results = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables({"vertical_strategy": "text",
                "horizontal_strategy": "text", "snap_tolerance": 5})
            for j, table in enumerate(tables):
                if not table or len(table) < 2:
                    continue
                headers = [str(h).strip() for h in table[0]]
                rows = []
                for row in table[1:]:
                    row_dict = {}
                    for k, cell in enumerate(row):
                        key = headers[k] if k < len(headers) else f'col_{k}'
                        row_dict[key] = str(cell).strip() if cell else ''
                    rows.append(row_dict)
                results.append({'page': i+1, 'table_index': j, 'headers': headers,
                                'rows': rows, 'row_count': len(rows)})
    return results
```

### Step 5: Extract Images and Metadata

```python
import fitz  # PyMuPDF

def extract_images(pdf_path, output_dir='./images'):
    """Extract embedded images from PDF."""
    import os
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        for img_idx, img in enumerate(page.get_images(full=True)):
            base_image = doc.extract_image(img[0])
            filename = f'page{page_num+1}_img{img_idx+1}.{base_image["ext"]}'
            filepath = os.path.join(output_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(base_image['image'])
            images.append({'page': page_num+1, 'file': filepath,
                           'format': base_image['ext'],
                           'width': base_image.get('width'),
                           'height': base_image.get('height')})
    return images

def extract_metadata(pdf_path):
    """Extract PDF metadata."""
    doc = fitz.open(pdf_path)
    meta = doc.metadata
    return {'title': meta.get('title', ''), 'author': meta.get('author', ''),
            'pages': len(doc), 'encrypted': doc.is_encrypted}
```

### Step 6: Build RAG-Ready Chunks

```python
def chunk_for_rag(pages, chunk_size=500, overlap=50):
    """Split pages into overlapping chunks for RAG."""
    chunks = []
    for page in pages:
        text = page['text']
        if not text:
            continue
        words = text.split()
        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i:i + chunk_size]
            if len(chunk_words) < 20:
                continue
            chunks.append({'text': ' '.join(chunk_words), 'page': page['page'],
                           'chunk_index': len(chunks), 'word_count': len(chunk_words)})
    return chunks
```

### Step 7: Full Pipeline — PDF to AI-Ready JSON

```python
import json

def pdf_to_ai_ready(pdf_path, output_path=None):
    """Complete pipeline: PDF to structured AI-ready data."""
    result = {
        'source': pdf_path,
        'metadata': extract_metadata(pdf_path),
        'pages': extract_text_structured(pdf_path),
        'tables': extract_tables(pdf_path),
        'images': extract_images(pdf_path),
    }
    result['chunks'] = chunk_for_rag(result['pages'])
    result['stats'] = {
        'total_pages': len(result['pages']),
        'total_tables': len(result['tables']),
        'total_images': len(result['images']),
        'total_chunks': len(result['chunks']),
    }
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2, default=str)
    return result
```

### Step 8: Handle Scanned PDFs with OCR

```python
import pytesseract
from PIL import Image

def ocr_pdf(pdf_path):
    """OCR scanned PDF pages."""
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        pix = doc[i].get_pixmap(dpi=300)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img)
        pages.append({'page': i + 1, 'text': text, 'method': 'ocr'})
    return pages
```

## Examples

### Example 1: Extract Data from a Quarterly Financial Report

A finance team processes a 48-page quarterly report PDF to feed into their analysis pipeline:

```python
result = pdf_to_ai_ready('Q4-2025-Annual-Report-Acme-Corp.pdf', 'acme_q4.json')
print(result['stats'])
# {'total_pages': 48, 'total_tables': 12, 'total_images': 7, 'total_chunks': 34}

# Extract the revenue table from page 8
revenue_table = [t for t in result['tables'] if t['page'] == 8][0]
print(revenue_table['headers'])
# ['Quarter', 'Revenue ($M)', 'Growth (%)', 'Operating Margin']
print(revenue_table['rows'][0])
# {'Quarter': 'Q4 2025', 'Revenue ($M)': '847.3', 'Growth (%)': '12.4', 'Operating Margin': '23.1%'}

# Feed chunks into RAG system
for chunk in result['chunks']:
    embed_and_store(chunk['text'], metadata={'page': chunk['page'], 'source': 'acme_q4'})
```

### Example 2: Batch Process Legal Contracts for Clause Extraction

A legal team processes a directory of scanned contract PDFs to identify key clauses:

```python
import os

contract_dir = './contracts/vendor-agreements/'
for filename in os.listdir(contract_dir):
    if not filename.endswith('.pdf'):
        continue
    pdf_path = os.path.join(contract_dir, filename)

    # Try text extraction first, fall back to OCR for scanned docs
    result = pdf_to_ai_ready(pdf_path)
    total_text = sum(len(p['text'] or '') for p in result['pages'])
    if total_text < 100:  # likely scanned
        result['pages'] = ocr_pdf(pdf_path)
        result['chunks'] = chunk_for_rag(result['pages'])

    print(f"{filename}: {result['stats']['total_pages']} pages, "
          f"{result['stats']['total_chunks']} chunks, "
          f"{result['stats']['total_tables']} tables")
    # Output: "vendor-agreement-globaltech-2025.pdf: 24 pages, 18 chunks, 3 tables"

    # Save structured output for downstream AI analysis
    pdf_to_ai_ready(pdf_path, pdf_path.replace('.pdf', '.json'))
```

## Guidelines

- **Always check font encoding** — some PDFs produce garbled text; try PyMuPDF if pdfplumber fails
- **Use Camelot for bordered tables** — pdfplumber works better for borderless tables
- **Process large PDFs page-by-page** — stream results to disk to avoid memory issues
- **Vision LLM fallback** — for complex layouts, send page screenshots to Claude or GPT-4o as images
- **Validate extracted data** — spot-check tables and text against the original PDF before using in production
- **Handle encrypted PDFs** — check `doc.is_encrypted` and prompt for password before extraction

## References

- [pdfplumber](https://github.com/jsvine/pdfplumber) — detailed PDF text and table extraction
- [PyMuPDF](https://pymupdf.readthedocs.io/) — fast PDF processing with image extraction
- [Camelot](https://camelot-py.readthedocs.io/) — accurate table extraction from PDFs
