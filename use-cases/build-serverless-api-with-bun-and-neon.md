---
title: Build a Serverless API with Bun and Neon
slug: build-serverless-api-with-bun-and-neon
description: Build a high-performance REST API using Bun's native HTTP server and Neon's serverless PostgreSQL, with Upstash Redis for caching and rate limiting — achieving 50,000 requests/second on a $5/month infrastructure.
skills:
  - bun
  - neon
  - upstash
  - hono
category: Backend Development
tags:
  - serverless
  - api
  - postgresql
  - redis
  - performance
---

# Build a Serverless API with Bun and Neon

Sasha runs a side project — a public API that serves historical stock price data. It started as a hobby but now handles 2 million requests per day from 800 API keys. The Node.js + Express + Supabase stack on Railway costs $45/month and struggles with cold starts and connection limits during market open (9:30 AM ET spike). She wants an architecture that handles traffic spikes without pre-provisioning, costs under $10/month, and lets her deploy in seconds.

## Step 1 — Set Up the Bun Server with Hono Routing

Bun's native HTTP server handles 100K+ requests per second — orders of magnitude faster than Express on Node.js. Hono adds routing and middleware without sacrificing that performance.

```typescript
// src/index.ts — Application entry point.
// Bun.serve() creates the HTTP server. Hono handles routing and middleware.
// No Express, no Fastify, no http.createServer — just Bun's native server.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { stockRoutes } from "./routes/stocks";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", cors({ origin: "*" }));  // Public API — allow all origins

// Health check (no auth needed)
app.get("/health", (c) => c.json({ status: "ok", runtime: "bun" }));

// Protected routes: auth → rate limit → handler
app.use("/api/*", authMiddleware);
app.use("/api/*", rateLimitMiddleware);
app.route("/api/stocks", stockRoutes);

// Start server with Bun's native HTTP handler
const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  // Bun handles keep-alive, compression, and connection pooling internally
});

console.log(`Server running at http://localhost:${server.port}`);
```

No `npm start`, no `ts-node`, no build step. `bun run src/index.ts` starts the server directly with native TypeScript support.

## Step 2 — Connect to Neon with Connection Pooling

Neon's serverless driver works over HTTP, which means no TCP connection pool to manage and no "too many connections" errors during traffic spikes. For long-running servers like this one, the standard `pg` driver with Neon's built-in PgBouncer pooler is faster.

```typescript
// src/db/client.ts — Database client with connection pooling.
// Uses Neon's pooled endpoint (PgBouncer) to handle connection limits.
// The -pooler suffix in the hostname routes through the connection pooler.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Neon pooled connection string (PgBouncer endpoint)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // postgres://user:pass@ep-xxx-pooler.region.neon.tech/dbname
  max: 10,           // Max connections in the local pool (PgBouncer handles the rest)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

// Graceful shutdown: close pool when process exits
process.on("SIGTERM", () => pool.end());
```

```typescript
// src/db/schema.ts — Drizzle ORM schema for stock data.
// Drizzle generates type-safe queries from this schema — no raw SQL strings,
// no runtime ORM overhead. Queries compile to plain SQL at build time.

import {
  pgTable,
  text,
  real,
  bigint,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const stocks = pgTable("stocks", {
  id: text("id").primaryKey(),          // "AAPL", "GOOGL", etc.
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),  // "NASDAQ", "NYSE"
  sector: text("sector"),
  marketCap: bigint("market_cap", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const prices = pgTable(
  "prices",
  {
    stockId: text("stock_id").notNull().references(() => stocks.id),
    date: date("date").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    adjustedClose: real("adjusted_close").notNull(),
    volume: bigint("volume", { mode: "number" }).notNull(),
  },
  (table) => ({
    // Composite unique index: one row per stock per day
    stockDateIdx: uniqueIndex("stock_date_idx").on(table.stockId, table.date),
    // Index for date range queries (most common access pattern)
    dateIdx: index("date_idx").on(table.date),
  })
);

export const apiKeys = pgTable("api_keys", {
  key: text("key").primaryKey(),             // hashed API key
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("free"),  // "free", "pro", "enterprise"
  requestsToday: bigint("requests_today", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});
```

## Step 3 — Add Caching with Upstash Redis

Stock prices are immutable after market close — yesterday's AAPL closing price will never change. Caching these responses in Redis eliminates database queries for 80% of requests.

```typescript
// src/middleware/cache.ts — Response caching with Upstash Redis.
// Historical data gets long TTLs (24h), intraday data gets short TTLs (60s).
// Cache keys include the full query to avoid serving wrong data.

import { Redis } from "@upstash/redis";
import type { Context, Next } from "hono";

const redis = Redis.fromEnv();  // Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

export async function cacheMiddleware(c: Context, next: Next) {
  // Only cache GET requests
  if (c.req.method !== "GET") return next();

  // Build cache key from path + query params (sorted for consistency)
  const url = new URL(c.req.url);
  const params = new URLSearchParams([...url.searchParams].sort());
  const cacheKey = `cache:${url.pathname}:${params.toString()}`;

  // Check cache
  const cached = await redis.get<string>(cacheKey);
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json(JSON.parse(cached));
  }

  // Cache miss — execute handler and cache the response
  await next();

  // Only cache successful responses
  if (c.res.status === 200) {
    const body = await c.res.clone().text();
    const ttl = determineTTL(url.pathname, params);
    await redis.set(cacheKey, body, { ex: ttl });
    c.header("X-Cache", "MISS");
  }
}

function determineTTL(path: string, params: URLSearchParams): number {
  // Historical data: cache for 24 hours (it never changes)
  const endDate = params.get("end");
  if (endDate) {
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end < today) return 86400;  // 24 hours for completed date ranges
  }

  // Intraday/current data: short cache
  if (path.includes("/quote")) return 60;      // 1 minute for live quotes
  if (path.includes("/prices")) return 300;    // 5 minutes for recent prices

  return 3600;  // 1 hour default
}
```

## Step 4 — Implement Rate Limiting with Upstash

Different API tiers get different rate limits. Upstash's rate limiter uses a sliding window algorithm that's accurate across edge locations.

```typescript
// src/middleware/rate-limit.ts — Tiered rate limiting with Upstash.
// Free: 100 req/min. Pro: 1,000 req/min. Enterprise: 10,000 req/min.
// The sliding window algorithm prevents burst abuse at window boundaries.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Context, Next } from "hono";

const redis = Redis.fromEnv();

// Create rate limiters for each tier
const limiters = {
  free: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"),    // 100 per minute
    prefix: "rl:free",
    analytics: true,            // Track rate limit metrics
  }),
  pro: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),
    prefix: "rl:pro",
    analytics: true,
  }),
  enterprise: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10000, "1 m"),
    prefix: "rl:enterprise",
    analytics: true,
  }),
};

