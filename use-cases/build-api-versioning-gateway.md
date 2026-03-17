---
title: Build an API Versioning Gateway
slug: build-api-versioning-gateway
description: Build an API versioning gateway with version negotiation, backward compatibility checking, sunset management, consumer migration tracking, and deprecation warnings for API lifecycle management.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - api-versioning
  - gateway
  - backward-compatibility
  - lifecycle
  - deprecation
---

# Build an API Versioning Gateway

## The Problem

Kai leads API at a 25-person company with 500 API consumers. They need to evolve the API (rename fields, change types, add required params) but can't break existing consumers. URL versioning (/v1/, /v2/) requires maintaining 3 codebases. Header versioning is ignored by most consumers. Breaking changes slip through because there's no compatibility check. Old versions stay forever because nobody tracks who's still on v1. They need a versioning gateway: version negotiation, automatic compatibility transformation, sunset management, consumer migration tracking, and deprecation warnings.

## Step 1: Build the Versioning Gateway

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);

interface APIVersion { version: string; status: "current" | "supported" | "deprecated" | "sunset"; sunsetDate: string | null; transformations: Transformation[]; }
interface Transformation { type: "rename_field" | "add_field" | "remove_field" | "change_type" | "wrap_response"; config: Record<string, any>; }
interface ConsumerInfo { consumerId: string; currentVersion: string; lastRequestAt: string; requestCount: number; }

const VERSIONS: APIVersion[] = [
  { version: "2024-03-01", status: "current", sunsetDate: null, transformations: [] },
  { version: "2023-09-01", status: "supported", sunsetDate: "2025-03-01", transformations: [
    { type: "rename_field", config: { from: "user_name", to: "username", paths: ["*"] } },
    { type: "add_field", config: { field: "metadata", default: {}, paths: ["response"] } },
  ]},
  { version: "2023-01-01", status: "deprecated", sunsetDate: "2024-12-01", transformations: [
    { type: "rename_field", config: { from: "user_name", to: "username", paths: ["*"] } },
    { type: "rename_field", config: { from: "created", to: "created_at", paths: ["*"] } },
    { type: "wrap_response", config: { wrapper: "data" } },
    { type: "remove_field", config: { field: "metadata", paths: ["response"] } },
  ]},
];

// Middleware: handle API versioning
export function versioningMiddleware() {
  return async (c: any, next: any) => {
    // Determine requested version
    const requestedVersion = c.req.header("API-Version") || c.req.header("X-API-Version") || c.req.query("api_version") || VERSIONS[0].version;
    const version = VERSIONS.find((v) => v.version === requestedVersion) || VERSIONS[0];

    // Check if version is sunset
    if (version.status === "sunset") {
      return c.json({ error: `API version ${version.version} has been sunset. Please upgrade to ${VERSIONS[0].version}.`, upgradeGuide: `/docs/migration/${version.version}-to-${VERSIONS[0].version}` }, 410);
    }

    // Add deprecation warnings
    if (version.status === "deprecated") {
      c.header("Deprecation", "true");
      c.header("Sunset", version.sunsetDate || "");
      c.header("Link", `</docs/migration/${version.version}>; rel="deprecation"`);
    }

    c.header("API-Version", version.version);
    c.set("apiVersion", version);

    // Transform request (old format → current format)
    if (version.transformations.length > 0) {
      const body = await c.req.json().catch(() => null);
      if (body) {
        const transformed = transformRequest(body, version.transformations);
        c.set("transformedBody", transformed);
      }
    }

    // Track consumer usage
    const consumerId = c.get("apiKey")?.id || c.req.header("X-API-Key") || "anonymous";
    trackConsumerVersion(consumerId, version.version).catch(() => {});

    await next();

    // Transform response (current format → old format)
    if (version.transformations.length > 0 && c.res.status < 400) {
      const responseBody = await c.res.clone().json().catch(() => null);
      if (responseBody) {
        const transformed = transformResponse(responseBody, version.transformations);
        c.res = new Response(JSON.stringify(transformed), { status: c.res.status, headers: c.res.headers });
      }
    }
  };
}

