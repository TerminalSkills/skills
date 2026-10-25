---
name: typesense
description: >-
  Typesense is an open-source, typo-tolerant search engine for instant search: sub-50ms queries, filters, facets, geo search and synonyms, self-hosted or in Typesense Cloud. Use when a user wants to run Typesense with Docker, define a collection schema, index documents, search from Node.js or Python, add synonyms or pinned results, create search-only API keys, or replace Algolia or Elasticsearch for site search.
license: Apache-2.0
compatibility: "Typesense Server 30.x (tested on 30.2), Docker; typesense npm 3.x, typesense PyPI 2.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/typesense/typesense
  tags: "typesense, search-engine, full-text-search, docker, typo-tolerant"
---

# Typesense

## Overview

Typesense is a search server you run yourself (one binary or Docker image) or rent as Typesense Cloud. It keeps the index in RAM, corrects typos by default, and supports filtering, faceting, sorting, geo search, synonyms, curation (pinning and hiding results), joins and vector search. Clients exist for JavaScript, Python, PHP, Ruby, Go, Java and more. This skill targets Server 30.x, where synonyms and overrides moved out of the collection into top-level sets.

## Instructions

### Run the server

Bind the port to localhost for development, and keep the admin API key in an environment variable.

```bash
export TYPESENSE_API_KEY=dev-key-8f3a
mkdir -p "$(pwd)/typesense-data"
docker run -d --name typesense -p 127.0.0.1:8108:8108 \
  -v "$(pwd)/typesense-data":/data \
  typesense/typesense:30.2 \
  --data-dir /data --api-key="$TYPESENSE_API_KEY" --enable-cors
curl http://127.0.0.1:8108/health        # {"ok":true}
```

Install a client: `npm install typesense` (3.x) or `pip install typesense` (2.x). Pin the image tag; use the version your clients and docs target. Release candidates (`31.0.rc*`) are not for production.

### Create a collection

```javascript
// create-collection.mjs: define the schema
import Typesense from 'typesense';

export const client = new Typesense.Client({
  nodes: [{ host: '127.0.0.1', port: 8108, protocol: 'http' }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5,
});

await client.collections().create({
  name: 'products',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'price', type: 'float', facet: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'rating', type: 'float' },
    { name: 'in_stock', type: 'bool', facet: true },
    { name: 'tags', type: 'string[]', facet: true },
  ],
  default_sorting_field: 'rating',   // optional: numeric field used to rank equal matches
});
```

A field must be declared in the schema to be searchable, filterable or sortable. `facet: true` is only needed for fields used in `facet_by`.

### Index documents

```javascript
// index-documents.mjs: bulk upsert
import { client } from './create-collection.mjs';

const documents = [
  { id: '1', name: 'MacBook Pro 14', description: 'Apple laptop with M3 chip', price: 1999, category: 'Laptops', rating: 4.8, in_stock: true, tags: ['apple', 'laptop'] },
  { id: '2', name: 'ThinkPad X1 Carbon', description: 'Lenovo business notebook', price: 1499, category: 'Laptops', rating: 4.5, in_stock: true, tags: ['lenovo', 'laptop'] },
  { id: '3', name: 'Dell U2723QE', description: '27-inch 4K monitor', price: 649, category: 'Monitors', rating: 4.6, in_stock: false, tags: ['dell', 'monitor'] },
];

const results = await client.collections('products').documents().import(documents, { action: 'upsert' });
console.log(results);   // [{ success: true }, { success: true }, { success: true }]
```

`import` returns one result per document; check each for `success: false` rather than assuming the call worked. Document ids are strings.

### Search

```javascript
// search.mjs: typo tolerance, filters, facets
import { client } from './create-collection.mjs';

const results = await client.collections('products').documents().search({
  q: 'laptp',                                   // typo is corrected
  query_by: 'name,description,tags',
  filter_by: 'price:<2000 && in_stock:true',
  sort_by: 'rating:desc',
  facet_by: 'category,tags',
  per_page: 10,
  page: 1,
});
console.log(results.found, results.hits.map(h => h.document.name));
// 2 [ 'MacBook Pro 14', 'ThinkPad X1 Carbon' ]
```

Python:

```python
# search.py
import os
import typesense

client = typesense.Client({
    'nodes': [{'host': '127.0.0.1', 'port': '8108', 'protocol': 'http'}],
    'api_key': os.environ['TYPESENSE_API_KEY'],
    'connection_timeout_seconds': 5,
})

results = client.collections['products'].documents.search({
    'q': 'laptop',
    'query_by': 'name,description',
    'filter_by': 'price:<2000',
    'sort_by': 'rating:desc',
})
for hit in results['hits']:
    print(hit['document']['name'], hit['document']['price'])
```

