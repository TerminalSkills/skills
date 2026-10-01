---
name: openhands
description: >-
  OpenHands is an open-source autonomous coding agent that edits files, runs shell commands and
  works through multi-step software tasks with any LLM, from a terminal UI, a headless CI mode,
  a self-hosted web control center (Agent Canvas) or a Python SDK. Use when a user wants a
  model-agnostic, self-hostable coding agent: "run OpenHands on this repo", "fix this bug with
  OpenHands headless in CI", "set up OpenHands with a local Ollama model", "script an agent with
  the OpenHands SDK", "add an MCP server to OpenHands", or "run Claude Code and Codex from one
  self-hosted dashboard".
license: Apache-2.0
compatibility: "CLI: Python 3.12 and uv, Linux/macOS or WSL on Windows. Agent Canvas: Node.js 24+ and uv, or Docker. SDK: Python 3.12+. Needs an API key for an LLM supported by LiteLLM, or a local OpenAI-compatible server."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["ai-coding-agent", "autonomous-agent", "self-hosted", "headless", "agent-sdk"]
  repository: https://github.com/OpenHands/OpenHands
---
# OpenHands — Open-Source Autonomous Coding Agent

## Overview

OpenHands (formerly OpenDevin, now under the `OpenHands` GitHub organization) is an agent that
works on a codebase the way a developer does: it reads files, edits them, runs commands and tests,
and keeps going until the task is done. It is model-agnostic (any LiteLLM provider, OpenHands
Cloud models, or a local model server) and ships in four forms:

| Form | Install | Best for |
|------|---------|----------|
| CLI (`openhands`) | `uv tool install openhands` | Interactive terminal work, headless runs in CI |
| Agent Canvas (`agent-canvas`) | `npm install -g @openhands/agent-canvas` or Docker | Self-hosted web control center, automations, several backends |
| Software Agent SDK | `pip install openhands-sdk openhands-tools` | Building your own agents in Python |
| OpenHands Cloud | `openhands login` / `openhands cloud` | Hosted sandboxes and models (hosted service) |

The main `OpenHands/OpenHands` repository now holds Agent Canvas; the agent loop and server live
in `OpenHands/software-agent-sdk`. Agent Canvas can also drive Claude Code, Codex and Gemini CLI
through the Agent Client Protocol (ACP).

## Instructions

### Install the CLI

The CLI needs Python 3.12 and `uv`. Install it as an isolated tool:

```bash
uv tool install openhands --python 3.12
openhands --version
```

Upgrade later with `uv tool upgrade openhands --python 3.12`. On Windows, run everything inside WSL.

On first launch, `openhands` asks for an LLM provider, model and API key and saves them under
`~/.openhands/` (`agent_settings.json`). Conversation history goes to `~/.openhands/conversations/`.
Set `OPENHANDS_PERSISTENCE_DIR` to keep that state somewhere else.

### Work interactively

Run the CLI from the project root. The agent works in the current directory.

```bash
cd ~/code/invoice-service
openhands                                   # empty session
openhands -t "Fix the failing test in tests/test_totals.py"
openhands -f tasks/add-pagination.md        # task text from a file
openhands --resume --last                   # continue the latest conversation
```

Inside the UI: `Ctrl+P` opens the command palette (settings, MCP status, plan), `Esc` pauses the
agent, `/new` starts a new conversation, `/skills` lists loaded skills and MCP servers, `/exit` quits.

By default the CLI asks before running actions. `--llm-approve` asks only for actions an LLM
security analyzer rates high-risk; `--always-approve` (alias `--yolo`) never asks.

Give the agent standing project context with an `AGENTS.md` file at the repository root. OpenHands
loads it into every conversation, so put build, test and lint commands and conventions there.

### Run headless for scripts and CI

Headless mode has no UI and requires `--task` or `--file`. It always auto-approves every action,
so run it only in a disposable checkout or container.

```bash
openhands --headless -t "Add type hints to src/billing/tax.py and run mypy"
openhands --headless --json -f tasks/upgrade-pydantic.md > openhands-run.jsonl
```

