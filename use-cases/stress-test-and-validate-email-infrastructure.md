---
title: "Stress Test APIs and Validate Email Infrastructure"
slug: stress-test-and-validate-email-infrastructure
description: "Load test API endpoints to find breaking points, then verify that transactional email delivery remains reliable under high traffic using deliverability diagnostics."
skills:
  - api-load-tester
  - email-deliverability-debugger
category: devops
tags:
  - load-testing
  - email-deliverability
  - performance
  - infrastructure-testing
---

# Stress Test APIs and Validate Email Infrastructure

## The Problem

An e-commerce platform sends password resets, order confirmations, and shipping notifications through its API. Under normal load, emails arrive within 30 seconds. During a flash sale last quarter, the API hit 5x normal traffic, response times tripled, and the email queue backed up by 45 minutes. Customers who placed orders never received confirmation emails, leading to duplicate purchases and a flood of support tickets. The team does not know at what traffic level the email pipeline starts degrading, whether the bottleneck is the API, the job queue, the SMTP relay, or the email provider's rate limits. Every Black Friday and product launch is a gamble on whether the email infrastructure will keep up.

## The Solution

Use the **api-load-tester** skill to simulate realistic traffic against the order endpoint on a staging copy, with outgoing mail captured by a sink you control. Use the **email-deliverability-debugger** skill separately, at normal volume, to check DNS authentication, bounce codes and inbox placement for the real sending domain. The load test finds where the pipeline falls behind; the deliverability audit finds why mail that is sent still fails. The two are kept apart on purpose: a synthetic burst must never be sent to real mailboxes.

## Step-by-Step Walkthrough

### 1. Set up a test environment that cannot email real people

A load test that places thousands of orders sends thousands of emails. Sent to real Gmail or Outlook addresses, or through the production provider account, they produce bounces and spam complaints that damage the sending domain's reputation and can get the provider account suspended.

> Prepare staging for a load test of POST /api/orders. Point the staging mailer at an SMTP capture sink on a private address (Mailpit or similar) instead of the provider, and make every test order use a recipient on a domain we own that only the sink receives. Confirm no staging config contains the production provider API key.

With a sink, the queue, the worker and the SMTP hand-off are all tested, and the provider's own limits are read from its documentation rather than discovered by hitting them. If you must exercise the provider's API itself, SendGrid's sandbox mode (`mail_settings.sandbox_mode.enable: true` on the v3 send request) validates the request and does not deliver; check your provider for an equivalent.

### 2. Design the load test around the order flow

> Design a k6 load test for POST /api/orders on staging. Hold a fixed request rate that ramps from 10 to 40 orders per second, holds, then spikes to 120 per second. Each order has a random SKU and quantity. Alongside response time and error rate, sample the email worker's queue depth during the run.

An arrival-rate executor holds the request rate even when responses slow down, which is how a flash sale behaves; a fixed number of virtual users would slow down with the server and hide the overload. This script ran against a local stub on k6 v2.2.0:

```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL;                 // staging URL, never production
const queueDepth = new Trend('email_queue_depth');

export const options = {
  scenarios: {
    orders: {
      executor: 'ramping-arrival-rate',
      startRate: 10, timeUnit: '1s',
      preAllocatedVUs: 50, maxVUs: 200,
      stages: [
        { target: 40, duration: '10s' },     // ramp
        { target: 40, duration: '10s' },     // hold
        { target: 120, duration: '5s' },     // spike
        { target: 0, duration: '5s' },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    email_queue_depth: ['p(95)<200'],
  },
};

export default function () {
  const order = {
    sku: `SKU-${Math.floor(Math.random() * 500)}`,
    qty: 1 + Math.floor(Math.random() * 3),
    // a mailbox on a domain you own that feeds the capture sink
    email: `load-${__VU}-${__ITER}@mail-sink.example.test`,
  };
  const res = http.post(`${BASE}/api/orders`, JSON.stringify(order),
    { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'order accepted': (r) => r.status === 201 });

  if (__ITER % 10 === 0) {                   // sample the worker queue
    const m = http.get(`${BASE}/internal/email-metrics`);
    if (m.status === 200) queueDepth.add(m.json('queue_depth'));
  }
}
```

