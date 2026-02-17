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

Ravi is the engineering lead at a 25-person B2B SaaS company selling an invoicing platform. They ship weekly, and every release is a coin flip. Last month, a new PDF export engine went live to all 12,000 accounts simultaneously. It worked perfectly in staging. In production, it choked on invoices with more than 200 line items — something only 3% of customers had, but those customers were enterprise accounts paying $2,400/month each.

The rollback took 47 minutes. During that window, 340 invoices failed to generate. 14 enterprise customers opened urgent tickets. The VP of Sales spent the next two days on apology calls. Revenue at risk: $280,000 in annual contracts from frustrated accounts.

This wasn't the first time. Three months earlier, a redesigned dashboard confused users so badly that support tickets tripled for a week. The team had no way to show the new UI to a small group first, measure the impact, and expand gradually. It was all-or-nothing.

The deploy process: merge to main → CI builds → deploy to all servers → pray. No percentage rollouts. No user targeting. No kill switch that doesn't require a full redeploy. The team avoids shipping on Fridays, avoids shipping before holidays, and increasingly avoids shipping anything that touches core flows. Feature velocity has dropped 40% in six months because everyone is afraid of the blast radius.

Meanwhile, the product team wants to run experiments — test a new pricing page, try a different onboarding flow, show a chatbot to free-tier users only. Without feature flags, every experiment requires a branch, a deploy, and a way to segment users that doesn't exist.

## The Solution

Build a feature flag system with percentage-based rollouts, user targeting rules, real-time kill switches, and analytics integration to measure impact — so features ship to 1% first, then 10%, then 50%, then everyone, with data at every stage.

### Prompt for Your AI Agent

```
I need to implement a feature flag system for our Node.js/React invoicing platform. Here's what we need:

**Current stack:**
- Backend: Node.js (Express), PostgreSQL, Redis
- Frontend: React (Next.js)
- 12,000 active accounts, ~45,000 monthly active users
- Deploy via GitHub Actions → Kubernetes

**Requirements:**

1. **Flag types:**
   - Boolean (on/off) — simple kill switches
   - Percentage rollout — show to X% of users, deterministic (same user always gets same result)
   - User targeting — enable for specific user IDs, account IDs, or email domains
   - Rule-based — enable based on user attributes (plan tier, country, account age, etc.)

2. **Flags we need right now:**
   - `new-pdf-engine` — rollout new PDF export, starting at 5% of accounts
   - `redesigned-dashboard` — A/B test: 50% see old, 50% see new
   - `ai-chatbot` — enable only for free-tier accounts in US and UK
   - `bulk-invoice-api` — enable for 3 specific enterprise account IDs
   - `maintenance-mode` — global kill switch, off by default

3. **SDK requirements:**
   - Server-side evaluation (Node.js) — flags checked in API handlers
   - Client-side SDK (React) — flags available via hook: `useFeatureFlag('new-pdf-engine')`
   - Deterministic bucketing — user sees the same variant across sessions and devices
   - Local evaluation with cached rules — no network call per flag check (latency budget: <1ms)

4. **Rollout workflow:**
   - Create flag with targeting rules
   - Start at 5% → monitor error rates and latency for 24h
   - If metrics are green, increase to 25% → 50% → 100%
   - If metrics spike, kill switch to 0% instantly (no redeploy)
   - After full rollout and 2 weeks stable, remove flag from code (flag hygiene)

5. **Analytics integration:**
   - Track which flag variant each user is in
   - Send flag assignments to analytics (Mixpanel/Amplitude)
   - Compare conversion rates, error rates, latency between flag-on and flag-off groups
   - Dashboard showing: flag status, rollout %, users affected, key metrics per variant

6. **Implementation options (pick the best fit):**
   - Self-hosted with Redis/PostgreSQL (we control everything, no vendor)
   - OR use LaunchDarkly/Unleash SDK (managed, less maintenance)
   - Either way, build the evaluation logic, React hook, and rollout automation

Build the flag evaluation engine, targeting rules, React SDK hook, and the gradual rollout automation that monitors metrics and auto-progresses or auto-rolls-back.
```

### What Your Agent Will Do

1. **Read the `feature-flag-manager` skill** for flag evaluation, deterministic bucketing, targeting rules, and lifecycle patterns
2. **Design the flag data model** — flag name, type, rules (percentage, user list, attribute-based), enabled state, created/updated timestamps
3. **Build the evaluation engine** — deterministic hashing (MurmurHash on userId + flagName), rule evaluation with priority ordering, local caching with Redis pub/sub invalidation
4. **Implement targeting rules** — percentage rollout, user/account allowlists, attribute matchers (plan, country, age), boolean overrides
5. **Create the server-side SDK** — `flagClient.isEnabled('new-pdf-engine', { userId, accountId, plan, country })` with <1ms evaluation from cached rules
6. **Build the React hook** — `useFeatureFlag('redesigned-dashboard')` that bootstraps flags on page load and updates via SSE/WebSocket
7. **Set up the 5 initial flags** — new-pdf-engine (5% rollout), redesigned-dashboard (50/50 A/B), ai-chatbot (rule-based), bulk-invoice-api (allowlist), maintenance-mode (kill switch)
8. **Wire analytics integration** — send flag assignments as user properties to Mixpanel/Amplitude, track variant-level metrics
9. **Build rollout automation** — monitor error rate and p95 latency per variant, auto-progress (5% → 25% → 50% → 100%) if metrics are within thresholds, auto-rollback if error rate exceeds baseline by 2x
10. **Add flag hygiene tooling** — report flags that have been at 100% for >14 days as candidates for code removal, lint rule to flag stale feature flag checks

### Expected Outcome

- **Rollout safety**: New PDF engine ships to 5% first — the 200+ line item bug is caught when only 600 accounts are affected, not 12,000
- **Kill switch speed**: Flag toggled to 0% in under 3 seconds via admin UI (no redeploy, no CI pipeline)
- **Evaluation latency**: <0.5ms per flag check from local cache, Redis pub/sub syncs rule changes in <2 seconds
- **A/B testing**: Dashboard redesign runs as 50/50 experiment — data shows new design increases invoice creation by 12% but decreases PDF exports by 8%, informing the decision with data
- **Targeting precision**: AI chatbot shown only to free-tier US/UK users (2,100 accounts), enterprise features enabled for exactly 3 named accounts
- **Feature velocity**: Teams ship 3x more frequently — small rollouts with instant rollback remove the fear of deploying
- **Flag hygiene**: Automated alerts when flags are stale; codebase stays clean with 0 flags older than 30 days at 100%
- **Incident reduction**: Zero full-blast-radius incidents in the 3 months after adoption (vs 2 in the prior 3 months)
