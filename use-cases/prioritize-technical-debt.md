---
title: "Prioritize Technical Debt with AI Analysis"
slug: prioritize-technical-debt
description: "Map technical debt across a codebase, score it by business impact, and produce a prioritized remediation backlog."
skills: [tech-debt-analyzer, code-complexity-scanner]
category: development
tags: [technical-debt, code-quality, refactoring, engineering-management, maintainability]
---

# Prioritize Technical Debt with AI Analysis

## The Problem

Every sprint retrospective at Lena's 35-person B2B SaaS company mentions the same thing: "we need to address tech debt." But nobody can agree on what to fix first. Backend developers want to refactor the billing module. Frontend developers want to modernize the component library. The platform team wants to upgrade Node.js. Each camp has valid arguments, and none of them have data.

That's the real problem with technical debt — not that it exists, but that it's invisible. Engineering leads know the codebase has problems, but they can't quantify them. When sprint planning comes, "refactor the payments module" competes against "build feature X" with nothing but gut feeling to back either choice. Teams either ignore debt until it causes incidents (reactive), or waste sprints refactoring code that rarely changes (misdirected). Both outcomes are expensive.

The billing module has 5 TODO comments that have been there for 14 months. The auth middleware has a FIXME about a race condition that nobody has time to investigate. A function called `calculateTotal()` is 180 lines long with 12 nested conditions. But are any of these actually causing problems? Or are they just ugly code that works fine?

## The Solution

Using the **tech-debt-analyzer** and **code-complexity-scanner** skills, the approach is to scan the codebase for debt signals, cross-reference complexity metrics with git history to find which files change most frequently and cause the most bugs, and produce a prioritized backlog scored by business impact — not just code smell severity.

## Step-by-Step Walkthrough

### Step 1: Scan the Codebase for Debt Signals

```text
Analyze our TypeScript monorepo at ./src for technical debt. Look for cyclomatic
complexity over 15, functions longer than 80 lines, TODO/HACK/FIXME comments,
duplicated code blocks, and any deprecated API usage. Cross-reference with git
log to find which files change most often.
```

Under the hood the agent runs the signals the two skills teach, and you can run them yourself to check its numbers:

