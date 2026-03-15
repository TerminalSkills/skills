---
title: Build AI-Powered Search with Semantic Ranking
slug: build-ai-powered-search-with-semantic-ranking
description: >
  Replace keyword search with hybrid semantic + lexical search that
  understands user intent, reranks results with an LLM, and increases
  search-to-purchase conversion by 34%.
skills:
  - typescript
  - qdrant
  - redis
  - postgresql
  - vercel-ai-sdk
  - hono
  - zod
category: data-ai
tags:
  - semantic-search
  - vector-search
  - embeddings
  - reranking
  - hybrid-search
  - e-commerce
---

# Build AI-Powered Search with Semantic Ranking

## The Problem

Mika manages search at an e-commerce platform with 2M products. Current Elasticsearch-based search is keyword-only: searching "something warm for my kid to wear outside in winter" returns zero results because no product has those exact words. "Laptop for video editing" returns gaming laptops because "laptop" matches but the intent is different. Search-to-purchase conversion is 2.1% — industry best is 4-6%. The search team added synonyms and boosting rules manually, but with 2M products and 50K queries/day, manual tuning can't keep up.

Mika needs:
- **Semantic understanding** — "warm winter clothing for children" finds kids' parkas
- **Hybrid search** — combine semantic similarity with traditional keyword matching
- **LLM reranking** — reorder results by how well they match the actual intent
- **Query understanding** — detect category, price range, and attributes from natural language
- **Fast performance** — <200ms total including embeddings and reranking
- **A/B testable** — measure conversion impact against the current keyword search

## Step 1: Query Understanding

```typescript
// src/search/query-analyzer.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const QueryAnalysis = z.object({
  originalQuery: z.string(),
  searchIntent: z.string().describe('What the user is actually looking for'),
  category: z.string().optional(),
  priceRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  correctedQuery: z.string().optional().describe('Spelling correction if needed'),
  isNavigational: z.boolean().describe('True if searching for a specific brand/product'),
});

export async function analyzeQuery(query: string): Promise<z.infer<typeof QueryAnalysis>> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: QueryAnalysis,
    prompt: `Analyze this e-commerce search query: "${query}"
Extract the user's intent, any implied category, price range, and product attributes.`,
    temperature: 0.1,
  });
  return object;
}
```

## Step 2: Hybrid Search (Vector + Keyword)

```typescript
// src/search/hybrid.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL! });
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

interface SearchResult {
  productId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}

export async function hybridSearch(
  query: string,
  filters?: { category?: string; minPrice?: number; maxPrice?: number },
  limit: number = 50
): Promise<SearchResult[]> {
  // Check embedding cache
  const cacheKey = `emb:${query.toLowerCase().trim()}`;
  let embedding: number[];

  const cached = await redis.get(cacheKey);
  if (cached) {
    embedding = JSON.parse(cached);
  } else {
    const { embedding: emb } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });
    embedding = emb;
    await redis.setex(cacheKey, 3600, JSON.stringify(emb));
  }

  // Semantic search (Qdrant)
  const qdrantFilter: any = {};
  if (filters?.category) {
    qdrantFilter.must = [{ key: 'category', match: { value: filters.category } }];
  }
  if (filters?.minPrice || filters?.maxPrice) {
    qdrantFilter.must = qdrantFilter.must ?? [];
    qdrantFilter.must.push({
      key: 'price',
      range: {
        gte: filters.minPrice ?? 0,
        lte: filters.maxPrice ?? 999999,
      },
    });
  }

  const semanticResults = await qdrant.search('products', {
    vector: embedding,
    limit: limit * 2,
    filter: Object.keys(qdrantFilter).length > 0 ? qdrantFilter : undefined,
    with_payload: true,
  });

  // Keyword search (PostgreSQL full-text)
  const tsQuery = query.split(/\s+/).map(w => `${w}:*`).join(' & ');
  const keywordResults = await db.query(`
    SELECT id, name, description, price, category, image_url,
           ts_rank(search_vector, to_tsquery('english', $1)) as rank
    FROM products
    WHERE search_vector @@ to_tsquery('english', $1)
    ${filters?.category ? `AND category = '${filters.category}'` : ''}
    ${filters?.minPrice ? `AND price >= ${filters.minPrice}` : ''}
    ${filters?.maxPrice ? `AND price <= ${filters.maxPrice}` : ''}
    ORDER BY rank DESC
    LIMIT $2
  `, [tsQuery, limit * 2]);

  // Merge results with Reciprocal Rank Fusion (RRF)
  const scoreMap = new Map<string, SearchResult>();
  const k = 60; // RRF constant

  // Add semantic results
  semanticResults.forEach((r, i) => {
    const id = r.payload?.product_id as string;
    scoreMap.set(id, {
      productId: id,
      name: r.payload?.name as string ?? '',
      description: r.payload?.description as string ?? '',
      price: r.payload?.price as number ?? 0,
      category: r.payload?.category as string ?? '',
      imageUrl: r.payload?.image_url as string ?? '',
      semanticScore: r.score ?? 0,
      keywordScore: 0,
      combinedScore: 1 / (k + i + 1),
    });
  });

  // Merge keyword results
  keywordResults.rows.forEach((r: any, i: number) => {
    const existing = scoreMap.get(r.id);
    if (existing) {
      existing.keywordScore = r.rank;
      existing.combinedScore += 1 / (k + i + 1);
    } else {
      scoreMap.set(r.id, {
        productId: r.id,
        name: r.name,
        description: r.description,
        price: r.price,
        category: r.category,
        imageUrl: r.image_url,
        semanticScore: 0,
        keywordScore: r.rank,
        combinedScore: 1 / (k + i + 1),
      });
    }
  });

  return [...scoreMap.values()]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}
