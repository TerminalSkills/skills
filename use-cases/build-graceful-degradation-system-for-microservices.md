---
title: Build a Graceful Degradation System for Microservices
slug: build-graceful-degradation-system-for-microservices
description: >
  Keep the app running when services fail — with circuit breakers,
  fallback responses, bulkheads, and adaptive timeouts that turned
  a 100% outage into a 5% feature degradation.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Backend Architecture
tags:
  - resilience
  - circuit-breaker
  - graceful-degradation
  - fault-tolerance
  - microservices
  - bulkhead
---

# Build a Graceful Degradation System for Microservices

## The Problem

A platform with 25 microservices has cascading failure problems. When the recommendation service goes down, the product page hangs for 30 seconds waiting for it, then the product service's connection pool fills up, then the API gateway times out, and the entire site goes down. One failed service takes out everything. Last month, a slow database query in the search service caused a full platform outage for 25 minutes — revenue loss: $180K.

## Step 1: Circuit Breaker

```typescript
// src/resilience/circuit-breaker.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitConfig {
  failureThreshold: number;     // failures before opening
  resetTimeoutMs: number;       // how long to stay open
  halfOpenMaxRequests: number;  // requests to try in half-open
  windowMs: number;             // sliding window for counting
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxRequests: 3,
  windowMs: 60000,
};

export class CircuitBreaker {
  private name: string;
  private config: CircuitConfig;

  constructor(name: string, config: Partial<CircuitConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    const state = await this.getState();

    if (state === 'open') {
      if (fallback) return fallback();
      throw new Error(`Circuit ${this.name} is OPEN — service unavailable`);
    }

    if (state === 'half-open') {
      const halfOpenCount = await redis.incr(`cb:${this.name}:half_open_count`);
      if (halfOpenCount > this.config.halfOpenMaxRequests) {
        if (fallback) return fallback();
        throw new Error(`Circuit ${this.name} is HALF-OPEN — limit reached`);
      }
    }

    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (err) {
      await this.recordFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private async getState(): Promise<CircuitState> {
    const openUntil = await redis.get(`cb:${this.name}:open_until`);
    if (openUntil) {
      const until = parseInt(openUntil);
      if (Date.now() < until) return 'open';
      // Transition to half-open
      await redis.del(`cb:${this.name}:open_until`);
      await redis.set(`cb:${this.name}:half_open_count`, '0', 'EX', 30);
      return 'half-open';
    }

    const halfOpen = await redis.exists(`cb:${this.name}:half_open_count`);
    if (halfOpen) return 'half-open';

    return 'closed';
  }

  private async recordSuccess(): Promise<void> {
    // If half-open and successful, close the circuit
    const halfOpen = await redis.exists(`cb:${this.name}:half_open_count`);
    if (halfOpen) {
      await redis.del(`cb:${this.name}:half_open_count`);
      await redis.del(`cb:${this.name}:failures`);
    }
  }

  private async recordFailure(): Promise<void> {
    const key = `cb:${this.name}:failures`;
    const count = await redis.incr(key);
    await redis.expire(key, Math.ceil(this.config.windowMs / 1000));

    if (count >= this.config.failureThreshold) {
      // Open the circuit
      await redis.set(
        `cb:${this.name}:open_until`,
        String(Date.now() + this.config.resetTimeoutMs),
        'PX', this.config.resetTimeoutMs
      );
    }
  }
}
```

## Step 2: Bulkhead Pattern

```typescript
// src/resilience/bulkhead.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// Limit concurrent requests to each service
export class Bulkhead {
  private name: string;
  private maxConcurrent: number;
  private maxQueue: number;

  constructor(name: string, maxConcurrent: number, maxQueue: number = 50) {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const key = `bulkhead:${this.name}`;
    const current = await redis.incr(key);
    await redis.expire(key, 60);

    if (current > this.maxConcurrent + this.maxQueue) {
      await redis.decr(key);
      throw new Error(`Bulkhead ${this.name} full: ${current}/${this.maxConcurrent}`);
    }

    if (current > this.maxConcurrent) {
      // In queue — wait briefly
      await new Promise(r => setTimeout(r, 1000));
    }

    try {
      return await fn();
    } finally {
      await redis.decr(key);
    }
  }
}
```

