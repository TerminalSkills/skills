---
name: openspec
description: >-
  OpenSpec is a command-line tool plus a set of slash commands that make an AI
  coding agent write a reviewable plan — proposal, requirements with scenarios,
  design and task list — before it changes any code. Use when a user asks to
  set up spec-driven development, run openspec init, propose a change with
  /opsx:propose, write a spec before coding, validate or archive an OpenSpec
  change, or keep requirements in the repository for Claude Code, Codex,
  Gemini CLI or Cursor.
license: Apache-2.0
compatibility: "Node.js 20.19.0 or higher; installed with npm, pnpm, bun or Homebrew; works with AI coding tools supported by openspec init (Claude Code, Codex, Gemini CLI, Cursor and others)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["spec-driven-development", "ai-coding-agents", "requirements", "planning", "cli"]
  repository: https://github.com/Fission-AI/OpenSpec
---
# OpenSpec — Agree on the spec before the agent writes code

## Overview

OpenSpec keeps two things in an `openspec/` folder in the repository: specs that describe how the system behaves today, and changes that propose how it should behave next. Each change holds a proposal, delta specs, a design and a task list, all in plain Markdown. The human reviews the plan, the agent implements the tasks, and archiving merges the deltas into the main specs.

## Instructions

### Installation

```bash
node --version                      # must be 20.19.0 or higher
npm install -g @fission-ai/openspec@latest
openspec --version                  # 1.13.2 at the time of writing
```

Alternatives: `brew install openspec`, `pnpm add -g @fission-ai/openspec@latest`, `bun add -g @fission-ai/openspec@latest`.

### Initialize a project

Run `init` in the repository root and name the tools, so that no interactive prompt appears:

```bash
cd ~/code/invoice-api
openspec init --tools claude,codex,gemini
```

This creates `openspec/specs/`, `openspec/changes/` and `openspec/config.yaml`, and writes skill and command files for each tool (`.claude/`, `.gemini/`, and `.agents/skills/` for Codex). Tool IDs include `claude`, `codex`, `gemini`, `cursor`, `github-copilot`, `cline`, `continue`, `opencode`, `zed`; `all` and `none` are also accepted. Restart the assistant afterwards, because most tools load commands at startup.

### Where each command runs

`openspec ...` commands run in the terminal. `/opsx:...` commands are typed into the AI assistant's chat. The spelling depends on the tool:

| Tool | How to start a proposal |
|---|---|
| Claude Code, Gemini CLI | `/opsx:propose add-login-rate-limit` |
| Cursor, GitHub Copilot | `/opsx-propose add-login-rate-limit` |
| Codex | `$openspec-propose add-login-rate-limit` |

### The core workflow

The default `core` profile installs six commands:

```text
/opsx:explore          think through an idea; writes nothing unless asked
/opsx:propose NAME     create the change folder with proposal, specs, design and tasks
/opsx:apply            implement the tasks and tick them off in tasks.md
/opsx:update           revise the plan and keep the artifacts consistent
/opsx:sync             merge delta specs into openspec/specs/ without archiving
/opsx:archive          merge the deltas and move the change to changes/archive/
```

Six more (`/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard`) belong to the expanded set. The user enables them with `openspec config profile`, which is an interactive picker, and then runs `openspec update` in the project.

### Drive a change from the terminal

An agent can run the whole planning loop with the CLI. All commands below except `archive` accept `--json`.

```bash
openspec new change add-login-rate-limit \
  --description "Rate-limit POST /auth/login to 5 attempts per minute per IP"
openspec status --change add-login-rate-limit            # which artifact is next
openspec instructions proposal --change add-login-rate-limit   # template and rules for it
openspec validate add-login-rate-limit --strict
openspec list                                            # active changes with task progress
openspec list --specs                                    # capabilities in openspec/specs/
openspec show auth --type spec --json --no-scenarios
openspec archive add-login-rate-limit --yes
```

Change names are lowercase kebab-case. Artifacts are written in dependency order: proposal, then specs and design, then tasks. `openspec status` marks the ones that are blocked.

### Write delta specs

A change describes its effect on the specs in `openspec/changes/NAME/specs/CAPABILITY/spec.md`:

```markdown
## Purpose

Rules for authenticating users and protecting the login endpoint.

## ADDED Requirements

### Requirement: Login rate limit
The system SHALL reject more than 5 login attempts per minute from the same client IP.

#### Scenario: Sixth attempt within a minute
- **WHEN** a client sends a sixth POST /auth/login within 60 seconds
- **THEN** the system responds with HTTP 429 and a Retry-After header
```

Use `## ADDED Requirements` for new behaviour, `## MODIFIED Requirements` with the full new text for changed behaviour, and `## REMOVED Requirements` for behaviour that goes away. Every requirement needs `SHALL` or `MUST` and at least one `#### Scenario:` block. `## Purpose` is only used when the capability is new. A change without any spec delta fails validation unless its `.openspec.yaml` contains `skip_specs: true`.

### Project configuration

`openspec/config.yaml` injects project knowledge into every artifact the agent writes:

