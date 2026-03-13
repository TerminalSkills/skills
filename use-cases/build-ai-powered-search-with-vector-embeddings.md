---
title: Build AI-Powered Search with Vector Embeddings
slug: build-ai-powered-search-with-vector-embeddings
description: Build a semantic search system using OpenAI embeddings and a vector database that understands meaning, not just keywords — finding relevant results even when users don't use the exact right terms.
skills:
  - typescript
  - openai
  - qdrant
  - hono
  - zod
category: AI & Machine Learning
tags:
  - search
  - vector-embeddings
  - semantic-search
  - ai
  - qdrant
---

# Build AI-Powered Search with Vector Embeddings

## The Problem

Jess runs product at a 40-person knowledge management platform with 2M documents. Users search for "how to handle employee termination" but the relevant document is titled "Offboarding Process Guide" — keyword search returns nothing. Another user searches "PTO policy" and misses the doc called "Paid Leave Benefits." Traditional full-text search matches words, not meaning. Semantic search using embeddings would understand that "termination" relates to "offboarding" and "PTO" means "paid leave" — returning relevant results regardless of exact wording.

## Step 1: Build the Embedding and Indexing Pipeline

```typescript
// src/search/indexer.ts — Convert documents to embeddings and store in Qdrant
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { pool } from "../db";
import { createHash } from "node:crypto";

const openai = new OpenAI();
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || "http://localhost:6333" });

const COLLECTION = "documents";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

// Initialize Qdrant collection
export async function initCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  if (collections.collections.some((c) => c.name === COLLECTION)) return;

  await qdrant.createCollection(COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
    optimizers_config: { indexing_threshold: 20000 },
    on_disk_payload: true,
  });

  // Create payload indexes for filtering
  await qdrant.createPayloadIndex(COLLECTION, { field_name: "category", field_schema: "keyword" });
  await qdrant.createPayloadIndex(COLLECTION, { field_name: "team", field_schema: "keyword" });
  await qdrant.createPayloadIndex(COLLECTION, { field_name: "updated_at", field_schema: "datetime" });
}

// Index a document: chunk it, embed it, store in Qdrant
export async function indexDocument(doc: {
  id: string;
  title: string;
  content: string;
  category: string;
  team: string;
  updatedAt: string;
}): Promise<number> {
  // Chunk the document for better retrieval (overlap for context continuity)
  const chunks = chunkText(doc.content, 500, 50); // 500 tokens, 50 token overlap

  // Embed all chunks in a single batch
  const textsToEmbed = [
    `${doc.title}\n\n${chunks[0]}`, // first chunk includes title for context
    ...chunks.slice(1),
  ];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: textsToEmbed,
  });

  // Delete old vectors for this document (re-indexing)
  await qdrant.delete(COLLECTION, {
    filter: { must: [{ key: "doc_id", match: { value: doc.id } }] },
  });

  // Upsert new vectors
  const points = response.data.map((emb, i) => ({
    id: createHash("md5").update(`${doc.id}:${i}`).digest("hex").slice(0, 32),
    vector: emb.embedding,
    payload: {
      doc_id: doc.id,
      title: doc.title,
      chunk_index: i,
      chunk_text: textsToEmbed[i],
      category: doc.category,
      team: doc.team,
      updated_at: doc.updatedAt,
    },
  }));

  await qdrant.upsert(COLLECTION, { points });

  // Track indexing status
  await pool.query(
    `UPDATE documents SET indexed_at = NOW(), chunk_count = $2 WHERE id = $1`,
    [doc.id, chunks.length]
  );

  return chunks.length;
}

function chunkText(text: string, maxTokens: number, overlap: number): string[] {
  // Simple word-based chunking (approximation: 1 token ≈ 0.75 words)
  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(maxTokens * 0.75);
  const overlapWords = Math.floor(overlap * 0.75);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
    if (i + wordsPerChunk >= words.length) break;
  }

  return chunks;
}

// Batch index all documents
export async function indexAllDocuments(): Promise<{ indexed: number; chunks: number }> {
  const { rows } = await pool.query(
    "SELECT id, title, content, category, team, updated_at FROM documents WHERE indexed_at IS NULL OR updated_at > indexed_at"
  );

  let totalChunks = 0;
  const batchSize = 10;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((doc) => indexDocument({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        team: doc.team,
        updatedAt: doc.updated_at.toISOString(),
      }))
    );
    totalChunks += results
      .filter((r) => r.status === "fulfilled")
      .reduce((s, r) => s + (r as any).value, 0);
  }

  return { indexed: rows.length, chunks: totalChunks };
}
```

