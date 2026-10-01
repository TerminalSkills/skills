---
name: bug-hunt-swarm
description: >-
  Finds the cause of a hard bug by running several read-only subagents in parallel, each attacking
  it from a different angle (change history, code path, data and state, environment, reproduction),
  then checking their evidence, ranking the hypotheses and naming the one experiment that would
  confirm the leader. It diagnoses and does not fix. Use when someone says "hunt this bug with
  multiple agents", "swarm on this regression", "investigate in parallel", "find the root cause",
  or when a failure is intermittent, crosses components, or has resisted a first look.
license: Apache-2.0
compatibility: "Claude Code, Codex, Cursor or Gemini CLI with subagents available, inside a Git repository. Without subagents the same angles are run one after another."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["debugging", "multi-agent", "subagents", "root-cause-analysis"]
---

# Bug Hunt Swarm

## Overview

A bug without an obvious cause is a search problem, and a single investigator tends to settle on the first believable story. In this procedure the main agent writes a case file, sends three to five read-only investigators at it at the same time, each with its own angle, and then acts as a sceptical judge: it re-checks the evidence, ranks the hypotheses against every symptom and picks the cheapest experiment that separates the leaders.

Nothing in the repository is changed. The product is a diagnosis report; fixing starts only after the user has read it.

## Instructions

### 1. Decide whether a swarm is worth it

Swarm when at least two of these hold: ten minutes of direct reading has not localised the cause; the symptom crosses components; it is intermittent; it works in one environment and fails in another; it is a regression with many candidate commits.

Investigate alone when a stack trace points at a line you can read and explain, when one deterministic test fails in one file, or when the cause is known and only the fix is wanted. Each investigator has its own context and costs about as much as a full agent run, so five investigators cost roughly five times one.

### 2. Write the case file

Investigators start with an empty context and see only what the brief contains. Gather the facts first, reading only:

```bash
git status --short
git log --oneline -15
git log --oneline v3.8.0..v3.9.0 -- services/orders workers/email    # candidates between last good and first bad
```

| Field | Content |
|---|---|
| Symptom | The exact error text or wrong output, copied, not paraphrased |
| Expected | What should have happened |
| Frequency | Counts: "37 of 214 orders", "4 of 30 CI runs" |
| First seen / last good | Version, commit or date for each |
| Reproduction | The command and its result when you ran it, or "not reproduced" |
| Where it does not happen | Environments, inputs or users that are fine |
| Already ruled out | And how |
| Project rules | Test command, layout, anything from `CLAUDE.md`, `AGENTS.md` or `GEMINI.md` an investigator needs |

Mark each line as observed or reported. A guess written as a fact will send every investigator the same wrong way.

### 3. Choose the angles

| Angle | Question it answers | Reads |
|---|---|---|
| Change history | What changed between last good and first bad? | `git log`, `git show`, `git log -S'get_summary'`, lockfiles, migrations, config |
| Code path | Where along the path does actual behaviour leave expected? | Entry point to failure site, callers, error handling |
| Data and state | Which records, caches, orderings or timings trigger it? | Affected versus unaffected cases, fixtures, shared resources |
| Environment | What differs between where it fails and where it works? | CI config, runtime versions, env vars, flags, parallelism |
| Reproduction | What is the narrowest trigger? | Tests, existing repro scripts, logs |
| Prior art | Has this pattern broken or been fixed before? | `git log --grep`, similar code elsewhere |

Pick three to five. Regression: history, code path, data. Intermittent failure: reproduction, data and state, environment. "Works on my machine": environment, code path, history. Wrong output with no error: code path, data, prior art.

### 4. Launch the investigators

| Agent | How parallel investigators are started | Read-only setting |
|---|---|---|
| Claude Code | The `Agent` tool (called `Task` before v2.1.63), one call per angle in a single turn; built-in `Explore`, or a custom file in `.claude/agents/` | `tools: Read, Grep, Glob, Bash` in the file; `Explore` already denies Write and Edit |
| Codex | Only on request: "Spawn one agent per angle and wait for all of them"; built-in `explorer`, or a TOML file in `.codex/agents/` | `sandbox_mode = "read-only"` in the file |
| Cursor | Agent sends several Task calls in one message; a file in `.cursor/agents/`, invoked as `/bug-investigator` or by name | `readonly: true` in the frontmatter |
| Gemini CLI | Each subagent is a tool named after it; `@bug-investigator` forces it; a file in `.gemini/agents/` | `tools:` limited to `read_file`, `grep_search`, `glob`, `list_directory` |

