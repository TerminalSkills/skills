---
title: Profile and Optimize API Performance
slug: profile-and-optimize-api-performance
description: >-
  Find and fix API performance bottlenecks using structured logging, distributed
  tracing, and k6 load testing. Identify slow database queries, inefficient
  serialization, and memory leaks.
skills:
  - pino
  - otel-js
  - k6
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

```bash
npm install pino
```

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
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger'

export function timingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint()
  const reqLogger = logger.child({
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    method: req.method,
    path: req.path,
  })

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

OpenTelemetry traces every operation within a request — database queries, HTTP calls to other services, cache lookups, serialization time. The current Node SDK (3.x) needs Node.js 22.15 or newer.

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions
```

```typescript
// instrumentation.ts — OpenTelemetry auto-instrumentation
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'dashboard-api' }),
  traceExporter: new OTLPTraceExporter(),   // endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-pg': { enabled: true },
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => req.url === '/health',
    },
  })],
})
sdk.start()
process.on('SIGTERM', () => { sdk.shutdown().finally(() => process.exit(0)) })
```

Load it before the application code and point it at the OTLP receiver of her tracing backend (Grafana Tempo, here). The variable is a base URL; the exporter appends `/v1/traces` itself:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318 node --import ./instrumentation.ts src/server.ts
```

Node 22.18+ and 24 run the `.ts` files directly; on Node 22.15-22.17 compile first and pass the `.js` files. If the app uses ES modules, also add `--experimental-loader=@opentelemetry/instrumentation/hook.mjs`, otherwise only the HTTP server span is traced and the `pg` query spans are missing (the otel-js skill covers this).

In Grafana, Priya opens Explore, picks the Tempo data source, searches for the service `dashboard-api` and sorts by duration. The slowest traces are all `GET /api/dashboard/analytics`.

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

// AFTER: one JOIN query (120ms)
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

```javascript
// benchmark/analytics.js — verify the improvement with k6
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<500'],
  },
  summaryTrendStats: ['avg', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/dashboard/analytics`, {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```

```bash
k6 run -e BASE_URL=http://127.0.0.1:3000 -e API_TOKEN="$API_TOKEN" benchmark/analytics.js
```

The run exits with code 99 if a threshold fails, so the same script can gate a CI job. Priya's numbers from her staging run: before the fix, 15 req/s, avg 2,800ms, p99 4,200ms; after, 380 req/s, avg 120ms, p99 250ms.

## Step 5: Add Performance Budget in CI

The dashboard front end gets a budget too. Install the Lighthouse CI CLI as a dev dependency (the current 0.16 needs Node.js 22.19 or newer) and run `npx lhci autorun` in CI with this config:

```bash
npm install --save-dev @lhci/cli
```

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

The analytics endpoint goes from 2,800ms to 120ms — a 23x improvement. The database drops from 47 queries per request to 1. Under load (50 virtual users), the API handles 380 requests/second instead of 15 (her staging numbers, not a general benchmark). The structured logging reveals that two other endpoints also have N+1 problems (project details and team overview), which the team fixes using the same pattern. Over the next month, the Lighthouse CI budget catches a bundle size regression (a developer imported the entire lodash library) and a layout shift from a lazy-loaded image without dimensions. p99 latency stays under 300ms across all endpoints.

## Related Skills

- **pino** — structured JSON logging and per-request timing that exposes the slow endpoint (Step 1).
- **otel-js** — OpenTelemetry tracing that shows where inside the handler the time goes (Step 2).
- **k6** — load test with thresholds to prove the fix under 50 virtual users (Step 4).
- **lighthouse-ci** — frontend performance budget enforced in CI (Step 5).
- **grafana** — Explore with the Tempo data source to read the traces (Step 2).
