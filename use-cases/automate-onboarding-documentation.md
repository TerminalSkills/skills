---
title: "Automate Onboarding Documentation for New Hires"
slug: automate-onboarding-documentation
description: "Generate comprehensive onboarding guides from existing docs, code, and tribal knowledge so new hires ramp up in days, not months."
skills: [markdown-writer, content-writer, doc-parser]
category: content
tags: [onboarding, documentation, new-hires, knowledge-management, developer-experience]
---

# Automate Onboarding Documentation for New Hires

## The Problem

A new backend engineer joins your 20-person SaaS startup on Monday. There's no onboarding guide. Setup instructions live in a 2-year-old README that references a deprecated Docker Compose file. Environment variable names changed twice since anyone updated the wiki. The deploy process exists only in Tomás's head — he wrote the CI pipeline 18 months ago and never documented it.

New hires spend their first 2-3 weeks piecing together tribal knowledge from old Slack threads and debugging setup issues every previous hire also hit. Senior engineers lose 15-20 hours per new hire answering the same questions. With 6 hires planned this quarter, that's over 100 hours of engineering time burned on repeated explanations.

## The Solution

Use **doc-parser** to extract existing knowledge from READMEs, config files, and CI pipelines, **content-writer** to synthesize it into structured guides, and **markdown-writer** to produce clean documentation that lives in the repo.

```bash
npx terminal-skills install doc-parser content-writer markdown-writer
```

## Step-by-Step Walkthrough

### 1. Inventory existing documentation

```
Scan our repo for all documentation: READMEs, markdown files, docker-compose files, Makefiles, and CI configs. List what exists and what's outdated.
```

```
DOCUMENTATION INVENTORY:
  README.md — Last updated 14 months ago, references Node 16 (current: 20)
  docs/api.md — Accurate but incomplete, covers 12 of 31 endpoints
  docker-compose.yml — 3 services, comments explain setup
  .env.example — 18 variables, 4 have no description
  Makefile — 12 targets, 3 are broken
  .github/workflows/deploy.yml — Current, well-commented

  GAPS: No setup guide, no architecture overview, no debugging playbook
```

### 2. Generate the local development setup guide

```
Create a step-by-step local dev setup guide from docker-compose.yml, .env.example, and the Makefile.
```

```
# Local Development Setup

## Prerequisites
- Docker Desktop 4.x+ and Docker Compose v2
- Node.js 20.x (see .nvmrc)

## Steps
  1. cp .env.example .env — set DATABASE_URL, REDIS_URL, JWT_SECRET
  2. docker compose up -d postgres redis — wait for healthy status
  3. npm install && npm run db:migrate && npm run db:seed
  4. make dev — API on :3000, worker on :3001, frontend on :5173

## Common Issues
  - Port 5432 conflict: stop local PostgreSQL first
  - Migration fails: check DATABASE_URL uses port 5433 (Docker-mapped)
```

### 3. Build the architecture overview

```
Analyze our codebase structure and CI configs. Generate an architecture overview with services, data flow, and key decisions.
```

```
# Architecture Overview

## Services
  API (Express.js) — 31 REST endpoints, JWT auth
  Worker (Bull + Redis) — Background jobs: emails, reports, webhooks
  Frontend (React + Vite) — SPA, proxies to API
  PostgreSQL 15 — 24 tables | Redis 7 — queue, cache, rate limiting

## Data Flow
  User → Frontend → API → PostgreSQL / Redis → Worker → external APIs

## Key Decisions
  Monorepo structure | node-pg-migrate for DB | JWT with refresh tokens
  GitHub Actions → Docker → Railway deploys
```

### 4. Create the first-week checklist

```
Generate a day-by-day first-week checklist for new engineers covering setup, codebase orientation, and first PR.
```

```
# Your First Week

Day 1: Get access (GitHub, Slack, Railway, Sentry). Follow setup guide. Run tests.
Day 2: Read Architecture Overview. Trace a request end-to-end. Read 3 recent PRs.
Day 3-4: Pick a good-first-issue. Branch, code, test, open PR.
Day 5: Update onboarding docs with anything wrong. Meet 2 teammates.
```

### 5. Add documentation freshness checks

```
Create a CI check that flags PRs changing code without updating related docs.
```

```
Added .github/workflows/docs-check.yml:
  Triggers on PRs modifying src/, docker-compose.yml, or .env.example
  Posts reminder comment if corresponding docs/ files weren't updated
  Quarterly review: scheduled issue on first Monday of each quarter
```

## Real-World Example

Dani, engineering lead at a 15-person fintech team, dreaded hiring season. Every new engineer took 2-3 weeks to ship their first PR. The payment service had zero documentation — setup required knowing which environment variables came from a specific Slack thread from 2024.

She ran the three-skill workflow on a Thursday afternoon. The doc-parser found 14 markdown files, 6 referencing deprecated services. The content-writer synthesized accurate instructions by cross-referencing docker-compose.yml, Makefile, and CI configs. The markdown-writer produced a 4-document onboarding package: setup guide, architecture overview, first-week checklist, and debugging playbook.

The next hire, Rui, had his dev environment running by lunch on day one — previously a 2-3 day ordeal. He opened his first PR on Wednesday and fixed two outdated steps in the guide, establishing the update-as-you-go culture Dani wanted. Over the quarter, the team saved an estimated 60 hours across 4 new hires.

## Related Skills

- [doc-parser](../skills/doc-parser/) — Extracts and analyzes existing documentation from repos and wikis
- [content-writer](../skills/content-writer/) — Synthesizes information into clear, structured prose
- [markdown-writer](../skills/markdown-writer/) — Produces clean, well-formatted markdown documentation
