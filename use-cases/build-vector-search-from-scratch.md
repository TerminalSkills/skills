---
title: "Build Vector Search from Scratch with pgvector"
description: "Build a production-grade semantic search system using PostgreSQL and pgvector — no managed vector database required."
skills: [prisma, cohere-api]
difficulty: intermediate
time_estimate: "4 hours"
tags: [vector-search, pgvector, postgres, prisma, cohere, semantic-search, embeddings]
---

# Build Vector Search from Scratch with pgvector

> **Persona:** You're a developer who needs semantic search for your app. A managed vector database means another service, another bill and another place where your data lives. You already have Postgres. Let's use it.

pgvector adds a `vector` column type and approximate-nearest-neighbour indexes (HNSW and IVFFlat) to PostgreSQL. Documents, metadata and embeddings live in one table, so a filter such as "only this user's invoices" is a plain `WHERE` clause.

## What You'll Build

- Cohere embeddings for your documents (1024 dimensions)
- A pgvector column with an HNSW index, managed through Prisma migrations
- Semantic search with metadata filters
- Update and re-embed handling

## Setup

This guide uses Prisma 7, which needs Node.js 20.19+ and an ES module project. On 2026-10-24 the npm `latest` tag of `prisma` already pointed at the 8.0 release candidate, so pin the major version.

```bash
npm install --save-dev prisma@7 typescript tsx @types/node @types/pg
npm install @prisma/client@7 @prisma/adapter-pg pg dotenv cohere-ai
npm pkg set type=module
```

Run Postgres with pgvector locally, bound to loopback only:

```bash
docker run -d --name pgvector -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB=app pgvector/pgvector:pg18
```

```ini
# .env
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/app
COHERE_API_KEY=<your Cohere API key>
```

## Prisma Config and Schema

Prisma 7 no longer takes the connection URL in `schema.prisma`; it lives in `prisma.config.ts`, and the client needs a driver adapter.

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  extensions = [vector]
}

model Document {
  id        String                 @id @default(cuid())
  title     String
  content   String
  category  String
  userId    String
  createdAt DateTime               @default(now())
  embedding Unsupported("vector(1024)")?

  @@index([category])
  @@index([userId])
}
```

Prisma writes `CREATE EXTENSION IF NOT EXISTS "vector"` into the first migration. The database user needs permission to create extensions (the `postgres` user in the container does).

```bash
npx prisma migrate dev --name add-vector-search
```

Prisma cannot describe an HNSW index in the schema, so add it as its own hand-written migration. Keeping it in the migration history avoids drift between environments:

```bash
npx prisma migrate dev --create-only --name add-hnsw-index
```

Put this in the generated `prisma/migrations/<timestamp>_add_hnsw_index/migration.sql`, then apply and generate the client:

```sql
CREATE INDEX "Document_embedding_hnsw_idx" ON "Document"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

```bash
npx prisma migrate dev
npx prisma generate   # Prisma 7 no longer generates the client for you after migrate dev
```

`m` and `ef_construction` above are pgvector's defaults. A higher `ef_construction` gives better recall at the cost of build time and slower inserts. The `vector` type can be HNSW-indexed up to 2,000 dimensions, so 1024 fits.

## Client and Embeddings

```typescript
// src/db.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

Cohere's current embedding models (`embed-v5.0-pro`, `embed-v5.0-fast`, `embed-v4.0`) let you pick the output size, so we ask for 1024 dimensions to match the column. Use `search_document` when indexing and `search_query` for queries, since the model embeds the two differently.

```typescript
// src/embed.ts
import { CohereClientV2 } from "cohere-ai";

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY! });

const MODEL = "embed-v5.0-fast"; // embed-v5.0-pro for the highest quality
const DIMENSIONS = 1024;         // must match vector(1024) in the schema

async function embed(texts: string[], inputType: "search_document" | "search_query") {
  const res = await cohere.embed({
    texts, // at most 96 per call
    model: MODEL,
    inputType,
    embeddingTypes: ["float"],
    outputDimension: DIMENSIONS,
  });
  return res.embeddings.float!;
}

