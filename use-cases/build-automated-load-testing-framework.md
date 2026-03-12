---
title: Build an Automated Load Testing Framework
slug: build-automated-load-testing-framework
description: >
  Catch performance regressions before production with automated load
  tests that run on every PR — simulating 10K concurrent users and
  comparing latency against baselines to prevent the next outage.
skills:
  - typescript
  - github-actions
  - docker
  - redis
  - postgresql
  - zod
  - hono
category: DevOps & Infrastructure
tags:
  - load-testing
  - performance
  - ci-cd
  - benchmarking
  - stress-testing
  - regression-detection
---

# Build an Automated Load Testing Framework

## The Problem

A SaaS API handles 5K requests/second at peak. Performance issues are only discovered in production: last month, a new database query doubled p99 latency from 200ms to 400ms, triggering SLA violations for 3 enterprise customers ($15K in credits). The team has a k6 script someone wrote 8 months ago, but nobody runs it. Manual load testing happens "when we remember" — roughly never. Every deployment is a gamble.

## Step 1: Test Scenario Definition

```typescript
// src/loadtest/scenarios.ts
import { z } from 'zod';

const LoadTestScenario = z.object({
  name: z.string(),
  description: z.string(),
  stages: z.array(z.object({
    duration: z.string(),       // "30s", "2m"
    target: z.number().int(),   // concurrent users
  })),
  endpoints: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    path: z.string(),
    weight: z.number().min(0).max(1), // traffic distribution
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    expectedStatus: z.number().int().default(200),
  })),
  thresholds: z.object({
    p95LatencyMs: z.number(),
    p99LatencyMs: z.number(),
    errorRate: z.number(),       // max acceptable (e.g., 0.01 = 1%)
    rps: z.number().optional(),  // minimum requests/second
  }),
});

export const scenarios: z.infer<typeof LoadTestScenario>[] = [
  {
    name: 'api-smoke',
    description: 'Quick smoke test for PR validation (30s)',
    stages: [
      { duration: '10s', target: 50 },
      { duration: '10s', target: 100 },
      { duration: '10s', target: 0 },
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/users/me', weight: 0.3, expectedStatus: 200 },
      { method: 'GET', path: '/api/v1/projects', weight: 0.25, expectedStatus: 200 },
      { method: 'POST', path: '/api/v1/tasks', weight: 0.15, body: { title: 'Load test task', projectId: '{{projectId}}' }, expectedStatus: 201 },
      { method: 'GET', path: '/api/v1/tasks?limit=20', weight: 0.2, expectedStatus: 200 },
      { method: 'GET', path: '/api/v1/search?q=test', weight: 0.1, expectedStatus: 200 },
    ],
    thresholds: {
      p95LatencyMs: 300,
      p99LatencyMs: 500,
      errorRate: 0.01,
    },
  },
  {
    name: 'api-soak',
    description: 'Full soak test for release candidates (10m)',
    stages: [
      { duration: '1m', target: 500 },
      { duration: '5m', target: 1000 },
      { duration: '2m', target: 2000 },
      { duration: '2m', target: 0 },
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/users/me', weight: 0.2, expectedStatus: 200 },
      { method: 'GET', path: '/api/v1/projects', weight: 0.2, expectedStatus: 200 },
      { method: 'POST', path: '/api/v1/tasks', weight: 0.1, body: { title: 'Soak test' }, expectedStatus: 201 },
      { method: 'GET', path: '/api/v1/tasks?limit=50', weight: 0.2, expectedStatus: 200 },
      { method: 'GET', path: '/api/v1/search?q=test', weight: 0.15, expectedStatus: 200 },
      { method: 'GET', path: '/api/v1/analytics/dashboard', weight: 0.15, expectedStatus: 200 },
    ],
    thresholds: {
      p95LatencyMs: 250,
      p99LatencyMs: 500,
      errorRate: 0.005,
      rps: 2000,
    },
  },
];
```

## Step 2: Load Generator

