---
name: opencode
description: >-
  OpenCode is an open-source AI coding agent that runs in the terminal, reads a
  codebase, edits files and runs shell commands using any of 75+ model providers
  or a local model. Use it to set up OpenCode, write opencode.json, choose models
  and providers, restrict permissions, create custom agents and slash commands,
  add MCP servers, or script it with `opencode run` in CI. Trigger phrases:
  "install opencode", "configure opencode.json", "use opencode with Ollama",
  "opencode run in CI", "opencode plan mode", "create an opencode agent",
  "open-source alternative to Claude Code".
license: Apache-2.0
compatibility: "macOS, Linux, or Windows (WSL recommended); npm, Homebrew, or a release binary; an API key for at least one LLM provider or a local OpenAI-compatible server such as Ollama"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["ai-coding-agent", "terminal", "cli", "open-source", "llm"]
  repository: https://github.com/anomalyco/opencode
---
# OpenCode — Open-Source Terminal Coding Agent

## Overview

OpenCode (formerly `sst/opencode`, now `anomalyco/opencode`, MIT licensed) is an AI coding agent with a terminal UI, a desktop app and a headless mode. It reads the project, edits files, runs shell commands and keeps sessions that can be undone, shared or resumed. It is not tied to one vendor: models come from the Models.dev catalogue (Anthropic, OpenAI, Google, Bedrock, OpenRouter, Groq and many more) or from a local server such as Ollama or LM Studio.

Two primary agents ship with it: **build** (full access, the default) and **plan** (for analysis: file edits denied except plan files in `.opencode/plans/`, but bash is **allowed** unless you restrict it; see the config below). Subagents such as **general** and **explore** are called by the primary agent or with `@general` / `@explore` in a message. Everything is configured in `opencode.json` plus Markdown files under `.opencode/`.

## Instructions

### Install

```bash
# Node.js package (bun, pnpm and yarn global installs also work)
npm install -g opencode-ai

# Homebrew, macOS and Linux; the project's own tap is updated first
brew install anomalyco/tap/opencode

# Arch Linux
sudo pacman -S opencode

# Any OS through mise
mise use -g github:anomalyco/opencode

opencode --version
```

On Windows use WSL, or `scoop install opencode` / `choco install opencode`. A container image is published as `ghcr.io/anomalyco/opencode`. The official installer can also be downloaded and inspected before running it:

```bash
curl -fsSL https://opencode.ai/install -o install-opencode.sh
bash install-opencode.sh
```

Update with `opencode upgrade` (or pin with `opencode upgrade v1.18.33`). Set `"autoupdate": false` in the config to stop start-up updates.

### Connect a model provider

Inside the TUI run `/connect`, pick a provider and paste the key; from the shell use `opencode providers login` (alias `opencode auth login`). Keys are stored in `~/.local/share/opencode/auth.json`. Standard provider variables already in the environment or in a project `.env` are also picked up.

```bash
export ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"   # created at console.anthropic.com
opencode providers list        # stored credentials and detected env variables
opencode models anthropic      # exact provider/model IDs to put in the config
opencode models --refresh      # re-fetch the catalogue from models.dev
```

### Start a project

```bash
cd ~/code/invoice-service
opencode                       # opens the TUI in this directory
```

In the TUI, type `/init` once: it scans the repo and writes `AGENTS.md` with build, test and convention notes. Commit it. If there is no `AGENTS.md`, OpenCode falls back to `CLAUDE.md`, and it also reads `~/.claude/skills/`, so a Claude Code setup keeps working. Useful keys and commands: **Tab** switches build/plan, `@` fuzzy-finds files, `/undo` and `/redo` roll back agent edits, `/share` creates a link (sharing is manual by default), `/models` switches model.

### Configure with opencode.json

