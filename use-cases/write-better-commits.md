---
title: "Generate Precise Commit Messages and Accelerate Code Reviews by 60%"
slug: write-better-commits
description: "Automatically analyze code changes to create meaningful commit messages and improve team collaboration through better git history."
skills: [git-commit-pro, code-reviewer, commitlint, husky, github-actions]
category: development
tags: [git, commits, code-review, workflow, automation, collaboration]
---

# Generate Precise Commit Messages and Accelerate Code Reviews by 60%

## The Problem

Dani runs a 31-person software company, and the git history reads like a crime scene. The repo has 3,247 commits -- a solid majority of which say things like "fix stuff", "update", "wip final", and "FINALLY WORKS!!!" When production breaks at 2 AM, engineers spend 45 minutes just deciphering what changes might have caused the issue before they can even start debugging.

The math is brutal: 8 engineers averaging 23 commits per week, with roughly 12 minutes wasted per unclear commit trying to understand context. That's 22 hours of engineering time per week -- more than half a full-time salary -- lost to poor commit hygiene. Last month proved the real cost: a 3-hour production outage traced back to a "quick fix" commit from two weeks prior. Nobody could identify what the change was supposed to do without reading the entire diff line by line. Customer impact: $47,000 in lost revenue and 23 support tickets.

Code reviews compound the problem. Reviewers spend more time asking "what does this change do?" than actually reviewing logic. Average PR review time is 6.7 hours from submission to approval -- the target is 2.5. Two-thirds of review comments are requests for clarification rather than technical feedback. New team members take 40% longer to ramp up because the code history tells them nothing.

## The Solution

Using the **git-commit-pro**, **code-reviewer**, **commitlint**, **husky** and **github-actions** skills, Dani overhauls the team's commit workflow: the agent reads staged changes and writes conventional commit messages, reviews them before the commit, a husky `commit-msg` hook runs commitlint locally, a GitHub Actions job runs the same check on every pull request, and a phased adoption plan gets buy-in without slowing anyone down.

## Step-by-Step Walkthrough

### Step 1: Analyze Staged Changes and Generate a Commit Message

Dani starts with a real change -- the RBAC middleware a senior engineer just finished. Instead of the usual "add auth stuff" commit, the engineer asks the agent to look at what's actually staged:

```text
Analyze my staged changes and generate a conventional commit message that explains what changed and why.
```

The analysis breaks down every file and its role in the change:

**Staged changes detected:**

| File | Changes | Purpose |
|---|---|---|
| `src/auth/middleware.ts` | +47, ~12, -3 | Core RBAC permission checking logic |
| `src/auth/types.ts` | +23 (new file) | `UserRole` and `Permission` type definitions |
| `tests/auth/middleware.spec.ts` | +89 | 3 test suites, 23 test cases (94% coverage) |
| `docs/api/authentication.md` | ~15 | Updated API docs with RBAC examples |

**Change analysis:**
- **Purpose:** Implement role-based access control system
- **Scope:** Authentication middleware expansion, new type definitions
- **Breaking changes:** None detected (backward compatible)
- **Dependencies:** Added `jsonwebtoken@^9.0.0`, removed deprecated `auth-helpers`

**Generated commit message:**

```text
feat(auth): implement role-based access control middleware

Add RBAC system with permission checking for route-level authorization.
Includes admin/editor/viewer role hierarchy and configurable permissions.

- Add RoleMiddleware with permission validation logic
- Create UserRole and Permission type definitions
- Implement role hierarchy checking (admin > editor > viewer)
- Add comprehensive test suite with 94% coverage
- Update API documentation with RBAC examples

Closes #156, addresses security requirements from audit
```

Compare that to "add auth stuff." A reviewer reading this commit message immediately knows the scope, the motivation, and what to look for in the diff. Six months from now, when someone runs `git log --grep="RBAC"`, they'll find exactly this commit.

### Step 2: Pre-Commit Quality Validation

Good commit messages describe what changed; pre-commit validation makes sure what changed is actually good. Before the commit goes through, the engineer runs the changes through the code reviewer:

```text
Review the changes before committing to catch potential issues and ensure code quality standards.
```

The review comes back with a structured assessment:

**Quality checks:**
- **Code style:** Follows team ESLint rules, TypeScript strict mode enabled
- **Security:** No hardcoded secrets, proper input validation, JWT handling is secure
- **Performance:** O(1) role lookup via Map, minimal overhead on auth pipeline
- **Testing:** Edge cases covered, mocking strategy appropriate
- **Documentation:** Consider adding JSDoc comments to public methods (minor)

**Issues identified:**
- `auth/middleware.ts:34` -- Role permissions are looked up on every request. For high-traffic apps, consider caching the permission map. Not blocking, but worth a follow-up PR.
- `auth/types.ts:12` -- `UserRole` enum could be a string union type for better TypeScript inference. Stylistic, not functional.

