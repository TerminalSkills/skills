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

Design and implement Elasticsearch search solutions including index mappings, custom analyzers, full-text queries, aggregations, and relevance tuning.

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
          "synonyms": ["laptop,notebook", "phone,mobile,cellphone"]
        },
        "product_stemmer": { "type": "stemmer", "language": "english" }
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
      "in_stock": { "type": "boolean" }
    }
  }
}'
```

### Task B: Full-Text Search Queries

```bash
# Multi-match search with boosting and filtering
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
        { "range": { "rating": { "gte": 4.0, "boost": 2.0 } } }
      ]
    }
  },
  "highlight": {
    "fields": { "name": {}, "description": { "fragment_size": 150 } }
  },
  "size": 20
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
          { "key": "premium", "from": 150 }
        ]
      }
    }
  }
}'
```

```bash
# Date histogram for time-series analysis
curl -X POST "http://localhost:9200/logs-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "size": 0,
  "query": { "range": { "@timestamp": { "gte": "now-7d" } } },
  "aggs": {
    "errors_over_time": {
      "date_histogram": { "field": "@timestamp", "calendar_interval": "1h" },
      "aggs": {
        "error_count": { "filter": { "term": { "level": "error" } } }
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
        "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" } }
      },
      "warm": {
        "min_age": "3d",
        "actions": { "shrink": { "number_of_shards": 1 }, "forcemerge": { "max_num_segments": 1 } }
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
  -d '{ "id": "product-search", "params": { "query": "headphones", "max_price": 200, "size": 10 } }'
```

## Best Practices

- Use `keyword` sub-fields on text fields for exact match filtering and aggregations
- Set `fuzziness: "AUTO"` for user-facing search to handle typos
- Use `filter` context for non-scoring clauses to leverage caching
- Design ILM policies to move data through hot/warm/cold tiers
- Use search templates to keep query logic server-side
