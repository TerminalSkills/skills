---
name: qdrant
description: |
  Qdrant is an open-source vector similarity search engine with advanced filtering.
  Learn to create collections, upsert points with payloads, query with filters,
  and deploy with Docker for AI and semantic search applications.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: databases
  tags:
    - qdrant
    - vector-database
    - similarity-search
    - docker
    - ai
---

# Qdrant

Qdrant (pronounced "quadrant") is a vector similarity search engine written in Rust. It provides a production-ready API with rich filtering, payload indexing, and efficient storage.

## Installation

```bash
# Docker (recommended)
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 \
  -v qdrant-data:/qdrant/storage \
  qdrant/qdrant:v1.12.0

# REST API at http://localhost:6333
# gRPC at localhost:6334

# Node.js client
npm install @qdrant/js-client-rest

# Python client
pip install qdrant-client
```

## Create a Collection

```javascript
// create-collection.js: Create a collection with vector configuration
const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({ host: 'localhost', port: 6333 });

await client.createCollection('documents', {
  vectors: {
    size: 1536,
    distance: 'Cosine',
  },
  optimizers_config: {
    default_segment_number: 2,
  },
  on_disk_payload: true,
});

// Create payload index for filtered search
await client.createPayloadIndex('documents', {
  field_name: 'category',
  field_schema: 'keyword',
});
```

## Upsert Points

```javascript
// upsert.js: Insert vectors with payload metadata
await client.upsert('documents', {
  wait: true,
  points: [
    {
      id: 1,
      vector: embedding1, // Array of 1536 floats
      payload: {
        title: 'Vector Database Guide',
        category: 'technology',
        author: 'Alice',
        created_at: '2026-02-01',
        tags: ['vectors', 'ai', 'search'],
      },
    },
    {
      id: 2,
      vector: embedding2,
      payload: {
        title: 'Machine Learning Basics',
        category: 'ai',
        author: 'Bob',
        created_at: '2026-01-15',
        tags: ['ml', 'ai'],
      },
    },
  ],
});
```

## Search and Filter

```javascript
// search.js: Vector similarity search with payload filters
// Basic similarity search
const results = await client.search('documents', {
  vector: queryEmbedding,
  limit: 5,
  with_payload: true,
});

results.forEach(r => console.log(`${r.id}: ${r.score} — ${r.payload.title}`));

// Filtered search
const filtered = await client.search('documents', {
  vector: queryEmbedding,
  limit: 10,
  filter: {
    must: [
      { key: 'category', match: { value: 'technology' } },
    ],
    must_not: [
      { key: 'author', match: { value: 'Bob' } },
    ],
  },
  with_payload: true,
});

// Search with score threshold
const precise = await client.search('documents', {
  vector: queryEmbedding,
  limit: 5,
  score_threshold: 0.8,
  with_payload: ['title', 'category'],
});
```

## Python Client

```python
# app.py: Qdrant with Python client
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
)

client = QdrantClient(host="localhost", port=6333)

# Create collection
client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

# Upsert
client.upsert(
    collection_name="documents",
    points=[
        PointStruct(id=1, vector=embedding, payload={"title": "Hello", "category": "tech"}),
    ],
)

# Search with filter
results = client.search(
    collection_name="documents",
    query_vector=query_embedding,
    limit=5,
    query_filter=Filter(
        must=[FieldCondition(key="category", match=MatchValue(value="tech"))]
    ),
)

for point in results:
    print(f"{point.id}: {point.score:.3f} — {point.payload['title']}")
```

## Batch Operations

```javascript
// batch.js: Scroll through all points and batch delete
// Scroll (paginate through all points)
let offset = null;
do {
  const page = await client.scroll('documents', {
    limit: 100,
    offset,
    with_payload: true,
  });
  page.points.forEach(p => console.log(p.id));
  offset = page.next_page_offset;
} while (offset !== null);

// Delete by filter
await client.delete('documents', {
  wait: true,
  filter: {
    must: [{ key: 'category', match: { value: 'deprecated' } }],
  },
});
```

## Snapshots and Backup

```bash
# backup.sh: Create and download collection snapshots
# Create snapshot
curl -X POST http://localhost:6333/collections/documents/snapshots

# List snapshots
curl http://localhost:6333/collections/documents/snapshots

# Download snapshot
curl -o backup.snapshot \
  http://localhost:6333/collections/documents/snapshots/documents-2026-02-19.snapshot

# Full storage snapshot
curl -X POST http://localhost:6333/snapshots
```
