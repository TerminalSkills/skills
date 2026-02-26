---
name: lancedb
description: >-
  Embedded vector database with LanceDB — serverless, zero-config vector search
  for AI applications. Use when someone asks to "vector search without a server",
  "embedded vector database", "LanceDB", "local vector search", "serverless
  vector DB", "vector search in a file", or "lightweight RAG storage". Covers
  table creation, vector search, full-text search, hybrid search, and multimodal
  embeddings.
license: Apache-2.0
compatibility: "Node.js/Python. Runs locally (embedded) or serverless cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["vector", "embedded-db", "lancedb", "rag", "search"]
---

# LanceDB

## Overview

LanceDB is an embedded vector database — it runs inside your application process with zero external dependencies. No Docker containers, no servers, no connection strings. Data is stored in Lance format (columnar, optimized for ML) on local disk or object storage (S3). Perfect for prototyping, edge deployments, and applications where running a separate vector database is overkill.

## When to Use

- RAG prototypes and local development (no infrastructure to set up)
- Edge/embedded applications that need vector search
- Desktop apps and CLI tools with AI features
- Projects too small for Pinecone/Qdrant but need more than arrays
- Multimodal search (text + images in same index)

## Instructions

### Setup

```bash
npm install @lancedb/lancedb
# Optional: for automatic embedding generation
npm install @lancedb/lancedb openai
```

### Basic Usage

```typescript
// db.ts — Create a LanceDB table and search
import * as lancedb from "@lancedb/lancedb";

// Connect to local database (creates directory if needed)
const db = await lancedb.connect("./my-vector-db");

// Create a table with data
const data = [
  { id: 1, text: "The cat sat on the mat", vector: [0.1, 0.2, 0.3, ...] },
  { id: 2, text: "Dogs are loyal companions", vector: [0.4, 0.5, 0.6, ...] },
  { id: 3, text: "Fish swim in the ocean", vector: [0.7, 0.8, 0.9, ...] },
];

const table = await db.createTable("documents", data);

// Vector search — find similar items
const results = await table
  .vectorSearch([0.1, 0.2, 0.3, ...])  // Query vector
  .limit(5)
  .toArray();

// results: [{ id: 1, text: "The cat sat on the mat", _distance: 0.001 }, ...]
```

### With Automatic Embeddings

```typescript
// auto-embed.ts — LanceDB generates embeddings automatically
import * as lancedb from "@lancedb/lancedb";
import { getRegistry } from "@lancedb/lancedb/embeddings";

const openai = getRegistry().get("openai")!.create({
  model: "text-embedding-3-small",
});

const db = await lancedb.connect("./my-db");

// Define schema with embedding function
const schema = lancedb
  .schema([
    lancedb.field("id", new lancedb.Int32()),
    lancedb.field("text", new lancedb.Utf8(), openai.sourceField()),
    lancedb.field("vector", openai.vectorField()),  // Auto-generated
  ]);

const table = await db.createTable("docs", [
  { id: 1, text: "How to set up authentication" },
  { id: 2, text: "Database migration guide" },
  { id: 3, text: "Deploying to production" },
], { schema });

// Search with text — embedding generated automatically
const results = await table
  .search("how do I deploy my app?")
  .limit(3)
  .toArray();
```

### Full-Text + Vector Hybrid Search

```typescript
// hybrid.ts — Combine keyword and semantic search
const table = await db.openTable("documents");

// Create full-text search index
await table.createIndex("text", { config: lancedb.Index.fts() });

// Hybrid search: combines vector similarity + keyword matching
const results = await table
  .search("deploy production", { queryType: "hybrid" })
  .limit(10)
  .toArray();
```

### Filtering

```typescript
// filter.ts — Vector search with metadata filters
const results = await table
  .vectorSearch(queryVector)
  .where("category = 'docs' AND created_at > '2026-01-01'")
  .limit(10)
  .toArray();
```

## Examples

### Example 1: Build a local RAG chatbot

**User prompt:** "Build a chatbot that answers questions about local documents without any external services."

The agent will use LanceDB embedded to store document embeddings locally, build a search function, and connect to a local LLM (Ollama) for generation.

### Example 2: Semantic search for a CLI tool

**User prompt:** "Add semantic search to my note-taking CLI so I can find notes by meaning."

The agent will create a LanceDB database in the app's data directory, embed notes on save, and add a search command that finds semantically similar notes.

## Guidelines

- **Embedded = no server** — runs in your process, data in a directory
- **Lance format** — columnar, compressed, fast for ML workloads
- **S3-compatible storage** — `lancedb.connect("s3://bucket/path")` for cloud
- **Auto-embeddings** — register an embedding function, never manually embed again
- **Hybrid search** — combine vector + full-text for best results
- **Filtering with SQL-like syntax** — `where("category = 'docs'")`
- **IVF-PQ index for scale** — create index when table exceeds 100K rows
- **Data versioning built-in** — Lance format supports time travel
- **No connection pooling** — it's embedded, just open and use
- **Great for prototyping** — start with LanceDB, migrate to hosted if needed
