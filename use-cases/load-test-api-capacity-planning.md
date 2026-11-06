---
title: "Load Test APIs and Plan Capacity with AI"
slug: load-test-api-capacity-planning
description: "Design realistic load test scenarios, execute them with k6, and translate results into infrastructure capacity plans."
skills: [api-load-tester, k6, capacity-planner]
category: devops
tags: [load-testing, capacity-planning, performance, api, scalability]
---

# Load Test APIs and Plan Capacity with AI

## The Problem

Teams ship APIs without knowing their breaking point. A marketing campaign drives 5x normal traffic, and the checkout endpoint starts returning 503s. Post-mortems reveal nobody tested beyond 50 concurrent users, but production hit 800. Writing load tests is tedious: you need realistic payloads, proper ramp-up patterns, authentication flows, and meaningful assertions. Then you need to translate "p99 latency hit 2.3s at 400 RPS" into "we need X more pods or Y database connections."

## The Solution

The **api-load-tester** skill generates and executes load tests from API specs or route definitions, the **k6** skill supplies the script structure (scenarios, executors, thresholds, exit codes), and **capacity-planner** turns the results into scaling recommendations with a connection budget and cost lines you price yourself. The agent turns vague anxiety about traffic into a concrete infrastructure plan.

## Step-by-Step Walkthrough

### Step 1: Generate Load Test Scenarios from API Routes

```text
Look at our Express.js API in ./src/routes/ and generate k6 load test scripts.
Focus on the checkout flow: POST /api/cart/add, POST /api/orders/create, and
GET /api/orders/:id. Use realistic payloads based on our TypeScript interfaces
in ./src/types/. Authenticate with a JWT passed in as an environment variable.
```

The agent reads route definitions and TypeScript interfaces, then generates a k6 script with realistic payloads, not placeholder data:

```javascript
// load-tests/checkout-flow.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const orderLatency = new Trend('order_creation_latency', true);

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 200 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 500 }, // sustain peak
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

const params = {
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${__ENV.TOKEN}` },
};

