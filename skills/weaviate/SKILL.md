---
name: weaviate
description: >-
  Weaviate is an open-source vector database that stores objects with embeddings and searches them by meaning, keyword (BM25) or both at once. Use this skill to run Weaviate with Docker, define collections with a vectorizer, import data in batches, run near-text, hybrid and filtered queries, do RAG with a generative module, and back up a local instance, using the v4 Python or v3 TypeScript client.
license: Apache-2.0
compatibility: 'Docker 24+; Weaviate 1.40; Python client weaviate-client 4.x (Python 3.10+); TypeScript client weaviate-client 3.x (Node 18+); an OpenAI API key for the OpenAI modules used in the examples'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/weaviate/weaviate
  tags:
    - weaviate
    - vector-database
    - hybrid-search
    - rag
    - docker
---

# Weaviate

## Overview

Weaviate stores objects (properties plus one or more vectors) in collections. It can call an embedding provider at import and query time (the `text2vec-*` modules), or you can supply your own vectors. Queries are served over REST and gRPC (ports 8080 and 50051); the official clients use gRPC, so both ports must be reachable. This skill uses the current client generation: Python `weaviate-client` 4.x and TypeScript `weaviate-client` 3.x. Both use the collections API (`client.collections.use("Name")`). The older "class", `client.schema` and `client.graphql` style belongs to the legacy v3 Python and v2 JS clients and is not used here.

## Instructions

### 1. Run Weaviate

Save as `docker-compose.yml` and run `docker compose up -d`. Ports are bound to localhost, anonymous access is for local development only; for anything shared turn it off and enable API-key authentication (see the authentication page in the Weaviate docs).

```yaml
services:
  weaviate:
    image: cr.weaviate.io/semitechnologies/weaviate:1.40.1
    ports:
      - "127.0.0.1:8080:8080"
      - "127.0.0.1:50051:50051"
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: "true"
      PERSISTENCE_DATA_PATH: /var/lib/weaviate
      ENABLE_MODULES: text2vec-openai,generative-openai,backup-filesystem
      BACKUP_FILESYSTEM_PATH: /var/lib/weaviate/backups
      OPENAI_APIKEY: ${OPENAI_API_KEY}
      CLUSTER_HOSTNAME: node1
    volumes:
      - weaviate_data:/var/lib/weaviate

volumes:
  weaviate_data:
```

Install a client: `npm install weaviate-client` or `pip install weaviate-client`. Check the server with `curl http://localhost:8080/v1/.well-known/ready` (HTTP 200 when ready).

### 2. Create a collection (TypeScript)

The vectorizer is set per collection. `vectors.text2VecOpenAI()` is the current helper; `configure.vectorizer.*` is deprecated.

```typescript
import weaviate, { vectors, generative, dataType, tokenization } from 'weaviate-client';

const client = await weaviate.connectToLocal();

await client.collections.create({
  name: 'Article',
  vectorizers: vectors.text2VecOpenAI(),
  generative: generative.openAI(),
  properties: [
    { name: 'title', dataType: dataType.TEXT },
    { name: 'content', dataType: dataType.TEXT },
    { name: 'category', dataType: dataType.TEXT, tokenization: tokenization.FIELD },
    { name: 'url', dataType: dataType.TEXT, skipVectorization: true },
  ],
});
```

### 3. Import data

`insertMany` returns per-object results; it does not throw on a bad object, so check `hasErrors`.

```typescript
const articles = client.collections.use('Article');

const response = await articles.data.insertMany([
  { title: 'Intro to Vector DBs', content: 'Vector databases store embeddings...', category: 'tech', url: 'https://weaviate.io/blog/vector-search-explained' },
  { title: 'Hybrid Search Explained', content: 'Combining keyword and vector scores...', category: 'tech', url: 'https://weaviate.io/blog/hybrid-search-explained' },
]);
if (response.hasErrors) console.error(response.errors);
```

For large datasets use server-side batching (Weaviate 1.36 and later, current clients): in Python, `with collection.batch.stream() as batch: batch.add_object(properties=row)`, then check `collection.batch.failed_objects`.

