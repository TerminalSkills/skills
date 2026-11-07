---
name: pageindex
description: >-
  PageIndex answers questions about long PDFs without a vector database: it builds a table-of-contents tree for each document and lets an LLM walk the tree to the pages that matter, with page-level citations. Use when asked to build vectorless or reasoning-based RAG, "index this 10-K and answer questions", "RAG without embeddings or chunking", or to get a document's tree structure as JSON. Covers the open-source Python SDK in local mode and the run_pageindex.py script.
license: Apache-2.0
compatibility: "Python 3.10+, an LLM API key (OPENAI_API_KEY by default) or a Claude Code subscription"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "rag, vectorless-rag, pdf, document-qa, llm"
  repository: https://github.com/VectifyAI/PageIndex
---
# PageIndex — Vectorless, reasoning-based RAG over long documents

## Overview

PageIndex replaces the embedding index with a **tree index**: a hierarchy of sections (title, page range, short summary) that mirrors the document's own structure. To answer a question, an LLM reads the tree, decides which sections are relevant, reads those pages, and answers. There is no chunking, no embedding model and no vector store. Answers can be traced back to the pages that were read.

It fits long, structured, text-based PDFs: annual reports, regulatory filings, contracts, manuals, textbooks. It is a poor fit for many tiny documents or for "find anything similar to this sentence" search, where a vector index is simpler.

The SDK (`pip install pageindex`, imported as `pageindex`) has two modes behind one `PageIndexClient`:

