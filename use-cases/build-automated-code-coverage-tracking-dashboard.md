---
title: "Build Automated Code Coverage Tracking Dashboard with AI"
slug: build-automated-code-coverage-tracking-dashboard
description: "Set up a code coverage tracking system that monitors test coverage trends and surfaces gaps across your codebase."
skills: [test-generator, coding-agent, data-analysis]
category: development
tags: [code-coverage, testing, dashboard, quality]
---

# Build Automated Code Coverage Tracking Dashboard with AI

## The Problem

A 15-person engineering team knows their test coverage is uneven but has no visibility into where it's getting worse. Coverage reports run in CI but nobody looks at them — they're buried in build logs as a single number that scrolls past in a wall of green text.

New features ship with zero tests because there's no system flagging coverage drops. The tech lead discovers that a critical payments module went from 85% to 42% coverage over three months — developers kept adding code without tests, and nobody noticed until a production bug slipped through. The bug caused duplicate charges for 200 customers. That 42% wasn't a sudden drop; it was a slow erosion, PR by PR, 1-2% at a time, that a dashboard would have caught in week one.

The overall coverage number is misleading too. The codebase shows 71% — sounds healthy. But that average hides the fact that utility functions are at 95% (easy to test, rarely changed) while the billing module that handles real money sits at 38% (hard to test, changed constantly). The number that matters isn't the average — it's the coverage on the code that changes the most and costs the most when it breaks.

## The Solution

Using the **test-generator**, **coding-agent**, and **data-analysis** skills, the workflow runs coverage analysis ranked by risk (combining coverage percentage with change frequency), builds a lightweight dashboard that tracks trends from CI artifacts, gates PRs that drop coverage below threshold, and generates targeted tests for the worst gaps. A single session brings a critical module from 38% to 72% coverage and catches two latent bugs in the process.

## Step-by-Step Walkthrough

### Step 1: Map the Coverage Landscape

The overall number — 71% — is misleading. A useful coverage analysis needs two dimensions: what percentage of code is tested, and how often does that code change. Start by understanding both:

```text
Analyze our codebase test coverage. Run the coverage tool, parse the output, and give me a breakdown by module showing: line coverage percentage, number of uncovered lines, and which files have zero tests. Sort by risk — lowest coverage in most-changed files first.
```

The key insight is sorting by risk, not just by percentage. A utility module at 50% coverage that hasn't changed in a year is less dangerous than a billing module at 60% coverage that gets modified weekly. Every code change in a low-coverage area is a coin flip — it might work, it might not, and there's no test to tell you which.

### Step 2: Review the Risk-Weighted Report

The coverage analysis surfaces the modules that actually matter:

**High Risk (low coverage + high change frequency):**

| File | Coverage | Changes (90 days) | Risk Score |
|------|----------|--------------------|------------|
| src/billing/subscription.ts | 34% | 47 changes | Critical |
| src/api/webhooks/handler.ts | 28% | 31 changes | Critical |
| src/auth/oauth-flow.ts | 41% | 22 changes | High |

**Module Summary:**

| Module | Average Coverage | Target | Status |
|--------|-----------------|--------|--------|
| src/billing/ | 38% | 80% | Critical gap |
| src/api/ | 56% | 80% | Below target |
| src/auth/ | 61% | 80% | Below target |
| src/utils/ | 91% | 80% | Healthy |
| src/models/ | 87% | 80% | Healthy |

**Files with zero tests:** 7 files, including `src/billing/refund-processor.ts` (142 lines, 19 changes in 90 days) and `src/api/webhooks/retry-queue.ts` (89 lines, 12 changes). These files have been modified regularly without anyone noticing they have no test coverage at all.

The billing module — the one handling real money — has the lowest coverage and the highest churn. That's not a coincidence; it's where the duplicate charge bug lived. And the webhook handler at 28% coverage processes payment notifications from Stripe — a failure there means lost revenue.

### Step 3: Build the Tracking Dashboard

```text
Create a coverage tracking dashboard that reads from our CI coverage reports. Show trends over time per module, highlight regressions, and flag any PR that drops coverage below threshold.
```

The agent builds a lightweight HTML dashboard (`coverage-dashboard/index.html`) that reads coverage JSON artifacts from CI:

- **Module-level trend charts** showing coverage over the last 30 days, with each data point linked to the commit that produced it
- **PR-level coverage diff table** showing what each PR added or removed, so you can see who's improving coverage and who's eroding it
- **Regression alerts** for any coverage drop greater than 5% in a single PR
- **Uncovered critical paths** highlighted in red, ranked by the risk score from Step 2
- **Zero-test file list** updated automatically — any file that enters the codebase without tests gets flagged immediately

