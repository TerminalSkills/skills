---
title: Run a Kanban Task Board for AI Coding Agents
slug: run-kanban-tasks-for-coding-agents
description: "Keep AI coding-agent work on a durable, dependency-aware kanban board instead of chat scrollback — create implementation-sized tasks, check which ones are unblocked, mark completion with tested responses and commit hashes, and let any agent resume the board cold."
skills:
  - ledger-tasks-yylo
  - agent-workflow-packager
  - git-commit-pro
category: development
tags:
  - task-management
  - ai-agents
  - kanban
  - dependencies
  - developer-productivity
---

# Run a Kanban Task Board for AI Coding Agents

## The Problem

Priya ships a SaaS integration layer with two coding agents — Claude Code for deep refactors, Codex for quick edits. Her task list lives in three places by the end of a sprint: a stale `TODO.md`, whatever the last agent session "remembered", and her head. When an agent starts a task whose blocker isn't actually done, it burns 20 minutes building on broken ground. When a session dies mid-task, nobody — human or agent — can tell what was already attempted, what was tested, or which commit closed it. Reconstructing the board means scrolling transcripts.

## The Solution

Use **ledger-tasks-yylo** to drive YYLO Ledger, a Git-native task store with a shell-friendly CLI. Every task, dependency, status change, and completion response lives in the repository with append-only history. Agents run `yy ledger ready` to see only unblocked work, take exactly one task, and close it with a required response message plus a commit hash. Any session — human or agent — can pick the board up cold because the state is durable, reviewable, and dependency-aware.

- **agent-workflow-packager** turns recurring board rituals into reusable skills.
- **git-commit-pro** pairs clean commit messages with the completion evidence.

## Step-by-Step Walkthrough

### Step 1: Install the CLI and seed the board

```bash
npm install -g @yylo/cli
yy ledger create "Add retry with backoff to upload client" --status todo --tags backend,reliability
yy ledger create "Document upload error codes" --status backlog --tags docs
```

### Step 2: Declare dependencies once

Either inline in the task body (parsed automatically):

```
Depends on [blocked_by]T-104,T-107[/blocked_by]
```

Or explicitly:

```bash
yy ledger deps add --id T-141 --blocked-by T-104 T-107
```

### Step 3: Ask the agent to pick unblocked work

Tell the agent:

```
Run yy ledger ready, pick the top backend task, and start it.
```

The agent sees:

```
{"id":"T-141","status":"todo","tags":["backend"],"title":"Add retry with backoff to upload client","blocked_by":["T-104","T-107"],"blockers_done":true}
```

Both blockers are done, so T-141 is safe — T-139 (blocked by an open task) correctly does not appear.

### Step 4: Mark progress with a required response

```bash
yy ledger mark in_progress --id T-141 --response "Starting: porting upload client to shared retry helper"
```

### Step 5: Close with evidence and a commit hash

```bash
yy ledger mark done --id T-141 --response "Completed: swapped fetch loop for retry helper, 12 unit tests green" --commit 9f31c0a
yy ledger get T-141
```

The `get` output carries the full dependency resolution, history, responses, and the linked commit — no transcript archaeology.

## Real-World Example

Priya, a solo maintainer of a payments integration service, lands 14 agent-assisted tasks per sprint. Before the ledger board, roughly one task per sprint was wasted on blocked work and every handoff needed a 10-minute recap. Now each morning she runs `yy ledger order --scores`, assigns the top three tasks to two agent sessions with `yy task start`, and each session works an isolated worktree while the merge queue serializes updates. Completion responses double as her standup notes, and when a regression reopens a task (`mark todo --response "Reopening: 429 loop after auth expiry"`), the append-only history shows exactly what changed. Net effect: zero blocked-work surprises for two sprints running, and a board any agent can resume cold in one command.

## Related Skills

- [agent-workflow-packager](../skills/agent-workflow-packager/) — Package this board routine into a portable skill for other repos
- [git-commit-pro](../skills/git-commit-pro/) — Write the conventional commits that `mark done --commit` links to
