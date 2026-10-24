---
title: "Build an AI Search Engine with Hybrid Retrieval"
description: "Combine full-text and semantic search for a large document corpus using PostgreSQL tsvector, pgvector, and Reciprocal Rank Fusion reranking."
skills: [prisma, cohere-api, anthropic-sdk]
difficulty: advanced
time_estimate: "12 hours"
tags: [search, semantic-search, embeddings, pgvector, postgresql, rag, reranking]
---

# Build an AI Search Engine with Hybrid Retrieval

## The Problem

You have millions of documents. Users type vague queries. Keyword search (BM25-style ranking) misses synonyms; pure vector search misses exact terms such as clause numbers or case names. A hybrid blends both signals and merges the two ranked lists with Reciprocal Rank Fusion (RRF), which needs no score calibration between the two systems.

**Marcus** is a senior engineer at a legal tech startup. Their contract search returns irrelevant results too often, and he wants meaning-aware matching without adding a separate search cluster to operate.

## The Solution

Keep everything in PostgreSQL. The `prisma` skill covers the schema and migrations (Prisma 7 needs a driver adapter and `prisma.config.ts`), `cohere-api` covers embeddings, and `anthropic-sdk` covers query expansion.

```
Query -> [expand with Claude] -> parallel search:
  |-- PostgreSQL tsvector + GIN   (keyword)
  `-- pgvector HNSW, cosine       (semantic)
        -> RRF merge -> facets -> results
```

## Step-by-Step Walkthrough

### Step 1: Schema and indexes

```bash
npm install @prisma/client@7 @prisma/adapter-pg@7 pg dotenv cohere-ai @anthropic-ai/sdk
npm install -D prisma@7 typescript @types/node @types/pg
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Document {
  id        String                      @id @default(cuid())
  title     String
  content   String
  category  String
  tags      String[]
  createdAt DateTime                    @default(now())
  embedding Unsupported("vector(1024)")?

  @@index([category])
  @@index([createdAt])
}
```

`embed-english-v3.0` returns 1024-dimension vectors, so the column is `vector(1024)` and accepts 512 tokens per input, which is why documents are truncated before embedding. Prisma 7 reads the connection string from `prisma.config.ts`:

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

Prisma cannot express the extension, the generated column or the special indexes, so add them in a migration created with `npx prisma migrate dev --create-only` and edited by hand. Put `CREATE EXTENSION` at the very top of the generated file, because Prisma's own `CREATE TABLE` uses the `vector` type, and append the rest after it. The database needs pgvector available, for example the `pgvector/pgvector` Docker image:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Document" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || content)) STORED;

CREATE INDEX documents_search_idx ON "Document" USING GIN (search_vector);

-- HNSW needs no training step and can be built on an empty table (vector: up to 2,000 dimensions)
CREATE INDEX documents_embedding_idx ON "Document"
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

For a bulk load, create the HNSW index after loading and raise `maintenance_work_mem` so the graph fits in memory; the build is much faster ([pgvector README](https://github.com/pgvector/pgvector#hnsw)).

### Step 2: Embeddings, query expansion and hybrid search

One module holds all three pieces. Cohere accepts at most 96 texts per call, so documents are embedded in batches. Cohere requires `inputType` (`search_document` when indexing, `search_query` when searching), and with the V2 client the vectors come back in `embeddings.float` when you request `embeddingTypes: ["float"]`. Claude Haiku 5.5 is the fast, cheap tier and is plenty for rewriting a query. Filters are built with `Prisma.sql` fragments so every value stays a bound parameter.

```typescript
// src/lib.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CohereClientV2 } from "cohere-ai";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, PrismaClient } from "./generated/prisma/client";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
export const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

async function embed(texts: string[], inputType: "search_document" | "search_query") {
  const res = await cohere.embed({
    texts, // max 96 per call
    model: "embed-english-v3.0", // 1024 dimensions
    inputType,
    embeddingTypes: ["float"],
  });
  return res.embeddings.float ?? [];
}

export async function embedDocuments(documentIds: string[]) {
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, title: true, content: true },
  });
  for (let i = 0; i < docs.length; i += 96) {
    const batch = docs.slice(i, i + 96);
    const vectors = await embed(
      batch.map((d) => `${d.title}\n${d.content.slice(0, 2000)}`),
      "search_document",
    );
    for (let j = 0; j < batch.length; j++) {
      const vec = `[${vectors[j].join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "Document" SET embedding = ${vec}::vector WHERE id = ${batch[j].id}`;
    }
  }
}

