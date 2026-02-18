---
title: "Decompose a Monolith into Microservices with AI-Guided Domain Analysis"
slug: decompose-monolith-to-microservices
description: "Analyze a monolithic codebase to identify service boundaries, extract bounded contexts, and generate a phased migration plan with dependency tracking."
skills: [code-reviewer, data-analysis, coding-agent, docker-helper]
category: development
tags: [microservices, monolith, architecture, domain-driven-design, migration]
---

# Decompose a Monolith into Microservices with AI-Guided Domain Analysis

## The Problem

A 4-year-old Rails monolith has grown to 380K lines of code. Deployments take 45 minutes, a bug in the billing module blocks the entire release train, and scaling the search feature means scaling the whole application — all 380K lines, all 142 database tables, all 67 controllers. The team of 18 developers steps on each other's toes in every sprint — merging to main is a daily adventure in conflict resolution, and a CSS change in the checkout flow once broke the admin dashboard because they share a layout partial.

Leadership approved a microservices migration, but nobody knows where to draw the service boundaries without breaking everything. The last attempt, six months ago, stalled at week 3 because the team couldn't agree on how to split the shared `User` model that's referenced from 47 different files. The architect drew service boundaries on a whiteboard based on organizational structure (billing team gets a billing service, etc.), but the boundaries didn't match the actual code dependencies. The first extraction attempt created a distributed monolith — all the downsides of microservices (network calls, deployment complexity, distributed debugging) with none of the benefits (independent scaling, isolated failures, team autonomy).

## The Solution

Using **code-reviewer** to analyze the codebase for coupling patterns and module boundaries, **data-analysis** to map data flow and dependency graphs, **coding-agent** to generate extraction scaffolding, and **docker-helper** to containerize each new service, the monolith gets decomposed based on actual code dependencies rather than whiteboard diagrams.

## Step-by-Step Walkthrough

The decomposition follows a disciplined sequence: understand the current state, draw boundaries based on data, plan the extraction order, scaffold the first service, and verify with shadow traffic before cutting over. Every step is reversible — if the team decides a boundary is wrong, they haven't committed to anything irreversible yet.

### Step 1: Map the Monolith's Module Structure

Before drawing any boundaries, understand what you actually have. Most teams skip this step and draw boundaries based on organizational structure or intuition. The code tells a different story:

```text
Analyze this Rails monolith codebase. Map every model, controller, and service object to a domain concept. Build a dependency graph showing which modules call each other, which models are shared across controllers, and where the highest coupling exists. I want to see: module clusters, shared database tables, and cross-cutting concerns. Focus on app/models/, app/controllers/, and app/services/.
```

The scan covers 142 models, 67 controllers, and 93 service objects. Five natural clusters emerge from the dependency analysis:

| Cluster | Models | Controllers | Service Objects | Key Responsibility |
|---------|--------|-------------|-----------------|-------------------|
| User/Auth | 23 | 8 | 12 | Registration, authentication, roles, permissions |
| Billing/Subscription | 18 | 6 | 15 | Plans, invoices, payment processing, dunning |
| Product/Catalog | 31 | 19 | 24 | Listings, categories, inventory, pricing |
| Search/Discovery | 12 | 5 | 8 | Search indexing, filters, recommendations |
| Notifications | 8 | 3 | 6 | Email, push, in-app, template rendering |

The remaining 50 models, 26 controllers, and 28 service objects don't cluster cleanly — they're shared infrastructure (logging, caching, configuration) or coupling hotspots that straddle multiple domains. This is normal. A clean decomposition doesn't mean every file maps to exactly one service — it means the ambiguous files are identified and consciously assigned rather than accidentally duplicated.

