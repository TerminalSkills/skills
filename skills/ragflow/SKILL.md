---
name: ragflow
description: >-
  Self-hosted RAG engine that parses complex documents (PDFs, Office files, scans, tables) into searchable chunks and serves them through a web UI, an HTTP API and a Python SDK. Use when someone asks to "deploy RAGFlow", "build a knowledge base over our PDFs", "create a chat assistant over my documents", "upload and parse files through the RAGFlow API", or "retrieve chunks with ragflow-sdk".
license: Apache-2.0
compatibility: "Docker 24.0.0+ with Compose 2.26.1+, 4 CPU cores, 16 GB RAM, 50 GB disk recommended; Python 3.13 for the ragflow-sdk package"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "rag, document-parsing, knowledge-base, docker, python-sdk"
  repository: https://github.com/infiniflow/ragflow
---

# RAGFlow — document-aware RAG engine you host yourself

## Overview

RAGFlow turns a pile of documents into a knowledge base an LLM can answer from. Its strength is the ingestion side: layout analysis, OCR and table recognition split PDFs, Word, slides, spreadsheets and images into chunks that keep their structure, and each chunk keeps a pointer back to its source document. You then query the chunks directly (retrieval) or through a chat assistant that cites them.

Everything is managed through three surfaces that share one data model: the web UI, the HTTP API under `/api/v1`, and the `ragflow-sdk` Python package (a thin wrapper over that API). An agent can realistically do the following: bring the stack up with Docker Compose, check readiness, then create datasets, upload and parse documents, run retrieval and create chat assistants through the SDK. Account creation, adding the model provider keys and generating the API key are done once in the web UI.

## Instructions

### Deploy with Docker Compose

RAGFlow ships as a Compose project in the repository. The README pins deployment to a release tag; at the time of writing it is `v1.0.0-rc2`, a release candidate (the same tag is the default `RAGFLOW_IMAGE` in `docker/.env`). Read the README of the repository for the current tag before cloning.

```bash
git clone https://github.com/infiniflow/ragflow.git
cd ragflow/docker
git checkout v1.0.0-rc2
docker compose -f docker-compose.yml up -d
```

The image is large and the stack starts several dependencies (document engine, MySQL, object storage, Redis-compatible store), so the first start takes minutes. With the default MySQL configuration, the entrypoint runs the database migrations itself.

If the default document engine (Elasticsearch, `DOC_ENGINE` in `docker/.env`) is used, the Docker host needs a raised memory-map limit, otherwise the engine container exits:

```bash
sysctl vm.max_map_count
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

The README says this step is usually unnecessary when `DOC_ENGINE=infinity`. Other engines listed in `docker/.env` include `opensearch`, `oceanbase`, `seekdb`, `gaussdb` and `vastbase`.

### Check that it is ready

The RAGFlow container has no Compose healthcheck, so wait for the dependencies to show `healthy` and then poll the HTTP endpoint:

```bash
docker ps
curl -f http://localhost/api/v1/system/healthz
docker logs --tail 50 ragflow-cpu
```

A 200 response means the web UI is ready. If you changed `SVR_WEB_HTTP_PORT` in `docker/.env`, use that port in the URL. The default published ports are 80 and 443 (web), 9380 (API) and 9381 (admin).

### One-time setup in the web UI

1. Open `http://localhost` and register the first account.
2. On the model provider page add a chat model, an embedding model and (optionally) a reranker, each with its service address and API key. Without a chat and an embedding model, parsing and chat do not work.
3. Click your avatar, open the **API** page and create an API key. Store it in an environment variable such as `RAGFLOW_API_KEY`; never commit it.

### Python SDK

```bash
python3.13 -m venv .venv
.venv/bin/pip install "ragflow-sdk==1.0.0rc2"
```

The SDK version should match the server release. A plain `pip install ragflow-sdk` skips pre-releases and installs the older 0.27.x line, so pin the `1.0.0rc2` build that corresponds to the `v1.0.0-rc2` server tag (this is a release candidate; the README names it as the current deployment tag). PyPI lists the package as requiring Python `>=3.13,<3.14`; the calls below are identical in `0.27.3` and `1.0.0rc2`. The client takes the API key and the server address without the `/api/v1` suffix (the SDK appends it):

```python
import os
from ragflow_sdk import RAGFlow

rag = RAGFlow(api_key=os.environ["RAGFLOW_API_KEY"], base_url="http://127.0.0.1:9380")
```

Port 9380 is the API service; `http://localhost` through the web port also fronts the same `/api/v1` routes.

### Datasets, documents and parsing

```python
dataset = rag.create_dataset(name="vendor-contracts-2026", description="Signed supplier contracts")

with open("contracts/northwind-msa.pdf", "rb") as f:
    blob = f.read()
dataset.upload_documents([{"display_name": "northwind-msa.pdf", "blob": blob}])

docs = dataset.list_documents(keywords="northwind")
ids = [d.id for d in docs]

dataset.parse_documents(ids)          # blocks until parsing finishes
# dataset.async_parse_documents(ids)  # returns immediately; poll list_documents()
```

