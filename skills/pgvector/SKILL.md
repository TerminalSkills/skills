---
name: pgvector
description: >-
  pgvector is a PostgreSQL extension that stores vector embeddings in ordinary tables and searches them by similarity, so no separate vector database is needed. Use when someone asks for "vector search in Postgres", "store embeddings", "pgvector", "similarity search", "RAG with Postgres", "semantic search in an existing database", or "HNSW vs IVFFlat". Covers vector columns, indexes, filtered search, and Node.js and Drizzle usage.
license: Apache-2.0
compatibility: "PostgreSQL 13+ with pgvector 0.8.x (managed on Supabase, Neon, RDS, Cloud SQL and others, or self-installed). Clients for Node.js, Python and most languages."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/pgvector/pgvector
  tags: ["vector", "embeddings", "postgres", "pgvector", "rag"]
---

# pgvector

## Overview

pgvector adds vector types, distance operators and approximate indexes to PostgreSQL. Embeddings sit next to your relational data, so filters, joins, transactions and backups work as usual. Types: `vector` (up to 16,000 dimensions stored, 2,000 indexable), `halfvec` (half precision, 4,000 indexable), `bit` (binary) and `sparsevec`. Distance operators: `<->` L2, `<=>` cosine, `<#>` negative inner product, `<+>` L1, `<~>` Hamming, `<%>` Jaccard. Latest release at the time of writing: 0.8.7 (2026-10-01); 0.8.x fixed several HNSW and IVFFlat bugs, so use the newest patch your provider offers.

Without an index, search is exact (perfect recall). With HNSW or IVFFlat it is approximate: results can differ from the exact answer.

## Instructions

### Install and enable

Hosted Postgres usually has it already; run `CREATE EXTENSION vector;` once per database. Self-hosted options: the `pgvector/pgvector` Docker image (for example `pgvector/pgvector:pg17`), `apt install postgresql-17-pgvector` from the PGDG repository, Homebrew, or building the tagged source (`git clone --branch v0.8.7 https://github.com/pgvector/pgvector.git && make && make install`). Check the version with `SELECT extversion FROM pg_extension WHERE extname = 'vector';`.

### Schema and index

```sql
CREATE TABLE documents (
  id         bigserial PRIMARY KEY,
  tenant_id  int NOT NULL,
  title      text NOT NULL,
  content    text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  embedding  vector(1536) NOT NULL,      -- must equal the embedding model's output size
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON documents (tenant_id);   -- supports exact filtered search
```

Pick the operator class that matches the operator you query with: `vector_cosine_ops` for `<=>`, `vector_l2_ops` for `<->`, `vector_ip_ops` for `<#>`. Use `halfvec_cosine_ops` on `halfvec` columns. HNSW has better speed/recall than IVFFlat but builds slower and uses more memory; it needs no training data, so it can be created on an empty table. IVFFlat (`USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`) must be built after the data is loaded, and its quality depends on that data. In production build with `CREATE INDEX CONCURRENTLY` and raise `maintenance_work_mem` so the HNSW graph fits in memory.

For embeddings above 2,000 dimensions, store `halfvec` (index up to 4,000) or index a cast expression: `CREATE INDEX ON documents USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);` and query with the same cast.

### Query

```sql
-- nearest 5 by cosine distance; similarity = 1 - distance
SELECT id, title, 1 - (embedding <=> $1) AS similarity
FROM documents
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 5;
```

An index is used only for `ORDER BY embedding <=> $1 LIMIT n` (an ORDER BY on the distance operator). Tune recall per query inside a transaction: `SET LOCAL hnsw.ef_search = 100;` (default 40) or, for IVFFlat, `SET LOCAL ivfflat.probes = 10;` (default 1).

Approximate indexes filter after the scan, so a selective `WHERE` can return fewer than `LIMIT` rows. Since 0.8.0, enable iterative scans: `SET LOCAL hnsw.iterative_scan = relaxed_order;` (or `strict_order`; `ivfflat.iterative_scan = relaxed_order`). Other options: a B-tree on the filter column, partial indexes for a few fixed values, or partitioning by tenant. Check with `EXPLAIN (ANALYZE, BUFFERS)`.

### Node.js

