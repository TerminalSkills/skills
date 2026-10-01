---
name: project-skill-audit
description: >-
  Audits a repository to decide which agent skills it should have: inventories the skills and instruction files already present, mines session history, memory, scripts and commits for procedures that keep being repeated, and returns a ranked list of skills to create, update, merge or retire, each backed by evidence. Also says what should be an instruction-file rule, a hook or a script instead of a skill. Use when the user asks "what skills should this project have", "audit our skills", "are our skills out of date", "which workflows should we turn into skills", "review skill coverage" or "why does the agent keep redoing this by hand".
license: Apache-2.0
compatibility: "Any repository used with a coding agent that supports Agent Skills (Claude Code, Codex, Gemini CLI, Cursor). Needs shell access; jq is used for reading Claude Code transcripts."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["agent-skills", "audit", "workflow-analysis", "claude-code", "developer-experience"]
---

# Project Skill Audit

## Overview

A skill earns its place when it captures a procedure that people in this repository perform again and again, that takes several steps, and that goes wrong without project-specific knowledge. An audit therefore starts from evidence of what actually happens in the project, not from a list of skills that sound useful. This skill tells an agent where each coding agent keeps its skills, instructions, transcripts and memory, how to turn that material into counted observations, how to judge each candidate, and what the final report looks like.

## Instructions

### 1. Agree the scope

Ask the user:

- Which agents the team uses. That decides which folders and histories matter.
- Whether session transcripts on this machine may be read. They are plaintext records of everything that passed through tools, including file contents and command output, so get a yes first and never copy secrets from them into the report.
- The time window (30 or 90 days is typical) and whether personal skills under the home directory are in scope or only the repository's.

### 2. Inventory what exists

| | Project skills | Personal skills | Instruction files | Session history | Memory |
|---|---|---|---|---|---|
| Claude Code | `.claude/skills/*/SKILL.md`, nested `.claude/skills/` in subdirectories, legacy `.claude/commands/*.md`, plugins | `~/.claude/skills/` | `CLAUDE.md`, `.claude/rules/`, `AGENTS.md` | `~/.claude/projects/` (one folder per project, one `.jsonl` per session) | `~/.claude/projects/` → project folder → `memory/MEMORY.md` |
| Codex | `.agents/skills/` in every directory from the working directory up to the repository root | `~/.agents/skills/`, `/etc/codex/skills` | `AGENTS.md`, `AGENTS.override.md` | `~/.codex/sessions/`, `~/.codex/history.jsonl` | `~/.codex/memories/` (off unless enabled) |
| Gemini CLI | `.gemini/skills/` or `.agents/skills/` | `~/.gemini/skills/` or `~/.agents/skills/` | `GEMINI.md` | `~/.gemini/tmp/` → project hash → `chats/` | none documented |
| Cursor | `.cursor/skills/`, `.agents/skills/`; also reads `.claude/skills/` and `.codex/skills/` | `~/.cursor/skills/`, `~/.agents/skills/` | `.cursor/rules/*.mdc`, `AGENTS.md` | not stored as documented files | none documented |

```bash
find . -name SKILL.md -not -path '*/node_modules/*' -not -path './.git/*'
ls ~/.claude/skills ~/.agents/skills ~/.gemini/skills ~/.cursor/skills 2>/dev/null
wc -l CLAUDE.md AGENTS.md GEMINI.md 2>/dev/null
```

For each skill found, record: name, one-line purpose, where it lives, line count, and the files and commands it refers to. Useful built-in reports when available: in Claude Code, `/skill-doctor` shows how often each skill is invoked and what it costs in context, `claude plugin validate .claude/skills` finds frontmatter that does not parse, and `/doctor prompt-audit` flags references to files or commands that no longer exist; in Gemini CLI, `gemini skills list --all`; in Codex, `/skills`.

### 3. Check each existing skill

| Check | How | Limit or expectation |
|-------|-----|----------------------|
| Name | Compare frontmatter `name` with the folder name | Identical; lowercase letters, digits, hyphens; at most 64 characters |
| Description | Read it as the only thing the model sees before loading the skill | Says what it does and when to use it, key use case first; at most 1,024 characters. Listings are truncated (Claude Code cuts the combined text at 1,536 characters; Codex shortens descriptions when many skills are installed) |
| Size | `wc -l` | Under 500 lines; long reference material in separate files |
| References | Test every path the body mentions (command below) | No missing files |
| Commands | Run the read-only ones; look up the others in `package.json`, `Makefile`, CI | Each still exists |
| Triggers | Compare the description with how users phrased the request in history | The words people use appear in the description |
| Overlap | Compare descriptions pairwise, including personal and plugin skills | No two skills claim the same request |

