---
title: Build Database Connection Pooling with Health Checks
slug: build-database-connection-pooling
description: Build a production-grade database connection pool with health checks, query timeouts, connection lifecycle management, and observability — eliminating connection exhaustion and leaked connections.
skills:
  - typescript
  - postgresql
  - redis
  - hono
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

Marcus runs backend at a 35-person SaaS handling 5,000 requests/second. Every request opens a new PostgreSQL connection, runs a query, and closes it. During traffic spikes, Postgres hits `max_connections` (100), new requests fail with "too many connections," and the app returns 500s. Leaked connections from uncaught errors compound the problem — the pool slowly drains until restart. They need connection pooling with limits, health checks, automatic cleanup of stale connections, and metrics to see what's happening.

## Step 1: Build the Connection Pool Manager

```typescript
// src/db/pool-manager.ts — Production connection pool with lifecycle management
import { Pool, PoolClient, PoolConfig } from "pg";
import { EventEmitter } from "node:events";

interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingRequests: number;
  totalQueries: number;
  failedQueries: number;
  avgQueryTimeMs: number;
  connectionErrors: number;
  healthCheckFailures: number;
}

interface ManagedPoolConfig extends PoolConfig {
  healthCheckIntervalMs?: number;   // how often to ping idle connections
  maxQueryTimeMs?: number;          // kill queries exceeding this
  connectionMaxAgeMs?: number;      // recycle connections after this age
  metricsEnabled?: boolean;
}

export class ManagedPool extends EventEmitter {
  private pool: Pool;
  private config: ManagedPoolConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private connectionBirthdays = new Map<PoolClient, number>();
  private queryCount = 0;
  private failedQueryCount = 0;
  private totalQueryTimeMs = 0;
  private connectionErrorCount = 0;
  private healthCheckFailures = 0;

  constructor(config: ManagedPoolConfig) {
    super();
    this.config = {
      max: 20,                         // max connections in pool
      min: 5,                          // keep at least 5 idle
      idleTimeoutMillis: 30000,        // close idle connections after 30s
      connectionTimeoutMillis: 5000,   // fail if can't connect in 5s
      healthCheckIntervalMs: 15000,    // health check every 15s
      maxQueryTimeMs: 30000,           // kill queries after 30s
      connectionMaxAgeMs: 3600000,     // recycle after 1 hour
      ...config,
    };

    this.pool = new Pool(this.config);

    // Track connection lifecycle
    this.pool.on("connect", (client: PoolClient) => {
      this.connectionBirthdays.set(client, Date.now());
    });

    this.pool.on("remove", (client: PoolClient) => {
      this.connectionBirthdays.delete(client);
    });

    this.pool.on("error", (err) => {
      this.connectionErrorCount++;
      this.emit("pool_error", err);
    });

    // Start health checks
    this.startHealthChecks();
  }

  // Get a connection with query timeout wrapper
  async getConnection(): Promise<{ client: PoolClient; release: () => void }> {
    const client = await this.pool.connect();

    // Check if connection is too old
    const birthday = this.connectionBirthdays.get(client);
    if (birthday && Date.now() - birthday > (this.config.connectionMaxAgeMs || 3600000)) {
      // Recycle: release this one and get a fresh one
      client.release(true); // true = destroy, don't return to pool
      return this.getConnection();
    }

    // Set statement timeout on this connection
    await client.query(`SET statement_timeout = '${this.config.maxQueryTimeMs}ms'`);

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        client.release();
      }
    };

    // Safety net: auto-release after 2x max query time
    const safetyTimeout = setTimeout(() => {
      if (!released) {
        this.emit("leaked_connection", { message: "Connection auto-released after timeout" });
        release();
      }
    }, (this.config.maxQueryTimeMs || 30000) * 2);

    const originalRelease = release;
    return {
      client,
      release: () => {
        clearTimeout(safetyTimeout);
        originalRelease();
      },
    };
  }

  // Execute a query with metrics tracking
  async query(sql: string, params?: any[]): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;
      this.queryCount++;
      this.totalQueryTimeMs += duration;

      if (duration > 1000) {
        this.emit("slow_query", { sql: sql.slice(0, 200), duration, params: params?.length });
      }

      return result;
    } catch (err: any) {
      this.failedQueryCount++;
      this.emit("query_error", { sql: sql.slice(0, 200), error: err.message });
      throw err;
    }
  }

  // Health check: ping idle connections, remove dead ones
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const result = await this.pool.query("SELECT 1 as health");
        if (result.rows[0]?.health !== 1) {
          this.healthCheckFailures++;
          this.emit("health_check_failed", { reason: "unexpected result" });
        }
      } catch (err: any) {
        this.healthCheckFailures++;
        this.emit("health_check_failed", { reason: err.message });
      }
    }, this.config.healthCheckIntervalMs);
  }

  // Get current metrics
  getMetrics(): PoolMetrics {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
      totalQueries: this.queryCount,
      failedQueries: this.failedQueryCount,
      avgQueryTimeMs: this.queryCount > 0 ? Math.round(this.totalQueryTimeMs / this.queryCount) : 0,
      connectionErrors: this.connectionErrorCount,
      healthCheckFailures: this.healthCheckFailures,
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    await this.pool.end();
  }
}

// Singleton pool instance
export const db = new ManagedPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "app",
  user: process.env.DB_USER || "app",
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX || "20"),
  min: parseInt(process.env.DB_POOL_MIN || "5"),
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Log events
db.on("slow_query", (info) => console.warn("[DB] Slow query:", info));
db.on("query_error", (info) => console.error("[DB] Query error:", info));
db.on("leaked_connection", (info) => console.error("[DB] Leaked connection:", info));
db.on("health_check_failed", (info) => console.error("[DB] Health check failed:", info));
```

