---
name: context-engineering
description: >-
  Audits and reorganises what an AI coding agent carries in its context window: instruction
  files, path-scoped rules, skills, subagents, hooks and the running conversation. Use when
  someone says "the agent ignores our CLAUDE.md", "set this repo up for Claude Code / Codex /
  Cursor", "my AGENTS.md is too long", "quality drops in long sessions", "it keeps inventing
  APIs", "what should go in a skill versus the rules file", or asks how to hand work to a
  subagent. Grounded in the documented loading behaviour of Claude Code, with the equivalents
  for Codex, Gemini CLI and Cursor.
license: Apache-2.0
compatibility: "Claude Code 2.1.277 or later for the file names, commands and limits quoted here; the placement rules carry over to Codex CLI, Gemini CLI and Cursor through AGENTS.md, GEMINI.md and .cursor/rules."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["context-engineering", "claude-code", "agents-md", "ai-workflow", "prompt-engineering"]
---

# Context Engineering

## Overview

Context engineering is deciding what an AI coding agent has in its context window at each step: standing instructions, skill and tool listings, files it has read, command output, and the conversation so far. The window is finite and everything in it competes for the model's attention, so the work is curation: load what the current step needs, keep the rest reachable but out.

This skill does three jobs. It audits what a project loads today, moves each piece of knowledge to the mechanism that loads it at the right moment, and sets the habits that keep a long session usable. The facts below come from the tools' own documentation, not from folklore: where a number appears, it is one the vendor publishes.

## Instructions

### 1. See what is loaded today

Inventory the instruction files from the shell:

```bash
wc -l CLAUDE.md CLAUDE.local.md AGENTS.md GEMINI.md .claude/CLAUDE.md .claude/rules/*.md 2>/dev/null
find . \( -name CLAUDE.md -o -name AGENTS.md -o -name GEMINI.md \) -not -path "*/node_modules/*"
ls .claude/skills .claude/agents .cursor/rules 2>/dev/null
```

Then ask the user to run the tool's own report, because only the tool knows what it really loaded:

| Tool | Check | Shows |
|---|---|---|
| Claude Code | `/context` | token use by category, including the list under **Memory files** |
| Claude Code | `/memory` | every instruction file location and the auto memory folder |
| Claude Code | `/doctor`, `/skill-doctor` | proposed cuts for a checked-in `CLAUDE.md`; context cost and usage of each skill |
| Codex CLI | `codex --ask-for-approval never "Summarize the current instructions."` | the instruction chain it built |
| Gemini CLI | `/memory show` | the concatenated context files |

### 2. Know what loads when

Claude Code documents this behaviour:

| Mechanism | Enters the context | After compaction |
|---|---|---|
| `CLAUDE.md` in the working directory and above, `~/.claude/CLAUDE.md`, `CLAUDE.local.md`, rules without `paths` | at session start, in full, on every request | re-read from disk |
| `.claude/rules/*.md` with `paths:` and `CLAUDE.md` in subdirectories | when a matching file is read | gone until a matching file is read again |
| Auto memory `MEMORY.md` | at start, first 200 lines or 25 KB | re-read from disk |
| Skill | description at start; the body when invoked | invoked bodies re-attached, first 5,000 tokens per skill, 25,000 in total; the description listing is not reloaded |
| Subagent | never: it works in its own window and returns a summary | background ones keep running |
| Hook | never, unless it returns text for the model: plain stdout on `SessionStart` and `UserPromptSubmit`, an `additionalContext` JSON field on other events | `SessionStart` hooks matching `compact` run again |
| MCP server | tool names at start, full schemas when a tool is needed | tool names reload automatically |

Instruction files are delivered as context, not as enforced configuration: the documentation says longer files reduce adherence and gives a target of under 200 lines per file. `@file` imports organise a long file but do not make it cheaper, since imported files load at launch too.

### 3. Put each piece of knowledge where it loads at the right time

Take every section of the existing instruction file and ask, in this order:

1. Must it happen every time with no exceptions (format after each edit, never touch `migrations/`)? Make it a hook or a permission rule. An instruction can be ignored; a hook cannot.
2. Can the agent work it out by reading the code (directory tree, dependency list, standard language style)? Delete it.
3. Does it apply only to some files? Move it to a rule with `paths:` or to an instruction file inside that directory.
4. Is it a multi-step procedure or reference material used now and then (release steps, a migration recipe)? Make it a skill. Add `disable-model-invocation: true` when it has side effects; its description then costs nothing until someone types the command.
5. Is it personal (a sandbox URL, a preferred editor)? `CLAUDE.local.md`, gitignored, or `~/.claude/CLAUDE.md`.
6. What is left, the things needed in every session, stays in the root file.