```bash
# paths mentioned in a skill that no longer exist (run from the repository root)
grep -o '`[A-Za-z0-9_.-]*/[A-Za-z0-9_./-]*`' .claude/skills/release/SKILL.md \
  | tr -d '`' | sort -u | while read -r p; do [ -e "$p" ] || echo "missing: $p"; done
```

### 4. Collect evidence of repeated work

Count first, read second: transcripts are large, and loading them whole into context wastes the session. For Claude Code, the project folder name is the working directory with separators replaced by hyphens.

```bash
T=~/.claude/projects/-Users-noor-work-harbor-api      # this repository's transcripts

# most frequent shell commands (first two words of the first line)
jq -r 'select(.type=="assistant") | .message.content[]?
       | select(.type=="tool_use" and .name=="Bash") | .input.command
       | split("\n")[0] | split(" ")[0:2] | join(" ")' "$T"/*.jsonl | sort | uniq -c | sort -rn | head -30

# what users typed, shortened, for spotting recurring requests and corrections
jq -r 'select(.type=="user") | .message.content | strings | .[0:160]' "$T"/*.jsonl | sort | uniq -c | sort -rn | head -40

# which skills were actually invoked
jq -r 'select(.type=="assistant") | .message.content[]?
       | select(.type=="tool_use" and .name=="Skill") | .input.skill' "$T"/*.jsonl | sort | uniq -c | sort -rn
```

Other agents use different transcript schemas: print the keys of one record first and adapt the filter. Then open only the sessions that the counts point to, and note for each recurring procedure: what the user asked, the steps taken, what went wrong, and which command proved it worked.

Evidence that needs no transcripts, and the only evidence on a fresh machine:

```bash
git log --since="90 days ago" --pretty=format:%s | sed 's/[:(].*//' | sort | uniq -c | sort -rn | head -15   # kinds of work
git log --since="90 days ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -25           # hot files
ls .github/workflows scripts 2>/dev/null; grep -n '"scripts"' -A 25 package.json                           # procedures already scripted
```

Read the instruction files and `MEMORY.md` too. A long numbered procedure inside `CLAUDE.md` or `AGENTS.md` is a candidate by itself: those files load into every session, while a skill loads only when needed. Recurring corrections recorded in memory ("always run the seed script before the API tests") show where the agent keeps going wrong.

### 5. Judge every candidate

| Verdict | Conditions |
|---------|------------|
| Create a skill | Seen at least three times in the window, or mandated for every release or migration; three or more ordered steps; depends on paths, commands or rules specific to this repository; mistakes are costly or frequent |
| Update a skill | A skill already owns the job, and the evidence shows drift: missing paths, renamed commands, a description without the words users type, the same correction repeated after the skill ran, no verification step |
| Merge or retire | Two skills answer the same request; a skill has not been invoked in the window and its subject no longer exists in the code |
| Instruction-file rule instead | One or two sentences that should apply to all work ("use pnpm, not npm") |
| Hook, script or CI check instead | Something that must happen every time without exception; a model following prose will skip it eventually |
| Nothing | A one-off; a general technique an installed skill already covers with nothing project-specific to add; a topic without a repeatable procedure |

Rank what survives by occurrences multiplied by the cost of each occurrence (minutes spent, or corrections needed). Recommend at most five actions; a long list does not get done, and every installed skill adds its description to every session.

### 6. Write the report

```markdown
# Skill audit: harbor-api (1 July to 30 September 2026)

Evidence: 41 Claude Code sessions, 212 commits, 2 project skills, CLAUDE.md (188 lines), auto memory (14 entries)

## Existing skills
| Skill | Purpose | Used | State |
|-------|---------|------|-------|
| db-migrate | Create and apply Alembic migrations | 9 times | stale: 2 missing paths |
| release | Tag and publish a release | 0 times | description never matches how people ask |