- **Local** (open source, used in this skill): text-based PDFs are indexed on your machine, trees are stored in a local directory, and your own LLM key does the summarizing and the chat. Citations are page-level.
- **Cloud** (PageIndex's hosted service, needs a `PAGEINDEX_API_KEY` from developer.pageindex.ai): adds OCR for scans, block-level citations, folders, metadata and an MCP server. It is an account-bound product; this skill does not teach its calls beyond naming the switch (`index="cloud"`).

## Instructions

### Installation

```bash
python3 -m venv .venv
.venv/bin/pip install -U pageindex
# Optional: use a Claude Code subscription instead of API keys
.venv/bin/pip install -U "pageindex[claude]"
```

Local mode calls an LLM through LiteLLM. Bare model names are OpenAI models; other providers use `provider/model`. Export the key of the provider you use:

```bash
export OPENAI_API_KEY="..."   # create at platform.openai.com/api-keys
```

### Index a PDF and ask a question (local mode)

```python
from pageindex import PageIndexClient

client = PageIndexClient(
    index="gpt-6-luna",   # model that builds and summarizes the tree
    chat="gpt-6-sol",     # model that searches the tree and answers
)

doc_id = client.submit_document("reports/acme-10k-2025.pdf")["doc_id"]
answer = client.chat("What was the 2025 operating margin?", doc_id=doc_id)
print(answer)
```

Those two model names are the SDK's own defaults in its `config.yaml`. Substitute any model your key can use.

Choosing models:

- `index=`: a basic, cheap model is enough. The tree shape comes from the PDF layout; the model only writes and refines summaries. The README measures about $0.001 per page with a small `luna`-class index model.
- `chat=`: use the strongest model you can afford, because it does the reasoning that finds the right pages. Query cost depends on this model.

Index trees are saved in a `.pageindex` directory (default) in the current working directory. Change it by putting the path in the index slot, `index={"model": "gpt-6-luna", "storage_path": "/data/pageindex"}` (or use the flat spelling `index_model=`, `chat_model=`, `storage_path=` together); mixing `index="..."` with a separate `storage_path=` raises an error. Re-use the same `doc_id` on later runs instead of re-indexing; `client.list_documents()` shows what is stored.

### Use a Claude subscription

With the `[claude]` extra installed and Claude Code signed in, prefix model names with `claude-code/`; no API key is needed:

```python
client = PageIndexClient(
    index="claude-code/haiku",
    chat="claude-code/opus",
)
```

### Inspect the tree and read pages

```python
tree = client.get_document_structure(doc_id)        # titles, page ranges, summaries
pages = client.get_page_content(doc_id, "45-47")    # '5-7', '3,8' or '12'
print(client.get_document(doc_id))                  # document metadata
```

Read the tree first when an answer looks wrong: if the right section is missing or badly titled, the retrieval cannot find it.

### Ask for citations

```python
answer = client.chat(
    "Which risks does the filing list under supply chain?",
    doc_id=doc_id,
    citations=True,
)
for c in client.get_citations(answer, doc_id=doc_id):
    print(c["document"], c["page"])
```

`chat(..., citations=True)` makes the model tag its claims with the pages it used; `get_citations` parses those tags into `{"document", "page"}` entries. Check a few against the PDF before relying on them: the tags are model output.

### Several documents and streaming

`doc_id` accepts a list for multi-document questions, and `stream=True` returns an iterator instead of a string:

```python
answer = client.chat(
    "Compare the capital expenditure plans of both filings.",
    doc_id=[doc_id_2024, doc_id_2025],
)
```

### Index from the command line with the repo script

The repository ships `run_pageindex.py`, which writes the tree to JSON without the SDK client. It needs a clone of the repo:

```bash
git clone https://github.com/VectifyAI/PageIndex.git
cd PageIndex
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run_pageindex.py --pdf_path ../reports/acme-10k-2025.pdf
```

The default `--mode flash` is fast and handles text-based PDFs; `--mode standard` is the older, slower method with extra tuning flags (`--toc-check-pages`, `--max-pages-per-node`, `--max-tokens-per-node`, `--if-add-node-text`). `--md_path notes.md` indexes a Markdown file by its headings. Use `--index-model` to pick the model. `--no-summary --optimize off` (flash, PDF only) builds the tree with no LLM call and no API key, which is the quickest way to check how a PDF is parsed. The result is saved to `./results/` as the PDF name plus `_structure.json`.

### Plug the tree into your own agent

`client.agent_tools()` returns plain Python functions (find documents, read the structure, read pages) for any agent framework; `as_openai_tools()` and `as_claude_mcp()` do the same for the OpenAI Agents SDK and the Claude Agent SDK. Use them when you want your agent, not `client.chat`, to drive the retrieval.

## Examples

### Example 1: Answer questions about an annual report

**Request:** "Index `reports/northwind-annual-2025.pdf` and tell me the 2025 operating margin and where it is stated."

```python
from pageindex import PageIndexClient

client = PageIndexClient(index="gpt-6-luna", chat="gpt-6-sol")
doc_id = client.submit_document("reports/northwind-annual-2025.pdf")["doc_id"]

answer = client.chat(
    "What was the 2025 operating margin, and on which page is it stated?",
    doc_id=doc_id,
    citations=True,
)
print(answer)
print(client.get_citations(answer, doc_id=doc_id))
```

**Result:** the first run builds the tree (seconds to a few minutes depending on page count) and stores it under `.pageindex`. The printed answer gives the margin with a page reference, and `get_citations` lists the cited pages. Running `get_page_content(doc_id, "41")` on one of them confirms the number.

### Example 2: Export the tree of a contract for review

**Request:** "Give me the section outline of `contracts/master-services-agreement.pdf` as JSON so I can check the structure."

```bash
git clone https://github.com/VectifyAI/PageIndex.git ~/src/PageIndex
cd ~/src/PageIndex
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run_pageindex.py --pdf_path ~/contracts/master-services-agreement.pdf --no-summary --optimize off
python3 -c "import json; [print(n.get('title'), n.get('start_index')) for n in json.load(open('results/master-services-agreement_structure.json'))['structure']]"
```

**Result:** no API key is needed because summaries and expansion are off. `results/master-services-agreement_structure.json` holds the tree (keys `doc_name`, `doc_title`, `structure`, with `title`, `node_id`, `start_index`, `end_index` and nested `nodes`); the one-liner prints each top-level section title and its start page. Wrong or missing titles show where the PDF has no usable layout, before any question is asked.

## Guidelines

- Local mode targets **text-based PDFs**. Scanned or image-heavy files need the hosted Cloud mode (OCR); do not expect local indexing to read them.
- Index once, query many times. Store `doc_id` values and the `.pageindex` directory; re-indexing costs LLM calls.
- Keep API keys in environment variables and out of the repository. Document text and summaries are sent to the LLM provider you configure; for confidential files use a provider you are cleared to send them to.
- Do not run it on very short documents or on a large pile of small ones: a plain prompt with the full text, or a vector index, is simpler there.
- Citations are page-level in local mode. Verify important ones against the PDF.
- The tree can be wrong when the PDF has no table of contents or odd layout. Look at `get_document_structure` before blaming the chat model.
- Pin the `pageindex` version in production; the SDK is young and its options change between releases.