```typescript
// db.ts - node-postgres with pgvector-node (npm install pg pgvector openai)
import pg from "pg";
import pgvector from "pgvector/pg";
import OpenAI from "openai";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
pool.on("connect", (client) => pgvector.registerTypes(client));
const openai = new OpenAI(); // reads OPENAI_API_KEY

export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
  return res.data[0].embedding; // 1536 dimensions
}

export async function storeDocument(tenantId: number, title: string, content: string) {
  await pool.query(
    "INSERT INTO documents (tenant_id, title, content, embedding) VALUES ($1, $2, $3, $4)",
    [tenantId, title, content, pgvector.toSql(await embed(content))],
  );
}

export async function semanticSearch(tenantId: number, query: string, limit = 5) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
    const { rows } = await client.query(
      `SELECT id, title, content, 1 - (embedding <=> $1) AS similarity
       FROM documents WHERE tenant_id = $2 ORDER BY embedding <=> $1 LIMIT $3`,
      [pgvector.toSql(await embed(query)), tenantId, limit],
    );
    await client.query("COMMIT");
    return rows;
  } finally {
    client.release();
  }
}
```

Apply a similarity cutoff in application code on the returned rows rather than in `WHERE`.

### RAG

Retrieve with `semanticSearch`, join the chunks into the prompt, and ask the chat model to answer only from them. Chunk documents to roughly 300-800 tokens with a little overlap before embedding, store the source URL in `metadata`, and return it so answers can cite it.

### Drizzle ORM

Drizzle has a native column type; the old hand-written `customType` is not needed. Create the extension in a custom migration (`npx drizzle-kit generate --custom`, then `CREATE EXTENSION vector;`).

```typescript
import { index, pgTable, serial, text, vector } from "drizzle-orm/pg-core";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";

export const guides = pgTable("guides", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
}, (t) => [index("guides_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops"))]);

const similarity = sql<number>`1 - (${cosineDistance(guides.embedding, queryEmbedding)})`;
const rows = await db.select({ title: guides.title, similarity }).from(guides)
  .where(gt(similarity, 0.5)).orderBy(desc(similarity)).limit(5);
```

## Examples

### Example 1: Semantic search over existing articles

Request: "I have a Postgres database with articles. Add search by meaning, not just keywords."

Run `ALTER TABLE articles ADD COLUMN embedding vector(1536);`, backfill in batches of 100 rows by embedding `title || E'\n' || body` with `text-embedding-3-small`, then `CREATE INDEX CONCURRENTLY ON articles USING hnsw (embedding vector_cosine_ops);`. Expose `GET /search?q=` that embeds the query and runs the `ORDER BY embedding <=> $1 LIMIT 10` query, keeping existing filters such as `published = true` in the same statement. For keyword plus meaning, combine with Postgres full-text search and merge results with reciprocal rank fusion.

### Example 2: Q&A over internal docs

Request: "Build a Q&A bot over our handbook using the Postgres we already have."

Split each handbook page into chunks, store them in `documents` with `tenant_id` and `metadata->>'url'`, fetch the top 5 with `semanticSearch`, and send them as context to the chat model with an instruction to say "not in the handbook" when the context lacks the answer. Result: answers with links to the source pages, and re-ingestion is an `UPDATE`.

## Guidelines

- Dimensions must match the model: `text-embedding-3-small` returns 1536 by default, `text-embedding-3-large` 3072. Changing models means re-embedding everything; vectors from different models are not comparable.
- OpenAI embeddings are normalized, so inner product (`<#>`, with the sign flipped) is slightly faster than cosine.
- Never write `WHERE distance < x` and expect it to fix recall; filters run after an approximate scan. Use iterative scans, partial indexes or partitions.
- Load bulk data with `COPY` and create IVFFlat indexes afterwards. HNSW vacuum is slow; `REINDEX INDEX CONCURRENTLY` before `VACUUM` helps.
- Memory matters: an HNSW index that does not fit in RAM is slow. Use `halfvec` or binary quantization with re-ranking at large scale.
- Do not pass user-supplied text into SQL strings; use parameters. Treat retrieved chunks as untrusted when building prompts.
- At hundreds of millions of vectors, or when you need distributed ANN, a dedicated vector database may fit better.