## Recommendations
| # | Action | Skill | Evidence | Trigger phrases | Effort |
|---|--------|-------|----------|-----------------|--------|
| 1 | Update | db-migrate | scripts/migrate.sh moved to tools/db/ on 14 Aug; 4 sessions failed on the old path | "add a migration", "alter the table" | small |
| 2 | Create | seed-and-test | 11 sessions ran the same 5 commands; 6 forgot the seed step first | "run the API tests", "why are the tests empty" | medium |

## Not a skill
- "Never edit openapi.yaml by hand" → one line in CLAUDE.md
- Formatting before commit → a pre-commit hook; it was skipped in 7 of 41 sessions

## Next step
Say which numbers to carry out; each change will be tested in a fresh session before it is committed.
```

Every row cites something countable. If the evidence for an idea is "it seems useful", leave it out.

### 7. Carry out what the user picks

Stop auditing and do the work: write or edit the `SKILL.md` in the folder the team's agents read (`.agents/skills/` is shared by Codex, Gemini CLI and Cursor; Claude Code reads `.claude/skills/`), then start a fresh session, ask for the task in a user's words without naming the skill, and confirm it is picked up and the steps run.

## Examples

### Example 1: a repository with history and two skills

**Request:** "Audit our skills, we use Claude Code."

The inventory finds `db-migrate` and `release` under `.claude/skills/`. The path check prints:

```text
missing: scripts/migrate.sh
missing: scripts/rollback.sh
```

The command count over 41 sessions shows `docker compose` 96 times, `pytest tests/api` 74, `python tools/seed.py` 31; reading the eleven sessions behind those numbers shows the same five-command sequence, and six of them started with empty-database failures. The skill invocation count lists `db-migrate` 9 times and `release` never, although six user prompts say "cut a release" or "ship".

**Result:** the report shown in step 6: update `db-migrate`, create `seed-and-test`, rewrite the `release` description around the words "cut a release" and "ship", and move two items out of skill territory into `CLAUDE.md` and a hook.

### Example 2: no session history

**Request:** "New laptop, the team uses Codex and Cursor. What skills should this repo have?"

`~/.codex/sessions/` is empty and there is no `.agents/skills/`. The audit says so and falls back to the repository:

```text
$ git log --since="90 days ago" --pretty=format:%s | sed 's/[:(].*//' | sort | uniq -c | sort -rn | head -4
     38 feat
     27 fix
     19 chore
     12 i18n
```

The twelve `i18n` commits each touch the same four files in the same order (`locales/en.json`, the other locale files, `src/i18n/keys.ts`, a snapshot), and `AGENTS.md` describes that order in a 22-line numbered list. `.github/workflows/release.yml` already automates releases end to end.

**Result:**

```markdown
| # | Action | Skill | Evidence | Trigger phrases | Effort |
|---|--------|-------|----------|-----------------|--------|
| 1 | Create | add-translation-key (in .agents/skills/) | 12 commits in 90 days, 4 files in fixed order; 22 lines of AGENTS.md can move into it | "add a string", "new translation key" | small |

Not a skill: releases (already a workflow). Confidence is limited: no transcripts were available, so frequency of failures is unknown.
```

## Guidelines

- Transcripts hold whatever tools read or printed, credentials included. Work with counts and short excerpts, redact tokens and personal data, and do not paste raw transcript lines into a report that will be committed.
- Absence is weak evidence. Claude Code deletes transcripts after 30 days by default, Codex memories are off unless enabled, and history exists only on the machine where the work happened. State the window and the sources at the top of the report.
- Exclude the audit's own session from the counts.
- One painful incident is not a pattern. Require repetition, or an explicit team rule, before recommending a new skill.
- Frequency of a topic is not a procedure. "We touch the billing module a lot" yields no skill; "every pricing change needs these six steps" does.
- Prefer updating to creating. Two skills with overlapping descriptions make the agent's choice unreliable.
- Check that a recommended skill is not already supplied by a personal, plugin or bundled skill before proposing a project copy. A project version is justified only by project-specific steps.
- Keep the audit read-only until the user chooses. Do not delete or rewrite skills as part of the analysis.
- Not useful for a brand-new repository with neither history nor documented procedures; say that there is nothing to base recommendations on, and suggest repeating the audit after a few weeks of work.
