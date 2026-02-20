---
name: qdrant-advanced
description: High-performance vector search with Qdrant clustering, hybrid search, payload filtering, and production optimization
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - qdrant
    - vector-search
    - clustering
    - hybrid-search
    - performance
    - production
    - rust
---

# Qdrant Advanced - High-Performance Vector Search

Deploy and optimize Qdrant for production vector search with advanced clustering, hybrid search capabilities, and enterprise-scale performance optimization.

## Instructions

### Step 1: Production Cluster Setup

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition

# Initialize cluster client
client = QdrantClient(host="localhost", port=6333)

# Create collection with advanced configuration
client.create_collection(
    collection_name="documents",
    vectors_config={
        "content": VectorParams(size=768, distance=Distance.COSINE),
        "title": VectorParams(size=384, distance=Distance.COSINE),
    },
    shard_number=6,
    replication_factor=2
)
```

### Step 2: Advanced Search

```python
# Multi-vector hybrid search
class HybridQdrantSearch:
    def __init__(self, client):
        self.client = client
    
    def hybrid_search(self, collection_name, query_vectors, payload_filter=None, limit=10):
        # Build filter conditions
        filter_conditions = None
        if payload_filter:
            conditions = []
            for field, value in payload_filter.items():
                if isinstance(value, dict) and 'range' in value:
                    conditions.append(
                        FieldCondition(
                            key=field,
                            range=value['range']
                        )
                    )
                else:
                    conditions.append(
                        FieldCondition(key=field, match=value)
                    )
            
            filter_conditions = Filter(must=conditions)
        
        # Search with primary vector
        primary_vector_name = list(query_vectors.keys())[0]
        primary_vector = query_vectors[primary_vector_name]
        
        results = self.client.search(
            collection_name=collection_name,
            query_vector=(primary_vector_name, primary_vector),
            query_filter=filter_conditions,
            limit=limit * 2,  # Get more for reranking
            with_payload=True,
            with_vectors=True
        )
        
        # Multi-vector reranking if multiple vectors
        if len(query_vectors) > 1:
            results = self.rerank_with_multiple_vectors(results, query_vectors, limit)
        
        return results
    
    def rerank_with_multiple_vectors(self, initial_results, query_vectors, final_limit):
        # Calculate combined scores
        for result in initial_results:
            combined_score = 0
            weights = {"content": 0.7, "title": 0.3}
            
            for vector_name, query_vector in query_vectors.items():
                if vector_name in result.vector:
                    result_vector = result.vector[vector_name]
                    similarity = self.cosine_similarity(query_vector, result_vector)
                    weight = weights.get(vector_name, 1.0 / len(query_vectors))
                    combined_score += similarity * weight
            
            result.combined_score = combined_score
        
        # Sort and return top results
        initial_results.sort(key=lambda x: x.combined_score, reverse=True)
        return initial_results[:final_limit]
    
    def cosine_similarity(self, vec1, vec2):
        import numpy as np
        vec1, vec2 = np.array(vec1), np.array(vec2)
        return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

# Usage
search_engine = HybridQdrantSearch(client)

results = search_engine.hybrid_search(
    "documents",
    query_vectors={
        'content': [0.1] * 768,  # Mock content embedding
        'title': [0.2] * 384     # Mock title embedding
    },
    payload_filter={
        'category': ['technology', 'ai'],
        'rating': {'range': {'gte': 4.0}}
    },
    limit=10
)
```

## Guidelines

**Cluster Architecture:**
- Deploy odd numbers of nodes (3, 5, 7) for consensus
- Use appropriate shard and replication factors
- Monitor cluster health and node synchronization
- Implement load balancing and failover

**Performance:**
- Choose appropriate distance metrics
- Tune HNSW parameters based on dataset size
- Monitor memory usage and query performance
- Implement regular snapshots and backups