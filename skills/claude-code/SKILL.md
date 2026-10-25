---
name: claude-code
description: >-
  Claude Code is Anthropic's AI coding agent for the terminal, IDEs, desktop and web: it reads a codebase, edits files, runs commands and tests, and iterates. Use when a user asks to install or set up Claude Code, write CLAUDE.md or rules, set permissions, add MCP servers, create hooks, or run claude -p in scripts and CI.
license: Apache-2.0
compatibility: "macOS 13+, Windows 10 1809+, Ubuntu 20.04+, Debian 10+, Alpine 3.19+; 4 GB RAM; Claude account or API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "ai-coding, cli, terminal, pair-programming, agentic"
---
# Claude Code — Terminal AI Coding Agent

## Overview

Claude Code (v2.1.310 at the time of writing) is Anthropic's agentic coding tool. In a project directory it reads and edits files, runs shell commands and tests, and keeps going until the task is done, asking before risky steps. This skill covers installing it, giving it project instructions (CLAUDE.md and `.claude/rules/`), controlling permissions, connecting MCP servers, adding hooks, and running it non-interactively. Current docs: https://code.claude.com/docs.

## Instructions

### Install and start

Use a package manager; auto-updates are off for these, so upgrade them yourself:

```bash
brew install --cask claude-code          # macOS/Linux Homebrew (stable channel; claude-code@latest for newest)
winget install Anthropic.ClaudeCode      # Windows
npm install -g @anthropic-ai/claude-code # needs Node.js 22+; same native binary, never with sudo
```

Debian, Fedora, RHEL and Alpine have signed apt, dnf and apk repositories (see https://code.claude.com/docs/en/setup). Anthropic also publishes a native installer script; read the setup page and verify what you run before using it. Then:

```bash
cd newsroom-api
claude                 # first run asks you to sign in (Claude account, Console API key, or a cloud provider)
claude --version       # 2.1.310
claude doctor          # checks installation, updates and settings
claude update          # upgrade a native install
```

Useful session commands: `/init` drafts a CLAUDE.md from the codebase, `/memory` edits memory files, `/permissions`, `/mcp`, `/hooks` open the matching managers, `claude -c` continues the last session in this directory and `claude -r` picks an earlier one.

### CLAUDE.md and rules

Claude loads `./CLAUDE.md` (or `./.claude/CLAUDE.md`) and your `~/.claude/CLAUDE.md` at the start of every session, plus `CLAUDE.md` files in parent directories. A `CLAUDE.md` in a subdirectory loads on demand, when Claude reads files there. `CLAUDE.local.md` holds personal notes (add it to `.gitignore`). If a repo only has an `AGENTS.md`, Claude reads that instead; if both exist, only CLAUDE.md is used, so import it with `@AGENTS.md`. Keep each file under about 200 lines: longer files are followed less reliably. Import other files with `@docs/git-instructions.md`; move topic- or path-specific guidance into `.claude/rules/*.md`.

### CLAUDE.md — Project Instructions

```markdown
# Project: FinPay API

## Architecture
- Next.js App Router, TypeScript strict
- Drizzle ORM + PostgreSQL
- Stripe for payments
- BullMQ for background jobs
- Vitest + Testing Library for tests

## Commands
- `pnpm dev` — Start development server
- `pnpm test:unit` — Run unit tests
- `pnpm typecheck` — TypeScript check
- `pnpm lint` — ESLint
- `pnpm db:migrate` — Run Drizzle migrations
- `pnpm db:studio` — Open Drizzle Studio

## Code Conventions
- Result pattern for errors (never throw in business logic)
- Zod schemas for all external data validation
- Structured logging with Pino (no console.log)
- Feature flags via src/lib/flags.ts
- All database queries through Drizzle, never raw SQL

## Before Making Changes
1. Read the relevant test file
2. Run existing tests for the module
3. After changes: `pnpm typecheck && pnpm test:unit`

## Do NOT
- Add dependencies without asking
- Modify database schema without creating a migration
- Change auth logic without approval
- Commit directly — create a branch and PR
```

```markdown
<!-- CLAUDE.md files can be nested -->
<!-- src/payments/CLAUDE.md — specific to payment module -->

# Payment Module

Stripe is the payment provider. All Stripe API calls go through
src/lib/stripe/client.ts which wraps the Stripe SDK with retry
logic and structured error handling.

## Important: Webhook Idempotency
Every webhook handler MUST check idempotency_key before processing.
Stripe can send the same event multiple times. We store processed
event IDs in the stripe_events table.

## Test Card Numbers
- 4242424242424242 — successful payment
- 4000000000000002 — declined
- 4000000000009995 — insufficient funds
```

### Permissions and safety

In `default` mode (shown as Manual) Claude asks before editing files or running commands; since v2.1.283 interactive terminal sessions start in `auto` unless a setting says otherwise. Modes (`--permission-mode`, or Shift+Tab in the session): `default`, `acceptEdits`, `plan` (read-only exploration), `auto` (a classifier checks actions), `dontAsk`, `bypassPermissions`. Allow and deny rules go in `.claude/settings.json` (shared) or `.claude/settings.local.json` (yours):

```json
{
  "permissions": {
    "allow": ["Bash(pnpm test *)", "Bash(pnpm typecheck)", "Bash(git commit *)"],
    "deny": ["Bash(git push *)", "Read(./.env)"]
  }
}
```

Put the `*` after the subcommand (`Bash(git commit *)`). On the command line: `claude --allowedTools "Edit" "Bash(pnpm test *)"`. `--dangerously-skip-permissions` (not `--dangerouslySkipPermissions`) bypasses prompts; use it only in a sandbox or container with no internet access and no secrets.

### MCP servers

Add servers with the CLI; scopes are `local` (default, only you in this project), `project` (writes `.mcp.json` for the team) and `user` (all your projects, in `~/.claude.json`):

```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
claude mcp add --scope project --transport stdio database -e DATABASE_URL=postgresql://localhost:5432/finpay_dev -- npx tsx mcp-servers/database/index.ts
claude mcp list
```

Put the server name before `-e`/`--env` (they take several values) and the server command after `--`. A project `.mcp.json` server needs approval in the session before it runs. Remote servers that use OAuth are authorised from `/mcp`.

### Hooks

Hooks run your command at lifecycle points (`PreToolUse`, `PostToolUse`, `Notification`, `Stop`, and others). The hook receives JSON on stdin. This one formats every file Claude edits; put it in `.claude/settings.json` and check it in `/hooks`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" }]
      }
    ]
  }
}
```

### Non-interactive use

```bash
claude -p "Add Zod validation to every route in src/app/api that lacks it, then run pnpm typecheck" \
  --allowedTools "Edit" "Bash(pnpm typecheck)" --output-format json
