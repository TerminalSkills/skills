---
name: orama
description: >-
  Orama is an in-process search engine for JavaScript and TypeScript: full-text,
  vector and hybrid search that runs in the browser, on a server or at the edge
  with no external service. Use when someone asks to "add search to my docs
  site", "client-side search", "typo-tolerant search", "faceted search in
  JavaScript", "vector search without a database", or mentions Orama or
  @orama/orama. Covers schemas, filters, facets, sorting, embeddings, React, and
  saving an index to a file.
license: Apache-2.0
compatibility: Any JavaScript runtime (browser, Node.js, Deno, Bun, edge workers). Written for @orama/orama 3.x.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
  - search
  - full-text
  - vector-search
  - browser
  - edge
  repository: https://github.com/oramasearch/orama
---

# Orama — Full-Text & Vector Search Engine

## Overview

Orama is an open-source search engine written in TypeScript with zero dependencies. The index lives in memory inside your own process — browser tab, Node.js server, or edge worker — so there is no search server to run. It supports full-text search (BM25 ranking, typo tolerance, prefix matching), filters, facets, sorting, geosearch, and vector or hybrid search over embeddings you provide.

Since v3.0.0 `create`, `insert` and `search` are synchronous; they only return promises when a plugin with async hooks is installed. Their TypeScript return type is a union of both, so `await` the call (harmless when it is sync) to get a typed result. This skill covers the open-source `@orama/orama` library, not the hosted Orama Cloud product, which uses a different SDK (`@orama/core`).

## Instructions

### Basic Full-Text Search

```typescript
// src/search/index.ts — Create and populate a search index
import { create, insertMultiple, search } from "@orama/orama";

// Only "string" and "string[]" properties are full-text searchable; the rest are for filters, facets and sorting
export const db = create({
  schema: {
    title: "string",
    content: "string",
    category: "enum",              // Exact-match filter value (not searchable)
    tags: "enum[]",                // Filterable list of values
    publishedAt: "number",         // Unix timestamp for range filters
    author: "string",
    views: "number",
  },
});

await insertMultiple(db, [
  {
    title: "Getting Started with Orama Search",
    content: "Orama is a full-text search engine that works in the browser, on the server, and at the edge.",
    category: "tutorial", tags: ["search", "javascript", "performance"],
    publishedAt: Date.parse("2026-09-12"), author: "Alex Chen", views: 1250,
  },
  {
    title: "Building Real-Time Search with React",
    content: "Implement instant search in a React application with typo tolerance.",
    category: "tutorial", tags: ["react", "search", "ui"],
    publishedAt: Date.parse("2026-09-25"), author: "Marta Lopez", views: 890,
  },
]);

const results = await search(db, {
  term: "serch engne",
  tolerance: 1,                     // Max edit distance per word. Default is 0: typos match nothing
  properties: ["title", "content"], // Which fields to search (default: all string fields)
  boost: { title: 2 },              // Matches in the title count double
  limit: 10,                        // Default 10
  offset: 0,
});

console.log(`Found ${results.count} results in ${results.elapsed.formatted}`); // "Found 2 results in 380μs"
for (const hit of results.hits) {
  console.log(`${hit.score.toFixed(2)} | ${hit.document.title}`);          // "0.62 | Getting Started with Orama Search"
}
```

Other calls from the same package: `insert`, `update`, `upsert`, `remove`, `getByID`, `count`. Omitting `term` matches every document. `exact: true` matches whole words only and overrides `tolerance`.

### Filters and Facets

```typescript
// src/search/filtered.ts — Search with filters, facets, and sorting
import { search } from "@orama/orama";
import { db } from "./index.js";

const filtered = await search(db, {
  term: "search",
  where: {
    category: { eq: "tutorial" },                       // enum: eq, in, nin
    publishedAt: { gt: Date.parse("2026-09-01") },      // number: gt, gte, lt, lte, eq, between
    views: { between: [100, 10000] },                   // One operator per property — use between for a range
    tags: { containsAll: ["react"] },                   // enum[]: containsAll, containsAny
  },
  sortBy: { property: "views", order: "DESC" },         // Most popular first
  limit: 20,
});

// Faceted search — get aggregated counts for filters
const faceted = await search(db, {
  term: "search",
  facets: {
    category: { limit: 10 },               // Top 10 categories
    tags: { limit: 20 },
    views: { ranges: [{ from: 0, to: 100 }, { from: 100, to: 1000 }, { from: 1000, to: 100000 }] },
  },
});
console.log(faceted.facets);
// {
//   category: { count: 1, values: { tutorial: 2 } },
//   tags: { count: 5, values: { react: 1, search: 2, ui: 1, javascript: 1, performance: 1 } },
//   views: { count: 3, values: { "0-100": 0, "100-1000": 1, "1000-100000": 1 } },
// }
```

