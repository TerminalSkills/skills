---
title: "Build an Automated Code Complexity Analyzer and Refactoring Planner with AI"
slug: build-code-complexity-analyzer
description: "Analyze codebase complexity metrics and generate a prioritized refactoring plan based on risk and business impact."
skills: [code-reviewer, coding-agent, report-generator, fallow]
category: development
tags: [code-quality, refactoring, complexity, technical-debt, analysis]
---

# Build an Automated Code Complexity Analyzer and Refactoring Planner with AI

## The Problem

A 25-person SaaS startup has a three-year-old Node.js backend with 400 files and 60,000 lines of code. New developers take weeks to become productive because key modules are tangled -- one billing file is 2,800 lines with a cyclomatic complexity score over 90. The team knows certain areas need refactoring but cannot agree on what to fix first. Every sprint planning devolves into a debate about which tech debt is most urgent, and nobody has data to settle the argument.

The worst part: everyone suspects the billing module is a problem, but nobody can quantify how much it actually costs the team. Is it responsible for 10% of bugs or 50%? Without that number, "let's refactor the billing code" sounds like engineering vanity, and the product team keeps pushing it to next quarter. Meanwhile, three developers have quit in the past year, and in their exit interviews two of them mentioned the billing codebase as a source of daily frustration.

## The Solution

Using the **code-reviewer**, **coding-agent**, and **report-generator** skills, the agent scans the entire codebase for complexity metrics, cross-references them with git history to find where complexity is actively causing bugs, and produces a prioritized refactoring plan with effort estimates the team can drop straight into sprint planning.

## Step-by-Step Walkthrough

### Step 1: Scan the Complexity Landscape

First, run a full analysis across the codebase:

```text
Analyze the entire ./src directory for code complexity. For each file, calculate cyclomatic complexity, lines of code, function length, nesting depth, and coupling (number of imports/dependencies). Flag anything above industry thresholds.
```

The scan covers 400 files and 60,247 lines. The results break into three tiers:

**Critical -- needs immediate attention:**

| File | Cyclomatic Complexity | Lines | Max Nesting |
|------|----------------------|-------|-------------|
| `src/billing/invoice-engine.js` | 94 | 2,813 | 8 |
| `src/api/middleware/auth.js` | 67 | 1,204 | 7 |
| `src/workers/report-builder.js` | 58 | 1,891 | 6 |

For context, the industry threshold for cyclomatic complexity is 10. A score of 94 means there are 94 independent paths through the code -- effectively untestable and nearly impossible to modify without introducing regressions.

**High complexity -- plan for next quarter:**
- 14 files with cyclomatic complexity above 30
- 23 functions longer than 200 lines
- 8 files with nesting depth above 5

**Coupling hotspots:**
- `src/billing/invoice-engine.js` -- imported by 34 other files (any change here ripples widely)
- `src/utils/helpers.js` -- imported by 89 files (a classic "god module" that everything depends on)

### Step 2: Cross-Reference Complexity with Bug History

Raw complexity scores tell you what is hard to read. The more useful question is: where is complexity actively causing bugs? A complex file that never changes is stable. A complex file that generates bug-fix commits every week is actively costing the team money.

```text
Cross-reference these complexity results with our git log. Which high-complexity files have the most bug-fix commits in the last 6 months? That tells us where complexity is actively causing problems.
```

The correlation between complexity and bug frequency tells a clear story:

| File | Complexity | Bug-Fix Commits (6mo) | Risk Assessment |
|------|-----------|----------------------|-----------------|
| `invoice-engine.js` | 94 CC | 31 | Highest -- complexity is generating bugs |
| `auth.js` | 67 CC | 18 | High -- frequent changes to critical path |
| `helpers.js` | 22 CC | 24 | Surprising -- low complexity but fragile due to 89 dependents |
| `report-builder.js` | 58 CC | 8 | Complex but stable -- rarely touched, low priority |

Two findings stand out. First, `helpers.js` has modest complexity but high bug frequency -- probably because 89 files depend on it, so any change there ripples everywhere. Second, `report-builder.js` scores high on complexity but barely generates bugs because it rarely gets modified. Refactoring priority should follow the bug data, not the complexity score alone.