### 4. Query

```typescript
// semantic search; the query text is vectorized by the collection's vectorizer
const near = await articles.query.nearText('how do vector databases work', {
  limit: 5,
  returnMetadata: ['distance'],
});

// hybrid: alpha 0 = pure BM25, 1 = pure vector, default 0.75
const hybrid = await articles.query.hybrid('vector database performance', {
  limit: 10,
  alpha: 0.5,
  returnMetadata: ['score'],
  filters: articles.filter.byProperty('category').equal('tech'),
});
hybrid.objects.forEach(o => console.log(o.properties.title, o.metadata?.score));
```

### 5. RAG with the generative module

In the TypeScript client the generation options are the second argument and the search options (`limit`) the third. Results are on `.generative?.text`.

```typescript
const rag = await articles.generate.nearText(
  'vector databases',
  {
    singlePrompt: { prompt: 'Summarize this article in one sentence: {content}' },
    groupedTask: { prompt: 'Compare these articles and list key differences.' },
  },
  { limit: 3 },
);
rag.objects.forEach(o => console.log(o.generative?.text)); // one result per object
console.log(rag.generative?.text);                          // one result for the group
```

### 6. Back up (filesystem)

The compose file above enables the module. Local filesystem backups are for development; use S3, GCS or Azure modules in production.

```bash
curl -X POST http://localhost:8080/v1/backups/filesystem \
  -H 'Content-Type: application/json' \
  -d '{"id": "articles-2026-10-24", "include": ["Article"]}'
curl http://localhost:8080/v1/backups/filesystem/articles-2026-10-24
# restore fails if a collection from the backup still exists on the instance:
# delete it first (or restore into a fresh instance with the same node name)
curl -X DELETE http://localhost:8080/v1/schema/Article
curl -X POST http://localhost:8080/v1/backups/filesystem/articles-2026-10-24/restore
curl http://localhost:8080/v1/backups/filesystem/articles-2026-10-24/restore   # status: SUCCESS when done
```

## Examples

### Example 1: Python semantic search with a filter

Request: "Find articles about databases in the tech category."

```python
import weaviate
from weaviate.classes.query import Filter, MetadataQuery

client = weaviate.connect_to_local()
try:
    articles = client.collections.use("Article")
    response = articles.query.near_text(
        query="databases",
        filters=Filter.by_property("category").equal("tech"),
        limit=5,
        return_metadata=MetadataQuery(distance=True),
    )
    for obj in response.objects:
        print(obj.properties["title"], obj.metadata.distance)
finally:
    client.close()
```

Result: up to five articles in the tech category, closest first (smaller distance means closer).

### Example 2: Python hybrid search

Request: "Search for machine learning, favouring keyword matches a little less than meaning."

```python
import weaviate
from weaviate.classes.query import MetadataQuery

with weaviate.connect_to_local() as client:
    articles = client.collections.use("Article")
    response = articles.query.hybrid(
        query="machine learning",
        alpha=0.7,
        limit=5,
        return_metadata=MetadataQuery(score=True),
    )
    for obj in response.objects:
        print(obj.properties["title"], obj.metadata.score)
```

Result: the five best fused BM25 and vector matches, highest score first.

## Guidelines

- Always close the Python client (`client.close()` or a `with` block); the TypeScript client holds gRPC connections too.
- A collection's vectorizer cannot be changed after objects exist. Pick the model first, or use named vectors to add another one.
- A property with `skipVectorization` still gets stored and filtered; it just does not feed the embedding.
- Leaving a text property at the default tokenization means `equal('tech')` on a multi-word value matches per word; use `field` tokenization for exact-value filters such as category.
- Anonymous access and unauthenticated REST are for development. Do not publish ports 8080 or 50051 on a public interface.
- Keep the OpenAI key in an environment variable, never in the compose file or the code.
- Weaviate collects usage telemetry by default; see the telemetry page in the docs to opt out.
- Pin the server image tag and upgrade one minor version at a time; check the release notes first.
