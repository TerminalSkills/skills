---
name: chandra-ocr
description: >-
  Chandra OCR 2 is an open-weights model from Datalab that converts page
  images and PDFs into Markdown, HTML or JSON layout chunks, keeping tables,
  math, forms with checkboxes and handwriting. Use when a user asks to OCR a
  scanned PDF, pull tables out of an image, read handwritten forms, or run a
  local or vLLM-served document OCR model with the chandra CLI or Python
  package.
license: Apache-2.0
compatibility: Python 3.10+; a GPU is needed in practice (HuggingFace backend, or a vLLM server run through Docker)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: documents
  repository: https://github.com/datalab-to/chandra
  tags: "ocr, document-processing, tables, handwriting, data-extraction"
---

# Chandra OCR

## Overview

[Chandra](https://github.com/datalab-to/chandra) (package `chandra-ocr` 0.2.0, model `datalab-to/chandra-ocr-2`) is a vision-language OCR model. For each page it produces HTML with layout labels (text, table, image, header, footer and so on), from which it derives Markdown, HTML and a list of layout chunks with bounding boxes. It covers 90+ languages, math, handwriting and checkbox forms. There are two inference methods: `vllm` (default; talks to a vLLM server, the base install is lightweight) and `hf` (loads the model locally with PyTorch and Transformers).

Licensing: the code is Apache 2.0, but the model weights use a modified OpenRAIL-M licence (free for research, personal use and startups under 2 million USD funding or revenue; not for competing with Datalab's API). Check the README's "Commercial usage" section before using it in a company product. Datalab also sells a hosted API.

## Instructions

### Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install chandra-ocr            # CLI + vLLM client
pip install "chandra-ocr[hf]"      # adds torch, transformers, accelerate for local inference
pip install "chandra-ocr[app]"     # adds the Streamlit demo
```

### Command line

```bash
# HuggingFace backend, local GPU
chandra scans/ ./ocr-output --method hf

# vLLM backend: start the server first (launches a Docker container), then convert
chandra_vllm
chandra scans/lease-2026-014.pdf ./ocr-output --method vllm --page-range "1-5,7"
```

Options: `--method [hf|vllm]`, `--page-range` (PDFs), `--max-output-tokens`, `--max-workers` (vLLM), `--include-images/--no-images`, `--include-headers-footers/--no-headers-footers` (headers and footers are dropped by default), `--batch-size` (28 for vLLM, 1 for hf). Input can be a file or a directory of PDF, PNG, JPG, GIF, WEBP, TIFF or BMP files. Each input gets a folder with `<name>.md`, `<name>.html`, `<name>_metadata.json` and the extracted images.

The vLLM client reads `VLLM_API_BASE` (default `http://localhost:8000/v1`), `VLLM_MODEL_NAME` (default `chandra`) and `VLLM_GPUS`. To use your own vLLM server, serve `datalab-to/chandra-ocr-2` under the model name `chandra`.

### Python

The README documents the CLI; the Python entry point below is what the CLI itself uses (read from the package source).

```python
from chandra.input import load_file
from chandra.model import InferenceManager
from chandra.model.schema import BatchInputItem

manager = InferenceManager(method="hf")          # or "vllm" with a server running
images = load_file("scans/invoice-2026-0342.pdf", {"page_range": "1-3"})
batch = [BatchInputItem(image=img, prompt_type="ocr_layout") for img in images]

for page in manager.generate(batch):
    if page.error:
        print("page failed")
        continue
    print(page.markdown)                          # also page.html, page.chunks, page.images
```

`prompt_type` is `"ocr_layout"` (layout labels and bounding boxes) or `"ocr"` (plain OCR to HTML). Each entry of `page.chunks` is a dict with `label`, `content` and `bbox`; `page.images` maps file names to cropped PIL images.

### Tables

Tables come back as HTML `<table>` elements inside the chunks labelled as tables. Parse them with pandas rather than expecting a table object:

```python
from io import StringIO
import pandas as pd

for chunk in page.chunks:
    if chunk["label"] == "Table":
        df = pd.read_html(StringIO(chunk["content"]))[0]
        df.to_csv("invoice_table.csv", index=False)
```

The layout labels (Table, Text, Section-Header, Page-Header, Image and others) are listed in the package prompt; "Table-Of-Contents" is a separate label.

## Examples

### Example 1: "Convert this 40-page scanned contract to Markdown"

```bash
chandra contracts/supply-agreement-2026.pdf ./ocr-output --method hf --no-images
```

Result: `ocr-output/supply-agreement-2026/supply-agreement-2026.md` with headings, tables and numbered clauses, plus `_metadata.json` with per-page token counts.

### Example 2: "Extract the line items from invoice scans into CSV"

Run the Python snippet above on `invoice-2026-0342.pdf`, loop over `page.chunks`, and write each table chunk with `pd.read_html`. Spot-check the totals against the PDF, since OCR can misread digits.

## Guidelines

- This is a large vision model: use a CUDA GPU (or a vLLM server). CPU-only runs are impractically slow.
- `chandra_vllm` runs a Docker container; do not give it more GPUs than it needs (`VLLM_GPUS`).
- There is no per-field confidence score. Route important fields (amounts, dates, IDs) to a human check instead of relying on a threshold.
- PDF pages are rasterised at 192 DPI by default (`IMAGE_DPI` setting); very low quality scans may need preprocessing.
- Output can contain model mistakes on handwriting and dense tables; never feed it straight into payments or medical records without review.
- Documents may be confidential: the local `hf` and self-hosted vLLM routes keep data on your machine; the Datalab API does not.