Platform details that matter here:

- Claude Code runs at most 20 subagents at once by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). Subagents may spawn their own unless `Agent` is left out of `tools`. Built-in `Explore` does not load `CLAUDE.md`, so project rules must be in the brief. In interactive sessions subagents run in the background; wait for every result before judging.
- Codex caps threads with `agents.max_concurrent_threads_per_session` in `config.toml`; `/agent` switches between threads. Children inherit the parent's sandbox, and overrides set during the session (such as `--yolo`) are reapplied to them even when the agent file says read-only, so do not start a hunt from an unrestricted session.
- Gemini CLI subagents default to 30 turns and 10 minutes, cannot call other subagents, and its documentation does not promise concurrent execution: expect the angles to run in sequence.
- With no subagents at all, run the angles yourself one at a time and write each report before starting the next, so an early theory does not colour the later angles.

A reusable definition for Claude Code, saved as `.claude/agents/bug-investigator.md`:

```markdown
---
name: bug-investigator
description: Read-only investigator for one assigned angle of a bug hunt. Reports a hypothesis with evidence.
tools: Read, Grep, Glob, Bash
model: inherit
---
You investigate one angle of a bug and report evidence. You do not edit, create or delete files,
do not stage or commit, do not install anything and do not change branches. Shell use is limited
to reading (git log, git show, git diff, git blame, grep) and to test commands named in the brief.
Follow the return format in the brief exactly.
```

The Codex equivalent, `.codex/agents/bug-investigator.toml`, needs `name`, `description` and `developer_instructions` (the same rules as text) plus `sandbox_mode = "read-only"`. For Cursor use the same Markdown body with `readonly: true`; for Gemini CLI write `tools` as a YAML list of the four read tools above, and add `run_shell_command` for an angle that has to run `git log`.

### 5. Give every investigator the same brief with a different angle

```text
You are one of four investigators on the same bug. Work read-only: no edits, commits or installs.

CASE FILE
(paste the table from step 2)

YOUR ANGLE: Change history. What changed between v3.8.0 and v3.9.0 that could produce this symptom?
START WITH: git log v3.8.0..v3.9.0 -- services/orders workers/email
NOT YOUR JOB: proposing fixes, style remarks, the other angles.

RETURN, in at most 300 words:
HYPOTHESIS: one sentence describing a mechanism, not just a location
EVIDENCE: file:line or command with the relevant output, each checked by you
AGAINST: what does not fit, and what you could not check
PREDICTION: an observation that would be true only if you are right
CONFIDENCE: high, medium or low, and what would change it
If you find nothing, answer NO FINDING and list what you ruled out.
```

### 6. Judge the reports

1. Verify. Open every cited `file:line` and rerun cited read-only commands. Drop any claim that does not check out; investigators misquote.
2. Merge duplicates. Agreement counts as extra support only when it rests on different evidence.
3. Test each hypothesis against the whole case file, including the negatives: why it does not happen elsewhere, why it began when it did, why the frequency is what it is. A mechanism that would break every case cannot explain a failure in one case out of six.
4. Score and rank: explains every symptom (0–2), evidence verified by you (0–2), fits the timing (0–2). Below 4, call it a contributing factor or discard it.
5. If the top two are within one point, do not pick: go to step 7.
6. If nothing reaches 4, say so. Send a second, smaller round (two investigators) with the narrowed question, or ask the user for the missing data.

### 7. Name the discriminating experiment

Choose the cheapest observation whose result differs between the leading hypotheses.

- Regression with a deterministic check: `git bisect`. It checks out commits, so propose it rather than run it, and use a separate worktree:

```bash
git worktree add ../orders-bisect v3.9.0 && cd ../orders-bisect
git bisect start v3.9.0 v3.8.0             # bad first, then good
git bisect run ./scripts/check-total.sh    # exit 0 = good, 1-124 or 126-127 = bad, 125 = skip
git bisect reset && cd - && git worktree remove ../orders-bisect
```

