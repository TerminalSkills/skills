---
name: weaviate
description: |
  Weaviate is an open-source vector database with built-in vectorization modules.
  Learn schema definition, GraphQL and REST APIs, hybrid search combining BM25 and vectors,
  and self-hosted deployment with Docker.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: databases
  tags:
    - weaviate
    - vector-database
    - graphql
    - hybrid-search
    - docker
---

# Weaviate

Weaviate is an open-source vector database that can vectorize data at import time using built-in modules (OpenAI, Cohere, HuggingFace) or accept pre-computed vectors. It supports hybrid search combining vector similarity with BM25 keyword search.

## Installation

```yaml
# docker-compose.yml: Weaviate with OpenAI vectorizer module
services:
  weaviate:
    image: cr.weaviate.io/semitechnologies/weaviate:1.28.0
    ports:
      - "8080:8080"
      - "50051:50051"
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: "true"
      PERSISTENCE_DATA_PATH: /var/lib/weaviate
      DEFAULT_VECTORIZER_MODULE: text2vec-openai
      ENABLE_MODULES: text2vec-openai,generative-openai
      OPENAI_APIKEY: ${OPENAI_API_KEY}
      CLUSTER_HOSTNAME: node1
    volumes:
      - weaviate-data:/var/lib/weaviate

volumes:
  weaviate-data:
```

```bash
# Start Weaviate
docker compose up -d

# Install clients
npm install weaviate-client
pip install weaviate-client
```

## Define Schema

```javascript
// schema.js: Create a collection (class) with properties
const weaviate = require('weaviate-client');

const client = await weaviate.connectToLocal();

await client.collections.create({
  name: 'Article',
  vectorizers: weaviate.configure.vectorizer.text2VecOpenAI(),
  generative: weaviate.configure.generative.openAI(),
  properties: [
    { name: 'title', dataType: 'text' },
    { name: 'content', dataType: 'text' },
    { name: 'category', dataType: 'text', tokenization: 'field' },
    { name: 'url', dataType: 'text', skipVectorization: true },
    { name: 'published', dataType: 'date' },
  ],
});
```

## Import Data

```javascript
// import.js: Batch import objects into Weaviate
const articles = client.collections.get('Article');

const items = [
  { title: 'Intro to Vector DBs', content: 'Vector databases store...', category: 'tech', url: 'https://example.com/1' },
  { title: 'Hybrid Search Explained', content: 'Combining keyword and...', category: 'tech', url: 'https://example.com/2' },
];

// Batch import
const response = await articles.data.insertMany(items);
console.log(`Imported ${response.allResponses.length} objects`);
```

## Vector Search

```javascript
// search.js: Semantic similarity search
const articles = client.collections.get('Article');

// nearText — uses the vectorizer to convert query to vector
const results = await articles.query.nearText('how do vector databases work', {
  limit: 5,
  returnMetadata: ['distance'],
});

results.objects.forEach(obj => {
  console.log(obj.properties.title, obj.metadata.distance);
});
```

## Hybrid Search

```javascript
// hybrid.js: Combine BM25 keyword search with vector search
const results = await articles.query.hybrid('vector database performance', {
  limit: 10,
  alpha: 0.5, // 0 = pure BM25, 1 = pure vector
  returnMetadata: ['score'],
  filters: articles.filter.byProperty('category').equal('tech'),
});

results.objects.forEach(obj => {
  console.log(obj.properties.title, obj.metadata.score);
});
```

## Generative Search (RAG)

```javascript
// rag.js: Use generative module for RAG directly in Weaviate
const results = await articles.generate.nearText('vector databases', {
  singlePrompt: 'Summarize this article in one sentence: {content}',
  groupedTask: 'Compare these articles and list key differences.',
  limit: 3,
});

// Per-object generation
results.objects.forEach(obj => {
  console.log(obj.generated); // Single prompt result
});

// Grouped generation across all results
console.log(results.generatedText);
```

## Python Client

```python
# app.py: Weaviate with Python v4 client
import weaviate
import weaviate.classes.query as wq

client = weaviate.connect_to_local()
articles = client.collections.get("Article")

# Hybrid search
response = articles.query.hybrid(
    query="machine learning",
    alpha=0.7,
    limit=5,
    return_metadata=wq.MetadataQuery(score=True),
)

for obj in response.objects:
    print(obj.properties["title"], obj.metadata.score)

# Filtered search
from weaviate.classes.query import Filter

response = articles.query.near_text(
    query="databases",
    filters=Filter.by_property("category").equal("tech"),
    limit=5,
)

client.close()
```

## Backup and Restore

```bash
# backup.sh: Create and restore Weaviate backups via REST API
# Create backup
curl -X POST http://localhost:8080/v1/backups/filesystem \
  -H 'Content-Type: application/json' \
  -d '{"id": "backup-20260219", "include": ["Article"]}'

# Check status
curl http://localhost:8080/v1/backups/filesystem/backup-20260219

# Restore
curl -X POST http://localhost:8080/v1/backups/filesystem/backup-20260219/restore
```
