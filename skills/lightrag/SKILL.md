---
name: lightrag
description: >-
  Graph-based RAG library and server that extracts entities and relationships from documents into a knowledge graph and answers questions with local, global, hybrid or mix retrieval. Use when someone asks to "build a graph RAG over my documents", "run lightrag-server", "insert text and query with LightRAG", "pick a QueryParam mode", or "expose a RAG API with a web UI".
license: Apache-2.0
compatibility: "Python 3.10+; an LLM and an embedding model reachable by API or locally (OpenAI, Ollama and others); Docker optional"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "graph-rag, knowledge-graph, rag, python, retrieval"
  repository: https://github.com/HKUDS/LightRAG
---

# LightRAG — graph-based retrieval over your documents

## Overview

LightRAG indexes documents twice: it splits them into chunks stored as vectors, and it asks an LLM to extract entities and relationships from each chunk to build a knowledge graph. At query time it can follow the graph (good for "how are these things connected" and summary-style questions), search the chunk vectors (good for exact facts), or combine both.

It comes in two forms. The Python package `lightrag-hku` is the library: you create a `LightRAG` object, insert text and query it. The same package, installed with the `api` extra, provides `lightrag-server`, a FastAPI service with a web UI, document upload and query endpoints, configured through a `.env` file. An agent can install either, write the configuration, run the server and call its endpoints. The LLM and embedding model must exist; the extraction step makes many LLM calls, so use a capable model.

## Instructions

### Install

The PyPI package is `lightrag-hku` (installed version checked: 1.5.7).

```bash
python3 -m venv .venv
.venv/bin/pip install lightrag-hku            # library only
.venv/bin/pip install "lightrag-hku[api]"     # library + lightrag-server
```

With uv, the server can be installed as a tool: `uv tool install "lightrag-hku[api]"`.

### Library: create, insert, query

`initialize_storages()` is an async method that must be awaited before the first insert or query. Forgetting it is the most common failure. The following mirrors the repository's OpenAI demo and reads the key from `OPENAI_API_KEY`:

```python
import asyncio
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed

async def main():
    rag = LightRAG(
        working_dir="./rag_storage",
        embedding_func=openai_embed,
        llm_model_func=gpt_4o_mini_complete,
    )
    await rag.initialize_storages()

    await rag.ainsert(open("handbook.txt", encoding="utf-8").read())
    answer = await rag.aquery(
        "Which teams own the on-call rotation?",
        param=QueryParam(mode="mix"),
    )
    print(answer)
    await rag.finalize_storages()

asyncio.run(main())
```

`insert` and `query` are synchronous wrappers. `ainsert` takes a string or a list of strings, with optional `ids` and `file_paths` so answers can cite their source. `working_dir` holds the graph, vectors and cache; reuse the same directory to keep the index.

### Query modes

`QueryParam(mode=...)` accepts `local`, `global`, `hybrid`, `naive`, `mix` and `bypass`. The default is `mix`.

| Mode | Retrieval |
|---|---|
| `local` | entities and their neighbourhood (specific, context-dependent questions) |
| `global` | relationships and themes (broad questions) |
| `hybrid` | local plus global |
| `naive` | plain vector search over chunks, no graph |
| `mix` | knowledge graph plus vector search |
| `bypass` | skips retrieval and sends the question to the LLM |

`QueryParam(only_need_context=True)` returns the retrieved context instead of an answer, which is useful for debugging retrieval. `rag.aquery_data(...)` returns the retrieved data in structured form.

### Run the server

Create the configuration file from the repository's `env.example` (download it from the repository root, or run `make env-base` in a clone for an interactive wizard):

```bash
cp env.example .env
```

Edit `.env`. The variables the server reads for models include `LLM_BINDING`, `LLM_MODEL`, `LLM_BINDING_HOST`, `LLM_BINDING_API_KEY`, `EMBEDDING_BINDING`, `EMBEDDING_MODEL` and `EMBEDDING_DIM`. Server settings include `HOST`, `PORT`, `WORKING_DIR` and `INPUT_DIR`. A local Ollama setup looks like:

```bash
HOST=127.0.0.1
PORT=9621
LLM_BINDING=ollama
LLM_MODEL=qwen3:8b
LLM_BINDING_HOST=http://127.0.0.1:11434
EMBEDDING_BINDING=ollama
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024
EMBEDDING_BINDING_HOST=http://127.0.0.1:11434
```

