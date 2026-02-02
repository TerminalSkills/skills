---
name: weekly-report
description: >-
  Generate consistent, professional weekly status reports for teams and
  stakeholders. Use when a user asks to write a weekly report, create a
  status update, generate a weekly summary, write a progress report,
  compile a week-in-review, or produce a team status report.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["reports", "weekly-updates", "status", "team-management", "productivity"]
  use-cases:
    - "Generate weekly status reports from raw notes, commits, and task lists"
    - "Create executive summaries of team progress for stakeholders"
    - "Compile individual contributions into a unified team report"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Weekly Report

## Overview

Generate consistent, professional weekly status reports from various inputs like task lists, git logs, project notes, or verbal summaries. Produces structured reports that highlight accomplishments, blockers, upcoming work, and key metrics. Designed for engineering teams, project managers, and anyone reporting progress to stakeholders.

## Instructions

When a user asks you to create a weekly report, follow these steps:

### Step 1: Identify the report audience and format

| Audience | Focus | Detail Level |
|----------|-------|-------------|
| Direct manager | Individual contributions, blockers | High detail |
| Skip-level / Director | Team progress, risks, metrics | Medium detail |
| Executive / C-suite | Business impact, milestones, KPIs | High-level summary |
| Cross-functional team | Dependencies, shared updates | Relevant items only |
| Full team | Everyone's contributions, celebrations | Comprehensive |

### Step 2: Gather inputs

Collect information from any available sources:
- Task management tools (completed tickets, in-progress work)
- Git history (commits, PRs merged, releases)
- Meeting notes from the week
- Slack/chat highlights
- User-provided bullet points or notes
- Metrics dashboards or data

### Step 3: Organize into the report template

```markdown
# Weekly Report: [Team/Project Name]

**Week of:** [Start Date] - [End Date]
**Author:** [Name]

## Summary

[2-3 sentence high-level overview of the week. What was the main focus?
Any notable wins or challenges?]

## Completed This Week

- **[Project/Feature]:** [What was done and why it matters]
- **[Project/Feature]:** [What was done and why it matters]
- **[Bug fix/Improvement]:** [What was resolved]

## In Progress

| Item | Owner | Status | ETA |
|------|-------|--------|-----|
| [Task] | [Person] | On track | [Date] |
| [Task] | [Person] | At risk | [Date] |
| [Task] | [Person] | Blocked | - |

## Blockers & Risks

- **[Blocker]:** [Description and what is needed to unblock]
- **[Risk]:** [What could go wrong and mitigation plan]

## Key Metrics

| Metric | This Week | Last Week | Trend |
|--------|-----------|-----------|-------|
| [Metric 1] | [Value] | [Value] | Up/Down/Flat |
| [Metric 2] | [Value] | [Value] | Up/Down/Flat |

## Next Week Plan

- [ ] [Priority 1: What will be worked on]
- [ ] [Priority 2: What will be worked on]
- [ ] [Priority 3: What will be worked on]

## Notes & Callouts

- [Shoutout, announcement, or FYI item]
```

### Step 4: Refine the content

- Lead with impact, not activity. "Reduced page load time by 40%" beats "Worked on performance"
- Quantify wherever possible (numbers, percentages, counts)
- Be honest about blockers. Hiding problems does not make them go away
- Keep the full report under 1 page (roughly 400-500 words)
- Use consistent status labels: On Track, At Risk, Blocked, Complete

## Examples

### Example 1: Engineering team weekly report

**User request:** "Write a weekly report from these notes: shipped auth v2, fixed 3 prod bugs, started dashboard redesign, waiting on API team for new endpoints, sprint velocity was 34 points"

**Output:**
```markdown
# Weekly Report: Platform Engineering

**Week of:** Jan 20 - Jan 24

## Summary

Strong delivery week. Shipped the Auth v2 upgrade on schedule and
resolved 3 production issues. Dashboard redesign kicked off but is
partially blocked on API dependencies.

## Completed This Week

- **Auth v2 launch:** Rolled out new authentication flow to 100% of
  users. Includes MFA support and session management improvements.
- **Production bug fixes (3):** Resolved payment timeout issue,
  fixed user avatar upload crash, corrected timezone display in reports.

## In Progress

| Item | Status | ETA |
|------|--------|-----|
| Dashboard redesign (frontend) | On track | Feb 7 |
| Dashboard API integration | Blocked | Pending API team |

## Blockers

- **API endpoints for dashboard:** Waiting on the API team to deliver
  the new analytics endpoints. Reached out Monday, no ETA yet.

## Key Metrics

| Metric | This Week | Last Week | Trend |
|--------|-----------|-----------|-------|
| Sprint velocity | 34 pts | 28 pts | Up |
| Open bugs (P1/P2) | 2 | 5 | Down |

## Next Week Plan

- [ ] Continue dashboard frontend (target 60% complete)
- [ ] Follow up with API team on endpoint delivery
- [ ] Begin performance audit for Auth v2
```

### Example 2: Report from git log

**User request:** "Generate my weekly report from my git commits this week"

**Process:**
1. Read git log for the past 7 days
2. Group commits by project or feature
3. Summarize each group into a deliverable
4. Identify what is still in progress (branches without merged PRs)

**Output structure:**
```markdown
# Weekly Report: [Developer Name]

## Completed
- [Feature]: [Summary of commits, PR link]
- [Bug fix]: [What was fixed, impact]

## In Progress
- [Branch name]: [What it does, estimated completion]

## PRs
- Merged: [count]
- Open: [count]
- Lines changed: +[added] / -[removed]
```

## Guidelines

- Consistency is key. Use the same structure every week so readers know where to find information.
- Write for the audience. Executives want outcomes and risks. Managers want details and blockers.
- Completed items should emphasize results, not effort. "Shipped feature X" not "Spent 20 hours on feature X."
- Always include blockers even if there are none. Write "No blockers this week" to confirm nothing was missed.
- If the user provides sparse input, ask clarifying questions rather than inventing details.
- Status labels should be honest. Marking something "on track" when it is at risk erodes trust.
- Metrics should be relevant and consistent week over week so trends are visible.
- Keep formatting clean and scannable. The report should take under 2 minutes to read.
