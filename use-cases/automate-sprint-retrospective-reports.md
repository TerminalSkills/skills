---
title: "Automate Sprint Retrospective Reports"
slug: automate-sprint-retrospective-reports
description: "Generate data-driven sprint retrospectives by analyzing Git activity, PR metrics, and ticket data to surface what actually happened."
skills: [report-generator, data-analysis, github]
category: productivity
tags: [retrospective, sprint, agile, team-metrics, engineering-management]
---

# Automate Sprint Retrospective Reports

## The Problem

It's Friday afternoon, sprint retro time. The engineering manager asks "what went well?" and gets silence. Then "what didn't go well?" and gets vague complaints about "too many meetings" and "unclear requirements." The retro devolves into the same 3 people talking about the same 3 problems every 2 weeks.

The real story of the sprint lives in the data: Git commits, PR review times, ticket cycle times, deploy frequency, and incident logs. But nobody has time to compile this before the meeting. Without data, retros become opinion-driven rituals. The same issues persist for months because nobody can quantify them. "Reviews take too long" hits different when you can show the average PR sat for 26 hours before first review.

## The Solution

Use **github** to pull PR and commit activity, **data-analysis** to identify patterns and bottlenecks, and **report-generator** to produce a structured retro document the team can discuss.

```bash
npx terminal-skills install github data-analysis report-generator
```

## Step-by-Step Walkthrough

### 1. Gather sprint data from GitHub

```text
Pull all activity from our repo for sprint 23 (Feb 3-14). Get PRs merged, review times, commit patterns, and CI failure rates.
```

```text
SPRINT 23 DATA (Feb 3-14):

PRs: 34 opened, 31 merged, 3 still open
Commits: 187 across 8 contributors
Reviews: 89 reviews given, avg 2.8 per PR
CI runs: 142 total, 118 passed (83.1% pass rate)
Deploys: 7 production deploys (3.5 per week)

  Avg first review: 26.3h | Avg merge after approval: 4.1h | Avg PR size: 247 lines
  Largest PR: 1,842 lines | Top reviewer: Noa (23) | Lowest: Wei (2), Sam (3)
```

### 2. Analyze patterns and bottlenecks

```text
Analyze the sprint data. Compare against the last 3 sprints. Identify trends, bottlenecks, and anomalies.
```

```text
SPRINT 23 vs PREVIOUS 3 SPRINTS:

  Metric              | S20    | S21    | S22    | S23    | Trend
  --------------------|--------|--------|--------|--------|------
  PRs merged          | 28     | 32     | 29     | 31     | stable
  Avg review time     | 18h    | 21h    | 24h    | 26h    | ↑ degrading
  CI pass rate        | 91%    | 88%    | 85%    | 83%    | ↑ degrading
  Deploy frequency    | 4/wk   | 3.5/wk | 4/wk   | 3.5/wk | stable
  Avg PR size         | 189    | 210    | 231    | 247    | ↑ growing

BOTTLENECKS:
  1. Review time +44% over 4 sprints — Noa handles 26% of all reviews
  2. CI pass rate -8% — 11 of 24 failures from same flaky test in payments
  3. PR sizes growing — 4 PRs over 500 lines this sprint

POSITIVE: Zero incidents (first in 6 sprints), Kai ramped up fast (3 PRs in week 2)
```

### 3. Generate the retrospective report

```text
Create a sprint retrospective report with sections for what went well, what needs attention, specific action items, and team shoutouts. Include the data.
```

```text
# Sprint 23 Retrospective Report (Feb 3-14)

## Dashboard
  31 PRs merged | 187 commits | 7 deploys | 0 incidents | 83% CI pass rate

## 🟢 What Went Well
  - Zero production incidents — first clean sprint in 6 cycles
  - Kai (new hire) shipped 3 PRs in week 2, fully ramped
  - Billing refactor landed (1,842 lines) without breaking anything
  - Deploy cadence held steady at 3.5/week despite review delays

## 🟡 What Needs Attention
  - **Review time up 44% over 4 sprints** (now 26h avg)
    Data: Noa handled 26% of all reviews. Wei and Sam: 2-3 each.
    Suggestion: Rotate review assignments, set 8-hour SLA for first review
  - **CI reliability declining** (83% pass rate, was 91%)
    Data: 11 of 24 failures from same flaky test in payments module
    Suggestion: Fix or quarantine payments/checkout.spec.ts this sprint
  - **PR sizes creeping up** (247 avg lines, was 189 four sprints ago)
    Data: 4 PRs exceeded 500 lines this sprint
    Suggestion: Split PRs >300 lines into stacked PRs

## 🎯 Action Items
  1. Fix flaky test: payments/checkout.spec.ts (owner: Sam, by Sprint 24 Wed)
  2. Set up round-robin PR assignment in GitHub (owner: Noa, by Sprint 24 Mon)
  3. Add PR size warning at 300 lines in CI (owner: Amir, by Sprint 24 Fri)

## 🏆 Shoutouts
  - Noa: 23 reviews this sprint, keeping the team unblocked
  - Kai: Fastest ramp-up in team history, 3 quality PRs in first full week
  - Team: First zero-incident sprint in 3 months
```

### 4. Track action item follow-through

```text
Check which action items from the last 3 retros were actually completed. Show the follow-through rate.
```

```text
ACTION ITEM TRACKING:

Sprint 20: 4 items → 2 completed, 1 partial, 1 abandoned (50%)
Sprint 21: 3 items → 2 completed, 1 still open (67%)
Sprint 22: 5 items → 3 completed, 2 still open (60%)

RECURRING UNFIXED:
  "Reduce flaky tests" — mentioned in S20, S21, S23. Never fully addressed.
  "Distribute review load" — mentioned in S21, S23. Partial improvement.

OVERALL FOLLOW-THROUGH: 58% completion rate
Recommendation: Limit action items to 3 per sprint, assign explicit owners
```

## Real-World Example

Jess, engineering manager at a 12-person product team, ran the same retro format for 8 months. The team always said reviews were slow and tests were flaky, but nothing changed. Without data, she couldn't prioritize which problem mattered more or prove it was getting worse.

She ran the analysis workflow before the next retro. The data showed review time had increased 44% over 4 sprints — a trend invisible in weekly experience but obvious in the numbers. More striking: one engineer was doing 26% of all reviews while two others averaged 2-3 per sprint.

She projected the report in the retro meeting. For the first time, the discussion was specific: not "reviews are slow" but "reviews average 26 hours and Noa is carrying 26% of the load." The team agreed on 3 targeted actions. She tracked follow-through in the next sprint's report — 2 of 3 completed, and review time dropped to 18 hours. The retro went from a ritual to a tool.
