---
name: meilisearch-advanced
description: Instant search with advanced faceting, geo-search, multi-tenancy, and performance optimization for production applications
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - meilisearch
    - instant-search
    - faceting
    - geosearch
    - multi-tenancy
    - performance
    - rust
---

# MeiliSearch Advanced - Production Instant Search

Build blazing-fast search experiences with MeiliSearch's advanced faceting, geo-search, multi-tenancy, and enterprise features.

## Instructions

### Step 1: Production Setup

```python
import meilisearch

client = meilisearch.Client('http://localhost:7700', 'master_key')

# Create advanced index
index = client.create_index('products', {'primaryKey': 'id'})

# Configure index settings
index.update_searchable_attributes(['name', 'description', 'brand'])
index.update_filterable_attributes(['brand', 'category', 'price', 'rating', 'location'])
index.update_sortable_attributes(['price', 'rating', 'created_at'])
index.update_ranking_rules([
    'words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'popularity_score:desc'
])
```

### Step 2: Advanced Search

```python
# Faceted search
results = index.search('smartphone', {
    'facets': ['brand', 'price', 'rating'],
    'filter': 'price 100 TO 500 AND rating >= 4.0',
    'sort': ['price:asc'],
    'limit': 20,
    'attributesToHighlight': ['name'],
    'attributesToCrop': ['description:100']
})

# Geographic search
geo_results = index.search('restaurants', {
    'filter': '_geoRadius(48.8566, 2.3522, 2000)',  # 2km radius from Paris
    'sort': ['_geoPoint(48.8566, 2.3522):asc']
})
```

## Guidelines

**Multi-Tenancy:**
- Use clear tenant isolation with API keys
- Implement proper metadata filtering
- Monitor per-tenant resource usage
- Design scalable tenant management

**Performance:**
- Configure appropriate ranking rules
- Use proper pagination strategies
- Monitor indexing performance
- Implement caching for repeated searches