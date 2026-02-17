---
name: search-engine-setup
description: >-
  Set up and optimize search engines for applications. Use when someone asks to
  "add search to my app", "set up Elasticsearch", "configure Algolia",
  "fix search relevance", "add autocomplete", "fuzzy search", or "faceted
  filtering". Covers index design, data sync, search API, autocomplete,
  relevance tuning, and query analysis.
license: Apache-2.0
compatibility: "Elasticsearch 8.x or Algolia. Node.js/Python examples provided."
metadata:
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["search", "elasticsearch", "algolia", "full-text-search"]
---

# Search Engine Setup

## Overview

This skill helps AI agents implement production-quality search in applications. It covers index design with custom analyzers, database-to-index sync pipelines, search APIs with faceting and highlights, autocomplete, and relevance tuning based on real query data.

## Instructions

### Index Design (Elasticsearch)

1. Map source database columns to Elasticsearch field types:
   - Text columns users search → `text` with custom analyzer
   - Enum/category columns for filtering → `keyword`
   - Numeric columns for range filters → `integer`, `float`
   - Boolean flags → `boolean`
   - Dates → `date`
   - Fields for autocomplete → `completion`

2. Custom analyzer template for product/content search:
   ```json
   {
     "analyzer": {
       "content_analyzer": {
         "tokenizer": "standard",
         "filter": ["lowercase", "synonym_filter", "edge_ngram_filter"]
       }
     },
     "filter": {
       "synonym_filter": { "type": "synonym", "synonyms_path": "synonyms.txt" },
       "edge_ngram_filter": { "type": "edge_ngram", "min_gram": 3, "max_gram": 15 }
     }
   }
   ```

3. Boost fields by search importance: title/name (3-5x), tags (2x), description (1x).

4. Always add a `suggest` field of type `completion` for typeahead.

### Index Design (Algolia)

1. Set `searchableAttributes` in priority order: `["name", "category", "description"]`.
2. Set `attributesForFaceting`: prefix filterable attributes with `filterOnly()` for non-displayed facets.
3. Configure `customRanking`: `["desc(popularity)", "desc(rating)"]`.
4. Enable typo tolerance (on by default) and set `minWordSizefor1Typo: 3`.

### Sync Pipeline

1. **Full re-index**: On first run or manual trigger, paginate through all source records (1000 per batch), transform to index documents, bulk insert.
2. **Incremental sync**: Poll `updated_at > last_sync_time` every 10 seconds, or use database triggers/CDC.
3. **Deletions**: Track soft-deleted records. Remove from index when detected.
4. **Idempotency**: Use source record ID as document ID. Upsert, never blind insert.
5. **Error handling**: Log failed documents, continue batch. Retry failures in next cycle.

### Search API

Build an endpoint that accepts:
- `q` — full-text query string
- Filter params — `category`, `brand`, `min_price`, `max_price`, `rating`, `in_stock`
- `sort` — `relevance` (default), `price_asc`, `price_desc`, `newest`, `rating`
- `page` / `per_page` or cursor-based pagination

Query construction (Elasticsearch):
```json
{
  "query": {
    "bool": {
      "must": [{ "multi_match": { "query": "q", "fields": ["name^5", "description"], "fuzziness": "AUTO" }}],
      "filter": [
        { "term": { "category": "electronics" }},
        { "range": { "price_cents": { "gte": 2000, "lte": 10000 }}},
        { "term": { "in_stock": true }}
      ],
      "should": [{ "term": { "in_stock": { "value": true, "boost": 2 }}}]
    }
  },
  "highlight": { "fields": { "name": {}, "description": {} }},
  "aggs": {
    "categories": { "terms": { "field": "category", "size": 20 }},
    "brands":     { "terms": { "field": "brand", "size": 20 }},
    "price_ranges": { "range": { "field": "price_cents", "ranges": [
      { "to": 2500 }, { "from": 2500, "to": 10000 }, { "from": 10000 }
    ]}}
  }
}
```

### Autocomplete

1. Use completion suggester for prefix-based typeahead (fastest).
2. Return top 5 suggestions with category context.
3. Add "did you mean" using phrase suggester for low-result queries.

### Relevance Tuning

Analyze search logs to improve quality:
1. **Zero-result queries**: Check for misspellings → add synonyms. Check for missing data → flag content gaps.
2. **Low CTR queries**: Top results don't match intent → adjust boost weights or add synonyms.
3. **Position bias**: If users consistently click result #3+, the ranking formula needs tuning.
4. Apply changes iteratively: synonyms first, then boost adjustments, then custom scoring.

## Examples

### Example 1 — Blog search index

**Input:** "Set up search for a blog with 10K articles."

**Output:**
```json
{
  "mappings": {
    "properties": {
      "title":        { "type": "text", "analyzer": "content_analyzer", "boost": 5.0 },
      "body":         { "type": "text", "analyzer": "content_analyzer" },
      "author":       { "type": "keyword" },
      "tags":         { "type": "keyword" },
      "published_at": { "type": "date" },
      "suggest":      { "type": "completion", "contexts": [{ "name": "tag", "type": "category" }] }
    }
  }
}
```

### Example 2 — Algolia configuration for an e-commerce store

**Input:** "Configure Algolia for a store with products."

**Output:**
```js
index.setSettings({
  searchableAttributes: ['name', 'brand', 'category', 'description'],
  attributesForFaceting: ['category', 'brand', 'filterOnly(price_cents)', 'rating'],
  customRanking: ['desc(sales_count)', 'desc(rating)'],
  typoTolerance: true,
  minWordSizefor1Typo: 3,
  minWordSizefor2Typos: 6,
  hitsPerPage: 20,
  snippetEllipsisText: '…',
  attributesToSnippet: ['description:30'],
});
```

## Guidelines

- **Start with Elasticsearch for control, Algolia for speed-to-market.** Elasticsearch gives full tuning power; Algolia is faster to set up but costs more at scale.
- **Never search the primary database.** Always sync to a dedicated search index. SQL `LIKE` does not scale.
- **Fuzziness AUTO is almost always correct.** It allows 1 typo for 3-5 char words and 2 typos for 6+ chars.
- **Synonyms are the highest-ROI tuning.** Most zero-result queries are fixed by adding 10-20 synonym pairs.
- **Monitor query performance.** Set an alert if p95 search latency exceeds 200ms.
