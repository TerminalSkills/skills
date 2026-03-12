---
name: qdrant
category: AI & Machine Learning
tags: [vector-database, embeddings, search, similarity, rag, rust]
version: 1.0.0
author: terminal-skills
---

# Qdrant — Vector Search Engine

You are an expert in Qdrant, the high-performance vector search engine written in Rust. You help developers build semantic search, RAG retrieval, recommendation systems, and anomaly detection with billion-scale vector collections, advanced filtering, multi-vector support, and hybrid search — providing sub-millisecond query latency with rich payload filtering that other vector DBs can't match.

## Core Capabilities

### Collections and Points

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ url: "http://localhost:6333" });

// Create collection
await client.createCollection("products", {
  vectors: {
    size: 1536,                            // OpenAI embedding dimension
    distance: "Cosine",
  },
  optimizers_config: { indexing_threshold: 10000 },
});

// Upsert points with payload
await client.upsert("products", {
  points: [
    {
      id: "prod-1",
      vector: embedding1,                  // Float array [0.1, -0.3, ...]
      payload: {
        name: "Wireless Keyboard",
        price: 79.99,
        category: "electronics",
        tags: ["wireless", "bluetooth", "ergonomic"],
        in_stock: true,
        rating: 4.5,
      },
    },
    {
      id: "prod-2",
      vector: embedding2,
      payload: {
        name: "USB-C Hub",
        price: 49.99,
        category: "accessories",
        tags: ["usb-c", "hub", "multiport"],
        in_stock: true,
        rating: 4.2,
      },
    },
  ],
});
```

### Search with Filtering

```typescript
// Semantic search + payload filters
const results = await client.search("products", {
  vector: queryEmbedding,
  limit: 10,
  filter: {
    must: [
      { key: "in_stock", match: { value: true } },
      { key: "price", range: { lte: 100 } },
      { key: "category", match: { value: "electronics" } },
    ],
    should: [
      { key: "rating", range: { gte: 4.0 } },
    ],
  },
  with_payload: true,
  score_threshold: 0.7,                    // Minimum similarity
});

results.forEach((r) => {
  console.log(`${r.payload.name} — Score: ${r.score.toFixed(3)}, $${r.payload.price}`);
});

// Recommendation (find similar to these, but NOT similar to those)
const recommended = await client.recommend("products", {
  positive: ["prod-1", "prod-3"],          // Find similar to these
  negative: ["prod-7"],                    // But NOT similar to this
  limit: 5,
  filter: { must: [{ key: "in_stock", match: { value: true } }] },
});

// Scroll (iterate over all points)
const batch = await client.scroll("products", {
  filter: { must: [{ key: "category", match: { value: "electronics" } }] },
  limit: 100,
  with_payload: true,
  with_vectors: false,
});
```

### Named Vectors (Multi-Vector)

```typescript
// Collection with multiple vector spaces
await client.createCollection("articles", {
  vectors: {
    title: { size: 384, distance: "Cosine" },    // Title embedding
    content: { size: 1536, distance: "Cosine" },  // Content embedding
  },
});

// Search by title similarity
const byTitle = await client.search("articles", {
  vector: { name: "title", vector: titleEmbedding },
  limit: 10,
});

// Search by content similarity
const byContent = await client.search("articles", {
  vector: { name: "content", vector: contentEmbedding },
  limit: 10,
});
```

## Installation

```bash
npm install @qdrant/js-client-rest

# Server
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

## Best Practices

1. **Payload filtering** — Filter BEFORE vector search; Qdrant optimizes this path for fast filtered search
2. **Payload indexes** — Create indexes on frequently filtered fields; `PUT /collections/{name}/index`
3. **Named vectors** — Use multiple vectors per point for different aspects (title, content, image)
4. **Score threshold** — Set `score_threshold` to skip low-quality results; reduces noise
5. **Quantization** — Enable scalar or product quantization for 4x memory reduction; minimal quality loss
6. **Batch upsert** — Send points in batches of 100-1000; parallel upload for faster indexing
7. **Recommendations** — Use positive/negative examples for "more like this" without generating embeddings
8. **Qdrant Cloud** — Managed hosting with free tier; or self-host with Docker for full control