The dependency graph flags **14 models referenced from 3 or more clusters**. These are the coupling hotspots that make decomposition hard. The `User` model alone is imported in 47 files across every cluster. `Product` appears in 38. `Subscription` is referenced from both Billing (where it belongs) and 6 places in Catalog (where it shouldn't be). These shared models are why the previous extraction attempt failed — you can't cleanly extract a service when half the codebase reaches into its internals.

### Step 2: Draw Service Boundaries Using Actual Dependencies

```text
Based on the dependency graph, propose service boundaries following DDD principles. For each proposed service: list the models it owns, the API calls it would need to make to other services, the shared database tables that would need to be split, and the estimated extraction difficulty (easy/medium/hard). Flag any circular dependencies that would need to be broken first.
```

Six services emerge with clear ownership, but three circular dependencies need to be broken before any extraction can begin:

- **Billing <-> User:** Billing reads user data directly from the User table instead of through an API. Every billing query JOINs on users.
- **Catalog <-> Search:** Search indexes are rebuilt inside ActiveRecord callbacks on Catalog models. The search system is deeply embedded in catalog write operations.
- **Notifications -> everything:** Every other cluster triggers notifications by calling notification models and service objects directly. Notifications has no boundary — it's woven into every workflow.

The recommendation: break all three circular dependencies with event-driven patterns *before* extracting any service. This is counterintuitive — the team wants to start extracting services immediately — but circular dependencies make extraction impossible. If Billing depends on User and User depends on Billing, you can't extract either one first.

The pattern for breaking each cycle: Billing subscribes to user change events instead of querying the User table directly. Search consumes catalog events through a message queue instead of being triggered by model callbacks. Notifications become event consumers rather than method calls — when an order is placed, the order service publishes an event and the notification service decides what to send.

**Extraction difficulty by service:**

| Service | Difficulty | Why | Team Weeks (3-person team) |
|---------|------------|-----|---------------------------|
| Search | Easy | Already loosely coupled, Elasticsearch does heavy lifting | 3 |
| Notifications | Easy | Mostly async, natural fit for event consumption | 2 |
| Billing | Medium | Clean boundaries but complex business logic, payment flows | 4 |
| Auth | Medium | Shared session state across all services complicates extraction | 3 |
| Catalog | Hard | 31 models, deep coupling to everything else | 4 |
| Core/API Gateway | Hard | Orchestration layer, touches all services | 4 |

### Step 3: Plan the Strangler Fig Migration

```text
Create a phased migration plan using the strangler fig pattern. Start with the easiest service to extract (Search). For each phase: what gets extracted, what API contracts need to be defined, what data needs to be replicated or split, what the rollback strategy is, and how long it should take a team of 3. Generate the actual API contract (OpenAPI spec) for the Search service.
```

The strangler fig pattern means new services grow around the monolith, intercepting requests one by one, until the monolith shrinks to nothing. No big bang rewrite, no "we'll switch everything on Tuesday," no all-hands-on-deck migration weekend. The monolith keeps running throughout — if anything goes wrong with the new service, traffic routes back to the monolith instantly.

The 5-phase plan spans 16 weeks:

| Phase | Service | Duration | Approach | Rollback |
|-------|---------|----------|----------|----------|
| 1 | Search | 3 weeks | API gateway routes search traffic to new service, dual-write for indexing | Feature flag to route back to monolith |
| 2 | Notifications | 2 weeks | Event consumers replace direct model calls | Switch consumers off, re-enable direct calls |
| 3 | Billing | 4 weeks | New service owns billing tables, API for user data | Dual-write during transition |
| 4 | Auth | 3 weeks | JWT-based auth, session migration for existing users | Fallback to monolith session store |
| 5 | Catalog + Gateway | 4 weeks | Largest extraction, API gateway becomes permanent | Phase-by-phase endpoint migration |

Phase 1 extracts Search behind an API gateway with dual-write to both the new service and the monolith. Feature flags control traffic shifting: 1% of searches go to the new service, then 10%, then 50%, then 100%. If anything breaks at any stage, the flag flips back in seconds. Each phase includes an OpenAPI spec, database migration scripts, feature flag configuration, and a rollback runbook that anyone on the team can execute.

### Step 4: Scaffold the First Service

```text
Scaffold the Search service based on the migration plan. It should be a standalone Node.js service with: the Elasticsearch integration extracted from the monolith, a REST API matching the OpenAPI spec, health checks, structured logging, Docker configuration for local dev and production, and a shared event schema for catalog updates. Keep the same search behavior — this is a lift-and-shift, not a rewrite.
```

The generated service includes:

- **12 endpoint handlers** matching the monolith's search behavior exactly — same query parameters, same response format, same pagination
- **Elasticsearch client configuration** extracted from the Rails codebase, with connection pooling and retry logic
- **Event consumer** for catalog sync, replacing the ActiveRecord callbacks with a message queue consumer that processes catalog changes asynchronously
- **Multi-stage Dockerfile** — build stage compiles TypeScript, runtime stage contains only production dependencies (final image: 85MB)
- **docker-compose** for local development with Elasticsearch, Redis, and RabbitMQ
- **Health check endpoints** for Kubernetes readiness and liveness probes

This is deliberately boring — and that's the point. The goal is identical behavior in a separate process, not a better search engine. No rewriting the ranking algorithm. No adding new features. No "while we're at it, let's also fix the pagination." Improvements come later, after the extraction is proven in production and the team has confidence in the service boundary.

Mixing "extract" with "improve" is how microservices migrations stall at month 3. The Search service should return exactly the same results as the monolith for every query. If it doesn't, you've introduced two variables — a new architecture and new behavior — and when something breaks, you can't tell which variable caused it.

### Step 5: Verify with Shadow Traffic Comparison

```text
Generate integration tests that verify the Search service returns identical results to the monolith for the same queries. Create a traffic comparison tool that sends production queries to both the monolith and new service, compares responses, and reports discrepancies. Add Prometheus metrics for latency, error rate, and result count differences.
```

A shadow traffic comparator replays 1% of production search queries against both systems simultaneously. The comparison dashboard shows result parity at 99.7% — the 0.3% discrepancy comes from a timing issue where the event consumer processes catalog updates slightly behind the monolith's synchronous ActiveRecord callbacks. A catalog item added at 14:00:00 appears in monolith search results at 14:00:01 but in the new service at 14:00:03.

After tuning the event consumer (smaller batch size, more frequent polling), parity reaches 99.95%. The remaining 0.05% is items that changed during the comparison window — a race condition in the test, not the service.

Alerting rules fire when divergence exceeds 1%, catching any regression before it affects real users. The team sets a quality gate: no cutover until 7 consecutive days above 99.5% parity.

This shadow traffic approach is non-negotiable for a production migration. Without it, the only way to know if the new service works correctly is to cut over and find out — which is exactly the kind of risky move that makes microservices migrations fail. Shadow traffic lets you prove correctness before any real user is affected.

## Real-World Example

A CTO at a 40-person e-commerce company inherits a 380K-line Rails monolith. Deploy frequency has dropped to once per week because every change risks breaking unrelated features. A bug in billing required a hotfix that couldn't ship because an unrelated catalog change in the same release branch broke search. Scaling for Black Friday requires 8x the infrastructure because search, billing, and the product catalog all scale as one unit.

The codebase analysis maps 5 domain clusters with 14 coupling hotspots. The dependency graph shows things the team didn't know — Billing was directly querying the User table in 11 places, and the Notification system had no boundary at all. The team reviews the graph and agrees on 6 services for the first time in 4 years. Previous architectural discussions were based on organizational charts; this one is based on actual code dependencies.

Search goes first because it's the easiest extraction and the biggest scaling bottleneck. Shadow traffic comparison shows 99.7% result parity before cutting over. The strangler fig approach means the monolith keeps running throughout — no risky cutover weekend, no all-hands-on-deck migration event. If the new search service has a problem, one feature flag flips traffic back.

After 4 months, 3 services run independently. Deploy frequency increases from once per week to 12 times per week — the billing team ships without waiting for catalog, and vice versa. Teams own their services end-to-end, which means on-call rotations are focused (the billing team doesn't get paged for search issues) and code reviews are faster (smaller, domain-specific PRs instead of monolith-wide changes).

Black Friday scaling costs drop 60% because search scales independently on its own Elasticsearch cluster. The catalog service stays at baseline capacity because Black Friday doesn't create new products — it just drives more searches. The billing service scales modestly to handle increased checkout volume. Instead of scaling the entire monolith 8x, each service scales to exactly the capacity it needs.
