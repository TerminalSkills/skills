---
name: k6
description: >-
  k6 is Grafana's open-source load testing tool: tests are scripts in JavaScript or TypeScript that simulate virtual users hitting APIs and websites and pass or fail on thresholds. Use when the user asks for a load test, stress test, spike test, soak test, performance test, thresholds, virtual users (VUs) or arrival-rate scenarios with k6, or wants k6 in CI. For browser-driven functional tests, see selenium.
license: Apache-2.0
compatibility: "k6 v1.x or v2.x (current v2.3, September 2026); runs as a single binary or in Docker"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/grafana/k6"
  category: development
  tags: "load-testing, performance, stress-testing, benchmarking"
---

# k6

## Overview

k6 is an open-source load testing tool from Grafana Labs. Test scripts are ES modules (JavaScript, or TypeScript run directly by k6) that define virtual users (VUs), scenarios and thresholds; `k6 run` executes them and exits non-zero when a threshold fails. This skill covers writing scripts, choosing a test type, thresholds, custom metrics, running locally, in Docker and in CI. k6 v2 (2026) removed old commands and options; see Guidelines.

## Instructions

### Initial Assessment

Before writing a load test, understand:

1. **Target** — What endpoint(s) or service are you testing?
2. **Goal** — What kind of test? (load, stress, spike, soak, smoke)
3. **Expectations** — What response time and error rate are acceptable?
4. **Scale** — How many concurrent users should the test simulate?

### Writing k6 Scripts

Always structure scripts with clear stages and thresholds:

```javascript
// load-test.js — k6 load test with ramping VUs and thresholds.
// Tests the /api/users endpoint under increasing load.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://api.shopfront.dev/users');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

### Test Types

Guide users to the right test type:

- **Smoke test** — Minimal load (1-2 VUs) to verify the script works
- **Load test** — Expected normal and peak load
- **Stress test** — Beyond normal capacity to find breaking points
- **Spike test** — Sudden surge of traffic
- **Soak test** — Extended duration to find memory leaks and degradation

### Thresholds

Always recommend thresholds so tests have clear pass/fail criteria:

```javascript
// thresholds.js — Common threshold patterns for k6.
// Combine multiple metrics for comprehensive pass/fail.
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
    checks: ['rate>0.99'],
    'http_req_duration{name:login}': ['p(95)<800'], // needs { tags: { name: 'login' } } on the request
  },
};
```

### Custom Metrics

```javascript
// custom-metrics.js — Track business-specific metrics in k6.
// Useful for measuring things beyond HTTP response times.
import http from 'k6/http';
import { Trend, Counter, Rate } from 'k6/metrics';

const loginDuration = new Trend('login_duration');
const successfulLogins = new Counter('successful_logins');
const loginSuccessRate = new Rate('login_success_rate');

export default function () {
  const res = http.post('https://api.shopfront.dev/login', JSON.stringify({
    username: 'load-user-01',
    password: __ENV.LOAD_USER_PASSWORD,
  }), { headers: { 'Content-Type': 'application/json' } });

  loginDuration.add(res.timings.duration);
  const success = res.status === 200;
  successfulLogins.add(success ? 1 : 0);
  loginSuccessRate.add(success);
}
```

### CI Integration

```yaml
# .github/workflows/load-test.yml — Run k6 load tests in GitHub Actions.
# Fails the pipeline if thresholds are breached. (grafana/k6-action is archived; use these two.)
name: Load Test
on:
  push:
    branches: [main]
jobs:
  k6:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - uses: grafana/run-k6-action@v1
        with:
          path: tests/load-test.js
```

### Running k6

```bash
# run-k6.sh — Common k6 commands for different scenarios.
# Install and run with various output options.

# Install (macOS: brew; Debian/Ubuntu: add Grafana's apt repo, then apt install k6; Windows: choco install k6 or winget install k6)
brew install k6
# No install: docker run --rm -i grafana/k6 run - < load-test.js
# Scaffold a script: k6 new load-test.js

# Basic run
k6 run load-test.js

# With environment variables
k6 run -e BASE_URL=https://staging.shopfront.dev load-test.js

# Override VUs and duration
k6 run --vus 100 --duration 5m load-test.js

# Output to JSON for analysis
k6 run --out json=results.json load-test.js

# Pick the end-of-test summary: compact (default), full or disabled
k6 run --summary-mode=full load-test.js
```

### Scenarios (Advanced)

```javascript
// scenarios.js — Multiple scenarios running different patterns simultaneously.
// Simulates realistic mixed traffic patterns.
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    browse: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      exec: 'browsePage',
    },
    checkout: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      exec: 'checkout',
    },
  },
};

export function browsePage() {
  http.get('https://api.shopfront.dev/products');
  sleep(2);
}

export function checkout() {
  http.post('https://api.shopfront.dev/checkout', JSON.stringify({ sku: 'SKU-1042', qty: 1 }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Examples

### "Check my API handles 200 requests per second for 5 minutes"

Use an arrival-rate executor, which holds the request rate steady even if responses slow down:

```javascript
// steady-rate.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    steady: { executor: 'constant-arrival-rate', rate: 200, timeUnit: '1s',
              duration: '5m', preAllocatedVUs: 100, maxVUs: 400 },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<400'] },
};

export default function () {
  check(http.get('https://api.shopfront.dev/products'), { 'status is 200': (r) => r.status === 200 });
}
```

Run `k6 run steady-rate.js`. The summary lists each threshold with a check or cross; if any fail, the exit code is 99. Seeing "Insufficient VUs" warnings means raise `maxVUs`.

### "Smoke-test the checkout script before the big run"

```bash
k6 run --vus 1 --iterations 5 -e BASE_URL=https://staging.shopfront.dev checkout.js
```

Five iterations with one VU; confirm all checks pass before ramping up.

## Guidelines

- Always set thresholds, otherwise a run never fails. Exit code 99 means a threshold failed.
- Never load-test production or third-party systems you do not own without permission; start with a smoke test (1-2 VUs).
- Keep credentials out of scripts: pass them with `-e` or `__ENV`.
- VU-based executors (`constant-vus`, `ramping-vus`) slow down when the system under test slows; use arrival-rate executors for a fixed request rate.
- `sleep()` models think time; without it each VU hammers the target in a tight loop.
- Upgrading to k6 v2: the `externally-controlled` executor and the `k6 pause/resume/scale/status` commands are gone; `k6 login cloud` became `k6 cloud login`; `k6 cloud script.js` became `k6 cloud run script.js` and a stack is required; `--no-summary` became `--summary-mode=disabled`; `options.ext.loadimpact` became `options.cloud`; `k6/experimental/redis` became `k6/x/redis`; the REST API server now needs `--address`; extension authors import `go.k6.io/k6/v2`.
- For real-browser metrics use the `k6/browser` module; for plain protocol-level load, stay with `k6/http`.
