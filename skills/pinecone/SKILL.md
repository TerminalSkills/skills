---
name: pinecone
description: |
  Pinecone is a managed vector database for AI applications. Use it to create serverless
  indexes, upsert embeddings or text records, query by similarity, split data into namespaces,
  filter on metadata, and build semantic search and RAG pipelines with the Node.js or Python SDK.
license: Apache-2.0
compatibility: 'Pinecone account and API key; Node.js 22+ (@pinecone-database/pinecone 9) or Python 3.10+ (pinecone 10)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "pinecone, vector-database, embeddings, ai, semantic-search"
---

# Pinecone

## Overview

Pinecone is a fully managed vector database for similarity search, recommendations and RAG (retrieval-augmented generation). Two ways to use an index:

- **Bring your own vectors**: create an index with a fixed `dimension`, compute embeddings yourself, `upsert` vectors, `query` by vector.
- **Integrated embedding**: create the index for a hosted embedding model (`createIndexForModel`), upsert text records and search with text (`upsertRecords`, `searchRecords`). No separate embedding step.

Create an API key in the Pinecone console and export it as `PINECONE_API_KEY`. Never hard-code it.

## Instructions

### Install

```bash
npm install @pinecone-database/pinecone     # Node.js 22 or newer
pip install pinecone                         # Python 3.10 or newer
```

The Python package used to be called `pinecone-client`; that name is deprecated and stops at version 6.0.0. Install `pinecone`.

### Create an index (own vectors)

```typescript
import { Pinecone } from '@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })

await pc.createIndex({
  name: 'knowledge-base',
  dimension: 1536,              // must equal your embedding model's output size
  metric: 'cosine',
  spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
  deletionProtection: 'disabled',
  waitUntilReady: true,
  suppressConflicts: true,      // no error if the index already exists
})
```

### Upsert and query

In the Node.js SDK every call takes an options object, and records go in `records`. A namespace is selected with `index.namespace(name)`.

```typescript
const index = pc.index('knowledge-base')
const articles = index.namespace('articles')

await articles.upsert({
  records: [
    { id: 'article-1', values: embedding1, metadata: { title: 'Introduction to Vector Databases', category: 'technology', year: 2026 } },
    { id: 'article-2', values: embedding2, metadata: { title: 'Building RAG Applications', category: 'ai', year: 2026 } },
  ],
})

const results = await articles.query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true,
  filter: { category: { $eq: 'technology' }, year: { $gte: 2026 } },
})
for (const match of results.matches) console.log(match.id, match.score, match.metadata?.title)
```

Metadata filters support `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$and`, `$or`. Range operators (`$gt`, `$gte`, `$lt`, `$lte`) work on numbers, so store dates as epoch numbers or years. Upsert in batches of up to 1,000 records, keeping each request under 2 MB.

### Integrated embedding (text in, text out)

```typescript
await pc.createIndexForModel({
  name: 'docs-search',
  cloud: 'aws',
  region: 'us-east-1',
  embed: { model: 'llama-text-embed-v2', fieldMap: { text: 'chunk_text' } },
  waitUntilReady: true,
})

const docs = pc.index('docs-search').namespace('handbook')
await docs.upsertRecords({
  records: [{ id: 'vacation-1', chunk_text: 'Employees get 25 vacation days per year.', team: 'hr' }],
})
const hits = await docs.searchRecords({
  query: { topK: 3, inputs: { text: 'How many vacation days do I get?' } },
  fields: ['chunk_text', 'team'],
})
console.log(hits.result.hits.map(h => [h._id, h._score, h.fields]))
```

`fieldMap.text` names the record field that gets embedded. Records are flat: extra fields become metadata. Upsert text records in batches of at most 96 (the 1,000 limit applies only to records with vectors). Pinecone's docs now call this the legacy integrated-index flow; it is still supported by the SDKs shown here.

### Python

```python
import os
from pinecone import Pinecone

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index("knowledge-base")          # resolves the host; pc.index(name=...) is equivalent

index.upsert(
    vectors=[{"id": "doc-1", "values": embedding, "metadata": {"title": "Hello", "category": "technology"}}],
    namespace="articles",
)
results = index.query(
    namespace="articles", vector=query_embedding, top_k=5,
    include_metadata=True, filter={"category": {"$eq": "technology"}},
)
for match in results["matches"]:
    print(match["id"], match["score"], match["metadata"]["title"])

index.delete(ids=["doc-1"], namespace="articles")
index.delete(delete_all=True, namespace="old-data")
```

In the current Python SDK, methods take keyword arguments only (`index.query(top_k=5, ...)`). Integrated-embedding indexes use `pc.create_index_for_model(...)`, `index.upsert_records(namespace=..., records=[...])` and `index.search(namespace=..., query={"top_k": 3, "inputs": {"text": "..."}})`.

### Manage indexes and data

```typescript
console.log(await pc.listIndexes())
console.log(await index.describeIndexStats())          // dimension, totalRecordCount, per-namespace counts
await index.namespace('old-data').deleteAll()          // remove one namespace
await articles.deleteMany({ filter: { category: { $eq: 'ai' } } })
await pc.deleteIndex('knowledge-base')                 // irreversible; fails while deletionProtection is 'enabled'
```

## Examples

### Example 1: Semantic search over support articles

**User request:** "Make our help-center articles searchable by meaning"

Create `docs-search` with `createIndexForModel` as above, chunk each article into passages of a few hundred words, upsert them with `upsertRecords` (`id`, `chunk_text`, `url`, `product`), then call `searchRecords` with the user's question and `query: { topK: 3, inputs: { text: question }, filter: { product: { $eq: 'billing' } } }` (the filter goes inside `query`) to restrict to one product. The response lists hits with `_score` and the requested `fields`; show the `url` of the top three.

### Example 2: RAG answer with your own embeddings

**User request:** "Answer questions from our knowledge base using an LLM"

```typescript
import OpenAI from 'openai'

const openai = new OpenAI()                         // reads OPENAI_API_KEY
const articles = pc.index('knowledge-base').namespace('articles')

async function ask(question: string) {
  const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: question })
  const found = await articles.query({ vector: emb.data[0].embedding, topK: 5, includeMetadata: true })
  const context = found.matches.map(m => m.metadata?.content).join('\n\n')
  const chat = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL!,                 // a chat model your account can use
    messages: [
      { role: 'system', content: `Answer only from this context:\n\n${context}` },
      { role: 'user', content: question },
    ],
  })
  return chat.choices[0].message.content
}
```

`text-embedding-3-small` returns 1536 dimensions, so the index must be created with `dimension: 1536`. Store the passage text in metadata (`content`) at upsert time, or keep it in your own database keyed by `id`.

## Guidelines

- The index `dimension` and `metric` are fixed at creation. Changing embedding model means a new index and a full re-embed.
- Query and upsert with the same embedding model; mixing models gives meaningless scores.
- Use namespaces to separate tenants or datasets; queries never cross namespaces. Always pass the namespace on both write and read.
- Writes are eventually consistent: a fresh upsert may take a moment to show up in queries.
- Keep metadata small and filterable (ids, categories, numbers); put large text in your own store.
- Enable `deletionProtection: 'enabled'` on production indexes. Deleting an index or `deleteAll` cannot be undone.
- Keep `PINECONE_API_KEY` in the environment or a secret manager, and use a separate key and project for development.
