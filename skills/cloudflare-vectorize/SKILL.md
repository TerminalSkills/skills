---
name: cloudflare-vectorize
description: >-
  Cloudflare Vectorize is a managed vector database that Cloudflare Workers
  query through a binding, used for semantic search and retrieval-augmented
  generation (RAG) with Workers AI embeddings. Use when building semantic
  search on Cloudflare Workers, a RAG pipeline at the edge, or when storing and
  querying embeddings with metadata filtering and namespaces without running a
  separate vector database.
license: Apache-2.0
compatibility: "Cloudflare account (Workers Free or Paid), Node.js and a current Wrangler (Vectorize V2 needs 3.71.0 or later)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "cloudflare, vectorize, vector-database, edge, semantic-search"
  use-cases: "Build semantic search for a documentation site using Cloudflare Workers + Vectorize, Implement RAG at the edge combining Vectorize with Workers AI embeddings, Store and query product embeddings for recommendation systems on Cloudflare"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Cloudflare Vectorize

## Overview

Cloudflare Vectorize stores embeddings and answers approximate nearest-neighbor queries from Workers through a binding. It supports metadata filtering, namespaces, and pairs with Workers AI for embeddings and generation.

Limits that shape the design (Cloudflare limits page, August 2026): up to 1536 dimensions (float32), 10 KiB metadata per vector, 64-byte IDs, 20 million vectors per index, upsert batches of 1000 from a Worker (5000 over the HTTP API), `topK` up to 100, but only 50 when you return values or all metadata. Dimensions and metric are fixed at creation. Legacy V1 indexes (200,000 vectors, `topK` 20) are deprecated; everything below is V2.

## Instructions

### 1. Create the index and bind it

```bash
# 768 dimensions for @cf/baai/bge-base-en-v1.5
npx wrangler vectorize create docs-search --dimensions=768 --metric=cosine

# Metadata filtering needs an index per property, created BEFORE you insert (max 10 per index)
npx wrangler vectorize create-metadata-index docs-search --property-name=category --type=string
npx wrangler vectorize create-metadata-index docs-search --property-name=published_at --type=number
```

Metrics are `cosine`, `euclidean` and `dot-product`. `--preset` configures dimensions and metric for a known embedding model. Vectors upserted before a metadata index exists are not in it until you upsert them again.

Bind it in `wrangler.jsonc` (TOML `[[vectorize]]` works too):

```jsonc
{
  "name": "docs-search-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "docs-search" }],
  "ai": { "binding": "AI" }
}
```

Run `npx wrangler types` after editing the config to generate the `Env` type, instead of hand-writing it.

### 2. Insert and upsert

Vector `values` must be a dense `number[]`, `Float32Array` or `Float64Array` whose length equals the index dimensions. Writes are asynchronous: the call returns a mutation ID and vectors become queryable after a few seconds.

- `insert()` keeps the first vector stored for an ID and ignores later ones.
- `upsert()` replaces the whole vector (values and metadata) for an ID. Use it for updates.

```typescript
const result = await env.VECTORIZE.upsert([
  {
    id: "intro-001",
    values: embedding,                 // 768 numbers
    metadata: { title: "Introduction to Workers", url: "/docs/intro", category: "guide", published_at: 1760000000 },
  },
]);
// result.mutationId identifies the asynchronous write
```

Metadata keys cannot be empty, contain `.` or `"`, or start with `$`.

### 3. Query

```typescript
const results = await env.VECTORIZE.query(queryVector, {
  topK: 5,
  returnMetadata: "all",   // "none" (default) | "indexed" | "all"
  returnValues: false,
});
// results.matches: [{ id, score, metadata }], best match first
```

`returnMetadata: "indexed"` is faster but returns only indexed properties (long strings may be truncated). `returnValues: true` switches to exact scoring and is slower. `queryById(id, options)` searches with a vector already stored in the index.

### 4. Metadata filters and namespaces

A filter is applied first, then `topK` is taken from the filtered set. Operators: `$eq`, `$ne`, `$in`, `$nin`, `$lt`, `$lte`, `$gt`, `$gte`. Several keys are ANDed; a range may combine one upper and one lower bound; a filter must be under 2048 bytes of JSON.

