---
title: "Manage Feature Flags and Gradual Rollouts"
slug: manage-feature-flags-gradual-rollouts
description: "Implement a feature flag system with percentage-based rollouts, user targeting, and kill switches to ship features safely without risky big-bang deployments."
skills: [feature-flag-manager, ab-test-setup, analytics-tracking]
category: development
tags: [feature-flags, rollouts, canary, kill-switch, experimentation, deployment]
---

# Manage Feature Flags and Gradual Rollouts

## The Problem

Ravi is the engineering lead at a 25-person B2B SaaS company selling an invoicing platform. They ship weekly, and every release is a coin flip. Last month, a new PDF export engine went live to all 12,000 accounts simultaneously. It worked perfectly in staging. In production, it choked on invoices with more than 200 line items, something only 3% of customers had, but those customers were enterprise accounts paying $2,400/month each.

The rollback took 47 minutes. During that window, 340 invoices failed to generate and 14 enterprise customers opened urgent tickets. The VP of Sales spent the next two days on apology calls.

This wasn't the first time. Three months earlier, a redesigned dashboard confused users so badly that support tickets tripled for a week. The team had no way to show the new UI to a small group first, measure the impact, and expand gradually. The deploy process is merge, build, deploy to all servers, and hope. No percentage rollouts, no user targeting, no kill switch that doesn't need a redeploy. The team avoids Friday releases and avoids touching core flows.

Meanwhile, the product team wants to run experiments: a new onboarding flow, a chatbot for free-tier users only. Without flags, every experiment needs a branch, a deploy, and a way to segment users that doesn't exist.

## The Solution

Three skills divide the work. **feature-flag-manager** designs the flag engine: deterministic bucketing, ordered targeting rules, a kill switch and a lifecycle. **ab-test-setup** turns the dashboard redesign into a proper experiment (sample size, exposure logging, sample-ratio check, readout). **analytics-tracking** records flag exposure in GA4 so results can be compared by variant. Features ship to 5% first, then 25%, 50% and everyone, with an off switch that needs no deploy.

## Step-by-Step Walkthrough

### Step 1: Design the Flag Model and Evaluation Engine

Evaluation must be deterministic: the same unit sees the same variant across sessions, devices and servers, without storing assignments. Hash `flagKey:unitId` with SHA-256 from `node:crypto` (no dependency to maintain) and take the first 32 bits modulo 10,000 for 0.01% granularity. A flag buckets either users or accounts: the PDF engine buckets accounts, so everyone in one company gets the same export behaviour.

```typescript
// lib/flags/evaluator.ts
import { createHash } from "node:crypto";

export interface UserContext {
  userId: string;
  accountId: string;
  plan: string;
  country: string;
}

export interface TargetingRule {
  attribute: keyof UserContext;
  operator: "eq" | "neq" | "in" | "gt" | "lt";
  values: string[];
  allocation: number[]; // percent per variant, overrides the default for matching users
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;          // kill switch: false returns variants[0] for everyone
  unit: "user" | "account";  // what gets bucketed
  variants: string[];        // variants[0] is the control / "off" experience
  allocation: number[];      // default percent per variant, sums to 100
  targeting: TargetingRule[]; // evaluated in order, first match wins
}

function matches(rule: TargetingRule, ctx: UserContext): boolean {
  const actual = ctx[rule.attribute];
  switch (rule.operator) {
    case "eq": return actual === rule.values[0];
    case "neq": return actual !== rule.values[0];
    case "in": return rule.values.includes(actual);
    case "gt": return actual > rule.values[0];
    case "lt": return actual < rule.values[0];
  }
}

export function bucket(flagKey: string, unitId: string): number {
  const hash = createHash("sha256").update(`${flagKey}:${unitId}`).digest().readUInt32BE(0);
  return hash % 10000;
}

export function evaluate(flag: FeatureFlag, ctx: UserContext): string {
  if (!flag.enabled) return flag.variants[0];

  const rule = flag.targeting.find((r) => matches(r, ctx));
  const allocation = rule ? rule.allocation : flag.allocation;

  const unitId = flag.unit === "account" ? ctx.accountId : ctx.userId;
  const b = bucket(flag.key, unitId);

  let cumulative = 0;
  for (let i = 0; i < flag.variants.length; i++) {
    cumulative += allocation[i] * 100;
    if (b < cumulative) return flag.variants[i];
  }
  return flag.variants[0];
}
```

Rules are ordered and the first match wins, so "free-tier users in the US and UK" is two rules: non-free plans get 0% first, then those countries get 100%, and everyone else falls through to the default allocation of 0%. The `enabled` field is separate from the allocation: when an incident happens, flipping it to `false` returns the control variant for everyone, whatever the rules say. Before shipping, run the evaluator over 10,000+ simulated units and check the split. A 5% allocation over 100,000 simulated accounts came out at 5.08%.

### Step 2: Serve Flags from a Local Cache, Pushed by Redis