Start it and check health:

```bash
.venv/bin/lightrag-server
curl -s http://127.0.0.1:9621/health
```

The default is `HOST=0.0.0.0`, `PORT=9621`, and with no authentication every endpoint is public. The health response reports the version, the configured bindings and the working directory. Interactive API docs are served by the app (FastAPI `/docs`), and the web UI is on the same port.

For Docker, clone the repository, create `.env` the same way and run `docker compose up`.

### Server API

Endpoints (verified from the installed server's OpenAPI document):

- `POST /documents/upload` — multipart form with a `file` field.
- `POST /documents/text` — JSON body with `text` and optional `file_source`; `POST /documents/texts` inserts several.
- `POST /documents/scan` — index files placed in `INPUT_DIR`.
- `GET /documents/track_status/{track_id}`, `GET /documents/pipeline_status`, `GET /documents/status_counts`, `POST /documents/paginated` — follow indexing.
- `DELETE /documents/delete_document` — JSON body `{"doc_ids": [...]}`.
- `POST /query`, `POST /query/stream`, `POST /query/data` — body has `query`, `mode` and optional `include_references`; `/query` returns `response` and `references`.
- `GET /graphs`, `GET /graph/label/list` — read the knowledge graph.

When authentication is enabled with `LIGHTRAG_API_KEY`, send the key in an `X-API-Key` header.

### Authentication

Set `LIGHTRAG_API_KEY` in `.env` for a shared key, or `AUTH_ACCOUNTS` with `TOKEN_SECRET` for accounts. Generate a bcrypt password entry with `lightrag-hash-password`. Setting `WHITELIST_PATHS=/health` leaves only the health check open. `make env-security-check` audits the `.env` in a clone of the repository.

## Examples

### Example 1 — graph RAG over meeting notes from a script

**Request**: "Index our engineering handbook and ask who owns the on-call rotation."

```bash
python3 -m venv .venv
.venv/bin/pip install lightrag-hku
export OPENAI_API_KEY="$(cat ~/.secrets/openai-key)"   # created in the OpenAI dashboard; set it in your shell, not in code
.venv/bin/python rag_demo.py
```

`rag_demo.py` is the script from "Library: create, insert, query", with `handbook.txt` next to it.

**Result**: the first run makes many LLM calls while it extracts entities, then prints an answer that names the owning teams. `./rag_storage` now contains the graph and vector files; later runs skip re-extraction for text already inserted.

### Example 2 — local server with an API key, upload and query

**Request**: "Run LightRAG on this machine against Ollama and index report.pdf."

```bash
.venv/bin/pip install "lightrag-hku[api]"
# .env contains the Ollama settings above plus: LIGHTRAG_API_KEY=a long random string you generate
.venv/bin/lightrag-server &

curl -s -X POST http://127.0.0.1:9621/documents/upload \
  -H "X-API-Key: $LIGHTRAG_API_KEY" \
  -F "file=@reports/q3-incident-review.pdf"

curl -s -X POST http://127.0.0.1:9621/query \
  -H "X-API-Key: $LIGHTRAG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "What caused the September checkout outage?", "mode": "mix"}'
```

**Result**: the upload returns a `track_id`; follow it at `/documents/track_status/{track_id}` until the document is processed. The query returns JSON with a `response` string and a `references` list naming the source files.

## Guidelines

- Always `await rag.initialize_storages()` after constructing `LightRAG`. Query and insert fail on an uninitialised instance.
- Choose the embedding model before the first insert and keep it. Changing the model or `EMBEDDING_DIM` later invalidates the stored vectors, so use a fresh `working_dir` and re-index.
- Indexing cost scales with document size because every chunk goes through entity extraction. Estimate with a small file first. Use a capable LLM for extraction; very small models tend to produce weak graphs.
- The server binds to all interfaces and is open by default. Bind to `127.0.0.1` or set `LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS` before exposing it. The Ollama-compatible `/api/*` routes stay open unless `WHITELIST_PATHS=/health` is set.
- The default storage backends keep data in files under the working directory. For larger or shared deployments the `.env` file selects other backends (for example PostgreSQL or Neo4j); read the repository's docs before changing them.
- Do not use LightRAG for a few short documents where plain vector search is enough; the graph build adds cost without benefit. For a ready-made web product with parsing pipelines, see RAGFlow.
