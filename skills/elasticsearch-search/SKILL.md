---
name: elasticsearch-search
description: >-
  Configure and use Elasticsearch for full-text search, custom analyzers,
  aggregations, and index management. Use when a user needs to design search
  mappings, write complex queries, build aggregation pipelines, tune relevance
  scoring, or optimize index performance for search workloads.
license: Apache-2.0
compatibility: "Elasticsearch 8.x or 9.x (checked with 9.5.5); curl"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/elastic/elasticsearch
  category: devops
  tags: ["elasticsearch", "search", "full-text-search", "aggregations", "analyzers"]
---

# Elasticsearch Search

## Overview

Design and implement Elasticsearch search solutions including index mappings, custom analyzers, full-text queries, aggregations, and relevance tuning. Covers index lifecycle, search templates, and performance optimization.

## Instructions

### Connect first

Elasticsearch 8 and 9 start with security on: HTTPS, a generated `elastic` password and a CA certificate. Set the base URL once and add credentials from the environment (never in the command text). For a throwaway local node started with `xpack.security.enabled=false`, plain `http://127.0.0.1:9200` works.

```bash
export ES_URL="https://127.0.0.1:9200"
# secured cluster: add to each curl  -u "elastic:$ELASTIC_PASSWORD" --cacert "$ES_CA_CERT"
# or with an API key:               -H "Authorization: ApiKey $ES_API_KEY"
curl -s "$ES_URL" -u "elastic:$ELASTIC_PASSWORD" --cacert "$ES_CA_CERT"
```

The commands below omit the credential flags to stay readable; add them on a secured cluster. A single shard is right for small indices (under tens of GB); more shards add overhead.

### Task A: Create Index with Custom Mappings

```bash
# Create an index with explicit mappings and custom analyzers
curl -X PUT "$ES_URL/products" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 1,
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
      "in_stock": { "type": "boolean" }
    }
  }
}'
```

### Task B: Full-Text Search Queries

```bash
curl -X POST "$ES_URL/products/_search" \
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
      "should": [{ "range": { "rating": { "gte": 4.0, "boost": 2.0 } } }]
    }
  },
  "highlight": {
    "fields": {
      "name": {},
      "description": { "fragment_size": 150 }
    }
  },
  "size": 20
}'
```

```bash
curl -X POST "$ES_URL/products/_search" \
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
  "size": 10
}'
```

### Task C: Aggregations

```bash
curl -X POST "$ES_URL/products/_search" \
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
    }
  }
}'
```

```bash
# Date histogram aggregation for time-series analysis
curl -X POST "$ES_URL/logs-*/_search" \
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

### Task D: Index Lifecycle Management for Logs

ILM moves time-series indices through phases. Use a data stream plus an index template that names the policy:

```bash
curl -X PUT "$ES_URL/_ilm/policy/logs-lifecycle" \
  -H "Content-Type: application/json" \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" } }
      },
      "warm": {
        "min_age": "3d",
        "actions": { "forcemerge": { "max_num_segments": 1 }, "set_priority": { "priority": 50 } }
      },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}'

curl -X PUT "$ES_URL/_index_template/logs-app" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["logs-app-*"],
  "data_stream": {},
  "priority": 200,
  "template": {
    "settings": { "index.lifecycle.name": "logs-lifecycle", "number_of_shards": 1 },
    "mappings": { "properties": { "@timestamp": { "type": "date" }, "level": { "type": "keyword" }, "message": { "type": "text" } } }
  }
}'

curl -X PUT "$ES_URL/_data_stream/logs-app-web"
```

Documents written to a data stream need `@timestamp` and the `create` bulk action. A `searchable_snapshot` action (cold or frozen phase) needs an Enterprise license; on the Basic license the policy is rejected, so leave it out unless the cluster is licensed for it.

### Task E: Search Templates

The template `source` is a mustache string (not a JSON object, because mustache sections are not valid JSON):

```bash
curl -X PUT "$ES_URL/_scripts/product-search" \
  -H "Content-Type: application/json" \
  -d '{
  "script": {
    "lang": "mustache",
    "source": "{\"query\":{\"bool\":{\"must\":{\"multi_match\":{\"query\":\"{{query}}\",\"fields\":[\"name^3\",\"description\"]}},\"filter\":[{\"term\":{\"in_stock\":true}}{{#category}},{\"term\":{\"category\":\"{{category}}\"}}{{/category}},{\"range\":{\"price\":{\"gte\":{{min_price}}{{^min_price}}0{{/min_price}},\"lte\":{{max_price}}{{^max_price}}1000000{{/max_price}}}}}]}},\"size\":{{size}}{{^size}}20{{/size}}}"
  }
}'
```

```bash
# Use the template; the optional parameters fall back to their defaults
curl -X POST "$ES_URL/products/_search/template" \
  -H "Content-Type: application/json" \
  -d '{ "id": "product-search", "params": { "query": "headphones", "category": "electronics", "max_price": 200, "size": 10 } }'

# Debug: show the query a template produces
curl -X POST "$ES_URL/_render/template/product-search" \
  -H "Content-Type: application/json" -d '{ "params": { "query": "headphones" } }'
```

## Examples

### Example 1: "Search my products for wireless headphones under $200"

Create the `products` index (Task A), load documents with `POST $ES_URL/_bulk?refresh=true`, then run the Task B query with `"lte": 200`. The response lists hits ordered by `_score`, for instance `Wireless Noise Cancelling Headphones` (price 149.0) first and `Wired Studio Headphones` second, with `<em>` highlight tags around the matched words.

### Example 2: "Show error rate per hour for the last week"

Index logs into the `logs-app-web` data stream (Task D), then run the date histogram of Task C against `logs-app-web`. Each bucket carries `doc_count`, `error_count.doc_count` and `error_rate.value`, for example `{"doc_count": 2, "error_count": {"doc_count": 1}, "error_rate": {"value": 50.0}}`.

## Guidelines

- Use `keyword` sub-fields on text fields for exact match filtering and aggregations
- Set `fuzziness: "AUTO"` for user-facing search to handle typos gracefully
- Use `filter` context for non-scoring clauses (dates, booleans, categories) to leverage caching
- Use data streams with ILM for logs and metrics; rollover and delete phases work on every license
- Use search templates to keep query logic server-side and simplify client code
- Monitor slow queries with `index.search.slowlog.threshold.query.warn: 2s`
- Mapping changes to existing fields are not possible: create a new index with the new mapping and `_reindex` into it, switching an alias when ready
- Never expose port 9200 to the internet; keep security enabled and pass credentials from environment variables
