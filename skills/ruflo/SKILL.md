---
name: ruflo
description: >-
  Adds an agent-orchestration layer to Claude Code (and Codex) projects: a CLI plus an MCP server that track swarms, agents, tasks and a searchable project memory, and an init step that writes agent definitions, slash commands, skills and hooks into the repository. Use when a user asks to set up ruflo or claude-flow, run "ruflo init", register the claude-flow MCP server, create a swarm or task list for several Claude Code agents, store and search shared project memory, or diagnose a ruflo install with "ruflo doctor".
license: Apache-2.0
compatibility: "Node.js 20+ and npm; Claude Code installed for the MCP and hook integration. Verified with ruflo 3.71.2."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "multi-agent, orchestration, claude-code, mcp, agent-memory"
  repository: https://github.com/ruvnet/ruflo
---
# Ruflo — Orchestration Layer for Claude Code Agent Teams

## Overview

Ruflo (the new name of claude-flow; the npm package `ruflo` exposes the binaries `ruflo` and `claude-flow`) is a Node.js CLI and MCP server that sits beside Claude Code. It keeps a ledger of swarms, agents and tasks, a local vector-searchable memory (SQLite files under `.swarm/`), and installs a pack of Claude Code assets into the project: agent definitions, slash commands, skills, helper scripts and hooks.

Two things to understand before using it:

- `ruflo agent spawn` and `ruflo swarm init` **register** entries in the coordination ledger (a spawned agent shows status `registered`, then `idle`). They do not start a separate Claude process by themselves. The actual work is still done by Claude Code, which calls the ledger through the MCP server and the generated `CLAUDE.md` instructions.
- `ruflo init` changes the project's Claude Code configuration extensively (245 files in a fresh repository with ruflo 3.71.2, plus hooks, permission entries and plugin entries). Run it deliberately, in a clean git branch.

## Instructions

### Installation and a first look

```bash
npm view ruflo version                 # check the current release (3.71.2 when this was written)
npx ruflo@3.71.2 --help                # no global install needed
npm install --save-dev ruflo@3.71.2    # or pin it in the project
npx ruflo@3.71.2 doctor                       # diagnostics: Node, Claude Code, git, config, memory DB, MCP
```

Main command groups from `--help`: `init`, `start`, `status`, `agent`, `swarm`, `memory`, `task`, `session`, `mcp`, `hooks`, `hive-mind`, `workflow`, `config`, `doctor`, `daemon`, `cleanup`. Run `npx ruflo@3.71.2 <command> --help` for each group's subcommands.

### Initialize a project

Work on a branch so the whole change can be reviewed or dropped:

```bash
git switch -c chore/ruflo-init
npx ruflo@3.71.2 init --no-global --no-signup --no-skills-sh --no-plugin-install
```

The four flags keep the run local: `--no-global` skips the pointer block that `init` otherwise writes into `~/.claude/CLAUDE.md`, `--no-signup` skips the enrollment prompt, `--no-skills-sh` skips the `npx skills add ruvnet/ruflo` registration, and `--no-plugin-install` skips the `claude plugin install` step. Other useful options: `--minimal` (small configuration), `--full` (all components), `--only-claude` (only `.claude/`), `--skip-claude` (only the runtime), `--codex` or `--dual` (also write Codex files), `--all-agents` (about 89 agent definitions instead of the default set), `--force` (overwrite), `--dry-run` (only documented for `--grok`).

What a default init created in a fresh git repository (counts from ruflo 3.71.2):

