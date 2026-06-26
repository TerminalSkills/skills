---
title: Reconstruct How a Feature Actually Shipped
slug: reconstruct-how-a-feature-shipped
description: "Recover the real recipe behind a shipped feature, fix, or incident from your local AI-agent session history — anchor on a commit, date, or topic, inspect the sessions and subagents that produced it, and turn the reconstruction into release notes, persistent agent memory, and a precise PR description."
skills:
  - ax-extract-workflow
  - changelog-generator
  - agent-memory
  - git-commit-pro
category: productivity
tags:
  - workflow-reconstruction
  - agent-sessions
  - postmortem
  - knowledge-capture
  - developer-productivity
  - ax
---

# Reconstruct How a Feature Actually Shipped

## The Problem

Dana ships features with AI coding agents — Claude Code for the heavy implementation, Codex for quick edits — and a single feature routinely spans a dozen or more sessions across a week. Two weeks after landing a nasty fix ("the hosted dashboard finally loads live ingest"), two things land on her desk at once: write the release notes, and ship a near-identical fix for a sibling surface.

Both jobs need the same thing — the *recipe*. Not the final diff (git already has that), but the sequence: what was the actual root cause, which approaches were tried and abandoned, what was the one decision that made it click, and which verification step proved it. That knowledge is real, but it's scattered across ~15 agent sessions, a handful of subagent traces, and a cluster of commits. `git log` shows the *what*. Dana's memory is already fuzzy on the *why*. Reconstructing it by hand means scrolling raw transcripts for an hour — and she'll do it again next time someone asks "how did we do that?"

## The Solution

Use **ax-extract-workflow** to query the local [ax](https://github.com/Necmttn/ax) session graph and reconstruct the ordered workflow: pick an anchor (commit SHA, date window, or topic), inspect the sessions closest to it, expand the central subagent when one did the real work, and get back an evidence-backed narrative with the key decisions and the gaps.

Then route that reconstruction into downstream skills so the work isn't thrown away:

- **changelog-generator** turns the narrative into user-facing release notes.
- **agent-memory** persists the recipe to `MEMORY.md` so the next session for the sibling feature starts warm instead of cold.
- **git-commit-pro** writes a precise PR description when Dana repeats the workflow.

Everything stays local and read-only — ax reads transcripts, git history, and tool calls from a local database; the skill never mutates anything.

## Step-by-Step Walkthrough

### Step 1: Confirm ax has the data

The reconstruction is only as good as the local graph. Verify ax is installed and its daemon has ingested recent sessions before anything else.

```bash
command -v ax || command -v axctl
ax doctor
```

If `ax doctor` reports stale or missing ingest, run `ax ingest here --since=7` so the last week of transcripts and commits are in the graph. If neither `ax` nor `axctl` is on PATH, install it (`curl -fsSL ax.necmttn.com/install | sh`) — there is nothing to reconstruct from otherwise.

### Step 2: Anchor on what shipped

Pick the anchor that matches how Dana remembers the work. She remembers the *topic*, not the SHA, so she searches commits first, then pivots to the sessions near the winning commit.

```bash
# Topic mode: find the commit, then the sessions around it
ax recall "live ingest dashboard fix" --sources=commit --json
ax sessions near 9f31c2a --json

# If she remembered the week instead of the commit:
ax sessions around 2026-06-14 --days=3 --json

# If she just wants "what did this repo do recently":
ax sessions here --days=14 --json
```

`ax recall --sources=commit` ranks commits by BM25 over commit messages; `ax sessions near <sha>` is pwd-scoped and returns the sessions whose work landed around that commit. If several commits look plausible, show the short list and let Dana pick rather than guessing.

### Step 3: Inspect the sessions that explain it

Bias toward sessions close to the anchor, sessions with high activity, and sessions whose changed files match the artifact. Open the best candidate, group its skills by role to see the shape of the work, and expand the subagent if one did the heavy lifting.

```bash
ax sessions show codex:2026-06-14T19-22-10 --json
ax sessions show codex:2026-06-14T19-22-10 --by-role
ax sessions show codex:2026-06-14T19-22-10 --expand=2f2b5d9e-7f89-4a0f-b8ee-9657cdbb8c10
```

The reconstruction comes back as an ordered narrative — anchor, sessions inspected (with why each mattered), the ordered steps, 2–4 key decisions with session references, the supporting evidence, and an honest list of gaps where the graph is inconclusive. Keep it tight: cite the session or commit, don't paste raw JSON blobs.

### Step 4: Turn the reconstruction into release notes

Hand the ordered workflow to **changelog-generator**. Because the input already carries decisions and evidence, the changelog can explain *why* the fix matters, not just that a file changed.

```text
Using the reconstruction above, draft release notes for the "live ingest dashboard"
fix: one-line summary, the user-visible behavior change, and a migration note for
anyone who relied on the hosted mock studio.
```

### Step 5: Persist the recipe so you never re-derive it

Before starting the sibling feature, use **agent-memory** to write the distilled recipe into `MEMORY.md`. The next session loads it at startup, so the agent begins with "same-origin serving was the fix, compiled binaries report `live_ingest: false`" already in context.

```markdown
## Recipes
- **Hosted studio loopback failures**: serve the dashboard from the daemon root
  (http://127.0.0.1:1738/) instead of a hosted mock. Compiled binaries should
  serve the UI but report `live_ingest: false` rather than expose a broken stream.
  Evidence: commit 9f31c2a, session codex:2026-06-14T19-22-10.
```

When Dana opens the PR for the sibling fix, **git-commit-pro** uses the same reconstruction to write a description that names the root cause and the decision — not just the diff.

## Real-World Example

Dana runs the topic anchor and ax returns commit `9f31c2a` ("serve studio from daemon root") as the top match, with `codex:2026-06-14T19-22-10` as the closest session. Expanding that session's narrative:

```text
Anchor: commit 9f31c2a, "serve studio from daemon root".

Sessions inspected:
- codex:2026-06-14T19-22-10: closest session to the commit; touched dashboard
  serving and live-ingest code paths.

Ordered workflow:
1. Diagnosis: reproduced the hosted-studio loopback failure; identified
   same-origin serving as the real fix (not a CORS patch, which was tried first).
2. Implementation: updated daemon asset serving so the studio loads from
   http://127.0.0.1:1738/.
3. Verification: confirmed the Live tab degrades gracefully when compiled builds
   cannot run ingest, reporting live_ingest: false.

Key decisions:
- The local daemon URL is the supported path, not the hosted mock studio.
- Compiled binaries serve the dashboard but report live_ingest: false instead of
  exposing a broken stream.

Gaps: no browser screenshots were captured for this session, so UI verification is
inferred from command output and changed files.
```

The hour of transcript-scrolling becomes a 90-second query. The "CORS patch tried first" dead end — the single most useful thing for the sibling feature — surfaces from the session graph even though Dana had forgotten it. She drops the recipe into `MEMORY.md`, generates the changelog, and starts the sibling fix with the agent already primed.

## Related Skills

- **ax-extract-workflow** — the core skill; reconstructs the ordered workflow behind an artifact from local ax sessions, recall, and commits, returning an evidence-backed narrative with decisions and gaps.
- **changelog-generator** — turns the reconstructed narrative into user-facing release notes that explain *why* the change matters, not just what changed.
- **agent-memory** — persists the recipe to `MEMORY.md` so future sessions start with the hard-won context already loaded instead of re-deriving it.
- **git-commit-pro** — writes precise commit messages and PR descriptions from the reconstructed decisions when you repeat the workflow on a sibling feature.
