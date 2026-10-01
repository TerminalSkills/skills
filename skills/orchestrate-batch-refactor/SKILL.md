---
name: orchestrate-batch-refactor
description: >-
  Runs a large refactor or migration across many files by splitting it into units that cannot collide, mapping the code with read-only subagents, dispatching one worker per unit in dependency order, and verifying everything in the main session before reporting. Includes the decision of when not to parallelize, a plan format with file ownership, a worker brief, and how subagents and worktrees behave in Claude Code, Codex, Gemini CLI and Cursor. Use when the user says "refactor this across the whole repo", "migrate all call sites", "split this up between subagents", "run the migration in parallel", "batch refactor", or "this change touches a hundred files".
license: Apache-2.0
compatibility: "A git repository and a coding agent that can delegate to subagents: Claude Code, Codex CLI, Cursor, or Gemini CLI (sequential delegation). Checks rely on the project's own test, type-check and lint commands."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["refactoring", "subagents", "migration", "parallel-agents", "code-quality"]
---

# Orchestrate Batch Refactor

## Overview

A change that touches a hundred files is slow in one context window and dangerous when several agents edit at once. The way through is to act as an orchestrator: keep the requirements, the plan and the verification in the main session, hand the reading and the mechanical editing to subagents, and make collisions impossible by giving every file exactly one owner. Subagents start with an empty context and return only a summary, so the quality of the result depends on two artefacts this skill defines: the plan and the brief each worker receives.

## Instructions

### 1. Decide whether to orchestrate

| Situation | Approach |
|-----------|----------|
| Fewer than about ten files, or one tightly coupled module | Do it in the main session |
| A purely syntactic change (rename a symbol, change an import path) | Use a codemod, the compiler or the language server's rename; review the diff. No subagents needed |
| Many files, each edit needs judgment, units can be checked on their own | Orchestrate with parallel workers |
| Many files but every edit depends on the previous one (a type that ripples outward) | Orchestrate in sequence: one worker at a time, or do it yourself |

Parallel work costs more tokens than a single run, so use it for speed and context relief, not by default.

### 2. Fix the scope and the baseline

Ask the user: what must change, what must stay identical (public API, behaviour, wire formats, database schema), what is out of scope, whether the work lands as one commit series or one pull request, and whether workers may commit.

Look up yourself:

```bash
git status --short                      # start from a clean tree; stash or commit nothing yourself, ask
git grep -l "fetchJson(" -- 'packages/*/src' | wc -l      # how many files
git grep -c "fetchJson(" -- 'packages/*/src' | sort -t: -k2 -nr | head   # where the weight is
```

Find the project's checks in `package.json`, `Makefile`, `pyproject.toml` or the CI workflow, run them once, and record the result and the duration. A baseline that already fails must be reported before any edit, otherwise later failures cannot be attributed.

### 3. Map the code with read-only subagents

Split the scope into areas that follow the repository's own seams (packages, services, top-level directories) and send one read-only explorer per area, in parallel. Give each the pattern to look for and this return format:

```text
AREA: packages/billing
FILES AFFECTED: 31 (list with occurrence counts)
VARIANTS: forms the pattern takes here, one example each (file:line)
SHARED FILES: files that other areas also import or would need to edit
HIDDEN USES: re-exports, string-based lookups, generated code, config, mocks, docs
TESTS: which suites cover these files and the command to run only them
RISKS: anything that cannot be changed mechanically, with the reason
```

### 4. Know how your agent delegates

| | Read-only explorer | Worker that edits | Parallelism | Isolation between workers |
|---|---|---|---|---|
| Claude Code | built-in `Explore` | `general-purpose`, or a custom agent in `.claude/agents/` | Several Agent calls in one turn; 20 running at once by default | `isolation: worktree` in the agent's frontmatter gives each worker its own git worktree |
| Codex | built-in `explorer` | built-in `worker`, or a TOML agent in `.codex/agents/` | Ask in words ("spawn one agent per unit and wait for all"); cap with `agents.max_concurrent_threads_per_session` | Same checkout and sandbox as the parent; rely on disjoint file lists |
| Cursor | built-in Explore | custom agent in `.cursor/agents/` | Several Task calls in one message | Shared checkout unless you ask for "each in its own environment", which gives each a worktree and branch |
| Gemini CLI | `codebase_investigator` | `generalist` | Subagents cannot call other subagents; plan for one delegation at a time | Shared checkout |

