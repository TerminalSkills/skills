---
title: "Automate Open Source Contribution Workflow with AI"
slug: automate-open-source-contribution-workflow
description: "Find good-first-issues, read each project's contributing rules (sign-off, branch, tests), and prepare PRs across open source projects using AI agents."
skills: [github, code-reviewer, coding-agent]
category: development
tags: [open-source, github, contributions, pull-requests, automation]
---

# Automate Open Source Contribution Workflow with AI

## The Problem

Dani's engineering team wants to contribute to the open source projects they depend on: the Next.js edge case they keep working around, a Prisma behavior that surprised them, a React issue that has been bothering them for months. But nobody has time to trawl through issue trackers, read three contribution guides, work out each project's sign-off rule, and prepare PRs for repos with different conventions.

Most contribution attempts stall not because the code is hard but because the overhead of getting started is high. The rules differ more than people expect, and they change. At the time of writing, `vercel/next.js` asks for GitHub-verified signed commits and branches from `canary`; `prisma/prisma` (whose current contributing guide covers Prisma 8) requires a Developer Certificate of Origin sign-off on every commit and works from `main`; React's contribution guide asks for a Contributor License Agreement and branches from `main`. A PR that misses one of these rules sits blocked. The team has a Slack channel called `#upstream-fixes` with a dozen bookmarked issues that nobody has touched in months.

## The Solution

Using the **github** skill (the `gh` CLI) to search issues, clone, and open PRs, the **coding-agent** skill to implement the fix in a background agent run, and the **code-reviewer** skill to check the diff against the project's own checklist, the agent handles the tedious parts: finding issues, reading CONTRIBUTING files, extracting the sign-off rules, locating the right files in an unfamiliar monorepo. The developer stays in charge of the judgment calls and of the PR text, which several projects now require to be human-written.

## Step-by-Step Walkthrough

### Step 1: Find Suitable Issues in Your Dependency Graph

Start by telling the agent which projects matter to the team:

```text
Search for open issues labelled "good first issue" with no assignee in vercel/next.js and facebook/react. For prisma/prisma, which has no such label, list recent open issues that mention the component I care about. Show number, title, age, and comment count.
```

The agent runs searches with `gh`. Run `gh auth login` once first; `gh search` needs an authenticated session:

```bash
gh search issues --repo vercel/next.js --label "good first issue" --no-assignee --state open \
  --sort created --json number,title,createdAt,commentsCount,labels,url
```

`--no-assignee` is the filter that matters. Nothing is more frustrating than spending two hours on a fix and finding that someone claimed the issue last week. Check each repo's labels before relying on one: React uses `good first issue` and marks claimed ones `good first issue (taken)`, while `prisma/prisma` has no `good first issue` label at all, so search by keyword or component there instead.

### Step 2: Review the Prioritized Results