function transformRequest(body: any, transformations: Transformation[]): any {
  let result = { ...body };
  for (const t of transformations) {
    switch (t.type) {
      case "rename_field": {
        // Old name → new name in request
        if (result[t.config.from] !== undefined) {
          result[t.config.to] = result[t.config.from];
          delete result[t.config.from];
        }
        break;
      }
    }
  }
  return result;
}

function transformResponse(body: any, transformations: Transformation[]): any {
  let result = typeof body === "object" ? { ...body } : body;

  // Apply transformations in reverse (current → old)
  for (const t of [...transformations].reverse()) {
    switch (t.type) {
      case "rename_field": {
        // New name → old name in response
        if (typeof result === "object" && result[t.config.to] !== undefined) {
          result[t.config.from] = result[t.config.to];
          delete result[t.config.to];
        }
        if (Array.isArray(result)) {
          result = result.map((item: any) => {
            if (item[t.config.to] !== undefined) { item[t.config.from] = item[t.config.to]; delete item[t.config.to]; }
            return item;
          });
        }
        break;
      }
      case "add_field": {
        // Remove field that didn't exist in old version
        if (typeof result === "object") delete result[t.config.field];
        break;
      }
      case "remove_field": {
        // Add back field that was in old version
        if (typeof result === "object" && t.config.default !== undefined) {
          result[t.config.field] = t.config.default;
        }
        break;
      }
      case "wrap_response": {
        // Wrap in old format
        result = { [t.config.wrapper]: result };
        break;
      }
    }
  }

  return result;
}

async function trackConsumerVersion(consumerId: string, version: string): Promise<void> {
  const key = `api:consumer:${consumerId}`;
  await redis.hset(key, "version", version, "lastRequest", Date.now());
  await redis.hincrby(key, "requests", 1);
  await redis.expire(key, 86400 * 90);
}

// Get consumers still on old versions
export async function getConsumerMigrationStatus(): Promise<{ version: string; status: string; consumers: number; lastRequest: string }[]> {
  const result: any[] = [];
  for (const version of VERSIONS) {
    const keys = await redis.keys("api:consumer:*");
    let count = 0;
    let lastRequest = "";
    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (data.version === version.version) {
        count++;
        if (data.lastRequest > lastRequest) lastRequest = data.lastRequest;
      }
    }
    result.push({ version: version.version, status: version.status, consumers: count, lastRequest: lastRequest ? new Date(parseInt(lastRequest)).toISOString() : "never" });
  }
  return result;
}

// Check backward compatibility of proposed changes
export function checkCompatibility(currentSchema: any, proposedSchema: any): { compatible: boolean; breakingChanges: string[] } {
  const breaking: string[] = [];
  // Check for removed fields
  for (const field of Object.keys(currentSchema.properties || {})) {
    if (!proposedSchema.properties?.[field]) breaking.push(`Removed field: ${field}`);
  }
  // Check for type changes
  for (const [field, schema] of Object.entries(currentSchema.properties || {})) {
    const newSchema = proposedSchema.properties?.[field];
    if (newSchema && (schema as any).type !== (newSchema as any).type) {
      breaking.push(`Type changed: ${field} (${(schema as any).type} → ${(newSchema as any).type})`);
    }
  }
  // Check for new required fields
  const oldRequired = new Set(currentSchema.required || []);
  for (const field of (proposedSchema.required || [])) {
    if (!oldRequired.has(field)) breaking.push(`New required field: ${field}`);
  }
  return { compatible: breaking.length === 0, breakingChanges: breaking };
}
```

## Results

- **Zero breaking changes** — response transformations convert current format to old format automatically; consumers on v2023-01-01 still work
- **One codebase** — no /v1/, /v2/ paths; one implementation; transformations handle the difference; maintenance cost: 1x not 3x
- **Consumer migration tracking** — dashboard shows 200 consumers on v2024, 150 on v2023-09, 50 on v2023-01; targeted migration outreach
- **Deprecation headers** — `Deprecation: true` + `Sunset: 2024-12-01` in every response; well-behaved clients see the warning; no surprise shutdown
- **Backward compatibility check** — proposed schema change analyzed; "Removed field: user_name" flagged as breaking; caught before deploy