**Scope:** 4 files, all inside the auth module; 3 new exports, no change to existing public signatures.

**Verdict:** Safe to commit. The caching optimization is a good idea but belongs in a separate PR.

This catches the kind of thing that normally surfaces 4 hours into a code review -- or worse, in production.

### Step 3: Enforce Conventional Commits Across the Team

One engineer writing good commits doesn't fix the repo. Dani needs the whole team on board. The first step is understanding how bad things actually are:

```text
Ensure all team commits follow conventional format and integrate with CI/CD for automated changelog generation.
```

An audit of the last 50 commits tells the story:

| Metric | Current State |
|---|---|
| Non-conventional format | 67% ("fix stuff", "update", "wip") |
| Missing scope | 34% (`feat: add feature` instead of `feat(auth): add feature`) |
| No body text | 78% (zero context or rationale) |
| No issue references | 89% (can't link changes to requirements) |

The fix is tooling plus process. A `commit-msg` hook, installed with husky v9, runs commitlint on every message, so the "fix stuff" commits are rejected before they enter the repo (the commitlint config needs Node.js 22.12 or newer):

```console
$ npm install -D @commitlint/cli @commitlint/config-conventional husky
$ npx husky init
$ echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

`npx husky init` also writes `npm test` into `.husky/pre-commit` and adds `"prepare": "husky"` to `package.json`, which activates the hooks for each teammate on `npm install`. Edit the pre-commit file if the repo has no tests. The rules go in `commitlint.config.mjs`:

```javascript
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', ['auth', 'api', 'ui', 'db']],
    'header-max-length': [2, 'always', 72],
  },
}
```

The preset requires a type from `build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test`, a non-empty lowercase subject without a trailing period, and body lines of 100 characters or fewer; the three rules above add a mandatory scope from the team's list and a 72-character header. Trying it:

```console
$ echo "fix stuff" | npx commitlint
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
✖   scope may not be empty [scope-empty]
$ echo "feat(auth): implement role-based access control middleware" | npx commitlint && echo ok
ok
```

Nothing here slows down a developer who already writes good messages. Hooks can be skipped with `git commit --no-verify`, so the pull request check in the next step is the real enforcement.

### Step 4: Wire It Into CI

The same check runs on every pull request, using the pattern from the **github-actions** skill:

```yaml
# .github/workflows/commitlint.yml
name: commitlint
on: [pull_request]
permissions:
  contents: read
jobs:
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```

Mark the job as a required status check in the branch protection rules and a pull request with non-conventional commits cannot merge. If the team squash-merges, lint the pull request title instead of the individual commits.

Once every message follows the format, release tooling can use it: `feat` maps to a minor version, `fix` to a patch, and `feat!` or a `BREAKING CHANGE:` footer to a major one. Tools such as release-please, semantic-release or changesets read that history to propose versions and write the changelog, so nobody maintains `CHANGELOG.md` by hand. commitlint itself only checks messages.

### Step 5: Team Adoption Without the Revolt

Tooling enforcement without team buy-in creates resentment. Dani rolls out the change in phases:

**Week 1:** Share the audit results with the team. The numbers do the convincing -- 22 hours/week lost, $47,000 incident, 6.7-hour review times. No one argues with the data.

**Week 2:** Install the husky hook and provide a conventional commits cheat sheet. The agent generates example messages from actual recent PRs so engineers see what their own changes would look like with proper messages.

**Week 3:** Make the CI check required. By now most engineers are already writing conventional commits because the hooks have been training them for a week.

**Week 4:** Add release tooling that builds the changelog from the commit history, so release notes stop being a manual job.

Dani's team tracks four numbers from its own history and review tool; these are the example team's figures:

| Metric | Before | After 4 Weeks |
|---|---|---|
| Conventional commit adoption | 23% | 91% |
| Average PR review time | 6.7 hours | 2.8 hours |
| Time to identify problematic commits | 45 minutes | 12 minutes |
| Developer satisfaction (git workflow) | 5.2/10 | 8.4/10 |

## Real-World Example

Dani's team ran the audit on Monday and showed the engineers what their own recent changes would have looked like with proper messages. The hook went in that week. Within a month the `git log` and `git blame` output pointed at commits that said what they did, reviewers stopped opening pull requests with "what does this do?", and the incident two weeks later was traced to its commit in minutes rather than an hour. The figures in this page are the example team's own; yours will differ, so run the audit on your history first.

## Related Skills

- [git-commit-pro](/skills/git-commit-pro): writes the conventional commit message from the staged diff
- [code-reviewer](/skills/code-reviewer): reviews the change before it is committed
- [commitlint](/skills/commitlint): the rules that reject non-conventional messages
- [husky](/skills/husky): installs the `commit-msg` hook for every teammate
- [github-actions](/skills/github-actions): runs the commit check on every pull request
