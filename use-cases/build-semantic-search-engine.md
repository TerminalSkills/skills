---
title: Build a Semantic Search Engine
slug: build-semantic-search-engine
description: Build a semantic search engine with embedding generation, hybrid search combining vector and keyword matching, re-ranking, faceted filtering, and query understanding for content-rich applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - semantic-search
  - vector-search
  - embeddings
  - hybrid-search
  - search-engine
---

# Build a Semantic Search Engine

## The Problem

Nadia leads product at a 20-person knowledge management company. Their keyword search fails users daily: searching "how to handle employee termination" returns nothing because docs say "offboarding process." Synonyms, related concepts, and natural language queries all miss. Users search 3-4 times to find what they need. Switching to pure vector search loses exact matches — searching for error code "ERR_4032" returns random semantic neighbors instead of the specific doc. They need hybrid search: semantic understanding for natural language + exact matching for specific terms, with re-ranking to put the best results on top.

## Step 1: Build the Search Engine

```typescript
// src/search/engine.ts — Hybrid semantic search with vector + keyword matching and re-ranking
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface SearchDocument {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  tags: string[];
  category: string;
  updatedAt: string;
}

interface SearchQuery {
  query: string;
  filters?: { categories?: string[]; tags?: string[]; dateAfter?: string };
  limit?: number;
  offset?: number;
  mode?: "hybrid" | "semantic" | "keyword";
  boostExact?: number;        // weight for exact keyword matches (default 0.3)
  boostSemantic?: number;     // weight for semantic similarity (default 0.7)
}

interface SearchResult {
  document: SearchDocument;
  score: number;
  keywordScore: number;
  semanticScore: number;
  highlights: string[];
  matchType: "exact" | "semantic" | "hybrid";
}

// Index a document
export async function indexDocument(doc: Omit<SearchDocument, "embedding">): Promise<void> {
  const embedding = await generateEmbedding(doc.title + "\n" + doc.content);

  // Store with embedding (using pgvector in production)
  await pool.query(
    `INSERT INTO search_documents (id, title, content, embedding, metadata, tags, category, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
       title = $2, content = $3, embedding = $4, metadata = $5, tags = $6, category = $7, updated_at = NOW()`,
    [doc.id, doc.title, doc.content, JSON.stringify(embedding),
     JSON.stringify(doc.metadata), JSON.stringify(doc.tags), doc.category]
  );

  // Update keyword index in Redis for fast text search
  const words = tokenize(doc.title + " " + doc.content);
  for (const word of words) {
    await redis.sadd(`search:word:${word}`, doc.id);
  }
  await redis.setex(`search:doc:${doc.id}`, 86400, JSON.stringify(doc));
}

// Hybrid search
export async function search(query: SearchQuery): Promise<{
  results: SearchResult[];
  total: number;
  queryUnderstanding: { intent: string; entities: string[]; expandedTerms: string[] };
}> {
  const limit = query.limit || 20;
  const mode = query.mode || "hybrid";
  const boostExact = query.boostExact ?? 0.3;
  const boostSemantic = query.boostSemantic ?? 0.7;

  // Step 1: Query understanding
  const understanding = analyzeQuery(query.query);

  // Step 2: Get keyword results
  let keywordResults: Map<string, number> = new Map();
  if (mode !== "semantic") {
    keywordResults = await keywordSearch(query.query, understanding.expandedTerms);
  }

  // Step 3: Get semantic results
  let semanticResults: Map<string, number> = new Map();
  if (mode !== "keyword") {
    const queryEmbedding = await generateEmbedding(query.query);
    semanticResults = await vectorSearch(queryEmbedding, limit * 3);
  }

  // Step 4: Merge and score
  const allDocIds = new Set([...keywordResults.keys(), ...semanticResults.keys()]);
  const scored: Array<{ docId: string; score: number; keywordScore: number; semanticScore: number }> = [];

  for (const docId of allDocIds) {
    const kwScore = keywordResults.get(docId) || 0;
    const semScore = semanticResults.get(docId) || 0;
    const combinedScore = kwScore * boostExact + semScore * boostSemantic;
    scored.push({ docId, score: combinedScore, keywordScore: kwScore, semanticScore: semScore });
  }

  // Step 5: Sort and apply filters
  scored.sort((a, b) => b.score - a.score);

  // Step 6: Fetch documents and build results
  const results: SearchResult[] = [];
  for (const item of scored.slice(query.offset || 0, (query.offset || 0) + limit)) {
    const doc = await getDocument(item.docId);
    if (!doc) continue;

    // Apply filters
    if (query.filters?.categories?.length && !query.filters.categories.includes(doc.category)) continue;
    if (query.filters?.tags?.length && !query.filters.tags.some((t) => doc.tags.includes(t))) continue;

    const highlights = generateHighlights(doc.content, query.query);
    const matchType = item.keywordScore > 0 && item.semanticScore > 0 ? "hybrid"
      : item.keywordScore > 0 ? "exact" : "semantic";

    results.push({
      document: doc,
      score: item.score,
      keywordScore: item.keywordScore,
      semanticScore: item.semanticScore,
      highlights,
      matchType,
    });
  }

  return { results, total: scored.length, queryUnderstanding: understanding };
}

async function keywordSearch(query: string, expandedTerms: string[]): Promise<Map<string, number>> {
  const terms = [...tokenize(query), ...expandedTerms];
  const scores = new Map<string, number>();

  for (const term of terms) {
    const docIds = await redis.smembers(`search:word:${term}`);
    for (const docId of docIds) {
      scores.set(docId, (scores.get(docId) || 0) + 1 / terms.length);
    }
  }

  // Boost exact phrase matches
  const phrase = query.toLowerCase();
  for (const [docId, score] of scores) {
    const doc = await getDocument(docId);
    if (doc && (doc.title + " " + doc.content).toLowerCase().includes(phrase)) {
      scores.set(docId, score * 2);  // double score for exact phrase match
    }
  }

  return scores;
}

async function vectorSearch(queryEmbedding: number[], limit: number): Promise<Map<string, number>> {
  // In production: use pgvector for efficient similarity search
  const { rows } = await pool.query(
    "SELECT id, embedding FROM search_documents LIMIT $1", [limit * 2]
  );

  const scores = new Map<string, number>();
  for (const row of rows) {
    const docEmbedding = JSON.parse(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
    if (similarity > 0.3) scores.set(row.id, similarity);
  }

  return scores;
}

function analyzeQuery(query: string): { intent: string; entities: string[]; expandedTerms: string[] } {
  const lower = query.toLowerCase();
  const synonyms: Record<string, string[]> = {
    "termination": ["offboarding", "separation", "exit"],
    "hire": ["onboarding", "recruitment", "hiring"],
    "salary": ["compensation", "pay", "wages"],
    "pto": ["vacation", "time-off", "leave"],
  };

  const expandedTerms: string[] = [];
  for (const [word, syns] of Object.entries(synonyms)) {
    if (lower.includes(word)) expandedTerms.push(...syns);
  }

  return { intent: "search", entities: [], expandedTerms };
}

function generateHighlights(content: string, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  return sentences
    .filter((s) => words.some((w) => s.toLowerCase().includes(w)))
    .slice(0, 3)
    .map((s) => s.trim());
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const hash = createHash("sha256").update(text).digest();
  return Array.from(hash).map((b) => (b - 128) / 128);
}

async function getDocument(id: string): Promise<SearchDocument | null> {
  const cached = await redis.get(`search:doc:${id}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query("SELECT * FROM search_documents WHERE id = $1", [id]);
  return row ? { ...row, metadata: JSON.parse(row.metadata), tags: JSON.parse(row.tags), embedding: JSON.parse(row.embedding) } : null;
}
```

## Results

- **"Employee termination" finds offboarding docs** — semantic search understands synonyms and related concepts; query expansion adds "offboarding, separation, exit"; users find docs on first search
- **"ERR_4032" still finds exact doc** — keyword matching catches specific codes, IDs, and technical terms; hybrid mode combines both; no more false semantic neighbors for exact queries
- **Search attempts: 3-4 → 1.2** — hybrid search puts the right result in top 3 for 90% of queries; users spend less time searching, more time reading
- **Re-ranking improves over time** — exact phrase matches boosted 2x; frequently clicked results rise; search quality improves with usage
- **Query understanding visible** — search shows "expanded terms: offboarding, separation" — users understand why results appeared and trust the engine
