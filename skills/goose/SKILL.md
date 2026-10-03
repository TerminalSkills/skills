---
name: goose
description: >-
  Goose is an open-source AI agent (desktop app, CLI and API, written in Rust)
  that runs on your machine, edits files, runs shell commands and connects to
  tools through MCP extensions. Use when the user asks to set up goose, run it
  headless in scripts or CI, write a goose recipe, add an MCP extension, switch
  LLM providers, or compare goose with other coding agents.
license: Apache-2.0
compatibility: "macOS, Linux and Windows; a single native binary (no Python needed); an API key for an LLM provider or a local Ollama model"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["ai-agent", "extensible", "coding-agent", "mcp"]
  repository: https://github.com/aaif-goose/goose
---

# Goose — Extensible AI Agent

## Overview

Goose is a general-purpose AI agent that runs locally. It has a desktop app, a CLI and an API, and works with 15+ LLM providers (Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, Bedrock and more). Capabilities come from extensions: built-in ones (Developer for shell and file editing, Computer Controller, Memory) plus any MCP server. The project began at Block and now lives at `aaif-goose/goose` under the Linux Foundation's Agentic AI Foundation; the old `block/goose` links redirect there. This skill was checked against v1.53.0 (2 October 2026).

It is a Rust binary: the old `pipx install goose-ai` Python package and its Python extension API are not how goose works today.

## Instructions

### Install

```bash
# macOS and Linux (Homebrew formula in homebrew-core)
brew install block-goose-cli

goose --version      # 1.53.0 at the time of writing
goose configure      # pick a provider, paste its API key, choose extensions
goose doctor         # checks that the setup works
goose update         # later: update the CLI in place
```

The project also publishes an install script, `download_cli.sh`, on its GitHub releases page. Releases carry no checksum file, so do not pipe it into a shell; use Homebrew, or download the script and read it before running. Desktop builds (macOS, Windows, `.deb`/`.rpm` for Linux) are on the same releases page; on macOS `brew install --cask block-goose` installs the app.

### Interactive sessions

```bash
goose session -n billing-refactor          # start a named session
goose session --resume -n billing-refactor # continue it
goose session --resume --fork --name billing-refactor   # copy it into a new session
goose session list --limit 10
goose session --with-builtin developer --max-turns 25
```

Sessions are stored in a SQLite database (`sessions.db`) since v1.10. Run `goose info` to see the config, session and log paths.

### Headless runs for scripts and CI

```bash
goose run -t "Write unit tests for src/auth.py and run them" --no-session
goose run -i plan.md                  # instructions from a file
echo "Explain this stack trace" | goose run -i -   # stdin
goose run --provider anthropic --model claude-sonnet-4-5 -t "Summarise the last 5 commits" -q
goose run --recipe nginx-triage.yaml --params log_file=/var/log/nginx/access.log --output-format json
```

`-q` prints only the model's answer; `--output-format json` or `stream-json` gives machine-readable output. There is no `--stdin` flag and no `--profile` flag.

### Providers and configuration

Settings live in `~/.config/goose/config.yaml` (Windows: `%APPDATA%\Block\goose\config\config.yaml`). Environment variables win over the file:

```bash
export GOOSE_PROVIDER=anthropic
export GOOSE_MODEL=claude-sonnet-4-5-20250929
export ANTHROPIC_API_KEY="$(cat ~/.secrets/anthropic)"   # keys belong in env or the keyring
export GOOSE_MODE=smart_approve        # auto (default) | approve | smart_approve | chat
```

```yaml
# ~/.config/goose/config.yaml
active_provider: anthropic
providers:
  anthropic:
    enabled: true
    model: claude-sonnet-4-5-20250929
    configured: true
GOOSE_MODE: smart_approve
GOOSE_MAX_TURNS: 50
```

Provider API keys placed in `config.yaml` are ignored; goose reads them from the environment, the system keyring, or `secrets.yaml` when no keyring exists (set `GOOSE_DISABLE_KEYRING=1` to force the file).

### Extensions (MCP)