`string` properties are filtered with a plain value or a list of alternatives (`author: "Chen"`, `author: ["Chen", "Lopez"]`), matched token by token. Boolean properties take `true` or `false`. Conditions on different properties are ANDed.

### Hybrid Search (Keyword + Vector)

Orama stores and compares vectors but does not create them. Generate embeddings with any model, declare the dimension in the schema, and pass the query vector at search time:

```typescript
// src/search/hybrid.ts — Hybrid search combining BM25 and vector similarity
import { create, insertMultiple, search } from "@orama/orama";
import { embed } from "./embed.js"; // Your function: (text: string) => Promise<number[]>, 384 numbers here

const db = create({
  // The vector size must equal the model's output size, or insert and search throw
  schema: { title: "string", content: "string", category: "enum", embedding: "vector[384]" },
});

const docs = [
  { title: "Kubernetes Pod Scheduling", content: "How the scheduler assigns pods to nodes based on resource requests, affinity rules, and taints.", category: "devops" },
  { title: "Rolling Deployments", content: "Replace container instances gradually so the service stays available during a release.", category: "devops" },
];
await insertMultiple(db, await Promise.all(
  docs.map(async (doc) => ({ ...doc, embedding: await embed(`${doc.title}. ${doc.content}`) })),
));

const question = "how to deploy containers";
const results = await search(db, {
  mode: "hybrid",                        // "fulltext" (default) | "vector" | "hybrid"
  term: question,
  vector: { value: await embed(question), property: "embedding" },
  similarity: 0.8,                       // Minimum cosine similarity for the vector half. Default 0.8
  hybridWeights: { text: 0.5, vector: 0.5 }, // Default weights
  limit: 10,
});

// Pure vector search (semantic only, no keyword matching); filters still apply
const semantic = await search(db, {
  mode: "vector",
  vector: { value: await embed("container orchestration best practices"), property: "embedding" },
  similarity: 0.75,
  where: { category: { eq: "devops" } },
});
```

Hits come back with the vector property set to `null` unless `includeVectors: true` is set. On 3.1.18 a vector or hybrid search without that flag also sets it to `null` on the stored document (the index keeps working), so later `getByID` calls and `includeVectors` searches return `null` — keep your own copy of embeddings you need again.

### React Integration

No extra package is needed: `search` is fast enough to call on every keystroke.

```tsx
// src/components/SearchBox.tsx — Instant search with React
import { useMemo, useState } from "react";
import { search, type AnyOrama, type Results } from "@orama/orama";

type Article = { title: string; content: string; category: string };

export function SearchBox({ db }: { db: AnyOrama }) {
  const [query, setQuery] = useState("");

  // Synchronous and in memory, so there is no loading state to manage
  const results = useMemo(
    () => search(db, { term: query, tolerance: 1, limit: 10, facets: { category: { limit: 5 } } }) as Results<Article>,
    [db, query],
  );

  return (
    <div>
      <input type="search" value={query} placeholder="Search articles..."
        onChange={(e) => setQuery(e.target.value)} />
      {results.hits.map((hit) => (
        <article key={hit.id}>
          <h3>{hit.document.title}</h3>
          <p>{hit.document.content.slice(0, 150)}...</p>
        </article>
      ))}
      {Object.entries(results.facets?.category?.values ?? {}).map(([cat, count]) => (
        <button key={cat}>{cat} ({count})</button>
      ))}
    </div>
  );
}
```

### Persistence and Serialization

