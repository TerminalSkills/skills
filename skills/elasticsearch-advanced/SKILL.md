---
name: elasticsearch-advanced
description: Advanced Elasticsearch patterns including aggregations, custom analyzers, geo-spatial search, and performance optimization
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - elasticsearch
    - search-engine
    - aggregations
    - analyzers
    - geospatial
    - performance
    - full-text-search
---

# Elasticsearch Advanced - Master Complex Search Patterns

Implement sophisticated Elasticsearch solutions with advanced aggregations, custom analyzers, geo-spatial search, performance optimization, and complex query patterns for production-scale search applications.

## Overview

Advanced Elasticsearch techniques go beyond basic search to include complex aggregations for analytics, custom text analyzers for domain-specific content, geo-spatial capabilities for location-based search, and performance optimizations for high-scale production deployments.

Key features:
- **Complex aggregations**: Nested, pipeline, and custom aggregations for analytics
- **Custom analyzers**: Domain-specific text processing and tokenization
- **Geo-spatial search**: Location-based queries and geographic analysis
- **Performance optimization**: Index design, shard management, and query tuning

## Instructions

### Step 1: Advanced Index Setup

```python
from elasticsearch import Elasticsearch

client = Elasticsearch(['localhost:9200'])

# Advanced index with custom analyzers
index_config = {
    "settings": {
        "analysis": {
            "analyzer": {
                "technical_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "technical_synonyms", "stemmer"]
                }
            },
            "filter": {
                "technical_synonyms": {
                    "type": "synonym",
                    "synonyms": ["js,javascript", "ai,artificial intelligence"]
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "title": {"type": "text", "analyzer": "technical_analyzer"},
            "content": {"type": "text", "analyzer": "technical_analyzer"},
            "location": {"type": "geo_point"},
            "price": {"type": "scaled_float", "scaling_factor": 100},
            "specifications": {
                "type": "nested",
                "properties": {
                    "key": {"type": "keyword"},
                    "value": {"type": "text"}
                }
            }
        }
    }
}

client.indices.create(index="products_advanced", body=index_config)
```

### Step 2: Complex Aggregations

```python
# Advanced analytics aggregation
aggregation_query = {
    "size": 0,
    "aggs": {
        "categories": {
            "terms": {"field": "category"},
            "aggs": {
                "avg_price": {"avg": {"field": "price"}},
                "price_ranges": {
                    "histogram": {"field": "price", "interval": 100}
                },
                "top_brands": {"terms": {"field": "brand", "size": 5}}
            }
        },
        "monthly_trends": {
            "date_histogram": {
                "field": "created_at",
                "calendar_interval": "month"
            }
        },
        "price_percentiles": {
            "percentiles": {"field": "price", "percents": [25, 50, 75, 95]}
        }
    }
}

results = client.search(index="products_advanced", body=aggregation_query)
```

### Step 3: Geo-spatial Search

```python
# Geographic search with distance sorting
geo_query = {
    "query": {
        "bool": {
            "must": {"match": {"category": "restaurant"}},
            "filter": {
                "geo_distance": {
                    "distance": "5km",
                    "location": {"lat": 40.7128, "lon": -74.0060}
                }
            }
        }
    },
    "sort": [
        {
            "_geo_distance": {
                "location": {"lat": 40.7128, "lon": -74.0060},
                "order": "asc",
                "unit": "km"
            }
        }
    ]
}

geo_results = client.search(index="locations", body=geo_query)
```

## Guidelines

**Index Design:**
- Plan shard distribution based on data size and query patterns
- Use appropriate field types and analyzers for your content
- Implement index templates for consistent configuration
- Consider index lifecycle management for time-based data

**Performance Optimization:**
- Monitor cluster health and resource usage regularly
- Use bulk indexing for high-volume data ingestion
- Optimize query patterns to avoid expensive operations
- Implement proper caching strategies