A path-scoped rule looks like this:

```markdown
---
paths:
  - "src/api/**/*.ts"
---
- Every handler validates its input with the zod schema in the same folder.
- Errors are thrown as `ApiError` from `src/api/errors.ts`, never as a bare `Error`.
```

### 4. Write the root instruction file

It holds what cannot be guessed: commands, conventions that differ from the defaults, traps, and pointers to where decisions live.

```markdown
# Harbor Ledger

## Commands
- Install: `pnpm install`
- One test file: `pnpm vitest run src/invoices/total.test.ts` (the full suite takes 9 minutes; run it only before a PR)
- Type check: `pnpm tsc --noEmit`

## Conventions that differ from the defaults
- Money is integer cents in a `bigint`, never a `number`.
- Dates cross the API as ISO 8601 strings in UTC.

## Traps
- `pnpm db:reset` wipes the local database. Ask before running it.
- Tests need Postgres on port 5433: `docker compose up -d db`.

## Where decisions live
- Domain terms: `docs/ubiquitous-language.md`
- API error format: `docs/adr/0007-error-envelope.md`
```

Write each line so that it can be checked: "Run `pnpm tsc --noEmit` before committing", not "keep the code type-safe". Remove contradictions between files; when two disagree the agent may follow either. Put emphasis ("IMPORTANT") on at most one or two lines. Notes for human maintainers go in block-level HTML comments, which Claude Code strips before loading.

For a team on several tools, keep one shared `AGENTS.md` and let each tool add its own layer:

| Tool | Reads | Worth knowing |
|---|---|---|
| Claude Code | `CLAUDE.md`; `AGENTS.md` directly when no `CLAUDE.md` or `CLAUDE.local.md` exists at or above the working directory (v2.1.277+) | to combine both, make `CLAUDE.md` start with the line `@AGENTS.md` and add Claude-only notes below |
| Codex CLI | `AGENTS.md` from the Git root down to the working directory, plus `~/.codex/AGENTS.md` | stops adding files once the total reaches `project_doc_max_bytes`, 32 KiB by default |
| Gemini CLI | `GEMINI.md`, global in `~/.gemini/`, then workspace | set `context.fileName` in `settings.json` to `["AGENTS.md", "GEMINI.md"]` to share the file |
| Cursor | `.cursor/rules/*.mdc` with `description`, `globs`, `alwaysApply`; also `AGENTS.md` | plain `.md` files in that folder are ignored |

### 5. Brief each task

A good brief names five things and pastes none of them in bulk:

```text
Goal: reject invoices whose line items sum to zero; done when POST /invoices returns 422 for them.
Look at: src/api/invoices/create.ts, src/invoices/total.ts
Copy the pattern in: src/api/payments/create.ts (how it rejects a zero amount)
Constraints: no new dependency; error body follows docs/adr/0007-error-envelope.md
Verify with: pnpm vitest run src/api/invoices/create.test.ts
```

Give paths instead of file contents, since the agent reads what it needs. Give the failing assertion and its stack frame, not the whole log. Give one existing example of the pattern instead of describing the pattern.

### 6. Keep a long session usable