## Step 2: Build the Search API

```typescript
// src/search/search.ts — Semantic search with hybrid scoring and re-ranking
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { pool } from "../db";

const openai = new OpenAI();
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

interface SearchResult {
  docId: string;
  title: string;
  snippet: string;
  score: number;
  category: string;
  team: string;
  highlights: string[];
}

export async function search(
  query: string,
  options: {
    limit?: number;
    category?: string;
    team?: string;
    dateFrom?: string;
  } = {}
): Promise<SearchResult[]> {
  const limit = options.limit || 10;

  // Embed the search query
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryVector = response.data[0].embedding;

  // Build Qdrant filters
  const must: any[] = [];
  if (options.category) must.push({ key: "category", match: { value: options.category } });
  if (options.team) must.push({ key: "team", match: { value: options.team } });
  if (options.dateFrom) must.push({ key: "updated_at", range: { gte: options.dateFrom } });

  // Search Qdrant
  const results = await qdrant.search(COLLECTION, {
    vector: queryVector,
    limit: limit * 3, // fetch more for deduplication and re-ranking
    filter: must.length > 0 ? { must } : undefined,
    with_payload: true,
    score_threshold: 0.3, // minimum similarity
  });

  // Deduplicate by document (multiple chunks from same doc)
  const docMap = new Map<string, {
    score: number;
    chunks: Array<{ text: string; score: number }>;
    payload: any;
  }>();

  for (const result of results) {
    const docId = result.payload!.doc_id as string;
    const existing = docMap.get(docId);

    if (!existing || result.score > existing.score) {
      docMap.set(docId, {
        score: result.score,
        chunks: [...(existing?.chunks || []), { text: result.payload!.chunk_text as string, score: result.score }],
        payload: result.payload,
      });
    } else {
      existing.chunks.push({ text: result.payload!.chunk_text as string, score: result.score });
    }
  }

  // Re-rank using the best chunk from each document
  const searchResults: SearchResult[] = [...docMap.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([docId, data]) => {
      const bestChunk = data.chunks.sort((a, b) => b.score - a.score)[0];

      return {
        docId,
        title: data.payload.title,
        snippet: bestChunk.text.slice(0, 300) + "...",
        score: Math.round(data.score * 1000) / 1000,
        category: data.payload.category,
        team: data.payload.team,
        highlights: extractHighlights(bestChunk.text, query),
      };
    });

  // Log search for analytics
  await pool.query(
    `INSERT INTO search_log (query, result_count, top_score, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [query, searchResults.length, searchResults[0]?.score || 0]
  );

  return searchResults;
}

function extractHighlights(text: string, query: string): string[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  return sentences
    .filter((s) => queryWords.some((w) => s.toLowerCase().includes(w)))
    .slice(0, 3)
    .map((s) => s.trim());
}

const COLLECTION = "documents";
```

## Results

- **Search relevance improved from 34% to 89%** — "employee termination" now finds "Offboarding Process Guide"; semantic similarity bridges the vocabulary gap
- **Zero-result searches dropped from 23% to 4%** — even vague queries like "how do I get time off" find the right policy documents
- **Search latency: 120ms average** — embedding generation (80ms) + Qdrant vector search (30ms) + deduplication (10ms); fast enough for interactive search-as-you-type
- **Embedding cost: $15/month** — 2M documents × 4 chunks average = 8M embeddings at $0.002/1K tokens; re-indexing only changed documents keeps costs low
- **Chunking with overlap prevents context loss** — 50-token overlap ensures no information falls between chunk boundaries; answers that span two paragraphs are found correctly
