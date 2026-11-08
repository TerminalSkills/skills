---
name: bmad-method
description: >-
  BMad Method installs a set of agile planning and delivery skills (product brief, PRD, architecture, epics and stories, build, code review) and role agents (analyst, PM, architect, developer, UX designer) into a project so a coding agent works from written decisions instead of a chat history. Use when a user asks to "set up BMad", "install bmad-method", "run bmad-build", "plan a feature with a PM and architect agent", "spec then build with Claude Code, Codex or Cursor", or "keep project context across agent sessions".
license: Apache-2.0
compatibility: "Node.js 20.12+, Python 3.10+, uv, git; a coding agent that loads skills (Claude Code, Codex, Cursor and others); stable release 6.12.x"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "bmad, agile, spec-driven-development, ai-agents, planning"
  repository: https://github.com/bmad-code-org/BMAD-METHOD
---
# BMad Method — agile, spec-first delivery for AI coding agents

## Overview

BMad is an MIT-licensed method shipped as a package of agent skills. The installer copies skills into your coding tool's skills folder and writes small config files; after that, everything happens inside the agent: you invoke a skill by name and it walks you through planning or building and saves its output as files. The point is that product and technical decisions live in the repository, so a new session starts from them.

The project ships on two lines. The stable line is v6.12 (this skill), installed with `npx bmad-method install`. The `main` branch is a v7 preview alpha with a different install path (`npx skills add ...` and a `bmad setup` step) and expects breaking changes; do not mix the two in one project. Neighbouring tools: `spec-kit` and `openspec` give a lighter spec file workflow; use BMad when you also want role agents, PRD and architecture documents, and a sprint plan.

## Instructions

### Install (non-interactive, v6.12)

Run it from the project root. `--tools` is required for a non-interactive install; list valid IDs first.

```bash
npx bmad-method@6.12.4 install --list-tools
npx bmad-method@6.12.4 install --modules bmm --tools claude-code --yes --user-name Dana --communication-language English
```

Useful flags (all from `install --help`): `--directory <path>`, `--modules bmm,bmb`, `--tools claude-code,codex`, `--output-folder <path>` (default `_bmad-output`), `--document-output-language`, `--set <module>.<key>=<value>` (see `--list-options`), `--action install|update|quick-update` for an existing install, `--channel stable|next`, `--pin CODE=TAG`.

Tool IDs map to skills folders: `claude-code` writes `.claude/skills`; `codex`, `cursor`, `github-copilot`, `gemini`, `opencode` and many others write `.agents/skills`; some tools have their own folder (`cline` uses `.cline/skills`, `kiro` uses `.kiro/skills`).

What a run creates in the project (checked with a Claude Code install of `bmm`):

- `.claude/skills/bmad-*` — 29 skills (names below)
- `_bmad/config.toml` and `_bmad/config.user.toml` — installer-managed, regenerated on every install, do not hand-edit
- `_bmad/custom/config.toml` (team, commit it) and `_bmad/custom/config.user.toml` (personal, keep out of git) — your overrides, never touched by the installer
- `_bmad/bmm/config.yaml`, `_bmad/_config/bmad-help.csv` (catalog of skills), `_bmad/scripts/`
- `_bmad-output/` — where planning and implementation artifacts are written

Skills render their workflows with `uv run` scripts under `_bmad/scripts/`, so `uv` must be on PATH. Commit `_bmad/custom/` and the artifacts you want to keep; decide per team whether `.claude/skills` is committed or reinstalled in CI.

### The skills and agents

Phases follow the catalog in `bmad-help.csv`:

| Skill | Use |
|---|---|
| `bmad-help` | says where you are and which skill is next |
| `bmad-brainstorming`, `bmad-forge-idea`, `bmad-deep-recon` | ideas, stress-testing an idea, research with sources |
| `bmad-product-brief`, `bmad-prfaq` | capture the product idea (brief or Working Backwards press release) |
| `bmad-prd`, `bmad-ux` | PRD (create, update, validate) and UX decisions |
| `bmad-spec` | condense any input into a short SPEC.md |
| `bmad-architecture` | architecture decisions that keep features consistent |
| `bmad-create-epics-and-stories` | epics and stories with acceptance criteria |
| `bmad-sprint-planning` | readiness check (PASS/CONCERNS/FAIL) and the sprint status file |
| `bmad-build` | clarify, plan, implement, review, present |
| `bmad-code-review`, `bmad-review`, `bmad-walkthrough` | review a diff, a document, or walk a human through a change |
| `bmad-qa-generate-e2e-tests` | API and end-to-end tests for built code |
| `bmad-correct-course`, `bmad-retrospective` | handle a mid-sprint change, close an epic |
| `bmad-project-context` | write verified commands and conventions into the repo's agent instructions |
| `bmad-customize`, `bmad-party-mode`, `bmad-advanced-elicitation` | override behavior, multi-agent discussion, push a draft further |

