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

A new backend engineer joins Dani's 20-person SaaS startup on Monday. There is no onboarding guide. The README references a deprecated Docker Compose file from two years ago. Environment variable names changed twice since anyone updated the wiki. The deploy process exists only in Tomas's head — he wrote the CI pipeline 18 months ago and never documented it. When Tomas is on vacation, nobody deploys. When Tomas is sick, the team pushes the release back a week.

New hires spend their first 2-3 weeks piecing together tribal knowledge from old Slack threads and debugging setup issues that every previous hire also hit. Senior engineers lose 15-20 hours per new hire answering the same questions: "What port does Postgres run on in Docker?" "Where do I get the Stripe test key?" "Why does the seed script fail on M1 Macs?" "Which branch do I deploy from?" With 6 hires planned this quarter, that is over 100 hours of engineering time burned on repeated explanations — and that is just the direct cost. The indirect cost is 6 engineers who feel lost for their first two weeks instead of productive.

## The Solution

Using the **doc-parser** skill to extract existing knowledge from READMEs, config files, and CI pipelines, the **content-writer** to synthesize it into structured guides, and the **markdown-writer** to produce clean documentation that lives in the repo, the agent builds a complete onboarding package from the source code itself — not from what people remember about the source code, but from what the code actually says.

## Step-by-Step Walkthrough

### Step 1: Inventory Existing Documentation

Before writing anything new, figure out what already exists and what is still accurate. Most teams have more documentation than they think — it is just scattered, outdated, or both.

```text
Scan our repo for all documentation: READMEs, markdown files, docker-helper files, Makefiles, and CI configs. List what exists and what's outdated.
```

The inventory reveals the real situation:

| File | Status | Issue |
|---|---|---|
| `README.md` | Outdated (14 months) | References Node 16, current is Node 20 |
| `docs/api.md` | Partial | Covers 12 of 31 endpoints |
| `docker-helper.yml` | Current | 3 services, comments explain setup |
| `.env.example` | Partial | 18 variables, 4 have no description |
| `Makefile` | Broken | 12 targets, 3 no longer work |
| `.github/workflows/deploy.yml` | Current | Well-commented |

The gaps are where new hires spend their time: no setup guide, no architecture overview, no debugging playbook. The information exists — scattered across `docker-helper.yml` comments, `.env.example` defaults, `Makefile` targets, and CI configs. Nobody has assembled these fragments into something a new hire can follow from top to bottom.

### Step 2: Generate the Local Development Setup Guide

The setup guide is the highest-value document because every single new hire needs it on day one. Getting the dev environment running should take 30 minutes, not 3 days.

```text
Create a step-by-step local dev setup guide from docker-helper.yml, .env.example, and the Makefile.
```

The guide is built by reading the actual config files — not by asking someone to recall the process from memory. This matters because what people remember often differs from what the config files actually say.

**Prerequisites:**
- Docker Desktop 4.x+ and Docker Compose v2
- Node.js 20.x (see `.nvmrc` — this file is the source of truth, not the README that says Node 16)

**Setup steps:**

```bash
# 1. Configure environment
cp .env.example .env
# Set DATABASE_URL, REDIS_URL, JWT_SECRET (see comments in .env.example)

# 2. Start infrastructure
docker compose up -d postgres redis
# Wait for healthy status before proceeding

# 3. Install and initialize
npm install && npm run db:migrate && npm run db:seed

# 4. Start development servers
make dev
# API on :3000, worker on :3001, frontend on :5173
```

**Common issues** (extracted from Slack threads and git history):
- **Port 5432 conflict:** Stop local PostgreSQL first, or the Docker container fails silently and the migration step gives a misleading "connection refused" error
- **Migration fails:** Check that `DATABASE_URL` uses port 5433 (Docker-mapped), not 5432. This is the single most common new-hire setup issue.
- **Seed script fails on Apple Silicon:** Run `npm rebuild` after `npm install` to recompile native modules for the ARM architecture

These "common issues" are the kind of tribal knowledge that costs new hires hours. Written down, each one saves 30 minutes of debugging and a Slack message to a senior engineer.

### Step 3: Build the Architecture Overview

New hires need a mental model of the system before they can navigate the code. Without it, every file feels disconnected.

```text
Analyze our codebase structure and CI configs. Generate an architecture overview with services, data flow, and key decisions.
```

The overview is derived from the actual codebase structure — not from a whiteboard drawing that may be six months out of date:

