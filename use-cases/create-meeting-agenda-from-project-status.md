---
title: "Create Automated Meeting Agendas from Project Status with AI"
slug: create-meeting-agenda-from-project-status
description: "Generate focused meeting agendas by pulling real-time project status from repos, tickets, and team updates."
skills: [github, meeting-notes, report-generator]
category: productivity
tags: [meetings, agenda, project-management, productivity, automation]
---

# Create Automated Meeting Agendas from Project Status with AI

## The Problem

A 20-person product team has a weekly sync every Monday. The engineering manager spends 45 minutes before each meeting manually checking GitHub for open PRs, scanning Slack for blockers people mentioned during the week, reviewing the sprint board for overdue tickets, and writing up an agenda. Half the time, the agenda misses something important and the meeting derails into topics nobody prepared for. The other half, it covers things already resolved, wasting everyone's time.

## The Solution

Use the **github** skill to pull PR status and recent commits, the **meeting-notes** skill to structure agendas with clear topics and time boxes, and the **report-generator** to compile everything into a shareable document.

## Step-by-Step Walkthrough

### 1. Pull project status from all sources

Tell the agent what to check:

> Prepare an agenda for Monday's team sync. Check our GitHub org for: open PRs older than 2 days, any failing CI checks, PRs with unresolved review comments, and commits merged since last Monday. Also summarize any issues labeled "blocker" or "urgent".

### 2. The agent gathers live data

```text
Project Status (Feb 10–17):

PRs merged: 14
PRs open > 2 days: 3
  - #342 "Refactor payment flow" — waiting on review from Lena (5 days)
  - #358 "Add CSV export" — CI failing (2 days)
  - #361 "Update onboarding copy" — merge conflict (3 days)

Failing CI: 2 builds
  - main branch: flaky test in auth.spec.js (failed 3 of last 5 runs)
  - #358: missing env var in test config

Blockers: 2 issues
  - ISSUE-891: "Stripe webhook endpoint returning 500 in staging"
  - ISSUE-903: "Memory leak in background worker — OOM every 6 hours"
```

### 3. Generate a structured agenda

> Create a 30-minute meeting agenda from this status. Put blockers first, then stale PRs, then a quick wins section. Add time boxes for each topic. Skip anything already resolved.

### 4. The agent produces a ready-to-share agenda

```text
## Team Sync — Monday Feb 17 (30 min)

### Blockers (10 min)
1. Stripe webhook 500 in staging (ISSUE-891) — Dani, what do you need to unblock?
2. Memory leak in background worker (ISSUE-903) — who is picking this up?

### Stale PRs (10 min)
3. #342 Refactor payment flow — Lena, can you review today?
4. #358 CSV export — CI fix: missing env var (quick)
5. #361 Onboarding copy — merge conflict needs resolution

### Quick Updates (5 min)
6. Flaky auth test — is anyone tracking this?
7. Sprint velocity: 14 PRs merged, on track for release Thursday

### Open Floor (5 min)
```

### 5. Add context from previous meetings

> Check last week's meeting notes in ./meetings/2025-02-10.md. Pull out any action items that were assigned but not yet completed. Add them to the agenda as follow-ups.

```text
Outstanding action items from Feb 10:
- [ ] Dani: Investigate Stripe webhook 500 (now ISSUE-891 — already on agenda)
- [ ] Lena: Review payment flow PR (PR #342 — already on agenda)
- [ ] Ravi: Schedule user interviews for onboarding redesign (NOT DONE — adding to agenda)
- [x] Tomas: Deploy CSV export to staging (COMPLETED — PR merged Feb 12)

Added to agenda: "Ravi — user interview scheduling update" under Open Floor
```

### 6. Share and iterate

The agent exports the agenda as a markdown file or posts it directly to your team channel. After the meeting, use the meeting-notes skill to capture decisions and action items that feed into next week's agenda automatically.

## Real-World Example

Ravi, an engineering manager at a 20-person product team, used to spend 45 minutes every Monday morning assembling the weekly sync agenda.

1. Ravi asks the agent to pull status from the GitHub org — it finds 3 stale PRs, 2 blockers, and 2 CI issues in under a minute
2. The agent generates a time-boxed 30-minute agenda with blockers prioritized first
3. Ravi reviews the agenda, adds one personal note about a hiring update, and shares it in the team Slack channel 10 minutes before the meeting
4. The meeting stays focused — every topic is backed by real data, and nothing important gets missed
5. Weekly agenda prep drops from 45 minutes to 5 minutes, and meeting satisfaction scores from the team improve because discussions are focused on actual blockers instead of status updates everyone could read async

## Tips for Better Agendas

- **Run the agent 30 minutes before the meeting** so data is fresh but you still have time to review
- **Track agenda-to-outcome ratio** — if topics keep rolling over week to week, the meetings are not effective
- **Rotate the "open floor" section** — some weeks, replace it with a quick demo or knowledge share
- **Archive agendas alongside meeting notes** in a shared folder so decisions are traceable
