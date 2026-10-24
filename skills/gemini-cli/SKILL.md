---
name: gemini-cli
description: >-
  Gemini CLI is Google's open-source AI agent for the terminal: it reads and edits code, runs shell commands, and connects to MCP servers using Gemini models. Use when someone asks to "install Gemini CLI", "run gemini in a script", "set up GEMINI.md", "add an MCP server to Gemini CLI", "sandbox Gemini CLI", or "log in to Gemini CLI". Covers current install, authentication (the unpaid Google-account tier ended 18 June 2026), headless mode, GEMINI.md, MCP, and sandboxing.
license: Apache-2.0
compatibility: "Node.js 20+. A Gemini API key, Vertex AI project, or Gemini Code Assist organisation license."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/google-gemini/gemini-cli
  tags:
    - ai-coding
    - terminal
    - cli
    - google
    - gemini
---

# Gemini CLI — Google's AI Coding Agent for the Terminal

## Overview

Gemini CLI (`@google/gemini-cli`, current release 0.65.0) is an Apache-2.0 terminal agent. It has built-in tools for files, shell and web fetch/search, reads project instructions from `GEMINI.md`, and extends through MCP servers, extensions, agent skills, hooks and custom commands.

Status you must know before recommending it (from the project README):

- The README states that Gemini CLI was replaced by Antigravity CLI on 18 June 2026 for unpaid-tier and Google One users. The old advice "sign in with Google for free requests" no longer holds for personal accounts.
- Gemini CLI documents three sign-in routes: Google sign-in with a paid Code Assist license from your organisation, a Gemini API key, and Vertex AI. The README says it is not optimized for the newest models (it points to Antigravity for those).

## Instructions

### Install

```bash
npm install -g @google/gemini-cli     # or: brew install gemini-cli
gemini --version
```

`npx @google/gemini-cli` runs it without installing. Release channels: `latest` (weekly stable), `preview`, `nightly`. The package name is `@google/gemini-cli`.

### Authenticate

```bash
# Gemini API key (create one in Google AI Studio)
export GEMINI_API_KEY="$(cat ~/.secrets/gemini-api-key)"
gemini

# Vertex AI
export GOOGLE_API_KEY="$(cat ~/.secrets/vertex-api-key)"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini

# Organisation with a Code Assist license: sign in with Google, set the project
export GOOGLE_CLOUD_PROJECT="billing-prod-4821"
gemini
```

`/auth` inside a session changes the method. Do not commit keys; keep them in the shell profile or a secret manager.

### Everyday use

```bash
gemini                                   # interactive session in this directory
gemini "Explain the architecture of this project"   # starts interactive with that prompt
gemini -m gemini-2.5-flash               # pick a model (or /model in a session)
gemini --include-directories ../shared-lib,../docs
gemini --resume latest                   # continue the previous session
```

In a session, reference files and folders with `@`: `@src/auth/session.ts Explain how tokens are refreshed`, or `@src/utils/` for a directory. `/help` lists slash commands; common ones are `/memory show`, `/mcp`, `/model`, `/auth`, `/stats`, `/compress`, `/rewind`, `/skills`, `/init`.

### Headless mode (scripts and CI)

```bash
git diff main...HEAD | gemini -p "Write release notes for these changes" > notes.md
gemini -p "List files with unvalidated input in src/api" --output-format json
```

Stdin is appended to the `-p` prompt. `--output-format json` returns one object with `response` and `stats`; `stream-json` emits events. Exit codes: 0 success, 1 error, 42 input error, 53 turn limit exceeded. Tool actions normally need approval, so decide the mode for unattended runs deliberately with `--approval-mode` (`default`, `auto_edit`, `yolo`, `plan`); use `plan` for read-only analysis.

### Project context: GEMINI.md

The CLI loads `~/.gemini/GEMINI.md`, `GEMINI.md` files in the workspace and its parents, and component-level files it finds when a tool touches that directory. Split big files with `@./docs/style-guide.md` imports. `/memory show` prints what is loaded; `/memory reload` rescans.

```markdown
# Project: billing-api
- TypeScript strict mode, no `any`; Zod validates every request body.
- Database access only through `src/db/` (Drizzle); never write raw SQL in route files.
- Run `npm test` before proposing a commit.
```

### MCP servers

```bash
gemini mcp add --scope project context7 npx -y @upstash/context7-mcp
gemini mcp add -t http -H "Authorization: Bearer $INTERNAL_MCP_TOKEN" tickets https://mcp.internal.shopfront.dev/mcp
```

Servers are stored under `mcpServers` in `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user). Entries take `command`/`args`/`env` for stdio, `httpUrl` or `url` for remote, and `trust` (leave it `false`: `true` skips every confirmation for that server). `gemini mcp --help` lists list/remove/enable/disable. In a folder the CLI does not trust yet, `--scope project` is refused ("Cannot modify settings in an untrusted workspace"); use `--scope user` there.

### Sandbox and trust

`gemini --sandbox` (or `GEMINI_SANDBOX=docker|podman`, or `"tools": {"sandbox": "docker"}` in settings) runs shell and file tools in a container; macOS also has Seatbelt profiles. Trusted Folders (enabled in settings) stop the CLI from loading project config from a folder you have not approved.

## Examples

### Example 1: Nightly dependency report in CI

**User request:** "Have Gemini summarise outdated npm packages and fail the job if it errors."

```bash
npm outdated --json | gemini -p "Group these by risk (major, minor, patch) and name the three most urgent upgrades" \
  --output-format json > outdated.json
echo "exit code: $?"
```

Result: `outdated.json` holds `{"response": "...", "stats": {...}}`; the job reads `.response` with `jq` and the shell sees exit code 0, or 1/42/53 on failure. `GEMINI_API_KEY` comes from the CI secret store.

### Example 2: Up-to-date library docs through an MCP server

**User request:** "Let Gemini look up current docs for the libraries we use instead of guessing."

```bash
gemini mcp add --scope project context7 npx -y @upstash/context7-mcp
gemini
> /mcp
> Using the docs tool, show how to define a route with a Zod-validated body in Hono, then add it to @src/routes/orders.ts
```

Result: `/mcp` lists `context7` as connected with its tools; the agent asks for confirmation before each tool call (do not set `--trust`), then edits `src/routes/orders.ts`. The entry is saved in `.gemini/settings.json` for the project.

## Guidelines

- Check how the user can authenticate before suggesting Gemini CLI: unpaid-tier and Google One accounts are no longer served; offer Antigravity CLI for them.
- Prefer `npm install -g @google/gemini-cli` or Homebrew; never pipe an installer script into a shell.
- Treat `yolo` and `trust: true` as dangerous: they remove confirmations. Combine automatic approval only with `--sandbox` and a throwaway checkout.
- Pin the version in CI (`npm install -g @google/gemini-cli@0.65.0`); `latest` changes weekly.
- Piping a whole repository into a prompt costs tokens; use `@` references and `.geminiignore` to keep context small.
- MCP servers run with your user's permissions; install only servers you trust, keep tokens in environment variables, and give database servers a read-only role.
- Settings live in `~/.gemini/settings.json` and `.gemini/settings.json`; project files can change behaviour, so review them in repositories you did not write.
