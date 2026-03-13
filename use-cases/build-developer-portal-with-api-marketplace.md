---
title: Build a Developer Portal with API Marketplace
slug: build-developer-portal-with-api-marketplace
description: >
  Launch an API marketplace where partners discover, test, and subscribe
  to your APIs — with auto-generated docs, sandbox environments, and
  usage-based billing that turned an internal platform into a $2M/year
  revenue stream.
skills:
  - typescript
  - nextjs
  - hono
  - prisma
  - redis
  - stripe-billing
  - zod
  - tailwindcss
category: Full-Stack Development
tags:
  - developer-portal
  - api-marketplace
  - documentation
  - sandbox
  - api-monetization
  - openapi
---

# Build a Developer Portal with API Marketplace

## The Problem

Omar leads engineering at a logistics company with 15 internal APIs (tracking, routing, pricing, address validation, etc.). Partners integrate these APIs via email — they request access, a developer manually creates API keys, sends them Postman collections, and answers integration questions on Slack. Onboarding a single partner takes 2 weeks and costs 20 engineering hours. The company has 40 partners and a waitlist of 60 more. The CEO wants to monetize the APIs, but there's no metering, billing, or self-service infrastructure.

Omar needs:
- **Self-service portal** — partners sign up, browse APIs, get keys, and start integrating without human involvement
- **Auto-generated docs** — always in sync with actual API specs, not a stale Wiki
- **Interactive sandbox** — test API calls in the browser with sample data
- **API key management** — create, rotate, and revoke keys with scoped permissions
- **Usage metering and billing** — charge per API call with tiered pricing
- **Partner dashboard** — real-time usage analytics, billing history, and quota monitoring

## Step 1: API Registry from OpenAPI Specs

Every API auto-registers by publishing its OpenAPI spec. Docs, SDKs, and sandbox config generate from the spec.

```typescript
// src/registry/api-registry.ts
// Central registry of all APIs available in the marketplace

import { z } from 'zod';

export const ApiProduct = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.enum(['logistics', 'payments', 'data', 'communication', 'analytics']),
  openApiSpec: z.string(),        // URL to OpenAPI 3.1 spec
  baseUrl: z.string().url(),
  sandboxUrl: z.string().url(),   // isolated test environment
  pricing: z.object({
    free: z.object({
      monthlyQuota: z.number().int(),
      ratePerSecond: z.number().int(),
    }),
    starter: z.object({
      monthlyPrice: z.number(),
      includedCalls: z.number().int(),
      overagePer1000: z.number(),
      ratePerSecond: z.number().int(),
    }),
    enterprise: z.object({
      monthlyPrice: z.number(),
      includedCalls: z.number().int(),
      overagePer1000: z.number(),
      ratePerSecond: z.number().int(),
    }),
  }),
  status: z.enum(['active', 'beta', 'deprecated']),
  tags: z.array(z.string()),
});

export type ApiProduct = z.infer<typeof ApiProduct>;

// Example API products
export const trackingApi: ApiProduct = {
  id: 'shipment-tracking',
  name: 'Shipment Tracking API',
  description: 'Real-time shipment tracking across 200+ carriers. Webhooks for status changes. Batch tracking support.',
  version: '2.1.0',
  category: 'logistics',
  openApiSpec: 'https://api.example.com/specs/tracking/v2.1/openapi.json',
  baseUrl: 'https://api.example.com/tracking/v2',
  sandboxUrl: 'https://sandbox.example.com/tracking/v2',
  pricing: {
    free: { monthlyQuota: 500, ratePerSecond: 2 },
    starter: { monthlyPrice: 49, includedCalls: 10_000, overagePer1000: 3, ratePerSecond: 20 },
    enterprise: { monthlyPrice: 299, includedCalls: 100_000, overagePer1000: 1.5, ratePerSecond: 100 },
  },
  status: 'active',
  tags: ['tracking', 'shipping', 'webhooks', 'carriers'],
};
```

## Step 2: Auto-Generated Interactive Documentation

Parse OpenAPI specs and render interactive docs where developers can try API calls.