Configs merge, later ones winning per key: remote org defaults, global `~/.config/opencode/opencode.json`, `OPENCODE_CONFIG`, project `opencode.json`, `.opencode/` directories, `OPENCODE_CONFIG_CONTENT`, then admin-managed files (`/etc/opencode/` on Linux). A project file safe to commit:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "instructions": ["CONTRIBUTING.md", "docs/architecture.md"],
  "permission": {
    "read": { "*": "allow", "*.env": "deny", "*.env.*": "deny", "*.env.example": "allow" },
    "edit": "ask",
    "bash": {
      "*": "ask",
      "npm test*": "allow",
      "npm run lint*": "allow",
      "git status*": "allow",
      "git push *": "deny"
    }
  },
  "agent": {
    "plan": {
      "permission": {
        "edit": { "*": "deny", ".opencode/plans/*.md": "allow" },
        "bash": { "*": "ask", "git log*": "allow", "git diff*": "allow" }
      }
    }
  },
  "share": "disabled"
}
```

Permission values are `allow`, `ask` or `deny`; in object form the **last matching pattern wins**, so put `"*"` first. Top-level `permission` rules are merged after the built-in plan rules, so the `"edit": "ask"` above would replace plan's edit deny; the `agent.plan` block restores it and makes plan ask before shell commands (the stock plan agent runs bash without asking and is only told not to change files). Keys include `read`, `edit`, `bash`, `glob`, `grep`, `task`, `skill`, `webfetch`, `websearch` and `external_directory`. Reference secrets as `"{env:ANTHROPIC_API_KEY}"` or `"{file:~/.secrets/openai-key}"` instead of pasting them. Run `opencode debug config` to print the merged result.

### Custom agents

A Markdown file in `.opencode/agents/` (or `~/.config/opencode/agents/`) becomes an agent named after the file:

```markdown
---
description: Reviews SQL migrations for locking, data loss and missing rollbacks
mode: subagent
model: anthropic/claude-sonnet-4-5
temperature: 0.1
permission:
  edit: deny
  bash: deny
---
Review every file under db/migrations that changed on this branch.
Flag table rewrites on large tables, missing indexes on new foreign keys
and DROP statements without a backfill plan. Answer as a checklist.
```

`mode` is `primary` (reachable with Tab), `subagent` (invoked with `@migration-review` or by the build agent) or `all`. `steps` caps agentic iterations for cost control. `opencode agent list` shows what is loaded; `opencode agent create` scaffolds one interactively.

### Custom slash commands

`.opencode/commands/release-notes.md` becomes `/release-notes`; `$ARGUMENTS` (or `$1`, `$2`) holds what follows the command:

```markdown
---
description: Draft release notes for a tag range
agent: plan
---
Read `git log $ARGUMENTS --oneline` and group the changes into Features,
Fixes and Breaking changes. Link each line to its PR number.
```

### Non-interactive runs and scripting

`opencode run` sends one prompt without the TUI; it accepts the same `--model` and `--agent` choices. Put the message before `-f`/`--file`: the flag takes a list and would otherwise swallow the prompt as a file name ("File not found").

```bash
opencode run --agent plan "Explain how retries work in src/queue/worker.ts"
opencode run -m anthropic/claude-sonnet-4-5 "Find the cause of this failure" -f logs/failing-test.txt
opencode run --command release-notes v2.3.0..v2.4.0
opencode run --continue "Now add a unit test for that fix"
opencode run --format json "List TODO comments in src/" > opencode-events.jsonl
```

There is nobody to answer prompts in `run`, so an `ask` permission is auto-rejected: the tool call fails, the agent carries on without it, and the process still exits 0. Check the result (for example with `git diff --stat`) instead of trusting the exit code. `--auto` approves everything not explicitly denied, so combine it only with a strict `deny` list. To avoid MCP cold starts on every call, keep a server running with `opencode serve` and add `--attach http://localhost:4096`; set `OPENCODE_SERVER_PASSWORD` before exposing it beyond localhost.