```typescript
// src/search/persistence.ts — Persist search index to disk or storage
import { create, save, load } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import { persistToFile, restoreFromFile } from "@orama/plugin-data-persistence/server"; // Node, Deno, Bun only
import { db } from "./index.js";

// Core only: save() returns a plain object, load() fills an instance created with the same schema
const snapshot = save(db);
const copy = create({ schema: db.schema });
load(copy, snapshot);

// Plugin: one string or buffer that also carries the schema — works in the browser
const json = await persist(db, "json");            // formats: "json", "binary", "seqproto"
const restored = await restore("json", json);

// Plugin, server side: write straight to a file
const filePath = await persistToFile(db, "binary", "./search-index.msp");
const fromFile = await restoreFromFile("binary", filePath);
```

## Installation

```bash
npm install @orama/orama
npm install @orama/plugin-data-persistence   # Optional: save and restore indexes
npm pkg set type=module                      # The snippets use top-level await, which needs an ESM project
```

## Examples

### Example 1: Ship a prebuilt index with a static site

**User request:** "Add search to my blog. It's a static site, so I don't want a search server."

Build the index once at build time, then load the file in the browser.

```typescript
// scripts/build-search-index.ts — run with: npx tsx scripts/build-search-index.ts
import { readFileSync, writeFileSync } from "node:fs";
import { create, insertMultiple, count } from "@orama/orama";
import { persist } from "@orama/plugin-data-persistence";

const articles = JSON.parse(readFileSync("content/articles.json", "utf-8"));
const db = create({
  schema: { title: "string", content: "string", category: "enum", tags: "enum[]", publishedAt: "number", views: "number" },
});
await insertMultiple(db, articles);

const index = (await persist(db, "json")) as string;
writeFileSync("public/search-index.json", index);
console.log(`Indexed ${count(db)} articles → public/search-index.json (${(index.length / 1024).toFixed(1)} kB)`);
// Indexed 3 articles → public/search-index.json (7.5 kB)
```

```typescript
// src/search/client.ts — in the browser
import { search } from "@orama/orama";
import { restore } from "@orama/plugin-data-persistence";

const db = await restore("json", await (await fetch("/search-index.json")).text());
const results = await search(db, { term: "serch", tolerance: 1 });
// results.hits → "Building Real-Time Search with React", "Getting Started with Orama Search", ...
```

### Example 2: Fix "no results for typos, too many results for long queries"

**User request:** "Searching 'serch engne' finds nothing, but 'instant search react' returns almost every article."

Both are defaults: `tolerance` is 0, and `threshold` is 1, which keeps every document containing any one of the words. With the three articles from Example 1:

```typescript
await search(db, { term: "serch engne" });                          // count: 0
await search(db, { term: "serch engne", tolerance: 1 });            // count: 3

await search(db, { term: "instant search react" });                 // count: 3 (any word)
await search(db, { term: "instant search react", threshold: 0 });   // count: 1 (all words)
```

Values between 0 and 1 keep a share of the partial matches; here `threshold: 0.5` returns 2.

## Guidelines

1. **Define schema upfront** — Orama builds its indexes from the schema; properties missing from it are stored but cannot be searched or filtered
2. **Use enums for filters** — Fields you filter by exact match should be `enum` or `enum[]`; they are not full-text searchable, so keep searchable text in `string` fields
3. **Limit search properties** — Specify which fields to search in; searching all fields is slower and less relevant
4. **Pre-build indexes** — For static content (docs, blog), build the index at build time and ship it as a file
5. **Stemming is off by default** — "searching" does not match "search" unless you pass `components: { tokenizer: { stemming: true } }` to `create`; prefix matching ("sear") works out of the box
6. **Embeddings plugin caveat** — `@orama/plugin-embeddings` (TensorFlow.js, `vector[512]`) is documented to embed at insert and search time, but with 3.1.18 its search hook is not awaited and vector search throws `Cannot read properties of undefined (reading 'property')` (open issue #925); pass vectors explicitly as shown above
7. **Keep API keys out of the browser** — If embeddings come from a paid API, call it from your server and send only the vector to the client
8. **Memory is the limit** — The whole index sits in RAM and a browser must download it; for millions of documents, frequent writes from several processes, or durable storage, use a search server such as Meilisearch, Typesense or Elasticsearch
9. **Plugins are not saved** — A restored database has no plugins or custom components; pass them again when you rebuild the instance
