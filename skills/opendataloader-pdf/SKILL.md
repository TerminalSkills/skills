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
  category: ai-tools
  tags: [pdf, parsing, document-processing, rag, data-extraction, ocr]
  use-cases:
    - "Extract structured data from invoices, contracts, and reports"
    - "Parse PDFs for RAG ingestion with table and image extraction"
    - "Build an automated PDF processing pipeline for document analysis"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenDataLoader PDF — AI-Ready Document Parsing

## Overview

Parse PDF documents into clean, structured data optimized for AI consumption. Extract text with layout preservation, tables as structured JSON, images with captions, and rich metadata. Ideal for RAG pipelines, document analysis, and data extraction workflows. Inspired by [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf) (9k+ stars).

## Instructions

### Step 1: Choose Your Parsing Strategy

Different PDF types need different approaches:

| PDF Type | Best Approach | Tool |
|----------|---------------|------|
| Text-native (digital) | Direct text extraction | pdfplumber, PyMuPDF |
| Scanned / image-based | OCR pipeline | Tesseract, EasyOCR, Surya |
| Tables-heavy | Table-aware extraction | Camelot, pdfplumber |
| Mixed content | Hybrid pipeline | Combine approaches |
| Complex layouts | Vision LLM | Claude/GPT-4o vision |

### Step 2: Set Up the Python Pipeline

```bash
pip install pdfplumber pymupdf camelot-py[cv] Pillow
# For OCR: pip install pytesseract easyocr
# For embeddings: pip install sentence-transformers
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
            words = page.extract_words(
                keep_blank_chars=True,
                extra_attrs=['fontname', 'size']
            )

            # Detect headers by font size
            headers = [w for w in words if w['size'] > 14]
            body = [w for w in words if w['size'] <= 14]

            pages.append({
                'page': i + 1,
                'text': text,
                'headers': [h['text'] for h in headers],
                'word_count': len(words),
                'width': page.width,
                'height': page.height
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
            tables = page.extract_tables({
                "vertical_strategy": "text",
                "horizontal_strategy": "text",
                "snap_tolerance": 5
            })
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
                results.append({
                    'page': i + 1,
                    'table_index': j,
                    'headers': headers,
                    'rows': rows,
                    'row_count': len(rows)
                })
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
            xref = img[0]
            base_image = doc.extract_image(xref)
            ext = base_image['ext']
            img_bytes = base_image['image']
            filename = f'page{page_num + 1}_img{img_idx + 1}.{ext}'
            filepath = os.path.join(output_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(img_bytes)
            images.append({
                'page': page_num + 1,
                'file': filepath,
                'size': len(img_bytes),
                'format': ext,
                'width': base_image.get('width'),
                'height': base_image.get('height')
            })
    return images

def extract_metadata(pdf_path):
    """Extract PDF metadata."""
    doc = fitz.open(pdf_path)
    meta = doc.metadata
    return {
        'title': meta.get('title', ''),
        'author': meta.get('author', ''),
        'subject': meta.get('subject', ''),
        'creator': meta.get('creator', ''),
        'pages': len(doc),
        'encrypted': doc.is_encrypted
    }
```

### Step 6: Build RAG-Ready Chunks

Split extracted content into chunks optimized for embedding and retrieval:

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
            chunks.append({
                'text': ' '.join(chunk_words),
                'page': page['page'],
                'chunk_index': len(chunks),
                'word_count': len(chunk_words)
            })
    return chunks
```

### Step 7: Full Pipeline — PDF to AI-Ready JSON

```python
import json

def pdf_to_ai_ready(pdf_path, output_path=None):
    """Complete pipeline: PDF → structured AI-ready data."""
    result = {
        'source': pdf_path,
        'metadata': extract_metadata(pdf_path),
        'pages': extract_text_structured(pdf_path),
        'tables': extract_tables(pdf_path),
        'images': extract_images(pdf_path),
        'chunks': []  # filled below
    }
    result['chunks'] = chunk_for_rag(result['pages'])
    result['stats'] = {
        'total_pages': len(result['pages']),
        'total_tables': len(result['tables']),
        'total_images': len(result['images']),
        'total_chunks': len(result['chunks']),
        'total_words': sum(p['word_count'] for p in result['pages'])
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
        page = doc[i]
        pix = page.get_pixmap(dpi=300)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img)
        pages.append({'page': i + 1, 'text': text, 'method': 'ocr'})
    return pages
```

## Batch Processing

Process a directory of PDFs:

```bash
#!/bin/bash
for pdf in ./documents/*.pdf; do
  python -c "
from pdf_pipeline import pdf_to_ai_ready
pdf_to_ai_ready('$pdf', '${pdf%.pdf}.json')
print('Done: $pdf')
"
done
```

## Quality Tips

- **Always check font encoding** — some PDFs have garbled text extraction; try PyMuPDF if pdfplumber fails
- **Table detection** — use `camelot` for PDFs with visible table borders; `pdfplumber` for borderless
- **Large PDFs** — process page-by-page to avoid memory issues; stream results to disk
- **Vision LLM fallback** — for complex layouts, send page screenshots to Claude/GPT-4o as images

## References

- [pdfplumber](https://github.com/jsvine/pdfplumber) — detailed PDF text and table extraction
- [PyMuPDF](https://pymupdf.readthedocs.io/) — fast PDF processing with image extraction
- [Camelot](https://camelot-py.readthedocs.io/) — accurate table extraction from PDFs
