---
name: gemini-cli
category: Developer Tools
tags: [ai-coding, terminal, cli, google, gemini, code-generation]
version: 1.0.0
author: terminal-skills
---

# Gemini CLI — Google's AI Coding Agent for the Terminal

You are an expert in Gemini CLI, Google's open-source terminal-based AI agent powered by Gemini models. You help developers use Gemini CLI for code generation, file editing, shell command execution, and multi-modal tasks (analyzing images, reading PDFs) — with Google's 1M+ token context window for understanding entire codebases at once and MCP tool integration for extending capabilities.

## Core Capabilities

### Basic Usage

```bash
# Install
npm install -g @anthropic-ai/gemini-cli
# Or via Google's installer
curl -fsSL https://raw.githubusercontent.com/google-gemini/gemini-cli/main/installer.sh | bash

# Start interactive session
gemini

# One-shot prompt
gemini "Explain the architecture of this project and suggest improvements"

# With specific model
gemini --model gemini-2.5-pro "Refactor the database layer to use connection pooling"

# Pipe input
cat error.log | gemini "Analyze these errors and suggest fixes"
git diff HEAD~5 | gemini "Write a summary of these changes for the changelog"
```

### Configuration

```markdown
# GEMINI.md — Project instructions (auto-loaded)

## Project
TypeScript monorepo using Turborepo. Apps: web (Next.js), api (Hono), mobile (Expo).

## Coding Standards
- Strict TypeScript, no `any`
- Functional components with hooks
- Zod for runtime validation
- Drizzle ORM for database access

## Architecture
- Shared packages in /packages (ui, db, config)
- API routes in /apps/api/src/routes/
- Database schema in /packages/db/src/schema.ts
```

### Multi-Modal Capabilities

```bash
# Analyze a screenshot
gemini "What's wrong with this UI?" --image screenshot.png

# Read a PDF spec
gemini "Summarize the API changes in this spec" --file api-spec.pdf

# Analyze error screenshots from QA
gemini "The QA team sent these screenshots. What bugs do you see?" --image bug1.png --image bug2.png
```

### MCP Tool Integration

```json
// .gemini/settings.json — MCP servers
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

### Large Codebase Analysis

```bash
# Gemini's 1M+ token window can process entire codebases
gemini "Read the entire src/ directory and create a dependency graph. Identify circular dependencies and suggest how to break them."

gemini "Analyze all test files. Which modules have low coverage? Generate tests for the 5 least-covered modules."

gemini "Review the entire API layer. Are there any endpoints that don't validate input? Fix them all."
```

## Installation

```bash
npm install -g @google/gemini-cli
# Requires: GOOGLE_API_KEY or Google Cloud auth
# Free tier: 1M tokens/day with Gemini API
```

## Best Practices

1. **GEMINI.md for context** — Add project instructions; Gemini loads them automatically at session start
2. **Large context advantage** — Use Gemini for whole-codebase analysis; 1M+ tokens fits most projects entirely
3. **Multi-modal input** — Feed screenshots, PDFs, diagrams directly; Gemini understands visual content natively
4. **MCP for tools** — Connect database, GitHub, file system via MCP; Gemini can query data and create PRs
5. **Pipe workflows** — Pipe `git diff`, `npm test`, `cat error.log` directly into prompts for contextual assistance
6. **Free tier** — Google's free API tier is generous; 1M tokens/day covers most individual developer usage
7. **Sandbox mode** — Use `--sandbox` for untrusted operations; commands run in isolated environment
8. **Extension system** — Create custom tools with the extension API; Gemini calls them as needed during tasks
