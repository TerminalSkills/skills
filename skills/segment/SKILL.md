---
name: segment
description: >-
  Segment is a customer data platform (CDP) that collects events from your website, apps and
  servers once and routes them to analytics, marketing and warehouse destinations. Use when
  someone asks to "track user events across tools", "set up Segment", "send events to Mixpanel,
  Amplitude or BigQuery", "unify analytics", or needs identify, track, page, group and alias
  calls in JavaScript, Node.js or React.
license: Apache-2.0
compatibility: "Browser: @segment/analytics-next 1.x; Node.js 20+: @segment/analytics-node 3.x; a Segment workspace and source write key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["analytics", "segment", "cdp", "events", "tracking"]
  repository: https://github.com/segmentio/analytics-next
---

# Segment

## Overview

Segment is a customer data platform: your code sends events to Segment through one API, and Segment forwards them to every destination you enable (Mixpanel, Amplitude, BigQuery, Intercom and so on). Destinations are switched on and off in the Segment app without code changes. Each source (website, server, mobile app) has its own write key. Libraries checked here (npm, October 2026): `@segment/analytics-next` 1.84.3 for browsers and `@segment/analytics-node` 3.1.0 for servers (Node.js 20+). Segment's docs site blocks automated fetching, so UI paths and plan limits are not covered here; read them in the app.

## Instructions

### Install

```bash
npm install @segment/analytics-next     # browser / React
npm install @segment/analytics-node     # server
```

Segment can also generate a script snippet for a JavaScript source. Prefer that generated snippet over copying one from memory, since it carries the current version and your write key. With the npm package no snippet is needed.

### Browser

```typescript
// lib/analytics.ts
import { AnalyticsBrowser } from "@segment/analytics-next";

export const analytics = AnalyticsBrowser.load({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY!,
});
```

`AnalyticsBrowser.load` is called once. If you need consent first, create `new AnalyticsBrowser()` and call `.load({ writeKey })` after the user agrees; calls made earlier are buffered. Browser calls take positional arguments: `analytics.identify("usr_8f2c1", { plan: "pro" })`, `analytics.track("Plan Selected", { plan: "pro" })`, `analytics.page("Pricing")`.

### Server (Node.js)

```typescript
import { Analytics } from "@segment/analytics-node";

const analytics = new Analytics({ writeKey: process.env.SEGMENT_WRITE_KEY! });

analytics.identify({
  userId: "usr_8f2c1",
  traits: { email: "maria.kovacs@northwind-demo.dev", name: "Maria Kovacs", plan: "pro" },
});

analytics.track({
  userId: "usr_8f2c1",
  event: "Order Completed",
  properties: {
    orderId: "ord_456",
    total: 99.99,
    currency: "USD",
    products: [{ id: "prod_1", name: "Standing desk mat", price: 49.99, quantity: 2 }],
  },
});

analytics.group({ userId: "usr_8f2c1", groupId: "org_789", traits: { name: "Northwind", plan: "enterprise" } });
analytics.page({ userId: "usr_8f2c1", name: "Pricing" });
analytics.alias({ userId: "usr_8f2c1", previousId: "anon_abc" });

await analytics.closeAndFlush();   // before a script, Lambda or shutdown handler exits
```

Server calls take one object and need `userId` or `anonymousId` (at least one). Events are batched: the client sends after 15 events or 10 seconds by default (`flushAt`, `flushInterval`), so a short-lived process that exits without `closeAndFlush()` loses events. Other settings: `host`, `path`, `maxRetries`, `httpRequestTimeout`, `disable: true` (all calls become no-ops; useful in tests).

### React

```tsx
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";

export function PricingPage() {
  useEffect(() => { analytics.page("Pricing"); }, []);
  return <button onClick={() => analytics.track("Plan Selected", { plan: "pro", price: 49 })}>Choose Pro</button>;
}
```

In single-page apps you must call `page()` on route changes yourself.

## Examples

### Example 1: Track signups and purchases for a SaaS product

**User request:** "Track signups, feature usage and purchases and send them to Mixpanel, BigQuery and Intercom."

Install the browser and server packages, create one JavaScript source and one Node.js source in Segment, and put their write keys in `NEXT_PUBLIC_SEGMENT_WRITE_KEY` and `SEGMENT_WRITE_KEY`. Call `identify` on signup and login, `track("Signed Up")` from the server after the account is created, and `track("Order Completed", {...})` from the payment webhook handler. Then connect the three destinations in the Segment app; no further code is needed. Confirm in the Segment app that events arrive at the source.

### Example 2: Replace several analytics SDKs with Segment

**User request:** "We load Mixpanel, Amplitude and GA4 separately. Consolidate into one."

List the events the three SDKs send today, map them to one set of "Object Action" names, replace the SDK calls with `analytics.track`, and enable each tool as a Segment destination. Run old and new in parallel for a week and compare counts before removing the old SDKs.

## Guidelines

- Call `identify` as soon as you know the user; later `track` calls with that `userId` attach to the profile.
- Name events "Object Action" in past tense ("Order Completed") and keep names stable; write a tracking plan before instrumenting.
- User attributes (email, plan) go in `traits`; event data (order total, product ids) goes in `properties`.
- Send revenue and subscription events from the server; send UI events from the browser.
- Do not send passwords, payment card numbers or health data as traits or properties. Gate loading on user consent where the law requires it.
- The write key identifies a source and is public in browser code; keep server keys in environment variables and use separate sources per environment so test data does not reach production destinations.
- Calls are asynchronous and failures are silent unless you handle the `error` event emitted by the client or pass a callback.
