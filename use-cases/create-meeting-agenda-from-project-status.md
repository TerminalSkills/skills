---
title: "Create Automated Meeting Agendas from Project Status with AI"
slug: create-meeting-agenda-from-project-status
description: "Generate focused meeting agendas by pulling live project status (PRs, CI runs, blocker issues) from GitHub and carrying over last meeting's open action items."
skills: [github, meeting-notes, report-generator]
category: productivity
tags: [meetings, agenda, project-management, productivity, automation]
---

# Create Automated Meeting Agendas from Project Status with AI

## The Problem

A 20-person product team has a weekly sync every Monday. The engineering manager spends 45 minutes before each meeting manually checking GitHub for open PRs, scanning Slack for blockers people mentioned during the week, reviewing the sprint board for overdue tickets, and writing up an agenda. Half the time, the agenda misses something important and the meeting derails into topics nobody prepared for. The other half, it covers things already resolved, wasting everyone's time.

Twenty people in a 30-minute meeting that goes off the rails is 10 person-hours spent on the wrong things. And the engineering manager — the highest-paid person preparing the agenda — is spending 3 hours per month on what is essentially data collection and formatting.

The deeper issue is that the agenda reflects one person's memory of the week, not the actual state of the project. Critical blockers get forgotten because they were mentioned in a Slack thread at 11 PM on Wednesday. A PR that's been waiting for review for 5 days doesn't make the agenda because the reviewer didn't flag it.

## The Solution

The **github** skill drives the `gh` CLI to pull PRs, CI runs and labeled issues. The **report-generator** skill turns that data into a status report in its weekly-update format. The **meeting-notes** skill reads last meeting's notes for open action items and, after the meeting, captures decisions in a form next week's run can read. The agenda is built from live data instead of one person's memory of the week.

This covers GitHub data. Slack threads and sprint-board tickets are not read by these skills; paste the blockers from those places into the prompt (step 1) or label them as GitHub issues.

## Step-by-Step Walkthrough

Every Monday morning: pull project data, cross-reference last week's action items, generate a time-boxed agenda, review it, share it. Human time is about five minutes.

### Step 1: Pull project status from GitHub

> Prepare an agenda for Monday's team sync in acme/product. Find open PRs older than 2 days with their review and CI state, failing runs on main, PRs merged since last Monday, and issues labeled "blocker" or "urgent". Also include these blockers from Slack: [pasted lines].

The github skill runs read-only `gh` commands. Authentication is `gh auth login`, or a `GH_TOKEN` in the environment in scripts:

```bash
SINCE=$(date -d 'last monday' +%F)   # GNU date; on macOS use: date -v-monday +%F

# Open PRs with review, merge and CI state, keeping the ones older than 2 days
gh pr list -R acme/product --state open --limit 100 \
  --json number,title,author,createdAt,reviewDecision,mergeable,statusCheckRollup |
jq -r '.[] | select((now - (.createdAt | fromdateiso8601)) > 172800)
  | [.number, .author.login, (.reviewDecision // ""), .mergeable,
     (if any(.statusCheckRollup[]?; (.conclusion // .state) == "FAILURE") then "ci-failing" else "ci-ok" end),
     .title] | @tsv'

# PRs merged since last Monday
gh pr list -R acme/product --state merged --search "merged:>=$SINCE" --limit 100 \
  --json number,title,mergedAt

# Recent failures on main
gh run list -R acme/product --branch main --status failure --limit 10 \
  --json workflowName,displayTitle,createdAt,url

# Blocker and urgent issues (a comma inside label: means OR)
gh issue list -R acme/product --state open --search 'label:blocker,urgent' \
  --json number,title,assignees,createdAt
```

`reviewDecision` is `REVIEW_REQUIRED`, `CHANGES_REQUESTED`, `APPROVED` or empty, and `mergeable` is `CONFLICTING` when there is a merge conflict. To see whether a test is flaky rather than broken, list the last runs of one workflow: `gh run list --workflow ci.yml --branch main --limit 5 --json conclusion,createdAt`.

### Step 2: Review the live data

The report-generator skill's weekly template (Completed, In Progress, Blockers and Risks, Key Metrics) is a good shape for the status, which for this example week looks like:

**Project status (Nov 2 to Nov 9):**

