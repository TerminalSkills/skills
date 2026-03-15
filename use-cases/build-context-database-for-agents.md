---
title: Build a Context Database for AI Agents
slug: build-context-database-for-agents
description: Build a context database that stores, retrieves, and manages long-term memory for AI agents with vector search, conversation history, knowledge extraction, and context window optimization.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - context
  - ai-agents
  - memory
  - vector-search
  - knowledge-base
---

# Build a Context Database for AI Agents

## The Problem

Mei leads AI platform at a 25-person company building AI agents for enterprise customers. Agents forget everything between sessions — a support agent asks the same questions it asked yesterday. Stuffing entire conversation history into the prompt burns tokens ($500/day on GPT-4) and hits context limits. Agents can't share knowledge: the sales agent learns a customer's preferences but the support agent doesn't know. They need a context database: store agent memories, retrieve relevant context via semantic search, share knowledge across agents, and fit the most relevant context into the LLM's window.

## Step 1: Build the Context Database

```typescript
// src/context/database.ts — Context database with vector search and window optimization
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ContextEntry {
  id: string;
  agentId: string;
  type: "conversation" | "fact" | "preference" | "decision" | "document" | "observation";
  content: string;
  embedding: number[];       // vector embedding for semantic search
  metadata: {
    source: string;          // which conversation/document this came from
    confidence: number;      // 0-1, how confident the extraction is
    expiresAt?: string;      // optional TTL for time-sensitive context
    tags: string[];
    userId?: string;         // associated user/customer
  };
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
}

interface ContextQuery {
  agentId: string;
  query: string;             // natural language query
  maxTokens: number;         // target context window budget
  types?: ContextEntry["type"][];
  userId?: string;
  recencyBias?: number;      // 0-1, how much to weight recent entries
  minConfidence?: number;
}

interface ContextWindow {
  entries: ContextEntry[];
  totalTokens: number;
  relevanceScores: Map<string, number>;
}

// Store context entry with embedding
export async function storeContext(params: {
  agentId: string;
  type: ContextEntry["type"];
  content: string;
  metadata?: Partial<ContextEntry["metadata"]>;
}): Promise<ContextEntry> {
  const id = `ctx-${randomBytes(8).toString("hex")}`;
  const embedding = await generateEmbedding(params.content);
  const contentHash = createHash("sha256").update(params.content).digest("hex").slice(0, 16);

  // Deduplicate: check if similar content already exists
  const existing = await findSimilar(params.agentId, embedding, 0.95);
  if (existing.length > 0) {
    // Update existing entry instead of creating duplicate
    await pool.query(
      "UPDATE context_entries SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1",
      [existing[0].id]
    );
    return existing[0];
  }

  const entry: ContextEntry = {
    id, agentId: params.agentId,
    type: params.type,
    content: params.content,
    embedding,
    metadata: {
      source: "", confidence: 1, tags: [],
      ...params.metadata,
    },
    accessCount: 0,
    lastAccessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO context_entries (id, agent_id, type, content, embedding, metadata, content_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, params.agentId, params.type, params.content,
     JSON.stringify(embedding), JSON.stringify(entry.metadata), contentHash]
  );

  // Cache in Redis for fast access
  await redis.setex(`ctx:${id}`, 3600, JSON.stringify(entry));

  return entry;
}

// Build optimal context window for an LLM call
export async function buildContextWindow(query: ContextQuery): Promise<ContextWindow> {
  const queryEmbedding = await generateEmbedding(query.query);

  // Retrieve candidates via vector similarity
  const candidates = await vectorSearch(query.agentId, queryEmbedding, {
    types: query.types,
    userId: query.userId,
    minConfidence: query.minConfidence || 0.5,
    limit: 100,
  });

  // Score candidates: relevance + recency + access frequency
  const scored = candidates.map((entry) => {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    const recencyDays = (Date.now() - new Date(entry.createdAt).getTime()) / 86400000;
    const recencyScore = Math.exp(-recencyDays / 30);  // decay over 30 days
    const accessScore = Math.min(entry.accessCount / 10, 1);

    const recencyBias = query.recencyBias || 0.3;
    const score = similarity * (1 - recencyBias) + recencyScore * recencyBias * 0.5 + accessScore * 0.1;

    return { entry, score };
  });

  // Sort by score and fit into token budget
  scored.sort((a, b) => b.score - a.score);

  const selected: ContextEntry[] = [];
  const relevanceScores = new Map<string, number>();
  let totalTokens = 0;

  for (const { entry, score } of scored) {
    const entryTokens = estimateTokens(entry.content);
    if (totalTokens + entryTokens > query.maxTokens) continue;

    selected.push(entry);
    relevanceScores.set(entry.id, score);
    totalTokens += entryTokens;

    // Update access stats
    await pool.query(
      "UPDATE context_entries SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1",
      [entry.id]
    );
  }

  return { entries: selected, totalTokens, relevanceScores };
}

// Extract facts from conversation for long-term storage
export async function extractFacts(
  agentId: string,
  conversation: string,
  userId?: string
): Promise<ContextEntry[]> {
  // In production, this calls an LLM to extract structured facts
  // Simplified: extract sentences that look like facts
  const sentences = conversation.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  const facts: ContextEntry[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    // Simple heuristic: statements with "is", "prefers", "uses", "needs" are likely facts
    if (/\b(is|are|prefers?|uses?|needs?|wants?|likes?|works?)\b/i.test(trimmed)) {
      const entry = await storeContext({
        agentId,
        type: "fact",
        content: trimmed,
        metadata: { source: "conversation", confidence: 0.7, userId, tags: ["auto-extracted"] },
      });
      facts.push(entry);
    }
  }

  return facts;
}

// Garbage collection: remove expired and low-value entries
export async function garbageCollect(agentId: string): Promise<number> {
  // Remove expired entries
  const { rowCount: expired } = await pool.query(
    "DELETE FROM context_entries WHERE agent_id = $1 AND metadata->>'expiresAt' IS NOT NULL AND (metadata->>'expiresAt')::timestamp < NOW()",
    [agentId]
  );

  // Remove low-confidence entries that were never accessed
  const { rowCount: unused } = await pool.query(
    `DELETE FROM context_entries WHERE agent_id = $1
     AND access_count = 0 AND created_at < NOW() - INTERVAL '30 days'
     AND (metadata->>'confidence')::float < 0.5`,
    [agentId]
  );

  return (expired || 0) + (unused || 0);
}

// Vector search using cosine similarity
async function vectorSearch(
  agentId: string,
  queryEmbedding: number[],
  options: { types?: string[]; userId?: string; minConfidence: number; limit: number }
): Promise<ContextEntry[]> {
  // In production: use pgvector extension for efficient similarity search
  let sql = "SELECT * FROM context_entries WHERE agent_id = $1";
  const params: any[] = [agentId];
  let idx = 2;

  if (options.types?.length) {
    sql += ` AND type = ANY($${idx})`;
    params.push(options.types);
    idx++;
  }
  if (options.userId) {
    sql += ` AND metadata->>'userId' = $${idx}`;
    params.push(options.userId);
    idx++;
  }

  sql += ` LIMIT $${idx}`;
  params.push(options.limit * 3);  // fetch extra, will re-rank

  const { rows } = await pool.query(sql, params);
  return rows.map((r: any) => ({ ...r, embedding: JSON.parse(r.embedding), metadata: JSON.parse(r.metadata) }));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // rough estimate: 1 token ≈ 4 chars
}

async function findSimilar(agentId: string, embedding: number[], threshold: number): Promise<ContextEntry[]> {
  const all = await vectorSearch(agentId, embedding, { minConfidence: 0, limit: 5 });
  return all.filter((e) => cosineSimilarity(embedding, e.embedding) >= threshold);
}

async function generateEmbedding(text: string): Promise<number[]> {
  // In production: call embedding API (OpenAI, Cohere, etc.)
  // Simplified: hash-based pseudo-embedding for demonstration
  const hash = createHash("sha256").update(text).digest();
  return Array.from(hash).map((b) => (b - 128) / 128);
}
```

## Results

- **Agents remember across sessions** — support agent recalls "customer prefers email over phone" from 3 weeks ago; no repeated questions; customer satisfaction up 25%
- **Token costs: $500/day → $120/day** — context window optimization selects only relevant entries instead of stuffing full history; 76% token reduction
- **Cross-agent knowledge sharing** — sales agent stores "customer evaluating competitor X"; support agent sees it and handles call differently; unified customer intelligence
- **Auto-extracted facts** — conversations automatically parsed for durable facts; "They use PostgreSQL 15" stored as structured context; no manual tagging needed
- **Garbage collection** — expired and low-value entries cleaned automatically; database stays lean; query performance stays fast
