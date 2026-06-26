---
name: ax-extract-workflow
description: >-
  Reconstructs the workflow behind a past artifact by querying local ax session,
  recall, and commit history data. Use when a user asks "what made X work",
  "how was Y shipped/built", "extract workflow from <date|sha>", "workflow
  around <topic>", "recipe for this feature", or similar. It finds the anchor
  session or commit, inspects ax sessions, ax recall, and ax sessions show, and
  returns an ordered read-only narrative with decisions and evidence.
license: Apache-2.0
compatibility: "Requires ax or axctl on PATH and a populated local ax database/daemon data for the repository or user account."
metadata:
  author: Necmttn
  version: "1.0.0"
  category: productivity
  tags: ["ax", "workflow-reconstruction", "sessions", "developer-productivity"]
---

# Ax Extract Workflow

## Overview

Reconstruct how a past coding result happened by reading the user's local ax graph. Use this to answer questions about the sequence of sessions, commits, skills, subagents, and user decisions that produced a feature, fix, demo, PR, or other artifact.

This is a read-only investigation skill. Inspect `ax sessions`, `ax recall`, and `ax sessions show`; do not create files, update docs, edit code, or write `.ax/tasks` unless the user separately asks for a saved artifact.

## Instructions

### 1. Check ax availability

Prefer `ax`; fall back to `axctl` only if `ax` is unavailable.

```bash
command -v ax || command -v axctl
```

If neither command is available, or ax cannot reach its local data, stop and tell the user to run `ax doctor`, start the ax daemon, or install ax. Do not use repo-local startup scripts.

### 2. Resolve the anchor

Choose one anchor mode from the user's request:

- Commit SHA: use the SHA directly.
- Date: use the date window.
- Topic, feature, or artifact name: search commits first.
- "This repo recently" or no precise anchor: inspect recent sessions in the current repository.

Use these commands:

```bash
ax recall <q> --sources=commit --json
ax sessions near <sha> --json
ax sessions around <date> --days=3 --json
ax sessions here --days=14 --json
```

For topic mode, pick the best matching commit from `ax recall <q> --sources=commit --json`, then continue with `ax sessions near <sha> --json`. If several candidates are plausible, show the short list and ask the user to choose.

### 3. Inspect relevant sessions

Pick the sessions most likely to explain the artifact. Bias toward sessions close to the anchor, sessions with high activity, and sessions whose summaries, files, or commits match the artifact.

Inspect each selected session:

```bash
ax sessions show <id> --json
```

Use role grouping when it helps order skills:

```bash
ax sessions show <id> --by-role
```

If a subagent or child session appears central, expand it:

```bash
ax sessions show <id> --expand=<uuid>
```

### 4. Return an evidence-backed reconstruction

Answer inline in chat. Include:

- Anchor: the commit, date, topic, or recent-window basis used.
- Sessions inspected: session IDs and why each mattered.
- Ordered workflow: the steps that produced the result, with skills/tools when visible.
- Key decisions: 2-4 steering points from the user or agent, with session references.
- Evidence: commits, filenames, command results, or turn references from ax output.
- Gaps: missing telemetry, ambiguous sessions, or places where ax data is inconclusive.

Keep the reconstruction concise. The goal is to explain what happened well enough that the user can repeat the workflow, not to dump the entire session history.

## Examples

### Example 1: Reconstruct from a topic

**Input**

```text
What made the live ingest dashboard fix work?
```

**Commands**

```bash
ax recall "live ingest dashboard fix" --sources=commit --json
ax sessions near 9f31c2a --json
ax sessions show codex:2026-06-14T19-22-10 --json
ax sessions show codex:2026-06-14T19-22-10 --by-role
```

**Output**

```text
Anchor: commit 9f31c2a, "serve studio from daemon root".

Sessions inspected:
- codex:2026-06-14T19-22-10: closest session to the commit; touched dashboard serving and live ingest code.

Ordered workflow:
1. Diagnosis: reproduced the hosted-studio loopback failure and identified same-origin serving as the fix.
2. Implementation: updated daemon asset serving so the studio loads from http://127.0.0.1:1738/.
3. Verification: checked API/version behavior and confirmed the Live tab degrades when compiled builds cannot run ingest.

Key decisions:
- The user wanted the local daemon URL to be the supported path, not the hosted mock studio.
- Compiled binaries should serve the dashboard but report live_ingest: false instead of exposing a broken stream.

Gaps: ax did not show browser screenshots for this session, so UI verification is inferred from command output and changed files.
```

### Example 2: Reconstruct from a date

**Input**

```text
Extract the workflow around 2026-06-15 for the OTLP receiver work.
```

**Commands**

```bash
ax sessions around 2026-06-15 --days=3 --json
ax sessions show claude:2026-06-15T10-04-33 --json
ax sessions show claude:2026-06-15T10-04-33 --expand=2f2b5d9e-7f89-4a0f-b8ee-9657cdbb8c10
```

**Output**

```text
Anchor: date window 2026-06-12 through 2026-06-18, filtered to OTLP receiver sessions.

Sessions inspected:
- claude:2026-06-15T10-04-33: main implementation session for /v1/metrics, /v1/traces, and /v1/logs.
- expanded subagent 2f2b5d9e-7f89-4a0f-b8ee-9657cdbb8c10: schema and fixture validation.

Ordered workflow:
1. Spec framing: defined JSON-only OTLP ingestion and fail-open receiver behavior.
2. Schema work: modeled the accepted OTLP metric, trace, and log subsets.
3. Normalization: mapped harness service names and Codex log events into ax tables.
4. Correlation: linked sessions to telemetry after transcript ingest.
5. Verification: replayed representative payloads and checked database rows.

Key decisions:
- Codex events were treated as OTLP logs, not spans.
- Telemetry cost stayed separate from transcript-derived cost to avoid double counting.
```

## Guidelines

- Stay read-only by default. Do not run mutating ax commands, regenerate reports, or write recipe files unless the user explicitly asks for that as a separate task.
- Prefer commit and session evidence over memory. If the ax data conflicts with recollection, state what the local graph shows.
- Ask for clarification when topic search returns several unrelated commits or sessions.
- Keep command output summaries short; cite the session or commit instead of pasting large JSON blobs.
- If many skills are unclassified in `--by-role` output, still reconstruct the workflow from timestamps, summaries, tool calls, and commits. Mention that role ordering may be incomplete.
- If no matching sessions exist, say that local ax data does not contain enough evidence. Do not invent a workflow.
