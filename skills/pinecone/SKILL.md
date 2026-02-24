---
name: pinecone
description: |
  Pinecone is a managed vector database for AI and machine learning applications.
  Learn to create indexes, upsert embeddings, query by similarity, use namespaces
  and metadata filtering for semantic search and RAG pipelines.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - pinecone
    - vector-database
    - embeddings
    - ai
    - semantic-search
---

# Pinecone

Pinecone is a fully managed vector database that makes it easy to store, index, and query high-dimensional vectors for similarity search, recommendation systems, and RAG (Retrieval-Augmented Generation).

## Installation

```bash
# Node.js client
npm install @pinecone-database/pinecone

# Python client
pip install pinecone-client
```

## Create an Index

```javascript
// create-index.js: Initialize Pinecone and create a serverless index
const { Pinecone } = require('@pinecone-database/pinecone');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

async function createIndex() {
  await pc.createIndex({
    name: 'knowledge-base',
    dimension: 1536, // OpenAI text-embedding-3-small
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  });
}

createIndex().catch(console.error);
```

## Upsert Vectors

```javascript
// upsert.js: Store embeddings with metadata in Pinecone
const index = pc.index('knowledge-base');

// Upsert vectors with metadata
await index.namespace('articles').upsert([
  {
    id: 'article-1',
    values: embedding1, // Float32Array of dimension 1536
    metadata: {
      title: 'Introduction to Vector Databases',
      source: 'blog',
      category: 'technology',
      published: '2026-01-15',
    },
  },
  {
    id: 'article-2',
    values: embedding2,
    metadata: {
      title: 'Building RAG Applications',
      source: 'docs',
      category: 'ai',
      published: '2026-02-01',
    },
  },
]);
```

## Query Vectors

```javascript
// query.js: Find similar vectors with metadata filtering
const index = pc.index('knowledge-base');

// Simple similarity search
const results = await index.namespace('articles').query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true,
  includeValues: false,
});

results.matches.forEach(match => {
  console.log(`${match.id}: ${match.score} — ${match.metadata.title}`);
});

// Query with metadata filter
const filtered = await index.namespace('articles').query({
  vector: queryEmbedding,
  topK: 10,
  filter: {
    category: { $eq: 'technology' },
    published: { $gte: '2026-01-01' },
  },
  includeMetadata: true,
});
```

## Python Client

```python
# app.py: Pinecone with Python client
from pinecone import Pinecone
import os

pc = Pinecone(api_key=os.environ['PINECONE_API_KEY'])
index = pc.Index('knowledge-base')

# Upsert
index.upsert(
    vectors=[
        {'id': 'doc-1', 'values': embedding, 'metadata': {'title': 'Hello'}},
    ],
    namespace='articles',
)

# Query
results = index.query(
    namespace='articles',
    vector=query_embedding,
    top_k=5,
    include_metadata=True,
    filter={'category': {'$eq': 'technology'}},
)

for match in results['matches']:
    print(f"{match['id']}: {match['score']:.3f} — {match['metadata']['title']}")

# List and delete
index.delete(ids=['doc-1'], namespace='articles')
index.delete(delete_all=True, namespace='old-data')
```

## RAG Pipeline Example

```javascript
// rag.js: Retrieval-Augmented Generation with Pinecone + OpenAI
const { OpenAI } = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');

const openai = new OpenAI();
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('knowledge-base');

async function askQuestion(question) {
  // 1. Generate embedding for the question
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  });
  const queryVector = embeddingRes.data[0].embedding;

  // 2. Find relevant documents
  const searchResults = await index.namespace('articles').query({
    vector: queryVector,
    topK: 5,
    includeMetadata: true,
  });

  const context = searchResults.matches
    .map(m => m.metadata.content)
    .join('\n\n');

  // 3. Generate answer with context
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `Answer based on this context:\n\n${context}` },
      { role: 'user', content: question },
    ],
  });

  return completion.choices[0].message.content;
}
```

## Index Management

```javascript
// manage.js: List, describe, and manage Pinecone indexes
// List all indexes
const indexes = await pc.listIndexes();
console.log(indexes);

// Describe index stats
const stats = await index.describeIndexStats();
console.log(stats); // { dimension, totalRecordCount, namespaces: {...} }

// Delete a namespace
await index.namespace('old-data').deleteAll();

// Delete the entire index
await pc.deleteIndex('knowledge-base');
```