export async function expandQuery(query: string): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Write 3 alternative search queries for: "${query}"\nReturn only the queries, one per line, no numbering.`,
    }],
  });
  const block = message.content.find((b) => b.type === "text");
  const lines = block?.type === "text" ? block.text.trim().split("\n").filter(Boolean) : [];
  return [query, ...lines.slice(0, 3)];
}

const K = 60; // RRF constant
type Filters = { category?: string; tags?: string[]; dateFrom?: Date };

function whereClause(f: Filters = {}) {
  const parts = [Prisma.sql`TRUE`];
  if (f.category) parts.push(Prisma.sql`category = ${f.category}`);
  if (f.tags?.length) parts.push(Prisma.sql`tags @> ${f.tags}::text[]`);
  if (f.dateFrom) parts.push(Prisma.sql`"createdAt" >= ${f.dateFrom}`);
  return Prisma.join(parts, " AND ");
}

export async function hybridSearch(query: string, filters?: Filters) {
  const queries = await expandQuery(query);
  const where = whereClause(filters);
  const [queryVec] = await embed([query], "search_query");
  const vec = `[${queryVec.join(",")}]`;
  // Keyword side: original query plus the expansions, OR-ed together
  const tsQuery = queries.join(" or ");

  const [keyword, semantic] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Document"
      WHERE search_vector @@ websearch_to_tsquery('english', ${tsQuery}) AND ${where}
      ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${tsQuery})) DESC
      LIMIT 100`,
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL hnsw.iterative_scan = strict_order`;
      return tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Document"
        WHERE embedding IS NOT NULL AND ${where}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT 100`;
    }),
  ]);

  const scores = new Map<string, number>();
  for (const list of [keyword, semantic]) {
    list.forEach((doc, rank) =>
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (K + rank + 1)));
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);

  const rows = await prisma.document.findMany({
    where: { id: { in: ranked } },
    select: { id: true, title: true, category: true, tags: true, createdAt: true },
  });
  return ranked.map((id) => rows.find((r) => r.id === id)!); // keep RRF order
}
```

Notes on the search function:

- The keyword side OR-s the original query with its expansions (`websearch_to_tsquery` treats `or` as an operator) and ranks with `ts_rank_cd`. The semantic side embeds only the original query.
- Approximate indexes apply `WHERE` filters after the index scan, so a selective filter can return fewer than 100 rows. `SET LOCAL hnsw.iterative_scan = strict_order` (pgvector 0.8+) makes the scan continue until enough rows match. It sits in a transaction so the setting does not leak to other queries.
- RRF scores each document as the sum of `1 / (60 + rank)` over the lists it appears in; 60 is the constant from the original RRF paper.

### Step 3: Faceted API

```typescript
// src/route.ts
import { hybridSearch, prisma } from "./lib";

// app/api/search/route.ts (Next.js App Router)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const results = await hybridSearch(searchParams.get("q") ?? "", {
    category: searchParams.get("category") ?? undefined,
    tags: searchParams.getAll("tag"),
    dateFrom: from ? new Date(from) : undefined,
  });
  const facets = await prisma.document.groupBy({
    by: ["category"],
    _count: { id: true },
    where: { id: { in: results.map((r) => r.id) } },
  });
  return Response.json({ results, facets });
}
```

Run the embedding job for new documents (`embedDocuments(ids)`) from your ingest path or a queue worker, not from the request path.

### Step 4: Tune with real queries

| Technique | Why |
|-----------|-----|
| Raise `hnsw.ef_search` (default 40) | Better recall for a little latency; set per transaction with `SET LOCAL` |
| Cache query embeddings (Redis or in-process LRU) | Skips a Cohere call for repeated queries |
| Cache expansions per query string | Removes the LLM call from the hot path |
| Truncate documents before embedding | Fewer tokens per request; embed long documents as several chunks instead |

Measure with your own labelled queries: run keyword-only, vector-only and hybrid over the same set and compare recall@10. Check plans with `EXPLAIN ANALYZE` to confirm both indexes are used.

## Real-World Example

Marcus's team labelled 200 real contract queries and compared the three modes. In their own test, hybrid ranking found the right clause in the top 10 noticeably more often than either side alone: keyword-only missed paraphrases ("termination for convenience" vs "end the agreement early") and vector-only missed exact references. They shipped it on their existing Postgres instance with no extra infrastructure to run.

## Related Skills

- [prisma](/skills/prisma): schema, migrations, driver adapter setup
- [cohere-api](/skills/cohere-api): embeddings (and Rerank, if you later add a cross-encoder stage)
- [anthropic-sdk](/skills/anthropic-sdk): query expansion with Claude
