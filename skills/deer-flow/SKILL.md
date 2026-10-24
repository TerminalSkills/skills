---
name: deer-flow
description: >-
  Installs and runs DeerFlow 2.0, ByteDance's open-source "super agent harness" that gives a lead agent sub-agents, long-term memory, a sandbox for running code, and a library of skills for deep research, reports and slide decks. Use when a user wants to set up DeerFlow with Docker or locally, configure models in config.yaml, choose a sandbox mode, call it from Python with DeerFlowClient, or debug a broken setup with make doctor. Triggers include "set up DeerFlow", "run a deep research agent", "super agent harness", "deer-flow config.yaml".
license: Apache-2.0
compatibility: "Docker with Compose v2.24+ (recommended), or Node.js 22+, pnpm, uv and nginx; Python 3.12+; an API key for at least one LLM provider"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "deerflow, agent-harness, deep-research, sub-agents, sandbox"
  repository: https://github.com/bytedance/deer-flow
---

# DeerFlow — a super agent harness for long research and build tasks

## Overview

DeerFlow 2.0 (repository `bytedance/deer-flow`) is a ground-up rewrite. It shares no code with version 1, the original "Deep Research" framework, which now lives on the `main-1.x` branch. Do not mix instructions for the two.

The 2.0 harness has a lead agent that can delegate work to sub-agents through a `task` tool, keeps long-term memory, runs files and shell commands inside a sandbox, and loads capabilities from skills (the repository ships `deep-research`, `data-analysis`, `consulting-analysis`, `ppt-generation`, `podcast-generation` and others under `skills/public/`). It serves a web UI and a Gateway HTTP API on one port (2026 by default), and can also be embedded as a Python library.

An agent can realistically: clone and bootstrap it, write `config.yaml`, pick a sandbox, start and stop the services, run `make doctor`, and drive it through `DeerFlowClient` or the Gateway API. It cannot supply model API keys; the user creates those with their provider.

## Instructions

### Installation with Docker (recommended)

Needs Docker with Compose v2.24 or newer (`docker compose version`). The repository also ships `Install.md`, written for coding agents; it prefers Docker and stops with the next command rather than starting services.

```bash
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow
make setup          # interactive wizard: provider, optional web search, sandbox and bash preferences
make docker-init    # pulls the sandbox image (once)
make docker-start   # development stack with hot reload
make docker-logs
```

The wizard writes a minimal `config.yaml` and puts keys in `.env`. If you only want the full template, run `make config` instead; it aborts when `config.yaml` already exists. Open http://localhost:2026 once the stack is up. The first visit goes through `/setup` to create the admin account; do this immediately on any host that is not loopback-only.

For a long-running server use the production stack:

```bash
make up      # builds images, waits for the Gateway /health, then reports success
make down    # stops and removes the containers
```

### Installation without Docker

```bash
make check     # verifies Node.js 22+, pnpm, uv and nginx
make install   # backend and frontend dependencies
make dev       # all services with hot reload, http://localhost:2026
```

On Windows run these from Git Bash. If a cold start is slow, raise the Gateway wait: `DEER_FLOW_GATEWAY_STARTUP_TIMEOUT=240 make dev`. `make stop` stops local services. Never run `make clean` unless the user wants local data gone: it deletes the database, users, threads, uploads, memory and secrets under `backend/.deer-flow`.

### Configure a model

`config.yaml` in the project root has a `models:` list; the template `config.example.yaml` carries commented examples for several providers. A minimal OpenAI-compatible entry:

```yaml
models:
  - name: gpt-4
    display_name: GPT-4
    use: langchain_openai:ChatOpenAI
    model: gpt-4
    api_key: $OPENAI_API_KEY
    request_timeout: 600.0
    max_retries: 2
    context_window: 128000
    supports_vision: true
```

The `$OPENAI_API_KEY` form reads the variable from the environment or from `.env`; never paste a key into `config.yaml`. Local Ollama models need `langchain_ollama:ChatOllama`, not the OpenAI class. Backend processes pick up `config.yaml` changes on the next config access, so no restart is needed for model edits. After upgrading the repository, `make config-upgrade` merges new fields from the template into your file.

Move config and runtime state with `DEER_FLOW_CONFIG_PATH`, `DEER_FLOW_PROJECT_ROOT`, `DEER_FLOW_HOME` and `DEER_FLOW_ENV_FILE`.

