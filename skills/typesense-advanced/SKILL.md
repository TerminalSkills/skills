---
name: typesense-advanced
description: Advanced self-hosted search with typo tolerance, faceting, geosearch, and real-time indexing for high-performance applications
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - typesense
    - self-hosted
    - typo-tolerance
    - faceting
    - geosearch
    - real-time
    - performance
---

# Typesense Advanced - High-Performance Self-Hosted Search

Build lightning-fast search experiences with Typesense's advanced typo tolerance, real-time indexing, geo-spatial search, and sophisticated faceting.

## Instructions

### Step 1: Advanced Setup

```python
import typesense

client = typesense.Client({
    'nodes': [{'host': 'localhost', 'port': '8108', 'protocol': 'http'}],
    'api_key': 'xyz',
    'connection_timeout_seconds': 10
})

# Advanced product schema
schema = {
    "name": "products",
    "fields": [
        {"name": "name", "type": "string", "index": True, "infix": True},
        {"name": "description", "type": "string", "index": True},
        {"name": "brand", "type": "string", "facet": True},
        {"name": "category", "type": "string", "facet": True},
        {"name": "price", "type": "float", "facet": True},
        {"name": "rating", "type": "float", "facet": True},
        {"name": "location", "type": "geopoint", "index": True},
        {"name": "tags", "type": "string[]", "index": True}
    ],
    "default_sorting_field": "popularity_score"
}

collection = client.collections.create(schema)
```

### Step 2: Advanced Search

```python
# Intelligent search with typo tolerance
search_params = {
    'q': 'wirelss hedphones',  # Intentional typos
    'query_by': 'name,description,brand',
    'typo_tokens_threshold': 1,
    'drop_tokens_threshold': 2,
    'highlight_fields': 'name,description',
    'facet_by': 'brand,category,price',
    'filter_by': 'rating:>4.0',
    'sort_by': 'popularity_score:desc',
    'per_page': 20
}

results = client.collections['products'].documents.search(search_params)

# Geospatial search
geo_results = client.collections['products'].documents.search({
    'q': 'coffee shops',
    'query_by': 'name,description',
    'filter_by': 'location:(40.7128,-74.0060,5km)',
    'sort_by': 'location(40.7128,-74.0060):asc'
})
```

## Guidelines

**Performance Optimization:**
- Use memory-mapped storage for faster access
- Configure appropriate typo tolerance levels
- Implement proper field indexing strategies
- Use hierarchical faceting for complex categorization