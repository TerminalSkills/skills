---
title: "Build a Semantic Cache Layer for LLM Calls"
description: "Cut LLM costs by 60-80% with a semantic caching layer that serves cached responses for similar (not just identical) prompts."
skills: [anthropic-sdk, redis]
difficulty: intermediate
time_estimate: "3 hours"
tags: [caching, redis, llm, cost-optimization, semantic-cache, anthropic, embeddings]
---

# Build a Semantic Cache Layer for LLM Calls

> **Persona:** You're a startup CTO. Your AI feature is great — so great it's costing $20k/month in API calls. You look at the logs and see thousands of near-identical queries: "summarize this document", "summarize this document.", "Summarize this document". A semantic cache would have served 70% of those from Redis.

Exact-match caching catches duplicates. Semantic caching catches *similar* prompts — which is where the real savings are.

## How It Works

```
Incoming request → normalize → check exact cache (Redis hash)
                                        ↓ miss
                            embed prompt → find similar cached
                                        ↓ miss (similarity < 0.95)
                            call LLM → store in both caches
                                        ↓ hit
                            return cached response instantly
```

## Setup

```bash
npm install @anthropic-ai/sdk ioredis cohere-ai
```

```typescript
// cache/types.ts
interface CacheEntry {
  prompt: string;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedAt: number;
  hitCount: number;
}
```

## Exact Match Cache

```typescript
// cache/exact.ts
import Redis from 'ioredis';
import crypto from 'crypto';

export class ExactCache {
  constructor(private redis: Redis) {}

  private normalize(prompt: string): string {
    return prompt
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private key(prompt: string, model: string): string {
    const normalized = this.normalize(prompt);
    const hash = crypto.createHash('sha256').update(`${model}:${normalized}`).digest('hex');
    return `llm:exact:${hash}`;
  }

  async get(prompt: string, model: string): Promise<CacheEntry | null> {
    const key = this.key(prompt, model);
    const data = await this.redis.get(key);
    if (!data) return null;

    const entry: CacheEntry = JSON.parse(data);
    // Track hit count
    await this.redis.hincrby(`llm:stats`, 'exact_hits', 1);
    await this.redis.hincrby(`llm:stats`, 'total_requests', 1);
    return entry;
  }

  async set(prompt: string, model: string, entry: CacheEntry, ttlSeconds = 3600 * 24) {
    const key = this.key(prompt, model);
    await this.redis.setex(key, ttlSeconds, JSON.stringify(entry));
  }
}
```

## Semantic Cache — Embed and Compare

```typescript
// cache/semantic.ts
import { CohereClient } from 'cohere-ai';

const SIMILARITY_THRESHOLD = 0.95;
const MAX_CANDIDATES = 50; // Max entries to compare against

export class SemanticCache {
  private cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

  constructor(private redis: Redis) {}

  private async embed(text: string): Promise<number[]> {
    const response = await this.cohere.embed({
      texts: [text],
      model: 'embed-english-v3.0',
      inputType: 'search_query',
    });
    return (response.embeddings as number[][])[0];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dot / (normA * normB);
  }

  async get(prompt: string, model: string): Promise<CacheEntry | null> {
    const queryEmbedding = await this.embed(prompt);

    // Scan recent cache entries (in production: use Redis vector search)
    const keys = await this.redis.keys(`llm:semantic:${model}:*`);
    const candidates = keys.slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) return null;

    const entries = await Promise.all(
      candidates.map(async key => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    let bestMatch: CacheEntry | null = null;
    let bestScore = 0;

    for (const entry of entries.filter(Boolean)) {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= SIMILARITY_THRESHOLD && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      await this.redis.hincrby('llm:stats', 'semantic_hits', 1);
      console.log(`Semantic cache hit (similarity: ${bestScore.toFixed(3)})`);
    }

    return bestMatch;
  }

  async set(prompt: string, model: string, entry: CacheEntry, ttlSeconds = 3600 * 24 * 7) {
    const embedding = await this.embed(prompt);
    const key = `llm:semantic:${model}:${Date.now()}`;
    await this.redis.setex(key, ttlSeconds, JSON.stringify({ ...entry, embedding }));
  }
}
```

