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

Code review is a bottleneck in most teams. A thorough review checks style, test coverage, security and performance, but a human reviewer usually holds one or two of those lenses at a time. The security-minded engineer catches the injection bug but misses the N+1 query, and the performance-minded one catches the N+1 but not the missing authorization check. PRs get approved with blind spots, and the team finds the problems in staging, or in production.

Picture a 6-person team opening about 30 PRs a week, where two senior engineers do most of the reviewing. Every PR waits in their queue, and the authors lose context while they wait.

## The Solution

Using the **code-reviewer**, **security-audit**, **performance-reviewer**, and **test-generator** skills, the agent runs four review passes over a PR's diff (code quality, security, performance, test coverage) and produces one consolidated report. Each dimension has its own pass, so a security finding is not buried under style nits.

Install the four skills into the repository, for example with `npx terminal-skills install code-reviewer --agent claude-code` (repeat for the other three). That writes them to `.claude/skills/` in the current project; commit that folder so the CI checkout in Step 5 contains them.

An AI review is a first pass that catches the mechanical problems before a person looks. It does not replace the human reviewer, who still owns design and the decision to merge.

## Step-by-Step Walkthrough

### Step 1: Kick Off a Full Review

Point the agent at a PR branch:

```text
Review the PR on branch feature/user-permissions against main. Check everything: style, security, performance, and test coverage. Give me one consolidated report.
```

The agent reads the diff with `git diff main...feature/user-permissions` (or `gh pr diff <number>`) and runs each skill's checklist over the changed files.

### Step 2: Four-Dimensional Analysis of the Diff

The review comes back organized by dimension. Here is what a `feature/user-permissions` branch (14 files changed, +487 -92) might reveal:

**Code Quality** (via code-reviewer):

- `src/middleware/auth.ts:23` — Nested ternary reduces readability. Should be extracted to a named function like `resolvePermissionLevel(role, resource)`.
- `src/models/Permission.ts:45-67` — Switch statement with 12 cases and duplicated logic. A permission map (`Record<Role, Permission[]>`) would cut this to 12 lines and make it trivial to add new roles.
- Naming conventions consistent across the PR. No unused imports detected.

**Security** (via security-audit):

- **CRITICAL** `src/api/users.ts:34` — User ID taken from request body without verifying it matches the authenticated user. This allows horizontal privilege escalation: anyone with a valid token can `PUT /api/users/other-user-id` and modify another account.

```typescript
// Vulnerable — user controls which account gets modified
const userId = req.body.userId;
await updateUser(userId, req.body.changes);

// Fixed — user ID comes from the verified auth token
const userId = req.auth.userId;
await updateUser(userId, req.body.changes);
```

- **WARNING** `src/middleware/auth.ts:15` — The permission check compares role strings (`role === "admin"`). A typo such as `"admnin"` compiles and never matches, so the check silently denies the right people, or, if the condition is written the other way round, lets the wrong ones through. A string-literal union type or an enum turns the typo into a compile error.

This is the kind of vulnerability that is easy to miss in a skim. The logic looks right at a glance: there is an `if`, the names make sense. But the data flow is wrong, because the user controls the ID being checked.

**Performance** (via performance-reviewer):

- **WARNING** `src/api/users.ts:52` — Loading all permissions for a user with a query per role (N+1). With 5 roles assigned, that is 6 queries per request.

```typescript
// N+1 — one query per role
for (const role of user.roles) {
  const perms = await db.permissions.findByRole(role.id);
  // ...
}

// Fixed — single query
const perms = await db.permissions.findByRoles(user.roles.map(r => r.id));
```

At 100 requests per second, that is 600 queries per second where 100 would do. Not a problem at current scale, but it will become one.

- **INFO** `src/api/teams.ts:78` — Sequential awaits for fetching team members and permissions. `Promise.all()` would run them in parallel and cut the latency to the slower of the two calls.

**Test Coverage** (via test-generator):

- **CRITICAL** No tests for the new permission middleware. Authorization logic without tests is a liability. The agent detects the project's test framework (Jest or Vitest, from `package.json`) and generates `tests/middleware/auth.test.ts` with 8 cases: admin access, member access, unauthenticated requests, expired tokens, invalid roles, resource-level permissions, cross-tenant access, and role inheritance.
- **WARNING** `src/api/users.ts` — Existing tests don't cover the new permission check on the update endpoint. Three cases added to `tests/api/users.test.ts`.

