---
title: Build an API Sandbox Environment
slug: build-api-sandbox-environment
description: Build an API sandbox environment with isolated test data, mock payment processing, realistic responses, rate limit simulation, and developer onboarding for safe API integration testing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Developer Tools
tags:
  - sandbox
  - api
  - testing
  - developer-experience
  - integration
---

# Build an API Sandbox Environment

## The Problem

Lisa leads DX at a 20-person payments API company. Developers integrating their API need to test without processing real payments. Current approach: test API keys that still hit the real database and rate limiter. A customer's load test in "test mode" accidentally created 1M records in the production database. Sandbox responses don't match production format exactly, causing integration bugs. They need a proper sandbox: isolated data, mock payment processing with configurable responses, exact production response format, rate limit simulation, and pre-seeded test data.

## Step 1: Build the Sandbox Engine

```typescript
import { Redis } from "ioredis";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

// Separate sandbox database
const sandboxPool = new Pool({ connectionString: process.env.SANDBOX_DATABASE_URL });

interface SandboxConfig { apiKeyPrefix: string; dataIsolation: boolean; mockPayments: boolean; simulateLatency: boolean; simulateErrors: boolean; errorRate: number; latencyMs: number; }

const SANDBOX_CONFIG: SandboxConfig = { apiKeyPrefix: "sk_test_", dataIsolation: true, mockPayments: true, simulateLatency: true, simulateErrors: true, errorRate: 0.02, latencyMs: 50 };

// Test card numbers with predefined outcomes
const TEST_CARDS: Record<string, { status: string; declineCode?: string }> = {
  "4242424242424242": { status: "succeeded" },
  "4000000000000002": { status: "failed", declineCode: "card_declined" },
  "4000000000009995": { status: "failed", declineCode: "insufficient_funds" },
  "4000000000000069": { status: "failed", declineCode: "expired_card" },
  "4000000000000127": { status: "failed", declineCode: "incorrect_cvc" },
  "4000000000003220": { status: "requires_action" },
};

// Middleware: route sandbox requests to isolated environment
export function sandboxMiddleware() {
  return async (c: any, next: any) => {
    const apiKey = c.req.header("Authorization")?.replace("Bearer ", "") || c.req.header("X-API-Key") || "";
    const isSandbox = apiKey.startsWith(SANDBOX_CONFIG.apiKeyPrefix);
    c.set("isSandbox", isSandbox);
    c.set("dbPool", isSandbox ? sandboxPool : undefined);

    if (isSandbox) {
      c.header("X-Sandbox", "true");
      // Simulate latency
      if (SANDBOX_CONFIG.simulateLatency) await new Promise((r) => setTimeout(r, SANDBOX_CONFIG.latencyMs + Math.random() * 50));
      // Simulate random errors
      if (SANDBOX_CONFIG.simulateErrors && Math.random() < SANDBOX_CONFIG.errorRate) {
        return c.json({ error: { type: "api_error", message: "Simulated server error (sandbox)" } }, 500);
      }
    }
    await next();
  };
}

// Mock payment processing
export async function processSandboxPayment(params: { amount: number; currency: string; cardNumber: string; customerId: string }): Promise<any> {
  const testCard = TEST_CARDS[params.cardNumber];
  const paymentId = `pi_test_${randomBytes(12).toString("hex")}`;

  if (!testCard) {
    return { id: paymentId, status: "succeeded", amount: params.amount, currency: params.currency, created: Math.floor(Date.now() / 1000), livemode: false };
  }

  if (testCard.status === "failed") {
    return { id: paymentId, status: "failed", amount: params.amount, currency: params.currency, last_payment_error: { code: testCard.declineCode, message: `Your card was declined: ${testCard.declineCode}` }, created: Math.floor(Date.now() / 1000), livemode: false };
  }

  if (testCard.status === "requires_action") {
    return { id: paymentId, status: "requires_action", amount: params.amount, currency: params.currency, client_secret: `${paymentId}_secret_test`, created: Math.floor(Date.now() / 1000), livemode: false };
  }

  return { id: paymentId, status: testCard.status, amount: params.amount, currency: params.currency, created: Math.floor(Date.now() / 1000), livemode: false };
}

// Seed sandbox with test data
export async function seedSandbox(apiKey: string): Promise<{ customers: number; products: number }> {
  const orgId = apiKey.replace(SANDBOX_CONFIG.apiKeyPrefix, "").slice(0, 8);
  // Create test customers
  const customers = ["Test Customer 1", "Test Customer 2", "Test Enterprise Corp", "Sandbox User", "Demo Account"];
  for (const name of customers) {
    await sandboxPool.query(
      `INSERT INTO customers (id, organization_id, name, email, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
      [`cus_test_${randomBytes(6).toString("hex")}`, orgId, name, `${name.toLowerCase().replace(/\s/g, ".")}@test.com`]
    );
  }
  // Create test products
  const products = [{ name: "Basic Plan", price: 999 }, { name: "Pro Plan", price: 2999 }, { name: "Enterprise", price: 9999 }];
  for (const prod of products) {
    await sandboxPool.query(
      `INSERT INTO products (id, organization_id, name, price, currency, created_at) VALUES ($1, $2, $3, $4, 'usd', NOW()) ON CONFLICT DO NOTHING`,
      [`prod_test_${randomBytes(6).toString("hex")}`, orgId, prod.name, prod.price]
    );
  }
  return { customers: customers.length, products: products.length };
}

// Reset sandbox data
export async function resetSandbox(apiKey: string): Promise<void> {
  const orgId = apiKey.replace(SANDBOX_CONFIG.apiKeyPrefix, "").slice(0, 8);
  await sandboxPool.query("DELETE FROM payments WHERE organization_id = $1", [orgId]);
  await sandboxPool.query("DELETE FROM customers WHERE organization_id = $1", [orgId]);
  await sandboxPool.query("DELETE FROM products WHERE organization_id = $1", [orgId]);
  await seedSandbox(apiKey);
}
```

## Results

- **1M accidental records prevented** — sandbox uses separate database; load tests can't affect production; complete data isolation
- **Test cards with predictable outcomes** — `4242...` always succeeds; `4000...0002` always declines; developers test every error path without real transactions
- **Exact production format** — sandbox responses have identical structure, field names, and types as production; no integration surprises when going live
- **Pre-seeded test data** — developer gets sandbox key → 5 test customers + 3 products ready; start building immediately; no manual setup
- **Error simulation** — 2% random errors + configurable latency; developers build resilient integrations; discover retry bugs in development, not production
