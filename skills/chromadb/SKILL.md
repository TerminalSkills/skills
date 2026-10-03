---
name: chromadb
description: >-
  Assists with storing, searching, and managing vector embeddings using ChromaDB. Use when
  building RAG pipelines, semantic search engines, or recommendation systems. Trigger words:
  chromadb, chroma, vector database, embeddings, semantic search, similarity search,
  vector store, rag.
license: Apache-2.0
compatibility: "Python 3.9+ (chromadb 1.5) or Node.js via the chromadb npm package (3.x)"
metadata:
  author: terminal-skills
  version: "1.2.0"
  repository: https://github.com/chroma-core/chroma
  category: data-ai
  tags: ["chromadb", "vector-database", "embeddings", "rag", "semantic-search"]
---

# ChromaDB

## Overview

ChromaDB is an open-source vector database for storing, searching, and managing embeddings. It provides a simple API for document ingestion, semantic similarity search, and metadata filtering, supporting both Python and JavaScript/TypeScript clients with embedded, server, and cloud deployment options.

## Instructions

- Install with `pip install chromadb` (checked against 1.5.9, October 2026) or `npm install chromadb` for JavaScript.
- Initialize with `get_or_create_collection` for idempotent setup. Use `PersistentClient(path="./chroma_data")` for local work, `HttpClient(host="localhost", port=8000)` against a server (`chroma run --path ./chroma_data`, or the `chromadb/chroma` Docker image, which keeps data in `/data`), and `CloudClient` for Chroma Cloud. `list_collections()` returns `Collection` objects since 1.0.
- Adding documents: batch `add()`/`upsert()` calls below `client.get_max_batch_size()` (5,461 in the 1.5 line, so 5,000 per call is safe), always store source metadata (filename, URL, page) for citations, and use `upsert()` for re-ingestion.
- Embeddings: with no `embedding_function`, Chroma downloads a small ONNX copy of all-MiniLM-L6-v2 on first use (about 80 MB) and runs it locally. Pass an OpenAI, Cohere or other embedding function for production, or pass your own `embeddings=` vectors and set `embedding_function=None`. Query with the same function you ingested with: it is stored with the collection configuration.
- Querying: `collection.query(query_texts=[...], n_results=5, where={...}, where_document={"$contains": "refund"})`. Results are lists of lists, one per query. Metadata operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, combined with `$and`/`$or`. Use `get()` to fetch by ids or filter without similarity.
- Distance and index tuning go in `configuration={"hnsw": {"space": "cosine", "ef_construction": 200, "max_neighbors": 16, "ef_search": 100}}` at creation (`space` is `l2` by default; `cosine` and `ip` also exist). The old `metadata={"hnsw:space": ...}` style is replaced by `configuration`. The space cannot be changed after creation.
- Returned `distances` are distances, lower is closer; for cosine, similarity is `1 - distance`.

A minimal local server and client check:

```bash
chroma run --path ./chroma_data --host 127.0.0.1 --port 8000
```

```python
import chromadb
client = chromadb.HttpClient(host="127.0.0.1", port=8000)
print(client.heartbeat())   # nanosecond timestamp when the server is up
```

## Examples

### Example 1: Build a document Q&A pipeline

**User request:** "Set up a RAG pipeline with ChromaDB for answering questions about our docs"

```python
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

client = chromadb.PersistentClient(path="./chroma_data")
docs = client.get_or_create_collection(
    "product-docs",
    embedding_function=OpenAIEmbeddingFunction(model_name="text-embedding-3-small"),  # reads OPENAI_API_KEY
    configuration={"hnsw": {"space": "cosine"}},
)
docs.upsert(
    ids=["billing-p1-c0", "billing-p1-c1"],
    documents=["Invoices are issued on the 1st of each month.", "Refunds take 5 business days."],
    metadatas=[{"source": "billing.pdf", "page": 1}, {"source": "billing.pdf", "page": 1}],
)
hits = docs.query(query_texts=["How long do refunds take?"], n_results=3)
print(hits["documents"][0][0], hits["metadatas"][0][0])
```

Pass the retrieved chunks and their `source`/`page` to the LLM as context and cite them.

### Example 2: Filtered semantic search

**User request:** "Implement product search that combines text similarity with category filters"

```python
products = client.get_or_create_collection("products")
res = products.query(
    query_texts=["noise cancelling headphones"],
    n_results=5,
    where={"$and": [{"category": "electronics"}, {"price": {"$gte": 50}}, {"price": {"$lte": 300}}]},
)
for pid, dist in zip(res["ids"][0], res["distances"][0]):
    print(pid, round(dist, 3))
```

The output is up to five product ids with distances, smallest first, all inside the category and price range.

## Guidelines

- Use `get_or_create_collection` so restarts are safe; it ignores a changed configuration for an existing collection.
- Collection names must be 3-512 characters from `[a-zA-Z0-9._-]`, starting and ending with a letter or digit; a name like `x` raises `InvalidArgumentError`.
- Keep ids stable (for example `file-page-chunk`) so `upsert()` replaces instead of duplicating.
- Store `source` metadata for every chunk; metadata values must be strings, numbers or booleans, not nested objects.
- Pick `n_results` from the LLM context budget: 5-10 for most RAG pipelines.
- Use `cosine` for text embeddings from OpenAI or Cohere models; the default `l2` ranks unnormalized vectors differently.
- Built-in server authentication was removed in 1.0: put the server behind a reverse proxy with auth, or use Chroma Cloud. Never expose port 8000 to the internet.
- Chroma suits prototypes through mid-size collections on one node; for very large or multi-writer workloads evaluate a dedicated vector service.
