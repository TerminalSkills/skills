---
name: mineru
description: >-
  Converts PDFs, scanned pages, images and Office files into Markdown or
  structured JSON with MinerU, keeping headings, reading order, tables and
  formulas. Use when a user asks to turn a complex or scanned PDF into
  Markdown, extract tables from a PDF report, OCR a document for an LLM,
  batch-convert a folder of papers or reports, or let an agent read a long
  document page by page with citable locators. Runs locally on CPU or GPU;
  cloud parsing only when explicitly requested.
license: Apache-2.0
compatibility: "Python 3.10-3.14; MinerU 4.x; CPU works (8 GB RAM for standard tier), NVIDIA GPU with 8 GB+ VRAM or Apple Silicon for speed"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: ["pdf-to-markdown", "ocr", "document-parsing", "table-extraction", "rag-ingestion"]
  repository: https://github.com/opendatalab/MinerU
---
# MinerU — Layout-Aware PDF and Document Parsing

## Overview

MinerU (by OpenDataLab) parses documents into clean Markdown and a structured JSON model. It handles the hard cases that plain text extractors break on: multi-column layouts, scanned pages, tables, formulas and figures. Version 4.x ships two command-line tools:

- `mineru-kit` — stateless tools: one-off or batch conversion (`mineru-kit parse`), model downloads, a self-hosted V1 HTTP API and a Gradio WebUI.
- `mineru` — a local "document library" for agents: a background server that caches parses, searches parsed content and returns stable locators such as `doc:7f3e9c1/tier:standard/page:12/block:4` for continuation and citations.

Quality is chosen with four tiers. PDFs and images support all of them; Office, OpenDocument, RTF, EPUB, OFD, HTML/MHTML and CSV/TSV are always parsed natively at `flash`.

| Tier | What runs | Use for |
| --- | --- | --- |
| `flash` | PDF text layer, native Office parsing, or fast Flash OCR for scans and images | Previews, indexing, DOCX/PPTX/XLSX |
| `basic` | Small layout, OCR, table and formula models (ONNX or Torch) | Scans and tables on CPU (~0.8 GB models) |
| `standard` | Small models plus a vision-language model | Complex layouts, default for PDFs (~2 GB models) |
| `advanced` | Same models as standard, more inference compute | Hardest documents, slowest |

Parsing is local by default. Documents go to the official cloud service only when a command includes `--remote`.

## Instructions

### Installation

Install into an isolated environment. Python 3.12 is the documented starting point.

```bash
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -U "mineru>=4.0,<5"
mineru version --json
```

As a global CLI instead: `uv tool install --python 3.12 "mineru>=4.0,<5"` or `pipx install "mineru>=4.0,<5"`.

The base package runs small models on ONNX/CPU and the VLM on llama.cpp. Extras change the engines:

```bash
# Torch small models (GPU/MPS); Apple Silicon already gets this in the base package
uv pip install -U "mineru[torch]>=4.0,<5"
# NVIDIA GPU with 8 GB+ VRAM and 16 GB+ RAM: adds vLLM on Linux, LMDeploy on Windows
uv pip install -U "mineru[full]>=4.0,<5"
```

The 3.x extras (`mineru[core]`, `mineru[pipeline]`) and the `mineru -p input.pdf -o out` syntax no longer exist in 4.x.

### Download and verify models

`flash` is model-free only for native documents (DOCX, PPTX, HTML...) and for text-layer PDFs with `--ocr-mode txt`. On images and scanned PDFs it runs Flash OCR models, fetched on first use. For `basic`/`standard`, download once and verify; otherwise the first model-backed parse may download weights itself.

```bash
mineru-kit models download --tier basic
mineru-kit models verify --tier basic
mineru-kit models show            # effective small backend, VLM engine, missing repos
```

```bash
# Standard tier on a CPU-only box, pinned to ONNX + llama.cpp
mineru-kit models download --tier standard --small-backend onnx --vlm-engine llama-cpp
mineru-kit models verify --tier standard --small-backend onnx --vlm-engine llama-cpp
```

Models live under `$MINERU_HOME/models` (`MINERU_HOME` defaults to `~/.mineru`). If Hugging Face is blocked, set `MINERU_MODEL_SOURCE=modelscope`; if only Xet downloads fail, set `HF_HUB_DISABLE_XET=1`. `advanced` has no separate download — it reuses the standard models.

### Convert files with mineru-kit parse

`mineru-kit parse` writes complete outputs and keeps no cache. It defaults to all PDF pages and to `standard` for PDFs and images.

```bash
# One PDF to one Markdown file
mineru-kit parse q3-vendor-report.pdf -o q3-vendor-report.md --tier basic

# Only some pages: 1-based, inclusive, r1 = last page
mineru-kit parse annual-report-2025.pdf -o summary.md --pages "1-5,r3-r1"

# Digital PDF, text layer only, no models (tables come out as loose text)
mineru-kit parse contract.pdf -o contract.md --tier flash --ocr-mode txt

# Office files are parsed natively at flash
mineru-kit parse board-deck.pptx -o board-deck.md
```

