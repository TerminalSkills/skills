---
title: Profile and Optimize API Performance
slug: profile-and-optimize-api-performance
description: >-
  Find and fix API performance bottlenecks using structured logging, distributed
  tracing, and HTTP benchmarking. Identify slow database queries, inefficient
  serialization, and memory leaks.
skills:
  - pino
  - otel-js
  - autocannon
  - lighthouse-ci
  - grafana
category: devops
tags:
  - performance
  - profiling
  - optimization
  - tracing
  - benchmarking
---

# Profile and Optimize API Performance

Priya's dashboard API serves 500 concurrent users. Response times average 200ms but spike to 3-5 seconds during peak hours. Users complain about slow page loads. The team doesn't know which endpoints are slow, why they're slow, or whether the problem is the database, the application, or the network. She instruments the entire stack to find the bottlenecks.

## Step 1: Add Structured Logging

Before optimizing, you need visibility. Priya replaces `console.log` with Pino and adds timing to every request.

```typescript
// lib/logger.ts — Structured logging with request timing
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'dashboard-api', version: '2.1.0' },
})
```

```typescript
// middleware/timing.ts — Request timing middleware
import { logger } from '../lib/logger'

export function timingMiddleware(req, res, next) {
  const start = process.hrtime.bigint()
  const reqLogger = logger.child({
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    method: req.method,
    path: req.path,
    userId: req.user?.id,
  })

  req.log = reqLogger

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000

    const logData = {
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    }

    if (durationMs > 1000) {
      reqLogger.warn(logData, 'Slow request')
    } else {
      reqLogger.info(logData, 'Request completed')
    }
  })

  next()
}
```

After deploying this, Priya queries the logs and immediately spots the pattern: `GET /api/dashboard/analytics` averages 2,800ms, while all other endpoints are under 300ms. But she still doesn't know *where* in that handler the time is spent.

## Step 2: Add Distributed Tracing

OpenTelemetry traces every operation within a request — database queries, HTTP calls to other services, cache lookups, serialization time.

```typescript
// instrumentation.ts — OpenTelemetry auto-instrumentation
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({ [ATTR_SERVICE_NAME]: 'dashboard-api' }),
  traceExporter: new OTLPTraceExporter({ url: 'http://tempo:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-pg': { enabled: true },
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingPaths: ['/health'],
    },
  })],
})
sdk.start()
```

The traces reveal the problem. The analytics endpoint makes 47 separate database queries — a classic N+1 problem. For each project (avg 15 per user), it queries tasks, then for each task queries assignees, then for each assignee queries their activity. The waterfall of sequential queries is what causes the 2.8s response time.

## Step 3: Fix the N+1 Problem

```typescript
// BEFORE: N+1 queries (47 queries, 2800ms)
async function getAnalytics(userId: string) {
  const projects = await db.query('SELECT * FROM projects WHERE owner_id = $1', [userId])

  for (const project of projects) {
    project.tasks = await db.query('SELECT * FROM tasks WHERE project_id = $1', [project.id])
    for (const task of project.tasks) {
      task.assignee = await db.query('SELECT * FROM users WHERE id = $1', [task.assignee_id])
    }
  }
  return projects
}

// AFTER: 2 queries with JOINs (2 queries, 120ms)
async function getAnalytics(userId: string) {
  const projects = await db.query(`
    SELECT
      p.id, p.name, p.status,
      COUNT(t.id) as task_count,
      COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_count,
      COUNT(DISTINCT t.assignee_id) as team_size,
      json_agg(json_build_object(
        'id', t.id, 'title', t.title, 'status', t.status,
        'assignee_name', u.name
      )) FILTER (WHERE t.id IS NOT NULL) as tasks
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE p.owner_id = $1
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `, [userId])

  return projects
}
```

## Step 4: Benchmark the Fix

```typescript
// benchmark/analytics.ts — Verify improvement with autocannon
import autocannon from 'autocannon'

const result = await autocannon({
  url: 'http://localhost:3000/api/dashboard/analytics',
  connections: 50,
  duration: 30,
  headers: { Authorization: 'Bearer test-token' },
})

console.log(`Requests/sec: ${result.requests.average}`)
console.log(`Latency avg:  ${result.latency.average}ms`)
console.log(`Latency p99:  ${result.latency.p99}ms`)

// Before: 15 req/s, avg 2800ms, p99 4200ms
// After:  380 req/s, avg 120ms, p99 250ms — 25x improvement
```

## Step 5: Add Performance Budget in CI

```javascript
// lighthouserc.js — Prevent frontend performance regression
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/dashboard'],
      startServerCommand: 'npm start',
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
  },
}
```

## Results

The analytics endpoint goes from 2,800ms to 120ms — a 23x improvement. The database drops from 47 queries per request to 2. Under load (50 concurrent users), the API handles 380 requests/second instead of 15. The structured logging reveals that two other endpoints also have N+1 problems (project details and team overview), which the team fixes using the same pattern. Over the next month, the Lighthouse CI budget catches a bundle size regression (a developer imported the entire lodash library) and a layout shift from a lazy-loaded image without dimensions. p99 latency stays under 300ms across all endpoints.
