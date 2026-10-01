---
name: opendataloader-pdf
description: >-
  OpenDataLoader PDF converts PDF files into Markdown, JSON with bounding
  boxes, HTML or plain text, and can add accessibility tags to untagged PDFs.
  It runs locally on Java with a CLI and Python, Node.js and Java APIs. Use
  when a user asks to parse PDFs for RAG, convert a PDF to Markdown, extract
  tables or headings with page coordinates, OCR scanned PDFs, or produce
  Tagged PDFs.
license: Apache-2.0
compatibility: "Java 11+ on PATH, plus Python 3.10+ or Node.js 22.13+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: [pdf, parsing, document-processing, rag, data-extraction]
  repository: https://github.com/opendataloader-project/opendataloader-pdf
  use-cases:
    - "Extract structured data from invoices, contracts, and reports"
    - "Parse PDFs for RAG ingestion with table and image extraction"
    - "Build an automated PDF processing pipeline for document analysis"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenDataLoader PDF — AI-Ready Document Parsing

## Overview

OpenDataLoader PDF is an open-source (Apache-2.0) PDF parser. A Java engine reads the PDF and writes Markdown, JSON, HTML, plain text, an annotated PDF or a Tagged PDF; the Python and Node.js packages bundle the JAR and start it for you. The default mode is deterministic, runs on CPU and sends nothing to a network. An optional hybrid mode routes hard pages (borderless tables, scans, formulas, charts) to a local Docling-based server.

Every JSON element carries its type, page number and bounding box, so an answer in a RAG pipeline can point back to the exact place in the source file.

## Instructions

### Step 1: Install

Java 11 or newer must be on `PATH` — the packages do not ship a JVM. Without it the CLI stops with `'java' command not found`.

```bash
java -version                               # must print 11 or higher
sudo apt install default-jre-headless       # Debian/Ubuntu (Java 11, 17 or 21 depending on the release)
brew install --cask temurin                 # macOS

pip install -U opendataloader-pdf           # Python 3.10+: library and CLI
npm install @opendataloader/pdf             # Node.js 22.13+: library and CLI
```

Both packages install the same `opendataloader-pdf` command (`npx opendataloader-pdf` in a Node project).

### Step 2: Convert from the command line

Pass any mix of files and folders. The default format is `json`, and output lands next to the input unless `-o` is given.

```bash
opendataloader-pdf reports/ invoice-2291.pdf -o parsed -f markdown,json

# One file to stdout (single format only)
opendataloader-pdf invoice-2291.pdf -f markdown --to-stdout -q

# Only some pages, with a page marker in the Markdown
opendataloader-pdf handbook.pdf -o parsed -f markdown --pages "1,3,5-7" \
  --markdown-page-separator "--- page %page-number% ---"

# Encrypted file
opendataloader-pdf contract.pdf -o parsed -p "$CONTRACT_PDF_PASSWORD"
```

| Option | Values | Purpose |
|--------|--------|---------|
| `-f, --format` | `json`, `markdown`, `html`, `text`, `pdf`, `tagged-pdf` | Comma-separated output formats (`pdf` = annotated PDF for visual debugging) |
| `--image-output` | `external` (default), `embedded`, `off` | Image files next to the output, Base64 data URIs, or no images |
| `--table-method` | `default`, `cluster` | Border-based detection, or border plus text clustering |
| `--use-struct-tree` | flag | Read structure from the PDF's own tags instead of guessing |
| `--include-header-footer` | flag | Keep page headers and footers (dropped by default) |
| `--keep-line-breaks` | flag | Preserve original line breaks |
| `--markdown-with-html` | flag | Allow HTML in Markdown for tables with merged cells |
| `--sanitize` | flag | Replace emails, phone numbers, IPs, card numbers and URLs with placeholders |
| `--threads` | integer | Pages in parallel; values above 1 are experimental |

Run `opendataloader-pdf --help` for the full list.

### Step 3: Use the Python or Node.js API

`convert()` takes the same options as the CLI in snake_case (Python) or camelCase (Node.js). It writes files: Python returns `None` and Node.js resolves to the CLI's console output, so read the results from the output directory.