`--json` streams one JSON event per line (actions and observations) for parsing. Exit code `0`
means success, `1` an error or failed task, `2` invalid arguments.

Environment variables are ignored unless you pass `--override-with-envs`. On a machine with no
saved settings (a CI runner), both `LLM_API_KEY` and `LLM_MODEL` must be set:

```bash
export LLM_API_KEY="$ANTHROPIC_API_KEY"          # key from console.anthropic.com
export LLM_MODEL="anthropic/claude-sonnet-4-5-20250929"
openhands --headless --override-with-envs -f .openhands/nightly-task.md
```

Overrides are not written to disk. `LLM_BASE_URL` points the agent at a proxy or a local
OpenAI-compatible server.

### Use a local model

OpenHands needs a large context window (at least ~22k tokens, 32k recommended) and a model that is
reliable at tool calls. With Ollama, raise the context length before serving:

```bash
OLLAMA_CONTEXT_LENGTH=32768 ollama serve
ollama pull qwen3.6:35b-a3b
```

Then address the model through Ollama's OpenAI-compatible endpoint, prefixing the model ID with `openai/`:

```bash
export LLM_API_KEY="ollama"                      # any non-empty value
export LLM_MODEL="openai/qwen3.6:35b-a3b"
export LLM_BASE_URL="http://localhost:11434/v1"
openhands --override-with-envs
```

If the agent behaves like a plain chatbot or keeps failing tool calls, the model is the usual
cause; try a stronger one before debugging the setup.

### Add MCP servers

```bash
openhands mcp add fetch --transport stdio uvx -- mcp-server-fetch
openhands mcp add notion --transport http --auth oauth https://mcp.notion.com/mcp
openhands mcp list
openhands mcp disable fetch
```

Transports are `stdio`, `http` and `sse`. `--header "Key: Value"` and `--env KEY=value` are
repeatable. The configuration is stored in `~/.openhands/mcp.json`.

### Run Agent Canvas (self-hosted web UI)

Agent Canvas is the browser control center: conversations, several agent backends (laptop, VM,
Docker, cloud) and scheduled or webhook-triggered automations. The npm launcher runs the agent
directly on the host with full filesystem access:

```bash
npm install -g @openhands/agent-canvas
agent-canvas                        # http://localhost:8000, bound to 127.0.0.1
OH_CONVERSATION_RUNTIME=docker agent-canvas   # one Docker container per conversation
```

For a sandboxed install, run the Docker image and mount only the projects the agent may touch:

```bash
export PROJECTS_PATH="$HOME/projects"
mkdir -p "$PROJECTS_PATH" "$HOME/.openhands"
docker run -it --rm \
  -p 127.0.0.1:8000:8000 \
  -e AGENT_CANVAS_ALLOW_LAN_SESSION_KEY=true \
  -v "$HOME/.openhands:/home/openhands/.openhands" \
  -v "$PROJECTS_PATH:/projects" \
  ghcr.io/openhands/agent-canvas:1.24.0
```

Open `http://localhost:8000/canvas`. A setup wizard picks the agent (OpenHands, Claude Code, Codex
or Gemini CLI), checks the backend and asks for an LLM key.

### Build agents with the Python SDK

Install the SDK and tools in one command so their versions match:

```bash
pip install -U openhands-sdk openhands-tools
```

```python
import os

from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.tools.file_editor import FileEditorTool
from openhands.tools.terminal import TerminalTool

llm = LLM(
    model=os.getenv("LLM_MODEL", "anthropic/claude-sonnet-4-5-20250929"),
    api_key=os.getenv("LLM_API_KEY"),
)
agent = Agent(llm=llm, tools=[Tool(name=TerminalTool.name), Tool(name=FileEditorTool.name)])

conversation = Conversation(agent=agent, workspace=os.getcwd(), max_iteration_per_run=60)
conversation.send_message("Run pytest, fix any failing test in tests/, and summarize the fix.")
conversation.run()
```

The SDK also offers Docker and remote workspaces, MCP tools, hooks, persistence and
security confirmation policies; see docs.openhands.dev/sdk.

