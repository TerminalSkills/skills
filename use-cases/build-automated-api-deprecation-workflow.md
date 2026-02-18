---
title: "Build Automated API Deprecation Workflow with AI"
slug: build-automated-api-deprecation-workflow
description: "Manage API endpoint deprecation lifecycle from usage analysis through consumer notification to safe removal."
skills: [api-tester, coding-agent, github]
category: development
tags: [api-deprecation, api-lifecycle, versioning, developer-experience]
---

# Build Automated API Deprecation Workflow with AI

## The Problem

A 30-person platform team maintains a REST API with 140 endpoints. Over the years, 23 endpoints have been superseded by newer versions but never removed because nobody knows who's still calling them. The deprecated endpoints still get bug reports, need security patches, and slow down every refactor. When someone tried removing an endpoint last year, it broke a partner integration nobody knew about — causing a 4-hour outage. Now nobody dares remove anything, and the API surface keeps growing. The team spends 20% of their maintenance time on endpoints that should no longer exist.

## The Solution

Use the **api-tester** skill to analyze endpoint usage patterns, the **coding-agent** to build deprecation tracking infrastructure, and **github** to manage the deprecation lifecycle through issues and PRs.

```bash
npx terminal-skills install api-tester coding-agent github
```

## Step-by-Step Walkthrough

### 1. Identify deprecation candidates

Tell the agent to analyze your API:

```text
Analyze our API endpoints and identify candidates for deprecation. Check for: endpoints with duplicate functionality (v1 vs v2), endpoints with fewer than 10 calls per day, and endpoints not referenced in our current client SDKs. Cross-reference with access logs from the past 90 days.
```

### 2. The agent produces a deprecation report

```text
API Deprecation Analysis — 140 endpoints scanned:

Immediate candidates (superseded + low traffic):
- GET /v1/users/{id}         — 3 calls/day (v2 available, 2 consumers)
- POST /v1/reports/generate  — 0 calls/day (v2 available, 0 consumers)
- GET /v1/analytics/summary  — 8 calls/day (v2 available, 1 consumer)

Review candidates (low traffic, no replacement):
- GET /internal/health-check-legacy — 12 calls/day (appears automated)
- POST /v1/export/pdf               — 5 calls/day (3 consumers)

Consumer breakdown for top candidates:
- GET /v1/users/{id}: Partner API key "acme-integration" (2 calls/day), internal monitoring (1 call/day)
- GET /v1/analytics/summary: Mobile app v3.1 and below (8 calls/day)
```

### 3. Create deprecation timeline and notices

```text
Create a deprecation plan for the v1/users endpoint. Set a 90-day sunset period. Generate the deprecation headers, API response warnings, and consumer notification emails.
```

The agent sets up the full deprecation lifecycle:

```text
Deprecation plan created for GET /v1/users/{id}:

Timeline:
- Day 0 (today): Add Sunset and Deprecation headers to responses
- Day 0: Notify identified consumers via email
- Day 30: Add deprecation warning to response body
- Day 60: Return 299 warning header + log all remaining callers
- Day 90: Return 410 Gone (with migration guide URL)

Files generated:
- middleware/deprecation-headers.ts — Adds Sunset/Deprecation headers
- docs/migration-guide-v1-users.md — Step-by-step migration to v2
- emails/deprecation-notice-v1-users.md — Consumer notification template
```

### 4. Track migration progress

The agent creates a GitHub issue to track each deprecation:

```text
GitHub issue created: #892 "Deprecate GET /v1/users/{id} — Sunset: 2026-05-18"

Checklist:
- [x] Deprecation headers added
- [x] Consumer notification sent
- [x] Migration guide published
- [ ] All consumers migrated (1/2 remaining)
- [ ] 30-day warning activated
- [ ] 60-day final warning activated
- [ ] Endpoint removed

Labels: api-deprecation, sunset/2026-05-18
Assigned: @platform-team
```

### 5. Monitor consumer migration

```text
Show me migration progress for all active deprecations. Which consumers haven't migrated yet?
```

```text
Active Deprecations Dashboard:

GET /v1/users/{id} — Sunset: May 18, 2026
  Progress: 1/2 consumers migrated
  Remaining: "acme-integration" (2 calls/day, contacted Feb 17)
  Days until sunset: 90

POST /v1/reports/generate — Sunset: Apr 15, 2026
  Progress: 0/0 consumers (no active callers)
  Ready for removal now

GET /v1/analytics/summary — Sunset: May 18, 2026
  Progress: 0/1 consumers migrated
  Remaining: Mobile app v3.1 (force-update scheduled Mar 1)
  Days until sunset: 90
```

## Real-World Example

Kenji is a platform engineer at a 30-person API-first company. The team wastes hours maintaining 23 deprecated endpoints because they're afraid to remove them.

1. He asks the agent to analyze all 140 endpoints against 90 days of access logs and identify deprecation candidates
2. The agent finds 3 endpoints that are superseded and have fewer than 10 calls per day, with only 3 consumers total
3. It generates deprecation headers, migration guides, and consumer notifications for each endpoint
4. GitHub issues track the migration progress with automated checklists and sunset dates
5. After the first 90-day cycle, 3 endpoints are safely removed. The team applies the same process quarterly, reducing their API surface by 15% and reclaiming 20% of maintenance time
