---
name: squad-agents
description: >-
  Build AI agent teams that collaborate on projects using Squad framework. Use when:
  orchestrating multiple specialized agents, building collaborative AI workflows,
  delegating complex tasks across agent teams.
license: MIT
compatibility: "Node.js 22.5+, npm 10+, Git, GitHub CLI (gh), GitHub Copilot CLI or VS Code with Copilot"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: [agents, multi-agent, orchestration, collaboration, squad]
  repository: https://github.com/bradygaster/squad
---

# Squad Agents

## Overview

Squad gives you an AI development team through GitHub Copilot. Describe what you're building and get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. Each team member runs in its own context, reads only its own knowledge, writes back what it learned, and persists across sessions.

Squad is alpha software (CLI 0.13.x): commands and file layout change between releases. The `squad` CLI sets up and maintains the team; the conversation itself happens in the GitHub Copilot CLI or in VS Code Copilot Chat.

## Instructions

### Installation

```bash
node --version                            # 22.5.0 or newer
npm install -g @bradygaster/squad-cli
npm install -g @github/copilot            # GitHub Copilot CLI, runs the team
squad --version
```

### Initialize in Your Project

```bash
cd ~/projects/recipe-app
git init  # if not already a repo
squad init
```

This creates `.squad/` (team state), `.github/agents/squad.agent.md` (the coordinator Copilot loads), `.github/skills/`, four GitHub Actions workflows in `.github/workflows/` and `.mcp.json`; it also writes `.gitignore`, `.gitattributes`, `.copilot/mcp-config.json` and `.vscode/settings.json` (makes Squad the default chat mode; skip with `--no-vscode-default`). The roster in `.squad/team.md` stays empty until you describe the project to Copilot. It is safe to run again.

- `squad init --preset default` starts with a ready-made team (lead, reviewer, devrel, security, docs) instead of an empty roster.
- `squad init --roles` uses plain role names (Lead, Backend, Tester) instead of names cast from a fictional universe.
- `squad init --no-workflows` skips the GitHub Actions files.

### Authenticate GitHub

```bash
gh auth login
gh auth status  # verify: "Logged in to github.com"
```

Needed for issues, pull requests and the work monitor (Ralph).

### Launch with Copilot

```bash
copilot --agent squad --yolo
```

`--yolo` grants every tool, path and URL permission without prompting; leave it out to approve each call. In VS Code, open Copilot Chat and pick the **Squad** agent instead.

Then describe your project to generate the team:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

Squad proposes 3–7 members; answer `yes`, or adjust first ("add a designer", "remove the tester").

### Core Commands

| Command | Description |
|---------|-------------|
| `squad init` | Scaffold Squad in the current directory |
| `squad upgrade` | Update Squad-owned files; never touches team state |
| `squad upgrade --self` | Update the CLI package itself |
| `squad status` | Show active squad and status |
| `squad doctor` | Diagnose setup issues |
| `squad roles` | List the 21 built-in roles (`--search writer` to filter) |
| `squad triage` | Watch issues and auto-triage to team members |
| `squad copilot` | Add the `@copilot` coding agent to the team (`--off` removes it) |
| `squad cost` | Report token usage from the orchestration logs |
| `squad nap` | Compress, prune, archive context |
| `squad export` | Export squad to portable JSON snapshot (`squad-export.json`; `--out` sets the path) |
| `squad import squad-export.json` | Import squad from export file |

Running `squad` with no arguments opens an interactive shell that is deprecated; use `copilot --agent squad`.

### Inter-Agent Communication

Agents communicate through shared files in `.squad/`:

```
.squad/
├── team.md              # Roster — who is on the team
├── routing.md           # Which member handles which kind of work
├── decisions.md         # Shared decision log every agent reads before working
├── decisions/inbox/     # Drop-box for parallel writes, merged by Scribe
├── agents/
│   └── ripley/
│       ├── charter.md   # Identity, expertise, voice
│       └── history.md   # What this member has learned about the project
├── casting/             # Name registry, so names persist
├── skills/              # Compressed learnings from work
├── identity/            # now.md (current focus), wisdom.md (patterns)
├── log/                 # Session history
└── orchestration-log/   # What was spawned, why, and what happened
```

There are no handoff files: an agent writes a decision to `decisions/inbox/`, the built-in **Scribe** merges it into `decisions.md`, and every other agent reads that file before it starts. Commit `.squad/` so the team travels with the repository; the generated `.gitignore` keeps `log/`, `orchestration-log/` and `decisions/inbox/` out of it.