```typescript
// src/docs/spec-parser.ts
// Parses OpenAPI specs into structured documentation

import { z } from 'zod';

export interface ParsedEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: Array<{
    name: string;
    in: 'query' | 'path' | 'header';
    required: boolean;
    type: string;
    description: string;
    example?: unknown;
  }>;
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
    example: Record<string, unknown>;
  };
  responses: Array<{
    statusCode: number;
    description: string;
    example?: Record<string, unknown>;
  }>;
}

export async function parseOpenApiSpec(specUrl: string): Promise<{
  info: { title: string; version: string; description: string };
  endpoints: ParsedEndpoint[];
}> {
  const response = await fetch(specUrl);
  const spec = await response.json() as any;

  const endpoints: ParsedEndpoint[] = [];

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: operation.summary ?? '',
          description: operation.description ?? '',
          parameters: (operation.parameters ?? []).map((p: any) => ({
            name: p.name,
            in: p.in,
            required: p.required ?? false,
            type: p.schema?.type ?? 'string',
            description: p.description ?? '',
            example: p.example ?? p.schema?.example,
          })),
          requestBody: operation.requestBody ? {
            contentType: Object.keys(operation.requestBody.content)[0],
            schema: Object.values(operation.requestBody.content)[0] as any,
            example: extractExample(operation.requestBody),
          } : undefined,
          responses: Object.entries(operation.responses ?? {}).map(([code, resp]: [string, any]) => ({
            statusCode: parseInt(code),
            description: resp.description ?? '',
            example: extractResponseExample(resp),
          })),
        });
      }
    }
  }

  return {
    info: {
      title: spec.info?.title ?? '',
      version: spec.info?.version ?? '',
      description: spec.info?.description ?? '',
    },
    endpoints,
  };
}

function extractExample(body: any): Record<string, unknown> {
  const content = Object.values(body.content)[0] as any;
  return content?.example ?? content?.schema?.example ?? {};
}

function extractResponseExample(response: any): Record<string, unknown> | undefined {
  const content = Object.values(response.content ?? {})[0] as any;
  return content?.example;
}
```

## Step 3: API Key Management with Scoped Permissions

```typescript
// src/keys/key-manager.ts
// Creates and manages scoped API keys for partners

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

export interface ApiKeyCreate {
  partnerId: string;
  name: string;
  apiProductIds: string[];       // which APIs this key can access
  environment: 'sandbox' | 'production';
  expiresAt?: Date;
}

export async function createApiKey(input: ApiKeyCreate): Promise<{
  keyId: string;
  apiKey: string;        // shown once, then hashed
  prefix: string;        // visible prefix for identification
}> {
  // Generate a secure key: prefix_randomBytes
  const prefix = `${input.environment === 'sandbox' ? 'sk_test' : 'sk_live'}_${randomBytes(4).toString('hex')}`;
  const secret = randomBytes(24).toString('base64url');
  const apiKey = `${prefix}_${secret}`;

  // Store only the hash — never store the raw key
  const hash = createHash('sha256').update(apiKey).digest('hex');

  const key = await prisma.apiKey.create({
    data: {
      partnerId: input.partnerId,
      name: input.name,
      prefix,
      hash,
      apiProductIds: input.apiProductIds,
      environment: input.environment,
      expiresAt: input.expiresAt,
      status: 'active',
    },
  });

  return { keyId: key.id, apiKey, prefix };
}

export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  partnerId?: string;
  apiProductIds?: string[];
  environment?: string;
  rateLimitTier?: string;
}> {
  const hash = createHash('sha256').update(apiKey).digest('hex');

  const key = await prisma.apiKey.findFirst({
    where: {
      hash,
      status: 'active',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      partner: { select: { plan: true } },
    },
  });

  if (!key) return { valid: false };

  // Update last used timestamp (fire-and-forget)
  prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    valid: true,
    partnerId: key.partnerId,
    apiProductIds: key.apiProductIds,
    environment: key.environment,
    rateLimitTier: key.partner.plan,
  };
}
```

## Step 4: Usage Metering and Stripe Billing

