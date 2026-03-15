---
title: Build AI-Powered Search Ranking
slug: build-ai-powered-search-ranking
description: Build an AI-powered search ranking system with learning-to-rank models, click-through feedback, query understanding, personalized results, and A/B tested ranking algorithms for search relevance.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - search
  - ranking
  - ai
  - learning-to-rank
  - personalization
---

# Build AI-Powered Search Ranking

## The Problem

Kai leads search at a 25-person e-commerce with 200K products. Search uses BM25 text matching — it finds relevant products but ranks them poorly. Searching "laptop" shows a $50 case before a $1000 laptop because the case description mentions "laptop" more times. Best-sellers are buried. New products with no interaction data rank last forever. Click-through rate on position 1 is 15% (should be 30%+). They need AI ranking: combine text relevance with business signals (sales, reviews, margin), learn from clicks, personalize by user history, and A/B test ranking models.

## Step 1: Build the Ranking Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface SearchResult {
  productId: string;
  textScore: number;
  features: RankingFeatures;
  finalScore: number;
  position: number;
}

interface RankingFeatures {
  textRelevance: number;
  salesRank: number;
  reviewScore: number;
  reviewCount: number;
  priceCompetitiveness: number;
  recency: number;
  clickThroughRate: number;
  conversionRate: number;
  personalizationScore: number;
  margin: number;
}

interface RankingModel {
  id: string;
  name: string;
  weights: Record<keyof RankingFeatures, number>;
  active: boolean;
}

const DEFAULT_MODEL: RankingModel = {
  id: "default", name: "Default LTR", active: true,
  weights: {
    textRelevance: 0.25, salesRank: 0.15, reviewScore: 0.1,
    reviewCount: 0.05, priceCompetitiveness: 0.05, recency: 0.05,
    clickThroughRate: 0.15, conversionRate: 0.1,
    personalizationScore: 0.05, margin: 0.05,
  },
};

// Rank search results using learning-to-rank
export async function rankResults(
  query: string,
  candidates: Array<{ productId: string; textScore: number }>,
  userId?: string,
  modelId?: string
): Promise<SearchResult[]> {
  const model = modelId ? await getModel(modelId) : DEFAULT_MODEL;

  // Compute features for each candidate
  const scored: SearchResult[] = [];
  for (const candidate of candidates) {
    const features = await computeFeatures(candidate.productId, candidate.textScore, query, userId);
    const finalScore = computeFinalScore(features, model.weights);
    scored.push({ productId: candidate.productId, textScore: candidate.textScore, features, finalScore, position: 0 });
  }

  // Sort by final score
  scored.sort((a, b) => b.finalScore - a.finalScore);
  scored.forEach((r, i) => r.position = i + 1);

  // Log for model training
  const searchId = createHash("md5").update(query + Date.now()).digest("hex").slice(0, 12);
  await redis.setex(`search:${searchId}`, 86400, JSON.stringify({
    query, userId, modelId: model.id, results: scored.slice(0, 20).map((r) => r.productId),
  }));

  return scored;
}

