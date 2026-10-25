---
name: ax-extract-workflow
description: >-
  Rebuilds how a past feature, fix or release came about by reading the local
  ax history graph (sessions, commits, subagents) through the ax CLI. Use when
  asked "how did we build X", "what made Y work", "walk me through the work
  around commit <sha>" or "recipe for this feature". Finds the anchor commit or
  date, inspects the sessions around it and answers with an ordered,
  evidence-backed narrative. Read-only.
license: Apache-2.0
compatibility: "Requires the ax CLI (github.com/Necmttn/ax, binary ax or axctl) on PATH, with agent session history already ingested; run inside the git repository being asked about."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: productivity
  tags: "ax, session-history, workflow-reconstruction, git"
---

# Reconstruct a Past Workflow with ax

## Overview

ax ingests the transcripts of coding agents (Claude Code, Codex, Pi, OpenCode, Cursor and others), git history and tool calls into a local database. Nothing is uploaded and no daemon runs. This skill uses that database to answer one kind of question: what sequence of sessions, decisions and commits produced a given result, so the user can repeat it.

The work is strictly read-only: query, read, summarise in chat. Do not edit code, write recipe files or run ax commands that change state (`ingest`, `improve accept`, `profile publish`, `contribute`) unless the user asks for that separately.

## Instructions

### 1. Confirm ax is usable

```bash
command -v ax || command -v axctl
ax doctor
```

- If neither binary exists, tell the user to install ax from https://ax.necmttn.com/docs. Do not install it for them and never pipe an installer into a shell. The npm package named `ax` is a different project.
- If `ax doctor` reports problems, or `ax sessions here` returns nothing for a repository the user has worked in, ask them to run `ax ingest` (the first full import can take a while) and then retry.

### 2. Choose the anchor

| The user gives | Start with |
|---|---|
| a commit SHA | `ax sessions near <sha> --json` (run inside that repo) |
| a date or period | `ax sessions around <YYYY-MM-DD> --days=3 --json` (window is plus or minus N days) |
| a topic or feature name | `ax recall "<topic>" --sources=commit --json`, pick the best commit, then `ax sessions near <sha>` |
| nothing precise | `ax sessions here --days=14 --json` (current repository) |

`ax recall` is full-text search over past work; `--sources` takes `turn`, `commit` and `skill` (comma separated, default `turn`). Narrow it with `--project` or `--since` when the topic is common. If several commits fit, show the short list and ask which one before going on. `sessions here` hides subagent sessions unless you add `--include-subagents`.

### 3. Read the sessions that matter

Prefer sessions that overlap the anchor, show heavy activity, or mention the artifact in their summaries, files or commits. Two to five are usually enough.

```bash
ax sessions show 7c1d2e4a-58b0-4f0e-9a6d-3b5f21c8d0aa --json
ax sessions show 7c1d2e4a-58b0-4f0e-9a6d-3b5f21c8d0aa --by-role
ax sessions show 7c1d2e4a-58b0-4f0e-9a6d-3b5f21c8d0aa --expand=2f2b5d9e-7f89-4a0f-b8ee-9657cdbb8c10
```

- Copy session ids exactly as the listing printed it.
- `--by-role` groups the skills used by role, which helps to order the steps.
- Subagents appear as one-line summaries. Use `--expand=<uuid>` with the subagent id (repeatable) or `--all` only for the ones that carried the real work.
- `--turns` adds short excerpts of the conversation when the summary is not enough.

### 4. Answer in chat

Give, briefly:

1. Anchor: the commit, date window or topic used.
2. Sessions read, with a line on why each mattered.
3. The ordered steps that led to the result, naming skills and tools where visible.
4. Two to four decisions where the user or agent changed direction.
5. Evidence: commit SHAs, file names, command output, turn references.
6. Gaps: missing telemetry, ambiguous sessions, parts that ax cannot show.

## Examples

### Example 1: from a topic to a workflow

User: "What made the retry fix in the billing webhook work?"

```bash
ax recall "billing webhook retry" --sources=commit --json
ax sessions near 9f31c2a --json
ax sessions show 7c1d2e4a-58b0-4f0e-9a6d-3b5f21c8d0aa --by-role
```

Reply shape:

```text
Anchor: commit 9f31c2a "make webhook retries idempotent" (2026-09-14).
Sessions read: 7c1d2e4a... (Claude Code, 2h): closest to the commit, contains
the failing replay and the final patch.
Steps: 1) reproduced duplicate charges by replaying a stored event; 2) added an
idempotency key column; 3) wrapped the handler in a transaction; 4) replayed 40
events and checked there were no double writes.
Decisions: the user rejected a Redis lock in favour of a database unique
constraint (turn 31).
Gaps: no test output was captured, so the replay result rests on the agent's summary.
```

### Example 2: from a date, with a subagent

User: "Extract the workflow around 2026-09-15 for the CSV export work."

```bash
ax sessions around 2026-09-15 --days=3 --json
ax sessions show c04e8b71-2d3a-4c55-8e19-70f6a1b9d2e3 --json
ax sessions show c04e8b71-2d3a-4c55-8e19-70f6a1b9d2e3 --expand=2f2b5d9e-7f89-4a0f-b8ee-9657cdbb8c10
```

Reply shape:

```text
Anchor: sessions between 2026-09-12 and 2026-09-18 touching export/*.
Main session c04e8b71...: streaming CSV writer and the download endpoint.
Subagent 2f2b5d9e...: built fixtures with quoted commas and multiline cells.
Steps: 1) spec for column order; 2) streaming writer; 3) fixtures from the
subagent; 4) manual check of a 200k-row export.
```

## Guidelines

- The ids above are illustrative. Always take ids from ax output, never invent or shorten them.
- Evidence beats memory. If ax data conflicts with what the user remembers, report what the graph shows.
- If no matching session exists, say the local ax data lacks evidence. Do not make up a workflow.
- If the roles in `--by-role` are mostly unclassified, order the steps by timestamps, tool calls and commits, and say the role grouping is incomplete.
- Summarise, do not paste large JSON. Cite the session or commit instead.
- `ax sessions near` needs to run inside the repository that holds the commit.