- Start fresh between unrelated tasks (`/clear` in Claude Code). Old conversation crowds out the files the next task needs.
- Before a long new phase, compact with a focus: `/compact Focus on the invoice validation change and the failing test`.
- After two failed corrections of the same mistake, stop correcting. Clear the session and write a better first prompt that includes what you learned.
- Anything said only in conversation is summarised away at compaction. If it must persist, write it into the instruction file.
- For work that spans sessions, have the agent write a handoff note (state, decisions and why, next step, commands to resume) to a file, and open the next session by reading it.
- To restore a few critical lines after every compaction, register a hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "compact", "hooks": [{ "type": "command", "command": "cat notes/handoff.md" }] }
    ]
  }
}
```

### 7. Send bulky work to a subagent

A subagent starts with an empty window. It receives its own system prompt, the delegation message, the `CLAUDE.md` hierarchy (the built-in Explore and Plan agents skip even that) and a git status snapshot. It does not receive the conversation, the files already read, the skills already invoked, or auto memory. So the delegation message must carry the goal, the paths, any rule that matters, and the shape of the answer:

```text
Use a subagent: read logs/import-2026-09-28.log (41 MB) and report only the distinct error
messages with a count and the first timestamp of each, as a table, under 200 words.
Ignore lines from the healthcheck job.
```

Define a reusable one in `.claude/agents/log-reader.md`:

```markdown
---
name: log-reader
description: Reads large log files and returns a short table of distinct errors. Use for any log over a few hundred lines.
tools: Read, Grep, Bash
model: haiku
---
Report distinct error messages with a count and first timestamp. Never paste raw log lines beyond one example per error.
```

Keep the main conversation for work that needs back-and-forth or shares context across phases.

### 8. Check that it worked

Ask the user to run `/context` and confirm each file appears under **Memory files**. Ask the agent a question whose answer exists only in the instruction file. Then watch one real task: a change is confirmed when behaviour shifts, not when the file looks tidy.

## Examples

### Example 1: A 412-line CLAUDE.md the agent has stopped following

Request: "Claude keeps using `number` for money even though CLAUDE.md says not to." The file is 412 lines; the money rule sits on line 287. The agent sorts every section with the questions from step 3:

| Section | Lines | Decision |
|---|---|---|
| Directory tree with a description of each file | 138 | delete: derivable from the code |
| Build, test and lint commands | 14 | keep |
| TypeScript style | 61 | keep the 9 lines that differ from defaults (the money rule among them), delete 52 |
| API handler rules | 47 | `.claude/rules/api.md` with `paths: ["src/api/**/*.ts"]` |
| Database migration procedure | 66 | skill `.claude/skills/db-migration/SKILL.md` |
| Release checklist | 58 | skill `release` with `disable-model-invocation: true` |
| "ALWAYS run prettier after editing" | 3 | `PostToolUse` hook on `Edit\|Write` |
| Gotchas | 25 | keep, tightened to 14 |

Result: the root file goes from 412 lines to 48 (14 + 9 + 14 and 11 of headings and pointers). At session start the agent now loads those 48 lines and one skill description; the API rules arrive when a file under `src/api/` is read, and formatting no longer depends on the model remembering. The user runs `/context`, sees `CLAUDE.md` and no `rules/api.md` until an API file is opened, and the next money field comes out as `bigint`.

### Example 2: A debugging session that got worse after three hours

Request: "It was doing fine and now it re-reads the same files and forgets what we ruled out." The session holds two pasted logs, a dozen file reads and four abandoned fixes. The agent writes `notes/handoff.md`:

```markdown
# Handoff: duplicate webhook deliveries (2026-10-01)

State: reproduced with `pnpm vitest run src/webhooks/retry.test.ts -t "retries once"` (fails 1 in 5 runs).
Ruled out: clock skew (same result with fake timers); queue visibility timeout (set to 300 s, no change).
Leading theory: `markDelivered` runs after the HTTP response is awaited, so a retry timer can fire in between.
Next step: add a test that resolves the HTTP call after the retry timer and expect a single delivery.
Do not touch: `src/webhooks/signature.ts` (unrelated, another branch is changing it).
```

The user runs `/clear` and starts with "Read notes/handoff.md and continue from Next step. Use a subagent to scan logs/webhooks-2026-09-30.log for delivery ids that appear twice and return only the ids and timestamps." The new session begins with 6 lines of state instead of three hours of history, and the 30 MB log never enters the main window.

### Example 3: One repository, three tools

A team uses Claude Code, Codex and Cursor and maintains three diverging rule files. The agent merges them into a 64-line `AGENTS.md`, leaves a two-line `CLAUDE.md` (`@AGENTS.md` and one note on plan mode for `src/billing/`), and converts the file-specific Cursor rules to `.cursor/rules/api.mdc` with `globs: src/api/**`. Check: 64 lines is about 3 KB, well under the 32 KiB at which Codex stops reading.

## Guidelines

- Treat the instruction file like code: change it when the agent repeats a mistake, prune it when the agent already does the right thing unprompted, and judge every edit by whether behaviour changed.
- Do not paste whole documents "for context". Point to the path and name the section; the agent can read it when the step needs it.
- A rule that must survive compaction belongs in the root file or an unscoped rule. Path-scoped rules and nested instruction files are dropped by the summary and return only when a matching file is read again.
- A skill body is truncated to its first 5,000 tokens after compaction, so put its most important instructions at the top. Descriptions cost context on every turn: keep them short, lead with the use case, and expect anything past 1,536 characters to be cut.
- Subagents are not free. Each spends its own tokens, and many detailed reports returning at once can fill the main window. Ask for a bounded answer.
- Never put secrets in instruction files, skills or handoff notes; they are committed, loaded into every session and sent to the model provider.
- Version numbers, limits and command names here are from the vendors' documentation as of October 2026 and change between releases. When behaviour does not match, check the tool's own report (`/context`, `/memory show`) before trusting this file.
- Not the right tool: fixing a wrong answer caused by a missing fact the agent could not know (give it the fact), or enforcing security boundaries (use permissions, sandboxing and hooks, not prose).