| Category | Count | Details |
|----------|-------|---------|
| PRs merged this week | 14 | On track for Thursday release |
| PRs open > 2 days | 3 | Review bottleneck |
| Failing CI | 2 | One flaky test, one config issue |
| Active blockers | 2 | Both impacting staging |

**Stale PRs:**
- **#342** "Refactor payment flow": waiting on review from Lena for 5 days, a 400-line change.
- **#358** "Add CSV export": CI failing for 2 days, a missing env var in the test config.
- **#361** "Update onboarding copy": merge conflict for 3 days.

**Failing CI:**
- `main`: flaky test in `auth.spec.js` (failed 3 of the last 5 runs).
- PR #358: the missing env var above.

**Blockers:**
- **#891:** Stripe webhook endpoint returning 500 in staging; nobody can test payment flows.
- **#903:** memory leak in the background worker, OOM every 6 hours; it has been restarting silently since Tuesday.

The worker leak is the kind of item that never reaches a hand-written agenda, because auto-restart hides it. A label query on issues surfaces it.

### Step 3: Generate a time-boxed agenda

> Create a 30-minute agenda from this status. Blockers first, then stale PRs, then quick updates. Add time boxes and an owner for each topic. Skip anything already resolved.

**Team Sync, Monday Nov 9 (30 min)**

**Blockers (10 min)**
1. Stripe webhook 500 in staging (#891): Dani, what do you need to unblock this?
2. Memory leak in background worker (#903): who is picking this up?

**Stale PRs (10 min)**
3. #342 Refactor payment flow (5 days): Lena, can you review today?
4. #358 CSV export: add the missing env var to the test config
5. #361 Onboarding copy: merge conflict needs resolution

**Quick updates (5 min)**
6. Flaky `auth.spec.js`: is anyone tracking it?
7. 14 PRs merged this week, on track for Thursday release

**Open floor (5 min)**

The time boxes are tight on purpose. If blockers overrun, the stale PR items move to async.

### Step 4: Cross-reference last week's action items

Keep each meeting's notes in a file so the next run can read them. The meeting-notes skill writes that file in a fixed structure with an Action Items section (step 5).

> Read ./meetings/2026-11-02.md. List the action items that were assigned and not completed, check each against the PR and issue data above, and add the open ones to the agenda as follow-ups.

| Assignee | Action item | Status |
|----------|-------------|--------|
| Dani | Investigate Stripe webhook 500 | Now #891, already on agenda |
| Lena | Review payment flow PR | #342, still unreviewed, already on agenda |
| Ravi | Schedule user interviews for onboarding redesign | Not done, adding to agenda |
| Tomas | Deploy CSV export to staging | Completed Nov 4 |

Ravi's interviews have no GitHub trace, so only the notes file catches them.

### Step 5: Share, then capture the outcome

Save the agenda as markdown, post it to the team channel before the meeting, and keep it next to the notes. After the meeting, give the meeting-notes skill the raw notes or transcript. It produces Decisions Made, Action Items (with owners and dates) and Open Questions; ask it to save them to `./meetings/2026-11-09.md`, which step 4 reads next Monday.

## Real-World Example

Ravi, an engineering manager on a 20-person product team, spent about 45 minutes every Monday assembling the sync agenda from GitHub, Slack and memory. He kept missing things: a PR waiting a week for review, a flaky check, an action item from two meetings back.

Now he runs the prompts from steps 1 to 4 on Monday morning. The run lists 3 stale PRs, 2 blockers and 2 CI issues, and the cross-reference catches his own forgotten task of scheduling user interviews. He adds a hiring note and posts the agenda ten minutes before the meeting. When Dani asks what the webhook error is, the answer is already linked in the agenda. Ravi's own estimate is that prep dropped from 45 minutes to about 5, and the larger change is that every topic has an owner and the meeting ends on time.

## Tips for Better Agendas

- Run it 30 minutes before the meeting so data is fresh and you still have time to add context.
- Track how often topics roll over from week to week; repeated carry-over means the meeting is not resolving things.
- Rotate the open-floor slot into a demo or knowledge share now and then.
- Archive agendas beside the meeting notes so decisions can be traced later.

## Related Skills

- **github**: the `gh` commands that list stale PRs, CI failures and blocker issues.
- **report-generator**: shapes the pulled data into a weekly status (completed, in progress, blockers).
- **meeting-notes**: reads last week's action items and records this week's decisions for the next agenda.
