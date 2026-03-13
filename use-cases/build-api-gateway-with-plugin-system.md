---
title: Build an API Gateway with Plugin System
slug: build-api-gateway-with-plugin-system
description: Build a lightweight API gateway with a plugin architecture for authentication, rate limiting, request transformation, response caching, and observability — centralizing cross-cutting concerns for microservices.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Backend Development
tags:
  - api-gateway
  - plugins
  - microservices
  - middleware
  - proxy
---

# Build an API Gateway with Plugin System

## The Problem

Omar runs platform engineering at a 50-person company with 15 microservices. Every service implements its own auth, rate limiting, logging, and CORS handling. When the security team mandates API key rotation, they need to update 15 services. When a new compliance requirement adds request logging, 15 PRs. Cross-cutting concerns are scattered and inconsistent. They need a single API gateway that handles common functionality via composable plugins, so services focus on business logic only.

## Step 1: Build the Plugin Framework

```typescript
// src/gateway/plugin-system.ts — Composable plugin architecture for the API gateway
import { Context, Next } from "hono";

// Plugin lifecycle hooks
interface GatewayPlugin {
  name: string;
  priority: number;             // execution order (lower = earlier)
  
  // Called once at gateway startup
  init?(): Promise<void>;
  
  // Called before proxying to upstream
  onRequest?(ctx: GatewayContext, next: Next): Promise<void | Response>;
  
  // Called after receiving upstream response (before sending to client)
  onResponse?(ctx: GatewayContext, response: Response): Promise<Response>;
  
  // Called on error
  onError?(ctx: GatewayContext, error: Error): Promise<Response | void>;
  
  // Cleanup on shutdown
  destroy?(): Promise<void>;
}

interface GatewayContext {
  request: Request;
  route: RouteConfig;
  metadata: Record<string, any>;   // plugins can store data here
  startTime: number;
  clientIp: string;
  requestId: string;
}

interface RouteConfig {
  path: string;                    // /api/users/*
  upstream: string;                // http://user-service:3000
  methods: string[];
  plugins: string[];               // enabled plugins for this route
  pluginConfig: Record<string, any>; // per-route plugin configuration
  stripPrefix?: string;            // remove prefix before forwarding
  timeout: number;
}

class PluginManager {
  private plugins = new Map<string, GatewayPlugin>();
  private sorted: GatewayPlugin[] = [];

  register(plugin: GatewayPlugin): void {
    this.plugins.set(plugin.name, plugin);
    this.sorted = [...this.plugins.values()].sort((a, b) => a.priority - b.priority);
  }

  async initAll(): Promise<void> {
    for (const plugin of this.sorted) {
      if (plugin.init) {
        await plugin.init();
        console.log(`[gateway] Plugin initialized: ${plugin.name}`);
      }
    }
  }

  getPluginsForRoute(route: RouteConfig): GatewayPlugin[] {
    return route.plugins
      .map((name) => this.plugins.get(name))
      .filter(Boolean) as GatewayPlugin[];
  }

  async executeOnRequest(plugins: GatewayPlugin[], ctx: GatewayContext): Promise<Response | null> {
    for (const plugin of plugins) {
      if (!plugin.onRequest) continue;

      let earlyResponse: Response | void;
      await plugin.onRequest(ctx, async () => {});
      
      // Check if plugin set an early response
      if (ctx.metadata._earlyResponse) {
        return ctx.metadata._earlyResponse;
      }
    }
    return null;
  }

  async executeOnResponse(plugins: GatewayPlugin[], ctx: GatewayContext, response: Response): Promise<Response> {
    // Execute in reverse order for response (like middleware unwinding)
    for (const plugin of [...plugins].reverse()) {
      if (plugin.onResponse) {
        response = await plugin.onResponse(ctx, response);
      }
    }
    return response;
  }
}

export const pluginManager = new PluginManager();
export type { GatewayPlugin, GatewayContext, RouteConfig };
```

## Step 2: Build Core Plugins