No external dependencies, no SaaS subscription, no monthly bill — just a static page that reads JSON artifacts your CI already produces. Host it on an internal URL or serve it from GitHub Pages and the team has visibility into coverage health without installing anything or signing up for a third-party service.

The trend charts are the most revealing feature. A single coverage number is a snapshot; a trend line tells a story. When the billing module shows a steady downward slope from 85% to 42% over 12 weeks, it's obvious in hindsight that something went wrong. The dashboard would have made it obvious in week 2.

### Step 4: Gate PRs in CI

The dashboard shows history, but the CI gate prevents new problems from being introduced:

```text
Configure GitHub Actions to enforce coverage thresholds on every pull request. Block merges that drop overall coverage below 70%, warn on module-level drops, and post a coverage diff comment on every PR.
```

The agent configures `.github/workflows/coverage.yml` with four rules:

- **Block** if overall coverage drops below 70%
- **Warn** if any module drops more than 5% from its baseline
- **Comment** on every PR with a coverage diff showing exactly which files lost coverage and which gained it
- **Upload** coverage artifacts for the dashboard to consume

The PR comment is what changes behavior. When a developer sees "+47 lines added, -2% coverage in src/billing/" right in their pull request, they add tests before the reviewer even looks at it. It's not about enforcement — it's about visibility. Most developers don't skip tests on purpose; they skip them because they don't realize they're eroding coverage.

### Step 5: Generate Tests for the Worst Gaps

With the dashboard and CI gate in place, the next step is digging out of the hole:

```text
Generate tests for the 5 files with the lowest coverage in the billing module. Focus on the uncovered branches and error paths.
```

The agent writes targeted tests for the most critical gaps — not boilerplate happy-path tests that assert the obvious, but tests that cover the uncovered branches, error handling paths, and edge cases. The billing module goes from 38% to 72% coverage in a single session.

More importantly, two latent bugs surface in the process: an off-by-one error in proration calculation (annual subscribers billed for 13 months instead of 12 when they start on the last day of a month) and a missing null check on cancelled subscriptions that would have thrown an unhandled exception when a webhook fires after cancellation.

The tests didn't just add coverage; they found the bugs that the missing tests were supposed to prevent. This is the real argument for coverage: it's not about hitting a number, it's about the bugs you find while writing the tests to hit that number.

### Step 6: Set Up Weekly Coverage Digests

The dashboard is there for anyone who wants to check. The weekly digest brings the data to the team:

```text
Send a weekly coverage summary to the engineering Slack channel showing trend per module, biggest improvements, and any new regressions introduced this week.
```

A scheduled report drops into Slack every Monday morning: which modules improved, which regressed, which PRs had the biggest coverage impact (positive and negative), and whether any new zero-test files were added. The team stays aware of coverage health without anyone manually checking the dashboard.

The social visibility matters. When the team sees "billing module: 72% -> 76% this week, up from 38% last month" in a public channel, maintaining coverage becomes a shared value rather than a tech lead's nagging point. Developers who improve coverage get recognition in a public channel. Developers who introduce regressions get a gentle nudge before anyone else needs to bring it up.

The weekly rhythm also catches slower trends: if a module drops 1% per week for six weeks, the individual PRs don't trigger the 5% CI gate, but the weekly digest makes the cumulative decline visible. It's the difference between watching a chart live and seeing the weekly summary — sometimes the forest matters more than the trees.

## Real-World Example

Ravi is the tech lead at a 15-person SaaS startup. After a billing bug causes duplicate charges for 200 customers, he discovers the payments code has only 34% test coverage — down from 85% three months ago. The erosion happened across dozens of PRs, each one shaving off a percent or two, and nobody noticed because the coverage number was buried in CI logs.

He runs the risk-weighted analysis and confirms billing and webhooks are the critical gaps: high code churn, low coverage, maximum blast radius. The dashboard tracks coverage trends from CI artifacts and displays them per module with trend lines. GitHub Actions posts coverage diffs on every PR and blocks merges that drop below 70%.

In one session, the agent generates 23 tests for the billing module, targeting the uncovered branches and error handling paths — not trivial assertions, but tests that exercise the code paths where bugs hide. Coverage jumps to 72%, and two latent bugs surface — including an off-by-one error that would have caused incorrect charges for annual subscribers renewing in March.

The team didn't just add test coverage; they found the exact kind of bug that started this whole effort. The off-by-one error hadn't caused a customer impact yet — but it would have in March when the first wave of annual renewals hit. The tests caught it with two weeks to spare.

Three months later, billing coverage is at 84% and climbing, and the weekly Slack digest shows the team maintaining it without being asked. The CI gate has blocked 4 PRs that would have dropped coverage, each time prompting the developer to add tests before merging. Coverage isn't an afterthought anymore — it's part of the definition of done.
