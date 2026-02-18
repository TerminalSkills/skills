---
title: "Load Test APIs and Plan Capacity with AI"
slug: load-test-api-capacity-planning
description: "Design realistic load test scenarios, execute them with k6 or wrk, and translate results into infrastructure capacity plans."
skills: [api-load-tester, capacity-planner]
category: devops
tags: [load-testing, capacity-planning, performance, api, scalability]
---

# Load Test APIs and Plan Capacity with AI

## The Problem

Teams ship APIs without knowing their breaking point. A marketing campaign drives 5x normal traffic, and the checkout endpoint starts returning 503s. Post-mortems reveal nobody tested beyond 50 concurrent users, but production hit 800. Writing load tests is tedious — you need realistic payloads, proper ramp-up patterns, authentication flows, and meaningful assertions. Then you need to translate "p99 latency hit 2.3s at 400 RPS" into "we need X more pods or Y database connections."

## The Solution

Use `api-load-tester` to generate and execute realistic k6 load test scripts from your API specs or route definitions, and `capacity-planner` to analyze the results and produce scaling recommendations with cost estimates.

## Step-by-Step Walkthrough

### 1. Generate load test scenarios from API routes

```text
Look at our Express.js API in ./src/routes/ and generate k6 load test scripts.
Focus on the checkout flow: POST /api/cart/add, POST /api/orders/create, and
GET /api/orders/:id. Use realistic payloads based on our TypeScript interfaces
in ./src/types/. Include authentication with a JWT token flow.
```

The agent reads route definitions and types, then generates:

```javascript
// load-tests/checkout-flow.js (k6 script)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const orderLatency = new Trend('order_creation_latency');

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 200 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 500 },  // sustain peak
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    errors: ['rate<0.05'],
  },
};

export default function () {
  const cartPayload = JSON.stringify({
    productId: `prod_${Math.floor(Math.random() * 500) + 1}`,
    quantity: Math.floor(Math.random() * 3) + 1,
    variant: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
  });

  const addToCart = http.post(`${__ENV.BASE_URL}/api/cart/add`, cartPayload, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(addToCart, { 'cart add 200': (r) => r.status === 200 });
  // ... order creation and verification steps
}
```

### 2. Run the load test and collect results

```text
Run the checkout flow load test against our staging environment at
https://staging-api.example.com. Ramp up to 500 virtual users over 14 minutes.
Show me the results with focus on p95/p99 latency and error rates at each stage.
```

```text
Load Test Results — checkout-flow
─────────────────────────────────

Stage          VUs    RPS    p50     p95      p99     Error Rate
Ramp 0-50      50     120    45ms    89ms     142ms   0.0%
Ramp 50-200    200    380    62ms    210ms    480ms   0.2%
Ramp 200-500   500    620    185ms   890ms    2,340ms 3.8%  ⚠
Sustain 500    500    540    240ms   1,200ms  3,100ms 7.2%  🔴
Cool-down      →0     ↓      ↓       ↓        ↓      ↓

Breaking point identified: ~350 VUs / 520 RPS
  - p95 crosses 800ms threshold at 320 VUs
  - Error rate crosses 5% threshold at 420 VUs
  - Primary bottleneck: database connection pool (max 20, exhausted at 380 RPS)

Top slow endpoints:
  POST /api/orders/create   p99: 3,100ms at peak  (DB write contention)
  POST /api/cart/add        p99: 890ms at peak     (Redis connection queue)
  GET /api/orders/:id       p99: 320ms at peak     (acceptable)
```

### 3. Generate capacity plan from results

```text
Based on these results, create a capacity plan. We expect 3x current traffic
for our product launch in 6 weeks. Current production runs 3 API pods and
a single RDS db.r5.large with max_connections=100. What do we need?
```

```text
Capacity Plan — Product Launch (3x Traffic Target)
──────────────────────────────────────────────────

Current baseline: ~180 RPS sustained, 3 API pods, 1× db.r5.large
Target: 540 RPS sustained with p95 < 500ms and error rate < 1%

REQUIRED CHANGES                              Est. Monthly Cost Delta
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Database connection pool                   $0 (config change)
   Current: max_connections=100, pool_size=20
   Target: pool_size=60, max_connections=200
   Action: Update application config + RDS parameter group

2. Scale API pods: 3 → 8 pods                +$175/mo
   HPA: min=5, max=12, target CPU=65%
   Each pod: 500m CPU / 1Gi memory

3. RDS upgrade: db.r5.large → db.r5.xlarge   +$274/mo
   Doubles available memory and network bandwidth
   Add read replica for GET /api/orders/:id   +$274/mo

4. Redis: upgrade to r6g.large               +$86/mo
   Current connection limit insufficient at 500+ VUs

Total additional cost: ~$809/month
Cost per 1000 RPS: $1,498/month (current: $1,890/month — better efficiency)
```

### 4. Create pre-launch verification test

```text
Generate a final verification test script I can run after applying these
changes to confirm we can handle 3x traffic with acceptable latency.
```

## Real-World Example

Tomás, a backend lead at a 25-person e-commerce startup, had a product launch in 6 weeks with a TV ad campaign expected to drive 3x normal traffic. The team had never load-tested beyond manual curl commands.

1. He pointed the agent at the Express.js routes and asked for k6 scripts covering the full purchase flow
2. The agent generated scripts with realistic product payloads derived from the TypeScript interfaces, including JWT authentication
3. Running against staging revealed the breaking point at 350 concurrent users — well below the 800 expected during the TV spot
4. The bottleneck was a database connection pool of 20, exhausting at 380 RPS. The agent recommended increasing to 60 and upgrading the RDS instance
5. After applying changes, a verification test showed p95 at 310ms with 600 VUs and 0.3% error rate — well within targets

The launch handled peak traffic of 720 concurrent users with zero downtime. Total infrastructure cost increase was $809/month — far less than the revenue at risk.