Run the generated tests yourself: they are a draft that has to pass and assert something meaningful before they count.

**Summary: 1 critical security issue, 1 critical test gap, 3 warnings, 1 info.**

The two critical findings are the takeaway. The privilege escalation would let any authenticated user modify any other user's account, and the missing tests mean a future PR could reintroduce it unnoticed. Both need to be resolved before merge.

### Step 3: Fix Critical Issues and Re-Review

After addressing the privilege escalation and adding tests:

```text
I fixed the privilege escalation and added the permission middleware tests. Can you re-review just the changed files?
```

The re-review of the three changed files comes back clean on the critical items:

- **Security** — Privilege escalation fixed. `req.auth.userId` is now used, and the handler rejects requests where the path parameter doesn't match the authenticated user.
- **Tests** — The permission middleware has 8 tests, all passing, with the coverage report from your test runner confirming the new lines are exercised.
- **Remaining** — The N+1 query on user permissions is still there. It is a warning, not a blocker at current scale, and goes into a follow-up issue.

**Verdict: safe to merge** once a human reviewer agrees.

### Step 4: Get a Merge-Ready Summary

```text
Write a review summary I can post on the PR.
```

The summary is ready to paste into the PR comment:

**Status: Approved by automated review, pending human review**

**What this PR does:** Adds a role-based permission system with middleware for route-level authorization, updated user and team API endpoints, and a permissions model.

**Review findings (resolved):**
- Fixed horizontal privilege escalation in the user update endpoint: user ID now sourced from the auth token, not the request body
- Added 11 tests for the permission middleware and user API

**Follow-up items:**
- Optimize permission loading query (N+1, low priority at current scale)
- Replace role strings with a TypeScript enum for type safety

Reviewed: code quality, security, performance, test coverage.

### Step 5: Run It on Every Pull Request

To have the review start without anyone asking, run the agent in CI. Anthropic publishes `anthropics/claude-code-action` for this (v1 takes a `prompt` and `claude_args`; see its [solutions guide](https://github.com/anthropics/claude-code-action/blob/main/docs/solutions.md)). This workflow follows the guide's automatic-review example (the `confirmed: true` matters: the action holds back inline comments without it and classifies them before posting):

```yaml
name: PR review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            Review this pull request with the code-reviewer, security-audit,
            performance-reviewer and test-generator skills. Report findings by
            severity, one section per skill. The PR branch is already checked
            out. Use `gh pr comment` for the summary and
            `mcp__github_inline_comment__create_inline_comment` (with
            `confirmed: true`) for specific lines. Only post GitHub comments.
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"
```

Keep the allowed tools narrow, as above: a PR is untrusted input, and its text and code can try to steer the agent. Store the API key as a repository secret, never in the file. Secrets are not passed to workflows triggered by pull requests from forks, so fork PRs need the handling described in the action's [security docs](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) instead of a broader trigger.

## Real-World Example

Priya leads a 6-person team at a 30-person B2B SaaS startup. Their PRs average two days from open to merge, because two senior engineers are the only ones who reliably catch security and performance issues. She adds the workflow above to the repository, so every PR opened against `main` gets the four-pass review within minutes.

The first real test is a junior developer's PR adding an endpoint that exports user data. The agent flags an SQL injection in the query builder, a missing rate limit on the export endpoint, and 6 missing test cases. The author fixes them before a human opens the PR, so the senior engineer reviews a cleaner diff and spends the time on design and architecture instead of hunting for injections and null checks.

Priya tracks time-to-merge and the number of security findings caught before human review, comparing a month before the workflow with a month after. Those numbers are her team's to measure; yours will depend on your codebase and how you tune the prompts. The senior engineers still review every PR.

## Related Skills

- **code-reviewer**: style, naming and correctness pass over the diff
- **security-audit**: finds authorization gaps, injection and secrets in the changed code
- **performance-reviewer**: flags N+1 queries, sequential awaits and similar regressions
- **test-generator**: finds untested changes and drafts the missing tests