Role agents are skills too: `bmad-agent-analyst` (Mary), `bmad-agent-pm` (John), `bmad-agent-architect` (Winston), `bmad-agent-dev` (Amelia), `bmad-agent-ux-designer` (Sally). Ask for one by name or by role to talk to that persona. `bmad-build-auto` runs one iteration of an unattended loop and is meant to be started by an orchestrator, not by hand.

### Invoke

In Claude Code type the skill as a slash command: `/bmad-build add CSV export to the invoices table`. In other tools, ask the agent to run the skill by name (for example "run the bmad-prd skill"). Ask `/bmad-help what should I do next` at any point. `bmad-build` asks clarifying questions, shows a plan for approval, implements, reviews its own work, and presents what changed. Small, clear changes go straight through; large ones should go through `bmad-prd`, `bmad-architecture` and `bmad-create-epics-and-stories` first.

### Customize and update

Put team rules in `_bmad/custom/config.toml`, for example a changed agent description:

```toml
[agents.bmad-agent-pm]
description = "Prefers short, bulleted PRDs over narrative drafts."
```

For per-skill changes (templates, persistent facts, hooks) ask `bmad-customize`; it writes TOML under `_bmad/custom/` and checks the merge. To update, re-run the installer with `--action update` (or `quick-update`) and the same `--modules` and `--tools`. A fresh install does not include the old v6 skill IDs (`bmad-create-prd`, `bmad-quick-dev` and 19 more); add `--shims` to the install if existing prompts or docs still call them. Each shim only forwards to the new skill, and shims are scheduled for removal in v7.

## Examples

### 1. Plan and build a small feature from scratch

Request: "Set up BMad in the invoice-reminders repo for Claude Code and plan the reminder feature."

```bash
cd ~/work/invoice-reminders
git status --short
npx bmad-method@6.12.4 install --modules bmm --tools claude-code --yes --user-name Dana
claude
```

Then in the session: `/bmad-help I have a half-formed idea: email reminders 3 days before an invoice is due`, `/bmad-product-brief`, `/bmad-prd`, `/bmad-architecture`, `/bmad-create-epics-and-stories`, `/bmad-sprint-planning`, and `/bmad-build` for the first story. Result: `_bmad-output/planning-artifacts/` holds the brief, PRD, architecture and epics; `_bmad-output/implementation-artifacts/` holds the sprint status and build specs; the code change is a normal diff to review.

### 2. Add BMad for a team that uses Claude Code and Codex

Request: "Install BMad for both agents, keep our PM tone rule in git, and leave generated output out of review noise."

```bash
npx bmad-method@6.12.4 install --modules bmm --tools claude-code,codex --yes --user-name Dana
printf '%s\n' '[agents.bmad-agent-pm]' 'description = "Writes PRDs as short bulleted lists with a risks section."' >> _bmad/custom/config.toml
git add _bmad/custom/config.toml
git status --short | head
```

Result: `.claude/skills` and `.agents/skills` each contain the `bmad-*` skills, the override file is staged, and both agents see the same method. Developers on Codex invoke `bmad-build` by name.

## Guidelines

- Install the stable line (`bmad-method@6.12.4`) unless the owner asks for the v7 preview; its install path, skill set and docs change often.
- Run the installer in a clean git state so the added folders are easy to review. The installer writes only inside the target directory.
- Never edit `_bmad/config.toml` or `config.user.toml`; use `_bmad/custom/` instead.
- Skills execute `uv run` scripts from `_bmad/scripts/`. If `uv` is missing a skill halts; install uv first.
- BMad is a process, not a guarantee: read the plan `bmad-build` shows you and review the diff before merging.
- Do not use the full planning chain for a typo or a config tweak; call `bmad-build` directly or skip BMad.
- "BMad" and related names are trademarks of BMad Code, LLC; the code is MIT licensed.
- Docs: https://docs.bmad-method.org/
