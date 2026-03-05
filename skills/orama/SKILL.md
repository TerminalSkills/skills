---
name: orama
description: Expert guidance for Orama, the fast full-text and vector search engine that runs everywhere — browser, server, and edge. Helps developers implement search with typo tolerance, facets, filters, and hybrid (keyword + vector) search without external infrastructure.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - search
  - full-text
  - vector-search
  - browser
  - edge
---

# Orama — Full-Text & Vector Search Engine


## Overview


Orama, the fast full-text and vector search engine that runs everywhere — browser, server, and edge. Helps developers implement search with typo tolerance, facets, filters, and hybrid (keyword + vector) search without external infrastructure.


## Instructions

### Basic Full-Text Search

Set up a search index and query it:

```typescript
// src/search/index.ts — Create and populate a search index
import { create, insert, search, count } from "@orama/orama";

// Define the schema — Orama infers types and builds indexes automatically
const db = await create({
  schema: {
    title: "string",
    content: "string",
    category: "enum",              // Filterable enum values
    tags: "string[]",              // Array of strings (searchable)
    publishedAt: "number",         // Unix timestamp for range filters
    author: "string",
    views: "number",
  },
});

// Insert documents
await insert(db, {
  title: "Getting Started with Orama Search",
  content: "Orama is a blazing-fast full-text search engine that works in the browser, on the server, and at the edge. No external dependencies required.",
  category: "tutorial",
  tags: ["search", "javascript", "performance"],
  publishedAt: Date.now(),
  author: "Alex Chen",
  views: 1250,
});

await insert(db, {
  title: "Building Real-Time Search with React",
  content: "Learn how to implement instant search in your React application using Orama. Sub-millisecond results with typo tolerance.",
  category: "tutorial",
  tags: ["react", "search", "ui"],
  publishedAt: Date.now(),
  author: "Marta Lopez",
  views: 890,
});

// Search with typo tolerance (default: enabled)
const results = await search(db, {
  term: "serch engne",            // Typos handled automatically
  properties: ["title", "content"], // Which fields to search
  limit: 10,
  offset: 0,
});

console.log(`Found ${results.count} results in ${results.elapsed.formatted}`);
// "Found 2 results in 0.12ms"

for (const hit of results.hits) {
  console.log(`${hit.score.toFixed(2)} | ${hit.document.title}`);
}
```

### Filters and Facets

Combine full-text search with structured filtering:

```typescript
// src/search/filtered.ts — Search with filters, facets, and sorting
import { search } from "@orama/orama";

// Search with filters
const filtered = await search(db, {
  term: "search",
  where: {
    category: { eq: "tutorial" },          // Exact match on enum
    publishedAt: { gt: Date.now() - 30 * 24 * 60 * 60 * 1000 }, // Last 30 days
    views: { gte: 100, lte: 10000 },      // Range filter
    tags: { containsAll: ["react"] },      // Array contains all
  },
  sortBy: {
    property: "views",
    order: "DESC",                         // Sort by most popular
  },
  limit: 20,
});

// Faceted search — get aggregated counts for filters
const faceted = await search(db, {
  term: "javascript",
  facets: {
    category: {
      limit: 10,                           // Top 10 categories
    },
    tags: {
      limit: 20,
    },
    views: {
      ranges: [
        { from: 0, to: 100 },             // 0-100 views
        { from: 100, to: 1000 },           // 100-1000 views
        { from: 1000, to: Infinity },      // 1000+ views
      ],
    },
  },
});

// Facet results for building filter UIs
console.log(faceted.facets);
// {
//   category: { count: 2, values: { tutorial: 2, guide: 1 } },
//   tags: { count: 5, values: { javascript: 3, react: 2, search: 2 } },
//   views: { count: 3, values: { "0-100": 1, "100-1000": 2, "1000+": 1 } },
// }
```

### Hybrid Search (Keyword + Vector)

Combine traditional text search with semantic vector search:

```typescript
// src/search/hybrid.ts — Hybrid search combining BM25 and vector similarity
import { create, insert, search } from "@orama/orama";
import { pluginEmbeddings } from "@orama/plugin-embeddings";
import { OramaCloud } from "@orama/plugin-embeddings/dist/models";

// Create index with vector support
const db = await create({
  schema: {
    title: "string",
    content: "string",
    category: "enum",
    embedding: "vector[384]",     // 384-dimensional vector field
  },
  plugins: [
    pluginEmbeddings({
      embeddings: {
        model: OramaCloud,        // Built-in embedding model (no API key needed)
        // Or use OpenAI: { model: "openai", apiKey: process.env.OPENAI_API_KEY }
        documentProperties: ["title", "content"],  // Which fields to embed
        defaultProperty: "embedding",               // Store embeddings here
      },
    }),
  ],
});

// Insert — embeddings are generated automatically from title + content
await insert(db, {
  title: "Kubernetes Pod Scheduling",
  content: "Understanding how the Kubernetes scheduler assigns pods to nodes based on resource requests, affinity rules, and taints.",
  category: "devops",
});

// Hybrid search — combines keyword relevance (BM25) with semantic similarity
const results = await search(db, {
  term: "how to deploy containers",     // Keyword search
  mode: "hybrid",                        // "fulltext" | "vector" | "hybrid"
  similarity: 0.8,                       // Minimum vector similarity threshold
  limit: 10,
});

// Pure vector search (semantic only, no keyword matching)
const semantic = await search(db, {
  term: "container orchestration best practices",
  mode: "vector",
  similarity: 0.75,
});
```

### React Integration

Build a search UI with React hooks:

```tsx
// src/components/SearchBox.tsx — Instant search with React
import { useSearch } from "@orama/react-components";
import { useState, useMemo } from "react";

export function SearchBox({ db }: { db: any }) {
  const [query, setQuery] = useState("");

  // useSearch automatically debounces and handles loading state
  const { results, loading } = useSearch(db, {
    term: query,
    limit: 10,
    properties: ["title", "content"],
    facets: { category: { limit: 5 } },
  });

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search articles..."
      />

      {loading && <div className="spinner" />}

      {results?.hits.map((hit) => (
        <article key={hit.id}>
          <h3>{hit.document.title}</h3>
          <p>{hit.document.content.slice(0, 150)}...</p>
          <span>Score: {hit.score.toFixed(2)}</span>
        </article>
      ))}

      {/* Facet filters */}
      {results?.facets?.category && (
        <div className="filters">
          {Object.entries(results.facets.category.values).map(([cat, count]) => (
            <button key={cat}>{cat} ({count})</button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Persistence and Serialization

Save and restore indexes:

```typescript
// src/search/persistence.ts — Persist search index to disk or storage
import { create, save, load } from "@orama/orama";
import { persistToFile, restoreFromFile } from "@orama/plugin-data-persistence";
import fs from "fs";

// Save index to a file (server-side)
const serialized = await save(db);
fs.writeFileSync("search-index.json", JSON.stringify(serialized));

// Restore index from file
const data = JSON.parse(fs.readFileSync("search-index.json", "utf-8"));
const restored = await load(data);

// Binary format — smaller and faster to load
const binary = await persistToFile(db, "binary", "search-index.msp");
const fromBinary = await restoreFromFile("binary", "search-index.msp");
```

## Installation

```bash
# Core library
npm install @orama/orama

# Plugins (optional)
npm install @orama/plugin-embeddings       # Vector/hybrid search
npm install @orama/plugin-data-persistence # Save/load indexes
npm install @orama/react-components        # React hooks
```


## Examples


### Example 1: Integrating Orama into an existing application

**User request:**

```
Add Orama to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Orama client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing filters and facets performance

**User request:**

```
My Orama calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Orama's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **Define schema upfront** — Orama builds optimized indexes based on your schema; don't use generic `string` for everything
2. **Use enums for filters** — Fields you filter by exact match should be `enum`, not `string` — much faster
3. **Limit search properties** — Specify which fields to search in; searching all fields is slower and less relevant
4. **Pre-build indexes** — For static content (docs, blog), build the index at build time and ship it as a JSON file
5. **Hybrid for best results** — Pure keyword search misses synonyms; pure vector misses exact terms; hybrid combines both
6. **Serialize for SSR** — Build the index server-side, serialize it, and hydrate on the client for instant search
7. **Use facets for filter UIs** — Let Orama compute filter counts instead of running separate queries
8. **Binary persistence for large indexes** — JSON serialization is fine for <10K docs; use binary format for larger datasets