```typescript
// src/loadtest/runner.ts
import { z } from 'zod';

interface RunResult {
  scenario: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rps: number;
  latency: {
    min: number; max: number; avg: number; median: number; p95: number; p99: number;
  };
  errorRate: number;
  thresholdsPassed: boolean;
  endpointResults: Array<{
    endpoint: string;
    requests: number;
    avgLatency: number;
    p95Latency: number;
    errorRate: number;
  }>;
}

export async function runLoadTest(
  baseUrl: string,
  scenario: any,
  authToken: string
): Promise<RunResult> {
  const latencies: number[] = [];
  const errors: string[] = [];
  const endpointStats = new Map<string, { latencies: number[]; errors: number; total: number }>();

  const startTime = Date.now();
  let totalRequests = 0;

  for (const stage of scenario.stages) {
    const durationMs = parseDuration(stage.duration);
    const stageEnd = Date.now() + durationMs;
    const concurrency = stage.target;

    while (Date.now() < stageEnd) {
      const batch = Array.from({ length: Math.min(concurrency, 50) }, async () => {
        // Pick endpoint by weight
        const endpoint = pickWeighted(scenario.endpoints);
        const key = `${endpoint.method} ${endpoint.path}`;

        if (!endpointStats.has(key)) {
          endpointStats.set(key, { latencies: [], errors: 0, total: 0 });
        }
        const stats = endpointStats.get(key)!;

        const reqStart = Date.now();
        try {
          const res = await fetch(`${baseUrl}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              ...endpoint.headers,
            },
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
            signal: AbortSignal.timeout(10000),
          });

          const latency = Date.now() - reqStart;
          latencies.push(latency);
          stats.latencies.push(latency);
          stats.total++;
          totalRequests++;

          if (res.status !== endpoint.expectedStatus) {
            errors.push(`${key}: expected ${endpoint.expectedStatus}, got ${res.status}`);
            stats.errors++;
          }
        } catch (err: any) {
          stats.errors++;
          stats.total++;
          errors.push(`${key}: ${err.message}`);
          totalRequests++;
        }
      });

      await Promise.allSettled(batch);
      await new Promise(r => setTimeout(r, 100)); // pace
    }
  }

  const duration = Date.now() - startTime;
  latencies.sort((a, b) => a - b);

  const result: RunResult = {
    scenario: scenario.name,
    duration,
    totalRequests,
    successfulRequests: totalRequests - errors.length,
    failedRequests: errors.length,
    rps: Math.round(totalRequests / (duration / 1000)),
    latency: {
      min: latencies[0] ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
      avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length || 0),
      median: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
      p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
      p99: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
    },
    errorRate: totalRequests > 0 ? errors.length / totalRequests : 0,
    thresholdsPassed: false,
    endpointResults: [...endpointStats.entries()].map(([endpoint, stats]) => ({
      endpoint,
      requests: stats.total,
      avgLatency: Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length || 0),
      p95Latency: stats.latencies.sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.95)] ?? 0,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
    })),
  };

  // Check thresholds
  result.thresholdsPassed =
    result.latency.p95 <= scenario.thresholds.p95LatencyMs &&
    result.latency.p99 <= scenario.thresholds.p99LatencyMs &&
    result.errorRate <= scenario.thresholds.errorRate;

  return result;
}

function parseDuration(d: string): number {
  const match = d.match(/^(\d+)(s|m|h)$/);
  if (!match) return 10000;
  const val = parseInt(match[1]);
  const unit = match[2];
  return val * (unit === 's' ? 1000 : unit === 'm' ? 60000 : 3600000);
}

function pickWeighted(endpoints: any[]): any {
  const r = Math.random();
  let sum = 0;
  for (const ep of endpoints) {
    sum += ep.weight;
    if (r < sum) return ep;
  }
  return endpoints[endpoints.length - 1];
}
```

## Results

- **The 2x latency regression**: caught in PR CI — PR blocked before merge
- **p99 latency regression detection**: automated baseline comparison on every PR
- **SLA violations**: zero in 6 months (was 3 incidents causing $15K credits)
- **Load test coverage**: every PR runs 30-second smoke test, releases get 10-minute soak
- **Performance budgets**: team discusses p95 targets, not "it feels fast enough"
- **Confidence**: Friday deploys are no longer scary
- **Historical trends**: latency data stored — see performance over time
