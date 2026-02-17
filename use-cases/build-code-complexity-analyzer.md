---
title: "Build an Automated Code Complexity Analyzer and Refactoring Planner with AI"
slug: build-code-complexity-analyzer
description: "Analyze codebase complexity metrics and generate a prioritized refactoring plan based on risk and business impact."
skills: [code-reviewer, coding-agent, report-generator]
category: development
tags: [code-quality, refactoring, complexity, technical-debt, analysis]
---

# Build an Automated Code Complexity Analyzer and Refactoring Planner with AI

## The Problem

A 25-person SaaS startup has a three-year-old Node.js backend with 400 files and 60,000 lines of code. New developers take weeks to become productive because key modules are tangled — one billing file is 2,800 lines with a cyclomatic complexity score over 90. The team knows certain areas need refactoring but cannot agree on what to fix first. Every sprint planning turns into a debate about which tech debt is most urgent, with no data to back any argument.

## The Solution

Use the **code-reviewer** skill to analyze complexity metrics across the entire codebase, the **coding-agent** to generate concrete refactoring plans with code examples, and the **report-generator** to produce a prioritized action plan the team can actually execute.

```bash
npx terminal-skills install code-reviewer coding-agent report-generator
```

## Step-by-Step Walkthrough

### 1. Run a full complexity scan

Tell the agent to analyze the codebase:

```
Analyze the entire ./src directory for code complexity. For each file, calculate cyclomatic complexity, lines of code, function length, nesting depth, and coupling (number of imports/dependencies). Flag anything above industry thresholds.
```

### 2. The agent maps the complexity landscape

```
Codebase Analysis: 400 files, 60,247 lines

Critical Complexity (immediate attention):
- src/billing/invoice-engine.js — CC: 94, 2,813 lines, max nesting: 8
- src/api/middleware/auth.js — CC: 67, 1,204 lines, max nesting: 7
- src/workers/report-builder.js — CC: 58, 1,891 lines, max nesting: 6

High Complexity (plan for next quarter):
- 14 files with CC > 30
- 23 functions longer than 200 lines

Coupling hotspots:
- src/billing/invoice-engine.js imported by 34 other files
- src/utils/helpers.js imported by 89 files (god module)
```

### 3. Correlate complexity with bug history

```
Cross-reference these complexity results with our git log. Which high-complexity files have the most bug-fix commits in the last 6 months? That tells us where complexity is actively causing problems.
```

```
Complexity × Bug Frequency:
1. invoice-engine.js — 94 CC, 31 bug-fix commits (highest risk)
2. auth.js — 67 CC, 18 bug-fix commits
3. helpers.js — 22 CC, 24 bug-fix commits (low complexity but fragile)
4. report-builder.js — 58 CC, 8 bug-fix commits (complex but stable)
```

### 4. Generate a refactoring plan

```
Create a refactoring plan for the top 3 risk files. For each, suggest specific decomposition strategies, estimate effort in story points, and show a before/after code example for one function.
```

### 5. The agent delivers actionable plans

For each file, the agent provides a concrete breakdown:

```
Refactoring Plan: invoice-engine.js (CC: 94 → target CC: 15)

Decomposition:
1. Extract InvoiceCalculator class (lines 45-380) → invoice-calculator.js
   - 8 functions, handles pricing logic and tax computation
   - Estimated: 3 story points

2. Extract PaymentProcessor class (lines 381-890) → payment-processor.js
   - 6 functions, handles Stripe integration and retry logic
   - Estimated: 5 story points (includes Stripe API changes)

3. Extract InvoiceFormatter (lines 891-1400) → invoice-formatter.js
   - PDF and CSV generation, template rendering
   - Estimated: 2 story points

4. Extract WebhookHandler (lines 1401-1800) → invoice-webhooks.js
   - Payment confirmation, failure handling, refund processing
   - Estimated: 3 story points

5. Remaining orchestration stays in invoice-engine.js (~200 lines)
   - Coordinates the four extracted modules
   - CC drops from 94 to approximately 12

Total estimated effort: 13 story points across 2 sprints
Risk: Medium — requires updating 34 import statements in other files
Prerequisite: Add integration tests before refactoring (test-generator)
```

### 5. Track complexity over time

```
Set up a complexity tracking baseline. Generate a JSON snapshot of all complexity metrics so we can compare after each sprint and measure whether refactoring is actually improving things.
```

```
Baseline snapshot saved to: metrics/complexity-baseline-2025-02-17.json
- Average file CC: 14.2
- Max file CC: 94 (invoice-engine.js)
- Files over CC 30: 17
- Average function length: 48 lines
- Longest function: 312 lines

Run again after refactoring to see delta. Recommended: add to CI pipeline
to track per-commit complexity trends and alert when any file crosses CC 40.
```

## Real-World Example

Kenji, a tech lead at a 25-person SaaS startup, needs to justify two sprints of refactoring work to the product team.

1. Kenji asks the agent to scan the entire codebase — it identifies 3 critical files and 14 high-complexity files in under two minutes
2. He cross-references with git history and discovers that invoice-engine.js accounts for 31 of the last 80 bug-fix commits — 39% of all bugs trace back to one file
3. The agent generates a refactoring plan: split invoice-engine.js into 5 focused modules, estimated at 13 story points, with projected 40% reduction in bug rate for that area
4. Kenji presents the report showing the data — complexity scores, bug correlation, and estimated ROI — and the product team approves two refactoring sprints
5. After refactoring, the next quarter shows a 52% drop in billing-related bugs and new developer onboarding time drops from 3 weeks to 10 days

## Related Skills

- [data-visualizer](../skills/data-visualizer/) -- Create complexity heatmaps and trend charts
- [test-generator](../skills/test-generator/) -- Generate tests before refactoring to ensure nothing breaks