### Geo search

Add `{ name: 'location', type: 'geopoint' }` to the schema and store `[lat, lng]`:

```javascript
const nearby = await client.collections('stores').documents().search({
  q: '*',
  query_by: 'name',
  filter_by: 'location:(48.8566, 2.3522, 10 km)',
  sort_by: 'location(48.8566, 2.3522):asc',
});
```

### Synonyms and curation (v30 sets API)

Since v30 synonyms and overrides are top-level sets that you link to collections. The old `collections(...).synonyms()` and `.overrides()` calls and the `synonyms:*` and `overrides:*` API key actions no longer work (404 or 401); existing data is migrated on upgrade, so take a snapshot first.

```javascript
// synonyms-and-curation.mjs
import { client } from './create-collection.mjs';

await client.synonymSets('laptop-synonyms').upsert({
  items: [{ id: 'laptop-multiway', synonyms: ['laptop', 'notebook', 'portable computer'] }],
});

await client.curationSets('featured').upsert({
  items: [{
    id: 'featured-laptop',
    rule: { query: 'best laptop', match: 'exact' },
    includes: [{ id: '1', position: 1 }],
    excludes: [{ id: '99' }],
  }],
});

// Link both sets to the collection (at creation, or later via collections('products').update)
await client.collections('products').update({
  synonym_sets: ['laptop-synonyms'],
  curation_sets: ['featured'],
});
```

Python equivalents: `client.synonym_sets['laptop-synonyms'].upsert({...})` and `client.curation_sets['featured'].upsert({...})`. Synonyms apply only to `q`, not to `filter_by`, and not to quoted phrase searches.

### API keys for the browser

Never ship the admin key to a browser. Create a search-only key, or derive a scoped key that forces a filter:

```javascript
const searchKey = await client.keys().create({
  description: 'Search-only key for the storefront',
  actions: ['documents:search'],
  collections: ['products'],
});
const scoped = client.keys().generateScopedSearchKey(searchKey.value, { filter_by: 'in_stock:true' });
```

### High availability (3 nodes, Raft)

A cluster needs at least 3 nodes to survive one failure. Every node gets the same nodes file, listing `peering_address:peering_port:api_port`, and its own `--peering-address`:

```bash
echo '10.0.0.1:8107:8108,10.0.0.2:8107:8108,10.0.0.3:8107:8108' | sudo tee /etc/typesense/nodes
typesense-server --data-dir /var/lib/typesense --api-key="$TYPESENSE_API_KEY" \
  --api-address 0.0.0.0 --api-port 8108 \
  --peering-address 10.0.0.1 --peering-port 8107 --nodes=/etc/typesense/nodes
```

Give the client all three nodes in `nodes`; it fails over between them. Keep the peering port (8107) on a private network.

## Examples

### Example 1: "Add typo-tolerant search to my shop"

Start the container, create the `products` collection and import the catalog as shown above. Then:

```console
$ curl -s -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  "http://127.0.0.1:8108/collections/products/documents/search?q=laptp&query_by=name,description"
```

The response has `found: 2` with MacBook Pro 14 and ThinkPad X1 Carbon despite the typo.

### Example 2: "Make notebook find laptops, and pin one product for 'best laptop'"

Create the `laptop-synonyms` and `featured` sets, link them to `products`, then search `q: 'notebook'`. Both laptops come back (the ThinkPad matched literally, the MacBook through the synonym). Searching `best laptop` returns product 1 first.

## Guidelines

- Treat `--api-key` as an admin secret: keep it server-side, load it from the environment, and give browsers a search-only or scoped key.
- Do not publish port 8108 to the internet without TLS in front and a firewall; `-p 127.0.0.1:8108:8108` keeps it local.
- After a restart the server answers 503 "Not Ready or Lagging" until the data is loaded; wait for `/health` to return `{"ok":true}`.
- The data directory must be a persistent volume. The index is loaded into RAM at startup, so size memory at roughly the dataset size or more.
- Search only the fields listed in `query_by`; order them by importance, because earlier fields weigh more.
- To change a field's type, create a new collection and re-import; use a collection alias to switch traffic.
- Before upgrading to v30 from an older server, take a snapshot, then recreate `synonyms:*` and `overrides:*` API keys as `synonym_sets:*` and `curation_sets:*`.