- `CLAUDE.md` with swarm rules and instructions for Claude Code.
- `.mcp.json` registering an MCP server named `claude-flow` (`npx -y ruflo@latest mcp start`, with `CLAUDE_FLOW_TOPOLOGY=hierarchical-mesh` and `CLAUDE_FLOW_MAX_AGENTS=15` in its env).
- `.claude/settings.json` with hooks for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `PreCompact` and `SubagentStop`, allow rules for `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)` and `mcp__claude-flow__*`, deny rules for `.env` files, and `enabledPlugins` entries for `ruflo-mods@ruflo`, `ruflo-swarm@ruflo` and `ruflo-console@ruflo` (plus `extraKnownMarketplaces.ruflo` and `env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS="1"`). These are written even with `--no-plugin-install`, which only skips the `claude plugin install` step; `--no-mods` is the flag that leaves them out.
- `.claude/agents/` (17 definitions), `.claude/commands/` (16 command groups), `.claude/skills/` (16 skills) and `.claude/helpers/`.
- `.claude-flow/config.yaml` (runtime config: topology `hierarchical-mesh`, `maxAgents: 15`, memory backend `hybrid`) plus `data/`, `logs/`, `sessions/` and `metrics/` folders.
- `.swarm/memory.db` and `.swarm/agentdb-memory.db` (the memory stores).

Review `git diff` and `.claude/settings.json` before committing. The enabled plugins make Claude Code clone `github.com/ruvnet/ruflo` at the first interactive start of a trusted session (headless `claude -p` runs do not clone it; `ruflo doctor` warns that the plugins are unscanned until then), and the plugin `ruflo-swarm` can run host commands; remove those `enabledPlugins` entries if the team does not want that. The generated `.gitignore` lists `.env`, `.claude-flow/data/`, `.claude-flow/logs/` and `.claude-flow/sessions/`; add `.swarm/` if memory should stay local.

### Register the MCP server with Claude Code

`init` already writes `.mcp.json`. To register the server by hand (for example in a project that skipped `init`); the README shows `npx ruflo@latest`, the pinned form below runs the same command:

```bash
claude mcp add claude-flow -- npx ruflo@3.71.2 mcp start
npx ruflo@3.71.2 mcp tools        # lists the tools the server exposes, grouped (Agent, Swarm, ...)
npx ruflo@3.71.2 mcp status
```

`ruflo doctor` warns that the server advertises hundreds of tools (385 in 3.71.2, roughly 74,000 tokens of schema). `ruflo mcp toggle` enables or disables individual tools if that overhead is a problem.

### Swarms, agents and tasks

```bash
npx ruflo@3.71.2 swarm init --topology hierarchical --max-agents 6   # prints a Swarm ID
npx ruflo@3.71.2 swarm status
npx ruflo@3.71.2 agent spawn -t coder -n api-coder                   # registers an agent
npx ruflo@3.71.2 agent list
npx ruflo@3.71.2 task create -t implementation -d "Add refresh tokens to the auth service"
npx ruflo@3.71.2 task list
```

`agent spawn` also accepts `-p` (provider: anthropic, openrouter or ollama), `-m` (model), `--task` and `--timeout`. `swarm init` accepts `-s` for the coordination strategy and `--v3-mode`. `task` subcommands: `create`, `list`, `status`, `cancel`, `assign` (`npx ruflo@3.71.2 task assign task-1793835805465-u1h2xt --agent agent-1793835805253-5lym48`; the tables from `task list` and `agent list` cut IDs short, so use the full ID that `task create` and `agent spawn` print), `retry`.

### Shared memory

```bash
npx ruflo@3.71.2 memory store -k auth-pattern -v "refresh tokens rotate on every use"
npx ruflo@3.71.2 memory search -q "token rotation"        # semantic search, 384-dim local embeddings
npx ruflo@3.71.2 memory list
npx ruflo@3.71.2 memory stats
npx ruflo@3.71.2 memory peek                              # read-only: which store files this directory uses
```

CLI writes land in `.swarm/memory.db` and are mirrored into `.swarm/agentdb-memory.db`, the store the MCP tools write to; `memory peek` shows both with their row counts. When the stores hold different entries, `memory search` prints a partial-result warning with the extra `--path` to read the other store. `memory delete` and `memory purge` act on both stores unless `--path` selects one.

### Removing it again

```bash
npx ruflo@3.71.2 cleanup            # dry run (the default): lists the artifacts it would remove
npx ruflo@3.71.2 cleanup --force --keep-config   # deletes them, keeping claude-flow.config.json and .claude/settings.json
```

