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

Twenty people in a 30-minute meeting that goes off the rails is 10 person-hours of lost productivity. Every single week. And the engineering manager — the highest-paid person preparing the agenda — is spending 3 hours per month on what is essentially data collection and formatting.

The deeper issue is that the agenda reflects one person's memory of the week, not the actual state of the project. Critical blockers get forgotten because they were mentioned in a Slack thread at 11 PM on Wednesday. A PR that's been waiting for review for 5 days doesn't make the agenda because the reviewer didn't flag it.

## The Solution

Using the **github** skill to pull PR status and recent commits, the **meeting-notes** skill to structure agendas with clear topics and time boxes, and the **report-generator** to compile everything into a shareable document, the agenda writes itself from live project data instead of someone's imperfect memory of the week.

## Step-by-Step Walkthrough

The workflow runs every Monday morning: pull live data from all project sources, cross-reference with last week's action items, generate a time-boxed agenda, and share it before the meeting starts. The entire cycle takes 5 minutes of human time.

### Step 1: Pull Project Status from All Sources

Start by telling the agent what to check — cast a wide net so nothing slips through:

```text
Prepare an agenda for Monday's team sync. Check our GitHub org for: open PRs older than 2 days, any failing CI checks, PRs with unresolved review comments, and commits merged since last Monday. Also summarize any issues labeled "blocker" or "urgent".
```

### Step 2: Review the Live Data

The scan comes back in under a minute with the full picture. No Slack-skimming, no sprint board scrolling, no relying on memory:

**Project Status (Feb 10-17):**

| Category | Count | Details |
|----------|-------|---------|
| PRs merged this week | 14 | On track for Thursday release |
| PRs open > 2 days | 3 | Review bottleneck |
| Failing CI | 2 | One flaky test, one config issue |
| Active blockers | 2 | Both impacting staging |

**Stale PRs — these need attention:**
- **#342** "Refactor payment flow" — waiting on review from Lena for 5 days. This is a 400-line change sitting unreviewed while the author context-switches to other work.
- **#358** "Add CSV export" — CI failing for 2 days. Missing env var in test config — probably a 5-minute fix that nobody noticed.
- **#361** "Update onboarding copy" — merge conflict for 3 days. Non-technical change blocked by a technical issue.

**Failing CI:**
- `main` branch: flaky test in `auth.spec.js` (failed 3 of last 5 runs). This is the kind of thing that erodes trust in the test suite — developers start ignoring red builds because "it's probably just auth.spec again."
- PR #358: missing env var in test config. Known cause, quick fix.

**Blockers:**
- **ISSUE-891:** Stripe webhook endpoint returning 500 in staging. Nobody can test payment flows until this is resolved.
- **ISSUE-903:** Memory leak in background worker — OOM every 6 hours. The worker has been silently restarting since Tuesday. If it hits production, customer-facing jobs will start failing.

That memory leak is the kind of thing that never makes a manually-written agenda. It's been killing the worker process for days, but because it auto-restarts, nobody noticed. Pulling live data from GitHub issues catches it before it becomes a production incident.

### Step 3: Generate a Time-Boxed Agenda

```text
Create a 30-minute meeting agenda from this status. Put blockers first, then stale PRs, then a quick wins section. Add time boxes for each topic. Skip anything already resolved.
```

The agenda puts the most urgent items first and assigns clear owners:

### Team Sync — Monday Feb 17 (30 min)

**Blockers (10 min)**
1. Stripe webhook 500 in staging (ISSUE-891) — Dani, what do you need to unblock this?
2. Memory leak in background worker (ISSUE-903) — who is picking this up? It's been OOMing every 6 hours since Tuesday.

**Stale PRs (10 min)**
3. #342 Refactor payment flow (5 days) — Lena, can you review today?
4. #358 CSV export — CI fix needed: missing env var in test config (5-min fix)
5. #361 Onboarding copy — merge conflict needs resolution

**Quick Updates (5 min)**
6. Flaky auth test — is anyone tracking `auth.spec.js`? It's failed 3 of last 5 runs.
7. Sprint velocity: 14 PRs merged this week, on track for Thursday release.

**Open Floor (5 min)**