Run it with `BASE_URL=https://staging.shop.example k6 run orders.js`. `/internal/email-metrics` is an endpoint you add to staging that reports the worker's queue depth; it must not exist in production.

Against the stub (an API that queues each order and a fake relay that sends 50 emails per second), the run showed the failure pattern this page is about: API p95 stayed under 1 ms and no request failed, while the queue grew to about 150 jobs during the spike and 193 were still waiting when the test ended. The API looked healthy while confirmation emails fell behind. That is why the queue depth is a threshold of its own.

### 3. Measure delivery time at the sink

> After the run, read the capture sink and compute, for each stage of the ramp, the time between the order request and the message arriving at the sink. Find the order rate at which delivery time starts growing faster than it drains.

The first stage where delivery time keeps rising is the inflection point. Compare it with the queue depth samples: if the queue grows while worker CPU is idle, the worker is waiting on something (a shared Redis, a connection pool, a per-connection SMTP limit); if the worker is saturated, add workers or batch sends.

### 4. Audit the real sending domain, at normal volume

Authentication does not degrade with traffic: SPF, DKIM and DMARC are DNS records that evaluate the same for one message or a million. What load changes is throttling and reputation. So the audit runs on the production domain at ordinary volume, using mailboxes you own.

> Audit deliverability for mail.shop.example. Check SPF (count DNS lookups against the limit of 10), the DKIM selectors our provider uses, and the DMARC policy. Then send a handful of real order confirmations to seed mailboxes we own at Gmail and Outlook and read the Authentication-Results headers. List the SMTP response codes from the provider's last 30 days of bounces.

```bash
dig +short TXT mail.shop.example | grep "v=spf1"
dig +short TXT s1._domainkey.mail.shop.example
dig +short TXT _dmarc.mail.shop.example
```

The response codes separate the causes. A `4xx` (for example `421` or `451`) is a temporary deferral, usually throttling by the receiving server, and the provider retries it; a `5xx` such as `550 5.7.x` is a permanent rejection for policy or authentication. Senders of more than 5,000 messages a day to Gmail, Yahoo and Outlook.com must have SPF, DKIM and DMARC aligned with the From domain, and Gmail and Yahoo also require one-click unsubscribe on marketing mail and a spam rate under 0.30% in Postmaster Tools. The skill checks all of these.

### 5. Fix the bottleneck and repeat the same test

> The queue shares a Redis instance with the session store. Move the email queue to its own Redis, raise the worker pool, and re-run the identical k6 scenario on staging. Report queue depth, p95 delivery time at the sink and API p95 before and after.

Changing one thing and re-running the same scenario proves the fix. A new dedicated sending IP is a separate project: it needs a warm-up of gradually increasing volume over weeks, and a synthetic test burst is not a substitute for it.

## Real-World Example

The e-commerce team ran the load test on a staging environment that mirrored production, with mail captured by a sink. At 300 orders per second everything looked healthy. At 450 the email worker started falling behind, and the cause was not the provider: the job queue shared a Redis instance with the session store, and session writes were starving the email jobs.

They moved email jobs to a dedicated Redis and re-ran the test; the queue stayed flat at 800 orders per second. The separate deliverability audit of the production domain found an SPF record with 11 DNS lookups, one over the limit of 10, which caused intermittent authentication failures at some receivers. Flattening the record brought it to 6 lookups. After both fixes, they projected Black Friday traffic of 600 orders per second and confirmed delivery times in the sink stayed well under the 30-second target at that rate.

## Related Skills

- [api-load-tester](/skills/api-load-tester): builds the k6 arrival-rate scenario for the order endpoint and reports where thresholds first fail.
- [email-deliverability-debugger](/skills/email-deliverability-debugger): checks SPF lookup count, DKIM, DMARC and bounce codes for the real sending domain.