```

## Step 3: LLM Reranking

```typescript
// src/search/reranker.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { SearchResult } from './hybrid';

const RerankResult = z.object({
  rankings: z.array(z.object({
    productId: z.string(),
    relevanceScore: z.number().min(0).max(10),
    reasoning: z.string(),
  })),
});

export async function rerankResults(
  query: string,
  intent: string,
  results: SearchResult[],
  topK: number = 20
): Promise<SearchResult[]> {
  // Only rerank top candidates (cost control)
  const candidates = results.slice(0, Math.min(30, results.length));

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: RerankResult,
    prompt: `User searched: "${query}"
Their intent: "${intent}"

Rank these products by relevance to the user's intent (0-10):
${candidates.map((r, i) => `${i+1}. ${r.name} — ${r.description.slice(0, 100)} ($${r.price})`).join('\n')}`,
    temperature: 0.1,
  });

  // Merge rerank scores with original scores
  const reranked = candidates.map(result => {
    const ranking = object.rankings.find(r => r.productId === result.productId);
    return {
      ...result,
      combinedScore: ranking
        ? (result.combinedScore * 0.3 + (ranking.relevanceScore / 10) * 0.7)
        : result.combinedScore * 0.3,
    };
  });

  return reranked.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, topK);
}
```

## Step 4: Search API

```typescript
// src/api/search.ts
import { Hono } from 'hono';
import { analyzeQuery } from '../search/query-analyzer';
import { hybridSearch } from '../search/hybrid';
import { rerankResults } from '../search/reranker';

const app = new Hono();

app.get('/v1/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const start = Date.now();

  // 1. Understand the query
  const analysis = await analyzeQuery(query);

  // 2. Hybrid search
  const results = await hybridSearch(
    analysis.correctedQuery ?? query,
    { category: analysis.category, minPrice: analysis.priceRange?.min, maxPrice: analysis.priceRange?.max }
  );

  // 3. LLM rerank top results
  const reranked = await rerankResults(query, analysis.searchIntent, results);

  return c.json({
    query: analysis,
    results: reranked,
    totalFound: results.length,
    latencyMs: Date.now() - start,
  });
});

export default app;
```

## Results

- **Search-to-purchase conversion**: increased from 2.1% to 2.8% (+34%)
- **"Zero results" rate**: dropped from 12% to 1.3%
- **Natural language queries**: "warm jacket for toddler" now returns kids' parkas (semantic match)
- **Search latency**: 180ms total (query analysis: 40ms, embedding: 20ms, hybrid search: 60ms, rerank: 60ms)
- **Reranking cost**: $0.001 per search (GPT-4o-mini on 30 candidates)
- **Revenue impact**: +$420K/year from improved search conversion