```python
import opendataloader_pdf

# One call for the whole batch: every convert() starts a JVM
opendataloader_pdf.convert(
    input_path=["reports/", "invoice-2291.pdf"],
    output_dir="parsed/",
    format="markdown,json",
    image_output="off",
    quiet=True,
)
```

```typescript
import { convert } from '@opendataloader/pdf';

await convert(['reports/', 'invoice-2291.pdf'], {
  outputDir: 'parsed/',
  format: 'markdown,json',
});
```

For LangChain, `pip install -U langchain-opendataloader-pdf` provides `OpenDataLoaderPDFLoader(file_path=[...], format="text")`.

### Step 4: Read the JSON

The top-level object holds document metadata (`file name`, `number of pages`, `title`, `author`) and `kids`, the elements in reading order. Field names contain spaces.

```json
{
  "type": "heading",
  "id": 42,
  "page number": 1,
  "bounding box": [72.0, 700.0, 540.0, 730.0],
  "heading level": 1,
  "font": "Helvetica-Bold",
  "font size": 24.0,
  "content": "Introduction"
}
```

- `type` is `heading`, `paragraph`, `table`, `list`, `image`, `caption` or `formula`; with `--include-header-footer` also `header` and `footer`.
- `bounding box` is `[left, bottom, right, top]` in PDF points (72 pt = 1 inch); `page number` starts at 1.
- A `table` has `number of rows`, `number of columns` and `rows[].cells[]`; each cell has `row span`, `column span` and its text in `kids[].content`.
- A `list` has `list items[]`; an `image` has `source` (the extracted file, absent with `--image-output off`) and `alt_source`.

### Step 5: Hybrid mode for scans, complex tables, formulas and charts

Hybrid mode needs a second process: a local server built on Docling. It loads its models at startup, so start it once and keep it running.

```bash
pip install -U "opendataloader-pdf[hybrid]"

# Terminal 1: the server. It binds 0.0.0.0 by default and has no authentication.
opendataloader-pdf-hybrid --host 127.0.0.1 --port 5002

# Terminal 2: the client sends complex pages to it, simple pages stay local
opendataloader-pdf --hybrid docling-fast scans/ -o parsed -f markdown,json
```

| Need | Server flag | Client flag |
|------|-------------|-------------|
| Scanned PDF | `--force-ocr` | — |
| Non-English scan | `--force-ocr --ocr-lang "ko,en"` (EasyOCR codes) | — |
| Another OCR engine | `--ocr-engine tesseract --ocr-lang "kor,eng"` (Tesseract and its language data must be installed) | — |
| Formulas as LaTeX | `--enrich-formula` | `--hybrid-mode full` |
| Chart and image descriptions | `--enrich-picture-description` | `--hybrid-mode full` |
| Nested heading levels | `--heading-hierarchy` | — |

The client looks for the server at `http://localhost:5002`; use `--hybrid-url http://localhost:5003` to point it at another port or host. If the server is unreachable the run fails; add `--hybrid-fallback` to fall back to the local engine instead.

### Step 6: Tagged PDFs

```bash
# Add structure tags to untagged PDFs (writes policy-handbook_tagged.pdf)
opendataloader-pdf policies/ -o accessible -f tagged-pdf

# Trust the tags an author already put in the file
opendataloader-pdf annual-report.pdf -o parsed -f markdown --use-struct-tree
```

Auto-tagging produces a Tagged PDF. Export to PDF/UA-1 or PDF/UA-2 is a paid enterprise add-on, not part of the open-source package.

## Examples

### Example 1: Section chunks with citations for a RAG index

**User request:** "Parse the PDFs in `papers/` and split them into chunks by section. I need the page and position of every chunk so answers can cite the source."

```bash
opendataloader-pdf papers/ -o parsed -f markdown,json --image-output off -q
```