```typescript
const results = await env.VECTORIZE.query(queryVector, {
  topK: 10,
  returnMetadata: "all",
  filter: { category: { $in: ["guide", "tutorial"] }, published_at: { $gte: 1750000000 } },
});
```

Namespaces partition one index, for example per customer. Set `namespace` on upsert and on query; the namespace filter runs before metadata filters. An index holds up to 1000 namespaces on Workers Free and 50,000 on Paid.

```typescript
await env.VECTORIZE.upsert([{ id: "kb-17", values: embedding, namespace: "customer-4821", metadata: { text: "Reset steps..." } }]);
const hits = await env.VECTORIZE.query(queryVector, { topK: 5, namespace: "customer-4821" });
```

### 5. Read, delete, describe

```typescript
const vectors = await env.VECTORIZE.getByIds(["intro-001", "intro-002"]);
await env.VECTORIZE.deleteByIds(["intro-001"]);
const details = await env.VECTORIZE.describe();   // dimensions, metric
```

### 6. RAG with Workers AI

`env.AI.run` for a text embedding model returns `{ shape, data }`; pass `data[0]` (one vector) to `query()`, never the whole response.

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question } = (await request.json()) as { question: string };

    const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [question] });
    const search = await env.VECTORIZE.query(embedding.data[0], { topK: 3, returnMetadata: "all" });

    const context = search.matches.map((m) => m.metadata?.text as string).filter(Boolean).join("\n\n");

    const answer = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        { role: "system", content: `Answer using only this context.\n\n${context}` },
        { role: "user", content: question },
      ],
      max_tokens: 512,
    });

    return Response.json({
      answer: answer.response,
      sources: search.matches.map((m) => ({ id: m.id, score: m.score, url: m.metadata?.url })),
    });
  },
};
```

Model catalog entries change; confirm the generation model in the Workers AI model list before deploying. Keep embedding model, `pooling` option and dimensions identical between indexing and querying (`bge-base` default pooling is `mean`; `cls` vectors are not compatible with it).

### 7. Bulk indexing

```typescript
async function indexDocuments(docs: { id: string; text: string; url: string }[], env: Env, batchSize = 50) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: batch.map((d) => d.text) });
    await env.VECTORIZE.upsert(
      batch.map((d, n) => ({ id: d.id, values: embeddings.data[n], metadata: { url: d.url, text: d.text.slice(0, 2000) } })),
    );
  }
}
```

### Wrangler commands

```bash
npx wrangler vectorize list
npx wrangler vectorize info docs-search
npx wrangler vectorize list-metadata-index docs-search
npx wrangler vectorize get-vectors docs-search --ids intro-001 intro-002
npx wrangler vectorize list-vectors docs-search --count=100
npx wrangler vectorize delete docs-search     # asks for confirmation; --force skips it
```

## Examples

### Example 1: Semantic search for a docs site

**User prompt:** "Add semantic search to our docs Worker. Pages have a title, URL and section."

Create a 768-dimension cosine index `docs-search`, add a metadata index on `section`, bind it as `VECTORIZE`, and run `indexDocuments` over the pages. A request `GET /search?q=reset+password&section=guide` embeds the query, calls `query()` with `filter: { section: "guide" }`, and returns JSON like `[{ "id": "intro-001", "score": 0.83, "url": "/docs/intro" }]`.

### Example 2: Per-customer knowledge base

**User prompt:** "Each customer gets their own FAQ search. Don't mix tenants."

Upsert each customer's chunks with `namespace: customerId` and always pass the same `namespace` on `query()`, taking it from the authenticated session, never from the request body. A query for customer-4821 returns only vectors upserted under that namespace.

## Guidelines

- Dimensions must equal the model's output exactly; a mismatch fails at write time. Metric and dimensions cannot be changed later, so create a new index to switch models and re-embed everything.
- Create metadata indexes before inserting; filtering on a property without an index does not work. Keep indexed values low-cardinality or bucketed (for example timestamps rounded to the hour); string indexes cover only the first 64 bytes.
- Store the source text (or an ID to look it up) in metadata; keep it under 10 KiB per vector.
- Writes are eventually consistent: do not query for a vector in the same request that upserted it.
- Namespaces separate tenants for search, but authorization is your code's job: derive the namespace server-side.
- Use `topK` 50 or less when returning values or `all` metadata.
