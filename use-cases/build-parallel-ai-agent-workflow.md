---
title: Build Parallel AI Agent Workflow with Git Worktrees
slug: build-parallel-ai-agent-workflow
description: Use Worktrunk to run multiple AI coding agents in parallel on separate git worktrees and compress a 2-week sprint into days.
skills:
  - worktrunk
category: development
tags:
  - ai-agents
  - git-worktrees
  - parallel-development
  - productivity
  - sprint
---

# Build Parallel AI Agent Workflow with Git Worktrees

## The Problem

Your team has a 2-week sprint backlog with 15 independent tasks. Running one AI coding agent sequentially — task by task — still takes days. You need parallelism, but running multiple agents in the same git repo causes conflicts, stashing headaches, and lost work.

## The Solution

Use Worktrunk to create isolated git worktrees, assign one AI agent per worktree, and run them all simultaneously. Each agent works on its own branch in its own directory. No conflicts, no stashing, no branch switching. Hooks automate dependency installation and test validation before merging.

## Step-by-Step Walkthrough

### Step 1: Configure Worktrunk

```bash
cargo install worktrunk
cd ~/projects/saas-app
```

Create a configuration file:

```toml
# .worktrunk.toml
[hooks]
on_create = "npm install"
pre_merge = "npm test && npm run lint"

[create]
copy = ["node_modules", ".next"]

[paths]
template = "../saas-app.{branch}"
```

### Step 2: Create Worktrees and Launch Agents

```bash
wt switch -c -x "claude --prompt 'Implement Stripe subscription billing with webhook handlers for plan changes'" feat/billing
wt switch -c -x "claude --prompt 'Add role-based access control with admin, editor, and viewer roles'" feat/rbac
wt switch -c -x "claude --prompt 'Build CSV and JSON export for the analytics dashboard'" feat/export
wt switch -c -x "claude --prompt 'Write integration tests for the user auth flow'" feat/auth-tests
wt switch -c -x "claude --prompt 'Add email notification system with SendGrid for invoice events'" feat/notifications
```

Each command creates a new worktree, copies `node_modules` from the main tree, runs `npm install`, and launches Claude Code with the task prompt.

### Step 3: Monitor Progress

```bash
wt list
# feat/billing       ../saas-app.feat/billing       [dirty, ahead 4]
# feat/rbac          ../saas-app.feat/rbac           [dirty, ahead 6]
# feat/export        ../saas-app.feat/export         [clean, ahead 2]
# feat/auth-tests    ../saas-app.feat/auth-tests     [clean, ahead 3]
# feat/notifications ../saas-app.feat/notifications  [dirty, ahead 1]
```

### Step 4: Merge Completed Features

```bash
wt switch feat/export && wt merge     # pre_merge hook runs tests
wt switch feat/auth-tests && wt merge
wt switch feat/rbac && wt merge
wt switch feat/billing && wt merge
wt switch feat/notifications && wt merge
```

The `pre_merge` hook runs `npm test && npm run lint` before each merge. If tests fail, the merge is blocked and you can inspect the issue.

### Step 5: Clean Up

```bash
git push origin main
```

## Real-World Example

Elena, an engineering lead at a SaaS company, faces a 15-task sprint backlog. She breaks tasks into 5 independent batches and uses Worktrunk to launch 5 Claude Code agents in parallel. She configures `on_create = "npm install"` so each worktree is ready to go, and `pre_merge = "npm test"` to gate merges on passing tests. Within 4 hours, 3 of 5 agents complete their tasks with passing tests. She merges those immediately. By end of day, all 5 are done — feat/export (CSV export with date filtering), feat/rbac (3 roles with middleware guards), feat/billing (Stripe webhooks for plan changes), feat/auth-tests (12 integration tests), and feat/notifications (SendGrid transactional emails). She runs a final integration test suite on main, fixes one conflict between RBAC middleware and the billing routes, and pushes. What would have been a 2-week sprint is shipped in 2 days.

## Related Skills

- [worktrunk](/skills/worktrunk) — Git worktree management CLI for parallel workflows