**Services:**
- **API** (Express.js) — 31 REST endpoints, JWT authentication, input validation with Zod
- **Worker** (Bull + Redis) — background jobs for emails, PDF report generation, and outbound webhooks
- **Frontend** (React + Vite) — SPA that proxies API requests through Vite's dev server in development
- **PostgreSQL 15** — 24 tables, primary data store
- **Redis 7** — serves triple duty as job queue, cache layer, and rate limiter

**Data flow:**
User requests hit the React frontend, which proxies to the API. The API reads and writes PostgreSQL for persistent data and enqueues background work in Redis. The worker picks up jobs and handles external integrations: sending emails through Resend, generating PDF reports, and firing webhooks to customer-configured endpoints.

**Key architectural decisions and why they were made:**
- **Monorepo structure** — API, worker, and frontend in one repo so a single PR can change the API contract and the frontend consumer together
- **`node-pg-migrate` for database migrations** — chosen over Prisma Migrate because the team wanted explicit SQL control and the ability to write complex migrations without an ORM abstraction
- **JWT with refresh tokens** — access tokens expire in 15 minutes, refresh tokens in 7 days. The API middleware validates the access token; the `/auth/refresh` endpoint handles renewal.
- **GitHub Actions to Docker to Railway** — the deploy pipeline builds a Docker image, pushes to the registry, and Railway picks it up automatically

### Step 4: Create the First-Week Checklist

A checklist turns "figure it out" into a structured path with clear daily goals:

```text
Generate a day-by-day first-week checklist for new engineers covering setup, codebase orientation, and first PR.
```

**Day 1:** Get access to GitHub, Slack, Railway, and Sentry. Follow the setup guide. Run the test suite. If any test fails, file an issue — it means the guide or the tests are wrong, not you.

**Day 2:** Read the architecture overview. Trace a single request end-to-end: pick an API endpoint, follow the code from route handler to controller to database query to response serialization. Read 3 recent merged PRs to understand the team's code style, review culture, and commit message conventions.

**Day 3-4:** Pick a `good-first-issue` from the backlog. Branch, code, write tests, open a PR. Do not aim for perfection — aim for a complete PR that starts a conversation with the team.

**Day 5:** Update the onboarding docs with anything that was wrong, unclear, or missing. Meet 2 teammates for 30-minute coffee chats. This last step is the one that keeps the documentation alive — each new hire is the best person to spot what the guide gets wrong, because they just experienced it firsthand.

### Step 5: Add Documentation Freshness Checks

Documentation that is not maintained is documentation that lies. The README said Node 16 for 14 months. A CI check keeps the docs honest:

```text
Create a CI check that flags PRs changing code without updating related docs.
```

The workflow `.github/workflows/docs-check.yml` triggers on PRs that modify `src/`, `docker-helper.yml`, or `.env.example`. If the corresponding files in `docs/` were not updated in the same PR, the CI posts a reminder comment — not a blocking check (that would be too aggressive), just a nudge: "This PR modifies docker-helper.yml. Does docs/setup.md need an update?"

A quarterly scheduled issue on the first Monday of each quarter triggers a full documentation review. The issue template includes a checklist of every doc file with a "still accurate?" checkbox.

## Real-World Example

Dani runs the three-skill workflow on a Thursday afternoon. The doc-parser finds 14 existing markdown files, 6 of which reference deprecated services or outdated Node versions. The content-writer cross-references `docker-helper.yml`, the `Makefile`, and the CI config to build accurate instructions — catching that the Makefile's `make test` target still references a test runner the team replaced six months ago. The markdown-writer produces a four-document onboarding package: setup guide, architecture overview, first-week checklist, and debugging playbook.

The following Monday, the next hire Rui starts. He has his dev environment running by lunch on day one — previously a 2-3 day ordeal involving multiple Slack conversations, at least one "works on my machine" dead end, and a senior engineer spending an hour debugging a port conflict over screen share. He opens his first PR on Wednesday. On Friday, he updates two outdated steps in the setup guide (the Redis version in the prerequisites and a missing environment variable), establishing the update-as-you-go culture Dani wanted.

Over the quarter, four new engineers onboard using the same documentation. Each one finds and fixes a small issue, improving the guide incrementally. The team saves an estimated 60 hours across those 4 hires — and senior engineers stop context-switching to answer the same setup questions for the fifth time. The documentation freshness check catches a PR that adds a new environment variable to `.env.example` without updating the setup guide, and the developer adds the missing line before merging.