Facts that shape the plan:

- A subagent does not see the conversation. Whatever it needs (rule, file list, commands, constraints) must be in its brief.
- In a shared checkout, two workers editing one file overwrite each other. Disjoint ownership is the protection.
- Claude Code worktrees branch from the repository's default branch, not from your current work, unless `worktree.baseRef` is set to `"head"` in settings. A worker in a fresh worktree will not see an uncommitted foundation change.
- Each finished subagent returns its report into the main context. Ask for short, structured reports.

### 5. Write one plan

Merge the explorer reports into a single plan and show it to the user before any worker edits.

```markdown
# Refactor plan: fetchJson callbacks → http.get promises

Invariants: public exports of every package unchanged; no behaviour change; retry and timeout semantics identical
Baseline: pnpm -r typecheck (ok, 48 s) · pnpm -r test (ok, 612 tests, 3 min 10 s)

| Unit | Objective | Owns | Depends on | Check | Done when |
|------|-----------|------|------------|-------|-----------|
| F0 | Add http.get next to fetchJson; fetchJson delegates to it | packages/http/** | none | pnpm --filter @tern/http test | both APIs exported, tests pass |
| U1 | Migrate billing callers | packages/billing/src/** | F0 | pnpm --filter @tern/billing test | no fetchJson( left in owned files |
| U2 | Migrate catalog callers | packages/catalog/src/** | F0 | pnpm --filter @tern/catalog test | same |
| C9 | Delete fetchJson and its tests | packages/http/** | U1, U2 | pnpm -r typecheck && pnpm -r test | symbol gone, repo green |

Waves: [F0] → [U1, U2 in parallel] → [C9]
Reserved for the orchestrator: pnpm-lock.yaml, root tsconfig, CHANGELOG.md
```

Planning rules:

- Every affected file appears in exactly one unit of a wave. If two units need the same file, merge them, or move that file into a foundation unit that runs alone and first.
- Shared artefacts (lockfiles, barrel exports, generated code, snapshots, global config) are owned by the orchestrator or a single-worker wave.
- Prefer expand, migrate, contract: add the new form beside the old one, move callers over in parallel, remove the old form last. Every wave then leaves the repository building.
- Size a unit so one worker can finish it in one context: roughly 5 to 25 files with one scoped check command.
- Order waves by dependency. Only units with all dependencies finished and verified run together.

### 6. Brief the workers

Run one unit as a pilot. If its result exposes a gap in the brief, fix the brief before launching the rest. Each worker gets a self-contained message:

```text
You are making one part of a larger refactor. Other agents are editing other files in this
repository at the same time.

OBJECTIVE: replace every fetchJson(url, callback) call with await http.get(url) in the files you own.
YOU OWN (edit only these): packages/billing/src/**
DO NOT TOUCH: any other path, package.json files, lockfiles, generated code. If the task seems to
require it, stop and report the path and the reason instead of editing.
RULE: before → fetchJson(u, (err, data) => { if (err) return fail(err); use(data) })
      after  → try { const data = await http.get(u); use(data) } catch (err) { fail(err) }
      Enclosing functions become async; update their callers only inside your files.
KEEP: exported names and signatures, log messages, retry and timeout options.
CHECK: pnpm --filter @tern/billing test && pnpm --filter @tern/billing typecheck
       Run only these. Do not run repo-wide formatters or the full suite.
GIT: do not commit, push, stash or revert anything. Leave changes in the working tree.
RETURN: files changed (count), occurrences replaced, cases you could not convert (file:line and
why), exact check output tail, anything outside your files that now needs a change.
```

Launch all units of a wave in one turn so they run concurrently, and cap the number so the machine can run that many test processes at once.

### 7. Integrate and verify yourself

A worker's "all tests pass" is a claim, not evidence. After each wave:

```bash
git status --short                          # every changed path must fall inside some unit's list
git diff --stat
git grep -n "fetchJson(" -- packages/billing/src packages/catalog/src    # expect no output
pnpm -r typecheck && pnpm -r test
```

