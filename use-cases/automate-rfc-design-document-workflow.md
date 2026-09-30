---
title: "Automate RFC and Design Document Workflow with AI"
slug: automate-rfc-design-document-workflow
description: "Streamline the creation, review, and tracking of RFC and design documents using AI-powered templates and automation."
skills: [markdown-writer, github, template-engine, openspec]
category: productivity
tags: [rfc, design-docs, workflow, documentation, engineering-process]
---

# Automate RFC and Design Document Workflow with AI

## The Problem

A 35-person engineering org uses RFCs to make technical decisions, but the process is inconsistent and slow. Some engineers write 10-page documents, others write a single paragraph. There's no standard template, no tracking of which RFCs are pending review, and no way to find past decisions. Half the RFCs live in Google Docs, a quarter are in Notion, and the rest are scattered across GitHub issues.

The real cost shows up six months later. A new engineer asks "why did we pick Postgres over DynamoDB?" and nobody can find the document that explains the decision. So the team relitigates it — burning a week of back-and-forth on a choice that was already made and reasoned through. Three senior engineers spend hours in meetings reconstructing reasoning from memory, which may or may not match the original reasoning. Meanwhile, the average RFC takes 3 weeks from draft to approval because reviewers forget about them and there's no escalation path for stale reviews.

## The Solution

Using the **markdown-writer** skill to generate well-structured RFC documents from rough notes, **github** to manage the review workflow through pull requests, and **template-engine** to maintain consistent formatting, the agent turns scattered notes into polished RFCs, tracks them through review, and builds a searchable archive of past decisions.

## Step-by-Step Walkthrough

### Step 1: Generate an RFC from Rough Notes

Most engineers have the ideas — they just don't have the patience to structure them into a proper document. Writing a thorough RFC takes 2-3 hours, so engineers either procrastinate or write something incomplete. A brain dump is enough to get started:

```text
I need to write an RFC for migrating our session storage from Redis to DynamoDB. Here are my rough notes: current Redis setup hits memory limits at 50k concurrent sessions, DynamoDB would give us auto-scaling, estimated cost increase is $200/month, migration can be done with dual-write strategy over 2 weeks. Risks: DynamoDB latency is higher for single-key lookups. Generate a full RFC document.
```

### Step 2: Expand Notes into a Complete RFC

Those rough notes become a fully structured document at `rfcs/2026-02-RFC-session-storage-migration.md`. Five bullet points of rough notes become a complete RFC:

- **Title:** Migrate Session Storage from Redis to DynamoDB
- **Status:** Draft
- **Author and date** filled in automatically
- **Problem Statement** — expands "hits memory limits at 50k" into a data-backed section with current memory usage (4.2 GB of 4.5 GB limit), growth rate (500 new sessions per day), and the specific failure mode when limits are hit (new sessions silently fail, users see "login successful" but get logged out on next request)
- **Proposed Solution** — DynamoDB architecture with a table design showing partition key (session ID), TTL attribute (for automatic expiry), and on-demand capacity mode
- **Alternatives Considered** — not just DynamoDB vs Redis, but also Redis Cluster (operational complexity), Memcached (no persistence), and Valkey (nascent ecosystem) with trade-offs for each
- **Migration Plan** — the dual-write strategy broken into daily milestones across the 2-week window, with rollback triggers defined for each phase
- **Cost Analysis** — the $200/month increase in context: at 100k sessions, Redis vertical scaling would cost $800/month, making DynamoDB cheaper at scale
- **Risks and Mitigations** — latency numbers (Redis: 1-2ms, DynamoDB: 5-10ms for single reads), consistency guarantees, and a concrete rollback plan
- **Success Criteria** — measurable outcomes like "p99 session lookup under 20ms" rather than vague goals
- **Open Questions** — 3 specific items for reviewers to address, not generic "thoughts?"

The technical substance comes from the engineer's knowledge; the structure and completeness come from the template. An engineer who knows the answer to "why DynamoDB?" gets a document that proves it — with data, alternatives, and trade-offs — in minutes instead of hours.

### Step 3: Create a PR-Based Review Workflow

```text
Open a pull request for this RFC. Assign reviewers from the backend and infrastructure teams. Set a review deadline of 5 business days.
```

The PR goes up with structure that makes the review process trackable:

- **PR #247** — "RFC: Migrate Session Storage from Redis to DynamoDB"
- **Reviewers:** backend-team, infra-team
- **Labels:** `rfc`, `status/draft`, `area/infrastructure`
- **Review deadline:** noted in PR description as 2026-02-24

Everything lives in GitHub now — comments, approvals, and the final decision are all in one place. No more hunting through Google Docs share links or Notion pages. And because it's a PR, the review process has built-in tooling: threaded comments, approval requirements, merge protections, and a permanent record of who approved what and when.