Built-in: `developer` (on by default), `computercontroller`, `memory`, `tutorial`, `autovisualiser`, plus platform extensions such as `analyze`, `todo`, `skills`, `summon` and `extension manager`. Add an MCP server from the CLI or the config:

```bash
goose session --with-extension "memory:npx -y @modelcontextprotocol/server-memory"
goose session --with-streamable-http-extension "http://localhost:8080/mcp"
```

```yaml
# config.yaml, extensions section
extensions:
  filesystem:
    type: stdio
    name: filesystem
    enabled: true
    cmd: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/srv/projects"]
    timeout: 300
  internal-tools:
    type: streamable_http
    name: internal-tools
    enabled: true
    uri: "https://mcp.tools.myteam.dev/mcp"
    timeout: 300
```

Supported types are `builtin`, `platform`, `stdio` and `streamable_http`; SSE is gone, so migrate old SSE entries to `streamable_http`. Use `available_tools: [...]` to expose only some of a server's tools. To build your own extension, write any MCP server (Python, TypeScript, Rust SDKs) and register it as `stdio`.

### Recipes

A recipe is a shareable YAML file with a title, prompt, parameters and extensions. Validate and render it before running:

```yaml
# nginx-triage.yaml
version: "1.0.0"
title: "Nginx 5xx triage"
description: "Count 5xx responses in an nginx access log and summarise the worst URLs"
parameters:
  - key: log_file
    input_type: string
    requirement: required
    description: "Path to the nginx access log"
  - key: threshold
    input_type: number
    requirement: optional
    default: 10
    description: "Report only if more than this many 5xx responses"
instructions: "You triage web server errors. Read-only: never modify the log."
prompt: "Count 5xx responses in {{ log_file }}. If there are more than {{ threshold }}, list the five URLs with the most errors."
extensions:
  - type: builtin
    name: developer
```

```bash
goose recipe validate nginx-triage.yaml     # prints: recipe file is valid
goose run --recipe nginx-triage.yaml --params log_file=/var/log/nginx/access.log --render-recipe
```

## Examples

### Example 1: Nightly test run in CI

Request: "Run goose in GitHub Actions to fix failing tests and print only the result."

```bash
export GOOSE_PROVIDER=anthropic GOOSE_MODEL=claude-sonnet-4-5-20250929 GOOSE_MODE=auto
goose run --no-session -q --max-turns 30 \
  -t "Run npm test. If tests fail, fix the code (not the tests) and rerun until green. Report what you changed."
```

`ANTHROPIC_API_KEY` comes from the workflow's secrets. The run exits after the final answer and prints only the model's response, so the job log stays readable.

### Example 2: Incident helper with a recipe

Request: "Give the on-call team a one-command nginx triage."

```bash
goose recipe validate nginx-triage.yaml
goose run --recipe nginx-triage.yaml --params log_file=/var/log/nginx/access.log --params threshold=20
```

Goose reads the log with the Developer extension and answers with, for example, "47 5xx responses in the log; top URLs: /api/checkout (22), /api/search (11) ...". Share the YAML in the repo so everyone runs the same triage.

## Guidelines

- The default mode is fully autonomous: with the Developer extension goose can run commands and edit files without asking. Use `GOOSE_MODE=smart_approve` or `approve` on machines that matter, and run unattended jobs in a container or throwaway VM.
- Cap runaway loops with `--max-turns` and `--max-tool-repetitions`; add `--debug` (or `GOOSE_DEBUG=1`) to see full tool parameters.
- Extensions run as separate processes; goose scans external extension packages for known malware before starting them. Only add MCP servers you trust and give each only the env vars it needs.
- Never put API keys in `config.yaml`, recipes or the repo.
- Recipes must be `.yaml` or `.json`; `.yml` is not supported by the CLI.
- Local models (Ollama, LM Studio) work, but weaker models call tools unreliably; try `GOOSE_TOOLSHIM=true` with `GOOSE_TOOLSHIM_OLLAMA_MODEL` if tool calls fail.
- Prefer a simpler tool when you only need chat-style code completion; goose shines for multi-step, tool-using tasks.