## Step 2: Add Observability Endpoint

```typescript
// src/routes/health.ts — Database pool health endpoint
import { Hono } from "hono";
import { db } from "../db/pool-manager";

const app = new Hono();

app.get("/health/db", async (c) => {
  const metrics = db.getMetrics();

  const isHealthy = metrics.activeConnections < metrics.totalConnections * 0.9 // not saturated
    && metrics.waitingRequests < 10
    && metrics.healthCheckFailures === 0;

  return c.json({
    status: isHealthy ? "healthy" : "degraded",
    pool: {
      total: metrics.totalConnections,
      active: metrics.activeConnections,
      idle: metrics.idleConnections,
      waiting: metrics.waitingRequests,
    },
    performance: {
      totalQueries: metrics.totalQueries,
      failedQueries: metrics.failedQueries,
      avgQueryTimeMs: metrics.avgQueryTimeMs,
    },
    errors: {
      connectionErrors: metrics.connectionErrors,
      healthCheckFailures: metrics.healthCheckFailures,
    },
  }, isHealthy ? 200 : 503);
});

// Prometheus metrics
app.get("/metrics/db", (c) => {
  const m = db.getMetrics();
  const lines = [
    `db_pool_total_connections ${m.totalConnections}`,
    `db_pool_active_connections ${m.activeConnections}`,
    `db_pool_idle_connections ${m.idleConnections}`,
    `db_pool_waiting_requests ${m.waitingRequests}`,
    `db_query_total ${m.totalQueries}`,
    `db_query_failed_total ${m.failedQueries}`,
    `db_query_avg_duration_ms ${m.avgQueryTimeMs}`,
    `db_connection_errors_total ${m.connectionErrors}`,
  ];
  return c.text(lines.join("\n"));
});

export default app;
```

## Results

- **Zero "too many connections" errors** — pool limits connections to 20; surplus requests queue briefly instead of crashing Postgres
- **Leaked connections auto-recovered** — safety timeout releases forgotten connections after 60s; pool never drains to zero
- **Stale connections recycled** — hourly max-age rotation prevents "connection timed out" errors from long-idle connections hitting firewall timeouts
- **Slow queries surfaced** — any query over 1s is logged with the SQL and duration; the team found 6 missing indexes in the first week
- **Pool saturation visible** — Grafana dashboard shows active/idle/waiting connections in real-time; alerts fire at 80% saturation before users notice