cat error.log | claude -p "Explain this error and suggest a fix"
```

`--max-budget-usd 5` caps spend, `--json-schema` forces structured output, `--bare` skips hooks, CLAUDE.md discovery and OAuth for reproducible CI runs (authenticate with `ANTHROPIC_API_KEY`).

## Examples

### Example 1: "Set up Claude Code for my Next.js project"

```console
$ brew install --cask claude-code
$ cd finpay-api && claude
> /init
```

Claude drafts `CLAUDE.md` with the commands it found in `package.json`. Edit it to state the real test and typecheck commands and the rules above (no new dependencies without asking), commit it, and add `CLAUDE.local.md` to `.gitignore`.

### Example 2: "Refactor the Stripe webhook handler"

```text
> Split the 400-line switch in src/app/api/webhooks/stripe/route.ts into one handler per
> event type under src/lib/stripe/handlers/. Validate each payload with Zod, then run
> pnpm typecheck && pnpm test:unit and fix failures.
```

Press Shift+Tab to `plan` mode first to review the plan, then switch back to `acceptEdits`. Claude reads the handler and its tests, creates the files, runs the checks and reports what changed.

### Example 3: "Run a review in CI"

```bash
claude -p "Review this branch against main for bugs and missing tests. Output a markdown list." \
  --bare --allowedTools "Read" "Bash(git diff *)" --max-budget-usd 3
```

## Guidelines

- Tell Claude how to verify its work (test and typecheck commands) in CLAUDE.md; it iterates until they pass.
- Keep CLAUDE.md short and specific; contradicting instructions across files are resolved arbitrarily.
- Allow narrow command patterns instead of bypassing permissions; deny `.env` and secrets files.
- Do not put tokens in `.mcp.json`; reference environment variables such as `${GITHUB_TOKEN}`.
- A project's `.claude/settings.json` can grant permissions and run hooks, so review it in unfamiliar repositories before trusting the folder.
- Ask for a branch and a pull request rather than commits on `main`.