### Choose a sandbox

The `sandbox:` block selects where the agent runs commands:

```yaml
sandbox:
  use: deerflow.sandbox.local:LocalSandboxProvider
  allow_host_bash: false
```

`LocalSandboxProvider` is the default and is not an isolation boundary; host `bash` stays disabled unless `allow_host_bash: true`, which is acceptable only for a single trusted user. For isolation switch to the container provider, `use: deerflow.community.aio_sandbox:AioSandboxProvider`, and pin an explicit image version (the template recommends `all-in-one-sandbox:1.11.0` from the Volcengine registry because its `:latest` tag is frozen on an old build). Extra host folders are exposed with `mounts` entries containing `host_path`, `container_path` and `read_only`. Run `make setup-sandbox` to pre-pull the image.

### Use it from Python

The embedded client runs the agent in-process with the same response shapes as the Gateway:

```python
from deerflow.client import DeerFlowClient

client = DeerFlowClient()   # or DeerFlowClient(config_path="config.yaml")
reply = client.chat("Compare managed Postgres offerings on price", thread_id="pg-comparison")

for event in client.stream("Continue with a recommendation", thread_id="pg-comparison"):
    if event.type == "messages-tuple" and event.data.get("type") == "ai":
        print(event.data["content"])

print(client.list_models())
print(client.list_skills())
```

Thread IDs must match `^[A-Za-z0-9_-]{1,64}$`. Reuse the same `thread_id` to continue a conversation.

### Drive it from Claude Code

The repository ships a `claude-to-deerflow` skill that sends tasks to a running instance. Install it with `npx skills add https://github.com/bytedance/deer-flow --skill claude-to-deerflow`. Point it elsewhere with `DEERFLOW_URL` (default `http://localhost:2026`).

### Diagnose problems

```bash
make doctor           # checks config and system requirements, prints fix hints
make support-bundle   # redacted issue summary plus draft, under .deer-flow/support-bundles/
```

The bundle excludes `.env`, raw messages and user files, but read it before sharing.

## Examples

### Example 1: bring up DeerFlow on a laptop with Docker

**Request**: "Set up DeerFlow here so I can try its deep research mode."

```bash
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow
docker compose version      # confirm v2.24 or newer
make setup                  # the user answers the provider and key prompts
make doctor
make docker-init
make docker-start
```

**Result**: `make doctor` reports a valid `config.yaml` and the user's key variable name; the stack answers on http://localhost:2026, where the user creates the admin account. Report the URL and any missing key; do not open `.env`.

### Example 2: scripted research run on a pinned model

**Request**: "Write a script that asks DeerFlow for a vendor comparison and saves the answer."

```python
from pathlib import Path
from deerflow.client import DeerFlowClient

client = DeerFlowClient(config_path="config.yaml")
answer = client.chat(
    "Research Grafana Cloud, Datadog and Honeycomb pricing for 40 services and write a one-page comparison.",
    thread_id="observability-pricing",
)
Path("observability-pricing.md").write_text(str(answer))
```

**Result**: the lead agent searches the web with the configured search tool, may delegate to sub-agents, and returns the text, which the script saves. Run it with the backend environment (`uv run --project backend python script.py` from the repository root).

## Guidelines

- DeerFlow executes commands and writes files. Its authors design it for a trusted local environment on 127.0.0.1; the Docker stack publishes on loopback only. To reach it from another machine set `BIND_HOST` in `.env` only after adding an IP allowlist and an authenticating reverse proxy.
- Gateway admin is equivalent to code execution on the host (admins can register stdio MCP servers). Grant it accordingly.
- Keep `allow_host_bash: false` unless the machine is single-user and trusted; prefer the container sandbox for anything shared.
- The default web search tool is DuckDuckGo and the default fetch tool is Jina, both configured under `tools:`; search quality and rate limits depend on them.
- Production defaults to one Gateway worker. Multiple workers need Postgres, a Redis stream bridge and database-backed run events.
- Plan for 4 vCPU and 8 GB RAM at minimum for local use, more for a shared server; a local LLM is sized separately.
- Do not use this skill for DeerFlow 1.x or for a hand-written LangGraph pipeline; those are different codebases.
