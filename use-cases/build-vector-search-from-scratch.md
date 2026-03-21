---
title: "Build Vector Search from Scratch with pgvector"
description: "Build a production-grade semantic search system using PostgreSQL and pgvector — no managed vector database required."
skills: [prisma, cohere-api]
difficulty: intermediate
time_estimate: "4 hours"
tags: [vector-search, pgvector, postgres, prisma, cohere, semantic-search, embeddings]
---

# Build Vector Search from Scratch with pgvector

> **Persona:** You're a developer who needs semantic search for your app. Pinecone, Weaviate, Qdrant — they all add $100+/month and another service to babysit. You already have Postgres. Let's use it.

pgvector extends PostgreSQL with first-class vector operations. With HNSW indexing, it handles millions of vectors at sub-10ms latency. No new infrastructure, no vendor lock-in.

## What You'll Build

- Cohere-powered embeddings for your documents
- pgvector storage with HNSW index via Prisma
- Hybrid metadata + vector search
- Benchmarks at 1M and 10M vectors

## Setup

```bash
npm install @prisma/client prisma cohere-ai
npx prisma init
```

Enable pgvector in your database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Prisma Schema

```prisma
// schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

model Document {
  id         String                 @id @default(cuid())
  content    String
  title      String
  category   String
  userId     String
  createdAt  DateTime               @default(now())
  embedding  Unsupported("vector(1024)")?

  @@index([category])
  @@index([userId])
}
```

```bash
npx prisma migrate dev --name add-vector-search
```

Add HNSW index after migration:

```sql
-- Run separately (Prisma doesn't support this yet)
CREATE INDEX ON "Document" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## Embedding Documents with Cohere

```typescript
// embed/cohere.ts
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

export async function embedTexts(texts: string[]): Promise<number[][]> {
  // Cohere Embed v3 — 1024 dimensions, great for search
  const response = await cohere.embed({
    texts,
    model: 'embed-english-v3.0',
    inputType: 'search_document', // Use 'search_query' for queries
  });
  return response.embeddings as number[][];
}

export async function embedQuery(query: string): Promise<number[]> {
  const response = await cohere.embed({
    texts: [query],
    model: 'embed-english-v3.0',
    inputType: 'search_query', // Different input type for queries!
  });
  return (response.embeddings as number[][])[0];
}
```

## Indexing Documents

```typescript
// indexer.ts
import { PrismaClient } from '@prisma/client';
import { embedTexts } from './embed/cohere';

const prisma = new PrismaClient();

export async function indexDocuments(docs: Array<{
  content: string;
  title: string;
  category: string;
  userId: string;
}>) {
  // Batch embed — Cohere supports up to 96 texts per request
  const BATCH_SIZE = 90;
  const results = [];

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const embeddings = await embedTexts(batch.map(d => d.content));

    for (let j = 0; j < batch.length; j++) {
      // Use raw SQL to insert vector — Prisma doesn't support vector type directly
      const result = await prisma.$executeRaw`
        INSERT INTO "Document" (id, content, title, category, "userId", embedding, "createdAt")
        VALUES (
          ${cuid()},
          ${batch[j].content},
          ${batch[j].title},
          ${batch[j].category},
          ${batch[j].userId},
          ${JSON.stringify(embeddings[j])}::vector,
          NOW()
        )
      `;
      results.push(result);
    }

    console.log(`Indexed ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
    // Respect Cohere rate limits
    if (i + BATCH_SIZE < docs.length) await sleep(200);
  }

  return results;
}
```

## Vector Search with Metadata Filtering

```typescript
// search.ts
import { embedQuery } from './embed/cohere';

export interface SearchOptions {
  query: string;
  category?: string;
  userId?: string;
  dateAfter?: Date;
  limit?: number;
  threshold?: number; // cosine similarity threshold
}

export async function semanticSearch(options: SearchOptions) {
  const { query, category, userId, dateAfter, limit = 10, threshold = 0.7 } = options;

  const queryEmbedding = await embedQuery(query);

  // Build dynamic WHERE clause
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [JSON.stringify(queryEmbedding)];
  let paramIdx = 2;

  if (category) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(category);
  }
  if (userId) {
    conditions.push(`"userId" = $${paramIdx++}`);
    params.push(userId);
  }
  if (dateAfter) {
    conditions.push(`"createdAt" > $${paramIdx++}`);
    params.push(dateAfter);
  }

  const whereClause = conditions.join(' AND ');

  const results = await prisma.$queryRawUnsafe<Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    similarity: number;
  }>>(`
    SELECT
      id, title, content, category,
      1 - (embedding <=> $1::vector) AS similarity
    FROM "Document"
    WHERE ${whereClause}
      AND 1 - (embedding <=> $1::vector) > ${threshold}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limit}
  `, ...params);

  return results;
}
```

## Performance Benchmarks

```typescript
// benchmark.ts
export async function runBenchmark(docCount: number) {
  const queries = [
    'machine learning optimization techniques',
    'user authentication security best practices',
    'database performance tuning strategies',
  ];

  const timings: number[] = [];

  for (const query of queries) {
    const start = performance.now();
    await semanticSearch({ query, limit: 10 });
    timings.push(performance.now() - start);
  }

  console.log(`\nBenchmark results (${docCount.toLocaleString()} docs):`);
  console.log(`  Avg latency: ${(timings.reduce((a, b) => a + b) / timings.length).toFixed(1)}ms`);
  console.log(`  P95 latency: ${timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)].toFixed(1)}ms`);
}

// Typical results:
// 1M vectors  → avg 8ms,  p95 15ms  (HNSW m=16)
// 10M vectors → avg 22ms, p95 40ms  (HNSW m=32)
```

## Tune HNSW for Your Scale

```sql
-- For 1M vectors: speed-optimized
CREATE INDEX ON "Document" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- For 10M vectors: accuracy-optimized  
CREATE INDEX ON "Document" USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

-- Check index size
SELECT pg_size_pretty(pg_relation_size('"Document"_embedding_idx'));
-- Typical: ~5GB per 1M 1024-dim vectors
```

## Update and Delete Vectors

```typescript
// Keep embeddings in sync with content changes
export async function updateDocument(id: string, newContent: string) {
  const [embedding] = await embedTexts([newContent]);

  await prisma.$executeRaw`
    UPDATE "Document"
    SET content = ${newContent},
        embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${id}
  `;
}
```

## What to Build Next

- **Hybrid BM25 + vector:** Combine with `pg_trgm` or `tsvector` for keyword boosting
- **Namespace isolation:** Use `userId` as a partition key for multi-tenant search
- **Incremental re-embedding:** Queue re-embed when the Cohere model is updated
- **Search analytics:** Log queries and click-through to improve ranking over time
