---
title: Build an Automated Testing Pipeline
slug: build-automated-testing-pipeline
description: Build a comprehensive testing pipeline with unit tests, integration tests, API contract tests, and visual regression tests — running in CI with parallel execution and smart test selection.
skills:
  - typescript
  - zod
  - postgresql
category: Developer Experience
tags:
  - testing
  - ci-cd
  - automation
  - vitest
  - quality
---

# Build an Automated Testing Pipeline

## The Problem

Kenji leads quality at a 40-person SaaS. The test suite has 2,000 tests but takes 45 minutes to run. Developers skip tests locally and push to CI, where failures block the team for an hour. Integration tests are flaky — 10% fail randomly due to timing issues. Nobody writes tests for new features because the existing suite is a pain. Code coverage is 35% and dropping. They need a fast, reliable testing pipeline that runs in under 5 minutes, catches real bugs, and makes writing tests easy.

## Step 1: Build the Testing Framework

```typescript
// src/testing/test-factory.ts — Test helpers for fast, reliable tests
import { Pool } from "pg";
import { Redis } from "ioredis";
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// Isolated test database per worker
const TEST_DB_URL = `${process.env.DATABASE_URL}_test_${process.env.VITEST_POOL_ID || 0}`;
let testPool: Pool;
let testRedis: Redis;

export function setupTestEnvironment() {
  beforeAll(async () => {
    testPool = new Pool({ connectionString: TEST_DB_URL, max: 5 });

    // Run migrations
    const { execSync } = await import("node:child_process");
    execSync(`DATABASE_URL=${TEST_DB_URL} npx drizzle-kit push`, { stdio: "pipe" });

    testRedis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      keyPrefix: `test:${process.env.VITEST_POOL_ID}:`,
    });
  });

  afterAll(async () => {
    await testPool.end();
    await testRedis.quit();
  });

  // Each test runs in a transaction that gets rolled back
  beforeEach(async () => {
    await testPool.query("BEGIN");
    await testRedis.flushdb();
  });

  afterEach(async () => {
    await testPool.query("ROLLBACK");
  });

  return { getPool: () => testPool, getRedis: () => testRedis };
}

// Factory for creating test data
export function createFactory<T>(
  tableName: string,
  defaults: Partial<T>,
  pool: () => Pool
) {
  let counter = 0;

  return async (overrides: Partial<T> = {}): Promise<T & { id: string }> => {
    counter++;
    const data = { ...defaults, ...overrides } as any;

    // Auto-generate unique values
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.includes("{{counter}}")) {
        data[key] = value.replace("{{counter}}", String(counter));
      }
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const { rows: [row] } = await pool().query(
      `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values
    );

    return row as T & { id: string };
  };
}
```

```typescript
// src/testing/api-test-client.ts — Type-safe API testing client
import { Hono } from "hono";

export function createTestClient(app: Hono) {
  return {
    async get(path: string, options?: { headers?: Record<string, string> }) {
      const req = new Request(`http://localhost${path}`, {
        method: "GET",
        headers: options?.headers,
      });
      const res = await app.fetch(req);
      return { status: res.status, body: await res.json(), headers: res.headers };
    },

    async post(path: string, body: any, options?: { headers?: Record<string, string> }) {
      const req = new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(body),
      });
      const res = await app.fetch(req);
      return { status: res.status, body: await res.json(), headers: res.headers };
    },

    async put(path: string, body: any, options?: { headers?: Record<string, string> }) {
      const req = new Request(`http://localhost${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(body),
      });
      const res = await app.fetch(req);
      return { status: res.status, body: await res.json(), headers: res.headers };
    },

    async delete(path: string, options?: { headers?: Record<string, string> }) {
      const req = new Request(`http://localhost${path}`, {
        method: "DELETE",
        headers: options?.headers,
      });
      const res = await app.fetch(req);
      return { status: res.status, body: await res.json(), headers: res.headers };
    },
  };
}
```

```typescript
// tests/orders.test.ts — Example: integration tests for order API
import { describe, it, expect } from "vitest";
import { setupTestEnvironment, createFactory } from "../src/testing/test-factory";
import { createTestClient } from "../src/testing/api-test-client";
import { app } from "../src/app";

const { getPool } = setupTestEnvironment();

const createUser = createFactory("users", {
  email: "user-{{counter}}@test.com",
  name: "Test User {{counter}}",
  plan: "pro",
}, getPool);

const createProduct = createFactory("products", {
  name: "Product {{counter}}",
  price: 29.99,
  stock: 100,
}, getPool);

const client = createTestClient(app);

describe("Order API", () => {
  it("creates an order and deducts stock", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 49.99, stock: 10 });

    const { status, body } = await client.post("/orders", {
      productId: product.id,
      quantity: 2,
    }, {
      headers: { Authorization: `Bearer ${generateTestToken(user.id)}` },
    });

    expect(status).toBe(201);
    expect(body.total).toBe(99.98);
    expect(body.status).toBe("confirmed");

    // Verify stock was deducted
    const { rows: [updated] } = await getPool().query("SELECT stock FROM products WHERE id = $1", [product.id]);
    expect(updated.stock).toBe(8);
  });

  it("rejects order when insufficient stock", async () => {
    const user = await createUser();
    const product = await createProduct({ stock: 1 });

    const { status, body } = await client.post("/orders", {
      productId: product.id,
      quantity: 5,
    }, {
      headers: { Authorization: `Bearer ${generateTestToken(user.id)}` },
    });

    expect(status).toBe(422);
    expect(body.error).toContain("Insufficient stock");
  });

  it("handles concurrent orders without overselling", async () => {
    const user = await createUser();
    const product = await createProduct({ stock: 1 });

    // Two orders at the same time for the last item
    const [order1, order2] = await Promise.all([
      client.post("/orders", { productId: product.id, quantity: 1 }, {
        headers: { Authorization: `Bearer ${generateTestToken(user.id)}` },
      }),
      client.post("/orders", { productId: product.id, quantity: 1 }, {
        headers: { Authorization: `Bearer ${generateTestToken(user.id)}` },
      }),
    ]);

    // Exactly one should succeed
    const statuses = [order1.status, order2.status].sort();
    expect(statuses).toEqual([201, 422]);
  });
});

function generateTestToken(userId: string): string {
  return Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 3600000 })).toString("base64");
}
```

## Results

- **Test suite time: 45 minutes → 3 minutes** — parallel test workers with isolated databases; no test waits for another; each worker runs in its own DB
- **Flaky tests eliminated** — transaction rollback ensures clean state; Redis key prefix isolates data between workers; timing issues gone
- **Coverage jumped from 35% to 82%** — test factories and API client make writing tests fast; developers add tests because it's easy, not painful
- **Concurrent race condition caught** — the overselling test found a missing `FOR UPDATE` lock; caught in test, not production
- **Test data factories** — `createUser()` generates unique, valid data every time; no shared fixtures, no test interdependencies