```typescript
// src/billing/meter.ts
// Tracks API usage and syncs with Stripe for billing

import Stripe from 'stripe';
import { Redis } from 'ioredis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

export async function recordApiCall(
  partnerId: string,
  apiProductId: string,
  statusCode: number
): Promise<void> {
  const day = new Date().toISOString().split('T')[0];

  // Atomic increment in Redis — sub-ms overhead
  const pipeline = redis.pipeline();
  pipeline.hincrby(`meter:${partnerId}:${day}`, apiProductId, 1);
  pipeline.hincrby(`meter:${partnerId}:${day}`, 'total', 1);
  pipeline.expire(`meter:${partnerId}:${day}`, 86400 * 35);  // 35-day retention

  if (statusCode >= 200 && statusCode < 300) {
    pipeline.hincrby(`meter:${partnerId}:${day}`, `${apiProductId}:success`, 1);
  } else {
    pipeline.hincrby(`meter:${partnerId}:${day}`, `${apiProductId}:error`, 1);
  }

  await pipeline.exec();
}

// Runs daily: report usage to Stripe for billing
export async function reportUsageToStripe(partnerId: string): Promise<void> {
  const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
  const usage = await redis.hgetall(`meter:${partnerId}:${yesterday}`);

  if (!usage.total) return;

  // Find the partner's Stripe subscription
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { stripeSubscriptionItemId: true, plan: true },
  });

  if (!partner?.stripeSubscriptionItemId) return;

  // Get included calls for their plan
  const included: Record<string, number> = {
    free: 500, starter: 10_000, enterprise: 100_000,
  };
  const totalCalls = parseInt(usage.total);
  const includedCalls = included[partner.plan] ?? 0;
  const overageCalls = Math.max(0, totalCalls - includedCalls);

  if (overageCalls > 0) {
    // Report overage to Stripe (they'll charge on the invoice)
    await stripe.subscriptionItems.createUsageRecord(
      partner.stripeSubscriptionItemId,
      {
        quantity: overageCalls,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set',
      }
    );
  }
}

export async function getPartnerUsage(partnerId: string, days: number = 30): Promise<{
  daily: Array<{ date: string; total: number; byApi: Record<string, number> }>;
  totalCalls: number;
}> {
  const results: Array<{ date: string; total: number; byApi: Record<string, number> }> = [];
  let totalCalls = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400_000).toISOString().split('T')[0];
    const usage = await redis.hgetall(`meter:${partnerId}:${date}`);

    const total = parseInt(usage.total ?? '0');
    totalCalls += total;

    const byApi: Record<string, number> = {};
    for (const [key, val] of Object.entries(usage)) {
      if (key !== 'total' && !key.includes(':')) {
        byApi[key] = parseInt(val);
      }
    }

    results.push({ date, total, byApi });
  }

  return { daily: results.reverse(), totalCalls };
}
```

## Step 5: Interactive API Sandbox

```typescript
// src/sandbox/try-it.ts
// Executes API calls in the sandbox environment from the browser

import { Hono } from 'hono';
import { validateApiKey } from '../keys/key-manager';

const app = new Hono();

app.post('/v1/sandbox/try', async (c) => {
  const { apiProductId, method, path, headers, body, apiKey } = await c.req.json();

  // Validate key and ensure it's a sandbox key
  const keyInfo = await validateApiKey(apiKey);
  if (!keyInfo.valid || keyInfo.environment !== 'sandbox') {
    return c.json({ error: 'Invalid or non-sandbox API key' }, 401);
  }
  if (!keyInfo.apiProductIds?.includes(apiProductId)) {
    return c.json({ error: 'API key does not have access to this product' }, 403);
  }

  // Look up sandbox URL
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const product = await prisma.apiProduct.findUnique({ where: { id: apiProductId } });
  if (!product) return c.json({ error: 'API product not found' }, 404);

  // Proxy the request to the sandbox
  const sandboxUrl = `${product.sandboxUrl}${path}`;
  const start = Date.now();

  try {
    const response = await fetch(sandboxUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseBody = await response.json().catch(() => response.text());
    const latencyMs = Date.now() - start;

    return c.json({
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      latencyMs,
    });
  } catch (err: any) {
    return c.json({
      statusCode: 0,
      error: `Connection failed: ${err.message}`,
      latencyMs: Date.now() - start,
    }, 502);
  }
});

export default app;
```

## Results

After launching the developer portal:

- **Partner onboarding**: dropped from 2 weeks / 20 engineer hours to **15 minutes self-service**
- **Waitlist cleared**: all 60 pending partners onboarded within 2 weeks of launch
- **New API revenue**: $2.1M ARR from 140 paying partners (was $0 — APIs were free)
- **Support tickets**: 78% reduction — sandbox + interactive docs answer most questions
- **API key creation**: 3,200 keys created by partners (100% self-service, zero manual)
- **Sandbox usage**: 45K test calls/day — partners validate integrations before going live
- **Average integration time**: 2.3 days from signup to first production call (was 14 days)
- **Developer NPS**: 72 (surveyed 3 months post-launch)
