---
name: pgvector
description: Vector similarity search in PostgreSQL with embeddings, HNSW indexing, and hybrid search capabilities
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - postgresql
    - vector-search
    - embeddings
    - similarity-search
    - hnsw
    - machine-learning
    - rag
---

# pgvector - Vector Similarity Search in PostgreSQL

Implement high-performance vector similarity search in PostgreSQL using pgvector extension for embeddings, semantic search, and RAG applications with traditional RDBMS benefits.

## Overview

pgvector is a PostgreSQL extension that adds support for vector similarity search, enabling you to store and query high-dimensional vectors efficiently. Perfect for semantic search, recommendation systems, and RAG applications.

## Instructions

### Step 1: Install and Setup

```bash
# Install pgvector (Ubuntu/Debian)
wget https://github.com/pgvector/pgvector/archive/v0.5.1.tar.gz
tar -xzf v0.5.1.tar.gz
cd pgvector-0.5.1
make && sudo make install

# Using Docker
docker run --name pgvector-db \
  -e POSTGRES_DB=vectordb \
  -e POSTGRES_USER=vectoruser \
  -e POSTGRES_PASSWORD=vectorpass \
  -p 5432:5432 -d pgvector/pgvector:pg15

# Enable extension
psql -c "CREATE EXTENSION vector;"
```

### Step 2: Create Vector Tables

```sql
-- Documents table with vector embeddings
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Vector embeddings (1536 dimensions for OpenAI)
    title_embedding vector(1536),
    content_embedding vector(1536)
);

-- Create HNSW index for fast similarity search
CREATE INDEX ON documents USING hnsw (content_embedding vector_cosine_ops);
CREATE INDEX ON documents USING hnsw (title_embedding vector_cosine_ops);

-- Products table for recommendations
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    category TEXT,
    
    -- Product embeddings
    name_embedding vector(384),
    description_embedding vector(384)
);

CREATE INDEX ON products USING hnsw (name_embedding vector_cosine_ops);
```

### Step 3: Vector Search Implementation

```python
import psycopg2
from sentence_transformers import SentenceTransformer
import numpy as np

class VectorEmbeddingManager:
    def __init__(self, connection_string):
        self.conn = psycopg2.connect(connection_string)
        self.cursor = self.conn.cursor()
        self.sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
    
    def semantic_search_documents(self, query, limit=10, similarity_threshold=0.7):
        """Semantic search in documents"""
        
        query_embedding = self.sentence_model.encode(query).tolist()
        
        search_query = """
        SELECT 
            id, title, content, category, created_at,
            1 - (content_embedding <=> %s::vector) AS similarity
        FROM documents
        WHERE 1 - (content_embedding <=> %s::vector) > %s
        ORDER BY content_embedding <=> %s::vector
        LIMIT %s
        """
        
        self.cursor.execute(search_query, [
            query_embedding, query_embedding, similarity_threshold, 
            query_embedding, limit
        ])
        
        results = []
        for row in self.cursor.fetchall():
            results.append({
                'id': row[0],
                'title': row[1],
                'content': row[2][:300] + '...' if len(row[2]) > 300 else row[2],
                'category': row[3],
                'created_at': row[4],
                'similarity': float(row[5])
            })
        
        return results
    
    def hybrid_search(self, query, limit=10):
        """Combine full-text search with vector similarity"""
        
        query_embedding = self.sentence_model.encode(query).tolist()
        
        hybrid_query = """
        SELECT 
            id, title, content, category,
            (
                0.3 * ts_rank(to_tsvector('english', title || ' ' || content), 
                             plainto_tsquery('english', %s)) +
                0.7 * (1 - (content_embedding <=> %s::vector))
            ) AS hybrid_score,
            1 - (content_embedding <=> %s::vector) AS vector_similarity
        FROM documents
        WHERE 
            to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', %s)
            OR (1 - (content_embedding <=> %s::vector)) > 0.3
        ORDER BY hybrid_score DESC
        LIMIT %s
        """
        
        params = [query, query_embedding, query_embedding, query, query_embedding, limit]
        self.cursor.execute(hybrid_query, params)
        
        results = []
        for row in self.cursor.fetchall():
            results.append({
                'id': row[0],
                'title': row[1], 
                'content': row[2][:300] + '...' if len(row[2]) > 300 else row[2],
                'category': row[3],
                'hybrid_score': float(row[4]),
                'vector_similarity': float(row[5])
            })
        
        return results

# Usage
manager = VectorEmbeddingManager("postgresql://vectoruser:vectorpass@localhost:5432/vectordb")

# Semantic search
results = manager.semantic_search_documents("machine learning algorithms", limit=5)
print(f"Found {len(results)} similar documents")

# Hybrid search
hybrid_results = manager.hybrid_search("database optimization", limit=5)
print(f"Hybrid search found {len(hybrid_results)} documents")
```

## Guidelines

**Vector Configuration:**
- Use consistent dimensions across related embeddings
- Consider storage requirements: vector(1536) uses ~6KB
- Test different embedding models for your use case
- Balance dimension size with search accuracy

**Index Optimization:**
- Use HNSW for most scenarios (better recall/performance)
- Consider IVFFlat for exact searches with memory constraints
- Monitor index build time vs query performance
- Tune index parameters based on data size

**Scaling Strategies:**
- Partition large tables by category or time
- Use read replicas for read-heavy workloads
- Monitor memory usage as vector indexes are memory-intensive
- Implement proper backup strategies