export async function rateLimitMiddleware(c: Context, next: Next) {
  const apiKey = c.get("apiKey");    // Set by authMiddleware
  const tier = c.get("tier") as keyof typeof limiters;

  const limiter = limiters[tier] || limiters.free;
  const { success, limit, remaining, reset } = await limiter.limit(apiKey);

  // Always set rate limit headers (even on success)
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(reset));

  if (!success) {
    return c.json(
      {
        error: "Rate limit exceeded",
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
        upgrade: tier === "free"
          ? "Upgrade to Pro for 10x higher limits: https://api.example.com/pricing"
          : undefined,
      },
      429
    );
  }

  return next();
}
```

## Step 5 — Build the Stock Price Routes

```typescript
// src/routes/stocks.ts — Stock price API endpoints.
// Drizzle ORM generates type-safe SQL. Bun handles JSON serialization
// faster than Node.js (using JavaScriptCore instead of V8).

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/client";
import { stocks, prices } from "../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { cacheMiddleware } from "../middleware/cache";

export const stockRoutes = new Hono();

// Apply caching to all stock routes
stockRoutes.use("*", cacheMiddleware);

// GET /api/stocks/:symbol/prices?start=2024-01-01&end=2024-12-31
stockRoutes.get(
  "/:symbol/prices",
  zValidator("param", z.object({
    symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  })),
  zValidator("query", z.object({
    start: z.string().date(),                        // ISO date format
    end: z.string().date().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
  })),
  async (c) => {
    const { symbol } = c.req.valid("param");
    const { start, end, limit } = c.req.valid("query");

    const conditions = [
      eq(prices.stockId, symbol),
      gte(prices.date, start),
    ];
    if (end) conditions.push(lte(prices.date, end));

    const result = await db
      .select({
        date: prices.date,
        open: prices.open,
        high: prices.high,
        low: prices.low,
        close: prices.close,
        adjustedClose: prices.adjustedClose,
        volume: prices.volume,
      })
      .from(prices)
      .where(and(...conditions))
      .orderBy(desc(prices.date))
      .limit(limit);

    if (result.length === 0) {
      return c.json({ error: `No data found for ${symbol}` }, 404);
    }

    return c.json({
      symbol,
      count: result.length,
      prices: result,
    });
  }
);

// GET /api/stocks/:symbol — Stock metadata
stockRoutes.get(
  "/:symbol",
  zValidator("param", z.object({
    symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  })),
  async (c) => {
    const { symbol } = c.req.valid("param");

    const stock = await db
      .select()
      .from(stocks)
      .where(eq(stocks.id, symbol))
      .limit(1);

    if (stock.length === 0) {
      return c.json({ error: `Stock ${symbol} not found` }, 404);
    }

    return c.json({ stock: stock[0] });
  }
);

// GET /api/stocks — List all available stocks
stockRoutes.get(
  "/",
  zValidator("query", z.object({
    exchange: z.enum(["NASDAQ", "NYSE", "AMEX"]).optional(),
    sector: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })),
  async (c) => {
    const { exchange, sector, limit, offset } = c.req.valid("query");

    const conditions = [];
    if (exchange) conditions.push(eq(stocks.exchange, exchange));
    if (sector) conditions.push(eq(stocks.sector, sector));

    const result = await db
      .select()
      .from(stocks)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset);

    return c.json({ stocks: result, count: result.length });
  }
);
```

## Results

Sasha deployed the Bun + Neon + Upstash stack on a $5/month Hetzner VPS and ran load tests before switching DNS:

- **Throughput: 52,000 requests/second** on a single Bun process (compared to 3,200 req/s with Express on Node.js). The 16x improvement comes from Bun's native HTTP server and faster JSON serialization.
- **P99 latency: 12ms** for cached requests (Redis hit), 45ms for database queries. Down from 180ms average on the old stack.
- **Cold start: 0ms** — Bun is a long-running server, not a serverless function. No cold starts at all. Neon's database wakes in ~150ms after idle periods, but the connection pool keeps one connection warm.
- **Monthly cost: $45 → $8** — $5 VPS + $0 Neon free tier (0.5 GB storage, 190 compute hours) + $0 Upstash free tier (10K requests/day) + ~$3 for overflow. The architecture scales to 10x traffic before hitting paid tiers.
- **Cache hit rate: 82%** — most API requests ask for historical data that never changes. Redis serves these in under 1ms without touching PostgreSQL.
- **9:30 AM spike handled without scaling** — the old stack timed out during market open. Bun's throughput and Redis caching absorb the 5x traffic spike without breaking a sweat.
- **Deploy time: 2 seconds** — `bun build` produces a single executable. `scp` to server, restart systemd service. No Docker, no CI pipeline for a side project.
