---
name: lancedb
description: >-
  LanceDB is an embedded, serverless vector database that stores data in the Lance columnar format on local disk or object storage, with Node.js, Python and Rust clients. Use when someone asks for "vector search without a server", "embedded vector database", "LanceDB", "local vector search", "vector search in a file", or "lightweight RAG storage". Covers tables, vector search, filters, full-text search, hybrid search, indexes and embedding functions.
license: Apache-2.0
compatibility: "Node.js 22+ (@lancedb/lancedb) or Python 3.9+ (lancedb). Runs embedded on disk or on S3-compatible storage; LanceDB Cloud is optional."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/lancedb/lancedb
  tags: ["vector", "embedded-db", "lancedb", "rag", "search"]
---

# LanceDB

## Overview

LanceDB is an embedded vector database: it runs inside your process with no server, container or connection string. Tables live in the Lance format (columnar, versioned, built for ML data) in a local directory or on object storage such as S3. It supports vector search, SQL-like filters, full-text search (BM25), hybrid search with reranking, and multimodal data. This skill was checked against `@lancedb/lancedb` 0.39.0 (Node) and `lancedb` 0.39.0 (Python).

## When to Use

- RAG prototypes and local development with no infrastructure
- Desktop apps, CLIs and edge devices that need semantic search
- Projects too small for a hosted vector database but past "an array in memory"
- Multimodal search (text and images in one table)

## Instructions

### Step 1: Install

```bash
npm install @lancedb/lancedb apache-arrow     # apache-arrow is a peer dependency (>=15, <=18.1)
# Python
python3 -m venv .venv && source .venv/bin/activate
pip install lancedb
```

The Node client needs Node.js 22 or newer and ships a native binary.

### Step 2: Create a table and run a vector search

```typescript
// search.ts
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./notes-db");        // creates the directory if needed

// Vectors must all have the same length (here 4; real embeddings are 384-3072)
const table = await db.createTable("documents", [
  { id: 1, text: "The cat sat on the mat",     category: "docs", vector: [0.1, 0.2, 0.3, 0.4] },
  { id: 2, text: "Dogs are loyal companions",  category: "docs", vector: [0.4, 0.5, 0.6, 0.7] },
  { id: 3, text: "Fish swim in the ocean",     category: "blog", vector: [0.7, 0.8, 0.9, 1.0] },
], { mode: "overwrite" });                              // "overwrite" replaces an existing table

const results = await table
  .vectorSearch([0.1, 0.2, 0.3, 0.4])
  .limit(2)
  .toArray();
// [{ id: 1, text: "The cat sat on the mat", ..., _distance: 0 }, { id: 2, ..., _distance: 0.36 }]
```

Results carry `_distance` (lower is closer; the default metric is L2, set another with `.distanceType("cosine")` on the query). `db.openTable("documents")` reopens a table, `db.tableNames()` lists them, `table.countRows()` counts.

Python equivalent:

```python
import lancedb
db = lancedb.connect("./notes-db")
table = db.create_table("documents", data=[
    {"id": 1, "text": "The cat sat on the mat", "category": "docs", "vector": [0.1, 0.2, 0.3, 0.4]},
    {"id": 2, "text": "Dogs are loyal companions", "category": "blog", "vector": [0.4, 0.5, 0.6, 0.7]},
], mode="overwrite")
hits = table.search([0.1, 0.2, 0.3, 0.4]).where("category = 'docs'").limit(5).to_list()
```

### Step 3: Filters

```typescript
const hits = await table
  .vectorSearch([0.1, 0.2, 0.3, 0.4])
  .where("category = 'docs' AND id > 1")      // SQL-like expression
  .select(["id", "text"])                     // columns to return (_distance is still included)
  .limit(10)
  .toArray();
```

### Step 4: Full-text search and hybrid search

```typescript
await table.createIndex("text", { config: lancedb.Index.fts() });   // BM25 index on a string column

// Keyword search
const keyword = await table.search("loyal", "fts").limit(5).toArray();

// Hybrid: run both queries and fuse the rankings (reciprocal rank fusion by default)
const hybrid = await table
  .query()
  .fullTextSearch("loyal")
  .nearestTo([0.4, 0.5, 0.6, 0.7])
  .limit(5)
  .toArray();                                  // rows include _relevance_score
```

