---
title: Build Database Connection Pooling with Health Checks
slug: build-database-connection-pooling
description: Build a production-grade database connection pool with health checks, query timeouts, connection lifecycle management, and observability — eliminating connection exhaustion and leaked connections.
skills:
  - typescript
  - postgresql
  - hono
  - postgres-js
category: development
tags:
  - database
  - connection-pool
  - performance
  - observability
  - postgres
---

# Build Database Connection Pooling with Health Checks

## The Problem

Marcus runs backend at a 35-person SaaS handling 5,000 requests/second. Every request opens a new PostgreSQL connection, runs a query, and closes it. During traffic spikes, Postgres hits `max_connections` (default 100), new requests fail with "too many clients already," and the app returns 500s. Leaked connections from uncaught errors compound the problem — the pool slowly drains until restart. They need connection pooling with limits, timeouts, automatic recycling of old connections, and metrics to see what is happening.

## The Solution

Use node-postgres (`pg`) and its built-in `Pool`. It already queues surplus requests, recycles connections (`maxLifetimeSeconds`), closes idle ones, and takes server-side timeouts as connection options. The code below adds only what `pg` does not give you: a leak-proof checkout helper, counters, and health/metrics endpoints served with Hono. Tested with `pg` 8.23, `hono` 4.13 and `@hono/node-server` 2.1 against PostgreSQL 16.

```console
$ npm install pg hono @hono/node-server
$ npm install -D typescript @types/pg @types/node
```

Set `DATABASE_URL` in the environment (for example `postgres://app:$DB_PASSWORD@db.internal:5432/app`). For TLS, add `?sslmode=verify-full` and supply the CA; do not turn certificate verification off.

## Step-by-Step Walkthrough

### Step 1: Configure the pool and a leak-proof checkout

```typescript
// src/db/pool.ts — one shared pg Pool plus the counters we want to graph
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),   // hard ceiling per app instance
  min: Number(process.env.DB_POOL_MIN ?? 2),    // idle connections below this are never closed
  idleTimeoutMillis: 30_000,                    // close idle connections after 30 s
  connectionTimeoutMillis: 5_000,               // fail pool.connect() instead of queueing forever
  maxLifetimeSeconds: 3600,                     // recycle every connection after 1 h
  statement_timeout: 30_000,                    // server-side: cancel queries after 30 s
  query_timeout: 35_000,                        // client-side backstop
  idle_in_transaction_session_timeout: 60_000,  // server kills forgotten transactions
  keepAlive: true,                              // TCP keepalive survives NAT/firewall idle timers
});

export const stats = { queries: 0, failed: 0, totalMs: 0, poolErrors: 0, slow: 0 };

// An error on an idle client (Postgres restart, network drop) must never crash the process.
pool.on("error", (err) => {
  stats.poolErrors++;
  console.error("[db] idle client error:", err.message);
});

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  const t0 = performance.now();
  try {
    return await pool.query<R>(text, params);
  } catch (err) {
    stats.failed++;
    throw err;
  } finally {
    const ms = performance.now() - t0;
    stats.queries++;
    stats.totalMs += ms;
    if (ms > 1000) {
      stats.slow++;
      console.warn(`[db] slow query (${Math.round(ms)} ms): ${text.slice(0, 120)}`);
    }
  }
}

// Leak-proof checkout: release always runs, even when fn throws.
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

export function snapshot() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    active: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount,
    max: pool.options.max ?? 10,
    ...stats,
    avgMs: stats.queries ? Math.round(stats.totalMs / stats.queries) : 0,
  };
}

export const shutdown = () => pool.end();
```

Why these options:

