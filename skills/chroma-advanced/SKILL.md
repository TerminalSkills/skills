---
name: chroma-advanced
description: Advanced ChromaDB deployment for RAG applications with multi-tenancy, performance optimization, and production scaling
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - chromadb
    - vector-database
    - rag
    - embeddings
    - multi-tenancy
    - performance
    - production
---

# ChromaDB Advanced - Production RAG Vector Store

Deploy and optimize ChromaDB for production RAG applications with advanced features like multi-tenancy, performance tuning, and enterprise scaling.

## Instructions

### Step 1: Production Setup

```python
import chromadb
from chromadb.config import Settings

# Initialize persistent client
client = chromadb.PersistentClient(
    path="/path/to/chroma/data",
    settings=Settings(
        chroma_client_auth_provider="chromadb.auth.basic.BasicAuthClientProvider",
        chroma_client_auth_credentials_provider="chromadb.auth.basic.BasicAuthCredentialsProvider"
    )
)

# Create tenant-specific collection
collection = client.create_collection(
    name="tenant_001_documents",
    embedding_function=chromadb.utils.embedding_functions.DefaultEmbeddingFunction(),
    metadata={"tenant_id": "tenant_001"}
)
```

### Step 2: Advanced Operations

```python
# Batch upsert with metadata
documents = ["Document 1 content", "Document 2 content"]
metadatas = [
    {"source": "web", "category": "tech", "rating": 4.5},
    {"source": "pdf", "category": "business", "rating": 4.8}
]
ids = ["doc_1", "doc_2"]

collection.upsert(
    documents=documents,
    metadatas=metadatas,
    ids=ids
)

# Advanced query with filters
results = collection.query(
    query_texts=["machine learning algorithms"],
    n_results=10,
    where={"category": "tech", "rating": {"$gte": 4.0}},
    where_document={"$contains": "algorithm"}
)

# Multi-collection search for RAG
class RAGChromaManager:
    def __init__(self, client):
        self.client = client
        
    def hybrid_search(self, tenant_id, query, collections=None):
        if collections is None:
            collections = ['documents', 'summaries']
        
        all_results = {}
        for collection_name in collections:
            full_name = f"{tenant_id}_{collection_name}"
            collection = self.client.get_collection(full_name)
            
            results = collection.query(
                query_texts=[query],
                n_results=5
            )
            all_results[collection_name] = results
        
        return self.combine_results(all_results, query)
    
    def combine_results(self, all_results, query):
        combined = []
        for collection_name, results in all_results.items():
            for i, doc in enumerate(results['documents'][0]):
                combined.append({
                    'document': doc,
                    'metadata': results['metadatas'][0][i],
                    'distance': results['distances'][0][i],
                    'collection': collection_name
                })
        
        return sorted(combined, key=lambda x: x['distance'])

# Usage
rag_manager = RAGChromaManager(client)
results = rag_manager.hybrid_search("tenant_001", "AI applications")
```

## Guidelines

**Multi-Tenancy:**
- Use clear tenant isolation with collection naming
- Implement proper metadata filtering
- Monitor per-tenant resource usage
- Design scalable tenant management

**Performance:**
- Use batch operations for bulk data
- Implement appropriate indexing strategies
- Monitor query performance and optimize
- Consider embedding model selection