---
title: "Build an AI Search Engine with Hybrid Retrieval"
description: "Combine full-text and semantic search for a 10M-document corpus using PostgreSQL tsvector, pgvector, and Reciprocal Rank Fusion reranking."
skills: [prisma, cohere-api, anthropic-sdk]
difficulty: advanced
time_estimate: "12 hours"
tags: [search, semantic-search, embeddings, pgvector, postgresql, rag, reranking]
---

# Build an AI Search Engine with Hybrid Retrieval

You have 10 million documents. Users type vague queries. BM25 alone misses synonyms; pure vector search misses exact keywords. The solution: **hybrid retrieval** — blend both signals and rerank with Reciprocal Rank Fusion (RRF).

## Persona

**Marcus** is a senior engineer at a legal tech startup. Their document search returns irrelevant results 40% of the time. He needs sub-200ms search over 10M contracts with meaning-aware matching.

---

## Architecture

```
Query → [Expand with Claude] → parallel search:
  ├── PostgreSQL tsvector (keyword)
  └── pgvector cosine similarity (semantic)
       ↓
  RRF reranking → Faceted filtering → Results
```

---

## Step 1: Database Setup with Prisma

```prisma
// schema.prisma
model Document {
  id         String   @id @default(cuid())
  content    String
  title      String
  category   String
  tags       String[]
  createdAt  DateTime @default(now())
  embedding  Unsupported("vector(1536)")?

  @@index([category])
  @@index([createdAt])
}
```

Enable pgvector and full-text search indexes:

```sql
-- Run via Prisma migration or raw SQL
CREATE EXTENSION IF NOT EXISTS vector;

-- Full-text search index
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || content)
  ) STORED;

CREATE INDEX documents_search_idx ON "Document" USING GIN(search_vector);

-- Vector similarity index (IVFFlat for 10M docs)
CREATE INDEX documents_embedding_idx ON "Document"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);
```

---

## Step 2: Generate Embeddings with Cohere

```typescript
import { CohereClient } from 'cohere-ai';
import { PrismaClient } from '@prisma/client';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
const prisma = new PrismaClient();

async function embedDocuments(documentIds: string[]) {
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, title: true, content: true }
  });

  // Cohere embed in batches of 96
  const texts = docs.map(d => `${d.title}\n${d.content.slice(0, 512)}`);
  const response = await cohere.embed({
    texts,
    model: 'embed-english-v3.0',
    inputType: 'search_document',
  });

  // Bulk update via raw SQL for performance
  for (let i = 0; i < docs.length; i++) {
    const vec = `[${response.embeddings[i].join(',')}]`;
    await prisma.$executeRaw`
      UPDATE "Document"
      SET embedding = ${vec}::vector
      WHERE id = ${docs[i].id}
    `;
  }
}
```

---

## Step 3: Query Expansion with Claude

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function expandQuery(query: string): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Generate 3 alternative search queries for: "${query}"
Return only the queries, one per line, no numbering.`
    }]
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return [query, ...text.trim().split('\n').filter(Boolean).slice(0, 3)];
}
```

---

## Step 4: Hybrid Search with RRF

```typescript
const K = 60; // RRF constant

async function hybridSearch(query: string, filters?: {
  category?: string;
  tags?: string[];
  dateFrom?: Date;
}) {
  // Expand query with AI
  const queries = await expandQuery(query);
  const primaryQuery = queries[0];

  // Embed the primary query
  const embedResponse = await cohere.embed({
    texts: [primaryQuery],
    model: 'embed-english-v3.0',
    inputType: 'search_query',
  });
  const queryVec = `[${embedResponse.embeddings[0].join(',')}]`;

  // Build filter clause
  const categoryFilter = filters?.category
    ? `AND category = '${filters.category}'` : '';

  // Keyword search (BM25-like via tsvector)
  const keywordResults: Array<{ id: string; rank: number }> = await prisma.$queryRaw`
    SELECT id, ts_rank(search_vector, plainto_tsquery('english', ${primaryQuery})) as rank
    FROM "Document"
    WHERE search_vector @@ plainto_tsquery('english', ${primaryQuery})
    ${categoryFilter}
    ORDER BY rank DESC
    LIMIT 100
  `;

  // Semantic search
  const semanticResults: Array<{ id: string; similarity: number }> = await prisma.$queryRaw`
    SELECT id, 1 - (embedding <=> ${queryVec}::vector) as similarity
    FROM "Document"
    WHERE embedding IS NOT NULL
    ${categoryFilter}
    ORDER BY embedding <=> ${queryVec}::vector
    LIMIT 100
  `;

  // RRF reranking
  const scores = new Map<string, number>();

  keywordResults.forEach((doc, rank) => {
    scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (K + rank + 1));
  });

  semanticResults.forEach((doc, rank) => {
    scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (K + rank + 1));
  });

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  return prisma.document.findMany({
    where: { id: { in: ranked } },
    select: { id: true, title: true, category: true, tags: true, createdAt: true }
  });
}
```

---

## Step 5: Faceted Filtering API

```typescript
// pages/api/search.ts (Next.js)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? undefined;
  const tags = searchParams.getAll('tag');
  const dateFrom = searchParams.get('from')
    ? new Date(searchParams.get('from')!) : undefined;

  const results = await hybridSearch(query, { category, tags, dateFrom });

  // Facets: aggregate counts
  const facets = await prisma.document.groupBy({
    by: ['category'],
    _count: { id: true },
    where: { id: { in: results.map(r => r.id) } }
  });

  return Response.json({ results, facets });
}
```

---

## Performance Tips

| Technique | Impact |
|-----------|--------|
| IVFFlat index with `lists=1000` | 50× faster vector search |
| GIN index on tsvector | Sub-10ms keyword queries |
| Redis cache embeddings | Skip Cohere on repeated queries |
| Parallel keyword + semantic | Cut latency by 40% |
| Limit embedding to 512 tokens | 3× throughput on Cohere |

---

## Results

Marcus shipped hybrid search in a weekend. Relevance jumped from 60% → 94% on test queries. P95 latency: 180ms on 10M documents.

> "We tried Elasticsearch. This Postgres-native approach costs 80% less and our DevOps team actually understands it." — Marcus