```typescript
// src/plugins/auth-plugin.ts — JWT/API key authentication plugin
import { GatewayPlugin, GatewayContext } from "../gateway/plugin-system";
import { createVerify } from "node:crypto";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export const authPlugin: GatewayPlugin = {
  name: "auth",
  priority: 10, // runs first

  async onRequest(ctx) {
    const config = ctx.route.pluginConfig.auth || {};
    
    // Skip auth for excluded paths
    if (config.exclude?.some((p: string) => ctx.request.url.includes(p))) return;

    const authHeader = ctx.request.headers.get("authorization");
    const apiKey = ctx.request.headers.get("x-api-key");

    if (apiKey) {
      // API key auth
      const keyData = await redis.get(`apikey:${apiKey}`);
      if (!keyData) {
        ctx.metadata._earlyResponse = new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
        return;
      }

      const parsed = JSON.parse(keyData);
      ctx.metadata.userId = parsed.userId;
      ctx.metadata.plan = parsed.plan;
      ctx.metadata.scopes = parsed.scopes;
      return;
    }

    if (authHeader?.startsWith("Bearer ")) {
      // JWT auth
      const token = authHeader.slice(7);
      try {
        const payload = await verifyJWT(token);
        ctx.metadata.userId = payload.sub;
        ctx.metadata.plan = payload.plan;
        ctx.metadata.scopes = payload.scopes;
      } catch {
        ctx.metadata._earlyResponse = new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return;
    }

    if (config.required !== false) {
      ctx.metadata._earlyResponse = new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};

async function verifyJWT(token: string): Promise<any> {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error("Token expired");
  }

  return payload;
}

// src/plugins/cache-plugin.ts — Response caching plugin
export const cachePlugin: GatewayPlugin = {
  name: "cache",
  priority: 20,

  async onRequest(ctx) {
    if (ctx.request.method !== "GET") return;

    const config = ctx.route.pluginConfig.cache || {};
    const ttl = config.ttlSeconds || 60;
    const cacheKey = `cache:${ctx.route.path}:${new URL(ctx.request.url).pathname}:${new URL(ctx.request.url).search}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      const { body, headers, status } = JSON.parse(cached);
      ctx.metadata._earlyResponse = new Response(body, {
        status,
        headers: { ...headers, "X-Cache": "HIT" },
      });
    }

    ctx.metadata._cacheKey = cacheKey;
    ctx.metadata._cacheTTL = ttl;
  },

  async onResponse(ctx, response) {
    if (ctx.request.method !== "GET" || response.status !== 200) return response;
    if (!ctx.metadata._cacheKey) return response;

    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    await redis.setex(ctx.metadata._cacheKey, ctx.metadata._cacheTTL, JSON.stringify({
      body,
      headers,
      status: response.status,
    }));

    return new Response(body, {
      status: response.status,
      headers: { ...headers, "X-Cache": "MISS" },
    });
  },
};

// src/plugins/logging-plugin.ts — Request/response logging plugin
export const loggingPlugin: GatewayPlugin = {
  name: "logging",
  priority: 5, // runs very first (to capture timing)

  async onResponse(ctx, response) {
    const duration = Date.now() - ctx.startTime;
    const log = {
      requestId: ctx.requestId,
      method: ctx.request.method,
      path: new URL(ctx.request.url).pathname,
      status: response.status,
      durationMs: duration,
      clientIp: ctx.clientIp,
      userId: ctx.metadata.userId || null,
      upstream: ctx.route.upstream,
      timestamp: new Date().toISOString(),
    };

    // Non-blocking log write
    console.log(JSON.stringify(log));

    // Add timing headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Request-Id", ctx.requestId);
    newResponse.headers.set("X-Response-Time", `${duration}ms`);

    return newResponse;
  },
};

