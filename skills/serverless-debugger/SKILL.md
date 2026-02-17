---
name: serverless-debugger
description: >-
  Debug and optimize serverless functions (AWS Lambda, Vercel Functions, Cloudflare Workers).
  Use when someone asks to "debug Lambda", "trace serverless request", "fix cold starts",
  "analyze CloudWatch logs", "optimize Lambda performance", "reduce init duration",
  or "troubleshoot function timeout". Correlates logs across invocations and generates fixes.
license: Apache-2.0
compatibility: "AWS Lambda, Vercel Functions, Cloudflare Workers, Google Cloud Functions"
metadata:
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["serverless", "lambda", "debugging", "cold-start", "cloudwatch"]
---

# Serverless Debugger

## Overview

This skill helps you trace, debug, and optimize serverless function invocations. It correlates logs across chained functions, identifies cold start bottlenecks, analyzes timeout patterns, and generates optimized configurations to reduce latency and failure rates.

## Instructions

### Log Analysis and Request Tracing

When given CloudWatch logs, Vercel logs, or similar:

1. **Find the request**: Search for correlation ID, request ID, or timestamp range
2. **Build the trace**: Follow the request across all functions it touches, ordered by timestamp
3. **Identify the failure point**: Mark where errors, timeouts, or unexpected behavior occurred
4. **Root cause**: Determine why — cold start, timeout, OOM, unhandled exception, downstream failure
5. **Present as timeline**: Show each function invocation with START, key events, and END/ERROR

### Cold Start Analysis

When given invocation metrics or asked to analyze cold starts:

1. **Identify cold start invocations**: Look for `Init Duration` in CloudWatch or equivalent
2. **Calculate statistics**: P50, P95, P99 init durations per function
3. **Find patterns**: Time-of-day distribution, correlation with deployment events
4. **Diagnose causes**:
   - Large bundle size (>5MB is concerning, >10MB is critical)
   - Too many dependencies loaded at init
   - Heavy top-level initialization (DB connections, SDK clients)
   - Low memory allocation (Lambda CPU scales with memory)
5. **Recommend fixes** in priority order:
   - Tree-shake and bundle with esbuild/rollup (biggest impact)
   - Migrate AWS SDK v2 → v3 (modular imports)
   - Lazy-load heavy dependencies (only import when needed)
   - Increase memory allocation (more CPU = faster init)
   - Provisioned concurrency for latency-critical functions
   - Move to ARM/Graviton2 (10-20% faster init, 20% cheaper)

### Timeout Debugging

1. Check if timeout is from cold start + execution exceeding limit
2. Check for synchronous waits on downstream services
3. Check for missing `await` on promises (function exits before async work completes)
4. Check for connection pool exhaustion (DB, HTTP clients)
5. Recommend appropriate timeout values based on P99 execution time + buffer

### Configuration Generation

Generate platform-specific configs:
- **AWS SAM/CloudFormation**: template.yaml with memory, timeout, provisioned concurrency
- **Serverless Framework**: serverless.yml with esbuild plugin config
- **CDK**: TypeScript constructs with optimized settings
- **Vercel**: vercel.json with function configuration

## Examples

### Example 1: Tracing a Timeout

**Input**: "My order-processor Lambda timed out at 14:32 UTC. Here are CloudWatch logs."

**Output**:
```
Request Trace — req-abc123

14:32:01.100 [api-gateway] Request received: POST /orders
14:32:01.203 [auth-handler] ✅ 15ms — Token validated
14:32:01.340 [order-processor] START — Warm invocation
14:32:01.355 [order-processor] Validating order payload... OK
14:32:01.412 [order-processor] Calling inventory-check (sync HTTP)
14:32:31.412 [order-processor] ❌ TIMEOUT (30s limit reached)

Cause: inventory-check function had a 28s cold start (256MB memory,
22MB bundle). order-processor's synchronous HTTP call waited for the
full cold start + execution, exceeding its 30s timeout.

Fix: Set inventory-check to 1024MB memory (reduces cold start to ~4s),
add provisioned concurrency of 1, or make the call async with SQS.
```

### Example 2: Cold Start Optimization

**Input**: "Our payment function has 5s cold starts. Here's the package.json and handler code."

**Output**:
```
Cold Start Diagnosis — payment-handler

Current: 512MB memory | 18.4MB bundle | Init P95: 4,900ms

Issues Found:
1. Imports entire AWS SDK v2: `const AWS = require('aws-sdk')` — adds 8MB
   Fix: `import { DynamoDBClient } from '@aws-sdk/client-dynamodb'` — 400KB

2. Stripe SDK loaded at top level with full module
   Fix: Lazy import inside handler: `const stripe = await import('stripe')`

3. 512MB memory = 0.33 vCPU — init is CPU-bound
   Fix: Increase to 1024MB = 0.66 vCPU (init ~2x faster)

Projected After Fixes:
  Bundle: 18.4MB → 2.1MB
  Memory: 512MB → 1024MB
  Init P95: 4,900ms → ~380ms
  Monthly cost delta: +$3.20 (more memory but fewer retries)

serverless.yml changes:
  payment-handler:
    handler: src/payment.handler
    memorySize: 1024
    timeout: 15
    architecture: arm64
    provisionedConcurrency: 2
    bundling:
      minify: true
      sourcemap: true
      externalModules: []
```

## Guidelines

- Always check memory allocation first — it's the cheapest fix and most commonly misconfigured
- Bundle size is the #1 cold start contributor; always check `node_modules` bloat
- Provisioned concurrency costs money — only recommend for latency-critical paths (payments, auth)
- When tracing across functions, always note the gap between one function's END and the next function's START (network/API Gateway overhead)
- For Node.js: recommend esbuild for bundling, it's the fastest and handles tree-shaking well
- Never recommend `webpack` for Lambda — it's overkill; esbuild or rollup are better choices
- If the user's function connects to a database, check for connection pooling issues (Lambda creates new connections on cold start)
