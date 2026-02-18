---
title: "Automate RFC and Design Document Workflow with AI"
slug: automate-rfc-design-document-workflow
description: "Streamline the creation, review, and tracking of RFC and design documents using AI-powered templates and automation."
skills: [markdown-writer, github, template-engine]
category: productivity
tags: [rfc, design-docs, workflow, documentation, engineering-process]
---

# Automate RFC and Design Document Workflow with AI

## The Problem

A 35-person engineering org uses RFCs to make technical decisions, but the process is inconsistent and slow. Some engineers write 10-page documents, others write a single paragraph. There's no standard template, no tracking of which RFCs are pending review, and no way to find past decisions. Half the RFCs live in Google Docs, a quarter are in Notion, and the rest are scattered across GitHub issues. When a new engineer asks "why did we pick Postgres over DynamoDB?" nobody can find the document that explains the decision. The average RFC takes 3 weeks from draft to approval because reviewers forget about them.

## The Solution

Use the **markdown-writer** skill to generate well-structured RFC documents from rough notes, **github** to manage the review workflow through pull requests, and **template-engine** to maintain consistent RFC formatting across the team.

## Step-by-Step Walkthrough

### 1. Generate an RFC from rough notes

Tell the agent your design idea:

```text
I need to write an RFC for migrating our session storage from Redis to DynamoDB. Here are my rough notes: current Redis setup hits memory limits at 50k concurrent sessions, DynamoDB would give us auto-scaling, estimated cost increase is $200/month, migration can be done with dual-write strategy over 2 weeks. Risks: DynamoDB latency is higher for single-key lookups. Generate a full RFC document.
```

### 2. The agent produces a structured RFC

The agent expands your notes into a complete RFC following your team's template:

```text
Generated: rfcs/2026-02-RFC-session-storage-migration.md

Sections:
- Title: Migrate Session Storage from Redis to DynamoDB
- Status: Draft
- Author: (your name)
- Date: 2026-02-17
- Problem Statement (current limitations with data)
- Proposed Solution (DynamoDB architecture with diagram)
- Alternatives Considered (Redis Cluster, Memcached, Valkey)
- Migration Plan (dual-write strategy, 2-week timeline)
- Cost Analysis ($200/month increase, projected savings at scale)
- Risks and Mitigations (latency, consistency, rollback plan)
- Success Criteria (measurable outcomes)
- Open Questions (3 items for reviewers to address)
```

### 3. Create a PR-based review workflow

```text
Open a pull request for this RFC. Assign reviewers from the backend and infrastructure teams. Set a review deadline of 5 business days.
```

The agent creates a PR with the RFC, tags relevant reviewers, and adds labels for tracking:

```text
PR created: #247 "RFC: Migrate Session Storage from Redis to DynamoDB"
- Reviewers: backend-team, infra-team
- Labels: rfc, status/draft, area/infrastructure
- Review deadline noted in PR description: 2026-02-24
```

### 4. Track RFC status across the org

```text
Show me all open RFCs, their status, who's blocking review, and how long they've been waiting.
```

The agent queries GitHub for all RFC-labeled PRs and generates a status dashboard:

```text
Open RFCs:
1. #247 Session Storage Migration — Draft, 0 days, awaiting review (0/2 approved)
2. #231 API Rate Limiting Strategy — In Review, 4 days, 1/2 approved (waiting: @chen)
3. #218 Event Sourcing for Audit Log — In Review, 11 days, 0/3 approved (stale)
4. #205 GraphQL Federation Plan — Approved, pending implementation

Action needed:
- RFC #218 is stale (11 days, no reviews). Consider pinging reviewers or closing.
- RFC #231 needs one more approval from @chen.
```

### 5. Archive decisions for future reference

When an RFC is approved and merged, the agent indexes it for searchability:

```text
Index all merged RFCs so the team can search past decisions. Create a decision log with title, date, outcome, and key trade-offs for each.
```

### 6. Generate RFC summaries for all-hands

```text
Summarize all RFCs approved this month into a 2-paragraph update I can include in the engineering all-hands notes. Focus on what changed and why.
```

The agent reads the merged RFCs and distills them into a concise update suitable for a broader audience.

## Real-World Example

Priya leads backend engineering at a 35-person SaaS company. New engineers constantly ask why certain architectural decisions were made, and nobody can find the documents.

1. She asks the agent to create an RFC template and generates the first RFC from her rough notes about a storage migration
2. The agent produces a polished document with problem statement, alternatives, cost analysis, and migration plan in 3 minutes
3. It opens a PR, assigns reviewers, and sets a deadline — the review completes in 4 days instead of the usual 3 weeks
4. She asks for a status dashboard of all open RFCs and discovers two stale proposals that need attention
5. After a month, the team has 12 merged RFCs indexed and searchable. When a new hire asks about the Postgres decision, Priya points them to the decision log