It removed `.claude/helpers/`, the ruflo hooks in `.claude/settings.json`, `.claude-flow/` and `.swarm/` in a test run, and left `CLAUDE.md`, `.mcp.json` and the `.claude/agents`, `commands` and `skills` folders, so delete those by hand. Read the dry-run list first, then review `git status` afterwards; `git restore` and deleting the branch also undo an `init` that was never committed.

## Examples

### Example 1: Set up ruflo in an existing API repository

Request: "Install ruflo in the orders-api repo so Claude Code can work with a shared task list, but keep my global Claude settings untouched."

```bash
cd ~/work/orders-api
git switch -c chore/ruflo-init
npx ruflo@3.71.2 init --no-global --no-signup --no-skills-sh --no-plugin-install
npx ruflo@3.71.2 doctor
git status --short | head
```

Result: `init` reports "RuFlo V3 initialized successfully" with a summary of created directories and files, and lists `.mcp.json`, `.claude/settings.json` and `CLAUDE.md`. `doctor` shows green checks for Node, Claude Code, git, the config file, the memory database and the MCP server entry, plus warnings for things that are optional (daemon not running, no `agent-browser`, a large MCP tool schema). The agent then opens the diff, removes the `enabledPlugins` block it does not want, and commits the branch for review.

### Example 2: Plan a feature as a task list and keep decisions in memory

Request: "Break the refresh-token work into tasks, and save the decision about rotation so the next session finds it."

```bash
cd ~/work/orders-api
npx ruflo@3.71.2 swarm init --topology hierarchical --max-agents 4
npx ruflo@3.71.2 agent spawn -t coder -n auth-coder
npx ruflo@3.71.2 agent spawn -t tester -n auth-tester
npx ruflo@3.71.2 task create -t implementation -d "Rotate refresh tokens on every use in POST /auth/refresh"
npx ruflo@3.71.2 task create -t testing -d "Add integration tests for refresh-token reuse detection"
npx ruflo@3.71.2 task list
npx ruflo@3.71.2 memory store -k auth-decision -v "Refresh tokens are single-use; reuse revokes the whole session family"
npx ruflo@3.71.2 memory search -q "refresh token reuse"
```

Result: `swarm init` prints a Swarm ID and the table of topology, max agents and protocol; each `agent spawn` prints an ID and status `registered`; `task list` shows two `pending` tasks; the memory search returns `auth-decision` with a similarity score. Claude Code, started afterwards in the same repository, reads `CLAUDE.md`, calls the MCP tools and does the implementation and tests itself.

## Guidelines

- Pin the version (`ruflo@3.71.2`) in commands and docs. The generated `.mcp.json` uses `ruflo@latest`, so change it to the pinned version if the team wants reproducible behavior.
- If the project already has a `.claude/settings.json` with auto-approve keys (`enableAllProjectMcpServers`, `bypassPermissions`, blanket `Bash` allows), `init` stops instead of merging. Choose `--drop-risky-settings` to write the merge without them, or `--keep-risky-settings` to carry them over (both from `ruflo init --help`; the stop itself was not triggered in the test).
- Treat `init` as a large configuration change: use a branch, read the diff, and look at the hooks and allow rules in `.claude/settings.json`. The hooks run on every tool call and prompt.
- The enabled `ruflo-*` plugins are third-party code that runs with the user's permissions. Do not enable them on a machine or in a project where that is not acceptable.
- Registering an agent or a task does not run it. Do not report work as done because `task list` shows an entry; check the repository itself.
- Memory stores are plaintext SQLite files (`doctor` warns "Encryption at Rest: Off"). Never store secrets in them, and keep `.swarm/` out of public repositories.
- For a single agent working alone, plain Claude Code is simpler. Use ruflo when several agents or sessions need one shared ledger and memory.
- `ruflo doctor --fix` only prints suggested commands for the warnings; it does not apply them, so read them before running any.
- Run `ruflo doctor` first when something does not work; most failures are a missing Node version, a missing `.claude-flow/config.yaml` or an MCP server that is not registered.
