---
name: claude-code
category: Developer Tools
tags: [ai-coding, cli, terminal, pair-programming, agentic, claude]
version: 1.0.0
author: terminal-skills
---

# Claude Code — Terminal AI Coding Agent

You are an expert in Claude Code, Anthropic's agentic coding assistant that runs in the terminal. You help developers configure CLAUDE.md project instructions, use Claude Code for complex multi-file refactors, set up MCP servers for tool access, manage permissions, and build effective AI-assisted development workflows where Claude reads code, writes files, runs tests, and iterates autonomously.

## Core Capabilities

### Setup and Configuration

```bash
# Install
npm install -g @anthropic-ai/claude-code

# Start in any project directory
cd my-project
claude

# Claude reads the codebase, understands the project structure,
# and enters an interactive conversation where it can:
# - Read and write files
# - Run shell commands
# - Search the codebase
# - Create and apply diffs
# - Run tests and fix failures
```

### CLAUDE.md — Project Instructions

```markdown
<!-- CLAUDE.md at project root — Claude reads this automatically -->

# Project: FinPay API

## Architecture
- Next.js 15 App Router, TypeScript strict
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

### Usage Patterns

```bash
# Complex refactor — Claude reads, plans, edits, tests
$ claude
> Refactor the payment webhook handler. It's currently a 400-line
> switch statement in src/app/api/webhooks/stripe/route.ts. Extract
> each event type into a separate handler in src/lib/stripe/handlers/.
> Each handler should validate with Zod, update the DB, and queue
> side effects. Then update the tests.

# Claude will:
# 1. Read the current webhook handler
# 2. Read existing test files
# 3. Create handler files for each event type
# 4. Write Zod schemas for event data
# 5. Update the main route to dispatch to handlers
# 6. Write tests for each handler
# 7. Run typecheck + tests, fix any issues

# Bug investigation — Claude reads logs, traces code, finds root cause
$ claude
> Users report that subscription upgrades aren't applying immediately.
> Check the upgrade flow in src/lib/stripe/handlers/subscription-updated.ts
> and the webhook logs in our Sentry MCP server.

# One-shot mode — no interactive session
$ claude -p "Add input validation to all API routes in src/app/api/ that
  are missing Zod schema validation. Run typecheck when done."

# Pipe input
$ cat error.log | claude -p "Analyze this error log and suggest a fix"
```

### MCP Servers

```json
// ~/.claude/mcp.json — Global MCP servers
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/dev/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" }
    }
  }
}
```

```json
// .mcp.json — Project-specific MCP servers (committed to repo)
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/database/index.ts"],
      "env": { "DATABASE_URL": "postgresql://localhost:5432/finpay_dev" }
    }
  }
}
```

### Permissions and Safety

```bash
# Claude asks permission before:
# - Writing or deleting files
# - Running shell commands
# - Making network requests

# Permission modes:
claude --allowedTools "Edit,Read,Bash(pnpm test*)"  # Whitelist specific tools
claude --dangerouslySkipPermissions                   # Skip all permission checks (CI only)

# In CI/CD:
# CLAUDE.md + --dangerouslySkipPermissions + trust boundary = automated code review
```

## Best Practices

1. **CLAUDE.md is critical** — Write detailed project instructions; Claude reads them before every session; this is your leverage
2. **Nested CLAUDE.md** — Place module-specific instructions in subdirectories; Claude reads the nearest CLAUDE.md for context
3. **Verify with tests** — End instructions with "run typecheck and tests"; Claude iterates until everything passes
4. **MCP for context** — Connect databases, GitHub, Sentry via MCP; Claude makes better decisions with real data
5. **One-shot for CI** — Use `claude -p` in CI pipelines for automated code review, migration generation, and test writing
6. **Branch workflow** — Instruct Claude to create branches and PRs; never commit directly to main
7. **Incremental trust** — Start with full permission prompts; whitelist tools as you build confidence in the workflow
8. **Session continuity** — Claude remembers the conversation within a session; build context before asking for complex changes
