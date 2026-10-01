---
name: review-swarm
description: >-
  Reviews a diff with several independent read-only reviewer agents running at the same time, each looking through one lens (correctness, security, data, concurrency, compatibility, tests), then checks every claim against the code and merges the survivors into one prioritized report. Use when the user says "review swarm", "review this branch with parallel agents", "multi-agent code review", "get several reviewers on my diff", or wants a deeper pre-merge review than a single pass gives. It reports problems and does not change code.
license: Apache-2.0
compatibility: "A git repository and an agent that can start subagents: Claude Code, Codex CLI, Cursor or Gemini CLI. Falls back to sequential passes where subagents are unavailable."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["code-review", "multi-agent", "subagents", "git-diff", "pre-merge"]
---

# Review Swarm

## Overview

A review swarm splits one code review into several narrow reviews that run in separate contexts and cannot see each other's conclusions. A reviewer that only hunts for authorization mistakes reads the same diff differently from one that only asks what happens under concurrent requests, and neither anchors on the other's opinion. The price is tokens and noise: every reviewer spends its own budget, and narrow reviewers over-report. So the orchestrating agent has two jobs that matter more than the fan-out itself: write one precise brief for everyone, and verify each claim in the code before the user sees it. The output is a report. Nothing is edited, staged or committed.

## Instructions

### 1. Fix the scope and measure it

Decide exactly which change is under review and say it back to the user in one line. If the user named files, a branch or a commit range, use that. Otherwise look at the repository:

| What is being reviewed | Diff command |
|---|---|
| Uncommitted edits | `git diff` (unstaged) and `git diff --cached` (staged) |
| A branch against its base | `git diff main...HEAD` (three dots: from the merge base) |
| One commit | `git show 4f2a9c1` |
| Size of any of the above | add `--shortstat` or `--stat` |

If the working tree is clean and no range was given, ask what to review instead of guessing. Leave lockfiles, vendored code, snapshots and generated files out of the reviewers' scope and list them under "Not reviewed".

Use the size to choose the shape of the review:

- **Under about 60 changed lines in one or two files:** review it yourself in one pass. A swarm costs more than it finds.
- **Up to about 1,500 changed lines:** one reviewer per lens, as below.
- **Larger:** split by area first (for example `api/`, `web/`, `migrations/`), then run the lenses per area, and tell the user the review is partitioned.

### 2. Write one brief

Every reviewer receives the same brief, so findings are comparable. It has four parts:

1. **Intent.** What the change is supposed to do and what must stay as it was. Take it from the user, the branch name, commit messages and linked issue. If you had to infer it, write "inferred" next to it.
2. **Scope.** The exact diff command and the excluded paths.
3. **House rules.** The project instruction files that apply to the touched directories (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, contributor docs).
4. **Rules of engagement and reply format**, identical for all (see the template in step 4).

### 3. Pick the lenses from what the diff touches

Correctness always runs. Add a lens only when the diff gives it something to look at, and stop at five reviewers.

| Lens | Run it when the diff touches | The question it answers |
|---|---|---|
| Correctness | anything | Does the code do what the intent says, including empty, boundary and error paths? |
| Security | auth, sessions, request parsing, file paths, SQL, shell calls, secrets, dependencies | Can a caller reach or change something they should not? |
| Data | migrations, schemas, serialized formats, caches | Is existing data still readable, and can the change be rolled back? |
| Concurrency and cost | async code, locks, queues, loops around I/O, hot paths | What happens with two requests at once, and with 100 times the rows? |
| Compatibility | public APIs, config keys, CLI flags, events, feature flags | Which existing caller breaks, and is that announced? |
| Tests | any behaviour change | Which changed behaviour has no test that would fail if it broke? |

### 4. Launch the reviewers in parallel, read-only

Send all reviewers in the same turn and wait for every one before merging. How that is done depends on the agent:

| Agent | How parallel reviewers start | How to keep them read-only |
|---|---|---|
| Claude Code | Several Agent tool calls in one message run concurrently; results come back as completion notifications. Default cap is 20 running subagents (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). | Use the built-in `Explore` type (Write and Edit are denied) or a custom subagent whose `tools` list has no Write or Edit. |
| Codex CLI | Ask for it in words: "spawn one agent per lens and wait for all". `/agent` switches between agent threads. Cap with `agents.max_concurrent_threads_per_session`. | A custom agent file with `sandbox_mode = "read-only"`. |
| Cursor | The agent sends several Task tool calls in one message. A custom subagent is called with `/diff-reviewer`. | `readonly: true` in the subagent frontmatter. |
| Gemini CLI | Subagents are tools the main agent calls; `@diff-reviewer` forces one. The documentation does not promise that calls run concurrently, so expect them one after another. | A `tools` list limited to `read_file`, `grep_search`, `glob`, `list_directory`. |

A reusable reviewer for Claude Code, saved as `.claude/agents/diff-reviewer.md` (create it only if the user wants a permanent reviewer; otherwise use `Explore`):

```markdown
---
name: diff-reviewer
description: Read-only reviewer for one lens of a diff. Use for review swarms.
tools: Read, Grep, Glob, Bash
---
You review a diff through exactly one lens named in the task. Use Bash only for
read-only git commands (git diff, git show, git log, git blame). Never change
files, the index, branches or stashes. Report findings in the requested format.
```

The same idea for Codex, as `.codex/agents/diff-reviewer.toml`:

```toml
name = "diff_reviewer"
description = "Read-only reviewer for one lens of a diff."
sandbox_mode = "read-only"
developer_instructions = """
Review the diff through the single lens named in the task.
Cite file and line for every claim. Do not propose style changes. Do not edit anything.
"""
```

The task text each reviewer gets (only the lens line differs):

```text
LENS: Security. Report only problems this lens covers; ignore everything else.

INTENT: Add CSV export of invoices for workspace admins. Must not change the
existing PDF export or who can list invoices. (Intent stated by the author.)

SCOPE: run `git diff main...HEAD -- . ':!pnpm-lock.yaml'`. Read surrounding
files as needed to confirm how the changed code is called.

RULES: Read-only. No edits, no git commands that change state. A finding needs
evidence: the path, the line, and the input or sequence that makes it fail.
If you cannot show how it fails, put it under QUESTIONS, not FINDINGS.
No style, naming or formatting remarks.

REPLY FORMAT, nothing else:
FINDINGS
- path:line | what goes wrong | how to trigger it | confidence high/medium/low
QUESTIONS
- path:line | what you could not determine
CHECKED AND FOUND CLEAN
- short list of what you examined
```

Without subagents, run the lenses yourself one at a time with the same task text, and write each lens's findings down before starting the next.

### 5. Verify, merge, grade

Reviewer output is raw material. For every finding:

1. **Open the cited location yourself.** If the line does not exist, the code does not do what was claimed, or a guard elsewhere already prevents the failure, reject it.
2. **Check it against the intent.** A complaint about behaviour the change was meant to introduce becomes a question for the author.
3. **Merge duplicates.** Same location and same failure reported by two lenses is one finding; note both lenses. Agreement raises confidence, but it is not verification.
4. **Grade it.**

| Grade | Meaning |
|---|---|
| Blocker | Wrong results, data loss, a security hole, or a break for existing callers, reachable in normal use |
| Should fix | Real defect with limited reach, or a missing test for risky new behaviour |
| Note | Worth knowing, safe to merge without it |

Anything you could neither confirm nor refute goes under "Unverified" with what would settle it.

### 6. Deliver the report

Use this shape, most severe first, and keep each finding to a few lines:

```text
Review of feat/invoice-export against main: 14 files, +612 −88
Lenses: correctness, security, data, tests (4 reviewers, all completed)
Raw findings 11 → confirmed 3, questions 1, rejected 7

BLOCKER
B1  api/invoices/export.ts:41  Export ignores workspace scope
    The query filters by `status` only, so an admin of one workspace receives
    every workspace's invoices. Trigger: GET /invoices/export as any admin.
    Found by: security, correctness. Direction: add the workspace filter used
    in list.ts:27 and a test with two workspaces.

SHOULD FIX
S1  ...

QUESTIONS FOR THE AUTHOR
Q1  ...

NOT REVIEWED: pnpm-lock.yaml, web/src/generated/
VERDICT: do not merge until B1 is fixed.
```

