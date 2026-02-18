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

A 4-year-old Rails monolith has grown to 380K lines of code. Deployments take 45 minutes, a bug in the billing module blocks the entire release train, and scaling the search feature means scaling the whole application. The team of 18 developers steps on each other's toes in every sprint. Leadership approved a microservices migration, but nobody knows where to draw the service boundaries without breaking everything.

## The Solution

Use `code-reviewer` to analyze the codebase for coupling patterns and module boundaries, `data-analysis` to map data flow and dependency graphs between modules, `coding-agent` to generate the extraction scaffolding, and `docker-helper` to containerize each new service.

```bash
npx terminal-skills install code-reviewer data-analysis coding-agent docker-helper
```

## Step-by-Step Walkthrough

### 1. Analyze the monolith's module structure

```text
Analyze this Rails monolith codebase. Map every model, controller, and service
object to a domain concept. Build a dependency graph showing which modules
call each other, which models are shared across controllers, and where the
highest coupling exists. I want to see: module clusters, shared database tables,
and cross-cutting concerns. Focus on app/models/, app/controllers/, and
app/services/.
```

The agent scans 142 models, 67 controllers, and 93 service objects. It produces a dependency graph showing 5 natural clusters: User/Auth (23 models), Billing/Subscription (18 models), Product/Catalog (31 models), Search/Discovery (12 models), and Notifications (8 models). It flags 14 models that are referenced from 3+ clusters — these are the coupling hotspots.

### 2. Identify bounded contexts and service boundaries

```text
Based on the dependency graph, propose service boundaries following DDD principles.
For each proposed service: list the models it owns, the API calls it would need
to make to other services, the shared database tables that would need to be
split, and the estimated extraction difficulty (easy/medium/hard). Flag any
circular dependencies that would need to be broken first.
```

The agent proposes 6 services with clear ownership. It identifies 3 circular dependencies (Billing↔User, Catalog↔Search, Notifications→everything) and recommends breaking them with event-driven patterns. Each service gets a difficulty rating: Search (easy — already loosely coupled), Notifications (easy — mostly async), Billing (medium — clean boundaries but complex logic), Auth (medium — shared session state), Catalog (hard — 31 models, deep coupling), and Core/API Gateway (hard — orchestration layer).

### 3. Generate the strangler fig migration plan

```text
Create a phased migration plan using the strangler fig pattern. Start with
the easiest service to extract (Search). For each phase: what gets extracted,
what API contracts need to be defined, what data needs to be replicated or
split, what the rollback strategy is, and how long it should take a team of 3.
Generate the actual API contract (OpenAPI spec) for the Search service.
```

The agent produces a 5-phase plan spanning 16 weeks. Phase 1 extracts Search behind an API gateway with dual-write to the new service and the monolith. Each phase includes an OpenAPI spec, database migration scripts, feature flag configuration for gradual traffic shifting, and a rollback runbook.

### 4. Scaffold the first extracted service

```text
Scaffold the Search service based on the migration plan. It should be a
standalone Node.js service with: the Elasticsearch integration extracted from
the monolith, a REST API matching the OpenAPI spec, health checks, structured
logging, Docker configuration for local dev and production, and a shared
event schema for catalog updates. Keep the same search behavior — this is
a lift-and-shift, not a rewrite.
```

The agent generates a complete service with 12 endpoint handlers, Elasticsearch client configuration, event consumer for catalog sync, Dockerfile with multi-stage build, docker-compose for local development, and health check endpoints. All search logic is ported from the Rails codebase with equivalent behavior.

### 5. Set up cross-service testing and monitoring

```text
Generate integration tests that verify the Search service returns identical
results to the monolith for the same queries. Create a traffic comparison
tool that sends production queries to both the monolith and new service,
compares responses, and reports discrepancies. Add Prometheus metrics for
latency, error rate, and result count differences.
```

The agent creates a shadow traffic comparator that replays 1% of production queries against both systems, a comparison dashboard showing result parity at 99.7%, and alerting rules for when divergence exceeds 1%.

## Real-World Example

A CTO at a 40-person e-commerce company inherits a 380K-line Rails monolith. Deploy frequency has dropped to once per week because every change risks breaking unrelated features. Scaling for Black Friday requires 8x the infrastructure because everything scales together.

1. The agent analyzes the codebase and maps 5 domain clusters with 14 coupling hotspots
2. Service boundaries are drawn following DDD — the team agrees on 6 services after reviewing the dependency graph
3. Search is extracted first (lowest risk, clearest boundaries) using the strangler fig pattern
4. Shadow traffic comparison shows 99.7% result parity before cutting over
5. After 4 months, 3 services run independently — deploy frequency increases to 12 per week, and Black Friday scaling costs drop 60%