The PR-based workflow also solves the "forgotten RFC" problem. A Google Doc can sit unread for weeks with no visibility. A PR with a review deadline shows up in the reviewer's GitHub notifications, in the team's PR dashboard, and in the status tracker. Ignoring it requires active effort.

### Step 4: Track RFC Status Across the Organization

With RFCs scattered across tools, nobody knew which decisions were pending. Now they're all PR-labeled and queryable:

```text
Show me all open RFCs, their status, who's blocking review, and how long they've been waiting.
```

The status dashboard pulls from all RFC-labeled PRs:

| RFC | Title | Status | Age | Approvals | Blocker |
|---|---|---|---|---|---|
| #247 | Session Storage Migration | Draft | 0 days | 0/2 | Awaiting review |
| #231 | API Rate Limiting Strategy | In Review | 4 days | 1/2 | Waiting on @chen |
| #218 | Event Sourcing for Audit Log | In Review | 11 days | 0/3 | **Stale** |
| #205 | GraphQL Federation Plan | Approved | -- | 3/3 | Pending implementation |

Two things jump out immediately: RFC #218 has been sitting for 11 days with zero reviews — it needs either a ping to reviewers or a decision to close it. And RFC #231 is one approval away from completion, waiting on a single person. That's a 5-minute action that's been blocking a decision for 4 days.

The dashboard replaces the "does anyone know what happened to that design doc?" conversations. Every RFC has a visible status, a clear blocker, and a number that shows how long it's been waiting.

### Step 5: Archive Decisions for Future Reference

When an RFC is approved and merged, it needs to be findable — not just by people who were in the room, but by engineers who join the team years later:

```text
Index all merged RFCs so the team can search past decisions. Create a decision log with title, date, outcome, and key trade-offs for each.
```

The decision log becomes the canonical "why we chose X" reference. Each entry looks like:

| Date | RFC | Decision | Key Trade-offs |
|---|---|---|---|
| 2026-01-15 | Session Storage Migration | **Approved** | Higher latency (+3ms) for auto-scaling; $200/mo cost increase offset by avoiding $800/mo Redis scaling |
| 2025-12-08 | API Rate Limiting | **Approved** | Token bucket over sliding window; simpler implementation, slightly less precise |
| 2025-11-20 | Event Sourcing for Audit | **Deferred** | Benefits clear but team capacity insufficient; revisit Q2 |
| 2025-10-30 | Postgres over DynamoDB | **Approved** | JOIN support and full-text search outweigh DynamoDB's scaling advantages at current scale |

When the next new hire asks about the Postgres decision, they get pointed to a searchable index instead of a 45-minute hallway conversation. The answer includes the original reasoning, the alternatives that were considered, and the trade-offs that were accepted — not a reconstruction from fading memory.

### Step 6: Summarize for All-Hands

Technical decisions affect the whole company, but not everyone needs to read a 10-page RFC. The all-hands summary bridges that gap:

```text
Summarize all RFCs approved this month into a 2-paragraph update I can
include in the engineering all-hands notes. Focus on what changed and
why it matters for the product — skip implementation details.
```

The summary distills technical RFCs into a concise update for a broader audience. Product managers learn that session storage is being migrated (which means better uptime during traffic spikes). Design learns that the API rate limiting RFC was approved (which means the "try again later" error state they mocked will actually be needed). Leadership gets visibility into infrastructure investment without reading PR discussions.

The all-hands update becomes a regular section that people actually read, because it's written in outcomes rather than implementation details.

## Real-World Example

Priya leads backend engineering at a 35-person SaaS company. New engineers constantly ask why certain architectural decisions were made, and nobody can find the documents. The last three "why did we..." conversations each burned half a day of senior engineer time reconstructing reasoning from memory — and in one case, the reconstruction was wrong, leading to a week of work based on a misunderstanding of the original constraints.

She asks the agent to create an RFC template and generates the first RFC from rough notes about a storage migration. Three minutes later, she has a polished document with problem statement, alternatives, cost analysis, and migration plan. The PR goes up, reviewers are assigned, and the review completes in 4 days instead of the usual 3 weeks — because there's a deadline and a dashboard showing who's blocking.

After a month, the team has 12 merged RFCs indexed and searchable. When a new hire asks about the Postgres decision, Priya points them to the decision log. The conversation takes 30 seconds instead of 30 minutes, and the answer is the actual reasoning from the time of the decision — not a reconstruction from fading memory. The "why did we pick X?" question, which used to derail entire afternoons, becomes a link.

## Related Skills

- [openspec](/skills/openspec) — choose it when the RFC describes a change to one codebase that an AI agent will implement: the proposal, design and requirement changes live in the repository, are reviewed in the same pull request and are archived by date
