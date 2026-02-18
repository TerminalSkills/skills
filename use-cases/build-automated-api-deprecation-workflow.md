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

A 30-person platform team maintains a REST API with 140 endpoints. Over the years, 23 endpoints have been superseded by newer versions but never removed — because nobody knows who's still calling them. These zombie endpoints still get bug reports, need security patches, and slow down every refactor. The team spends 20% of their maintenance time on code that should no longer exist.

When someone tried removing an endpoint last year, it broke a partner integration nobody knew about — causing a 4-hour outage and a difficult conversation with a customer who was paying $50K/year. Now nobody dares touch anything deprecated. New endpoints get added, old ones linger, and the API surface keeps growing. New developers onboard and ask "which version do I use?" and the answer is always "it depends, let me check" followed by a Slack thread that goes nowhere.

## The Solution

Using the **api-tester**, **coding-agent**, and **github** skills, the workflow analyzes 90 days of access logs to identify who's calling what and how often, builds deprecation infrastructure with proper HTTP sunset headers and migration guides, tracks consumer migration through GitHub issues, and provides a clear dashboard of what's safe to remove and what's still in use.

The key shift: deprecation goes from a scary, manual, error-prone process (that caused a 4-hour outage) to a systematic, data-driven removal cycle with zero surprises. Every consumer is identified, contacted, and tracked before anything gets removed.

## Step-by-Step Walkthrough

### Step 1: Identify Deprecation Candidates

Start by getting visibility into what's actually being used versus what the team assumes is being used:

```text
Analyze our API endpoints and identify candidates for deprecation. Check for: endpoints with duplicate functionality (v1 vs v2), endpoints with fewer than 10 calls per day, and endpoints not referenced in our current client SDKs. Cross-reference with access logs from the past 90 days.
```

### Step 2: Review the Deprecation Report

The analysis across 140 endpoints produces a clear picture:

**Immediate candidates (superseded + low traffic):**

| Endpoint | Daily Calls | Consumers | Replacement |
|----------|-------------|-----------|-------------|
| GET /v1/users/{id} | 3 | 2 | v2 available |
| POST /v1/reports/generate | 0 | 0 | v2 available |
| GET /v1/analytics/summary | 8 | 1 | v2 available |

**Review candidates (low traffic, no direct replacement):**

| Endpoint | Daily Calls | Consumers | Notes |
|----------|-------------|-----------|-------|
| GET /internal/health-check-legacy | 12 | 1 | Appears to be automated monitoring |
| POST /v1/export/pdf | 5 | 3 | No v2 equivalent yet |

The consumer breakdown is what makes safe deprecation possible. `GET /v1/users/{id}` isn't just "3 calls per day" — it's specifically the `acme-integration` partner API key making 2 calls and internal monitoring making 1. With that specificity, the team can contact each consumer directly instead of hoping everyone reads a changelog.

The reports endpoint has zero consumers and zero calls. It's been dead for at least 90 days and nobody noticed. This one can be removed today — no sunset period needed, no migration guide, no email. Just delete the route handler and its tests. Every team has endpoints like this: code that nobody uses but everybody is afraid to touch.

The PDF export endpoint is a different story — it has 3 active consumers and no v2 replacement. This one needs a product decision (build a v2 or grandfather existing consumers) before it can enter the deprecation pipeline.

### Step 3: Create the Deprecation Plan

Pick an endpoint with actual consumers and set up the full lifecycle:

```text
Create a deprecation plan for the v1/users endpoint. Set a 90-day sunset period. Generate the deprecation headers, API response warnings, and consumer notification emails.
```

The plan follows HTTP deprecation standards (RFC 8594) with a clear timeline:

| Day | Action | Impact |
|-----|--------|--------|
| 0 (today) | Add `Sunset` and `Deprecation` headers to all responses | Zero — headers are informational |
| 0 | Email identified consumers with migration guide | Consumer awareness |
| 30 | Add deprecation warning to JSON response body | Visible in consumer logs |
| 60 | Return `299` warning header, log all remaining callers | Last chance to migrate |
| 90 | Return `410 Gone` with migration guide URL | Endpoint removed |

Three files get generated:

- **`middleware/deprecation-headers.ts`** — adds `Sunset` and `Deprecation` headers per RFC 8594. The Sunset header includes the exact date, so automated tools can parse it.
- **`docs/migration-guide-v1-users.md`** — step-by-step migration instructions with before/after code examples showing the v1 call and its v2 equivalent. Covers authentication changes, response format differences, and edge cases.
- **`emails/deprecation-notice-v1-users.md`** — consumer notification template with the sunset date, migration guide link, support contact, and a clear call-to-action.

