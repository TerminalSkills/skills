---
name: chromadb
description: >-
  Assists with storing, searching, and managing vector embeddings using ChromaDB. Use when
  building RAG pipelines, semantic search engines, or recommendation systems. Trigger words:
  chromadb, chroma, vector database, embeddings, semantic search, similarity search,
  vector store, rag.
license: Apache-2.0
compatibility: "Python 3.8+ or Node.js 18+ via npm package"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["chromadb", "vector-database", "embeddings", "rag", "semantic-search"]
---

# ChromaDB

## Overview

ChromaDB is an open-source vector database for storing, searching, and managing embeddings. It provides a simple API for document ingestion, semantic similarity search, and metadata filtering, supporting both Python and JavaScript/TypeScript clients with embedded, server, and cloud deployment options.

## Instructions

- When initializing, use `get_or_create_collection` for idempotent collection setup, choose `PersistentClient` for development and `HttpClient` for production server connections.
- When adding documents, batch `add()` calls in chunks of 5,000 documents, always store source metadata (filename, URL, page number) for RAG citations, and use `upsert()` for incremental updates to avoid duplicates.
- When querying, use `collection.query(query_texts=..., n_results=...)` for text-based search, combine metadata `where` filters to narrow results before semantic search, and set `n_results` based on the LLM's context window (5-10 for most RAG pipelines).
- When choosing embeddings, use the default Sentence Transformers for local development without API keys, OpenAI or Cohere embedding functions for production, or pass pre-computed vectors directly.
- When filtering metadata, use operators like `$eq`, `$gt`, `$in` with `$and`/`$or` logical operators, and combine with `where_document` for content-based filtering alongside semantic similarity.
- When deploying, use the embedded `PersistentClient` for single-node applications, Docker for server mode, or Chroma Cloud for managed hosting with multi-tenancy support.
- When tuning performance, configure HNSW parameters (`hnsw:M`, `hnsw:construction_ef`, `hnsw:search_ef`) for the quality-speed tradeoff and choose `cosine` distance for normalized embeddings (OpenAI, Cohere).

## Examples

### Example 1: Build a document Q&A pipeline

**User request:** "Set up a RAG pipeline with ChromaDB for answering questions about our docs"

**Actions:**
1. Load documents and split into chunks with metadata (source, page)
2. Create a collection with OpenAI embedding function
3. Batch-add document chunks with `upsert()` for idempotent ingestion
4. Query with `collection.query()` and pass retrieved chunks as context to the LLM

**Output:** A semantic search pipeline that retrieves relevant document chunks for LLM-powered Q&A.

### Example 2: Add filtered semantic search to an application

**User request:** "Implement product search that combines text similarity with category filters"

**Actions:**
1. Create a collection with product descriptions and category metadata
2. Implement search combining `query_texts` with `where={"category": "electronics"}`
3. Return results with distances for relevance ranking
4. Add price range filtering with `$gte` and `$lte` operators

**Output:** A filtered semantic search that narrows by metadata before ranking by text similarity.

## Guidelines

- Use `get_or_create_collection` for idempotent collection initialization; it is safe for restarts.
- Batch `add()` calls in chunks of 5,000 documents to manage memory usage.
- Always store source metadata (filename, URL, page number); it is essential for RAG citations.
- Use `upsert()` for incremental updates to avoid duplicate documents when re-ingesting.
- Set `n_results` based on the LLM's context window: 5-10 results for most RAG pipelines.
- Use metadata filtering to narrow results before semantic search to reduce noise.
- Choose `cosine` distance for normalized embeddings (OpenAI, Cohere) and `l2` for unnormalized.
