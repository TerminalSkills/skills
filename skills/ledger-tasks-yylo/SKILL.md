---
name: ledger-tasks-yylo
description: >-
  Operates YYLO Ledger kanban task management for AI coding agents: creating
  implementation-sized tasks, checking dependency readiness, starting tasks in
  dedicated worktrees, marking status with required responses, and archiving
  completed work. Use when an agent or developer needs to create, search,
  update, or complete tasks on a YYLO Ledger board, check which tasks are
  unblocked, manage blocked-by dependencies, or keep task state durable across
  sessions instead of chat scrollback.
license: MIT
compatibility: "Requires Node.js 18+ and the yylo CLI (npm install -g @yylo/cli). Works with Claude Code, Codex, Gemini CLI, Cursor, and other agent CLIs."
metadata:
  author: yylo-dev
  version: "1.0.0"
  category: development
  tags: ["task-management", "ai-agents", "kanban", "cli", "dependencies"]
---

# Ledger Tasks (YYLO)

## Overview

Drives task work on YYLO Ledger, a Git-native task and Record store with a shell-friendly CLI for developers, automation authors, and coding-agent workflows that need reviewable current state, append-only history, and dependency-aware work. The skill keeps task state durable across sessions: every task, status change, and response lives in the repository, not in chat history. Agents use it to pick unblocked work, execute exactly one task at a time, and mark completion with evidence.

Adapted from the canonical [`ledger-tasks-yylo`](https://github.com/yylo-dev/yylo-skills) skill in yylo-dev/yylo-skills (MIT).

## Prerequisites

```bash
# Install the yylo CLI globally
npm install -g @yylo/cli

# Verify the ledger surface is available
yy ledger --version
```

The task store lives in `.juno_task/` inside the project. All commands run via `yy ledger`.

## Instructions

### Step 1: Discover work before mutating anything

Read current state first. Never bypass ledger state with direct file edits.

```bash
yy ledger list --status todo,in_progress --limit 10
yy ledger ready                 # tasks whose blockers are all done
yy ledger order --scores        # topological order for safe parallel work
```

Work only tasks returned by `ready` — they have all blockers satisfied.

### Step 2: Create implementation-sized tasks

Tasks should be completable in one iteration without filling the context window.

```bash
yy ledger create "Add retry with backoff to upload client" --status todo --tags backend,reliability
```

Declare dependencies inline in the body using markup, parsed automatically on create:

```
Depends on [blocked_by]T-104,T-107[/blocked_by] and relates to [task_id]T-092[/task_id].
```

### Step 3: Manage dependencies explicitly

```bash
yy ledger deps add --id T-141 --blocked-by T-104 T-107   # T-141 cannot start until both are done
yy ledger deps T-141                                     # inspect blockers, dependents, priority score
yy ledger deps remove --id T-141 --blocked-by T-107
```

Cycle detection prevents circular dependencies automatically.

### Step 4: Start exactly one task and mark progress with a response

`mark` requires `--response` — document what was done and how it was tested. Attach the commit hash when marking done.

```bash
yy ledger mark in_progress --id T-141 --response "Starting: porting upload client to shared retry helper"
# ... implement, test, commit ...
yy ledger mark done --id T-141 --response "Completed: swapped fetch loop for retry helper, 12 unit tests green" --commit 9f31c0a
```

### Step 5: Search, update, and archive

```bash
yy ledger search --tag backend --open
yy ledger update T-141 --tags backend,urgent
yy ledger archive T-141    # soft delete — preserves data, sets status archive
```

Concurrent features are supported: start each selected task with `yy task start TASK_ID` — each gets a dedicated product worktree, while `yy merge` serializes only target updates.

### Step 6: Use output formats suited to scripts

All commands support `-f json`, `-f ndjson` (default), `-f xml`, `-f table`. Add `--raw` for compact output, `-p` for pretty print.

## Examples

### Example 1: agent picks up unblocked work

Input:

```bash
yy ledger ready --tag backend --limit 5
```

Output (ndjson):

```
{"id":"T-141","status":"todo","tags":["backend"],"title":"Add retry with backoff to upload client","blocked_by":["T-104","T-107"],"blockers_done":true}
{"id":"T-152","status":"backlog","tags":["backend"],"title":"Document upload error codes","blocked_by":[],"blockers_done":true}
```

T-141 is safe to start even though it has blockers — both are done.

### Example 2: agent closes out a task with evidence

Input:

```bash
yy ledger mark done --id T-141 --response "Completed: swapped fetch loop for retry helper, 12 unit tests green, flake run 3x clean" --commit 9f31c0a
```

Output:

```
T-141 marked done
response: Completed: swapped fetch loop for retry helper, 12 unit tests green, flake run 3x clean
commit: 9f31c0a
history: yy ledger get T-141
```

### Example 3: reopening on regression

Input:

```bash
yy ledger mark todo --id T-141 --response "Reopening: retry helper loops forever on 429 after auth expiry — regression in staging"
```

The append-only history preserves the earlier done record and the reopen reason.

## Guidelines

1. **Task sizing** — create tasks small enough to finish in one iteration; split anything that would fill the context window.
2. **Status flow** — backlog → todo → in_progress → done (archive for abandoned work). Never skip reading current state before a mutation.
3. **Always include `--response`** on `mark` — it is the audit trail of what was done and how it was tested.
4. **Attach commits** — use `--commit HASH` when marking done, then `update TASK_ID --commit HASH` to link git history.
5. **Use `ready` before starting** — never begin a task whose blockers are unfinished; use `order --scores` to plan parallel pipelines.
6. **Declare dependencies in body markup** — `[blocked_by]ID[/blocked_by]` and `[task_id]ID[/task_id]` are parsed on create/update.
7. **Read, then mutate** — `yy ledger get TASK_ID` shows full details including resolved dependency and related-task info.
8. **Keep the store canonical** — never edit `.juno_task/` files directly or bypass the CLI; history and receipts are the point.
9. **Archive is soft** — archived tasks are discoverable only through explicit archive commands; create follow-up work as new hot tasks.
10. **One task at a time per agent** — start with `yy task start TASK_ID` so each task gets a dedicated worktree; the merge queue serializes target updates.
