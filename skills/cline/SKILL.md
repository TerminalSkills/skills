---
name: cline
description: >-
  Cline is an open-source autonomous coding agent that runs in VS Code, JetBrains
  IDEs, the terminal (npm package `cline`) and a desktop app, and edits files,
  runs commands and uses MCP tools with your approval. Use when a user asks to
  set up Cline, run it headless in CI, choose a model provider, write
  .clinerules, connect an MCP server, switch between Plan and Act mode, control
  auto-approve or YOLO mode, or hand a multi-file refactor to an agent.
license: Apache-2.0
compatibility: 'VS Code, JetBrains IDEs, or a terminal with Node.js and npm (macOS, Linux, Windows)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/cline/cline
  tags: "ai-coding, autonomous-agent, cline, mcp, cli"
---

# Cline

## Overview

Cline is an open-source coding agent that reads a project, edits files across it, runs shell commands and watches their output, and can call MCP tools. It ships as a VS Code extension (`saoudrizwan.claude-dev`), a JetBrains plugin, a CLI (`npm install -g cline`), a desktop app for macOS and Windows, and an SDK (`@cline/sdk`). All surfaces share one agent core, so rules, skills, MCP servers, checkpoints and provider settings behave the same everywhere. As of October 2026 the CLI is at 3.0.x.

Two modes matter: Plan mode explores and proposes a strategy without changing anything; Act mode executes it. In the IDE every edit and command asks for approval unless you enable auto-approve. In the CLI the default is different (see Guidelines).

## Instructions

### Install

```bash
# CLI
npm install -g cline
cline version

# VS Code extension
code --install-extension saoudrizwan.claude-dev
```

The JetBrains plugin comes from the JetBrains Marketplace (search "Cline"). The desktop app is downloaded from cline.bot/desktop.

### Choose a provider and model

Cline works with its own hosted provider (sign in with `cline auth cline`), a ChatGPT subscription (`openai-codex`), or your own key for Anthropic, OpenAI, Google Gemini, OpenRouter, AWS Bedrock, GCP Vertex, Groq, Cerebras, local Ollama or LM Studio, and any OpenAI-compatible endpoint.

```bash
cline auth                                   # interactive setup
cline auth --provider anthropic --apikey "$ANTHROPIC_API_KEY" --modelid claude-sonnet-4-6
cline -P openrouter -m google/gemini-3.1-pro-preview -k "$OPENROUTER_API_KEY" "Set up Storybook"
```

In the IDE extensions, pick the provider and model in the Cline panel settings instead. Provider keys are stored in `~/.cline/data/settings/providers.json`.

### Run the CLI

```bash
cline                                        # interactive session (TUI)
cline -p "Plan a migration from Express to Hono"      # plan mode, no edits
cline --auto-approve false "Fix the failing tests"    # ask before every tool call
git diff origin/main | cline "Review these changes for bugs"
cline --json "List all TODO comments"        # NDJSON events for scripts
cline --yolo --timeout 900 "Run tests and fix failures"   # unattended, CI only
```

`cline history` lists past sessions and `cline --id 8f3a91c2` resumes one. `cline doctor` diagnoses configuration problems.

### Give it project rules

Rules are markdown files Cline loads on every task. Put them in `.clinerules/` (or `.cline/rules/`) at the repository root; commit them. Cline also reads `AGENTS.md`, `.cursorrules` and `.windsurfrules`. Personal rules go in `~/Documents/Cline/Rules/` or `~/.cline/rules/`; workspace rules win on conflict. Type `/newrule` in a session to have Cline write one for you.

```markdown
# .clinerules/testing.md
- Run `npm test -- --run` after every change under src/ and fix failures before finishing.
- Never edit files in legacy/ (scheduled for removal in Q1).
- Use Vitest, not Jest, for new tests.
```

### Add MCP servers

```bash
cline mcp                                    # list, add, edit, disable, authorize, delete
cline mcp add files --yes -- npx -y @modelcontextprotocol/server-filesystem ./docs
cline mcp add docs https://mcp.context7.com/mcp --transport http --yes
cline mcp remove files
```

The CLI config is `~/.cline/data/settings/cline_mcp_settings.json` (override with `CLINE_MCP_SETTINGS_PATH`). In an IDE, open the MCP Servers icon, then Configure. An entry looks like this; set `"type": "streamableHttp"` for remote servers because an omitted type means legacy SSE:

```json
{
  "mcpServers": {
    "postgres-readonly": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://readonly@localhost:5432/shop"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Useful slash commands

`/newtask` starts a fresh task with distilled context, `/smol` compresses history, `/newrule` creates a rule, `/deep-planning` investigates then plans before coding, `/undo` (CLI) or checkpoints (IDE) roll back the agent's work.

## Examples

### Example 1: Review a pull request in CI

**User:** "Have Cline comment on every PR with a review of the diff."

```yaml
# .github/workflows/cline-review.yml
name: Cline review
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: npm install -g cline
      - run: cline auth --provider anthropic --apikey "$ANTHROPIC_API_KEY" --modelid claude-sonnet-4-6
        env: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" }
      - run: git diff origin/${{ github.base_ref }}...HEAD | cline -p "Review for bugs and missing tests" > review.md
      - run: gh pr comment ${{ github.event.number }} --body-file review.md
        env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

Plan mode (`-p`) keeps the reviewer from editing the checkout. The result is a markdown review posted as a PR comment.

### Example 2: Refactor with a plan first

**User:** "Migrate our API routes from Express to Hono, keep the route structure."

In the IDE, stay in Plan mode and ask Cline to read `src/routes/` and list the files it would touch. Review the plan, then switch to Act mode. Cline edits each route, updates imports, and runs `npm test`, showing every diff for approval. If a step goes wrong, restore the checkpoint taken before it and rephrase the instruction instead of arguing in the same thread.

## Guidelines

- The CLI defaults to Act mode with auto-approve on. Use `--auto-approve false` or `-p` when you want a human in the loop, and use `--yolo` only in a throwaway container or CI runner: it is the flag for unsupervised runs and is dangerous outside a sandbox (in the IDE, YOLO mode approves file changes and commands anywhere on the machine).
- In the IDE, start with auto-approve limited to reading project files. Enable edits only when checkpoints are available.
- `.clineignore` is being removed and was never a security boundary; do not rely on it to hide secrets. Keep secrets out of the workspace and out of rules files.
- Pass API keys through environment variables or CI secrets, never in committed files; `-k` also saves the key as the provider's key.
- Only add MCP servers you trust, and keep `autoApprove` limited to read-only tools.
- Break big tasks into steps; long sessions lose detail. Use `/newtask` or `/smol` before the context fills.
- Focus Chain todo lists and "Explain Changes" are deprecated; ask Cline in plain words to explain its changes.