- A changed file outside every ownership list means a worker broke its brief: inspect the diff, keep or redo it deliberately.
- With worktrees, bring each worker's branch into the feature branch one at a time and run the unit's check after each. A merge conflict means the plan had overlapping ownership; correct the plan before the next wave.
- When a unit fails its check, send the failing output back to the same worker (resume it, or steer its thread) once. If it fails again, finish that unit in the main session; the context you gain is worth more than a third attempt.
- If workers keep asking for files outside their lists, stop and re-plan; the boundaries are wrong.

### 8. Report

```markdown
## Refactor report: fetchJson → http.get
| Unit | Status | Files | Notes |
|------|--------|-------|-------|
| F0 | done | 4 | http.get added, fetchJson delegates |
| U1 | done | 31 | 2 call sites converted by hand (streaming response) |
| U2 | done | 27 | none |
| C9 | done | 3 | fetchJson removed |

Verification: pnpm -r typecheck ok · pnpm -r test ok (612 passed, same count as baseline)
Deviations from plan: packages/catalog/src/legacy/feed.ts kept a thin wrapper, see TODO(http-get)
Not done / risks: docs/api.md still mentions fetchJson; no integration test covers the retry path
```

## Examples

### Example 1: a migration across a monorepo

**Request:** "We have about 200 `fetchJson` callback calls across the packages. Move them all to `http.get`."

The orchestrator finds 212 occurrences in 58 files across `billing` and `catalog`, runs the baseline (green), and sends two `Explore` subagents, one per package. Their reports show one shared file, `packages/http/src/index.ts`, and two streaming call sites that cannot be converted mechanically. The plan in step 5 is shown to the user and approved. F0 runs alone; the orchestrator verifies and commits it. U1 runs as the pilot and returns "29 files converted, 2 skipped: streaming". The brief gains a line about streaming responses, U2 is launched, and both streaming sites are converted in the main session. After C9 the repository-wide check prints:

```text
$ git grep -c "fetchJson(" -- packages | wc -l
0
$ pnpm -r test
Test Files  94 passed (94)
     Tests  612 passed (612)
```

**Result:** the report in step 8, three commits (foundation, migration, removal), and one follow-up noted for the documentation.

### Example 2: deciding not to fan out

**Request:** "Rename `Order.total` to `Order.grand_total` everywhere, use subagents to make it fast."

`git grep -l "\.total" -- 'app/*.py' | wc -l` reports 38 files, but the explorer's map shows they all hang off one SQLAlchemy model: the column, a migration, serializers that read the attribute by name, and templates. Splitting by directory would give three workers the same model file and leave the tree broken between waves.

Decision told to the user: one sequential pass in the main session. Add `grand_total` with a migration and keep `total` as a property alias; update callers directory by directory, running `pytest tests/orders -q` after each; remove the alias last. A single read-only subagent is still used to list string-based uses (`getattr(order, "total")`, JSON keys, template variables) that a symbol rename would miss.

**Result:** 38 files changed in three commits, `pytest -q` shows `417 passed` before and after, and the JSON field name `total` in the public API was deliberately left unchanged, as the report states.

## Guidelines

- No worker edits before the plan exists and the user has seen it. Analysis in parallel is cheap; uncoordinated writing is not.
- Keep the verification commands in the main session's hands. Workers run scoped checks; only the orchestrator runs the full suite, and it does so after every wave.
- Do not let workers commit, stash, reset or run formatters over the whole tree in a shared checkout; any of these can sweep up or discard another worker's edits.
- A refactor preserves behaviour. If a unit uncovers a bug, report it and keep the current behaviour unless the user decides otherwise; mixing fixes into the batch makes regressions untraceable.
- Equal test counts before and after is a quick signal that no suite was silently skipped or deleted.
- More workers is not faster past the point where their checks compete for CPU, or where reports flood the main context. Four to six concurrent writers is a sensible ceiling for most repositories.
- Subagent results arrive as summaries. When a summary matters (a skipped file, a risky conversion), open the diff rather than trusting the description.
- Not suited to exploratory redesigns where the target shape is still unknown, to changes that need a live database or deployment step per unit, or to repositories without any automated check, where nothing can confirm that behaviour was preserved.
