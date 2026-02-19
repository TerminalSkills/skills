---
name: elasticsearch-search
description: >-
  Configure and use Elasticsearch for full-text search, custom analyzers,
  aggregations, and index management. Use when a user needs to design search
  mappings, write complex queries, build aggregation pipelines, tune relevance
  scoring, or optimize index performance for search workloads.
license: Apache-2.0
compatibility: "Elasticsearch 8.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["elasticsearch", "search", "full-text-search", "aggregations", "analyzers", "mappings"]
---

# Elasticsearch Search

## Overview

Design and implement Elasticsearch search solutions including index mappings, custom analyzers, full-text queries, aggregations, and relevance tuning. Covers index lifecycle, search templates, and performance optimization.

## Instructions

### Task A: Create Index with Custom Mappings

```bash
# Create an index with explicit mappings and custom analyzers
curl -X PUT "http://localhost:9200/products" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "product_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "product_synonyms", "product_stemmer"]
        },
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "autocomplete_tokenizer",
          "filter": ["lowercase"]
        }
      },
      "tokenizer": {
        "autocomplete_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15,
          "token_chars": ["letter", "digit"]
        }
      },
      "filter": {
        "product_synonyms": {
          "type": "synonym",
          "synonyms": ["laptop,notebook", "phone,mobile,cellphone", "tv,television"]
        },
        "product_stemmer": {
          "type": "stemmer",
          "language": "english"
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "product_analyzer",
        "fields": {
          "autocomplete": { "type": "text", "analyzer": "autocomplete_analyzer", "search_analyzer": "standard" },
          "keyword": { "type": "keyword" }
        }
      },
      "description": { "type": "text", "analyzer": "product_analyzer" },
      "category": { "type": "keyword" },
      "price": { "type": "float" },
      "rating": { "type": "float" },
      "tags": { "type": "keyword" },
      "created_at": { "type": "date" },
      "location": { "type": "geo_point" },
      "in_stock": { "type": "boolean" }
    }
  }
}'
```

### Task B: Full-Text Search Queries

```bash
# Multi-match search with boosting
curl -X POST "http://localhost:9200/products/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "query": {
    "bool": {
      "must": {
        "multi_match": {
          "query": "wireless noise cancelling headphones",
          "fields": ["name^3", "description", "tags^2"],
          "type": "best_fields",
          "fuzziness": "AUTO"
        }
      },
      "filter": [
        { "term": { "in_stock": true } },
        { "range": { "price": { "gte": 50, "lte": 300 } } }
      ],
      "should": [
        { "range": { "rating": { "gte": 4.0, "boost": 2.0 } } },
        { "term": { "category": { "value": "electronics", "boost": 1.5 } } }
      ]
    }
  },
  "highlight": {
    "fields": {
      "name": {},
      "description": { "fragment_size": 150, "number_of_fragments": 2 }
    }
  },
  "sort": [
    { "_score": "desc" },
    { "rating": "desc" }
  ],
  "size": 20
}'
```

```bash
# Autocomplete / search-as-you-type query
curl -X POST "http://localhost:9200/products/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "query": {
    "bool": {
      "must": {
        "match": {
          "name.autocomplete": { "query": "wire", "operator": "and" }
        }
      },
      "filter": { "term": { "in_stock": true } }
    }
  },
  "size": 10,
  "_source": ["name", "category", "price"]
}'
```

### Task C: Aggregations

```bash
# Multi-level aggregations for faceted search
curl -X POST "http://localhost:9200/products/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "size": 0,
  "query": { "match": { "description": "wireless headphones" } },
  "aggs": {
    "categories": {
      "terms": { "field": "category", "size": 20 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } },
        "avg_rating": { "avg": { "field": "rating" } }
      }
    },
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "key": "budget", "to": 50 },
          { "key": "mid-range", "from": 50, "to": 150 },
          { "key": "premium", "from": 150, "to": 300 },
          { "key": "luxury", "from": 300 }
        ]
      }
    },
    "price_stats": { "extended_stats": { "field": "price" } },
    "top_rated": {
      "top_hits": {
        "sort": [{ "rating": "desc" }],
        "size": 3,
        "_source": ["name", "rating", "price"]
      }
    }
  }
}'
```

```bash
# Date histogram aggregation for time-series analysis
curl -X POST "http://localhost:9200/logs-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "size": 0,
  "query": { "range": { "@timestamp": { "gte": "now-7d" } } },
  "aggs": {
    "errors_over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "calendar_interval": "1h"
      },
      "aggs": {
        "error_count": {
          "filter": { "term": { "level": "error" } }
        },
        "error_rate": {
          "bucket_script": {
            "buckets_path": { "errors": "error_count._count", "total": "_count" },
            "script": "params.total > 0 ? (params.errors / params.total) * 100 : 0"
          }
        }
      }
    }
  }
}'
```

### Task D: Index Lifecycle Management

```bash
# Create an ILM policy for log indices
curl -X PUT "http://localhost:9200/_ilm/policy/logs-lifecycle" \
  -H "Content-Type: application/json" \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "3d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "searchable_snapshot": { "snapshot_repository": "backups" },
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}'
```

### Task E: Search Templates

```bash
# Create a reusable search template
curl -X PUT "http://localhost:9200/_scripts/product-search" \
  -H "Content-Type: application/json" \
  -d '{
  "script": {
    "lang": "mustache",
    "source": {
      "query": {
        "bool": {
          "must": { "multi_match": { "query": "{{query}}", "fields": ["name^3", "description"] } },
          "filter": [
            {{#category}}{ "term": { "category": "{{category}}" } },{{/category}}
            { "term": { "in_stock": true } },
            { "range": { "price": { "gte": "{{min_price}}{{^min_price}}0{{/min_price}}", "lte": "{{max_price}}{{^max_price}}99999{{/max_price}}" } } }
          ]
        }
      },
      "size": "{{size}}{{^size}}20{{/size}}"
    }
  }
}'
```

```bash
# Use the search template
curl -X POST "http://localhost:9200/products/_search/template" \
  -H "Content-Type: application/json" \
  -d '{ "id": "product-search", "params": { "query": "headphones", "category": "electronics", "max_price": 200, "size": 10 } }'
```

## Best Practices

- Use `keyword` sub-fields on text fields for exact match filtering and aggregations
- Set `fuzziness: "AUTO"` for user-facing search to handle typos gracefully
- Use `filter` context for non-scoring clauses (dates, booleans, categories) to leverage caching
- Design ILM policies to move data through hot/warm/cold tiers based on access patterns
- Use search templates to keep query logic server-side and simplify client code
- Monitor slow queries with `index.search.slowlog.threshold.query.warn: 2s`
