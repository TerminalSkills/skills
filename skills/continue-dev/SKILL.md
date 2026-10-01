---
name: continue-dev
description: >-
  Continue is an open-source AI code assistant for VS Code, JetBrains and the
  terminal (the cn CLI) that works with any LLM: Claude, GPT, Gemini, Ollama
  and other local models. Use when a user asks to configure Continue with
  config.yaml, add chat or tab autocomplete models, write rules or custom
  prompts, connect MCP servers, run cn headless in scripts, or migrate from
  config.json. Continue was acquired by Cursor in June 2026: the release from
  that month is final and the Hub is offline, so the skill covers local,
  self-configured use.
license: Apache-2.0
compatibility: "VS Code or a JetBrains IDE for the extension; Node.js 20 or newer for the cn CLI. Needs your own model API key or a local model server."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - ai-coding
    - ide
    - open-source
    - code-assistant
    - autocomplete
  repository: https://github.com/continuedev/continue
---

# Continue — Open-Source AI Code Assistant for IDEs

## Overview

Continue is an Apache-2.0 coding assistant that runs as a VS Code extension, a JetBrains plugin and a terminal agent (`cn`). It talks to the models you configure (Anthropic, OpenAI-compatible endpoints, Mistral, Gemini, Ollama, LM Studio and more) and reads models, rules, prompts and MCP servers from a local `config.yaml`, so code only goes to the providers you choose.

**Status:** Continue was acquired by Cursor in June 2026. The releases from that month (extension 2.0.0, CLI 1.5.47) are the last, the repository's README declares it no longer maintained and read-only (only documentation commits followed, in July 2026), and the Continue Hub and accounts are gone (`hub.continue.dev` no longer resolves, `cn login` was removed). What remains works from local configuration only, which is what this skill describes.

## Instructions

### Install

```bash
# VS Code extension (Marketplace and Open VSX id: Continue.continue)
code --install-extension Continue.continue

# Terminal agent
npm install -g @continuedev/cli
cn --version        # 1.5.47
```

JetBrains: Settings > Plugins > Marketplace, search "Continue". The project's final README recommends the CLI over the JetBrains plugin.

### Configuration

The user-level config is `~/.continue/config.yaml` (`%USERPROFILE%\.continue\config.yaml` on Windows). `config.json` is the deprecated predecessor.

```yaml
# ~/.continue/config.yaml
name: Team Config
version: 1.0.0
schema: v1

models:
  - name: Claude Sonnet
    provider: anthropic
    model: claude-sonnet-4-6
    apiKey: ${{ secrets.ANTHROPIC_API_KEY }}
    roles: [chat, edit, apply]
  - name: Codestral
    provider: mistral
    model: codestral-latest
    apiKey: ${{ secrets.CODESTRAL_API_KEY }}
    roles: [autocomplete]
    autocompleteOptions:
      debounceDelay: 250
  - name: Local Qwen
    provider: ollama
    model: qwen2.5-coder:7b
    roles: [chat, edit]
  - name: Internal gateway            # any OpenAI-compatible server
    provider: openai
    model: qwen3-coder-30b
    apiBase: http://llm.internal:8000/v1
    apiKey: ${{ secrets.GATEWAY_API_KEY }}
    capabilities: [tool_use]          # needed for Agent mode if not detected

context:
  - provider: file
  - provider: code
  - provider: diff
  - provider: terminal
  - provider: open
  - provider: currentFile

rules:
  - Give concise responses
  - Always assume TypeScript rather than JavaScript

prompts:
  - name: endpoint
    description: Scaffold a tRPC endpoint
    prompt: |
      Create a tRPC endpoint that follows the routers in src/server/routers.
      Include Zod validation, error handling, and a test file.
```

- **Roles** decide what a model is used for: `chat`, `edit`, `apply`, `autocomplete`, `embed`, `rerank`. Without `roles` a model gets `chat`, `edit`, `apply` and `summarize`.
- **Secrets**: `${{ secrets.NAME }}` is looked up in `.env` at the workspace root, then `.continue/.env` in the workspace, then `~/.continue/.env`, then process environment variables. The IDE extensions do not see variables exported in a shell, so use a `.env` file there; the CLI reads both.
- **Changes from config.json**: `tabAutocompleteModel` became a model with `roles: [autocomplete]`, `contextProviders` became `context`, `customCommands` became `prompts`; `slashCommands` has no `config.yaml` equivalent.

### Rules, prompts and MCP servers in the repository

Files under `.continue/` in a workspace apply to everyone who opens the project:

```markdown
<!-- .continue/rules/typescript.md -->
---
name: TypeScript conventions
globs: ["**/*.ts", "**/*.tsx"]
---

- Use named exports and explicit return types.
- Validate external input with Zod.
```

```yaml
# .continue/mcpServers/playwright.yaml
name: Playwright MCP
version: 1.0.0
schema: v1
mcpServers:
  - name: Browser
    command: npx
    args: ["@playwright/mcp@latest"]
```

Rule frontmatter: `name`, `globs` (attach only when matching files are in context), `alwaysApply`, `description`. Rule files load in lexicographical order. MCP servers are used in Agent mode and can also be listed under `mcpServers:` in `config.yaml`; `type` is `stdio` (with `command`), `sse` or `streamable-http` (with `url`). The CLI additionally reads `AGENTS.md` from the working directory.

