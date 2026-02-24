---
name: typesense
description: |
  Typesense is an open-source, typo-tolerant search engine optimized for instant search experiences.
  Learn to deploy with Docker, define collections, index documents, and build search UIs
  as a modern alternative to Algolia.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - typesense
    - search-engine
    - full-text-search
    - docker
    - typo-tolerant
---

# Typesense

Typesense is a fast, typo-tolerant search engine you can self-host. It offers sub-50ms search, built-in typo correction, faceting, filtering, and geo-search.

## Installation

```bash
# Docker deployment
docker run -d --name typesense -p 8108:8108 \
  -v typesense-data:/data \
  typesense/typesense:27.1 \
  --data-dir /data \
  --api-key=xyz123 \
  --enable-cors

# Node.js client
npm install typesense

# Python client
pip install typesense
```

## Create a Collection

```javascript
// create-collection.js: Define a collection schema
const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: 'xyz123',
  connectionTimeoutSeconds: 5,
});

async function createCollection() {
  await client.collections().create({
    name: 'products',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'price', type: 'float', facet: true },
      { name: 'category', type: 'string', facet: true },
      { name: 'rating', type: 'float', facet: true },
      { name: 'in_stock', type: 'bool', facet: true },
      { name: 'tags', type: 'string[]', facet: true },
    ],
    default_sorting_field: 'rating',
  });
}

createCollection().catch(console.error);
```

## Index Documents

```javascript
// index-documents.js: Import documents into Typesense
const documents = [
  { id: '1', name: 'MacBook Pro', description: 'Apple laptop with M3 chip', price: 1999, category: 'Laptops', rating: 4.8, in_stock: true, tags: ['apple', 'laptop'] },
  { id: '2', name: 'ThinkPad X1', description: 'Lenovo business laptop', price: 1499, category: 'Laptops', rating: 4.5, in_stock: true, tags: ['lenovo', 'laptop'] },
];

// Single document
await client.collections('products').documents().create(documents[0]);

// Bulk import (JSONL)
const results = await client.collections('products').documents().import(documents, { action: 'upsert' });
console.log(results);
```

## Search

```javascript
// search.js: Search with typo tolerance, filters, and facets
const results = await client.collections('products').documents().search({
  q: 'laptp',  // typo-tolerant — matches "laptop"
  query_by: 'name,description,tags',
  filter_by: 'price:<2000 && in_stock:true',
  sort_by: 'rating:desc',
  facet_by: 'category,tags',
  per_page: 10,
  page: 1,
  highlight_full_fields: 'name,description',
});

console.log(`Found ${results.found} results`);
results.hits.forEach(hit => {
  console.log(hit.document.name, hit.highlights);
});
```

## Python Client

```python
# search.py: Typesense with Python client
import typesense

client = typesense.Client({
    'nodes': [{'host': 'localhost', 'port': '8108', 'protocol': 'http'}],
    'api_key': 'xyz123',
    'connection_timeout_seconds': 5,
})

# Search
results = client.collections['products'].documents.search({
    'q': 'laptop',
    'query_by': 'name,description',
    'filter_by': 'price:<2000',
    'sort_by': 'rating:desc',
})

for hit in results['hits']:
    print(hit['document']['name'], hit['document']['price'])
```

## Geo Search

```javascript
// geo-search.js: Location-based search with Typesense
// Collection must have a geopoint field: { name: 'location', type: 'geopoint' }
const results = await client.collections('stores').documents().search({
  q: '*',
  query_by: 'name',
  filter_by: 'location:(48.8566, 2.3522, 10 km)',
  sort_by: 'location(48.8566, 2.3522):asc',
});
```

## Synonyms and Curation

```javascript
// synonyms.js: Configure search synonyms and curations
// Synonyms
await client.collections('products').synonyms().upsert('laptop-synonyms', {
  synonyms: ['laptop', 'notebook', 'portable computer'],
});

// Curate results — pin or hide specific documents for a query
await client.collections('products').overrides().upsert('featured-laptop', {
  rule: { query: 'best laptop', match: 'exact' },
  includes: [{ id: '1', position: 1 }],
  excludes: [{ id: '99' }],
});
```

## Docker Compose for Production

```yaml
# docker-compose.yml: Typesense cluster with 3 nodes
services:
  typesense-1:
    image: typesense/typesense:27.1
    ports:
      - "8108:8108"
    volumes:
      - ts1-data:/data
    command: >
      --data-dir /data
      --api-key=xyz123
      --nodes=/config/nodes.txt
      --peering-address=typesense-1
      --peering-port=8107

volumes:
  ts1-data:
```