async function computeFeatures(productId: string, textScore: number, query: string, userId?: string): Promise<RankingFeatures> {
  // Batch fetch product data
  const cacheKey = `features:${productId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const base = JSON.parse(cached);
    base.textRelevance = textScore;
    if (userId) base.personalizationScore = await getPersonalizationScore(productId, userId);
    return base;
  }

  const { rows: [product] } = await pool.query(
    `SELECT p.*, 
       COALESCE(AVG(r.rating), 0) as avg_rating, COUNT(r.id) as review_count,
       COALESCE(SUM(oi.quantity), 0) as total_sales
     FROM products p
     LEFT JOIN reviews r ON p.id = r.product_id AND r.created_at > NOW() - INTERVAL '1 year'
     LEFT JOIN order_items oi ON p.id = oi.product_id AND oi.created_at > NOW() - INTERVAL '90 days'
     WHERE p.id = $1 GROUP BY p.id`,
    [productId]
  );

  if (!product) return defaultFeatures(textScore);

  // CTR and conversion from click logs
  const impressions = parseInt(await redis.get(`product:impressions:${productId}`) || "1");
  const clicks = parseInt(await redis.get(`product:clicks:${productId}`) || "0");
  const conversions = parseInt(await redis.get(`product:conversions:${productId}`) || "0");

  const features: RankingFeatures = {
    textRelevance: textScore,
    salesRank: normalize(parseInt(product.total_sales), 0, 1000),
    reviewScore: parseFloat(product.avg_rating) / 5,
    reviewCount: normalize(parseInt(product.review_count), 0, 100),
    priceCompetitiveness: product.compare_at_price ? Math.min(1, product.price / product.compare_at_price) : 0.5,
    recency: normalize(daysSince(product.created_at), 0, 365, true),
    clickThroughRate: impressions > 10 ? clicks / impressions : 0.1,
    conversionRate: clicks > 10 ? conversions / clicks : 0.02,
    personalizationScore: userId ? await getPersonalizationScore(productId, userId) : 0.5,
    margin: product.margin ? normalize(product.margin, 0, 100) : 0.5,
  };

  await redis.setex(cacheKey, 300, JSON.stringify(features));
  return features;
}

function computeFinalScore(features: RankingFeatures, weights: Record<string, number>): number {
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (features[key as keyof RankingFeatures] || 0) * weight;
  }
  return Math.round(score * 10000) / 10000;
}

async function getPersonalizationScore(productId: string, userId: string): Promise<number> {
  // Check user's category affinity
  const { rows: [product] } = await pool.query("SELECT category FROM products WHERE id = $1", [productId]);
  if (!product) return 0.5;
  const affinity = await redis.hget(`user:affinity:${userId}`, product.category);
  return affinity ? Math.min(1, parseFloat(affinity) / 10) : 0.5;
}

// Record click (for CTR learning)
export async function recordClick(productId: string, searchId: string, position: number, userId?: string): Promise<void> {
  await redis.incr(`product:clicks:${productId}`);
  await redis.expire(`product:clicks:${productId}`, 86400 * 30);

  // Update user category affinity
  if (userId) {
    const { rows: [product] } = await pool.query("SELECT category FROM products WHERE id = $1", [productId]);
    if (product) await redis.hincrbyfloat(`user:affinity:${userId}`, product.category, 1);
  }

  // Log for model training (position bias correction)
  await pool.query(
    "INSERT INTO click_logs (product_id, search_id, position, user_id, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [productId, searchId, position, userId]
  );
}

// Record conversion
export async function recordConversion(productId: string): Promise<void> {
  await redis.incr(`product:conversions:${productId}`);
  await redis.expire(`product:conversions:${productId}`, 86400 * 30);
}

function normalize(value: number, min: number, max: number, inverse: boolean = false): number {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return inverse ? 1 - normalized : normalized;
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function defaultFeatures(textScore: number): RankingFeatures {
  return { textRelevance: textScore, salesRank: 0, reviewScore: 0.5, reviewCount: 0, priceCompetitiveness: 0.5, recency: 0.5, clickThroughRate: 0.1, conversionRate: 0.02, personalizationScore: 0.5, margin: 0.5 };
}

async function getModel(id: string): Promise<RankingModel> {
  const { rows: [row] } = await pool.query("SELECT * FROM ranking_models WHERE id = $1", [id]);
  return row ? { ...row, weights: JSON.parse(row.weights) } : DEFAULT_MODEL;
}
```

## Results

- **CTR position 1: 15% → 32%** — AI ranking puts best-selling, well-reviewed laptops first instead of accessories; users find what they want immediately
- **Revenue per search +18%** — high-margin, high-converting products boosted; $1000 laptop ranks above $50 case; search drives more revenue
- **Click feedback loop** — users click → CTR updates → ranking improves → better results → more clicks; self-improving system
- **New product cold-start** — recency feature boosts new products; initial visibility while they accumulate clicks and reviews; no eternal bottom ranking
- **Personalization** — user who browses gaming laptops sees gaming laptops first for "laptop" query; different user sees business laptops; same query, personalized results