End by asking whether the user wants any finding fixed. Fixing is a separate task that starts only after they say so.

## Examples

### Example 1: branch review before a pull request

Request: "Run a review swarm on my branch before I open the PR."

The agent runs `git diff main...HEAD --shortstat` and gets `14 files changed, 612 insertions(+), 88 deletions(-)` on branch `feat/invoice-export`. The diff touches a route handler, a SQL query, a migration adding `invoices.exported_at`, and two test files. Lenses chosen: correctness, security, data, tests. Compatibility is skipped because no public interface changes; concurrency is skipped because nothing is async beyond the request itself.

Four reviewers return 11 findings. Verification:

| Raw finding | Result |
|---|---|
| Export query lacks workspace filter (security, correctness) | Confirmed at `export.ts:41`, merged into B1 |
| Migration adds a `NOT NULL` column without default (data) | Rejected: column is nullable, `0031_exported_at.sql:3` |
| CSV cells starting with `=` are written unescaped (security) | Confirmed, S1: formula injection when opened in a spreadsheet |
| No test for an empty invoice list (tests) | Confirmed, S2: handler returns 500 on empty result, `export.ts:58` |
| "Streaming could use less memory" (correctness) | Rejected: no failure shown, out of lens |
| Six further items | Rejected: duplicates or style remarks |

The report lists B1, S1, S2, one question ("Should exported_at be set on failed exports?"), the excluded lockfile, and the verdict "do not merge until B1 is fixed".

### Example 2: small uncommitted change, no swarm

Request: "Swarm review what I've got uncommitted."

`git diff --shortstat` shows `1 file changed, 9 insertions(+), 2 deletions(-)` in `src/retry.py`; nothing is staged. The agent answers that eleven lines do not justify four reviewers and reviews it directly:

```text
Review of uncommitted changes: 1 file, +9 −2 (single pass, no swarm: change is small)

SHOULD FIX
S1  src/retry.py:22  Backoff grows without a ceiling
    delay = base * 2 ** attempt, attempts numbered from 1, max_attempts=12:
    the last wait is 4096 × base (about 34 minutes at base=0.5 s). Direction: cap the delay, for
    example min(delay, 30).

VERDICT: fine to commit after S1, or keep as is if 12 attempts is never used.
```

### Example 3: intent unknown

Request: "Review swarm on commit 4f2a9c1" with a commit message that says only "wip". The brief states `INTENT: inferred from the diff: move rate limiting from the gateway into the orders service`. Two reviewers flag that the gateway limiter was deleted. Because the inferred intent may be wrong, the report places this under QUESTIONS ("Is removing the gateway limiter intended, or should both exist during rollout?") and not under findings.

## Guidelines

- **Never report an unverified claim as a finding.** Narrow reviewers produce confident, wrong statements about code they did not open. The verification pass is the difference between a swarm and noise.
- **Reviewers must not write.** Restrict tools or sandbox where the agent allows it, and say it in the task text as well. If a reviewer edited something anyway, tell the user which files changed and stop.
- **Same brief for everyone.** Reviewers given different intents produce findings that cannot be merged.
- **More lenses is not more quality.** Five reviewers on a 200-line diff mostly generate duplicates. Choose by what the diff touches.
- **Secrets in a diff:** report the path and line and that a credential is present; never copy the value into the report.
- **Do not run the changed code** as part of the review unless the user asks. Reading is enough to review, and code from an untrusted branch can do anything.
- **Cost:** each reviewer spends its own context. Say so before starting a swarm on a large diff, and prefer a cheaper model for reviewers when the agent lets you choose one.
- **Limits:** reviewers see the repository, not production. Findings that depend on data volume, configuration or traffic are stated as conditions ("if the table exceeds a few million rows").
- **When not to use it:** formatting-only or generated changes, tiny diffs, or a request to fix the code. If the user asks for the agent's own built-in review command (for example `/code-review` in Claude Code), run that instead of this procedure.