Flag checks happen in API handlers on every request, so a database query per check is out. Each server keeps all flag definitions in memory (evaluation is a hash and a few comparisons), subscribes to a Redis channel for changes, and reloads everything every 30 seconds as a safety net if a message is lost:

```typescript
// lib/flags/client.ts
import { Redis } from "ioredis";
import { evaluate, type FeatureFlag, type UserContext } from "./evaluator.ts";

const CHANNEL = "flag-updates";

export class FlagClient {
  private flags = new Map<string, FeatureFlag>();
  private subscriber = new Redis(process.env.REDIS_URL!);

  constructor(private loadAll: () => Promise<FeatureFlag[]>) {}

  async initialize() {
    // Subscribe first so an update that lands during the initial load is not missed.
    this.subscriber.on("message", (_channel, message) => {
      const updated: FeatureFlag = JSON.parse(message);
      this.flags.set(updated.key, updated);
    });
    await this.subscriber.subscribe(CHANNEL);
    await this.refresh();
    setInterval(() => this.refresh().catch(console.error), 30_000).unref();
  }

  private async refresh() {
    this.flags = new Map((await this.loadAll()).map((f) => [f.key, f]));
  }

  variant(key: string, ctx: UserContext): string {
    const flag = this.flags.get(key);
    return flag ? evaluate(flag, ctx) : "control"; // unknown flag: the old behaviour
  }

  evaluateAll(ctx: UserContext): Record<string, string> {
    return Object.fromEntries([...this.flags.keys()].map((k) => [k, this.variant(k, ctx)]));
  }
}
```

The admin API writes the flag to PostgreSQL and then publishes the full flag JSON on `flag-updates` from a separate Redis connection (a connection in subscriber mode cannot publish). Usage in a handler:

```typescript
// routes/invoices.ts
router.post("/:id/export-pdf", async (req, res) => {
  const ctx = { userId: req.user.id, accountId: req.user.accountId, plan: req.user.plan, country: req.user.country };

  if (flags.variant("new-pdf-engine", ctx) === "new") {
    await logExposure("new-pdf-engine", "new", { ...ctx, gaClientId: req.user.gaClientId });
    return newPdfEngine.export(req.params.id, res);
  }
  return legacyPdfEngine.export(req.params.id, res);
});
```

### Step 3: Evaluate on the Server, Hand the Result to the Browser

Evaluate flags on the server only. Shipping the rules to the browser leaks experiment details and makes the page flicker from control to variant. The UI gets finished answers: one endpoint returns the signed-in user's variants, and the front end reads them before rendering the affected component.

```typescript
// routes/flags.ts
router.get("/api/flags/evaluate", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(flags.evaluateAll({
    userId: req.user.id, accountId: req.user.accountId, plan: req.user.plan, country: req.user.country,
  }));
});
```

A single-page app fetches this on load and again when the tab regains focus, so a kill switch reaches open sessions on the next refresh of that response. Server-rendered pages pass the same object into the page props.

### Step 4: Configure the Initial Flags

Each flag uses a different targeting strategy:

| Flag | Unit | Setup |
|------|------|-------|
| `new-pdf-engine` | account | `legacy` 95 / `new` 5 (about 600 of 12,000 accounts) |
| `redesigned-dashboard` | user | `control` 50 / `redesign` 50, run as an experiment (Step 6) |
| `ai-chatbot` | user | Default 0%. Rule 1: plan `neq` free gets 0%. Rule 2: country `in` US, UK gets 100% |
| `bulk-invoice-api` | account | Default 0%. One rule: accountId `in` the three enterprise IDs gets 100% |

```typescript
// scripts/seed-flags.ts (abbreviated)
const initialFlags: FeatureFlag[] = [
  { key: "new-pdf-engine", enabled: true, unit: "account",
    variants: ["legacy", "new"], allocation: [95, 5], targeting: [] },
  { key: "redesigned-dashboard", enabled: true, unit: "user",
    variants: ["control", "redesign"], allocation: [50, 50], targeting: [] },
  { key: "ai-chatbot", enabled: true, unit: "user",
    variants: ["off", "on"], allocation: [100, 0],
    targeting: [
      { attribute: "plan", operator: "neq", values: ["free"], allocation: [100, 0] },
      { attribute: "country", operator: "in", values: ["US", "UK"], allocation: [0, 100] },
    ] },
  { key: "bulk-invoice-api", enabled: true, unit: "account",
    variants: ["off", "on"], allocation: [100, 0],
    targeting: [{ attribute: "accountId", operator: "in",
                  values: ["acct_3kF8j", "acct_9mN2p", "acct_7xQ4r"], allocation: [0, 100] }] },
];
```

The PDF engine at 5% means that if the 200+ line item bug still exists, it hits about 600 accounts instead of 12,000, and the kill switch turns it off for all of them without a deploy.

### Step 5: Record Exposure in GA4 and Guard the Rollout

Flags without data are guesses. Log an exposure event the moment a unit reaches the changed behaviour, not when the flag is evaluated, so that analysis only counts units that actually saw it. The **analytics-tracking** skill sends server-side events through the GA4 Measurement Protocol, with the browser's `client_id` stored on the user record:

```typescript
// lib/flags/exposure.ts
import type { UserContext } from "./evaluator.ts";

const seen = new Set<string>();

export async function logExposure(flagKey: string, variant: string, ctx: UserContext & { gaClientId: string }) {
  const dedupe = `${flagKey}:${ctx.userId}:${variant}`;
  if (seen.has(dedupe)) return;
  seen.add(dedupe);

  const url = new URL("https://www.google-analytics.com/mp/collect");
  url.searchParams.set("measurement_id", process.env.GA_MEASUREMENT_ID!);
  url.searchParams.set("api_secret", process.env.GA_API_SECRET!);

  await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      client_id: ctx.gaClientId,
      user_id: ctx.userId,
      events: [{ name: "flag_exposure",
                 params: { flag_key: flagKey, variant, engagement_time_msec: 1 } }],
    }),
  });
}
```

The secret and measurement ID stay in environment variables. Add `session_id` to `params` (read it in the browser next to `client_id`) if exposure events should also count in session and engagement reports; the **analytics-tracking** skill covers both. Register `flag_key` and `variant` as event-scoped custom dimensions in GA4 Admin before building reports on them. The live Measurement Protocol endpoint returns success even for malformed events, so test the payload against the `/debug/mp/collect` validation endpoint first. The in-memory `seen` set only deduplicates within one process; GA4 reports should count unique users.

For a staged rollout of the PDF engine, compare the new variant against control on your own error and latency metrics (tag each request's metrics with the variant) and automate only the safe direction. Switching off is automatic; moving up the 5% -> 25% -> 50% -> 100% ladder stays a human decision after 24 hours of clean metrics:

```typescript
// jobs/rollout-monitor.ts: runs every 15 minutes
async function checkRollout(flagKey: string) {
  const m = await getVariantMetrics(flagKey); // from your metrics store, per variant
  const enough = m.treatment.requests >= 500;
  if (enough && m.treatment.errorRate > Math.max(m.control.errorRate * 2, 0.01)) {
    await setFlagEnabled(flagKey, false); // writes to the database and publishes to Redis
    await notify(`ROLLBACK ${flagKey}: errors ${m.treatment.errorRate} vs control ${m.control.errorRate}`);
  }
}
```

The minimum request count stops one early failure from tripping the switch on a tiny sample; the error floor stops a 2x jump from 0.01% to 0.02% from counting.

Flags left at 100% become permanent tech debt. A flag follows a lifecycle (created, testing, ramping, decided, archived), and a daily job warns about flags that have sat in the decided state for 14 days, with the code references to remove.

### Step 6: Run the Dashboard Redesign as a Real Experiment

The percentage rollout protects against breakage. Whether the redesign is better is a separate question, and **ab-test-setup** answers it before the first user is exposed. The agent writes `experiments/2026-11-dashboard-redesign.md`:

```markdown
Hypothesis: the redesigned dashboard raises the share of accounts that create an invoice
  within 7 days of first exposure (support tickets tripled after the last redesign).
Primary metric: accounts with >= 1 invoice created within 7 days of first exposure.
  Baseline 55% over the last 4 full weeks.
Guardrails: PDF exports per account, dashboard error rate, support contacts per account.
Smallest lift worth shipping: 10% relative (55% -> 60.5%).
Sample size: 1,265 accounts per arm (alpha 0.05, power 0.80), 2,530 in total. Unit: account.
Run time: 3 full weeks. Stopping rule: read the primary metric once, at the end.
Daily check: sample-ratio mismatch on exposed counts, guardrails only.
```

With `unit: "account"` set on the flag, a whole company sees one design. During the run, the daily sample-ratio check catches broken assignment (a p-value below 0.001 means units are being lost in one arm). At the end, the readout reports the difference with its confidence interval: ship only if the interval is entirely above zero and the guardrails held. Peeking at the primary metric daily and stopping at the first p < 0.05 produces false winners.

## Real-World Example

Six weeks after rolling out the flag system, Ravi ships the PDF engine again, this time to 5% of accounts. On day two the rollout monitor catches it: accounts with 200+ line items hit a memory limit, and the treatment error rate is several times control. The job switches the flag off and posts to Slack. The blast radius is the 600 bucketed accounts, not 12,000, and failed exports are retried on the legacy engine.

The fix takes two days. The flag goes back to 5%, stays clean for 24 hours, and Ravi moves it to 25%, 50% and 100% over the following week. The dashboard experiment runs for three full weeks with the plan above. The readout shows whether invoice creation moved and whether PDF exports dropped, and the product team decides from the interval rather than from the point estimate.

Kill-switch time goes from a 47-minute redeploy to one admin toggle that reaches every server through Redis. The Friday deploy freeze is over.

## Related Skills

- **feature-flag-manager**: deterministic bucketing, ordered targeting rules, kill switch and flag lifecycle
- **ab-test-setup**: sample size, exposure logging, sample-ratio check and readout for the dashboard experiment
- **analytics-tracking**: server-side GA4 Measurement Protocol events for flag exposure
