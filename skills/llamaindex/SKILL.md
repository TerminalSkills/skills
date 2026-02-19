---
name: llamaindex
description: >-
  Assists with building RAG pipelines, knowledge assistants, and data-augmented LLM applications
  using LlamaIndex. Use when ingesting documents, configuring retrieval strategies, building
  query engines, or creating multi-step agents. Trigger words: llamaindex, rag, retrieval
  augmented generation, vector index, query engine, document loader, knowledge base.
license: Apache-2.0
compatibility: "Python 3.8+ or TypeScript/Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["llamaindex", "rag", "llm", "retrieval", "knowledge-base"]
---

# LlamaIndex

## Overview

LlamaIndex is a data framework for building RAG pipelines, knowledge assistants, and data-augmented LLM applications. It provides document loading from 300+ sources, flexible chunking strategies, multiple index types, hybrid retrieval with reranking, and production evaluation tools for question-answering systems.

## Instructions

- When ingesting documents, use `SimpleDirectoryReader` for local files or LlamaHub connectors for SaaS platforms, and run through an `IngestionPipeline` with metadata extractors (title, summary) and deduplication.
- When chunking, start with `SentenceSplitter` at 1024 tokens with 200 token overlap, use `MarkdownNodeParser` for structured documents, `CodeSplitter` for code, and adjust based on evaluation results.
- When indexing, use `VectorStoreIndex` as the default for most RAG, `KnowledgeGraphIndex` for entity relationships, and `DocumentSummaryIndex` for per-document summaries.
- When retrieving, implement hybrid retrieval (vector + keyword) for production, add a reranker (`CohereRerank`) after retrieval for improved relevance, and set `similarity_top_k` based on context window (3-5 for large models, 2-3 for smaller).
- When building query engines, use `RetrieverQueryEngine` for standard RAG, `CitationQueryEngine` for responses with source attribution, and `SubQuestionQueryEngine` for complex multi-part queries.
- When creating agents, use `ReActAgent` with tools wrapping query engines (`QueryEngineTool`), functions, and other agents for multi-step reasoning.
- When evaluating, use `CorrectnessEvaluator`, `FaithfulnessEvaluator`, and `RelevancyEvaluator` on a test set before deploying.

## Examples

### Example 1: Build a RAG pipeline over company documentation

**User request:** "Create a question-answering system over our internal docs"

**Actions:**
1. Load documents with `SimpleDirectoryReader` and extract metadata (title, summary)
2. Chunk with `SentenceSplitter` (1024 tokens, 200 overlap) through an `IngestionPipeline`
3. Create `VectorStoreIndex` with OpenAI embeddings and configure hybrid retrieval
4. Build `CitationQueryEngine` for answers with source references

**Output:** A RAG system that answers questions with citations from company documentation.

### Example 2: Create a multi-source research agent

**User request:** "Build an agent that can search across our docs, database, and web"

**Actions:**
1. Create separate query engines for each data source (vector index, SQL, web search)
2. Wrap each engine as a `QueryEngineTool` with descriptive tool descriptions
3. Build a `ReActAgent` that routes questions to the appropriate tool
4. Add `SubQuestionQueryEngine` for complex queries requiring multiple sources

**Output:** An intelligent agent that reasons about which data source to query and synthesizes multi-source answers.

## Guidelines

- Use `SentenceSplitter` with 1024 token chunks and 200 token overlap as the starting point.
- Always add metadata extractors to the ingestion pipeline; title and summary metadata improve retrieval significantly.
- Use hybrid retrieval (vector + keyword) for production; pure vector search misses exact term matches.
- Add a reranker (`CohereRerank`) after retrieval to improve result relevance for small cost.
- Evaluate with `CorrectnessEvaluator` on a test set before deploying; subjective quality assessment does not scale.
- Set `similarity_top_k` based on context window: 3-5 chunks for large models, 2-3 for smaller models.
- Use `IngestionPipeline` with deduplication for incremental data updates; do not re-embed unchanged documents.
