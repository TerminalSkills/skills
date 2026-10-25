---
name: openai-codex-cli
description: >-
  OpenAI Codex CLI is an open-source terminal coding agent that reads your
  repository, edits files and runs commands inside an OS-enforced sandbox. Use
  when someone asks to "install Codex CLI", "run codex in CI", "use codex exec",
  "set Codex approval and sandbox modes", "write AGENTS.md for Codex", "review
  my diff with Codex", or "configure ~/.codex/config.toml".
license: Apache-2.0
compatibility: "macOS, Linux or Windows; Node.js 20+ for the npm install; a ChatGPT account or OpenAI API key."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "ai-coding, terminal, cli, openai, code-generation"
  repository: https://github.com/openai/codex
---

# OpenAI Codex CLI — AI Coding Agent in Your Terminal

## Overview

Codex CLI (`codex`, npm package `@openai/codex`, Apache-2.0) is OpenAI's coding agent for the terminal. It works in the current directory: it reads files, proposes and applies edits, and runs commands. Two settings decide how much it may do on its own: the **sandbox mode** (what commands can touch) and the **approval policy** (when it must stop and ask). The old `suggest` / `auto-edit` / `full-auto` approval modes, `config.yaml` and `codex.md` no longer exist: configuration is TOML and project instructions live in `AGENTS.md`. This skill was checked against `codex-cli 0.164.0`.

## Instructions

### Install and sign in

```bash
npm install -g @openai/codex      # or: brew install --cask codex
codex --version
codex                             # first run offers "Sign in with ChatGPT"
```

For headless machines, `codex login --device-auth` signs in without a local browser, and `printenv OPENAI_API_KEY | codex login --with-api-key` stores an API key read from stdin. `codex login status` shows what is active. The standalone installer script is also offered by OpenAI; download and inspect it rather than piping it into a shell.

### Interactive and one-shot use

```bash
codex                                            # interactive session in this repo
codex "Explain how the billing module is wired"  # interactive, with a first prompt
codex -m gpt-6.1-sol "Refactor src/auth to use refresh tokens"   # pick a model
codex -i docs/crash-screenshot.png "Why does this error appear?" # attach an image
codex --search "What changed in Prisma 7 migrations?"            # live web search
codex resume --last                              # continue the latest session
```

Inside a session, `/permissions` shows or switches the sandbox and approval level.

### Sandbox and approvals

| Flag | Values |
|------|--------|
| `-s, --sandbox` | `read-only`, `workspace-write`, `danger-full-access` |
| `-a, --ask-for-approval` | `on-request` (model decides when to ask), `never` |

The usual "automatic" preset is `--sandbox workspace-write --ask-for-approval on-request`: edits and commands inside the workspace run without asking, while network use or writes outside it need approval. The network is off by default; enable it for the workspace-write sandbox with `network_access = true` under `[sandbox_workspace_write]` in the config. `approval_policy = "untrusted"` and `--full-auto` have been removed; `--approve-for-me` routes approval requests to automatic review in a workspace-write sandbox. `--dangerously-bypass-approvals-and-sandbox` is only for machines that are already isolated (a throwaway CI container).

### Configuration: `~/.codex/config.toml`

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "cached"            # cached | indexed | live | disabled

[sandbox_workspace_write]
network_access = false
```

Precedence, highest first: CLI flags and `-c key=value` overrides, project `.codex/config.toml` (trusted projects only), profile file `~/.codex/<name>.config.toml` chosen with `-p <name>`, user config, system `/etc/codex/config.toml`, built-in defaults. One-off override: `codex -c model_reasoning_effort="high" "..."`.

### Project instructions: `AGENTS.md`

Codex reads `~/.codex/AGENTS.md` (or `AGENTS.override.md`) and then every `AGENTS.md` from the repository root down to the current directory, later files overriding earlier ones, up to 32 KiB by default (`project_doc_max_bytes`).

```markdown
# AGENTS.md

## Conventions
- Next.js 15 app router with tRPC and Drizzle; server components by default.
- Run `pnpm test` and `pnpm lint` before finishing a task.
- Never edit files under `drizzle/` by hand; generate migrations with `pnpm db:generate`.
```

### Non-interactive: `codex exec`

`codex exec` runs one task and exits. Progress goes to stderr and only the final message to stdout. It defaults to a read-only sandbox, so allow edits explicitly.

```bash
codex exec --sandbox workspace-write "Fix the failing tests in packages/api"
codex exec --json "summarize the repo layout" | jq -c 'select(.type=="item.completed")'
codex exec "Extract project metadata" --output-schema ./schema.json -o ./project-metadata.json
git diff main | codex exec "List risky changes in this diff"   # piped input is context
```

Useful flags: `--ephemeral` (no session files), `--ignore-user-config`, `--skip-git-repo-check`, `-o <file>` (final message to file). `codex exec resume --last "also update the docs"` continues a run.

### Review, MCP, cloud

```bash
codex review --uncommitted          # review working-tree changes
codex review --base main            # review against a branch (also --commit <sha>)
codex mcp add context7 -- npx -y @upstash/context7-mcp   # register an MCP server
codex mcp list
codex cloud                         # browse Codex Cloud tasks, apply results locally
codex apply                         # git-apply the latest diff from a Codex task
```

## Examples

### Example 1: Let Codex fix tests locally

**Request:** "Run the tests in packages/api and fix whatever fails, but don't touch anything outside the repo."

```bash
cd ~/work/storefront || exit 1
git switch -c fix/api-tests
codex --sandbox workspace-write --ask-for-approval on-request \
  "Run pnpm --filter api test, read the failures and fix the code. Do not change test expectations."
```

Codex runs the tests inside the sandbox, edits files in the workspace, and pauses only if a command needs the network or a path outside the repo. Review with `git diff` before committing.

### Example 2: Nightly job in CI with structured output

**Request:** "Every night, have Codex list TODO comments older than a release and write a JSON report."

```bash
export OPENAI_API_KEY="$CODEX_CI_KEY"
printenv OPENAI_API_KEY | codex login --with-api-key
codex exec --ephemeral --sandbox read-only \
  --output-schema ./todo-report.schema.json \
  -o ./todo-report.json \
  "Find TODO and FIXME comments in src/ and group them by module"
jq '.modules | length' todo-report.json
```

The read-only sandbox means the job cannot modify the checkout; `todo-report.json` holds only the final, schema-conforming message.

## Guidelines

- Start with `read-only` or `workspace-write` plus `on-request`; widen only when a task needs it, and keep `danger-full-access` for isolated runners.
- Put durable rules in `AGENTS.md`, not in every prompt; keep it short, it is capped at 32 KiB.
- Name files, commands and the expected result in the prompt: "fix the pagination bug in src/routes/posts.ts" beats "fix bugs".
- Commit or stash before a long run so `git diff` shows exactly what Codex changed.
- Model ids and plan limits change often; check `codex -m <id>` against what your account offers rather than copying ids from old posts.
