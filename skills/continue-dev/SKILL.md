---
name: continue-dev
category: Developer Tools
tags: [ai-coding, ide, open-source, code-assistant, autocomplete, context-providers]
version: 1.0.0
author: terminal-skills
---

# Continue — Open-Source AI Code Assistant for IDEs

You are an expert in Continue, the open-source AI code assistant for VS Code and JetBrains. You help developers configure Continue with any LLM (Claude, GPT-4, Gemini, Ollama, local models), set up custom context providers, create team-shared slash commands, and enable intelligent tab autocomplete — all while keeping code on their infrastructure.

## Core Capabilities

### Configuration

```json
// .continue/config.json — Project or user config
{
  "models": [
    {
      "title": "Claude Sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    {
      "title": "GPT-4o",
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "${OPENAI_API_KEY}"
    },
    {
      "title": "Local Ollama",
      "provider": "ollama",
      "model": "deepseek-coder-v2:16b"
    }
  ],
  "tabAutocompleteModel": {
    "title": "Codestral",
    "provider": "mistral",
    "model": "codestral-latest",
    "apiKey": "${MISTRAL_API_KEY}"
  },
  "contextProviders": [
    { "name": "code", "params": {} },
    { "name": "docs", "params": {} },
    { "name": "diff", "params": {} },
    { "name": "terminal", "params": {} },
    { "name": "open", "params": {} },
    { "name": "codebase", "params": {} },
    { "name": "folder", "params": {} },
    { "name": "url", "params": { "url": "https://docs.company.com/api" } }
  ],
  "slashCommands": [
    { "name": "commit", "description": "Generate commit message for staged changes" },
    { "name": "review", "description": "Code review selected code" },
    { "name": "test", "description": "Generate tests for selected code" },
    { "name": "docs", "description": "Generate documentation" },
    { "name": "fix", "description": "Fix the selected code" }
  ],
  "customCommands": [
    {
      "name": "endpoint",
      "description": "Scaffold a tRPC endpoint",
      "prompt": "Create a tRPC endpoint following the patterns in @folder src/server/routers. Include Zod validation, error handling, and a test file. Endpoint: {{{ input }}}"
    },
    {
      "name": "component",
      "description": "Scaffold a React component",
      "prompt": "Create a React component following @folder src/components patterns. Use TypeScript, Tailwind, and include a Storybook story. Component: {{{ input }}}"
    }
  ],
  "docs": [
    { "title": "Next.js", "startUrl": "https://nextjs.org/docs" },
    { "title": "tRPC", "startUrl": "https://trpc.io/docs" }
  ]
}
```

### Usage in IDE

```markdown
## Chat (Cmd+L)
- Ask questions with full codebase context
- Reference files: @file src/server/db/schema.ts
- Reference folders: @folder src/server/routers
- Reference docs: @docs Next.js
- Reference codebase: @codebase find where user auth is handled
- Reference terminal output: @terminal

## Inline Edit (Cmd+I)
- Select code → Cmd+I → "Refactor to use async/await"
- "Add error handling for network failures"
- "Convert this to TypeScript with proper types"

## Tab Autocomplete
- Codestral/Starcoder for fast completions
- Respects file context and recent edits
- Accepts: Tab, Rejects: Escape

## Slash Commands
/commit — generate commit message
/review — review selected code
/test — generate tests
/docs — add documentation
```

## Installation

```bash
# VS Code: search "Continue" in extensions marketplace
# JetBrains: search "Continue" in plugin marketplace
# Config: ~/.continue/config.json (user) or .continue/config.json (project)
```

## Best Practices

1. **Project config in Git** — Commit `.continue/config.json` to your repo; entire team gets same AI setup
2. **Context providers** — Use `@codebase` for finding code, `@docs` for library docs, `@diff` for reviewing changes
3. **Custom commands** — Create `/endpoint`, `/component`, `/migration` commands for team-specific scaffolding
4. **Local models for privacy** — Use Ollama for sensitive codebases; code never leaves the machine
5. **Tab autocomplete model** — Use a fast model (Codestral, Starcoder) for autocomplete; chat model for complex tasks
6. **Docs indexing** — Add framework docs to the `docs` config; Continue indexes them for RAG-based answers
7. **Multiple models** — Configure fast + powerful models; switch in the UI based on task complexity
8. **Rules files** — Continue reads `.continuerules` for project-specific AI instructions (like `.cursorrules`)
