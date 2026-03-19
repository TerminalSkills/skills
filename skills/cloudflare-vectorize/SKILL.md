---
name: cloudflare-vectorize
description: >-
  Serverless vector database at the edge with Cloudflare Vectorize. Use when:
  building semantic search on Cloudflare Workers, RAG pipelines at the edge,
  low-latency vector similarity search, or storing and querying embeddings
  without managing a separate vector database.
license: Apache-2.0
compatibility: "Requires Cloudflare Workers with Vectorize binding. Use wrangler 3+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["cloudflare", "vectorize", "vector-database", "edge", "semantic-search"]
  use-cases:
    - "Build semantic search for a documentation site using Cloudflare Workers + Vectorize"
    - "Implement RAG at the edge combining Vectorize with Workers AI embeddings"
    - "Store and query product embeddings for recommendation systems on Cloudflare"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cloudflare Vectorize

## Overview

Cloudflare Vectorize is a globally distributed vector database built into the Cloudflare Workers platform. It stores high-dimensional vectors (embeddings) and supports fast approximate nearest-neighbor search — all at the edge, with no separate infrastructure to manage.

Key features:
- Create and query indexes directly from Workers
- Metadata filtering alongside vector similarity
- Namespace support for multi-tenant isolation
- Native integration with Workers AI for end-to-end RAG
- Scales automatically with zero configuration

## Setup

### 1. Create a Vectorize index

Use Wrangler CLI to create an index. Specify the embedding dimensions and distance metric:

```bash
# For BAAI/bge-base-en-v1.5 (768 dims, cosine similarity)
npx wrangler vectorize create my-index \
  --dimensions=768 \
  --metric=cosine

# For OpenAI text-embedding-3-small (1536 dims)
npx wrangler vectorize create my-index \
  --dimensions=1536 \
  --metric=cosine

# Euclidean and dot-product are also supported
npx wrangler vectorize create my-index \
  --dimensions=384 \
  --metric=euclidean
```

### 2. Bind the index in `wrangler.toml`

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "my-index"
```

### 3. TypeScript types

```typescript
export interface Env {
  VECTORIZE_INDEX: VectorizeIndex
}
```

## Instructions

### Step 1: Insert vectors

Each vector needs a unique string `id` and a `values` array matching the index dimensions:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const vectors: VectorizeVector[] = [
      {
        id: "doc-001",
        values: [0.1, 0.2, 0.3, /* ... 768 total */],
        metadata: { title: "Introduction to Cloudflare", url: "/docs/intro" },
      },
      {
        id: "doc-002",
        values: [0.4, 0.5, 0.6, /* ... */],
        metadata: { title: "Workers AI Overview", url: "/docs/workers-ai" },
      },
    ]

    const result = await env.VECTORIZE_INDEX.insert(vectors)
    // result.count = number of vectors inserted

    return Response.json({ inserted: result.count })
  },
}
```

### Step 2: Query for similar vectors

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { queryVector, topK = 5 } = await request.json() as {
      queryVector: number[]
      topK?: number
    }

    const results = await env.VECTORIZE_INDEX.query(queryVector, {
      topK,
      returnMetadata: true,   // include metadata in results
      returnValues: false,    // skip returning raw vector values
    })

    // results.matches is sorted by score (highest = most similar)
    return Response.json({
      matches: results.matches.map(m => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata,
      }))
    })
  },
}
```

### Step 3: Metadata filtering

Filter results to a subset before computing similarity — useful for multi-tenant or categorized data:

```typescript
const results = await env.VECTORIZE_INDEX.query(queryVector, {
  topK: 10,
  returnMetadata: true,
  filter: {
    category: { $eq: "documentation" },
  },
})