```bash
pip install lizard                       # in a virtual environment
lizard src/ -C 15 -L 100 -w              # functions above cyclomatic complexity 15 or 100 lines
grep -rnE "TODO|FIXME|HACK" --include="*.ts" src/
git log --since="6 months ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -30
git log -E -i --since="6 months ago" --grep="fix|bug|hotfix" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

In Lena's repo, the scan covers 247 files and 48,200 lines of code. The critical insight comes from correlating two dimensions: code complexity and change frequency. Neither dimension alone tells the full story — you need both.

**High-impact hotspots** (high complexity AND high change frequency) — these are the files that hurt the most because they're hard to work with and developers are forced to touch them constantly:

| File | Complexity | Changes/Month | TODOs | Bug-Fix PRs (6mo) |
|---|---|---|---|---|
| billing/invoice-calculator.ts | 34 | 18 | 5 | 14 |
| api/middleware/auth.ts | 28 | 14 | 3 | 11 |
| workers/sync-engine.ts | 22 | 11 | 4 | 8 |

**Complexity-only** (complex but rarely touched) — these look scary in a static analysis report but cause no actual pain:

| File | Complexity | Changes/Month | TODOs |
|---|---|---|---|
| legacy/xml-parser.ts | 41 | 0.3 | 2 |
| utils/date-helpers.ts | 19 | 0.5 | 0 |

**Churn-only** (simple but constantly changing) — these aren't complex, but the frequency of changes suggests unclear responsibilities or missing abstractions:

| File | Complexity | Changes/Month | TODOs |
|---|---|---|---|
| api/routes/users.ts | 8 | 22 | 1 |
| config/feature-flags.ts | 3 | 19 | 0 |

The XML parser has a complexity score of 41 — the highest in the entire codebase — but it hasn't been meaningfully modified in 8 months and has caused zero bugs. Refactoring it would feel productive but deliver zero business value. The invoice calculator, with a lower complexity score of 34, has caused 14 bug-fix PRs in the same period. That's where the pain is.

The aggregate numbers tell their own story: 23 files flagged, 47 TODOs, 12 FIXMEs, 8 HACK markers. Average cyclomatic complexity across the codebase is 9.2 (target: below 10), which means the codebase is generally healthy — the problems are concentrated in a small number of files.

### Step 2: Score Debt by Business Impact

```text
Score each debt item by business impact. Consider: how often does this file
cause bugs (check git blame for bug-fix commits), how many developers touch it
weekly, and does it block feature development? Give me a prioritized list with
estimated remediation effort.
```

The scoring formula weights four dimensions:

**Score = (change_frequency x 0.3) + (bug_density x 0.3) + (developer_contention x 0.2) + (complexity_score x 0.2)**

| Priority | File | Impact Score | Effort | Bug Fixes (6mo) | Devs/Week |
|---|---|---|---|---|---|
| P0 | billing/invoice-calculator.ts | 9.2/10 | 3 days | 14 PRs | 4 devs |
| P0 | api/middleware/auth.ts | 8.8/10 | 2 days | 11 PRs | 6 devs |
| P1 | workers/sync-engine.ts | 7.5/10 | 5 days | 8 PRs | 3 devs |
| P1 | api/routes/users.ts | 6.9/10 | 1 day | 3 PRs | 5 devs |
| P2 | legacy/xml-parser.ts | 2.1/10 | 4 days | 0 PRs | 0 devs |

The invoice calculator scores highest because it combines all four risk factors: it's complex (34 cyclomatic), it changes constantly (18 times/month), it causes bugs (14 fix PRs in 6 months), and 4 different developers touch it every week — which means merge conflicts, context-switching overhead, and knowledge silos.

The auth middleware scores nearly as high, and the "6 devs/week" number is telling. Every feature that adds a new endpoint or modifies authorization logic requires touching this file. With 6 developers in and out of it weekly, merge conflicts are a daily tax on velocity.

The XML parser, despite its impressive complexity score, ranks last. Nobody touches it. It causes no bugs. Spending 4 days refactoring it would be pure waste.

### Step 3: Generate Remediation Plans

```text
For the top 3 P0/P1 items, create specific remediation tickets. Each should
have a description, acceptance criteria, suggested approach, and estimated
story points. Format them ready to paste into our issue tracker.
```

**Ticket: Refactor invoice-calculator into composable functions**
- **Priority:** P0 | **Estimate:** 5 story points | **Sprint:** current

`invoice-calculator.ts` has grown to 420 lines with cyclomatic complexity of 34. The `calculateTotal()` function alone handles tax rules, discounts, proration, and currency conversion in a single 180-line function with 12 nested conditions. Every new pricing rule added to this function increases the risk of breaking existing calculations.

**Acceptance criteria:**
- Split into: `TaxCalculator`, `DiscountEngine`, `ProrateService`, `CurrencyConverter`
- Each function complexity below 10
- Test coverage of the module raised from today's 67% before any code moves, and never lower afterward
- No behavior changes — output parity verified against 50 production invoice samples

**Suggested approach:**
1. Add characterization tests for current behavior (day 1)
2. Extract `TaxCalculator` with country-specific strategies (day 1-2)
3. Extract `DiscountEngine` with rule composition (day 2)
4. Extract remaining concerns, update imports (day 3)

The characterization tests come first for a reason: refactoring a function that handles billing with only 67% test coverage is asking for subtle regressions. A customer getting charged the wrong amount is a trust-destroying bug. Capture current behavior with snapshot tests before changing anything.

**Ticket: Decompose auth middleware into pluggable handlers**
- **Priority:** P0 | **Estimate:** 3 story points | **Sprint:** current

The auth middleware is a 310-line file where JWT validation, role checking, rate limiting, and request logging are interleaved. Every new endpoint requires modifying this file, creating a bottleneck for 6 developers.

**Ticket: Refactor sync-engine error handling**
- **Priority:** P1 | **Estimate:** 8 story points | **Sprint:** next

The sync engine has 4 FIXME comments about error handling edge cases. Failed sync operations silently retry without backoff, occasionally causing duplicate records.

### Step 4: Track Debt Trends Over Time

```text
Set up a debt tracking baseline. Save a snapshot of current metrics
so we can compare next month and see if debt is growing or shrinking.
```

The baseline snapshot should hold every input to the scoring: complexity per function, change frequency, bug-fix density and TODO counts (the agent adds the aggregate score on top). Complexity and churn are easy to keep in the repo yourself; bug-fix counts come from the second `git log` command in Step 1:

```bash
mkdir -p debt
lizard src/ --csv > debt/complexity-$(date +%Y-%m).csv
git log --since="6 months ago" --pretty=format: --name-only | sort | uniq -c | sort -rn > debt/churn-$(date +%Y-%m).txt
```
 Running the same scan monthly reveals whether debt is accumulating faster than the team is paying it down.

Instead of the quarterly "we should do something about tech debt" hand-wringing, Lena shows a chart: "debt score increased 12% this quarter, concentrated in the billing module. Here are the three highest-ROI tickets." Data-backed arguments win sprint planning conversations in a way that vague appeals to "code quality" never do.

## Real-World Example

Lena presents the data-backed prioritization at the next sprint planning. For the first time, the team isn't debating preferences — they're looking at numbers. The invoice calculator's 14 bug-fix PRs in 6 months speaks louder than any architectural opinion. The frontend team's request to modernize the component library scores a 3.1/10 — low churn, low bugs, mostly aesthetic. It can wait.

The team completes all three P0/P1 refactoring tickets in one sprint — 13 story points total. The invoice calculator splits into four focused modules. The auth middleware gets a clean separation of concerns. The sync engine's error handling becomes predictable.

The impact shows up in the following month's metrics: bug-fix PRs for billing drop from 2-3 per week to zero. The auth middleware, which 6 developers were contending over, stops generating merge conflicts. New pricing rules slot into `DiscountEngine` or `TaxCalculator` without touching the other concerns (the team's own observation after one month, not a benchmark).

And the XML parser — complexity 41, the scariest-looking file in the codebase — stays exactly where it is. Untouched, unfixed, and causing no problems at all.

## Related Skills

- **tech-debt-analyzer** — finds TODO/FIXME markers, outdated dependencies and git-history hotspots, then scores and prioritizes them (Steps 1-3).
- **code-complexity-scanner** — measures cyclomatic and cognitive complexity per function so the scoring has a complexity input (Step 1).
