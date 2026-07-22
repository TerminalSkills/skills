---
title: "Run an Automated Code Quality and Performance Audit"
slug: run-automated-code-quality-audit
description: "Identify complexity hotspots, performance bottlenecks, and technical debt across a codebase with automated analysis and prioritized remediation."
skills:
  - code-reviewer
  - code-complexity-scanner
  - performance-reviewer
  - tech-debt-analyzer
category: development
tags:
  - code-quality
  - complexity
  - performance
  - technical-debt
---

# Run an Automated Code Quality and Performance Audit

## The Problem

Your codebase has grown to 120,000 lines over three years. The team knows certain modules are problematic -- deployments touching the billing service always cause anxiety -- but nobody has a clear picture of where the worst code lives. A new developer joins and asks which areas need the most attention. The answer is a shrug and "the billing folder, probably." Without data, prioritization is guesswork. Refactoring efforts target whatever annoyed someone most recently rather than what would deliver the most value.

## The Solution

Use **code-complexity-scanner** to identify the most convoluted functions and modules, **performance-reviewer** to find runtime bottlenecks and memory issues, **code-reviewer** to assess code quality and maintainability patterns, and **tech-debt-analyzer** to quantify debt and produce a prioritized remediation backlog.

## Step-by-Step Walkthrough

### 1. Scan for complexity hotspots

Find the functions that are hardest to understand and most likely to contain bugs.

> Scan our src/ directory for cyclomatic complexity. Show me the top 20 most complex functions with their file paths, line counts, and complexity scores. Flag anything above 15 as high risk. Group results by module so we can see which areas are most affected.

The scanner reveals that 80% of the complexity is concentrated in three modules: billing (14 functions above threshold), permissions (8 functions), and the legacy import pipeline (6 functions).

The scanner produces a ranked report like this:

```text
Complexity Hotspot Report — src/
=================================
Module              Functions > 15    Avg Complexity    Max Complexity
billing/            14                23.4              41
permissions/        8                 18.7              32
import-pipeline/    6                 17.2              28
notifications/      2                 16.1              19

Top 5 Functions by Cyclomatic Complexity:
  1. billing/invoice.ts:calculateLineItems()        complexity=41  lines=312
  2. billing/discount.ts:applyStackedDiscounts()     complexity=38  lines=274
  3. permissions/resolver.ts:evaluatePolicy()        complexity=32  lines=198
  4. import-pipeline/csv.ts:parseLegacyFormat()      complexity=28  lines=245
  5. import-pipeline/transform.ts:normalizeRows()    complexity=26  lines=189

28 functions exceed threshold (complexity > 15)
80% of high-complexity code concentrated in 3 of 22 modules
```

### 2. Profile runtime performance issues

Complexity does not always correlate with performance problems. A simple function called 10,000 times matters more than a complex function called once.

> Review our API endpoints for performance issues. Check for N+1 database queries, missing indexes, synchronous operations that should be async, and memory leaks in long-running processes. Focus on the endpoints with the highest traffic: GET /api/orders, POST /api/checkout, and GET /api/products.

The performance review uncovers that the checkout endpoint makes 47 database queries per request due to N+1 problems in the discount calculation loop. Each cart item triggers a separate query to check applicable discounts, then another to verify inventory. The orders listing endpoint does a sequential scan on a 2.3 million row table because the composite index on (order_date, status) was never created.

### 3. Assess overall code quality patterns

Look beyond individual functions to systemic quality issues.

> Review the codebase for code quality patterns: inconsistent error handling, missing input validation, hardcoded configuration values, duplicated business logic, and dead code. Estimate the maintenance cost of each issue category in developer hours per month.

### 4. Generate a prioritized tech debt backlog

Combine all findings into an actionable remediation plan ordered by impact.

> Take the complexity hotspots, performance issues, and code quality findings and create a prioritized tech debt backlog. Rank by impact (how many users or developers are affected), effort (hours to fix), and risk (likelihood of causing a production incident). Output as a markdown table I can import into our project tracker.

## Real-World Example

A fintech team of eight engineers inherited a codebase where every sprint felt slower than the last. The code quality audit revealed that the billing module had an average cyclomatic complexity of 23 -- nearly double the industry threshold. The performance review found that the checkout endpoint was making 47 database queries per request due to N+1 problems in the discount calculation. The tech debt analyzer estimated the team was spending 15 hours per week working around accumulated debt. Armed with this data, the engineering manager secured two sprints of dedicated refactoring time. The team reduced checkout queries from 47 to 4, cut the billing module's complexity by 60%, and sprint velocity increased 25% in the following quarter.

## Tips

- Run the full audit quarterly, not just once. Codebases accumulate debt continuously, and a quarterly scan catches regressions before they compound.
- Start with the complexity scan because it is the fastest to run and gives immediate visibility into where problems cluster.
- Use the tech debt backlog output directly as sprint planning input. Prioritize items that overlap high complexity and high traffic -- those deliver the most improvement per hour invested.
- Track the total number of functions above the complexity threshold over time as a health metric. It should decrease or hold steady sprint over sprint.
