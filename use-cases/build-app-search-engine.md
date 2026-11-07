---
title: "Build and Optimize a Search Engine for Your App"
slug: build-app-search-engine
description: "Add fast, typo-tolerant, faceted search to your application using Elasticsearch or Algolia — from index design to relevance tuning."
skills: [search-engine-setup, docker-helper, data-analysis]
category: development
tags: [search, elasticsearch, algolia, full-text-search, relevance-tuning]
---

# Build and Optimize a Search Engine for Your App

## The Problem

Your app's search is a SQL `LIKE '%query%'` on the product name column. It misses typos, ignores synonyms, returns results in arbitrary order, and gets slow on hundreds of thousands of rows. A user types "wirless keyboard" and gets zero results. Another types "laptop stand" and the first result is a laptop bag. Support fields "I can't find X" tickets daily, because the search bar is effectively broken for anyone who cannot spell perfectly or does not use the exact product name.

Setting up a search engine feels like deploying a second database, so the team keeps patching the SQL approach with more `ILIKE` conditions and regex hacks that make it slower without making it smarter.

## The Solution

Three skills split the work. **search-engine-setup** designs the index, sync, search API, autocomplete and tuning. **docker-helper** runs a local Elasticsearch for development. **data-analysis** (pandas) mines the search-query log for what to fix. Elasticsearch is the example below; the same skill also configures Algolia (JavaScript client v5) if you would rather not run a cluster.

## Step-by-Step Walkthrough

### Step 1: Run Elasticsearch Locally

```text
Add a local Elasticsearch for development to our compose file. Bind it to localhost only.
```

docker-helper writes a Compose v2 service (no top-level `version:` key). Security is switched off here for local development only, so the port must never be published beyond `127.0.0.1`:

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:9.5.6   # pin the version you run in production
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false   # local development only
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
    ports:
      - "127.0.0.1:9200:9200"
    volumes:
      - esdata:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:9200/_cluster/health || exit 1"]
      interval: 5s
      retries: 30
volumes:
  esdata:
```

`docker compose up -d --wait` returns when the healthcheck passes. In production, keep security enabled (the default) and use TLS and credentials.

### Step 2: Design the Search Index

```text
I have a products table with 500K rows. Columns: id, name, description, category, brand, price_cents, rating, in_stock, created_at. Design an Elasticsearch index optimized for: full-text search on name and description with typo tolerance and prefix matching, exact filtering on category and brand, range filtering on price and rating, and autocomplete.
```

```json
{
  "settings": {
    "analysis": {
      "filter": {
        "product_synonyms": { "type": "synonym", "synonyms": ["laptop, notebook", "phone, mobile, cell"] },
        "edge_ngram_filter": { "type": "edge_ngram", "min_gram": 2, "max_gram": 15 }
      },
      "analyzer": {
        "name_index":  { "tokenizer": "standard", "filter": ["lowercase", "edge_ngram_filter"] },
        "name_search": { "tokenizer": "standard", "filter": ["lowercase", "product_synonyms"] },
        "text_search": { "tokenizer": "standard", "filter": ["lowercase", "product_synonyms"] }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text", "analyzer": "name_index", "search_analyzer": "name_search",
        "fields": { "plain": { "type": "text", "analyzer": "standard" } }
      },
      "description": { "type": "text", "analyzer": "standard", "search_analyzer": "text_search" },
      "category":    { "type": "keyword" },
      "brand":       { "type": "keyword" },
      "price_cents": { "type": "integer" },
      "rating":      { "type": "float" },
      "in_stock":    { "type": "boolean" },
      "created_at":  { "type": "date" },
      "suggest":     { "type": "completion" }
    }
  }
}
```

I created this index on Elasticsearch 9.5.6 and queried it. Four design points:

- **Edge n-grams at index time only.** `name_index` splits "keyboard" into `ke`, `key`, `keyb` and so on, so typing "key" matches. The search analyzers have no n-grams; otherwise a short query would match every word that starts with those letters.
- **Boosts live in the query, not the mapping.** The old per-field `"boost"` mapping parameter is rejected by current Elasticsearch (`Unknown parameter [boost] on mapper`). Use `name^3` in the query (Step 4).
- **`name.plain`** is a standard-analyzed copy that the "did you mean" phrase suggester reads (Step 5).
- **`keyword` fields** for `category` and `brand` give exact filters and facets without text analysis.

### Step 3: Build the Sync Pipeline

A product marked out of stock in PostgreSQL but still shown as available in search is worse than no search:

```text
Create a sync service that keeps Elasticsearch in sync with PostgreSQL. Full re-index with the bulk API on demand, then incremental updates. Handle deletions. Add a CLI command for a full re-index.
```

The service combines three mechanisms:

- **Full re-index** in batches of about 1,000 rows through the `_bulk` API, using the product ID as the document `_id` so it is an idempotent upsert. Build into a new index and switch an alias for zero-downtime rebuilds.
- **Incremental updates** by polling `updated_at > last_sync` every few seconds, or by `LISTEN`/`NOTIFY`. A `NOTIFY` payload is limited to a few KB and is lost if the listener is down, so send only the row ID, re-read the row, and keep the `updated_at` poll as the backstop.
- **Deletions**: soft-deleted rows are removed from the index when detected.

A change becomes searchable after the next index refresh (one second by default), not instantly. If the incremental sync drifts, a scheduled full re-index rebuilds from the source of truth.

### Step 4: Implement the Search API

```text
Build GET /api/search?q=wireless+keyboard&category=electronics&min_price=2000&max_price=10000. Support fuzzy full-text search, filters, facet counts, highlighting, and cursor-based pagination.
```

```json
{
  "query": { "bool": {
    "must": [{ "multi_match": { "query": "wirless keybord", "fields": ["name^3", "description"], "fuzziness": "AUTO" } }],
    "filter": [{ "range": { "price_cents": { "gte": 2000, "lte": 10000 } } }],
    "should": [{ "term": { "in_stock": { "value": true, "boost": 2 } } }]
  } },
  "highlight": { "fields": { "name": {}, "description": {} } },
  "aggs": { "brands": { "terms": { "field": "brand", "size": 20 } } }
}
```

Run against the index above, the misspelled "wirless keybord" returns the "Logitech Wireless Keyboard" product with the matching terms wrapped in `<em>` tags. `fuzziness: AUTO` handles ordinary typos with no synonym list. The `should` clause ranks in-stock products higher while out-of-stock ones still appear. Filters sit in `filter` (not scored, cacheable), and the `brands` aggregation returns facet counts that respect the active filters.

For cursor-based pagination, open a point in time (`POST /products/_pit?keep_alive=1m`) and page with `search_after` on a sort that ends in `_shard_doc`; results stay consistent while the index is being updated. Never build the SQL string or the Elasticsearch query by concatenating user input: pass `q` only as the `query` value and whitelist the filter and sort fields.

### Step 5: Add Autocomplete and "Did You Mean"

```text
Add GET /api/search/suggest?q=wir returning the top 5 completions from product names. Also add a "did you mean" for queries with few results.
```

Autocomplete uses the `completion` suggester on the `suggest` field. Index each product with `"suggest": {"input": ["Wireless Keyboard"], "weight": 10}`, and a prefix query for `wir` returns "Wireless Keyboard" before "Wire Stripper". "Did you mean" uses the phrase suggester:

```json
{ "size": 0, "suggest": { "dym": { "text": "wirless keybord",
  "phrase": { "field": "name.plain", "size": 1, "max_errors": 2 } } } }
