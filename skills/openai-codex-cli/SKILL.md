---
name: openai-codex-cli
category: Developer Tools
tags: [ai-coding, terminal, cli, autonomous-agent, openai, code-generation]
version: 1.0.0
author: terminal-skills
---

# OpenAI Codex CLI — AI Coding Agent in Your Terminal

You are an expert in OpenAI's Codex CLI, the open-source terminal-based coding agent that reads your codebase, generates and edits code, runs shell commands, and applies changes — all within your terminal. You help developers use Codex CLI for code generation, refactoring, debugging, and automation with configurable approval modes (suggest, auto-edit, full-auto) and sandboxed execution for safety.

## Core Capabilities

### Basic Usage

```bash
# Install
npm install -g @openai/codex

# Interactive mode
codex

# One-shot with a prompt
codex "Add input validation to all API endpoints in src/routes/"

# With specific model
codex --model o4-mini "Refactor the auth module to use JWT refresh tokens"

# Approval modes
codex --approval-mode suggest "Fix the failing tests"     # Show changes, ask before applying
codex --approval-mode auto-edit "Update all imports"       # Auto-apply edits, ask for commands
codex --approval-mode full-auto "Run tests and fix failures"  # Full autonomous mode
```

### Configuration

```yaml
# ~/.codex/config.yaml
model: o4-mini                            # Default model
approval_mode: suggest                    # suggest | auto-edit | full-auto
providers:
  - name: openai
    api_key_env: OPENAI_API_KEY
  - name: anthropic                       # Works with Claude too
    api_key_env: ANTHROPIC_API_KEY
sandbox:
  enabled: true                           # Run commands in sandbox
  network: false                          # No network access in sandbox
  writable_paths:                         # Only these paths are writable
    - ./src
    - ./tests
```

### Project Instructions

```markdown
# codex.md — Project-level instructions (checked into repo)

## Project Overview
This is a Next.js 14 app with tRPC, Drizzle ORM, and Tailwind.

## Conventions
- Use server components by default
- All database queries go through src/server/db/queries/
- Tests use Vitest with MSW for API mocking
- Commit messages follow Conventional Commits

## Do NOT
- Modify the database schema without creating a migration
- Use `any` type in TypeScript
- Install new dependencies without asking
```

### Common Workflows

```bash
# Fix failing tests
codex "The test suite is failing. Read the error output, find the broken tests, and fix them."

# Add a feature
codex "Add a /api/webhooks/stripe endpoint that handles subscription.created and subscription.deleted events. Update the user's plan in the database."

# Refactor
codex "Migrate all useState + useEffect patterns in src/components/ to use TanStack Query for data fetching."

# Documentation
codex "Generate JSDoc comments for all exported functions in src/lib/"

# Security audit
codex "Review src/server/ for SQL injection, XSS, and authentication bypass vulnerabilities. Fix any issues found."
```

## Installation

```bash
npm install -g @openai/codex
# Requires: OPENAI_API_KEY environment variable
# Works with: GPT-4o, o4-mini, o3 models
```

## Best Practices

1. **Start with suggest mode** — Review changes before applying; switch to auto-edit once you trust the patterns
2. **codex.md for context** — Add project-level instructions; Codex reads them automatically for every session
3. **Sandbox for safety** — Enable sandboxing to prevent unintended file deletions or network calls
4. **Specific prompts** — "Fix the pagination bug in posts.ts" beats "fix bugs"; include file paths and expected behavior
5. **Full-auto for CI** — Use `full-auto` mode in CI pipelines for automated test fixing and code generation
6. **Writable paths** — Restrict writable paths in sandbox config; Codex can only modify files you allow
7. **Multiple providers** — Configure both OpenAI and Anthropic; switch models based on task complexity
8. **Git integration** — Codex respects `.gitignore`; changes are uncommitted so you can review diffs before committing