- Intermittent failure: remove the suspected trigger and rerun. With an observed failure rate p, n clean runs are needed before a clean streak means anything at the 95% level: `n = ln(0.05) / ln(1 - p)`. At 4 failures in 30 (p = 4/30) that is 20.9, rounded up to 21 runs.
- Otherwise: one log line or assertion at the suspected point, a flag toggled, a dependency pinned. Describe it; do not apply it.

### 8. Report

```markdown
## Diagnosis: order emails show the undiscounted total (2026-09-29)
**Most likely cause:** one sentence with the mechanism (score 6/6)
**Evidence:** verified items with file:line
**Also considered:** each rejected hypothesis and the symptom it fails to explain
**Experiment to confirm:** command or steps, and the result predicted by each hypothesis
**Not yet known:** open questions, data to request
**Suggested fix direction:** one or two sentences, nothing applied
```

## Examples

### Example 1: regression after a release

Case file: since v3.9.0 (deployed 2026-09-22) the confirmation email shows the total without the coupon for 37 of 214 coupon orders; the amount charged is correct; v3.8.0 was fine; not reproduced locally. Three investigators: change history, code path, data and state.

| Investigator | Hypothesis | Evidence after verification |
|---|---|---|
| History | H1: commit `a41c9e2` caches the order summary at creation; a coupon added later leaves the cache stale | `services/orders/summary_cache.py:31` writes the cache once; no invalidation in the range |
| Code path | H1 again, reached independently: the email worker reads `get_summary()`, which prefers the cache for 600 s | `workers/email/confirm.py:58` |
| Data and state | H2: the new money formatter drops negative lines. Also notes: all 37 bad orders applied the coupon on the payment step, the 177 good ones in the cart | Export of the 214 orders |

Ranking: H1 scores 2 + 2 + 2 = 6 (it explains why only late coupons are hit and why the charge is right). H2 scores 0 + 1 + 2 = 3: the formatter runs for all 214 orders, so it cannot explain 37. Experiment: on staging, create an order, add the coupon on the payment step and read the cached summary before the email is sent; H1 predicts the old total, H2 predicts the right total in the cache and a wrong one in the email. Fix direction: invalidate or bypass the cache when a coupon changes.

### Example 2: test that fails only in CI

Case file: `test_export_job_writes_manifest` fails with `FileNotFoundError: ... exports/manifest.json` in 4 of 30 CI runs and never locally; CI runs `pytest -n 4`, developers run `pytest`. Three investigators: reproduction, data and state, environment.

- Environment: the only relevant difference is four parallel workers in CI.
- Data and state: `tests/test_cleanup.py` deletes the same `exports` directory that the export test writes to; with two workers both can run in the same 50 ms.
- Reproduction: `pytest -n 4` locally, 30 runs: 4 failures; `pytest -n 0`, 30 runs: none.

One hypothesis survives (two tests share a directory and race under parallel workers), score 6. Experiment already run to confirm: `pytest -n 4 --deselect tests/test_cleanup.py::test_cleanup_removes_tmp`, 30 runs, no failures; 21 clean runs were the minimum for p = 4/30. Fix direction: give each test its own temporary directory.

## Guidelines

- Read-only is enforced twice: by the tool or sandbox setting and by the brief. A shell tool can still write, so name the allowed commands and review what investigators ran.
- Never paste secrets, tokens or customer records into a case file; describe the shape of the data instead.
- Investigators agreeing is weak proof when they all read the same misleading sentence. Keep reported and observed facts apart in the case file.
- Do not let an investigator's confident tone stand in for evidence you have not opened yourself.
- More than five investigators mostly adds duplicates and fills the main context with reports. Prefer a second narrow round.
- "Root cause" is where the fix belongs, not the last thing that went wrong. Say when the finding is a trigger sitting on top of a deeper weakness, such as a missing invalidation rule.
- Production-only bugs: investigators read code and exported logs. They get no production credentials and run nothing against live systems.
- Stop at the report. If the user asks for the fix, start it as separate work with the confirming experiment turned into a failing test first.
