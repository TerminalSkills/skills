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

Every growing codebase accumulates technical debt — rushed features, outdated patterns, TODO comments that never get addressed. Engineering leads know debt exists but struggle to quantify it. When sprint planning comes, "refactor the payments module" competes against "build feature X" with no data to back either choice. Teams either ignore debt until it causes incidents, or waste sprints refactoring code that rarely changes.

## The Solution

Use the `tech-debt-analyzer` to scan the codebase for debt signals (complexity hotspots, outdated dependencies, code duplication, TODO/HACK markers), then cross-reference with `code-complexity-scanner` to identify which files change most frequently and cause the most merge conflicts. The result: a prioritized debt backlog scored by business impact, not just code smell severity.

```bash
npx terminal-skills install tech-debt-analyzer code-complexity-scanner
```

## Step-by-Step Walkthrough

### 1. Scan the codebase for debt signals

```text
Analyze our TypeScript monorepo at ./src for technical debt. Look for cyclomatic
complexity over 15, functions longer than 80 lines, TODO/HACK/FIXME comments,
duplicated code blocks, and any deprecated API usage. Cross-reference with git
log to find which files change most often.
```

The agent scans the repo and correlates code quality with change frequency:

```text
Technical Debt Scan — src/ (247 files, 48,200 LOC)
───────────────────────────────────────────────────

HIGH-IMPACT HOTSPOTS (high complexity + high change frequency)
  src/billing/invoice-calculator.ts     Complexity: 34  Changes/mo: 18  TODOs: 5
  src/api/middleware/auth.ts             Complexity: 28  Changes/mo: 14  TODOs: 3
  src/workers/sync-engine.ts            Complexity: 22  Changes/mo: 11  FIXMEs: 4

COMPLEXITY-ONLY (complex but rarely touched)
  src/legacy/xml-parser.ts              Complexity: 41  Changes/mo: 0.3  TODOs: 2
  src/utils/date-helpers.ts             Complexity: 19  Changes/mo: 0.5  TODOs: 0

CHURN-ONLY (simple but constantly changing)
  src/api/routes/users.ts               Complexity: 8   Changes/mo: 22  TODOs: 1
  src/config/feature-flags.ts           Complexity: 3   Changes/mo: 19  TODOs: 0

Summary: 23 files flagged | 47 TODOs | 12 FIXMEs | 8 HACK markers
Average cyclomatic complexity: 9.2 (target: <10)
Files above complexity threshold (15): 14 files
```

### 2. Score debt by business impact

```text
Now score each debt item by business impact. Consider: how often does this file
cause bugs (check git blame for bug-fix commits), how many developers touch it
weekly, and does it block feature development? Give me a prioritized list with
estimated remediation effort.
```

```text
Prioritized Technical Debt Backlog
──────────────────────────────────

Priority  File                          Impact   Effort   Bug Fixes (6mo)  Devs/week
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P0        billing/invoice-calculator    9.2/10   3 days   14 bug-fix PRs   4 devs
P0        api/middleware/auth.ts        8.8/10   2 days   11 bug-fix PRs   6 devs
P1        workers/sync-engine.ts        7.5/10   5 days   8 bug-fix PRs    3 devs
P1        api/routes/users.ts           6.9/10   1 day    3 bug-fix PRs    5 devs
P2        legacy/xml-parser.ts          2.1/10   4 days   0 bug-fix PRs    0 devs

Scoring formula: (change_frequency × 0.3) + (bug_density × 0.3) +
                 (developer_contention × 0.2) + (complexity_score × 0.2)
```

### 3. Generate remediation plans

```text
For the top 3 P0/P1 items, create specific remediation tickets. Each should
have a description, acceptance criteria, suggested approach, and estimated
story points. Format them ready to paste into our issue tracker.
```

The agent produces structured tickets:

```text
TICKET: Refactor invoice-calculator into composable functions
Priority: P0 | Estimate: 5 points | Sprint: current

Description:
invoice-calculator.ts has grown to 420 lines with cyclomatic complexity of 34.
The calculateTotal() function alone handles tax rules, discounts, proration,
and currency conversion in a single 180-line function with 12 nested conditions.

Acceptance Criteria:
- [ ] Split into: TaxCalculator, DiscountEngine, ProrateService, CurrencyConverter
- [ ] Each function complexity < 10
- [ ] 100% existing test coverage preserved (currently 67% — add missing tests first)
- [ ] No behavior changes — output parity verified against 50 production invoice samples

Suggested Approach:
1. Add characterization tests for current behavior (day 1)
2. Extract TaxCalculator with country-specific strategies (day 1-2)
3. Extract DiscountEngine with rule composition (day 2)
4. Extract remaining concerns, update imports (day 3)
```

### 4. Track debt trends over time

```text
Set up a debt tracking baseline. Generate a JSON snapshot of current metrics
so we can compare next month and see if debt is growing or shrinking.
```

## Real-World Example

Lena, an engineering manager at a 35-person B2B SaaS company, faced a recurring problem: every sprint retrospective mentioned "we need to address tech debt" but nobody could agree on what to fix first. Backend developers wanted to refactor the billing module; frontend developers wanted to modernize the component library; the platform team wanted to upgrade Node.js.

1. She asked the agent to scan the entire monorepo (~85,000 LOC across 400 files)
2. The debt analyzer found 31 files above the complexity threshold, but only 8 were actively changed more than 5 times per month
3. The critical insight: `invoice-calculator.ts` had caused 14 bug-fix PRs in 6 months and was touched by 4 different developers weekly — it was the clear #1 priority
4. The legacy XML parser, despite complexity of 41, hadn't been modified in 8 months and caused zero bugs — it could wait indefinitely
5. She presented the data-backed prioritization to the team: 3 specific refactoring tickets for the current sprint totaling 13 story points

The team completed all three in one sprint. Bug-fix PRs for billing dropped from 2-3 per week to zero over the following month.