`table.search("text", { queryType: "hybrid" })` is not valid: the query type is the second positional argument (`"fts"`, `"vector"`, `"hybrid"`, `"auto"`), and a plain text query for vector or hybrid mode only works when the table has an embedding function registered. Python: `table.create_index("text", config=FTS())` (the older `create_fts_index` is deprecated) and `table.search("loyal", query_type="fts")`.

### Step 5: Automatic embeddings

Register an embedding function and describe it in the table schema, so inserts and text queries are embedded for you:

```typescript
// auto-embed.ts  (needs OPENAI_API_KEY in the environment; keep it out of the code)
import * as lancedb from "@lancedb/lancedb";
import { Int32, Utf8 } from "apache-arrow";

const { getRegistry, LanceSchema } = lancedb.embedding;
const openai = getRegistry().get("openai")!.create({ model: "text-embedding-3-small" });

const schema = LanceSchema({
  id: new Int32(),
  text: openai.sourceField(new Utf8()),      // embedded on insert
  vector: openai.vectorField(),              // 1536 dimensions, filled automatically
});

const db = await lancedb.connect("./docs-db");
const table = await db.createTable("docs", [
  { id: 1, text: "How to set up authentication" },
  { id: 2, text: "Database migration guide" },
  { id: 3, text: "Deploying to production" },
], { schema });

const answer = await table.search("how do I deploy my app?").limit(3).toArray();
```

The registry reads `OPENAI_API_KEY` itself; passing `apiKey` directly in the options is rejected, use `getRegistry().setVar("openai_key", process.env.OPENAI_API_KEY!)` and `apiKey: "$var:openai_key"` if you must. Other registered providers include a local `huggingface`/transformers function; use one when data must not leave the machine.

### Step 6: Indexes, storage and versions

```typescript
// ANN index: only worthwhile (and only trainable) with enough rows; PQ training needs at least 256
await table.createIndex("vector", { config: lancedb.Index.ivfPq({ distanceType: "cosine" }) });

const s3db = await lancedb.connect("s3://acme-search-prod/lancedb");   // credentials from the AWS environment
console.log(await table.version());       // every write creates a new version
```

Without an ANN index LanceDB scans all vectors (exact search), which is fine up to roughly 100K rows. Lance data is versioned, so older versions can be checked out for time travel.

## Examples

### Example 1: "Build a chatbot that answers questions about my local documents, no external services"

Create the table with a local embedding function (a transformers/Hugging Face function from the registry), embed document chunks of 300-500 tokens on insert, retrieve with `table.search(question).limit(4)`, then pass the chunk texts to a local model such as Ollama as context. Result: `./docs-db/` holds the index and the chatbot answers from retrieved chunks; delete the directory to reset.

### Example 2: "Add semantic search to my note-taking CLI"

```typescript
const db = await lancedb.connect(`${process.env.HOME}/.local/share/notes-cli/db`);
const table = await db.openTable("notes");
const hits = await table.search("ideas about pricing").limit(5).select(["id", "title"]).toArray();
```

Result: the five closest notes by meaning, each with `id`, `title` and `_distance`; add each new note with `table.add([{ ... }])` so it is embedded on save.

## Guidelines

- Every vector in a column must have the same dimension, and the query vector must match it; mixing embedding models in one table breaks search.
- `createTable` fails if the table exists unless you pass `mode: "overwrite"`; use `table.add(rows)` to append and `table.delete("id = 3")` to remove.
- Prefer one process writing at a time on local disk; for many writers or services use object storage with LanceDB Cloud or Enterprise.
- Do not copy older examples: `lancedb.schema(...)`, `lancedb.field(...)` and `import ... from "@lancedb/lancedb/embeddings"` no longer exist; use `lancedb.embedding`.
- Warnings about `_distance` auto-projection when using `.select()` are harmless today; include `"_distance"` in `select` to be explicit.
- Not a good fit for multi-tenant, high-write, always-on network services where a server database such as Qdrant or pgvector is simpler to operate.