// Compound filter
const filtered = await env.VECTORIZE_INDEX.query(queryVector, {
  topK: 5,
  returnMetadata: true,
  filter: {
    language: { $eq: "en" },
    published: { $eq: true },
  },
})
```

Supported filter operators: `$eq`, `$ne`, `$lt`, `$lte`, `$gt`, `$gte`, `$in`

### Step 4: Namespace support

Use namespaces to isolate data for different tenants or categories within a single index:

```typescript
// Insert with namespace
await env.VECTORIZE_INDEX.insert([{
  id: "tenant-a-doc-1",
  values: embedding,
  metadata: { text: "Document content..." },
  namespace: "tenant-a",
}])

// Query within a namespace
const results = await env.VECTORIZE_INDEX.query(queryVector, {
  topK: 5,
  returnMetadata: true,
  namespace: "tenant-a",
})
```

### Step 5: Get, update, and delete vectors

```typescript
// Get vectors by ID
const vectors = await env.VECTORIZE_INDEX.getByIds(["doc-001", "doc-002"])

// Upsert (insert or update)
await env.VECTORIZE_INDEX.upsert([{
  id: "doc-001",
  values: newEmbedding,
  metadata: { updated: true },
}])

// Delete by ID
await env.VECTORIZE_INDEX.deleteByIds(["doc-001", "doc-002"])
```

### Step 6: End-to-end RAG with Workers AI

Complete RAG pipeline — embed query, search Vectorize, generate answer with LLM:

```typescript
export interface Env {
  AI: Ai
  VECTORIZE_INDEX: VectorizeIndex
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question } = await request.json() as { question: string }

    // 1. Embed the user's question
    const embeddingResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [question],
    })
    const queryVector = embeddingResult.data[0]

    // 2. Find relevant documents
    const searchResults = await env.VECTORIZE_INDEX.query(queryVector, {
      topK: 3,
      returnMetadata: true,
    })

    const context = searchResults.matches
      .map(m => m.metadata?.text as string)
      .filter(Boolean)
      .join("\n\n")

    // 3. Generate answer with context
    const answer = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `Answer the question using only the provided context.\n\nContext:\n${context}`,
        },
        { role: "user", content: question },
      ],
      max_tokens: 512,
    })

    return Response.json({
      answer: answer.response,
      sources: searchResults.matches.map(m => ({
        id: m.id,
        score: m.score,
        url: m.metadata?.url,
      })),
    })
  },
}
```

### Step 7: Bulk indexing pipeline

For indexing large document collections, batch inserts for efficiency:

```typescript
async function indexDocuments(
  documents: Array<{ id: string; text: string; metadata: Record<string, unknown> }>,
  env: Env,
  batchSize = 100
) {
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize)

    // Embed batch
    const embeddingResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: batch.map(d => d.text),
    })

    // Prepare vectors
    const vectors: VectorizeVector[] = batch.map((doc, idx) => ({
      id: doc.id,
      values: embeddingResult.data[idx],
      metadata: { ...doc.metadata, text: doc.text },
    }))

    // Insert batch
    await env.VECTORIZE_INDEX.insert(vectors)
    console.log(`Indexed ${i + batch.length}/${documents.length} documents`)
  }
}
```

## Manage indexes via Wrangler

```bash
# List all indexes
npx wrangler vectorize list

# Describe an index (dimensions, metric, vector count)
npx wrangler vectorize info my-index

# Delete an index
npx wrangler vectorize delete my-index

# Get vectors by ID (for debugging)
npx wrangler vectorize get-vectors my-index --ids=doc-001,doc-002
```

## Guidelines

- Dimensions must match exactly what your embedding model produces — mismatches cause errors at insert time.
- Use `cosine` distance for normalized text embeddings (BAAI, OpenAI); use `euclidean` or `dot-product` only when your model specifically recommends it.
- Store the original text in `metadata` so you can return it with search results without a separate database lookup.
- Vectorize supports up to 100 vectors per `insert()` call — batch larger datasets.
- Metadata values must be strings, numbers, or booleans; nested objects are not supported in filters.
- Use namespaces for multi-tenant apps instead of separate indexes — it's cheaper and simpler.
- Vectorize indexes have eventual consistency; newly inserted vectors may not appear in queries for a few seconds.
- Combine with Workers AI for fully serverless RAG — no external embedding API keys required.