- `max` is per application instance. Instances × `max` must stay below Postgres `max_connections` minus a reserve for admin and migration sessions. With 4 instances, `max: 20` uses 80 of the default 100. Beyond that, put PgBouncer in front of Postgres.
- `min` does not pre-open connections. It only stops the pool from closing idle ones below that count.
- `statement_timeout` and `idle_in_transaction_session_timeout` are sent to the server on connect, so a runaway query or a forgotten `BEGIN` is killed by Postgres itself, not by the app.
- `maxLifetimeSeconds` closes each connection after the given age (checked while it is idle), so long-lived sessions do not outlive firewall or failover changes.
- Always use `query()` for single statements (the pool checks out and releases for you) and `withClient()` / `withTransaction()` when you need several statements on one connection. Never call `pool.connect()` without a `finally { client.release() }`; that is what leaks connections.

### Step 2: Add health and metrics endpoints

```typescript
// src/server.ts — health and metrics endpoints (Hono on Node)
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { query, snapshot, shutdown } from "./db/pool.js";

const app = new Hono();

// Readiness: a real round trip through the pool, not just counters.
app.get("/health/db", async (c) => {
  const s = snapshot();
  try {
    await query("SELECT 1");
  } catch (err) {
    return c.json({ status: "down", error: (err as Error).message }, 503);
  }
  const saturated = s.waiting > 0 && s.active >= s.max;
  return c.json({ status: saturated ? "degraded" : "healthy", pool: s }, saturated ? 503 : 200);
});

// Prometheus text exposition format
app.get("/metrics/db", (c) => {
  const s = snapshot();
  const g = (name: string, type: string, v: number) => `# TYPE ${name} ${type}\n${name} ${v}`;
  return c.text(
    [
      g("db_pool_connections", "gauge", s.total),
      g("db_pool_idle_connections", "gauge", s.idle),
      g("db_pool_waiting_requests", "gauge", s.waiting),
      g("db_queries_total", "counter", s.queries),
      g("db_queries_failed_total", "counter", s.failed),
      g("db_slow_queries_total", "counter", s.slow),
      g("db_pool_errors_total", "counter", s.poolErrors),
    ].join("\n") + "\n",
    200,
    { "Content-Type": "text/plain; version=0.0.4" },
  );
});

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => server.close(async () => { await shutdown(); process.exit(0); }));
}
```

Build and run it with `npx tsc && node dist/server.js` (set `"module": "NodeNext"` in `tsconfig.json`). The server binds to `127.0.0.1`; expose it through your reverse proxy or change the hostname deliberately. Use `/health/db` as the readiness probe, so a pod that cannot reach Postgres is taken out of rotation, and scrape `/metrics/db` with Prometheus.

### Step 3: Verify the behaviour

```console
$ curl -s http://127.0.0.1:3000/health/db
{"status":"healthy","pool":{"total":1,"idle":1,"active":0,"waiting":0,"max":20,...}}
$ curl -s http://127.0.0.1:3000/metrics/db | head -4
# TYPE db_pool_connections gauge
db_pool_connections 1
# TYPE db_pool_idle_connections gauge
db_pool_idle_connections 1
```

To prove the timeout works, run `SELECT pg_sleep(60)` through `query()`: Postgres answers `canceling statement due to statement timeout` after 30 seconds and the connection returns to the pool. To prove saturation shows up, fire more than `max` concurrent slow queries and watch `db_pool_waiting_requests` rise while `/health/db` reports `degraded`.

## Real-World Example

Marcus's team deploys four API instances with `max: 20` each. After the change, spikes queue inside the app for a few milliseconds instead of exhausting Postgres, and `connectionTimeoutMillis` turns a stuck queue into a fast, visible error rather than a hang. The slow-query log lines point at the endpoints worth indexing, and an alert on `db_pool_waiting_requests > 0` for two minutes tells the team to raise `max` or add PgBouncer before users notice.

## Related Skills

- [typescript](../skills/typescript/SKILL.md) — typing the pool helpers
- [postgresql](../skills/postgresql/SKILL.md) — `max_connections`, timeouts and server-side settings
- [hono](../skills/hono/SKILL.md) — the health and metrics endpoints
- [postgres-js](../skills/postgres-js/SKILL.md) — an alternative to `pg` for the same pool: `max`, `idle_timeout`, `queue_timeout`, and `prepare: false` behind PgBouncer