The graduated approach means consumers who monitor HTTP headers catch the deprecation on day 0. Consumers who don't read emails see the warning in response bodies on day 30. The `299` header on day 60 triggers alerts in most API monitoring tools — tools like Datadog and Grafana flag 299 headers by default. By day 90, anyone still calling the endpoint has been warned through three different channels over three months.

The migration guide is the piece that makes the difference between "we told them it's deprecated" and "we made it easy to migrate." It includes side-by-side code examples showing the v1 request/response and the exact v2 equivalent, plus notes on response format changes that would break client-side parsing.

### Step 4: Track Migration with GitHub Issues

Each deprecation gets a tracking issue with an automated checklist:

**GitHub issue #892: "Deprecate GET /v1/users/{id} — Sunset: 2026-05-18"**

- [x] Deprecation headers added
- [x] Consumer notification sent (2 consumers)
- [x] Migration guide published
- [ ] All consumers migrated (1/2 remaining)
- [ ] 30-day warning activated (Mar 18)
- [ ] 60-day final warning activated (Apr 17)
- [ ] Endpoint removed (May 18)

Labels: `api-deprecation`, `sunset/2026-05-18`
Assigned: @platform-team

The checklist makes progress visible to the whole team. Nobody has to ask "where are we on that deprecation?" — the issue tells them. The sunset date in the label makes it searchable (`label:sunset/2026-05`), and the checklist items can be automated: when traffic from the last remaining consumer drops to zero, the "all consumers migrated" box checks itself.

A GitHub project board collects all active deprecation issues, giving the team a single view of every endpoint in the sunset pipeline, ordered by deadline. Monthly deprecation reviews take 15 minutes instead of an hour because all the data is pre-assembled in the issues.

### Step 5: Monitor Consumer Migration

As sunset dates approach, track who's migrated and who needs a nudge:

```text
Show me migration progress for all active deprecations. Which consumers haven't migrated yet?
```

**Active Deprecations Dashboard:**

| Endpoint | Sunset | Migrated | Remaining | Action Needed |
|----------|--------|----------|-----------|---------------|
| GET /v1/users/{id} | May 18 | 1/2 | acme-integration (2 calls/day) | Follow-up email sent Feb 17 |
| POST /v1/reports/generate | Apr 15 | 0/0 | None | Ready for immediate removal |
| GET /v1/analytics/summary | May 18 | 0/1 | Mobile app v3.1 and below | Force-update scheduled Mar 1 |

The reports endpoint can be removed immediately — no consumers, no traffic, no risk. The analytics endpoint is blocked on a mobile app force-update that has its own timeline. The users endpoint needs one more outreach to the Acme partner, and if they don't respond by day 60, the 299 warning header will trigger their monitoring.

This dashboard replaces the fear-based approach ("don't touch it, someone might be using it") with data-driven confidence ("we know exactly who's using it, we've contacted them, and we can see whether they've migrated").

The dashboard also reveals patterns. If the same partner consistently lags on migrations, the team can proactively reach out earlier or offer migration support. If mobile app versions are the bottleneck, the team can coordinate deprecation timelines with the mobile release schedule.

## Real-World Example

Kenji is a platform engineer at a 30-person API-first company. The team wastes hours maintaining 23 deprecated endpoints because the outage incident last year made everyone afraid to remove anything. The API documentation lists v1, v2, and sometimes v3 of the same endpoint, and new developers never know which one to use.

He runs the analysis against 90 days of access logs and finds that 3 endpoints are superseded with fewer than 10 calls per day from only 3 consumers total. One endpoint — `POST /v1/reports/generate` — has zero calls and zero consumers. It's been dead for at least 90 days.

The agent generates deprecation headers, migration guides with code examples, and consumer notification emails for each endpoint. GitHub issues track the migration progress with automated checklists and sunset dates. The dead endpoint gets removed in the first week.

After the first 90-day cycle, all 3 endpoints are safely removed with zero incidents. The team applies the same process quarterly. Within six months, the API surface shrinks by 15%, the maintenance burden on deprecated code drops from 20% of the team's time to near zero, and new developers stop asking "which version should I use?" because the answer is always "the one that's not deprecated."
