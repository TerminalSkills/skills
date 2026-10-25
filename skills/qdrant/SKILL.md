---
name: qdrant
description: >-
  Qdrant is an open-source vector database written in Rust for similarity
  search over embeddings, with payload filtering, named and sparse vectors,
  hybrid search and quantization. Use when someone asks to set up Qdrant,
  build semantic search or RAG retrieval, store embeddings, filter vector
  search by metadata, combine dense and keyword search, or move from the
  removed search() and recommend() calls to query().
license: Apache-2.0
compatibility: "Docker or Qdrant Cloud; Node.js 22+ with @qdrant/js-client-rest or Python 3.10+ with qdrant-client"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/qdrant/qdrant
  tags: "vector-database, embeddings, semantic-search, rag, qdrant"
---

# Qdrant — Vector Search Engine

## Overview

Qdrant stores points: an ID, one or more vectors and a JSON payload. You search by vector and narrow the result with payload filters. It listens on 6333 (REST) and 6334 (gRPC). This skill was checked against server v1.20.0 and the clients `@qdrant/js-client-rest` 1.20.0 and `qdrant-client` 1.20.0 (October 2026).

The most important change for older code: `client.search()`, `client.recommend()` and `client.discover()` are gone from the JS client (`search is not a function`), and Python's `search()` is gone too. Everything goes through one universal call, `query()` in JS and `query_points()` in Python.

## Instructions

1. Start a server locally and bind it to loopback. A bare `docker run -p 6333:6333` exposes an unauthenticated API on every interface:

```bash
docker run -d --name qdrant -p 127.0.0.1:6333:6333 -p 127.0.0.1:6334:6334 \
  -v qdrant_storage:/qdrant/storage qdrant/qdrant:v1.20.0
npm install @qdrant/js-client-rest        # or: pip install qdrant-client
```

2. Create a collection. The vector size must match your embedding model (1536 for OpenAI `text-embedding-3-small`, 384 for `all-MiniLM-L6-v2`):

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ url: "http://127.0.0.1:6333", apiKey: process.env.QDRANT_API_KEY });

await client.createCollection("products", {
  vectors: { size: 1536, distance: "Cosine" },
});
```

3. Create payload indexes for every field you filter on, before loading data:

```typescript
await client.createPayloadIndex("products", { field_name: "category", field_schema: "keyword", wait: true });
await client.createPayloadIndex("products", { field_name: "price", field_schema: "float", wait: true });
```

4. Upsert points. IDs must be unsigned integers or UUIDs. A string such as `"prod-1"` is rejected with HTTP 400, so keep your own key in the payload:

```typescript
await client.upsert("products", {
  wait: true,
  points: [
    { id: 1, vector: keyboardEmbedding,
      payload: { sku: "prod-1", name: "Wireless Keyboard", price: 79.99, category: "electronics", in_stock: true } },
    { id: "6f1c2a52-8c1e-4a53-9f43-0d6b6f5b2a10", vector: hubEmbedding,
      payload: { sku: "prod-2", name: "USB-C Hub", price: 49.99, category: "accessories", in_stock: true } },
  ],
});
```

5. Search with `query()`. The result is `{ points: [...] }`, not a bare array:

```typescript
const { points } = await client.query("products", {
  query: queryEmbedding,
  limit: 10,
  with_payload: true,
  score_threshold: 0.7,
  filter: {
    must: [
      { key: "in_stock", match: { value: true } },
      { key: "price", range: { lte: 100 } },
    ],
  },
});
points.forEach((p) => console.log(p.payload?.name, p.score.toFixed(3)));
```

Python equivalent:

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://127.0.0.1:6333")
res = client.query_points(
    "products", query=query_embedding, limit=10,
    query_filter=models.Filter(must=[models.FieldCondition(key="in_stock", match=models.MatchValue(value=True))]),
)
```

6. Other query modes use the same call. Pass a point ID as `query` for "more like this point", or a `recommend` object with positive and negative examples:

```typescript
const similar = await client.query("products", { query: 1, limit: 5 });            // excludes point 1 itself
const rec = await client.query("products", {
  query: { recommend: { positive: [1, 3], negative: [7] } }, limit: 5,
});
const grouped = await client.queryGroups("products", {
  query: queryEmbedding, group_by: "category", group_size: 1, limit: 5,
});
```

7. Page through points with `scroll`, passing `next_page_offset` back as `offset` until it is null:

```typescript
const page = await client.scroll("products", { limit: 100, with_payload: true, with_vector: false });
```

## Examples

### Example 1: "Search articles by title or by body"

Named vectors keep several embeddings on one point. Pick one with `using`:

```typescript
await client.createCollection("articles", {
  vectors: {
    title: { size: 384, distance: "Cosine" },
    content: { size: 1536, distance: "Cosine" },
  },
});
const { points } = await client.query("articles", { query: titleEmbedding, using: "title", limit: 10 });
```

Result: up to 10 articles ranked by title similarity, each with `id` and `score`.

### Example 2: "Hybrid search: keywords plus meaning"

Add a sparse vector (for example BM25 or SPLADE weights computed by your own code) and fuse both rankings with reciprocal rank fusion in a single request:

```typescript
await client.createCollection("docs", {
  vectors: { dense: { size: 1536, distance: "Cosine" } },
  sparse_vectors: { keywords: { modifier: "idf" } },
});
const { points } = await client.query("docs", {
  prefetch: [
    { query: denseEmbedding, using: "dense", limit: 50 },
    { query: { indices: [3, 7, 912], values: [1.0, 0.6, 0.3] }, using: "keywords", limit: 50 },
  ],
  query: { fusion: "rrf" },
  limit: 10,
});
```

Result: the 10 best documents by fused rank. `prefetch` also supports multi-stage re-ranking, for example a cheap small vector first and a large one second.

### Example 3: "Cut memory for 10 million vectors"

```typescript
await client.createCollection("big", {
  vectors: { size: 1536, distance: "Cosine", on_disk: true },
  quantization_config: { scalar: { type: "int8", quantile: 0.99, always_ram: true } },
});
const { points } = await client.query("big", {
  query: queryEmbedding, limit: 10,
  params: { quantization: { rescore: true, oversampling: 2.0 } },
});
```

Result: the compressed int8 copy sits in RAM (about a quarter of the float32 size), originals stay on disk and are used to rescore the top candidates.

## Guidelines

- Do not use `search()`, `recommend()` or `discover()`; they no longer exist in current clients. Use `query()` or `query_points()`. Python's `recreate_collection` is deprecated; use `collection_exists`, `delete_collection` and `create_collection` (JS: `collectionExists`, `deleteCollection`, `createCollection`).
- Index every payload field you filter on. Without an index, filters scan payloads and slow down or degrade graph search.
- Send points in batches of a few hundred, with `wait: true` when you query right after writing.
- Qdrant has no authentication by default and `config.yaml` binds `0.0.0.0`. Set `QDRANT__SERVICE__API_KEY` (and optionally `QDRANT__SERVICE__READ_ONLY_API_KEY`), use TLS when traffic leaves the host, and never publish 6333 or 6334 to the internet. Keep the key in an environment variable, never in code.
- Mount `/qdrant/storage` as a volume; the container's data is lost with the container otherwise. Back up with `client.createSnapshot(collectionName)`.
- Pin an image tag instead of `latest` and upgrade one minor version at a time.
- Use `QdrantClient(":memory:")` in Python for tests; it needs no server but does not support every feature.
- Qdrant Cloud has a free 1 GB cluster; pass its URL and API key to the client.
- For a few thousand vectors that fit in a relational database you already run, pgvector may be simpler than a new service.