Batch a directory (one level, not recursive). With several inputs `-o` must be a directory; two inputs with the same base name make the whole batch fail.

```bash
mineru-kit parse ./vendor-reports -o ./parsed --format zip
```

`--format` accepts `markdown` (default), `middle_json` and `zip`. Each ZIP holds `markdown.md`, `middle_json.json`, `structured_content.json`, `model_output.json` and an `images/` folder when the document has figures. `--ocr-mode` is `auto`, `txt` or `ocr`; `--disable-image-analysis` skips image analysis.

### Read long documents with the mineru document library

The `mineru` command talks to a local background server that caches results per document and tier. On a fresh install its local parse server is **disabled**: every PDF/image parse without `--tier flash` fails with `quality_tier_unavailable` (or `no_engine` for an explicit `--tier basic`), and downloading models alone does not change that. The library never falls back to `flash` or to the cloud by itself.

One-time setup. The `config` commands need the server running and change persistent settings, so ask the user first and pick `basic` (plain CPU, or NVIDIA with 4 GB VRAM) or `standard` (Apple Silicon, NVIDIA with 8 GB+ VRAM, or a modern iGPU):

```bash
mineru-kit models download --tier basic
mineru-kit models verify --tier basic
mineru server start
mineru config set parse_server.local.managed_tier basic   # set the tier first
mineru config set parse_server.local.mode managed
mineru server status --json   # repeat until parse_server.local.healthy is true
```

A `standard` server also serves `basic` and `advanced` requests. Then read documents:

```bash
mineru parse "Harbor Street appraisal 2025.pdf" --json
```

`mineru parse` reads only the first 10 PDF pages by default and prints about 30,000 characters. When more exists it appends a continuation marker such as `<!-- Next: mineru read doc:7f3e9c1/tier:standard/page:11 -->`; with `--json`, follow `next_request`.

```bash
mineru read "doc:7f3e9c1/tier:standard/page:11" --limit 12000 --json
mineru read "doc:7f3e9c1/tier:standard/page:14/block:3" --context 1
mineru read "doc:7f3e9c1/tier:standard/page:14" --format image --output ./page14.png
mineru search "lease expiration" --json
mineru parse "Harbor Street appraisal 2025.pdf" --pages all -o appraisal.md --wait 600
```

Branch on `error.code` in JSON output:

- `server_not_running` → `mineru server start`.
- `quality_tier_unavailable` or `no_engine` → run `mineru server status --json`. If `parse_server.local.mode` is `disabled` or `supported_tiers` is empty, offer the user the choices: enable managed mode as above, accept a lower-quality `--tier flash`, or `--remote` (uploads the file; only with consent). Wait for their answer.
- `parse_wait_timeout` → the parse keeps running; rerun the same command or check `mineru list parses --status parsing`.

### Python SDK

```python
from pathlib import Path
from mineru.parser import parse
from mineru.parser.writer import FileBasedDataWriter
from mineru.render import render, RenderFormat

result = parse("q3-vendor-report.pdf", tier="basic", page_range="1-8")
Path("q3-vendor-report.md").write_text(result.markdown(), encoding="utf-8")

html = render(result.middle_json, RenderFormat.HTML)   # also LATEX, DOCX, EPUB, PDF
Path("q3-vendor-report.html").write_text(html, encoding="utf-8")

result.save(FileBasedDataWriter("q3-parsed"))  # markdown.md, middle_json.json, images/
```

`parse()` takes `tier` (default `standard`), `ocr_mode`, `image_analysis` and `page_range`. Pass `tier="flash"` for DOCX, PPTX and other native formats.

### Self-hosted API and WebUI

```bash
mineru-kit api-server --host 127.0.0.1 --port 8000 --tier standard   # OpenAPI docs at /docs
mineru-kit webui --server-name 127.0.0.1 --server-port 7860
```

The API surface is `/v1/*` (uploads, parse jobs, files); the 3.x `/file_parse` and `/tasks` routes are gone. Without `--api-url`, the WebUI starts and manages its own local API server.

## Examples

### Example 1: Turn a folder of scanned maintenance reports into Markdown tables

**User request:** "I have 12 scanned facility maintenance reports in ./maintenance-reports. Convert them to Markdown so the cost tables stay tables — no GPU on this laptop."

```bash
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -U "mineru>=4.0,<5"
mineru-kit models download --tier basic && mineru-kit models verify --tier basic
mineru-kit parse ./maintenance-reports -o ./parsed --tier basic --format zip
```

**Result:** `./parsed` holds `harbor-street-q3.zip` and eleven more ZIPs, one per input. Each `markdown.md` keeps headings and real tables:

```text
## Q3 2026 Maintenance Report

| Site | Work orders | Cost (USD) |
| --- | --- | --- |
| Harbor Street | 14 | 18,420 |
| Mill Road | 9 | 7,310 |
```

At `--tier flash` the same scan goes through Flash OCR and the table comes back as an aligned plain-text code block, not a Markdown table; a digital PDF read with `--tier flash --ocr-mode txt` splits it into loose lines. Use `basic` or higher whenever tables matter.

### Example 2: Let the agent read a 180-page appraisal and cite pages

**User request:** "Find the cap rate and every deferred-maintenance item in 2847-industrial-pkwy-appraisal.pdf and tell me which page each came from."

The agent checks `mineru server status --json` first. The server is down, so it starts it; `supported_tiers` already lists `basic` and `standard` (managed mode was set up earlier, see Instructions). A 180-page model-backed parse outlasts the default 60 s client wait, so it passes a longer one:

```bash
mineru server start
mineru server status --json
mineru parse 2847-industrial-pkwy-appraisal.pdf --pages all --json --limit 12000 --wait 900
mineru search "deferred maintenance" --json
mineru read "doc:c41a9e2/tier:standard/page:63" --context 1 --json
```

If the parse still returns `parse_wait_timeout`, the agent reruns the same `mineru parse` command (or watches `mineru list parses --status parsing`) and searches only after the status is `done`. If `supported_tiers` were empty, it would stop and offer managed-mode setup or `--tier flash` instead of parsing.

**Result:** the agent answers from `content.content`, follows `next_request` only as far as needed, and cites locators: "Cap rate 6.4% (doc:c41a9e2/tier:standard/page:12/block:5); roof membrane replacement, $120,000 (page 63)." Because this session started the server, it runs `mineru server stop` at the end; a server that was already running stays up unless the user says otherwise.

### Example 3: Convert Word and PowerPoint files for a knowledge base

**User request:** "Convert onboarding-handbook.docx and sales-kickoff-2026.pptx to Markdown for our wiki import."

```bash
mineru-kit parse onboarding-handbook.docx -o wiki/onboarding-handbook.md
mineru-kit parse sales-kickoff-2026.pptx -o wiki/sales-kickoff-2026.md
```

**Result:** both files parse at `flash` in seconds with no model download; tables in the Word file come through as Markdown tables. Passing `--tier basic` or `--pages` for these formats is an error, since only PDFs and images take quality tiers, and only PDFs take page ranges.

## Guidelines

- **Pick the tier on purpose.** `flash` is for previews and native Office files; on digital PDFs it reads the text layer, on scans and images it runs fast OCR, and in both cases tables do not come out as Markdown tables. Use `basic` for scans and tables on CPU, `standard` for multi-column papers, formulas and mixed layouts.
- **Two page defaults.** `mineru parse` starts with the first 10 PDF pages; `mineru-kit parse` and `parse()` take all pages. `mineru parse -o` exports only the requested pages, so add `--pages all` for a full export.
- **Privacy.** Everything runs locally unless `--remote` is given; never add it for contracts, medical, financial or personal documents without the user's consent. Remote parsing reads `MINERU_API_KEY` (issued by the mineru.net service); keep it in the environment, not in scripts.
- **Telemetry.** MinerU may send anonymous usage statistics (no content or file names). Turn it off with `mineru telemetry disable` (the command needs the `mineru` server running).
- **Servers.** `mineru server start` runs a background process. Stop it at the end only if this session started it; the user may keep a persistent library with watches, so ask before stopping or restarting a server that was already running, and before any `mineru config set`. It binds a Unix socket inside `MINERU_HOME`, so a very long `MINERU_HOME` path fails with `AF_UNIX path too long`; use a shorter `MINERU_HOME`, or export `MINERU_DOCLIB_UDS_ENABLED=false` and `MINERU_DOCLIB_TCP_ENABLED=true` for every `mineru` call so the server listens on 127.0.0.1:15980 instead.
- **Timeouts are not failures.** A `mineru parse` wait timeout exits with code 1 while the parse continues; check `mineru list parses --status parsing` or rerun the same command. Give first runs a longer `--wait`.
- **Hardware.** Standard needs about 8 GB RAM on CPU (a Vulkan-capable GPU is recommended for llama.cpp); NVIDIA users get best throughput from `mineru[full]`. AMD and other vendor accelerators, and the old Docker images for them, stay on `mineru<4`. The 4.x Dockerfile targets NVIDIA only.
- **License.** The MinerU Open Source License is Apache 2.0 plus conditions: a separate commercial license above 100M monthly active users or USD 20M monthly revenue, and online services built on MinerU must credit it.
- **When not to use it.** Plain `.txt`/`.md` files need no parsing. For simple digital DOCX or HTML where layout does not matter, a lighter converter such as markitdown installs faster. MinerU is a parser, not a RAG framework or vector store — hand its Markdown to your chunker and embedder.