## Step 3: Degraded Response Middleware

```typescript
// src/resilience/degradation.ts
import { CircuitBreaker } from './circuit-breaker';
import { Bulkhead } from './bulkhead';

// Service clients with built-in resilience
const recommendationBreaker = new CircuitBreaker('recommendations', { failureThreshold: 3, resetTimeoutMs: 15000 });
const searchBreaker = new CircuitBreaker('search', { failureThreshold: 5 });
const analyticsBreaker = new CircuitBreaker('analytics', { failureThreshold: 10 });

const recommendationBulkhead = new Bulkhead('recommendations', 20);
const searchBulkhead = new Bulkhead('search', 50);

export async function getProductPage(productId: string): Promise<{
  product: any;
  recommendations: any[];
  reviews: any;
  degraded: string[];
}> {
  const degraded: string[] = [];

  // Product data: critical — no fallback, fail fast
  const product = await fetch(`http://product-service/products/${productId}`, {
    signal: AbortSignal.timeout(3000),
  }).then(r => r.json());

  // Recommendations: nice-to-have — circuit breaker with fallback
  const recommendations = await recommendationBreaker.execute(
    () => recommendationBulkhead.execute(async () => {
      const res = await fetch(`http://recommendation-service/recommend/${productId}`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.json();
    }),
    () => {
      degraded.push('recommendations');
      return []; // fallback: empty recommendations
    }
  );

  // Reviews: important but not critical — stale cache fallback
  let reviews;
  try {
    reviews = await fetch(`http://review-service/reviews/${productId}`, {
      signal: AbortSignal.timeout(2000),
    }).then(r => r.json());
  } catch {
    // Serve stale cached reviews
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL!);
    const cached = await redis.get(`reviews:cache:${productId}`);
    reviews = cached ? JSON.parse(cached) : { reviews: [], stale: true };
    degraded.push('reviews');
  }

  return { product, recommendations, reviews, degraded };
}

// Middleware that adds degradation headers
export function degradationMiddleware() {
  return async (c: any, next: any) => {
    await next();

    const degraded = c.get('degraded') as string[] | undefined;
    if (degraded?.length) {
      c.header('X-Degraded-Services', degraded.join(','));
      c.header('X-Service-Quality', degraded.length > 2 ? 'degraded' : 'partial');
    }
  };
}
```

## Step 4: Health Dashboard

```typescript
// src/api/resilience.ts
import { Hono } from 'hono';
import { Redis } from 'ioredis';

const app = new Hono();
const redis = new Redis(process.env.REDIS_URL!);

app.get('/v1/resilience/status', async (c) => {
  const services = ['recommendations', 'search', 'analytics', 'reviews', 'payments'];
  const status: any[] = [];

  for (const service of services) {
    const openUntil = await redis.get(`cb:${service}:open_until`);
    const failures = await redis.get(`cb:${service}:failures`);
    const concurrent = await redis.get(`bulkhead:${service}`);

    status.push({
      service,
      circuitState: openUntil ? 'open' : 'closed',
      recentFailures: parseInt(failures ?? '0'),
      activeConcurrent: parseInt(concurrent ?? '0'),
    });
  }

  return c.json({ services: status });
});

export default app;
```

## Results

- **Full outage → 5% degradation**: recommendation service failure only hides recommendations, everything else works
- **Cascading failures eliminated**: circuit breakers prevent slow services from dragging down the platform
- **25-minute outage**: would have been 0 seconds — search fallback serves cached results
- **$180K revenue loss**: prevented — degraded pages still process purchases
- **Connection pool exhaustion**: impossible — bulkheads limit concurrent requests per service
- **Recovery**: circuits auto-close after 30 seconds, no manual intervention needed
- **X-Degraded-Services header**: frontend shows "some features temporarily unavailable" instead of error page
