---
name: pglite
category: Backend Development
tags: [postgres, wasm, browser, embedded, local-first, database, lightweight]
version: 1.0.0
author: terminal-skills
---

# PGlite — Postgres in the Browser

You are an expert in PGlite, the lightweight WASM Postgres build that runs in the browser, Node.js, and Deno. You help developers embed a full Postgres instance (with extensions like pgvector, PostGIS) in client-side apps, Electron, React Native, and serverless functions — providing real SQL with JSONB, full-text search, and vector similarity search at ~3MB compressed, without a server.

## Core Capabilities

### Browser Usage

```typescript
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

// Create in-memory database
const db = new PGlite({
  extensions: { vector },
});

// Or persist to IndexedDB
const db = new PGlite({
  dataDir: "idb://my-app-db",
  extensions: { vector },
});

// Full Postgres SQL
await db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    embedding vector(384),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  CREATE INDEX ON documents USING GIN (metadata);
  CREATE INDEX ON documents USING GIN (to_tsvector('english', title || ' ' || content));
`);

// Insert
await db.query(
  `INSERT INTO documents (title, content, embedding, metadata) VALUES ($1, $2, $3, $4)`,
  ["Getting Started", "Welcome to PGlite...", embedding, JSON.stringify({ category: "tutorial" })],
);

// Full-text search
const results = await db.query(`
  SELECT title, ts_rank(to_tsvector('english', content), query) AS rank
  FROM documents, plainto_tsquery('english', $1) query
  WHERE to_tsvector('english', content) @@ query
  ORDER BY rank DESC LIMIT 10
`, ["postgres wasm"]);

// Vector similarity search
const similar = await db.query(`
  SELECT title, 1 - (embedding <=> $1::vector) AS similarity
  FROM documents
  ORDER BY embedding <=> $1::vector
  LIMIT 5
`, [queryEmbedding]);

// JSONB queries
const tutorials = await db.query(`
  SELECT * FROM documents WHERE metadata->>'category' = $1
`, ["tutorial"]);
```

### Live Queries (Reactive)

```typescript
import { live } from "@electric-sql/pglite/live";

const db = new PGlite({ extensions: { live } });

// Subscribe to query results — re-runs when data changes
const unsubscribe = await db.live.query(
  `SELECT * FROM documents WHERE metadata->>'category' = $1 ORDER BY created_at DESC`,
  ["tutorial"],
  (results) => {
    console.log("Documents updated:", results.rows);
    // Re-renders your UI automatically
  },
);

// React hook
import { useLiveQuery } from "@electric-sql/pglite-react";

function DocumentList({ category }: { category: string }) {
  const docs = useLiveQuery(
    `SELECT * FROM documents WHERE metadata->>'category' = $1`,
    [category],
  );
  return <ul>{docs?.rows.map(d => <li key={d.id}>{d.title}</li>)}</ul>;
}
```

## Installation

```bash
npm install @electric-sql/pglite
```

## Best Practices

1. **Full Postgres** — Not a subset; real Postgres with JSONB, CTEs, window functions, extensions
2. **IndexedDB persistence** — Use `idb://` prefix for data directory; survives page refreshes
3. **pgvector** — Vector search in the browser; run RAG locally without a server
4. **Live queries** — Subscribe to query results; automatic re-execution when underlying data changes
5. **3MB compressed** — Small enough for browser apps; loads in <1 second
6. **Drizzle/Prisma** — Use with Drizzle ORM for type-safe queries; PGlite driver available
7. **Testing** — Use PGlite in tests instead of Docker Postgres; instant setup, zero cleanup
8. **Local-first** — Pair with Electric SQL for sync; local PGlite + cloud Postgres