### Usage in IDE

```markdown
## Chat and Agent (Cmd/Ctrl+L in VS Code, Cmd/Ctrl+J in JetBrains)
- Ask questions about the open project; Agent mode can read, search and edit files
- Reference a file: @File, then pick src/server/db/schema.ts
- Reference a symbol: @Code; the current diff: @Git Diff; the last command: @Terminal

## Inline Edit (Cmd/Ctrl+I)
- Select code → Cmd/Ctrl+I → "Refactor to use async/await"
- "Add error handling for network failures"

## Tab Autocomplete
- Uses the model with the autocomplete role (Codestral, qwen2.5-coder)
- Accept: Tab

## Prompts
- Type / in the chat input and pick a prompt from config.yaml, e.g. /endpoint
```

### CLI (`cn`)

```bash
cn                                   # interactive session in the current directory
cn --config ./team-config.yaml       # use another config file
cn --rule ./docs/style.md --rule "Never touch the migrations folder"
cn --readonly                        # plan mode: no file-writing tools, Bash still allowed
cn --resume                          # continue the last session; cn ls lists sessions

# Headless: print the answer and exit
cn -p "Summarize what src/server/routers/billing.ts does"
cn -p "List the TODO comments in src/" --format json
cn -p "Fix the type errors in src/" --allow Write --allow Edit --allow MultiEdit
```

In headless mode the model gets `Read`, `List`, `Fetch` and `Bash`; the file-writing tools are added only with `--allow` (or `--auto`, which allows everything). The edit tool is `MultiEdit` when the model's name contains claude, gpt, gemini, qwen, llama, mistral, kimi or grok, and `Edit` otherwise, so allow both. Add `--exclude Bash` when the run must not execute shell commands.

## Examples

### Example 1: Set up Continue for a team repository

**User request:** "Set up Continue for our TypeScript monorepo: Claude for chat, a local model for autocomplete, and our conventions shared with the team."

```yaml
# ~/.continue/config.yaml (each developer)
name: Monorepo
version: 1.0.0
schema: v1
models:
  - name: Claude Sonnet
    provider: anthropic
    model: claude-sonnet-4-6
    apiKey: ${{ secrets.ANTHROPIC_API_KEY }}
  - name: Qwen autocomplete
    provider: ollama
    model: qwen2.5-coder:1.5b
    roles: [autocomplete]
```

```bash
ollama pull qwen2.5-coder:1.5b
mkdir -p ~/.continue .continue/rules
printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY" > ~/.continue/.env && chmod 600 ~/.continue/.env
git add .continue/rules/typescript.md        # the rule file shown above
```

Result: the Continue sidebar lists "Claude Sonnet" in the model selector, completions come from the local model, and the "TypeScript conventions" rule appears under the rules (pen) icon whenever a `.ts` file is in context. The key stays in `~/.continue/.env`, outside the repository.

### Example 2: Generate a commit message from a script

**User request:** "I want a git alias that drafts the commit message from my staged changes with Continue."

```bash
{ echo "Write a Conventional Commits message for this diff. Reply with the message only."; git diff --staged; } \
  | cn --exclude Bash --silent -p
```

Output is the bare message, ready to pipe into `git commit -F -`:

```
feat(api): add retry to payment webhook handler
```

The whole request goes through stdin: `git diff --staged | cn -p "Write a commit message"` sends only the prompt, because `cn` 1.5.47 ignores piped input when a prompt argument is given. Keep `-p` last when the prompt is piped: `cn -p --exclude Bash` stops with "A prompt is required". With `--format json` a plain-text answer is wrapped as `{"response": "...", "status": "success", "note": "..."}`.

## Guidelines

1. **Know what you are adopting** — Continue receives no more fixes or security updates. It keeps working with local config, but for a new team setup compare it with maintained assistants first; models released after June 2026 are untested with it
2. **No Hub** — `uses: owner/name` blocks, `cn login` and hub slugs passed to `--config`, `--model`, `--mcp` or `--agent` depended on the Hub; define models, rules and MCP servers explicitly
3. **Share rules, not keys** — commit `.continue/rules/` and `.continue/mcpServers/` so the team gets the same setup; keep API keys in `.env` files that are git-ignored, never inline in a committed YAML
4. **Local models for privacy** — with Ollama or LM Studio as the only providers, code never leaves the machine; with hosted providers every prompt and attached file goes to that provider
5. **Tab autocomplete model** — use a small fast model with `roles: [autocomplete]` (Codestral, `qwen2.5-coder:1.5b`); chat models make poor completion models
6. **Agent mode needs tool calling** — Continue detects it for most models; for a self-hosted model that supports tools but is not recognised, set `capabilities: [tool_use]`. A model without tool support only works in Chat and Edit
7. **Deprecated context** — `@Codebase`, `@Folder` and `@Docs` indexing are deprecated; Agent mode explores the repository with its own tools, and project knowledge belongs in rule files
8. **Rules files** — keep project instructions in `.continue/rules/*.md`, one topic per file; rules apply to Chat, Edit and Agent requests, not to autocomplete
9. **Headless permissions** — `--auto` and `--allow "*"` let the agent write files and run commands without asking; use them only in a disposable checkout or container