### MCP servers

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": true
    },
    "sentry": {
      "type": "remote",
      "url": "https://mcp.sentry.dev/mcp"
    }
  }
}
```

Remote servers that need OAuth start the flow on first use; `opencode mcp list` shows status and `opencode mcp auth sentry` re-authenticates.

### GitHub automation

`opencode github install` installs the GitHub app, writes `.github/workflows/opencode.yml` and asks for secrets. Afterwards, commenting `/opencode fix this` (or `/oc`) on an issue or PR runs the agent in a GitHub Actions runner, which pushes a branch and opens a PR. The action is `anomalyco/opencode/github@latest` and requires a `model` input.

## Examples

### Example 1: Run a private model through Ollama

User request: "Our code can't leave the laptop. Set up OpenCode with the Qwen coder model I already pulled in Ollama."

Ollama's default context window is too small for OpenCode's system prompt and tool list, so build a variant with a 32k window first. `Modelfile`:

```text
FROM qwen2.5-coder:14b
PARAMETER num_ctx 32768
```

```bash
ollama pull qwen2.5-coder:14b
ollama create qwen2.5-coder:14b-32k -f Modelfile
```

Global config `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen2.5-coder:14b-32k": { "name": "Qwen 2.5 Coder 14B (32k)" } }
    }
  },
  "model": "ollama/qwen2.5-coder:14b-32k",
  "enabled_providers": ["ollama"],
  "share": "disabled"
}
```

```bash
opencode models ollama
opencode run --agent plan "Summarize what src/billing/proration.ts does"
```

`opencode models ollama` prints `ollama/qwen2.5-coder:14b-32k`, and the header of the run shows `plan · qwen2.5-coder:14b-32k`. `enabled_providers` keeps cloud providers from loading even if their keys sit in the environment. With the stock context the model only sees a truncated prompt and replies generically. Small local models also call tools less reliably than hosted ones; if the agent asks for a file instead of reading it, attach it with `-f src/billing/proration.ts` after the message, or move to a larger model. Plan still runs shell commands without asking; copy the `agent.plan` bash rules from the config section if that matters.

### Example 2: Nightly dependency-audit job in CI

User request: "Every night, have the agent check our npm audit output and write a short report, but it must never push or edit code."

```bash
npm install -g opencode-ai
npm audit --json > audit.json || true
export OPENCODE_PERMISSION='{"edit":"deny","bash":{"*":"deny","git log*":"allow"}}'
opencode run --agent plan -m anthropic/claude-sonnet-4-5 \
  "Group these advisories by package, say which are reachable from src/, and propose the smallest upgrade for each. Output Markdown." \
  -f audit.json > audit-report.md
```

`ANTHROPIC_API_KEY` comes from the CI secret store (in GitHub: Settings → Secrets and variables → Actions). `OPENCODE_PERMISSION` inlines the permission rules for this job only. `audit-report.md` holds a Markdown table or list per package (severity, advisory, target version). Blocked tool calls show up in the run output as `The user has specified a rule which prevents you from using this specific tool call`, and plan mode refuses to write files, so the job cannot change the repository.

## Guidelines

- **Permissions are permissive by default.** Without a `permission` block most tools are `allow`; only `external_directory`, `doom_loop` and reads of `.env` / `.env.*` ask (the TUI user can approve them; `opencode run` auto-rejects them). The docs page still says `.env` is denied; the shipped v1.18 binary asks. Commit a project `opencode.json` with an explicit `.env` read `deny` and `ask`/`deny` rules for edit and bash before handing it to a team.
- Treat `--auto` as "run whatever the model decides" and use it only in disposable checkouts or containers with explicit `deny` rules for `git push *`, `rm *` and deploy commands.
- Snapshots power `/undo`; they use an internal git repo and can be slow on huge monorepos. `"snapshot": false` speeds things up but removes undo.
- Every MCP server adds tool descriptions to the context; large servers can crowd out the code. Enable only the ones a task needs.
- Model IDs change often. Copy them from `opencode models` instead of guessing, and pin one in the project config so results are reproducible.
- `/share` uploads the conversation to opencode.ai. Set `"share": "disabled"` for proprietary code; the GitHub action shares by default on public repositories.
- `opencode serve` and `opencode web` listen on 127.0.0.1; set `OPENCODE_SERVER_PASSWORD` before binding to `0.0.0.0` or enabling mDNS.
- Using Claude Pro/Max subscriptions through third-party plugins is prohibited by Anthropic; use an API key or another supported login.
- Choose something else when you want a single-vendor tool with that vendor's newest features first (claude-code, openai-codex-cli, gemini-cli), or a git-commit-per-edit pair programmer (aider). OpenCode fits when the team wants one agent across many providers, local models, or a scriptable server.
