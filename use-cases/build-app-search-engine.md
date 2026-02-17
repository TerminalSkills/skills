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

Your app's search is a SQL `LIKE '%query%'` on the product name column. It misses typos, ignores synonyms, returns results in arbitrary order, and takes 3 seconds on 500K rows. Users search for "wirless keyboard" and get zero results. Your support team fields "I can't find X" tickets daily. You need real search — fast, typo-tolerant, with filters and ranking — but setting up Elasticsearch feels like deploying a second database, and Algolia's pricing is opaque at scale.

## The Solution

Design a search index tailored to your data, build a sync pipeline from your primary database, implement a search API with faceting and typo tolerance, and tune relevance with real user queries. Two core skills plus Docker for local development.

```bash
npx terminal-skills install search-engine-setup
npx terminal-skills install docker-helper
npx terminal-skills install data-analysis
```

## Step-by-Step Walkthrough

### 1. Design the search index

```
I have a products table with 500K rows. Columns: id, name, description, category, brand, price_cents, rating, in_stock, created_at. Design an Elasticsearch index mapping optimized for: full-text search on name and description with typo tolerance, exact filtering on category and brand, range filtering on price and rating, and boosting in-stock items. Include a custom analyzer for handling common misspellings.
```

The agent generates:

```json
{
  "mappings": {
    "properties": {
      "name":        { "type": "text", "analyzer": "product_analyzer", "boost": 3.0 },
      "description": { "type": "text", "analyzer": "product_analyzer" },
      "category":    { "type": "keyword" },
      "brand":       { "type": "keyword" },
      "price_cents": { "type": "integer" },
      "rating":      { "type": "float" },
      "in_stock":    { "type": "boolean" },
      "created_at":  { "type": "date" },
      "suggest":     { "type": "completion" }
    }
  },
  "settings": {
    "analysis": {
      "analyzer": {
        "product_analyzer": {
          "tokenizer": "standard",
          "filter": ["lowercase", "product_synonyms", "edge_ngram_filter"]
        }
      },
      "filter": {
        "product_synonyms": {
          "type": "synonym",
          "synonyms": ["laptop, notebook", "phone, mobile, cell"]
        },
        "edge_ngram_filter": {
          "type": "edge_ngram", "min_gram": 3, "max_gram": 15
        }
      }
    }
  }
}
```

### 2. Build the sync pipeline

```
Create a sync service that keeps Elasticsearch in sync with PostgreSQL. On app boot, do a full re-index of all products. After that, listen to database change events (using pg_notify or polling updated_at) and update individual documents. Handle deletions by tracking soft-deleted records. Add a CLI command to trigger a full re-index manually.
```

### 3. Implement the search API

```
Build a search endpoint at GET /api/search?q=wireless+keyboard&category=electronics&min_price=2000&max_price=10000&sort=relevance. Support: full-text query with fuzziness auto, faceted filters (category, brand, price range, rating, in_stock), pagination with cursor-based approach, and highlight matching terms in results. Return total count, facet counts, and highlighted snippets.
```

### 4. Add autocomplete and suggestions

```
Add a typeahead endpoint at GET /api/search/suggest?q=wir that returns the top 5 completion suggestions from product names as the user types. Use Elasticsearch's completion suggester. Also add a "did you mean" feature using the phrase suggester for queries that return few results.
```

### 5. Tune relevance with query analysis

```
I have a log of the 200 most common search queries and their click-through rates in search_queries.csv (columns: query, result_count, ctr, avg_position_clicked). Analyze which queries perform poorly (low CTR or zero results). Suggest specific tuning actions: synonym additions, boost adjustments, or missing data fixes. Output a priority-ranked list of improvements.
```

The agent reports:

```
Search Quality Analysis — 200 queries reviewed:

Zero-result queries (17):
  "wirless keyboard" → Add to synonym: wireless, wirless
  "usb-c dongle"     → Hyphenated terms split incorrectly, add char_filter
  "gift under 50"    → Needs price-aware query parsing

Low CTR queries (< 5%, 23 queries):
  "laptop stand" (CTR 2.1%) → Top result is a laptop bag, boost exact name match
  "blue headphones"  (CTR 3.4%) → Color not indexed, add color field from description

Recommended actions (priority order):
1. Add 12 synonym pairs for common misspellings → fixes 14 zero-result queries
2. Add char_filter for hyphens and special characters → fixes 3 zero-result queries
3. Increase name field boost from 3.0 to 5.0 → improves 8 low-CTR queries
```

## Real-World Example

A senior developer at an online marketplace with 500K product listings gets complaints that search is broken — users type "wirless keybord" and see nothing. The current implementation is a PostgreSQL `ILIKE` query that takes 2.8 seconds average.

1. He asks the agent to design an Elasticsearch index with custom analyzers for typo tolerance
2. A sync pipeline keeps the index fresh, processing updates within 500ms of a database change
3. The search API handles full-text queries, faceted filters, and returns highlighted results in 40ms
4. Autocomplete suggestions appear after 2 characters with sub-50ms response time
5. Query analysis reveals 17 zero-result queries and 23 low-CTR queries, each with a specific fix
6. After deploying, search-driven conversion rate increases 34 % and "can't find product" tickets drop 89 %

## Related Skills

- [search-engine-setup](../skills/search-engine-setup/) -- Index design, sync pipeline, search API, relevance tuning
- [docker-helper](../skills/docker-helper/) -- Running Elasticsearch locally for development
- [data-analysis](../skills/data-analysis/) -- Analyzing search query logs for relevance improvements