The numbers make the business case concrete: `invoice-engine.js` accounts for 31 of the last 80 bug-fix commits. That is 39% of all bugs traced back to a single file.

### Step 3: Generate the Refactoring Plan

```text
Create a refactoring plan for the top 3 risk files. For each, suggest specific decomposition strategies, estimate effort in story points, and show a before/after code example for one function.
```

The plan for `invoice-engine.js` -- the file responsible for 39% of all bug-fix commits -- breaks it into five focused modules:

**Decomposition: `invoice-engine.js` (CC: 94 --> target CC: 12)**

1. **Extract `InvoiceCalculator`** (lines 45-380) --> `invoice-calculator.js`
   - 8 functions handling pricing logic and tax computation
   - Estimated: 3 story points

2. **Extract `PaymentProcessor`** (lines 381-890) --> `payment-processor.js`
   - 6 functions for Stripe integration and retry logic
   - Estimated: 5 story points (includes updating the Stripe API surface)

3. **Extract `InvoiceFormatter`** (lines 891-1400) --> `invoice-formatter.js`
   - PDF and CSV generation, template rendering
   - Estimated: 2 story points

4. **Extract `WebhookHandler`** (lines 1401-1800) --> `invoice-webhooks.js`
   - Payment confirmation, failure handling, refund processing
   - Estimated: 3 story points

5. **Remaining orchestration** stays in `invoice-engine.js` (~200 lines)
   - Coordinates the four extracted modules
   - Cyclomatic complexity drops from 94 to approximately 12

**Total effort:** 13 story points across 2 sprints. Medium risk -- requires updating 34 import statements across the codebase. Prerequisite: add integration tests for the billing flow before touching anything. Without tests, refactoring a file this complex is just rearranging risk.

Similar plans are generated for `auth.js` (decompose into auth-middleware, token-service, and session-manager at 8 story points) and `helpers.js` (split into domain-specific utility modules and deprecate the monolith at 5 story points).

### Step 4: Establish a Complexity Baseline

Without a baseline, there is no way to prove refactoring is working. After two sprints of effort, someone will ask "was that worth it?" -- and the answer should come from data, not opinion.

```text
Set up a complexity tracking baseline. Generate a JSON snapshot of all complexity metrics so we can compare after each sprint and measure whether refactoring is actually improving things.
```

The baseline snapshot saves to `metrics/complexity-baseline-2025-02-17.json`:

- **Average file CC:** 14.2
- **Max file CC:** 94 (`invoice-engine.js`)
- **Files over CC 30:** 17
- **Average function length:** 48 lines
- **Longest function:** 312 lines

Adding this check to the CI pipeline -- with an alert when any file crosses CC 40 -- means complexity never silently creeps back up. Every pull request that pushes a file past the threshold gets flagged before it merges. The team stops playing catch-up and starts preventing the problem.

## Real-World Example

Kenji, a tech lead at the startup, needs to justify two sprints of refactoring to the product team. Historically these conversations go nowhere because "we should clean up the code" is not a persuasive argument when there are features to ship and customers to close.

This time he brings data. The scan identifies 3 critical files and 14 high-complexity files in under two minutes. Cross-referencing with git history reveals that `invoice-engine.js` accounts for 31 of the last 80 bug-fix commits -- 39% of all bugs trace back to one file. The refactoring plan breaks the work into 13 story points across 2 sprints, with a projected 40% reduction in billing-area bugs.

Kenji presents the correlation: complexity scores, bug frequency, estimated effort, and projected ROI. The product team approves the two sprints. After refactoring, the next quarter shows a 52% drop in billing-related bugs. New developer onboarding time drops from 3 weeks to 10 days -- because the billing code is no longer a 2,800-line mystery that only two people can safely modify. The CI complexity gate catches three pull requests that would have pushed files back above the threshold, preventing the problem from returning.

## Related Skills

- [fallow](/skills/fallow) — for JavaScript and TypeScript repositories: `fallow health --targets --hotspots` ranks complex functions and refactoring targets, and `fallow audit` gates pull requests on newly introduced complexity.