Expect fewer fresh results than you would hope for. When this page was last checked, `vercel/next.js` had only 10 open, unassigned `good first issue` items, and the ones returned first were years old with dozens of comments (for example #53473, opened in 2023, 80 comments). Rank what comes back yourself, or ask the agent to:

- **Prefer few comments and a clear reproduction.** A long thread usually means the maintainers have not agreed on the approach, and a PR sent before consensus sits in limbo.
- **Prefer recent activity.** An issue untouched for two years may be stale, already fixed, or blocked on a design decision.
- **Documentation fixes are the safest first PR.** They are small, easy to verify, and build goodwill. Next.js is more open to docs-only changes than to trivial code churn: its contributing guide says typo, formatting, and style PRs outside `docs/` are likely to be closed.
- **Features need agreement first.** Next.js asks for a discussion in the `ideas` category before a feature PR; Prisma asks for an issue first for anything substantive.

### Step 3: Analyze the Contribution Requirements

Dani picks one issue. Before writing code, she needs to know what the project expects:

```text
I want to work on vercel/next.js issue <number>. Read contributing.md, contributing/core/developing.md, contributing/core/testing.md, and .github/pull_request_template.md on the canary branch, and list what I must do before submitting a PR.
```

This is where most first-time contributors lose an hour. The agent reads the files with `gh api` or the raw GitHub URLs and returns a checklist.

### Step 4: Review the Contribution Checklist

For `vercel/next.js`, the files above say:

- **Sign-off:** commits must carry a GitHub-verified signature (GPG, SSH, or S/MIME key). A `Signed-off-by` line is explicitly not enough. Configure signing before the first commit, for example for an SSH key: `git config gpg.format ssh`, `git config user.signingkey ~/.ssh/id_ed25519.pub`, `git config commit.gpgsign true`, and add the key to your GitHub account as a signing key. Unsigned commits must be re-signed and force-pushed.
- **Branch:** the development branch is `canary`, and all pull requests target it.
- **Setup:** `pnpm` through Corepack (`corepack enable pnpm`), `pnpm install`, then `pnpm dev`; run `pnpm types` in another terminal to compile declaration files.
- **Tests:** a bug fix needs a test. Create it with `pnpm new-test`, which uses the `nextTestSetup` helper; new tests go under `test/e2e`, `test/development`, `test/production` or `test/unit`, in TypeScript, and the guide says not to add new suites under the historical `test/integration`. Run one with `pnpm test-dev <path>` or `pnpm test-start <path>`.
- **Lint and format:** `pnpm lint`, and `pnpm lint-fix` to auto-fix (ESLint, Prettier, alex).
- **PR description:** the PR template says descriptions from external contributors must be written by a human, so use the agent for research and code but write the description yourself, and link the issue with `fixes #number`.

For the other two projects the differences are what the agent should flag:

- **Prisma** (`prisma/prisma`, contributing guide for Prisma 8): sign off every commit with `git commit -s` (a DCO status check fails otherwise; this is not a CLA), use a conventional-commit PR title such as `fix(client): ...`, run `pnpm typecheck && pnpm lint && pnpm test:packages` before pushing, and open an issue first for anything substantive. Prisma 7 fixes go to the `v7` branch.
- **React** (`facebook/react`): its contributing guide links to a legacy guide that says to branch from `main`, run `yarn test`, `yarn lint`, and `yarn flow`, and complete the Contributor License Agreement once. Confirm the CLA step in the PR checks, since this guide has moved.

### Step 5: Implement the Fix

With the requirements clear, hand the implementation to a background coding agent, as the **coding-agent** skill describes. Fork and clone first (`gh repo fork vercel/next.js --clone` creates your fork and sets up the remotes), create a branch, and give the agent a narrow task and narrow permissions:

```bash
git switch --create fix/issue-NNNNN canary
LOG=$(mktemp /tmp/claude-agent.XXXXXX)
claude -p "Fix the bug described in issue NNNNN (summary: <paste the reproduction>). Add a test with pnpm new-test following contributing/core/testing.md. Touch only the files needed. Do not commit." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Write" "Bash(pnpm test-dev *)" "Bash(pnpm lint-fix)" \
  --max-budget-usd 5 \
  --output-format text > "$LOG" 2>&1 &
AGENT_PID=$!
```

In print mode nobody can answer permission prompts, so every tool the task needs must be on the allow list; commits, pushes, and installs stay with you. When the agent exits (`wait $AGENT_PID`), run the project's own checks yourself and read the diff. The agent's work is a draft, not a result, until the new test fails without the fix and passes with it.

### Step 6: Review Before You Push

Ask the **code-reviewer** skill to review the diff against the checklist from Step 4:

```text
Review `git diff canary` as a maintainer of vercel/next.js would. Check correctness, test coverage, unrelated changes, and the PR template items. Report by severity.
```

Then commit with signing enabled (`git commit -S -m "..."`, or `git commit -s` for Prisma), push to your fork, and open the PR yourself:

```bash
git push --set-upstream origin fix/issue-NNNNN
gh pr create --repo vercel/next.js --base canary --title "<short title>" --body-file pr-description.md
gh pr checks --watch
```

`pr-description.md` is the text you wrote against the template. `gh pr checks --watch` follows CI and the sign-off checks; if one fails, fix the cause and push again.

### Step 7: Comment on the Issue Before Opening the PR

Leave a comment on the issue before opening the PR, or earlier if the fix will take days: "I'd like to work on this. The bug is in X; I have a fix and a test in progress." Next.js says you do not need permission to work on an issue, and React asks you to read the thread to see whether someone is already on it (a claim with no follow-up for two weeks may be taken over, with a comment). The comment avoids duplicate work, tells maintainers the issue is alive, and gives them a chance to redirect you before you invest more time.

## Real-World Example

Dani's team has a 15-line workaround in their codebase for a documented edge case that the Next.js docs get wrong. She asks the agent to search `vercel/next.js` for matching issues and to read the contributing files. The agent reports the signed-commit requirement, the `canary` base branch, and the human-written PR description rule. Dani sets up SSH commit signing, then has a background agent draft the docs correction and the code-reviewer skill check it against the docs contribution guide.

She reads the diff, writes the description herself, and opens the PR with `gh pr create`. The setup that used to eat an afternoon (finding the guide, finding out about signing, finding the right branch) is now a checklist the agent produces in a few minutes. The team repeats the routine for the other dependencies, each time with that project's own rules instead of one assumed template.
