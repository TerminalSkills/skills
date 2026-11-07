---
title: "Automate Weekly Stakeholder Status Reports with AI"
slug: automate-weekly-stakeholder-status-reports
description: "Generate professional weekly status reports from project data, git history, and task trackers automatically."
skills: [github, report-generator]
category: productivity
tags: [status-reports, stakeholders, project-management, automation, reporting]
---

# Automate Weekly Stakeholder Status Reports with AI

## The Problem

Every Friday afternoon, engineering leads scramble to write status reports for stakeholders. They check Jira for completed tickets, scan Slack for notable discussions, review git logs for shipped features, and try to remember what blockers came up in standup on Tuesday. The result is either a rushed bullet list too technical for executives ("merged PR #482 implementing batch endpoint for payment processing v2") or a polished document that took two hours to write — two hours that could have been a feature.

Multiply this by every team lead, and the company burns 10+ engineering hours per week on reporting. The VP of Engineering then spends another hour synthesizing three team reports into one executive summary. And the reports are still inconsistent — one lead writes a novel, another sends five bullet points, a third forgets entirely until Monday morning when the CEO asks what shipped last week.

The numbers are never quite right either. Someone reports 12 PRs merged, but the actual count is 14 because two landed after they wrote the report. Sprint velocity is an estimate from memory, not a calculation from the tracker. Last quarter, the CTO cited a velocity number in a board meeting that was 15% higher than reality — because the report it came from was based on a team lead's optimistic recollection, not actual data. The reports are a best-effort reconstruction of the week, assembled under time pressure by people who'd rather be writing code.

## The Solution

Using the **github** and **report-generator** skills, each team lead spends five minutes describing highlights, decisions and blockers while the agent pulls hard data with the `gh` CLI (merged pull requests and releases for the week) and fills the report-generator status-report template. Numbers the agent cannot read from GitHub, such as sprint velocity from your tracker, you paste in. The VP gets a synthesized executive brief without reading three separate reports, and every PR and release count comes from `gh` output, not from memory.

## Step-by-Step Walkthrough

### Step 1: Feed the Agent Your Sources

Tell the agent what to pull from and add the context that only a human knows:

```text
Generate my weekly status report for the week of Feb 9-13, 2026, using the report-generator
status-report template. Pull data with gh from our-org/api and our-org/web: PRs merged
and releases published that week.
- Key decisions: moved auth to JWT, postponed mobile launch to March
- Blockers: waiting on legal review for GDPR data export feature
- Sprint velocity from our tracker: 42 points this week, 38 last week
```

Behind the scenes the github skill's `gh` CLI does the data pull (`gh auth status` must show you signed in with read access to both repos). `gh pr list` returns only 30 items unless you raise the limit, so the agent has to pass one:

```bash
gh pr list -R our-org/api --state merged --search "merged:2026-02-09..2026-02-13" \
  --limit 200 --json number,title,author,mergedAt
gh release list -R our-org/api --limit 20 --json tagName,publishedAt
```

Count the PRs from the length of the JSON array, and keep only releases whose `publishedAt` falls in the week. Five minutes of input. The decisions and blockers are the pieces that can't be automated — they require human judgment about what's worth reporting and how to frame it. "We postponed mobile to March" needs context about why; "waiting on legal" needs context about what's at stake. Everything else — PR counts, release versions, velocity metrics — comes from the data.

### Step 2: Data Collection and Categorization

The agent pulls GitHub activity for the week of Feb 9-13, 2026 and cross-references it with the context provided:

**GitHub Activity:**
- `our-org/api`: 14 PRs merged, 3 releases (v2.14.1, v2.14.2, v2.15.0)
- `our-org/web`: 9 PRs merged, 1 release (v3.8.0)

**Key PRs identified:**
- #482: Implement batch payment processing (api)
- #489: Add retry logic for webhook delivery (api)
- #156: Redesign settings page with new nav (web)
- #161: Add dark mode support (web)

Not every PR makes the report. The agent distinguishes between feature PRs (stakeholder-relevant), bug fixes (worth mentioning if they affected users), and maintenance PRs (dependency updates, refactors, CI changes) and only surfaces the ones worth mentioning. Out of 23 merged PRs, maybe 6 are stakeholder-relevant. A Dependabot PR bumping lodash from 4.17.20 to 4.17.21 doesn't belong in a CEO-facing report; a PR that fixes a checkout bug affecting 2% of transactions does.

Everything is sorted into the report-generator template sections: Completed, In Progress, Blockers & Risks, with decisions folded into the Summary.

### Step 3: Review the Draft Report

The agent produces a complete status report formatted for non-technical stakeholders, with consistent status labels (On Track, At Risk, Blocked, Complete) and kept to about one page:

---

**Weekly Report: Engineering**
*Week of February 9-13, 2026*

**Summary**
Batch payments, webhook retries and dark mode shipped. Authentication is moving from session cookies to JWT tokens for API consistency, and the mobile app launch is postponed to March to align with the marketing campaign. The GDPR data export feature is blocked on legal review.

**Completed This Week**
- **Batch payment processing** — merchants can now process up to 500 payments in a single API call (v2.15.0)
- **Webhook delivery retry logic** — failed webhooks now retry 3x with exponential backoff, reducing integration failures
- **Settings page redesign** — new navigation structure with improved UX
- **Dark mode** — available to all users via settings toggle