## Examples

### Example 1: Nightly dependency bump in GitHub Actions

**Request:** "Every night, have OpenHands bump our patch-level npm dependencies, run the tests, and
keep a log of what it did."

```yaml
# .github/workflows/openhands-nightly.yml
name: openhands-nightly
on:
  schedule:
    - cron: "0 3 * * *"
jobs:
  bump:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false      # keep GITHUB_TOKEN out of .git/config
      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"
      - run: |
          pip install uv
          uv tool install openhands --python 3.12
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - name: Run OpenHands headless
        env:
          LLM_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          LLM_MODEL: anthropic/claude-sonnet-4-5-20250929
        run: |
          openhands --headless --json --override-with-envs \
            -t "Update patch-level npm dependencies in package.json, run npm ci and npm test, and revert any bump that breaks a test." \
            > openhands-run.jsonl
          ! grep -q "requires existing settings" openhands-run.jsonl
      - uses: actions/upload-artifact@v7
        with:
          name: openhands-run
          path: openhands-run.jsonl
```

Add `ANTHROPIC_API_KEY` under the repository's Settings → Secrets and variables → Actions. The
agent's shell commands inherit `LLM_API_KEY`, so it can read the key: use a dedicated key with a
spend limit for CI. The job leaves modified `package.json` and `package-lock.json` in the runner's checkout plus a JSONL trace;
add your own step to open a pull request from the diff.

### Example 2: Fully local agent on a workstation GPU

**Request:** "I can't send our code to a cloud model. Run OpenHands against Ollama on my machine and
make it add request logging to our Flask API."

```bash
OLLAMA_CONTEXT_LENGTH=32768 ollama serve &
ollama pull qwen3.6:35b-a3b
cd ~/code/fleet-tracker-api
export LLM_API_KEY="ollama" LLM_MODEL="openai/qwen3.6:35b-a3b" LLM_BASE_URL="http://localhost:11434/v1"
openhands --override-with-envs -t "Add structured request logging (method, path, status, duration_ms) to app/__init__.py using the standard logging module, then run pytest."
```

The terminal UI shows each proposed command and edit for approval. The agent edits
`app/__init__.py`, runs `pytest`, and reports the result, with no code leaving the machine.

## Guidelines

- **Isolation first.** The CLI and the npm Agent Canvas launcher run commands on your host with your
  user's permissions. For untrusted repos or unattended runs, use the Docker image,
  `OH_CONVERSATION_RUNTIME=docker`, or a throwaway CI runner.
- **Headless means no confirmations.** `--headless` always auto-approves. Never run it against a
  checkout that holds production credentials or `.env` files with live secrets.
- **Remember `--override-with-envs`.** Without it `LLM_API_KEY`/`LLM_MODEL` are ignored (only a
  warning), and a fresh runner prints "Headless mode requires existing settings" but still exits
  `0`, so the CI step goes green having done nothing. Always pass the flag in CI.
- **Model quality decides results.** Small local models often fail at tool use; OpenHands needs
  22k+ context. Budget API spend for long tasks and cap SDK runs with `max_iteration_per_run`.
- **Pin versions.** The CLI is `openhands` on PyPI (Python 3.12 only); the SDK packages
  `openhands-sdk` and `openhands-tools` must share one version.
- **Exposing Agent Canvas.** It binds to `127.0.0.1` by default. Before listening on a LAN or the
  internet, drop `AGENT_CANVAS_ALLOW_LAN_SESSION_KEY`, set a strong `LOCAL_BACKEND_API_KEY`, and
  follow the project's self-hosting guide.
- **Outdated guides.** The project moved from the `All-Hands-AI` organization to `OpenHands`, and
  CLI 1.0 changed the settings format. Older tutorials may not match; check docs.openhands.dev.
- **When not to use it.** For a small edit inside an IDE, an editor assistant is lighter. If the
  team already standardizes on Claude Code or Codex and needs no self-hosting or model choice,
  OpenHands adds setup without much gain (though Agent Canvas can host those agents).
