---
title: "Automate PR Reviews for Style, Tests, Security, and Performance in One Pass"
slug: automate-pr-review-workflow
description: "Run a comprehensive AI-powered PR review covering code style, test coverage, security vulnerabilities, and performance issues in a single pass."
skills: [code-reviewer, security-audit, performance-reviewer, test-generator]
category: development
tags: [code-review, pull-request, security, performance, testing]
---

# Automate PR Reviews for Style, Tests, Security, and Performance in One Pass

## The Problem

Code reviews are the biggest bottleneck in most development teams. A thorough review requires checking style consistency, test coverage, security vulnerabilities, and performance implications — but most reviewers only catch one or two of these. Senior engineers spend 5-10 hours per week reviewing PRs, and things still slip through. The result: slow merge cycles, missed security issues, and performance regressions that surface in production.

## The Solution

An AI agent runs four review passes on every PR — code quality, security, performance, and test coverage — then produces a single consolidated report. Using `code-reviewer`, `security-audit`, `performance-reviewer`, and `test-generator`, you get review depth that would take a senior engineer an hour compressed into minutes.

```bash
npx terminal-skills install code-reviewer security-audit performance-reviewer test-generator
```

## Step-by-Step Walkthrough

### 1. Kick off a full review

Point the agent at a PR branch:

```text
Review the PR on branch feature/user-permissions against main. Check everything: style, security, performance, and test coverage. Give me one consolidated report.
```

### 2. The agent analyzes the diff across all dimensions

```text
Reviewing feature/user-permissions (14 files changed, +487 -92)

═══ CODE QUALITY (code-reviewer) ═══
⚠ src/middleware/auth.ts:23 — Nested ternary reduces readability. Extract to
  a named function like `resolvePermissionLevel(role, resource)`.
⚠ src/models/Permission.ts:45-67 — This switch statement has 12 cases with
  duplicated logic. Consider a permission map: Record<Role, Permission[]>.
✓ Naming conventions consistent. No unused imports detected.

═══ SECURITY (security-audit) ═══
🔴 src/api/users.ts:34 — User ID taken from request body without verifying
   it matches the authenticated user. Allows horizontal privilege escalation:
   PUT /api/users/other-user-id with a valid token.
   Fix: Replace req.body.userId with req.auth.userId
🟡 src/middleware/auth.ts:15 — Permission check uses string comparison
   (role === "admin") instead of an enum. Typo would silently fail open.

═══ PERFORMANCE (performance-reviewer) ═══
🟡 src/api/users.ts:52 — Loading all permissions for a user with a query per
   role (N+1). With 5 roles assigned, that's 6 queries per request.
   Fix: Single query with JOIN or IN clause.
ℹ src/api/teams.ts:78 — Sequential awaits for fetching team members and
   permissions. Use Promise.all() to parallelize — saves ~200ms per request.

═══ TEST COVERAGE (test-generator) ═══
🔴 No tests for the new permission middleware. This is the most critical
   code in the PR — authorization logic must have test coverage.
   Generated test file: tests/middleware/auth.test.ts (8 test cases)
🟡 src/api/users.ts — existing tests don't cover the new permission check
   on the update endpoint. Added 3 test cases to tests/api/users.test.ts.

Summary: 1 critical security issue, 1 critical test gap, 3 warnings, 2 info.
```

### 3. Fix the critical issues and re-review

```text
I fixed the privilege escalation and added the permission middleware tests. Can you re-review just the changed files?
```

```text
Re-reviewing 3 changed files...

✅ Security: Privilege escalation fixed — req.auth.userId now used correctly.
✅ Tests: Permission middleware has 8 tests, all passing. Coverage: 94%.
⚠ Remaining: The N+1 query on user permissions is still there (warning).

Verdict: Safe to merge. The N+1 is a follow-up optimization, not a blocker
at current scale (< 1000 users). Created issue suggestion for tracking it.
```

### 4. Get a merge-ready summary

```text
Write a review summary I can post on the PR.
```

```text
## Review Summary

**Status: Approved** ✅

### What this PR does
Adds role-based permission system with middleware for route-level authorization.

### Review findings (resolved)
- Fixed horizontal privilege escalation in user update endpoint
- Added 11 tests for permission middleware and user API (94% coverage)

### Follow-up items
- [ ] Optimize permission loading query (N+1, low priority at current scale)
- [ ] Migrate role strings to TypeScript enum for type safety

Reviewed: code quality, security, performance, test coverage.
```

## Real-World Example

Priya leads a 6-person engineering team at a 30-person B2B SaaS startup. Their PR review process averages 2 days from open to merge because the two senior engineers are the bottleneck — they're the only ones who reliably catch security and performance issues.

1. Priya configures the AI agent to run on every PR opened against `main`, reviewing across all four dimensions
2. A junior developer opens a PR adding a new API endpoint for exporting user data. The agent flags an SQL injection vulnerability in the query builder, a missing rate limit, and generates 6 missing test cases — all within 3 minutes
3. The junior developer fixes the issues before any human reviewer sees the PR. When Priya reviews it, the security and performance concerns are already addressed
4. Over the first month, average time-to-merge drops from 2 days to 6 hours. Security issues caught before human review increase from ~30% to 95%
5. The senior engineers now spend review time on architecture and design decisions instead of catching SQL injections and missing null checks
