---
name: markitdown
description: >-
  Converts PDF, Word, Excel, PowerPoint, HTML, CSV, EPUB, ZIP and other files
  into Markdown text that language models and search indexes can read. Use when
  a user asks to convert a document to Markdown, turn a PDF or DOCX into text
  for an LLM, export spreadsheet tables as Markdown, prepare files for RAG
  ingestion, batch-convert a folder of office documents, or mentions
  MarkItDown, "markitdown", or "document to markdown".
license: Apache-2.0
compatibility: "Python 3.10-3.14; optional ffmpeg for MP3/M4A audio and exiftool for image metadata"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: ["markdown-conversion", "pdf-to-markdown", "office-documents", "rag-ingestion", "llm-preprocessing"]
  repository: https://github.com/microsoft/markitdown
---
# MarkItDown — Convert documents to Markdown for LLMs

## Overview

MarkItDown is a Python library and command-line tool from Microsoft that turns office documents, PDFs, web pages and archives into Markdown. It keeps the structure a model needs (headings, lists, tables, links) and drops visual layout. Conversion runs locally; cloud services (Azure, an LLM for OCR) are opt-in.

## Instructions

### Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install 'markitdown[all]'
markitdown --version
```

`[all]` pulls every converter. Install fewer extras to keep the environment small, or run the tool once through uv without installing it:

```bash
pip install 'markitdown[pdf,docx,xlsx]'
uvx --from 'markitdown[pdf]' markitdown q3-board-report.pdf
```

Available extras: `pptx`, `docx`, `xlsx`, `xls`, `pdf`, `outlook`, `audio-transcription`, `youtube-transcription`, `az-doc-intel`, `az-content-understanding`, `all`. A missing extra raises `MissingDependencyException` and names the extra to install.

### Convert from the command line

```bash
markitdown q3-board-report.pdf -o q3-board-report.md        # write to a file
markitdown cost-plan-stage-3.xlsx > cost-plan-stage-3.md    # or redirect stdout
cat release-notes.html | markitdown -x html > release-notes.md   # stdin needs a type hint
markitdown handover-pack.zip -o handover-pack.md            # every file inside the ZIP
markitdown "https://docs.python.org/3/library/pathlib.html" -o pathlib.md   # http(s) URL
```

| Flag | Purpose |
|---|---|
| `-o`, `--output` | Output file (default: stdout) |
| `-x`, `--extension` | File-type hint, for stdin input |
| `-m`, `--mime-type` | MIME type hint |
| `-c`, `--charset` | Charset hint, such as `UTF-8` |
| `--keep-data-uris` | Keep base64 images instead of truncating them |
| `-p`, `--use-plugins` | Enable installed third-party plugins |
| `--list-plugins` | List installed plugins and exit |
| `-d`, `--use-docintel` with `-e`, `--endpoint` | Convert with Azure Document Intelligence |
| `--use-cu` with `--cu-endpoint` | Convert with Azure Content Understanding |
| `--cu-analyzer`, `--cu-file-types` | Pick an analyzer; limit which file types go to Azure |

The command exits with status 1 when conversion fails, so a loop can record failures:

```bash
mkdir -p markdown
for f in contracts/*.docx; do
  markitdown "$f" -o "markdown/$(basename "${f%.*}").md" || echo "$f" >> failed.txt
done
```

### Python API

```python
from pathlib import Path

from markitdown import MarkItDown

md = MarkItDown(enable_plugins=False)
result = md.convert_local("contracts/lease-harbour-street.docx")

print(result.title)  # None when the format has no title
Path("lease-harbour-street.md").write_text(result.markdown, encoding="utf-8")
```

Pick the narrowest method that fits the input:

| Method | Accepts |
|---|---|
| `convert_local(path)` | A file on disk only |
| `convert_stream(stream, stream_info=...)` | An open binary stream |
| `convert_response(response)` | A `requests.Response` fetched by the caller |
| `convert_uri(uri)` | `file:`, `data:`, `http:` and `https:` URIs |
| `convert(source)` | Any of the above; the most permissive |

Streams carry no file name, so pass a hint:

```python
from markitdown import MarkItDown, StreamInfo

md = MarkItDown()
with open("uploads/q3-board-report.pdf", "rb") as fh:
    result = md.convert_stream(fh, stream_info=StreamInfo(extension=".pdf"))
print(len(result.markdown))
```

Errors to handle: `FileConversionException` (a converter failed, including a missing extra), `UnsupportedFormatException` (no converter accepts the file), and the built-in `FileNotFoundError`.

### Image descriptions and OCR with an LLM

Out of the box MarkItDown does not OCR. The `markitdown-ocr` plugin sends embedded images and scanned pages to a vision model through an OpenAI-compatible client.

```bash
pip install markitdown-ocr openai
markitdown --list-plugins
```

```python
from markitdown import MarkItDown
from openai import OpenAI

md = MarkItDown(
    enable_plugins=True,
    llm_client=OpenAI(max_retries=5),
    llm_model="gpt-4o",
    llm_prompt="Extract all text from this image, preserving table structure.",
)
result = md.convert("scans/signed-lease-2026.pdf")
print(result.markdown)
```

Without the plugin, `llm_client` and `llm_model` only add descriptions to image files and pictures inside PPTX. The command line has no flags for the LLM client, so OCR needs the Python API. Without `llm_client` the plugin loads but silently skips OCR.

### Azure Document Intelligence and Content Understanding

Both are paid cloud converters for scans, complex tables, audio and video. Copy the endpoint from the resource's **Keys and Endpoint** page in the Azure portal. Authentication uses `AZURE_API_KEY` when that variable is set, otherwise `DefaultAzureCredential` (for example after `az login`).

```bash
pip install 'markitdown[az-doc-intel,az-content-understanding]'

# Document Intelligence: endpoint read from MARKITDOWN_DOCINTEL_ENDPOINT
markitdown scans/drainage-survey.pdf -d -o drainage-survey.md

# Content Understanding: endpoint of a Microsoft Foundry resource
export MARKITDOWN_CU_ENDPOINT="https://fernhill-docs.services.ai.azure.com/"
markitdown recordings/client-call-2026-09-12.wav --use-cu -o client-call-2026-09-12.md
markitdown invoices/2026-08/inv-20817.pdf --use-cu \
  --cu-analyzer prebuilt-invoice --cu-file-types pdf -o inv-20817.md
```

With an analyzer, the output starts with YAML front matter holding the extracted fields. `-d` and `--use-cu` cannot be combined. In Python, pass `docintel_endpoint=`, or `cu_endpoint=` with optional `cu_analyzer_id=` and `cu_file_types=[ContentUnderstandingFileType.PDF]` (imported from `markitdown.converters`), to `MarkItDown()`.

### MCP server and Docker

```bash
pip install markitdown-mcp
markitdown-mcp                                      # STDIO transport
markitdown-mcp --http --host 127.0.0.1 --port 3001  # Streamable HTTP and SSE
```

The server exposes one tool, `convert_to_markdown(uri)`, for `http:`, `https:`, `file:` and `data:` URIs.

```bash
git clone https://github.com/microsoft/markitdown.git
cd markitdown
docker build -t markitdown:latest .
docker run --rm -i markitdown:latest < q3-board-report.pdf > q3-board-report.md
```

## Examples

### Example 1: Spreadsheet and slides into a prompt

**Request:** "Convert q3-revenue.xlsx and the board deck to Markdown so I can paste them into a prompt."

```bash
markitdown q3-revenue.xlsx -o q3-revenue.md
markitdown q3-board-update.pptx -o q3-board-update.md
```

**Result:** every sheet becomes a heading with a table; every slide becomes a block with its notes.

```text
## Q3 Revenue
| Region | July | August | September |
| --- | --- | --- | --- |
| EMEA | 412300 | 398750 | 441900 |
| APAC | 288100 | 301450 | 315200 |

## Headcount
| Team | FTE |
| --- | --- |
| Support | 14 |
| Sales | 9 |
```

```text
<!-- Slide number: 1 -->
# Q3 Board Update
Revenue up 8% quarter over quarter
Churn down to 2.1%

### Notes:
Mention the EMEA pipeline.
```

### Example 2: Convert a folder and report what failed

**Request:** "Convert everything under project-archive/ to Markdown, keep the folder structure, and tell me which files came out empty."

```python
from pathlib import Path

from markitdown import FileConversionException, MarkItDown, UnsupportedFormatException

source, target = Path("project-archive"), Path("archive-md")
wanted = {".pdf", ".docx", ".pptx", ".xlsx", ".msg", ".html", ".csv", ".epub"}
md = MarkItDown(enable_plugins=False)
counts = {"ok": 0, "empty": 0, "failed": 0}

for path in sorted(source.rglob("*")):
    if not path.is_file() or path.suffix.lower() not in wanted:
        continue
    try:
        text = md.convert_local(path).markdown.strip()
    except (FileConversionException, UnsupportedFormatException) as exc:
        counts["failed"] += 1
        print(f"FAILED {path}: {type(exc).__name__}")
        continue
    status = "empty" if len(text) < 50 else "ok"
    counts[status] += 1
    if status == "empty":
        print(f"EMPTY  {path}")
    out = target / path.relative_to(source).with_suffix(".md")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text + "\n", encoding="utf-8")

print(counts)
```

**Result:**

```text
EMPTY  project-archive/2025/mill-lane/drainage-report.pdf
{'ok': 3, 'empty': 1, 'failed': 0}
```

`archive-md/2026/harbour-street/cost-plan-stage-3.md` and the other outputs mirror the source tree. The empty file is a scan; route it through the OCR plugin or Azure.

## Guidelines

- **No OCR by default.** A scanned PDF or a PNG converts to an empty string without an error. Treat very short output as a failure and retry with `markitdown-ocr` or an Azure converter.
- **Damaged files may not raise.** A truncated PDF can fall through to the plain-text converter and return a few bytes. Check output length; do not rely on exceptions alone.
- **Known failures:** password-protected PDFs and corrupt Office files raise `FileConversionException`; legacy `.doc` files raise `UnsupportedFormatException`. Re-save them as unlocked PDF or `.docx` first.
- **Images need a helper.** Image files yield EXIF metadata only when `exiftool` is on `PATH` (or `EXIFTOOL_PATH` is set) and a description only when an LLM client is configured.
- **PDF structure is limited.** Text and tables are extracted, but headings usually arrive as plain lines because PDFs carry no heading markup.
- **Security:** MarkItDown reads files and fetches URLs with the privileges of the process. In a server, never pass user input to `convert()`; use `convert_local()` or `convert_stream()`, restrict paths, and block private, loopback and metadata-service addresses.
- **MCP server:** it has no authentication and can read any file the user can. Keep it bound to `127.0.0.1`.
- **Audio privacy:** built-in transcription uploads the audio to Google's Web Speech API through the SpeechRecognition package. Do not use it for confidential recordings.
- **Cost:** every Azure-routed conversion is a billable API call. Limit it with `--cu-file-types` or `cu_file_types`.
- **Plugins run third-party code** and are off by default. Inspect `markitdown --list-plugins` before enabling them.
- **Web pages:** navigation and footers are converted along with the article, and some sites answer with 403. For article text use a content extractor such as Trafilatura.
- **Pin the version.** The 0.1.x series is classified as beta; flags and output details change between releases.
- **When NOT to use it:** layout-faithful conversion for human readers, editing or generating Office files, or producing PDFs. MarkItDown only reads documents.