```

On the sample data it answers `wireless keyboard`. Show it as a banner when a search returns fewer than 3 hits.

### Step 6: Tune Relevance with Real Query Data

Building the index gets you most of the way; the query log shows what users actually feel:

```text
search_queries.csv has columns: query, result_count, ctr, avg_position_clicked. Find the zero-result queries, the queries with a click-through rate below 5%, and the ones where users click below position 3. Suggest tuning actions ranked by how many queries each would fix.
```

data-analysis answers it with a few pandas filters:

```python
import pandas as pd

q = pd.read_csv("search_queries.csv")
zero = q[q["result_count"] == 0].sort_values("query")
weak = q[(q["result_count"] > 0) & (q["ctr"] < 0.05)].sort_values("ctr")
late = q[q["avg_position_clicked"] >= 3]
```

Each bucket maps to a fix: zero-result queries mean missing synonyms, missing data, or a query shape the index does not model ("gift under 50" needs price parsing); low-CTR queries mean the wrong product ranks first, so adjust field boosts or add the missing structured field (for instance a `color` field for "blue headphones"); late clicks mean the ranking formula needs tuning. Change one thing at a time, synonyms first, then boosts, and re-run the same queries to see the effect.

## Real-World Example

A developer at an online marketplace with 500K product listings is drowning in "I can't find X" tickets. The search is a PostgreSQL `ILIKE` query that is slow and returns nothing for misspellings. A previous attempt to add `OR` clauses for common typos made it slower and still missed most variations.

She starts with a local Elasticsearch in Compose, bound to localhost, and the index design from Step 2. The sync service fills it with a bulk re-index and keeps it current by polling `updated_at`. The search API returns fuzzy, filtered, highlighted results with facet counts. She then runs the 200 most common queries from last month's log through the pandas filters, finds a short list of zero-result and low-CTR queries, and fixes them in order: synonyms, a name-boost change, and a missing color field. She compares the click-through rate on those queries before and after the change before dropping the old `ILIKE` path.

## Related Skills

- [search-engine-setup](/skills/search-engine-setup) — index design, sync, search API, autocomplete and relevance tuning for Elasticsearch and Algolia.
- [docker-helper](/skills/docker-helper) — the local Elasticsearch service and its healthcheck in Compose.
- [data-analysis](/skills/data-analysis) — pandas analysis of the search-query log.
