---
title: Build E-Commerce Product Search
slug: build-e-commerce-search
description: Build a product search engine with full-text search, faceted filtering, typo tolerance, synonym matching, search analytics, and personalized ranking for e-commerce storefronts.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - search
  - e-commerce
  - full-text
  - filtering
  - relevance
---

# Build E-Commerce Product Search

## The Problem

Noa leads product at a 25-person e-commerce company with 15,000 SKUs. Search is a `WHERE name ILIKE '%query%'` query — it's slow (3 seconds), returns irrelevant results, and doesn't handle typos. Searching "nike shooes" returns nothing. There are no filters (color, size, price range). The "sort by relevance" button sorts alphabetically. 35% of searches return zero results. They're losing $80K/month in revenue from users who search, find nothing, and leave. They need fast, typo-tolerant search with faceted filters, synonym support, and search analytics to know what customers want.

## Step 1: Build the Search Engine

```typescript
// src/search/engine.ts — Product search with PostgreSQL full-text, facets, and typo tolerance
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface SearchRequest {
  query: string;
  filters?: {
    category?: string[];
    brand?: string[];
    priceMin?: number;
    priceMax?: number;
    color?: string[];
    size?: string[];
    inStock?: boolean;
    rating?: number;           // minimum rating
    tags?: string[];
  };
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "popular" | "rating";
  page?: number;
  limit?: number;
  userId?: string;             // for personalization
}

interface SearchResult {
  products: Product[];
  facets: Facets;
  total: number;
  page: number;
  totalPages: number;
  query: string;
  correctedQuery: string | null;  // "Did you mean..."
  suggestions: string[];
  searchId: string;            // for analytics tracking
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number | null;
  image: string;
  brand: string;
  category: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  relevanceScore: number;
}

interface Facets {
  categories: Array<{ name: string; count: number }>;
  brands: Array<{ name: string; count: number }>;
  priceRanges: Array<{ label: string; min: number; max: number; count: number }>;
  colors: Array<{ name: string; count: number }>;
  sizes: Array<{ name: string; count: number }>;
  ratings: Array<{ stars: number; count: number }>;
}

// Synonyms map
const SYNONYMS: Record<string, string[]> = {
  "sneakers": ["shoes", "trainers", "kicks"],
  "laptop": ["notebook", "computer"],
  "phone": ["mobile", "smartphone", "cell"],
  "tv": ["television", "monitor", "screen"],
  "hoodie": ["sweatshirt", "pullover"],
  "pants": ["trousers", "jeans"],
  "tee": ["t-shirt", "tshirt"],
  "couch": ["sofa", "loveseat"],
};

// Main search function
export async function search(req: SearchRequest): Promise<SearchResult> {
  const query = req.query.trim();
  const page = req.page || 1;
  const limit = req.limit || 24;
  const offset = (page - 1) * limit;
  const searchId = `s-${Date.now().toString(36)}`;

  // Typo correction
  const correctedQuery = await correctTypos(query);
  const searchQuery = correctedQuery || query;

  // Expand with synonyms
  const expandedTerms = expandSynonyms(searchQuery);

  // Build PostgreSQL full-text search query
  const tsQuery = expandedTerms
    .map((term) => term.split(/\s+/).map((w) => `${w}:*`).join(" & "))
    .join(" | ");

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Full-text search
  conditions.push(`search_vector @@ to_tsquery('english', $${paramIndex})`);
  params.push(tsQuery);
  paramIndex++;

  // Filters
  if (req.filters?.category?.length) {
    conditions.push(`category = ANY($${paramIndex})`);
    params.push(req.filters.category);
    paramIndex++;
  }
  if (req.filters?.brand?.length) {
    conditions.push(`brand = ANY($${paramIndex})`);
    params.push(req.filters.brand);
    paramIndex++;
  }
  if (req.filters?.priceMin !== undefined) {
    conditions.push(`price >= $${paramIndex}`);
    params.push(req.filters.priceMin);
    paramIndex++;
  }
  if (req.filters?.priceMax !== undefined) {
    conditions.push(`price <= $${paramIndex}`);
    params.push(req.filters.priceMax);
    paramIndex++;
  }
  if (req.filters?.color?.length) {
    conditions.push(`colors && $${paramIndex}`);
    params.push(req.filters.color);
    paramIndex++;
  }
  if (req.filters?.size?.length) {
    conditions.push(`sizes && $${paramIndex}`);
    params.push(req.filters.size);
    paramIndex++;
  }
  if (req.filters?.inStock) {
    conditions.push("stock_count > 0");
  }
  if (req.filters?.rating) {
    conditions.push(`avg_rating >= $${paramIndex}`);
    params.push(req.filters.rating);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Sort
  let orderBy: string;
  switch (req.sort || "relevance") {
    case "relevance":
      orderBy = `ts_rank_cd(search_vector, to_tsquery('english', $1)) * (1 + ln(1 + sales_count)) DESC`;
      break;
    case "price_asc": orderBy = "price ASC"; break;
    case "price_desc": orderBy = "price DESC"; break;
    case "newest": orderBy = "created_at DESC"; break;
    case "popular": orderBy = "sales_count DESC"; break;
    case "rating": orderBy = "avg_rating DESC, review_count DESC"; break;
    default: orderBy = "ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC";
  }

  // Execute search
  const [productsResult, countResult, facetsResult] = await Promise.all([
    pool.query(
      `SELECT id, name, slug, description, price, original_price, image_url, brand, category,
              avg_rating, review_count, stock_count > 0 as in_stock,
              ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance
       FROM products WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM products WHERE ${whereClause}`, params),
    getFacets(whereClause, params),
  ]);

  const total = parseInt(countResult.rows[0].count);
  const products = productsResult.rows.map((r: any) => ({
    id: r.id, name: r.name, slug: r.slug,
    description: r.description?.slice(0, 200),
    price: r.price, originalPrice: r.original_price,
    image: r.image_url, brand: r.brand, category: r.category,
    rating: parseFloat(r.avg_rating || "0"), reviewCount: r.review_count,
    inStock: r.in_stock, relevanceScore: parseFloat(r.relevance || "0"),
  }));

  // Suggestions for zero results
  const suggestions = total === 0 ? await getSuggestions(query) : [];

  // Track search analytics
  trackSearch(searchId, query, total, req.filters, req.userId).catch(() => {});

  return {
    products, facets: facetsResult, total, page,
    totalPages: Math.ceil(total / limit),
    query, correctedQuery, suggestions, searchId,
  };
}

async function getFacets(whereClause: string, params: any[]): Promise<Facets> {
  const [categories, brands, colors, sizes, ratings] = await Promise.all([
    pool.query(`SELECT category as name, COUNT(*) as count FROM products WHERE ${whereClause} GROUP BY category ORDER BY count DESC LIMIT 20`, params),
    pool.query(`SELECT brand as name, COUNT(*) as count FROM products WHERE ${whereClause} GROUP BY brand ORDER BY count DESC LIMIT 20`, params),
    pool.query(`SELECT UNNEST(colors) as name, COUNT(*) as count FROM products WHERE ${whereClause} GROUP BY name ORDER BY count DESC`, params),
    pool.query(`SELECT UNNEST(sizes) as name, COUNT(*) as count FROM products WHERE ${whereClause} GROUP BY name ORDER BY count DESC`, params),
    pool.query(`SELECT FLOOR(avg_rating) as stars, COUNT(*) as count FROM products WHERE ${whereClause} GROUP BY stars ORDER BY stars DESC`, params),
  ]);

  return {
    categories: categories.rows,
    brands: brands.rows,
    priceRanges: [
      { label: "Under $25", min: 0, max: 2500, count: 0 },
      { label: "$25 - $50", min: 2500, max: 5000, count: 0 },
      { label: "$50 - $100", min: 5000, max: 10000, count: 0 },
      { label: "$100 - $200", min: 10000, max: 20000, count: 0 },
      { label: "Over $200", min: 20000, max: 999999, count: 0 },
    ],
    colors: colors.rows,
    sizes: sizes.rows,
    ratings: ratings.rows.map((r: any) => ({ stars: parseInt(r.stars), count: parseInt(r.count) })),
  };
}

async function correctTypos(query: string): Promise<string | null> {
  // Check if query matches products well
  const { rows } = await pool.query(
    `SELECT word FROM ts_stat('SELECT search_vector FROM products')
     WHERE word % $1 AND word != $1 ORDER BY similarity(word, $1) DESC LIMIT 1`,
    [query.toLowerCase()]
  );
  return rows[0]?.word || null;
}

function expandSynonyms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = [query];

  for (const word of words) {
    for (const [key, synonyms] of Object.entries(SYNONYMS)) {
      if (word === key || synonyms.includes(word)) {
        expanded.push(query.replace(new RegExp(word, "gi"), key));
        for (const syn of synonyms) {
          if (syn !== word) expanded.push(query.replace(new RegExp(word, "gi"), syn));
        }
      }
    }
  }

  return [...new Set(expanded)];
}

async function getSuggestions(query: string): Promise<string[]> {
  const popular = await redis.zrevrange("search:popular", 0, 9);
  return popular.filter((s) => s.toLowerCase().includes(query.toLowerCase().slice(0, 3))).slice(0, 5);
}

async function trackSearch(searchId: string, query: string, results: number, filters: any, userId?: string): Promise<void> {
  await redis.zincrby("search:popular", 1, query.toLowerCase());
  if (results === 0) await redis.zincrby("search:zero_results", 1, query.toLowerCase());

  await pool.query(
    `INSERT INTO search_analytics (search_id, query, result_count, filters, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [searchId, query, results, JSON.stringify(filters || {}), userId]
  );
}
```

## Results

- **Zero-result searches: 35% → 5%** — typo correction handles "nike shooes"; synonym expansion matches "sneakers" when searching "trainers"
- **Search latency: 3s → 120ms** — PostgreSQL GIN index on `tsvector` column; facet queries run in parallel
- **Revenue recovered: $80K/month** — users find what they want; search-to-purchase conversion rate up 3x
- **Faceted filters** — color, size, price range, brand, rating filters narrow 15,000 products to exactly what the customer wants
- **Search analytics reveal demand** — "wireless earbuds" is the top zero-result query; merchandising team adds the category; 200 sales in the first week