## The Cached Claude Client

```typescript
// cache/client.ts
import Anthropic from '@anthropic-ai/sdk';

export class CachedAnthropicClient {
  private client = new Anthropic();
  private exact: ExactCache;
  private semantic: SemanticCache;

  constructor(redis: Redis) {
    this.exact = new ExactCache(redis);
    this.semantic = new SemanticCache(redis);
  }

  async messages(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
    const prompt = JSON.stringify(params.messages);
    const model = params.model;

    // 1. Try exact cache first (free, instant)
    const exactHit = await this.exact.get(prompt, model);
    if (exactHit) return this.mockResponse(exactHit);

    // 2. Try semantic cache (costs ~0.001 cents for embedding)
    const semanticHit = await this.semantic.get(prompt, model);
    if (semanticHit) return this.mockResponse(semanticHit);

    // 3. Cache miss — call the real API
    await this.redis.hincrby('llm:stats', 'api_calls', 1);
    const response = await this.client.messages.create(params);

    const entry: CacheEntry = {
      prompt,
      response: JSON.stringify(response.content),
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedAt: Date.now(),
      hitCount: 0,
    };

    // Store in both caches
    await Promise.all([
      this.exact.set(prompt, model, entry),
      this.semantic.set(prompt, model, entry),
    ]);

    return response;
  }

  private mockResponse(entry: CacheEntry): Anthropic.Message {
    return {
      content: JSON.parse(entry.response),
      model: entry.model,
      usage: { input_tokens: 0, output_tokens: 0 },
      // ... other required fields
    } as Anthropic.Message;
  }
}
```

## Analytics Dashboard

```typescript
// cache/analytics.ts
export async function getCacheStats(redis: Redis) {
  const stats = await redis.hgetall('llm:stats');
  const exactHits = parseInt(stats.exact_hits || '0');
  const semanticHits = parseInt(stats.semantic_hits || '0');
  const apiCalls = parseInt(stats.api_calls || '0');
  const total = exactHits + semanticHits + apiCalls;

  const avgTokensPerCall = 1500; // Your average
  const costPerMToken = 15; // Claude Sonnet input pricing

  const savedTokens = (exactHits + semanticHits) * avgTokensPerCall;
  const savedCost = (savedTokens / 1_000_000) * costPerMToken;

  console.log(`
📊 Cache Analytics
==================
Total requests:     ${total.toLocaleString()}
Exact cache hits:   ${exactHits} (${((exactHits/total)*100).toFixed(1)}%)
Semantic hits:      ${semanticHits} (${((semanticHits/total)*100).toFixed(1)}%)
API calls:          ${apiCalls} (${((apiCalls/total)*100).toFixed(1)}%)

💰 Cost Savings
===============
Tokens saved:       ${(savedTokens/1000).toFixed(0)}K
Estimated savings:  $${savedCost.toFixed(2)}
  `);
}
```

## Cache Invalidation

```typescript
// Invalidate when model updates or content changes
export async function bustCache(redis: Redis, options: {
  model?: string;
  prefix?: string;
  all?: boolean;
}) {
  if (options.all) {
    const keys = await redis.keys('llm:*');
    if (keys.length > 0) await redis.del(...keys);
    console.log(`Busted ${keys.length} cache entries`);
  } else if (options.model) {
    const keys = await redis.keys(`llm:semantic:${options.model}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }
}
```

## What to Build Next

- **Redis Stack vector search:** Replace linear scan with `FT.SEARCH` for scale
- **Per-user cache:** Namespace by user ID for personalized response caching
- **Cache warming:** Pre-populate common queries at startup
- **Dynamic TTL:** Longer TTL for factual queries, shorter for real-time data