export const embedDocuments = (texts: string[]) => embed(texts, "search_document");
export const embedQuery = async (q: string) => (await embed([q], "search_query"))[0];
```

Changing the model or the dimension later means re-embedding every row, because vectors from different models are not comparable.

## Indexing and Updating Documents

Prisma Client cannot write `Unsupported` columns, so inserts and updates of the vector use raw SQL (tagged templates, so every value is a bound parameter).

```typescript
// src/indexer.ts
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { embedDocuments } from "./embed";

export interface NewDoc { title: string; content: string; category: string; userId: string }

export async function indexDocuments(docs: NewDoc[]) {
  const BATCH_SIZE = 96; // Cohere's per-request maximum
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const vectors = await embedDocuments(batch.map((d) => `${d.title}\n${d.content}`));
    for (const [j, d] of batch.entries()) {
      await prisma.$executeRaw`
        INSERT INTO "Document" (id, title, content, category, "userId", embedding)
        VALUES (${randomUUID()}, ${d.title}, ${d.content}, ${d.category}, ${d.userId},
                ${JSON.stringify(vectors[j])}::vector)`;
    }
    console.log(`Indexed ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
  }
}

// Keep the embedding in sync with the text it describes.
export async function updateDocument(id: string, content: string) {
  const [vector] = await embedDocuments([content]);
  await prisma.$executeRaw`
    UPDATE "Document" SET content = ${content}, embedding = ${JSON.stringify(vector)}::vector
    WHERE id = ${id}`;
}
```

For bulk loads, create the HNSW index after the data is in (drop it first, reload, recreate): building once is much faster than updating the graph row by row.

## Search with Metadata Filters

`<=>` is cosine distance, so similarity is `1 - distance`. Filters are built with `Prisma.sql` and `Prisma.join`, which keeps user input out of the SQL text.

```typescript
// src/search.ts
import { Prisma } from "./generated/prisma/client";
import { prisma } from "./db";
import { embedQuery } from "./embed";

export interface SearchOptions {
  query: string;
  category?: string;
  userId?: string;
  createdAfter?: Date;
  limit?: number;
}

export async function semanticSearch(opts: SearchOptions) {
  const { query, category, userId, createdAfter, limit = 10 } = opts;
  const vec = JSON.stringify(await embedQuery(query));

  const filters: Prisma.Sql[] = [];
  if (category) filters.push(Prisma.sql`category = ${category}`);
  if (userId) filters.push(Prisma.sql`"userId" = ${userId}`);
  if (createdAfter) filters.push(Prisma.sql`"createdAt" > ${createdAfter}`);
  const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty;

  return prisma.$transaction(async (tx) => {
    // Filters run after the index scan. Iterative scans (pgvector 0.8+) keep
    // scanning until LIMIT rows survive the filters.
    await tx.$executeRaw`SET LOCAL hnsw.iterative_scan = relaxed_order`;
    return tx.$queryRaw<
      Array<{ id: string; title: string; content: string; category: string; similarity: number }>
    >`
      SELECT id, title, content, category, 1 - (embedding <=> ${vec}::vector) AS similarity
      FROM "Document"
      ${where}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}`;
  });
}
```

Without iterative scans, a filter matching 10% of rows combined with the default `hnsw.ef_search` of 40 returns about 4 rows on average, so a restrictive filter can come back nearly empty. `relaxed_order` may return results slightly out of order; use `strict_order` if exact ordering matters more than speed, or re-sort the page in your code.

## Measure It on Your Data

Do not trust anyone else's latency figures; they depend on your hardware, dimensions, filters and recall target. Measure with `EXPLAIN ANALYZE` and watch the index size:

```sql
SELECT pg_size_pretty(pg_relation_size('"Document_embedding_hnsw_idx"'));

-- Higher ef_search = better recall, slower queries (default 40)
SET hnsw.ef_search = 100;
```

Compare the approximate results with an exact scan (drop to `SET enable_indexscan = off;`) on a sample of real queries to see your recall, then raise `ef_search` or `m` until it is acceptable.

## What to Build Next

- **Hybrid keyword + vector:** combine with Postgres full-text search (`tsvector`) and merge rankings
- **Multi-tenant isolation:** always pass `userId` as a filter; for very large tenants consider partitioning the table
- **Re-embedding jobs:** queue a re-embed when you switch embedding models

## Related Skills

- [prisma](../skills/prisma/SKILL.md) — schema, migrations, driver adapters and raw queries
- [cohere-api](../skills/cohere-api/SKILL.md) — embedding models and input types
