---
name: pgvector
description: >-
  Store and search vector embeddings in PostgreSQL with pgvector — no separate
  vector database needed. Use when someone asks to "vector search in Postgres",
  "store embeddings", "pgvector", "similarity search", "RAG with Postgres",
  "semantic search in existing database", or "add AI search to my app without
  a separate vector DB". Covers vector columns, indexing (IVFFlat, HNSW),
  similarity search, and integration with ORMs.
license: Apache-2.0
compatibility: "PostgreSQL 15+. Works with Supabase, Neon, RDS. Node.js/Python clients."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["vector", "embeddings", "postgres", "pgvector", "rag"]
---

# pgvector

## Overview

pgvector adds vector similarity search to PostgreSQL. Store embeddings alongside your regular data — no separate vector database, no data sync, no new infrastructure. Use your existing Postgres for semantic search, RAG, recommendations, and deduplication. Supports exact and approximate nearest neighbor search with IVFFlat and HNSW indexes.

## When to Use

- Adding semantic/vector search to an existing Postgres-backed app
- RAG (Retrieval-Augmented Generation) without running Pinecone/Qdrant/Weaviate
- Storing embeddings alongside relational data (users, products, documents)
- Recommendation systems based on content similarity
- Don't want to manage a separate vector database

## Instructions

### Setup

```sql
-- Enable the extension (available on Supabase, Neon, RDS, self-hosted)
CREATE EXTENSION IF NOT EXISTS vector;
```

### Schema Design

```sql
-- Store documents with embeddings alongside regular columns
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),          -- OpenAI ada-002 dimension
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast approximate search (recommended)
CREATE INDEX ON documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Or IVFFlat for lower memory usage
-- CREATE INDEX ON documents
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);
```

### Store Embeddings

```typescript
// ingest.ts — Generate and store embeddings
import { Pool } from "pg";
import OpenAI from "openai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI();

async function storeDocument(title: string, content: string, metadata: object = {}) {
  // Generate embedding
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: content,
  });
  const embedding = embeddingRes.data[0].embedding;

  // Store with embedding (pgvector accepts array format)
  await pool.query(
    `INSERT INTO documents (title, content, metadata, embedding)
     VALUES ($1, $2, $3, $4)`,
    [title, content, JSON.stringify(metadata), JSON.stringify(embedding)]
  );
}
```

### Similarity Search

```typescript
// search.ts — Find similar documents by vector distance
async function semanticSearch(query: string, limit = 5, threshold = 0.7) {
  // Embed the query
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingRes.data[0].embedding;

  // Cosine similarity search
  const result = await pool.query(
    `SELECT id, title, content, metadata,
            1 - (embedding <=> $1::vector) AS similarity
     FROM documents
     WHERE 1 - (embedding <=> $1::vector) > $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(queryEmbedding), threshold, limit]
  );

  return result.rows;
  // [{ id: 1, title: "...", content: "...", similarity: 0.89 }, ...]
}
```

### RAG with pgvector

```typescript
// rag.ts — Retrieval-Augmented Generation using pgvector
async function ragAnswer(question: string): Promise<string> {
  // 1. Find relevant documents
  const docs = await semanticSearch(question, 5);

  // 2. Build context from retrieved documents
  const context = docs.map((d) => `## ${d.title}\n${d.content}`).join("\n\n");

  // 3. Generate answer with context
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Answer based on the following context. If the context doesn't contain the answer, say so.\n\n${context}`,
      },
      { role: "user", content: question },
    ],
  });

  return completion.choices[0].message.content!;
}
```

### With Drizzle ORM

```typescript
// schema.ts — pgvector with Drizzle ORM
import { pgTable, text, serial, jsonb, index, timestamp } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";

// Custom vector type for Drizzle
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  toDriver: (value) => JSON.stringify(value),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

## Examples

### Example 1: Add semantic search to an existing app

**User prompt:** "I have a Postgres database with articles. Add semantic search so users can search by meaning, not just keywords."

The agent will add a vector column, generate embeddings for existing articles, create an HNSW index, and build a search endpoint that combines vector similarity with existing filters.

### Example 2: Document Q&A with RAG

**User prompt:** "Build a Q&A system over our internal docs using our existing Postgres database."

The agent will chunk documents, store embeddings in pgvector, and build a RAG pipeline that retrieves relevant chunks and generates answers.

## Guidelines

- **HNSW index for most cases** — faster queries, slightly more memory than IVFFlat
- **Cosine distance (`<=>`)** — best for normalized embeddings (OpenAI, Cohere)
- **L2 distance (`<->`)** — for non-normalized embeddings
- **Dimension must match model** — ada-002: 1536, text-embedding-3-small: 1536
- **Index after bulk insert** — create index after loading data, not before
- **Filter + vector search** — combine `WHERE` clauses with vector similarity
- **No separate infrastructure** — one less service to manage, deploy, and pay for
- **Supabase has it built-in** — `enable_extension('vector')` in dashboard
- **Chunk long documents** — 500-1500 tokens per chunk for best retrieval
- **Re-embed when you change models** — embeddings from different models aren't compatible
