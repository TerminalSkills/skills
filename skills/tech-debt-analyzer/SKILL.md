---
name: tech-debt-analyzer
description: >-
  Scans codebases for technical debt signals and prioritizes them by business
  impact. Finds TODO/FIXME/HACK comments, outdated dependencies, code
  duplication, and correlates with git history to identify high-churn debt
  hotspots. Use when someone asks about technical debt, code quality audit,
  refactoring priorities, or maintainability assessment. Trigger words:
  tech debt, code quality, refactoring, TODOs, maintainability, code health.
license: Apache-2.0
compatibility: "Requires git repository with history; supports any language"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "technical-debt, code-quality, refactoring, engineering"
---

# Technical Debt Analyzer

## Overview

This skill identifies and prioritizes technical debt by combining static code analysis with git history. Instead of just finding code smells, it answers the critical question: "Which debt is actually hurting us?" by correlating complexity with change frequency, bug density, and developer contention.

## Instructions

### Step 1: Gather Debt Signals

Scan the codebase for these indicators:

```bash
# TODO/FIXME/HACK markers with context
grep -rn "TODO\|FIXME\|HACK\|XXX\|WORKAROUND" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" --include="*.java" src/

# Outdated dependencies: run only the command that matches the project.
# npm outdated exits non-zero when anything is outdated, so do not chain it with ||
npm outdated
pip list --outdated
go list -m -u all
```

Long functions have no portable one-line metric. Measure them in Step 2 with the complexity counts, or with your language's linter (for example, ESLint's `max-lines-per-function` rule).

### Step 2: Measure Complexity

For each file, estimate cyclomatic complexity:
- Count branching statements (if, else, switch cases, ternary, catch, &&, ||)
- Flag functions with complexity > 15 as high
- Flag files with average complexity > 10 as concerning

### Step 3: Analyze Git History

```bash
# Change frequency per file (last 6 months)
git log --since="6 months ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -30

# Bug-fix correlation (commits mentioning fix/bug/hotfix)
git log -E -i --since="6 months ago" --grep="fix|bug|hotfix" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20

# Developer contention (unique authors per file, last 3 months)
git log --since="3 months ago" --pretty=format:"%an" -- src/checkout/order.ts | sort -u | wc -l
```

### Step 4: Score and Prioritize

Calculate a composite score (0-10) for each debt item:
- **Change frequency** (30%): How often the file is modified
- **Bug density** (30%): How many bug-fix commits reference this file
- **Developer contention** (20%): How many developers work on it weekly
- **Complexity score** (20%): Normalized cyclomatic complexity

Classify into:
- **P0**: Score ≥ 8 — Fix this sprint, it's actively causing pain
- **P1**: Score 5-7.9 — Schedule within the quarter
- **P2**: Score < 5 — Monitor but don't prioritize

### Step 5: Generate Remediation Tickets

For P0 and P1 items, produce structured tickets with:
- Problem description with specific metrics
- Acceptance criteria (measurable)
- Suggested refactoring approach
- Estimated effort in story points (1-13 scale)
- Risk assessment

## Examples

### Example 1: Monorepo Scan

**User prompt:**
```
Analyze our Python Django project for tech debt priorities
```

**Agent output:**
```
Tech Debt Analysis — myproject/ (156 files, 22,400 LOC)

P0 — Fix This Sprint
  views/checkout.py     Score: 9.1  Complexity: 38  Churn: 24/mo  Bugs: 9
    → 340-line process_order() handles payment, inventory, email, logging
    → Recommendation: Extract into OrderProcessor, PaymentHandler, NotificationService

P1 — This Quarter
  models/user.py        Score: 6.8  Complexity: 22  Churn: 12/mo  Bugs: 4
    → User model has 28 methods, some unrelated to user domain
    → Recommendation: Extract ProfileMixin, PreferencesMixin

P2 — Monitor
  utils/legacy_xml.py   Score: 1.3  Complexity: 31  Churn: 0/mo   Bugs: 0
    → Complex but completely stable. Do not refactor.

Debt trend indicator: 📈 Growing (+3 files above threshold vs 3 months ago)
```

### Example 2: Dependency Audit

**User prompt:**
```
Check for outdated and risky dependencies in our Node.js project
```

**Agent output:**
```
Dependency Debt Report
──────────────────────

CRITICAL (security + major version behind)
  lodash          4.17.15 → 4.17.21    3 known vulnerabilities
  express         4.17.1  → 4.21.2     1 moderate CVE

MAJOR VERSION BEHIND
  typescript      4.9.5   → 5.7.3      Breaking changes in 5.x
  jest            27.5.1  → 29.7.0     Migration guide available

MINOR UPDATES (low risk)
  axios           1.6.0   → 1.7.9
  dotenv          16.3.1  → 16.4.7

Recommendation: Address critical items immediately (1-2 hours).
Schedule TypeScript 5.x migration as a dedicated sprint task (2-3 days).
```

## Guidelines

- **Business impact over code purity** — a complex file that never changes and never breaks is NOT high priority debt
- **Data over opinions** — always back prioritization with git metrics, not gut feeling
- **Don't recommend rewriting stable legacy code** — if it works and nobody touches it, leave it alone
- **Include effort estimates** — debt without remediation cost is not actionable
- **Track trends** — a single snapshot is useful; comparing snapshots over time is powerful
- **Respect team context** — note when refactoring requires domain knowledge or coordination across teams