### Issue Triage (Ralph)

```bash
squad triage                          # poll GitHub issues every 10 minutes and triage them
squad triage --interval 5             # poll every 5 minutes
squad triage --execute                # also start Copilot sessions on actionable issues
touch .squad/ralph-stop               # finish the current round and exit
```

An issue labeled `squad` goes to the Lead for triage; `squad:ripley` routes it to that member.

### Context Hygiene

```bash
squad nap           # Standard compression
squad nap --deep    # Aggressive pruning
squad nap --dry-run # Preview what would change
```

Inside a session, "Team, take a nap" does the same.

## Examples

### Example 1: Full-Stack Web App Team

A developer initializes Squad for a recipe-sharing application:

```bash
cd ~/projects/recipe-app
npm init -y && git init
npm install -g @bradygaster/squad-cli
squad init
copilot --agent squad --yolo
```

`squad init` lists the files it created and then prints:

```
Squad initialized. Run copilot --agent squad and tell it what you're building.
```

Prompt: "Build a recipe sharing app with React frontend and Express API. I need auth, CRUD for recipes, and image uploads."

Squad proposes a roster with names from one fictional universe, for example:

```
Hicks    — Lead          scope, decisions, code review
Ripley   — Frontend Dev  React, UI, components
Dallas   — Backend Dev   Node.js, APIs, database
Lambert  — Tester        tests, quality, edge cases
Scribe   — (silent)      memory, decisions, session logs
```

After `yes`, each member gets a folder such as `.squad/agents/ripley/` with `charter.md` and `history.md`. "Team, build the recipe listing page" starts them in parallel: Hicks defines the API contract, Dallas builds `GET /api/recipes`, Ripley builds the list component, and Lambert writes tests from the requirements at the same time. Scribe records the contract in `.squad/decisions.md`, so the next session starts from it.

### Example 2: Research and Documentation Team

A team lead uses Squad for a technical research project:

```bash
cd ~/projects/llm-benchmark-report
git init && squad init
squad roles --search writer
copilot --agent squad --yolo
```

`squad roles --search writer` prints the matching built-in role:

```
  📝  docs  Technical Writer  "Turns complexity into clarity. If the docs are wrong, the product is wrong."
```

Prompt: "Research and write a comprehensive report on LLM inference optimization techniques. Cover quantization, KV-cache, speculative decoding, and batching strategies. I need a researcher, a data analyst and a technical writer."

Squad casts the three roles next to the agents `squad init` already created: **Scribe** (memory), **Ralph** (work monitor), **Rai** (responsible-AI review) and a **Fact Checker** that source-checks claims, URLs and version numbers before output ships. The researcher logs a decision — "Focus on open-weight models (Llama 3, Mistral) for reproducible benchmarks" — the analyst builds throughput-versus-latency tables, and the writer drafts `docs/report.md`.

When the report is done, keep the trained team for the next project:

```bash
squad nap --dry-run
squad export --out snapshots/llm-report-team.json
```

```
✓ Exported squad to snapshots/llm-report-team.json
⚠️ Review agent histories, decisions, and team content before sharing — they may contain project-specific information
```

In another repository, `squad import snapshots/llm-report-team.json` restores it; if a squad already exists there, add `--force` and the old one is archived to a folder such as `.squad-archive-2026-10-01T17-01-29-997Z`.

## Guidelines

- Start small with 2-3 team members and add specialists as the project grows
- Give each agent a well-defined scope to avoid overlapping work; scopes live in `.squad/routing.md`
- Record architectural choices as decisions ("Team, we decided to use cursor pagination") so they land in `.squad/decisions.md` and prevent conflicts
- Enable auto-triage with `squad triage --interval 5` to keep work flowing
- Run `squad export` regularly to create snapshots for backup and sharing; review the file first, since it contains agent histories and decisions
- Use `squad nap` periodically to keep context fresh and within limits; closing the session does not compact anything
- Run `squad doctor` if GitHub integration or agent communication breaks
- `--yolo` lets agents run any command and edit any file without asking. Use it in a repository under version control, review the diff before merging, and drop the flag for work you want to approve step by step
- Squad runs on GitHub Copilot (CLI or VS Code) and needs Copilot access; for a single small change one plain Copilot session is faster than a team
- After upgrading the CLI (`npm install -g @bradygaster/squad-cli@latest`), run `squad upgrade` in each project to refresh `squad.agent.md`, templates and workflows
- See [GitHub Repository](https://github.com/bradygaster/squad) for full documentation