```yaml
schema: spec-driven

context: |
  Tech stack: TypeScript, Express 5, PostgreSQL 16, Redis 7
  All public endpoints are documented in docs/api.md
  We keep backwards compatibility for /v1 routes

rules:
  proposal:
    - Include a rollback plan
  specs:
    - Cover at least one error case per requirement

operations:
  apply:
    guidance:
      - Run the focused test file before the full suite
```

`context` appears in all artifacts, `rules` only in the matching one. Changes take effect immediately.

### Update and telemetry

```bash
npm install -g @fission-ai/openspec@latest
openspec update                              # run inside each project
openspec config set telemetry.enabled false  # global setting, not per project
```

OpenSpec collects anonymous command names and the version. `OPENSPEC_TELEMETRY=0` or `DO_NOT_TRACK=1` in the environment also turns this off, and so does a truthy `CI` variable.

## Examples

### Example 1: Set up OpenSpec for a team that uses three agents

**User request:** "We use Claude Code, Codex and Gemini CLI. Set up OpenSpec in this repo so all of them plan changes the same way."

```bash
cd ~/code/invoice-api
openspec init --tools claude,codex,gemini
```

**Result:**

```text
OpenSpec Setup Complete

Created: Claude Code, Codex, Gemini CLI
6 skills and 6 commands in .claude, .agents, .gemini/
Commands skipped for: codex (uses skills)
Config: openspec/config.yaml (schema: spec-driven)

Getting started:
  Start your first change: /opsx:propose "your idea" (Claude Code, Gemini CLI)
  Start your first change: $openspec-propose "your idea" (Codex CLI or IDE)
```

Commit the `openspec/` folder like source code. A developer who clones the repository runs `openspec update` there if the command files for their tool are missing.

### Example 2: Plan, validate and archive a change

**User request:** "Plan rate limiting for the login endpoint, and do not write code until I have approved the spec."

```bash
openspec new change add-login-rate-limit \
  --description "Rate-limit POST /auth/login to 5 attempts per minute per IP"
openspec instructions proposal --change add-login-rate-limit
# write proposal.md and specs/auth/spec.md, then:
openspec validate add-login-rate-limit
```

The first draft of the spec had no scenario, so validation fails with exit code 1:

```text
Change 'add-login-rate-limit' has issues
⚠ [WARNING] auth/spec.md: ADDED "Login rate limit" should contain SHALL or MUST (RFC 2119 best practice for English specs)
✗ [ERROR] auth/spec.md: ADDED "Login rate limit" must include at least one scenario
```

After the requirement is rewritten as shown under "Write delta specs":

```bash
openspec validate add-login-rate-limit
openspec status --change add-login-rate-limit
```

```text
Change 'add-login-rate-limit' is valid
Change: add-login-rate-limit
Schema: spec-driven
Progress: 2/4 artifacts complete

[x] proposal
[x] specs
[ ] design
[-] tasks (blocked by: design)
```

Once the user has approved the plan and all tasks in `tasks.md` are ticked:

```bash
openspec list
openspec archive add-login-rate-limit --yes
```

```text
Changes:
  add-login-rate-limit     ✓ Complete    just now

Task status: ✓ Complete

Specs to update:
  auth: create
Applying changes to openspec/specs/auth/spec.md:
  + 1 added
Totals: + 1, ~ 0, - 0, → 0
Specs updated successfully.
Change 'add-login-rate-limit' archived as '2026-09-30-add-login-rate-limit'.
```

## Guidelines

- **Stop for review after planning.** The point of the tool is that a person reads the proposal and specs before code is written. Do not run `/opsx:apply` or start implementing in the same turn that created the plan unless the user asked for that.
- **`--yes` skips the safety question.** `openspec archive NAME --yes` archives a change even when tasks are unchecked and only prints a warning. Check `openspec list` first. `openspec validate --archived` exits non-zero when an archived change has open tasks, which makes it a useful pre-commit check.
- **Agents need `--yes` and a name.** Without a terminal, `openspec archive` cannot ask for confirmation and exits with code 1.
- **Interactive commands.** `openspec init` without `--tools`, `openspec view`, `openspec config profile` without a preset and `openspec config edit` need a terminal. The only profile preset is `core`.
- **`init` cleans up old files.** With `--tools`, files from older OpenSpec versions are removed without a question, including legacy OpenSpec prompts in `~/.codex/prompts`. Tell the user before running it in a project that used an older version.
- **Generated files belong to OpenSpec.** `openspec update` may overwrite skill and command files. Keep custom instructions in `openspec/config.yaml` or in the project's own agent file.
- **Upgrade the CLI before `openspec update`.** An outdated CLI reports everything as up to date and cannot write newer workflows.
- **OpenSpec never touches git.** Branching, committing and pull requests stay with the user. On a team, review the proposal and delta specs in the pull request and archive after the merge.
- **One intent per change.** Split a change when its proposal reads like a list of unrelated features. Keep implementation details in `design.md`, and behaviour in the specs.
- **Removing a capability is explicit.** When a change removes the last requirement of a capability, add `retire_capabilities: true` to its `.openspec.yaml`; otherwise archiving stops.
- **When not to use it.** Skip the ceremony for typo fixes, dependency bumps and one-line changes. OpenSpec does not run tests or check code against the spec by itself; it structures the plan, and the verification still has to be done.