export default function () {
  const base = __ENV.BASE_URL;

  const cart = http.post(
    `${base}/api/cart/add`,
    JSON.stringify({
      productId: `prod_${Math.floor(Math.random() * 500) + 1}`,
      quantity: Math.floor(Math.random() * 3) + 1,
      variant: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
    }),
    { ...params, tags: { name: 'cart_add' } },
  );
  check(cart, { 'cart add 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2); // think time

  const order = http.post(
    `${base}/api/orders/create`,
    JSON.stringify({ cartId: cart.json('cartId') }),
    { ...params, tags: { name: 'order_create' } },
  );
  orderLatency.add(order.timings.duration);
  check(order, { 'order created': (r) => r.status === 201 });
  sleep(1 + Math.random() * 2);

  // the name tag keeps /api/orders/:id from creating one metric series per order
  const fetched = http.get(`${base}/api/orders/${order.json('id')}`, {
    ...params,
    tags: { name: 'order_get' },
  });
  check(fetched, { 'order fetched': (r) => r.status === 200 });
}
```

The ramp-up is intentional: start at 10 VUs to establish a baseline, climb to 500 over 10 minutes to find the breaking point, sustain peak for 2 minutes to expose resource exhaustion, then cool down to observe recovery. Thresholds make `k6 run` exit with code 99 when they are breached, which is what CI keys on. Smoke-test the script first with `k6 run --vus 1 --iterations 5 -e BASE_URL=... -e TOKEN=... load-tests/checkout-flow.js`.

### Step 2: Run the Load Test and Analyze Results

```bash
k6 run -e BASE_URL=https://staging-api.example.com -e TOKEN="$LOAD_TEST_TOKEN" \
  --out json=results.json load-tests/checkout-flow.js
```

Only run this against an environment you own (staging, never production). A ramping-VU test holds concurrency, not request rate: as the server slows down, RPS drops, so read RPS and latency together. Ask the agent to break `results.json` down per stage, with focus on p95/p99 latency and error rates. The numbers below are the example team's results, not a benchmark:

| Stage | VUs | RPS | p50 | p95 | p99 | Error Rate |
|-------|-----|-----|-----|-----|-----|------------|
| Ramp 0-50 | 50 | 120 | 45ms | 89ms | 142ms | 0.0% |
| Ramp 50-200 | 200 | 380 | 62ms | 210ms | 480ms | 0.2% |
| Ramp 200-500 | 500 | 620 | 185ms | 890ms | 2,340ms | 3.8% |
| Sustain 500 | 500 | 540 | 240ms | 1,200ms | 3,100ms | 7.2% |

**Breaking point: p95 crosses the 800ms threshold at about 320 VUs.** The error rate crosses 5% at about 420 VUs. The agent traces the bottleneck to the database connection pool, maxed at 20 connections. RPS drops from 620 to 540 during the sustain phase as the system buckles under contention.

Slowest endpoints under load, from the per-request `name` tags:

- `POST /api/orders/create`: p99 of 3,100ms at peak (DB write contention)
- `POST /api/cart/add`: p99 of 890ms at peak (Redis connection queuing)
- `GET /api/orders/:id`: p99 of 320ms at peak (acceptable)

### Step 3: Generate the Capacity Plan

```text
Based on these results, create a capacity plan. We expect 3x current traffic
for our product launch in 6 weeks. Current production runs 3 API pods and
a single RDS db.r5.large whose parameter group sets max_connections=100. What do we need?
```

Current baseline: about 180 RPS sustained. Target: 540 RPS sustained with p95 under 500ms and error rate under 1%. The plan must pass the connection budget check before any pool size goes up: total connections = pods x pool size per pod, and that must stay below the database's `max_connections`.

| Change | What | Check |
|--------|------|-------|
| API pods | 3 -> 8, HPA min=5 max=12, target CPU 65% | Price the node type that hosts them |
| Pool per pod | 20 -> 25 (8 x 25 = 200 connections) | Must fit `max_connections` with headroom for migrations and admin sessions |
| RDS | db.r5.large -> db.r5.xlarge, `max_connections` 100 -> 300 | Look up the class and Multi-AZ price in the AWS Pricing Calculator |
| Read replica | For `GET /api/orders/:id` reads | Billed as its own instance of the same class |
| Redis | Move to a larger node type | Connection limit was insufficient at 500+ VUs |

Raising a pool from 20 to 60 on 8 pods would mean 480 connections against a limit of 300, so the plan puts RDS Proxy in front if the pool needs to grow further. The agent does not quote remembered instance prices: each line gets a price from the AWS Pricing Calculator for your region, with the source recorded in the plan. The cheapest win is configuration, not hardware: the pool and `max_connections` change costs nothing, but only after the budget check passes.

### Step 4: Create the Pre-Launch Verification Test

```text
Generate a final verification test script I can run after applying these
changes to confirm we can handle 3x traffic with acceptable latency.
```

An arrival-rate executor holds the request rate fixed even if responses slow down, so it measures capacity directly. This one ramps to 650 requests per second (20% above the 540 RPS target), then soaks:

```javascript
// load-tests/verify-3x.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    verify: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 1500,
      stages: [
        { duration: '5m', target: 650 },
        { duration: '30m', target: 650 }, // soak: memory leaks, pool churn
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${__ENV.TOKEN}` };
  const cart = http.post(
    `${__ENV.BASE_URL}/api/cart/add`,
    JSON.stringify({ productId: 'prod_42', quantity: 1, variant: 'M' }),
    { headers, tags: { name: 'cart_add' } },
  );
  check(cart, { 'cart add 200': (r) => r.status === 200 });
  sleep(1);
}
```

Extend the default function with the order and fetch steps from Step 1 to cover the full flow. If k6 prints "Insufficient VUs" warnings, raise `maxVUs`. The 30-minute soak catches problems that only appear after the pool has been churning for a while.

## Real-World Example

Tomas, backend lead at a 25-person e-commerce startup, has a product launch in 6 weeks with a TV ad campaign expected to drive 3x normal traffic. The team has never load-tested beyond manual curl commands.

He points the agent at the Express.js routes and asks for k6 scripts covering the full purchase flow. Running against staging, the breaking point shows up at about 320 concurrent users, well below the 800 expected during the TV spot. The bottleneck is a database connection pool of 20. The capacity plan scales API pods from 3 to 8 with autoscaling, moves the database up one instance size, raises the pool only as far as the connection budget allows, and adds a larger Redis node.

After the changes, the arrival-rate verification test at 650 RPS passes its thresholds (p95 under 500ms, errors under 1%). Tomas commits the scripts to the repository, and CI runs a lighter version (100 VUs for 5 minutes) on every deploy to staging, so a database query regression shows up as a threshold failure before it reaches production.

## Related Skills

- **api-load-tester**: generates the test scenarios from routes and types and runs them
- **k6**: script structure, executors, thresholds and exit codes for both test scripts
- **capacity-planner**: turns results into a scaling plan with the connection budget check
