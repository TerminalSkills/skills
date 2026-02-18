---
title: "Set Up A/B Testing Infrastructure for Product Experiments"
slug: set-up-ab-testing
description: "Build a complete experimentation platform with feature flags, user bucketing, event tracking, and statistical analysis."
skills: [ab-test-setup, analytics-tracking, feature-flag-manager]
category: development
tags: [ab-testing, experimentation, feature-flags, analytics, statistics]
---

# Set Up A/B Testing Infrastructure for Product Experiments

## The Problem

Product teams want to run experiments — test a new checkout flow, try a different pricing layout, validate a recommendation algorithm. But without infrastructure, experiments are ad hoc: hardcoded if-else blocks, manual traffic splitting, and gut-feeling analysis. Results are unreliable because sample sizes are too small, metrics aren't tracked consistently, and there's no way to safely roll back. Building proper experimentation infrastructure seems like a month-long project.

## The Solution

Use **feature-flag-manager** to implement the flag system and user bucketing, **ab-test-setup** to design statistically sound experiments, and **analytics-tracking** to wire up event collection and metric computation. The agent builds the full stack: flag evaluation, consistent user assignment, event pipeline, and a results dashboard.

## Step-by-Step Walkthrough

### 1. Build the feature flag system with user bucketing

```text
I need a feature flag system for A/B testing in my Next.js app with a Node.js API.
Requirements: deterministic user assignment (same user always sees same variant),
percentage-based rollout, and the ability to target by user attributes (plan type,
country, signup date). No third-party service — I want to own the data.
```

```text
Created experimentation/flags.ts — Flag evaluation engine
Created experimentation/bucketing.ts — Deterministic hash-based assignment
Created experimentation/targeting.ts — Attribute-based targeting rules
Created migrations/003_experiments.sql — Experiments, flags, assignments tables

Bucketing algorithm:
  hash = murmurhash3(experimentId + userId) % 10000
  Gives a stable bucket 0-9999 per user per experiment
  50/50 split: buckets 0-4999 → control, 5000-9999 → variant
  90/10 rollout: buckets 0-8999 → control, 9000-9999 → variant

  Same user always gets the same variant (deterministic).
  Different experiments get independent assignments (experiment ID in hash).

Targeting example:
  { attribute: "plan", operator: "in", values: ["pro", "enterprise"] }
  → Experiment only runs for pro/enterprise users
```

### 2. Integrate flag evaluation into the application

```text
Show me how to integrate this into my Next.js pages and API routes.
I need server-side evaluation (no flicker) and the flag values available
in both server components and client components.
```

```text
Created experimentation/middleware.ts — Evaluates flags per request
Created experimentation/context.ts — React context for flag values
Created experimentation/hooks.ts — useFlag() and useExperiment() hooks

Server-side (API routes and server components):
  // middleware runs on every request
  const flags = evaluateFlags(userId, userAttributes);
  // Available in server components via headers
  
  // In API route:
  const variant = getFlag('checkout-redesign', req);
  if (variant === 'new-checkout') {
    return newCheckoutFlow(req);
  }

Client-side (React components):
  const variant = useFlag('checkout-redesign');
  return variant === 'new-checkout' ? <NewCheckout /> : <CurrentCheckout />;

  // Flags injected via server → no layout shift, no flicker
  // Client hydrates with same values server rendered
```

### 3. Set up event tracking for experiment metrics

```text
I need to track these events for experiments: page_view, button_click,
checkout_started, checkout_completed, and revenue. Each event should be
tagged with the active experiments and variants for that user.
```

```text
Created experimentation/tracking.ts — Event collection with experiment context
Created experimentation/events.ts — Event schema and validation
Created api/events/route.ts — Event ingestion endpoint
Created migrations/004_experiment_events.sql — Events table with experiment tags

Event schema:
  {
    event: "checkout_completed",
    userId: "user_abc",
    properties: { orderId: "ord_123", revenue: 89.99 },
    experiments: { "checkout-redesign": "new-checkout", "pricing-layout": "control" },
    timestamp: "2026-02-17T14:30:00Z"
  }

Every event automatically tagged with user's active experiments and variants.
Events stored in PostgreSQL with JSONB for properties and experiments.
Partitioned by month for query performance.
Batch insert: client buffers events, flushes every 5 seconds or 10 events.
```

### 4. Build the analysis dashboard

```text
Build a results page that shows for each experiment: variant distribution,
conversion rate per variant, statistical significance (p-value and confidence
interval), and estimated sample size to reach significance.
```

```text
Created experimentation/analysis.ts — Statistical analysis engine
Created app/admin/experiments/page.tsx — Experiment results dashboard

Analysis for each experiment:
  Users per variant: control=4,812 | variant=4,756 (50.3% / 49.7%)
  
  Metric: checkout_completed rate
    Control: 3.2% (154/4,812)
    Variant: 4.1% (195/4,756)
    Relative lift: +28.1%
    
  Statistical significance:
    Test: Two-proportion z-test
    p-value: 0.0142
    95% CI for difference: [+0.2%, +1.6%]
    Status: SIGNIFICANT (p < 0.05)
    
  If NOT significant yet:
    Current sample: 9,568 users
    Estimated required: 14,200 users (at 80% power, α=0.05)
    Days remaining: ~6 days at current traffic

  Recommendation: Variant wins. Safe to roll out to 100%.
```

### 5. Implement safe rollout and cleanup

```text
The checkout experiment is significant. Roll it out to 100% of users,
then clean up the experiment code. Show me the safe rollout process.
```

```text
Rollout plan for "checkout-redesign":

Step 1 — Gradual rollout (monitoring):
  Day 1: 50% → 75% (update bucket split)
  Day 2: 75% → 100% (if no regressions in error rate or latency)

Step 2 — Monitor for 48 hours at 100%:
  Watch: error rate, p95 latency, revenue per session
  Auto-rollback trigger: error rate > 2× baseline

Step 3 — Code cleanup:
  Remove feature flag checks for 'checkout-redesign'
  Delete <CurrentCheckout /> component
  Remove experiment from active experiments config
  Archive experiment data (keep for 90 days)

Created: scripts/cleanup-experiment.ts — Finds all references to a flag name
Output: 7 files reference 'checkout-redesign' — review and remove the branching
```

## Real-World Example

A product manager at a mid-size SaaS company wants to test whether moving the pricing toggle from a dropdown to radio buttons increases plan upgrades. The engineering team has no experimentation infrastructure.

1. The developer prompts the agent to build the flag system with deterministic user bucketing
2. Flag evaluation integrates into their Next.js middleware — zero flicker for users
3. Event tracking captures page views on the pricing page and upgrade completions
4. After two weeks, the dashboard shows a 15% lift in upgrades with p=0.03
5. They roll out the winner and run their next experiment the same week — experimenting becomes routine instead of a special project