```python
import json
from pathlib import Path

doc = json.loads(Path("parsed/moran-scene-text.json").read_text())

chunks, current = [], None
for el in doc["kids"]:
    if el["type"] == "heading":
        current = {"section": el["content"], "page": el["page number"], "text": [], "boxes": []}
        chunks.append(current)
    elif el["type"] in ("paragraph", "caption") and current:
        current["text"].append(el["content"])
        current["boxes"].append((el["page number"], el["bounding box"]))

for c in chunks[2:6]:
    words = len(" ".join(c["text"]).split())
    print(f'p{c["page"]}  {c["section"]}  ({words} words, {len(c["boxes"])} boxes)')
```

Output for a 15-page two-column paper:

```
Processed 2 PDF files in 'papers'.
p1  Abstract  (207 words, 5 boxes)
p1  1. Introduction  (585 words, 14 boxes)
p3  2. Related Work  (532 words, 8 boxes)
p3  3. Methodology  (73 words, 1 boxes)
```

Each entry in `boxes` is `(page, [left, bottom, right, top])`, ready to store as chunk metadata and to highlight in a PDF viewer.

### Example 2: Tables from selected pages as CSV

**User request:** "Pull the tables on pages 4 to 6 of `moran-scene-text.pdf` into CSV files."

```bash
opendataloader-pdf papers/moran-scene-text.pdf -o tables -f json --pages 4-6 -q
```

```python
import csv
import json

doc = json.load(open("tables/moran-scene-text.json"))

def cell_text(cell):
    return " ".join(k.get("content", "") for k in cell["kids"]).strip()

for el in doc["kids"]:
    if el["type"] != "table":
        continue
    name = f'tables/p{el["page number"]}-table-{el["id"]}.csv'
    with open(name, "w", newline="") as f:
        csv.writer(f).writerows([cell_text(c) for c in row["cells"]] for row in el["rows"])
    print(name, el["number of rows"], "rows x", el["number of columns"], "columns")
```

```
tables/p4-table-9.csv 13 rows x 3 columns
tables/p6-table-175.csv 16 rows x 3 columns
```

```csv
Type,Conﬁgurations,Size
Input,-,1×32×100
MaxPooling,"k2, s2",1×16×50
Convolution,"maps:64, k3, s1, p1",64×16×50
```

The header reads `Conﬁgurations` because the PDF stores an "fi" ligature; see the note on ligatures below. If a table comes back split or missing, retry with `--table-method cluster`, then with hybrid mode.

## Guidelines

- **Batch the inputs.** Each CLI run or `convert()` call starts a JVM. Pass all files and folders in one call instead of looping over files.
- **Start with the default mode.** It is fast and reproducible. Move to hybrid only for scans, borderless or nested tables, formulas and charts; local table detection relies on visible borders.
- **Scanned PDFs yield no text without hybrid OCR.** OCR quality depends on the engine, language and scan; try a few sample pages with different `--ocr-engine` values before a large run.
- **Keep the hybrid server private.** Start it with `--host 127.0.0.1`; if other machines must reach it, put it behind your own authentication and set `--max-file-size` and `--picture-area-threshold` to bound the work one upload can request.
- **`--use-struct-tree` overrides `--hybrid`.** On a tagged PDF the structure tree wins and the backend is not called. Tag quality varies, so compare against the default mode on a sample.
- **Content safety filters are on by default.** Hidden text, off-page content and invisible layers are dropped, which protects an LLM from prompt injection hidden in a PDF. Use `--content-safety-off all` (or one filter: `hidden-text`, `off-page`, `tiny`, `hidden-ocg`, `background`) only when you need that content, and treat it as untrusted.
- **Text is returned as the PDF encodes it.** Ligatures such as `ﬁ` survive extraction; run `unicodedata.normalize("NFKC", text)` before keyword search or embedding.
- **`--sanitize` is a convenience, not a compliance tool.** On 2.5.12 it replaced emails, IPs, URLs and card numbers, but left phone numbers such as `+1 415-555-0134` and a card number written with spaces untouched. Check the output before sharing documents that contain personal data.
- **Pass passwords through an environment variable**, never as a literal in a script or shell history.
- **Limits:** PDF input only (no Word, Excel or PowerPoint). Heading levels in hybrid mode are flat unless the server runs with `--heading-hierarchy`. Versions before 2.0 were licensed under MPL-2.0.
