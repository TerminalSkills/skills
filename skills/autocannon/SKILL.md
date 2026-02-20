---
name: autocannon
description: >-
  Benchmark HTTP APIs with Autocannon. Use when a user asks to load test an
  API, measure request throughput, find performance bottlenecks, benchmark
  API endpoints, or compare server configurations.
license: Apache-2.0
compatibility: 'Node.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: testing
  tags:
    - autocannon
    - benchmarking
    - load-testing
    - performance
    - http
---

# Autocannon

## Overview

Autocannon is a fast HTTP benchmarking tool written in Node.js. It generates high request volumes to test API throughput, latency percentiles, and error rates. Lighter than k6 or Artillery for quick benchmarks.

## Instructions

### Step 1: CLI Usage

```bash
npm install -g autocannon

# Basic benchmark: 10 connections, 10 seconds
autocannon http://localhost:3000/api/projects

# Custom parameters
autocannon -c 100 -d 30 -p 10 http://localhost:3000/api/projects
# -c 100: 100 concurrent connections
# -d 30:  30 seconds duration
# -p 10:  10 pipelined requests per connection

# POST with body
autocannon -c 50 -d 20 -m POST \
  -H "Content-Type=application/json" \
  -H "Authorization=Bearer token123" \
  -b '{"name":"test","email":"test@example.com"}' \
  http://localhost:3000/api/users
```

### Step 2: Programmatic

```typescript
// benchmark.ts — Scripted benchmark with comparison
import autocannon from 'autocannon'

async function benchmark(title: string, url: string, opts = {}) {
  const result = await autocannon({
    url,
    connections: 100,
    duration: 10,
    ...opts,
  })

  console.log(`\n--- ${title} ---`)
  console.log(`Requests/sec: ${result.requests.average}`)
  console.log(`Latency avg:  ${result.latency.average}ms`)
  console.log(`Latency p99:  ${result.latency.p99}ms`)
  console.log(`Throughput:   ${(result.throughput.average / 1024 / 1024).toFixed(1)} MB/s`)
  console.log(`Errors:       ${result.errors}`)
  console.log(`Timeouts:     ${result.timeouts}`)

  return result
}

// Compare endpoints
await benchmark('GET /projects (cached)', 'http://localhost:3000/api/projects')
await benchmark('GET /projects (no cache)', 'http://localhost:3000/api/projects?nocache=1')
await benchmark('POST /tasks', 'http://localhost:3000/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Benchmark task', projectId: 'proj_1' }),
})
```

### Step 3: CI Integration

```yaml
# .github/workflows/perf.yml — Performance regression detection
- name: Start server
  run: npm start &
  env: { NODE_ENV: production, DATABASE_URL: ${{ secrets.TEST_DB_URL }} }

- name: Wait for server
  run: npx wait-on http://localhost:3000/health

- name: Benchmark
  run: |
    npx autocannon -c 50 -d 10 -j http://localhost:3000/api/projects > bench.json
    RPS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('bench.json')).requests.average)")
    echo "Requests/sec: $RPS"
    if [ "$RPS" -lt 1000 ]; then echo "Performance regression!" && exit 1; fi
```

## Guidelines

- Run benchmarks on isolated environments — other processes affect results.
- Focus on p99 latency, not average — outliers matter more for user experience.
- Start with low concurrency and increase — find where performance degrades.
- Benchmark after code changes to catch regressions early.
- Autocannon is for HTTP benchmarks. For load testing with scenarios, use k6.