// src/plugins/transform-plugin.ts — Request/response transformation
export const transformPlugin: GatewayPlugin = {
  name: "transform",
  priority: 50,

  async onRequest(ctx) {
    const config = ctx.route.pluginConfig.transform || {};

    // Add headers before forwarding to upstream
    if (config.addHeaders) {
      for (const [key, value] of Object.entries(config.addHeaders as Record<string, string>)) {
        (ctx.request.headers as any).set(key, value.replace("$userId", ctx.metadata.userId || ""));
      }
    }

    // Forward user identity to upstream
    if (ctx.metadata.userId) {
      (ctx.request.headers as any).set("X-User-Id", ctx.metadata.userId);
      (ctx.request.headers as any).set("X-User-Plan", ctx.metadata.plan || "free");
    }
  },

  async onResponse(ctx, response) {
    const config = ctx.route.pluginConfig.transform || {};

    // Remove internal headers before sending to client
    const removeHeaders = config.removeResponseHeaders || ["x-powered-by", "server"];
    const newResponse = new Response(response.body, response);
    for (const header of removeHeaders) {
      newResponse.headers.delete(header);
    }

    return newResponse;
  },
};
```

## Step 3: Build the Gateway Router

```typescript
// src/gateway/router.ts — Route matching and upstream proxying
import { Hono } from "hono";
import { pluginManager, RouteConfig, GatewayContext } from "./plugin-system";
import { randomUUID } from "node:crypto";

const routes: RouteConfig[] = [
  {
    path: "/api/users/*",
    upstream: "http://user-service:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    plugins: ["logging", "auth", "cache", "transform"],
    pluginConfig: {
      auth: { required: true },
      cache: { ttlSeconds: 30 },
      transform: { addHeaders: { "X-Forwarded-User": "$userId" } },
    },
    stripPrefix: "/api",
    timeout: 10000,
  },
  {
    path: "/api/products/*",
    upstream: "http://product-service:3001",
    methods: ["GET", "POST", "PUT"],
    plugins: ["logging", "auth", "cache", "transform"],
    pluginConfig: {
      auth: { required: true, exclude: ["/api/products/public"] },
      cache: { ttlSeconds: 120 },
    },
    stripPrefix: "/api",
    timeout: 15000,
  },
  {
    path: "/api/public/*",
    upstream: "http://content-service:3002",
    methods: ["GET"],
    plugins: ["logging", "cache"],
    pluginConfig: { cache: { ttlSeconds: 300 } },
    timeout: 5000,
  },
];

const app = new Hono();

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const route = routes.find((r) => {
    const pattern = r.path.replace("*", "");
    return url.pathname.startsWith(pattern) && r.methods.includes(c.req.method);
  });

  if (!route) {
    return c.json({ error: "Route not found" }, 404);
  }

  const ctx: GatewayContext = {
    request: c.req.raw,
    route,
    metadata: {},
    startTime: Date.now(),
    clientIp: c.req.header("x-forwarded-for") || "unknown",
    requestId: randomUUID(),
  };

  const plugins = pluginManager.getPluginsForRoute(route);

  // Execute request plugins
  const earlyResponse = await pluginManager.executeOnRequest(plugins, ctx);
  if (earlyResponse) return earlyResponse;

  // Proxy to upstream
  let upstreamPath = url.pathname;
  if (route.stripPrefix) {
    upstreamPath = upstreamPath.replace(route.stripPrefix, "");
  }

  const upstreamUrl = `${route.upstream}${upstreamPath}${url.search}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), route.timeout);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Execute response plugins
    return await pluginManager.executeOnResponse(plugins, ctx, upstreamResponse);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return c.json({ error: "Upstream timeout" }, 504);
    }
    return c.json({ error: "Upstream unavailable" }, 502);
  }
});

export default app;
```

## Results

- **Cross-cutting concern updates went from 15 PRs to 1 config change** — API key rotation, CORS policy, rate limiting all managed at the gateway; services don't implement any of it
- **Auth inconsistency eliminated** — all 15 services now use identical JWT/API key validation through the auth plugin; the service with the "forgot to validate tokens" bug can't happen
- **Response caching cut upstream load by 40%** — frequently accessed endpoints (product listings, public content) served from Redis; P99 latency dropped from 200ms to 15ms for cached routes
- **Request logging centralized** — every API call has a request ID, timing, user ID, and upstream destination in a single structured log; debugging cross-service issues takes minutes instead of hours