**In Progress**
- JWT migration — On Track, estimated 3 more days
- Mobile app v2 — At Risk, timeline shifted to March per team decision

**Blockers & Risks**
- GDPR data export feature — code complete, **Blocked** on legal review

**Key Metrics**
| Metric | This Week | Last Week | Trend |
|---|---|---|---|
| PRs merged (2 repos, from `gh`) | 23 | n/a | n/a |
| Releases (from `gh`) | 4 | n/a | n/a |
| Sprint velocity (pasted from tracker) | 42 pts | 38 pts | Up |

**Next Week Plan**
- [ ] Complete JWT migration (estimated 3 days)
- [ ] Begin QA cycle for data export feature once legal approves
- [ ] Start sprint planning for mobile v2

---

The difference between this and a manually written report: the PR count and release versions come from `gh` output, and the velocity is the figure you pasted from the tracker, not a memory. No more "I think we merged about 20 PRs" when the actual number is 23. Check the draft against the JSON before sending, because the agent can still mis-sort or mis-describe a PR. The "Shipped" items are written in business language (what it means for users) rather than technical language (what the PR did). "Merchants can now process up to 500 payments in a single API call" communicates value; "Merged PR #482 implementing batch endpoint" doesn't.

### Step 4: Adjust Tone for Different Audiences

The same data can serve different readers. An executive doesn't need PR numbers; a board doesn't need sprint velocity:

```text
Create an executive version — shorter, no technical details, focused on business impact and timelines.
```

The executive version strips out version tags and PR references, replacing them with business outcomes:

- "Merchants can now batch-process payments, reducing integration effort for large customers" instead of "Shipped batch payment processing endpoint in v2.15.0"
- "GDPR compliance feature delayed — pending legal review, expected resolution next week" instead of "GDPR data export feature code complete, PR #478 merged, awaiting legal sign-off on data retention fields"

Following report-generator's audience table, risk items and timeline changes get promoted to the top — the executive cares about what's at risk, not what shipped cleanly. Technical details disappear. What remains is a one-page brief that answers three questions: what moved forward, what's stuck, and what does the executive need to know or decide.

Here's how the same information looks in each version:

**Engineering report:** "GDPR data export feature — code complete, awaiting legal review (BLOCKED). PR #478 merged, data retention fields need legal sign-off per GDPR Article 20 (data portability)."

**Executive report:** "GDPR compliance feature delayed 1 week — pending legal review. No customer impact. Expected resolution by Feb 20."

Same fact, different framing. The engineering report includes the technical detail. The executive report includes the timeline and business impact.

One data collection step, two reports — each tuned to its audience. The same approach works for board-level summaries, investor updates, or cross-functional reports for the product and marketing teams.

### Step 5: Build the Weekly Rhythm

A single good report is useful. A consistent weekly report is transformative. The real payoff comes from making this repeatable:

```text
Save this report format as weekly-report-template.md in our repo. Each Friday I will ask you to
pull the same gh data for the same two repos for that week, fill the template, and leave
placeholders for decisions, blockers and next-week priorities. I'll fill those in before sending.
```

The skills do not schedule anything: you start the run each Friday (or add the same prompt to a scheduler you already use). Reusing one saved template keeps reports consistent week to week — same sections, same tone, same level of detail. The agent pre-fills everything it can from GitHub, leaving placeholders for the human-only context: key decisions, blockers, and next-week priorities. A five-minute review, a few edits, and it's sent — instead of the Friday afternoon scramble.

Over time, the templates build institutional memory. Want to see what shipped last March? Pull up the March reports. Need to explain to the board why the mobile launch was delayed? The weekly reports track the decision across three weeks of updates. The reports become a timeline of the product, not just a status check.

## Real-World Example

Priya is the VP of Engineering at a 40-person startup with three engineering squads. Each lead used to write their own report in their own format, and Priya spent an hour every Friday evening stitching them into an executive update. The platform team wrote a detailed technical log. The growth team sent a Slack message with three bullet points. The infrastructure team's report was two weeks old because the lead kept forgetting.

Now each squad lead spends five minutes telling the agent their highlights, blockers, and decisions. The agent pulls GitHub data for each squad's repos and generates individual team reports with consistent formatting. Priya asks the agent to combine all three into an executive summary with a risks section. Out comes a one-page brief highlighting shipped features, at-risk timelines, and resource needs — formatted the way the CEO expects it.

In Priya's team the Friday work dropped from about 3 hours to about 15 minutes of input plus review. The reports are more consistent and more data-accurate, and a missing lead no longer means a missing report, because anyone can run the same saved prompt. The CEO stopped asking "what shipped last week?" because the answer is in the inbox before the question comes.

The unexpected benefit: the historical reports became a decision log. When a stakeholder asked in Q3 why the mobile launch was delayed, Priya pulled up the weekly reports from February through April showing the progressive timeline shifts and the reasons behind each one. No revisionist history, no he-said-she-said — just a factual record assembled from data every week.

## Related Skills

- [github](../skills/github/SKILL.md): pulls the week's merged PRs and releases with the `gh` CLI
- [report-generator](../skills/report-generator/SKILL.md): status-report template, audience table and status labels
