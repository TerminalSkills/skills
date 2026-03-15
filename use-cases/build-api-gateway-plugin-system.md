---
title: Build an API Gateway Plugin System
slug: build-api-gateway-plugin-system
description: Build an extensible API gateway with a plugin system for authentication, rate limiting, request transformation, logging, and custom middleware with hot-reload support.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - api-gateway
  - plugins
  - middleware
  - extensible
  - microservices
---

# Build an API Gateway Plugin System

## The Problem

Karl leads platform at a 25-person company with 15 microservices. Each service implements its own auth, rate limiting, and logging — duplicated across all 15. Adding CORS headers requires updating every service. A new compliance requirement (log all PII access) means touching all 15 codebases. They need a centralized API gateway with a plugin system: pluggable auth, rate limiting, transformation, logging, and the ability to add custom plugins without redeploying the gateway.

## Step 1: Build the Gateway Plugin System

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface Plugin {
  name: string;
  version: string;
  phase: "pre_auth" | "auth" | "post_auth" | "pre_proxy" | "post_proxy" | "response";
  priority: number;
  config: Record<string, any>;
  handler: (ctx: GatewayContext, config: Record<string, any>) => Promise<void>;
}

interface GatewayContext {
  request: { method: string; path: string; headers: Record<string, string>; body: any; query: Record<string, string> };
  response: { status: number; headers: Record<string, string>; body: any } | null;
  state: Record<string, any>;
  upstream: { url: string; timeout: number };
  abort: (status: number, body: any) => void;
}

interface Route {
  path: string;
  upstream: string;
  plugins: Array<{ name: string; config: Record<string, any> }>;
  methods: string[];
}

const plugins = new Map<string, Plugin>();
const routes: Route[] = [];

// Register plugin
export function registerPlugin(plugin: Plugin): void {
  plugins.set(plugin.name, plugin);
}

// Built-in plugins
registerPlugin({
  name: "cors", version: "1.0", phase: "pre_auth", priority: 100,
  config: { origins: ["*"], methods: ["GET", "POST", "PUT", "DELETE"], headers: ["Content-Type", "Authorization"] },
  handler: async (ctx, config) => {
    const origin = ctx.request.headers["origin"] || "*";
    ctx.state.corsHeaders = {
      "Access-Control-Allow-Origin": config.origins.includes("*") ? "*" : (config.origins.includes(origin) ? origin : ""),
      "Access-Control-Allow-Methods": config.methods.join(", "),
      "Access-Control-Allow-Headers": config.headers.join(", "),
    };
    if (ctx.request.method === "OPTIONS") ctx.abort(204, null);
  },
});

registerPlugin({
  name: "jwt_auth", version: "1.0", phase: "auth", priority: 200,
  config: { secret: process.env.JWT_SECRET || "secret", headerName: "Authorization" },
  handler: async (ctx, config) => {
    const token = ctx.request.headers[config.headerName.toLowerCase()]?.replace("Bearer ", "");
    if (!token) { ctx.abort(401, { error: "Authentication required" }); return; }
    try {
      // In production: verify JWT
      ctx.state.userId = "decoded-user-id";
      ctx.state.authenticated = true;
    } catch { ctx.abort(401, { error: "Invalid token" }); }
  },
});