Every topic has a name attached to it. No more "does anyone know about...?" followed by 30 seconds of silence. The time boxes are aggressive on purpose — they force prioritization. If blockers take 15 minutes instead of 10, stale PRs get 5 minutes and the team handles the rest async.

### Step 4: Cross-Reference with Last Week's Action Items

Agendas without continuity let things slip through the cracks. The action items from last Monday's meeting should carry forward automatically:

```text
Check last week's meeting notes in ./meetings/2025-02-10.md. Pull out any action items that were assigned but not yet completed. Add them to the agenda as follow-ups.
```

The cross-reference catches what fell through:

| Assignee | Action Item | Status |
|----------|-------------|--------|
| Dani | Investigate Stripe webhook 500 | Now ISSUE-891 — already on agenda |
| Lena | Review payment flow PR | PR #342 — already on agenda, still unreviewed |
| Ravi | Schedule user interviews for onboarding redesign | **NOT DONE** — adding to agenda |
| ~~Tomas~~ | ~~Deploy CSV export to staging~~ | Completed Feb 12 |

Ravi's user interviews were assigned last Monday and quietly forgotten. Without the cross-reference, another week would pass before anyone noticed. Now it's back on the agenda under Open Floor before a third week slips by. This is the difference between a meeting culture that tracks commitments and one that generates them and forgets.

### Step 5: Share and Iterate

The agenda exports as a markdown file and gets posted to the team channel 10 minutes before the meeting. Everyone walks in knowing what's on the table. No surprises, no "I didn't know we were discussing that," no scrambling to pull up context.

After the meeting, the meeting-notes skill captures decisions and action items that feed directly into next week's agenda. The cycle sustains itself:

1. Monday 9:00 AM — Agent pulls live project data
2. Monday 9:02 AM — Agent cross-references last week's action items
3. Monday 9:03 AM — Time-boxed agenda generated
4. Monday 9:10 AM — Engineering manager reviews, adds personal notes
5. Monday 9:15 AM — Agenda posted to team channel
6. Monday 9:30 AM — Meeting starts, everyone prepared
7. Monday 10:00 AM — Meeting ends, decisions and action items captured
8. Next Monday — Repeat, with last week's items carried forward

No more starting from scratch every Monday morning. No more 45-minute agenda prep sessions. No more relying on one person's memory of the week.

## Real-World Example

Ravi, an engineering manager at the 20-person product team, used to spend 45 minutes every Monday morning assembling the weekly sync agenda. He'd check GitHub, skim Slack, and try to remember what people mentioned in passing last week. He missed things constantly — the PR that had been waiting for review for a week, the CI check that had been flaky for days, the action item from two meetings ago that nobody followed up on.

Now he kicks off the agent on Monday morning. It pulls status from the GitHub org — 3 stale PRs, 2 blockers, 2 CI issues — in under a minute. The time-boxed agenda gets generated with blockers first. The cross-reference catches Ravi's own forgotten action item: user interviews he was supposed to schedule last week.

Ravi reviews the agenda, adds one note about a hiring update, and shares it in Slack 10 minutes before the meeting. The meeting stays focused — every topic is backed by real data, every item has an owner, and the time boxes keep discussions from spiraling. When Dani asks "what exactly is the error on that webhook?" the answer is already in the agenda — no one needs to context-switch to a browser and dig through GitHub issues during the meeting.

Weekly agenda prep drops from 45 minutes to 5 minutes. But the real improvement isn't time savings — it's meeting quality. The team stops dreading Mondays because the meetings end on time and the discussions are about solving problems rather than figuring out what the problems are.

Weekly agenda prep drops from 45 minutes to 5 minutes. But the real win isn't the time savings — it's that the meetings actually work. Action items get tracked across weeks. Blockers surface before they become incidents. The team stops dreading Mondays because the meetings end on time and cover what matters.

## Tips for Better Agendas

- **Run the agent 30 minutes before the meeting** so data is fresh but you still have time to review and add context
- **Track agenda-to-outcome ratio** — if topics keep rolling over week to week, the meetings aren't effective and something needs to change
- **Rotate the "open floor" section** — some weeks, replace it with a quick demo or knowledge share to keep the format from going stale
- **Archive agendas alongside meeting notes** in a shared folder so decisions are traceable months later when someone asks "when did we decide to do X?"
