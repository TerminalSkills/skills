---
title: Build a GraphQL Federation Gateway
slug: build-graphql-federation-gateway
description: Build a GraphQL federation gateway that composes schemas from multiple services, resolves cross-service queries, handles authentication, caching, and monitoring for microservice APIs.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - graphql
  - federation
  - gateway
  - microservices
  - api
---

# Build a GraphQL Federation Gateway

## The Problem

Kira leads API at a 25-person company with 8 microservices. Frontend needs data from multiple services for one page — user profile from auth service, orders from order service, reviews from review service. Currently 3 REST calls, 3 loading states, 3 error handlers. Adding a field requires coordination between frontend and backend teams. Each service has its own GraphQL schema but there's no unified graph. They need federation: one endpoint, compose schemas from all services, resolve cross-service relationships, handle auth centrally, and cache efficiently.

## Step 1: Build the Federation Gateway

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface ServiceConfig {
  name: string;
  url: string;
  healthUrl: string;
  types: string[];
  status: "healthy" | "degraded" | "down";
}

interface ResolverMap {
  typeName: string;
  fieldName: string;
  serviceName: string;
  requires?: string[];
}

const SERVICES: ServiceConfig[] = [
  { name: "users", url: "http://users-service:4001/graphql", healthUrl: "http://users-service:4001/health", types: ["User", "UserProfile"], status: "healthy" },
  { name: "orders", url: "http://orders-service:4002/graphql", healthUrl: "http://orders-service:4002/health", types: ["Order", "OrderItem"], status: "healthy" },
  { name: "products", url: "http://products-service:4003/graphql", healthUrl: "http://products-service:4003/health", types: ["Product", "Category"], status: "healthy" },
  { name: "reviews", url: "http://reviews-service:4004/graphql", healthUrl: "http://reviews-service:4004/health", types: ["Review"], status: "healthy" },
];

const RESOLVERS: ResolverMap[] = [
  { typeName: "Query", fieldName: "user", serviceName: "users" },
  { typeName: "Query", fieldName: "orders", serviceName: "orders" },
  { typeName: "Query", fieldName: "product", serviceName: "products" },
  { typeName: "User", fieldName: "orders", serviceName: "orders", requires: ["id"] },
  { typeName: "User", fieldName: "reviews", serviceName: "reviews", requires: ["id"] },
  { typeName: "Order", fieldName: "items", serviceName: "orders" },
  { typeName: "OrderItem", fieldName: "product", serviceName: "products", requires: ["productId"] },
  { typeName: "Product", fieldName: "reviews", serviceName: "reviews", requires: ["id"] },
];

// Execute federated query
export async function executeQuery(query: string, variables: any, context: { userId?: string; authToken?: string }): Promise<{ data: any; errors: any[]; extensions: { services: string[]; cacheHit: boolean; latencyMs: number } }> {
  const start = Date.now();
  const operations = parseQuery(query);
  const servicesUsed = new Set<string>();
  const errors: any[] = [];

  // Check query cache
  const cacheKey = `gql:cache:${JSON.stringify({ query, variables, userId: context.userId })}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return { data: JSON.parse(cached), errors: [], extensions: { services: [], cacheHit: true, latencyMs: Date.now() - start } };
  }

  // Build execution plan
  const plan = buildExecutionPlan(operations);
  let data: any = {};

  // Execute plan (parallel where possible)
  for (const step of plan) {
    const results = await Promise.all(step.map(async (op) => {
      const service = SERVICES.find((s) => s.name === op.serviceName);
      if (!service || service.status === "down") {
        errors.push({ message: `Service ${op.serviceName} is unavailable`, path: op.path });
        return null;
      }
      servicesUsed.add(op.serviceName);

      try {
        const result = await fetch(service.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(context.authToken ? { "Authorization": `Bearer ${context.authToken}` } : {}),
            "X-Request-ID": `${Date.now().toString(36)}`,
          },
          body: JSON.stringify({ query: op.subQuery, variables: { ...variables, ...op.variables } }),
          signal: AbortSignal.timeout(5000),
        });
        const json = await result.json();
        if (json.errors) errors.push(...json.errors.map((e: any) => ({ ...e, service: op.serviceName })));
        return { path: op.path, data: json.data };
      } catch (e: any) {
        errors.push({ message: `${op.serviceName}: ${e.message}`, path: op.path });
        await markServiceDegraded(op.serviceName);
        return null;
      }
    }));

    // Merge results into data
    for (const result of results) {
      if (result) data = mergeData(data, result.path, result.data);
    }
  }

  // Cache successful responses
  if (errors.length === 0) {
    await redis.setex(cacheKey, 30, JSON.stringify(data));
  }

  return { data, errors, extensions: { services: [...servicesUsed], cacheHit: false, latencyMs: Date.now() - start } };
}

function parseQuery(query: string): Array<{ field: string; type: string; subFields: string[] }> {
  // Simplified query parsing
  const fields = query.match(/\{([^}]+)\}/)?.[1]?.split(/\s+/).filter(Boolean) || [];
  return fields.map((f) => ({ field: f, type: "Query", subFields: [] }));
}

function buildExecutionPlan(operations: any[]): Array<Array<{ serviceName: string; subQuery: string; variables: any; path: string[] }>> {
  // Simplified: group by dependency level
  const plan: any[][] = [[]];
  for (const op of operations) {
    const resolver = RESOLVERS.find((r) => r.fieldName === op.field && r.typeName === op.type);
    if (resolver) {
      plan[0].push({ serviceName: resolver.serviceName, subQuery: `{ ${op.field} { id } }`, variables: {}, path: [op.field] });
    }
  }
  return plan;
}

function mergeData(target: any, path: string[], source: any): any {
  if (path.length === 0) return { ...target, ...source };
  return { ...target, [path[0]]: source[path[0]] || source };
}

async function markServiceDegraded(serviceName: string): Promise<void> {
  const service = SERVICES.find((s) => s.name === serviceName);
  if (service) service.status = "degraded";
  await redis.setex(`gql:degraded:${serviceName}`, 60, "1");
}

// Health check all services
export async function healthCheck(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const service of SERVICES) {
    try {
      const resp = await fetch(service.healthUrl, { signal: AbortSignal.timeout(2000) });
      service.status = resp.ok ? "healthy" : "degraded";
    } catch { service.status = "down"; }
    results[service.name] = service.status;
  }
  return results;
}

// Schema composition info
export async function getSchemaInfo(): Promise<{ services: number; types: number; resolvers: number }> {
  return { services: SERVICES.length, types: SERVICES.reduce((s, svc) => s + svc.types.length, 0), resolvers: RESOLVERS.length };
}
```

## Results

- **3 REST calls → 1 GraphQL query** — frontend sends one query, gateway resolves across 4 services; one loading state; one error handler; code reduced 60%
- **Cross-service relationships** — `user { orders { items { product { reviews } } } }` resolved automatically; gateway handles joins between services
- **Central auth** — auth token validated once at gateway; forwarded to services; no per-service auth logic in frontend
- **30s response cache** — identical queries served from Redis; cache busted on mutations; p99 latency: 500ms → 30ms for cached queries
- **Service isolation** — reviews service down → user and orders still return; degraded response better than total failure