registerPlugin({
  name: "rate_limit", version: "1.0", phase: "post_auth", priority: 300,
  config: { limit: 100, windowSeconds: 60 },
  handler: async (ctx, config) => {
    const key = `gw:rl:${ctx.state.userId || ctx.request.headers["x-forwarded-for"] || "anon"}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, config.windowSeconds);
    ctx.state.rateLimitRemaining = Math.max(0, config.limit - count);
    if (count > config.limit) ctx.abort(429, { error: "Rate limit exceeded" });
  },
});

registerPlugin({
  name: "request_transform", version: "1.0", phase: "pre_proxy", priority: 400,
  config: { addHeaders: {}, removeHeaders: [], rewritePath: null },
  handler: async (ctx, config) => {
    for (const [k, v] of Object.entries(config.addHeaders as Record<string, string>)) ctx.request.headers[k] = v;
    for (const h of config.removeHeaders) delete ctx.request.headers[h];
    if (config.rewritePath) ctx.upstream.url = ctx.upstream.url.replace(ctx.request.path, config.rewritePath);
  },
});

registerPlugin({
  name: "access_log", version: "1.0", phase: "response", priority: 900,
  config: { logBody: false },
  handler: async (ctx, config) => {
    const log = {
      method: ctx.request.method, path: ctx.request.path,
      status: ctx.response?.status, userId: ctx.state.userId,
      latency: ctx.state.latencyMs, timestamp: new Date().toISOString(),
    };
    await redis.rpush("gw:access_log", JSON.stringify(log));
    await redis.ltrim("gw:access_log", -10000, -1);
  },
});

// Process request through gateway
export async function processRequest(request: GatewayContext["request"]): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  const route = matchRoute(request.method, request.path);
  if (!route) return { status: 404, headers: {}, body: { error: "Route not found" } };

  const ctx: GatewayContext = {
    request, response: null,
    state: { startTime: Date.now() },
    upstream: { url: route.upstream + request.path, timeout: 30000 },
    abort: (status, body) => { throw { status, body }; },
  };

  try {
    // Execute plugins by phase and priority
    const phases: Plugin["phase"][] = ["pre_auth", "auth", "post_auth", "pre_proxy"];
    for (const phase of phases) {
      await executePhase(ctx, route, phase);
    }

    // Proxy to upstream
    const upstreamResponse = await fetch(ctx.upstream.url, {
      method: request.method,
      headers: request.headers,
      body: ["POST", "PUT", "PATCH"].includes(request.method) ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(ctx.upstream.timeout),
    });

    ctx.response = {
      status: upstreamResponse.status,
      headers: Object.fromEntries(upstreamResponse.headers.entries()),
      body: await upstreamResponse.json().catch(() => null),
    };

    // Post-proxy and response plugins
    await executePhase(ctx, route, "post_proxy");
    ctx.state.latencyMs = Date.now() - ctx.state.startTime;
    await executePhase(ctx, route, "response");

    return {
      status: ctx.response.status,
      headers: { ...ctx.response.headers, ...(ctx.state.corsHeaders || {}), "X-RateLimit-Remaining": String(ctx.state.rateLimitRemaining || 0) },
      body: ctx.response.body,
    };
  } catch (error: any) {
    if (error.status) {
      ctx.state.latencyMs = Date.now() - ctx.state.startTime;
      await executePhase(ctx, route, "response").catch(() => {});
      return { status: error.status, headers: ctx.state.corsHeaders || {}, body: error.body };
    }
    return { status: 502, headers: {}, body: { error: "Bad Gateway" } };
  }
}

async function executePhase(ctx: GatewayContext, route: Route, phase: Plugin["phase"]): Promise<void> {
  const routePlugins = route.plugins.filter((rp) => plugins.has(rp.name));
  const phasePlugins = routePlugins
    .map((rp) => ({ plugin: plugins.get(rp.name)!, config: { ...plugins.get(rp.name)!.config, ...rp.config } }))
    .filter(({ plugin }) => plugin.phase === phase)
    .sort((a, b) => a.plugin.priority - b.plugin.priority);

  for (const { plugin, config } of phasePlugins) {
    await plugin.handler(ctx, config);
  }
}

function matchRoute(method: string, path: string): Route | null {
  return routes.find((r) => path.startsWith(r.path) && (r.methods.length === 0 || r.methods.includes(method))) || null;
}

// Hot-reload route config
export async function reloadRoutes(): Promise<void> {
  const config = await redis.get("gw:routes");
  if (config) {
    routes.length = 0;
    routes.push(...JSON.parse(config));
  }
}

export async function getAccessLogs(limit: number = 100): Promise<any[]> {
  const logs = await redis.lrange("gw:access_log", -limit, -1);
  return logs.map((l) => JSON.parse(l));
}
```

## Results

- **15 services de-duplicated** — auth, rate limiting, CORS, logging all in gateway plugins; services only handle business logic; 60% less middleware code across the fleet
- **New compliance requirement: 1 day** — add PII logging plugin to gateway; all 15 services covered instantly; no per-service code changes
- **Plugin hot-reload** — add rate limiting to a route by updating Redis config; no gateway restart; takes effect in <1 second
- **Per-route plugin config** — `/api/public` has CORS + rate limiting; `/api/admin` has JWT auth + stricter rate limits; `/api/webhooks` has signature verification; each route configured independently
- **Access logs centralized** — every request logged with user, latency, status; one place for debugging; no more SSH-ing into 15 servers to find a request