`create_dataset` also accepts `embedding_model`, `chunk_method` (default `"naive"`), `permission` (default `"me"`) and `parser_config`. Other lifecycle calls: `rag.list_datasets(name=...)`, `rag.get_dataset(name)`, `dataset.update({...})`, `dataset.delete_documents(ids=[...])`, `rag.delete_datasets(ids=[...])`. Individual chunks are reachable through `document.list_chunks()`, `document.add_chunk(content=...)` and `document.delete_chunks(ids=[...])`.

### Retrieval without an LLM

`rag.retrieve` returns ranked chunks, which is what you want when another system writes the answer:

```python
chunks = rag.retrieve(
    dataset_ids=[dataset.id],
    question="What is the notice period for terminating the Northwind agreement?",
    page_size=5,
    similarity_threshold=0.2,
    vector_similarity_weight=0.3,
)
for c in chunks:
    print(round(c.similarity, 3), c.document_name, c.content[:120])
```

Each `Chunk` carries `content`, `document_name`, `document_id`, `similarity`, `vector_similarity`, `term_similarity` and `positions`. Further keyword arguments include `document_ids`, `top_k`, `rerank_id`, `keyword`, `use_kg` and `metadata_condition`.

### Chat assistants

```python
chat = rag.create_chat(name="contracts-assistant", dataset_ids=[dataset.id])
session = chat.create_session("legal-review")

for message in session.ask("Which contracts renew automatically?", stream=False):
    print(message.content)
```

`create_chat` also accepts `llm_id`, `llm_setting` and `prompt_config`. `ask(..., stream=True)` yields partial messages as they arrive. Use `rag.list_chats()`, `chat.list_sessions()` and `rag.delete_chats(ids=[...])` to manage them.

### HTTP API

The SDK is a wrapper over REST calls with a Bearer token, so anything the SDK does can be done with plain HTTP:

```bash
curl -s -X POST http://127.0.0.1:9380/api/v1/retrieval \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "notice period for termination", "dataset_ids": ["'$RAGFLOW_DATASET_ID'"]}'
```

`RAGFLOW_DATASET_ID` is the `id` that `create_dataset` returned. Responses carry a `code` field; `0` means success and anything else comes with a `message`.

## Examples

### Example 1 — stand up RAGFlow and prove it is ready

**Request**: "Install RAGFlow on this server so the legal team can try it."

```bash
git clone https://github.com/infiniflow/ragflow.git
cd ragflow/docker
git checkout v1.0.0-rc2
sudo sysctl -w vm.max_map_count=262144
docker compose -f docker-compose.yml up -d
docker ps
curl -f http://localhost/api/v1/system/healthz
```

**Result**: the dependency containers show `healthy`, the `ragflow-cpu` container stays up, and the healthcheck returns HTTP 200. The agent then tells the user to open `http://localhost`, register, add the chat and embedding model keys and create an API key, since those steps need the user's own credentials.

### Example 2 — load a folder of PDFs and query it

**Request**: "Index everything in ./contracts into RAGFlow and tell me which agreements mention a 90-day notice period."

```python
import os
from pathlib import Path
from ragflow_sdk import RAGFlow

rag = RAGFlow(api_key=os.environ["RAGFLOW_API_KEY"], base_url="http://127.0.0.1:9380")
dataset = rag.create_dataset(name="vendor-contracts-2026")

files = [{"display_name": p.name, "blob": p.read_bytes()} for p in Path("contracts").glob("*.pdf")]
docs = dataset.upload_documents(files)
dataset.parse_documents([d.id for d in docs])

for c in rag.retrieve(dataset_ids=[dataset.id], question="90-day notice period", page_size=5):
    print(f"{c.similarity:.2f}  {c.document_name}: {c.content[:100]}")
```

**Result**: a list of up to five chunks, each tagged with the contract it came from and a similarity score, so the agent can name the agreements and quote the clause.

## Guidelines

- Pin the Compose checkout to the release tag the README names; running `main` with an older image (or the reverse) is a common source of broken startups. Keep the SDK and the server on matching generations and upgrade both if calls fail with unexpected `code`/`message` responses.
- Plan for the memory limit: the README's starting point is 4 cores, 16 GB RAM and 50 GB disk, and parsing large scanned files is the heavy part. In the 1.0 release DeepDoc layout analysis, OCR and table recognition run on CPU.
- `docker/.env` ships with default passwords for Elasticsearch, MySQL and Redis. Change them before exposing the host to anyone else.
- Compose publishes ports 80, 443, 9380 and 9381 on the host. Firewall them or put a reverse proxy with TLS in front before using the server beyond localhost.
- Parsing is asynchronous. `parse_documents` waits; `async_parse_documents` does not, so poll `list_documents` before querying freshly uploaded files.
- Model keys, the API key and the document passwords belong in environment variables or a secret store, never in the skill output or the repository.
- Do not use RAGFlow for a handful of short text files; a plain vector store or a long-context prompt is simpler. Launching from source (Go services, see the repository README) is meant for RAGFlow development, not for running a knowledge base.
