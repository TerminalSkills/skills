---
name: pglite
description: >-
  PGlite is Postgres compiled to WebAssembly: a real Postgres 18 database that
  runs inside the browser, Node.js, Bun or Deno with no server, in-memory or
  persisted to IndexedDB or a folder. Use when someone asks to "run Postgres in
  the browser", "embed Postgres in an app", "use PGlite", "local-first
  database", "Postgres for tests without Docker", or "vector search in the
  browser". Covers install, persistence, pgvector, live queries, workers, and
  upgrades between versions.
license: Apache-2.0
compatibility: "Node.js (tested on 24), Bun, Deno or a modern browser. npm package @electric-sql/pglite (0.5.x, Postgres 18)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "postgres, wasm, browser, embedded, local-first"
  repository: https://github.com/electric-sql/pglite
---

# PGlite — Postgres in the Browser

## Overview

PGlite (by ElectricSQL) is a WebAssembly build of Postgres packaged as a TypeScript library. It runs as a single connection inside your process: real Postgres SQL (JSONB, CTEs, window functions, full-text search, triggers) with no daemon and no Docker. As of 0.5.x it is PostgreSQL 18; `select version()` reports it.

Where it fits: local-first and offline apps, Electron, tests and CI that need real Postgres semantics, prototypes, in-browser RAG with pgvector. It is not a server replacement: one connection, one process (use the multi-tab worker or `@electric-sql/pglite-socket` to share it).

**0.5 changes that break older snippets:** most extensions moved to their own packages. pgvector is now `@electric-sql/pglite-pgvector` (`import { vector } from "@electric-sql/pglite-pgvector"`), not `@electric-sql/pglite/vector`; PostGIS, AGE, pgtap, pgmq and others are `@electric-sql/pglite-postgis`, `-age` and so on. `live` and the Postgres contrib extensions (`@electric-sql/pglite/contrib/<name>`, e.g. `pg_trgm`, `hstore`, `citext`) stay in the main package. Extension packages pin the exact PGlite version they were built for, so keep versions in step.

## Instructions

### Install and open a database

```bash
npm install @electric-sql/pglite
```

```typescript
import { PGlite } from "@electric-sql/pglite";

const memory = new PGlite();                          // in-memory, lost on exit
const browser = new PGlite("idb://notes-app");        // IndexedDB (recommended in browsers)
const server = await PGlite.create("./pgdata");        // folder on disk in Node/Bun (parent folder must exist)
await server.waitReady;
```

`PGlite.create(...)` resolves when the database is ready; with `new PGlite(...)` await `db.waitReady` or just start querying. OPFS-backed storage (`@electric-sql/pglite/opfs-ahp`) exists but Safari does not support it, so the docs recommend IndexedDB in browsers. Call `await db.close()` before exiting a Node process.

### Query

```typescript
await db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS notes_fts ON notes
    USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));
`);                                                   // exec: many statements, no parameters

const { rows } = await db.query(                      // query: one statement, $1 parameters
  "SELECT id, title FROM notes WHERE meta->>'tag' = $1 ORDER BY created_at DESC",
  ["tutorial"],
);

await db.transaction(async (tx) => {
  await tx.query("INSERT INTO notes (title) VALUES ($1)", ["Draft"]);
});
```

Pass a type to get typed rows: `db.query<{ id: number; title: string }>(...)`. Pass JSON as an object or `JSON.stringify(...)` for JSONB parameters.

### pgvector

```bash
npm install @electric-sql/pglite-pgvector
```

```typescript
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const db = await PGlite.create({ extensions: { vector } });
await db.exec(`
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE IF NOT EXISTS chunks (id SERIAL PRIMARY KEY, text TEXT, embedding vector(384));
  CREATE INDEX IF NOT EXISTS chunks_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
`);
await db.query("INSERT INTO chunks (text, embedding) VALUES ($1, $2)", ["hello", JSON.stringify(vec)]);
const hits = await db.query(
  "SELECT text, 1 - (embedding <=> $1::vector) AS similarity FROM chunks ORDER BY embedding <=> $1::vector LIMIT 5",
  [JSON.stringify(queryVec)],
);
```

The `CREATE EXTENSION` statement is required even after passing the extension object. Vectors are passed as `'[0.1,0.2,...]'` text.

### Live queries

```typescript
import { live } from "@electric-sql/pglite/live";
const db = await PGlite.create({ extensions: { live } });

const sub = await db.live.query("SELECT * FROM notes ORDER BY id DESC", [], (res) => {
  console.log(res.rows);                              // called now and after every change
});
await sub.unsubscribe();                              // always release it
```

Use `db.live.incrementalQuery` for large or wide result sets (diffed inside Postgres) and `db.live.changes` for raw insert/update/delete events. React: `npm install @electric-sql/pglite-react`, wrap the app in `<PGliteProvider db={db}>`, and call `useLiveQuery("SELECT ...", [params])`; it returns `undefined` until the first result arrives, then `{ rows, fields }`.

### Worker, tools, upgrades

- **Do not block the UI thread / share across tabs:** `PGliteWorker` from `@electric-sql/pglite/worker` with a worker file that calls `worker({ async init() { return new PGlite("idb://notes-app") } })`; one tab is elected leader.
- **ORMs:** `drizzle-orm/pglite` (`drizzle(client)`) works directly; Prisma uses PGlite behind `npx prisma dev`.
- **Backups:** `await db.dumpDataDir("gzip")` returns a file you can restore with `new PGlite({ loadDataDir: file })`.
- **Minor version upgrades can change the on-disk format** (0.4 to 0.5 moved Postgres 17 to 18). The upgrade path in the docs is to install the new version under an alias (`npm install pglite-05@npm:@electric-sql/pglite@0.5.x`), run `pgDump` from `@electric-sql/pglite-tools` on the old database and execute the SQL dump in a fresh instance of the new version. Do not point a new minor version at an old data directory.

## Examples

### Example 1: Postgres for unit tests

**User prompt:** "My tests need real Postgres but I don't want Docker in CI. Use PGlite with Drizzle."

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

export async function makeTestDb() {
  const client = new PGlite();                        // fresh in-memory db per test file
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client };
}
```

Each test file gets an isolated database that starts in well under a second. Call `await client.close()` in `afterAll`. Features that need a real server (multiple connections, `LISTEN` across clients, some extensions) are not available.

### Example 2: Offline notes app with search in the browser

**User prompt:** "Store notes in the browser with full-text search that survives reloads."

Open `new PGlite("idb://notes-app")`, run the `CREATE TABLE` and GIN index from the Query section on startup (idempotent), then search with `WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ plainto_tsquery('english', $1)`. Wrap it in `PGliteWorker` so typing never blocks, and render the list with `useLiveQuery`. After reloading the page the notes are still there; clearing site data in the browser deletes them.

## Guidelines

- **Single connection.** Queries run one at a time; use `PGliteWorker` for several tabs and `@electric-sql/pglite-socket` to let `psql` or `pg` clients connect during development.
- **Browser storage is not durable.** IndexedDB can be evicted; sync to a server (`@electric-sql/pglite-sync` with Electric) or export dumps for data that matters.
- **Pin versions.** The main package and extension packages must match exactly, and minor releases may need a dump and restore.
- **Download size.** The WASM binary is about 10 MB uncompressed (a few MB over the wire); lazy-load PGlite rather than shipping it on every page.
- **Unsubscribe live queries** and close the database when done, or memory and prepared statements accumulate.
- **Not for production multi-user servers.** Use a real Postgres there; PGlite is for embedded, local and test use.
