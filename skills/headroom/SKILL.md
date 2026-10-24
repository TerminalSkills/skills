---
name: headroom
description: >-
  Headroom is a local compression layer that shrinks tool outputs, logs, JSON, files and RAG chunks before they reach an LLM, so long agent sessions cost fewer tokens. It runs as a Python or TypeScript library, an HTTP proxy, a wrapper for coding agents, or an MCP server. Use it when a user asks to "cut token usage", "compress tool output", "reduce my Claude Code bill", "run headroom proxy", "wrap claude with headroom", or "call compress() on messages".
license: Apache-2.0
compatibility: "Python 3.10+ (CLI and library), Node.js 18+ for the TypeScript SDK"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "headroom, token-compression, llm-proxy, context, cost-reduction"
  repository: https://github.com/headroomlabs-ai/headroom
---

# Headroom — compress what your agent reads before the model sees it

## Overview

Headroom sits between an application or coding agent and the LLM provider. It finds large, repetitive payloads (JSON arrays, logs, search results, code) and replaces them with a smaller version. Errors, outliers and first and last items are kept. The originals are cached locally, and the model can fetch them again through a `headroom_retrieve` tool. Compression runs on your machine.

The package name is `headroom-ai` on both PyPI and npm. The `headroom` command ships only in the PyPI package; the npm package is a TypeScript SDK with no CLI.

Savings depend on the payload. Repetitive JSON and logs shrink a lot; short chat turns, prose and already-dense output barely shrink. Headroom does not choose cheaper models or cache answers; for that, use a routing or caching tool.

## Instructions

### Install

```bash
python3 -m venv ~/.venvs/headroom
~/.venvs/headroom/bin/pip install "headroom-ai[proxy]"
```

The base package gives `compress()` and the CLI. Add extras as needed: `[proxy]` for the server, `[mcp]`, `[ml]` (the Kompress text model), `[code]`, `[memory]`, or `[all]` for everything except the framework adapters (`[langchain]`, `[agno]`, `[strands]`). Alternatively `uv tool install --python 3.13 "headroom-ai[all]"`. TypeScript: `npm install headroom-ai`.

To switch telemetry off, set `HEADROOM_TELEMETRY=off` (also `DO_NOT_TRACK=1` or `HEADROOM_OFFLINE=1`).

### Library: compress a message list

`compress(messages, model=...)` takes OpenAI-format or Anthropic-format messages and returns a result object with `messages`, `tokens_before`, `tokens_after`, `tokens_saved`, `compression_ratio` and `transforms_applied`.

```python
import json
from headroom import compress

rows = [{"id": i, "host": f"web-{i % 4}", "status": "ok", "latency_ms": 20 + i % 3,
         "msg": "request completed"} for i in range(300)]
rows[137] = {"id": 137, "host": "web-1", "status": "FATAL", "latency_ms": 9000,
             "msg": "disk full on /var/lib/postgres"}

messages = [
    {"role": "user", "content": "Why did the health checks fail?"},
    {"role": "assistant", "content": None, "tool_calls": [
        {"id": "call_1", "type": "function",
         "function": {"name": "list_checks", "arguments": "{}"}}]},
    {"role": "tool", "tool_call_id": "call_1", "content": json.dumps(rows)},
]

result = compress(messages, model="gpt-4o")
print(result.tokens_before, result.tokens_after, f"{result.compression_ratio:.0%}")
```

Send `result.messages` to the provider instead of the original list. Useful keyword arguments: `target_ratio` (lower is more aggressive), `protect_recent` (recent messages left untouched), `compress_user_messages=True` for long user-supplied documents, `optimize=False` for an A/B passthrough. Set `model` to the model you actually call; it drives token counting.

### Proxy: no code changes

```bash
~/.venvs/headroom/bin/headroom proxy --port 8787
```

The proxy binds to `127.0.0.1` by default. Point a client at it:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
OPENAI_BASE_URL=http://127.0.0.1:8787/v1 python app.py
```

Check it with `headroom doctor --port 8787` (exit code 0 healthy, 1 warnings, 2 failure), `curl http://127.0.0.1:8787/health`, and `curl http://127.0.0.1:8787/stats` for token counters. `headroom dashboard` opens the savings view; `headroom savings` shows the history.

Modes: `--mode cache` (default) freezes earlier turns so the provider prompt cache keeps hitting; `--mode token` rewrites earlier turns for maximum savings. `--no-optimize` makes the proxy a plain passthrough, which is useful for comparing.

For a third-party OpenAI-compatible provider, pass its URL (`--openai-api-url https://api.deepseek.com/v1` on `wrap`, or set `OPENAI_TARGET_API_URL`), otherwise your key goes to api.openai.com and fails with 401.

### Wrap a coding agent

```bash
headroom wrap claude              # starts the proxy, launches Claude Code through it
headroom wrap codex
headroom wrap claude --code-memory none   # skip registering the Serena MCP server
headroom unwrap claude            # undo durable changes
```

`wrap` also supports aider, copilot, cursor (prints settings to paste), cline, continue, goose, opencode and others; run `headroom wrap --help`. By default `wrap claude` registers the Serena code-navigation MCP server for the project in `~/.claude.json` and an MCP tool for retrieval; use `--no-mcp` or `--code-memory none` to skip them.

### MCP server and output reduction

```bash
headroom mcp install              # registers the MCP server for Claude Code
HEADROOM_OUTPUT_SHAPER=1 headroom proxy --port 8787   # also ask the model to be terse
headroom output-savings           # estimated, with a confidence interval
```

The MCP tools are `headroom_compress`, `headroom_retrieve` and `headroom_stats`.

### Learn from failed sessions

```bash
headroom learn --verbosity         # preview only
headroom learn --verbosity --apply # save the level and apply it to the running proxy
```

`headroom learn` can also write corrections into `CLAUDE.local.md`, `AGENTS.md` and similar files. Review the diff before keeping them.

## Examples

### Example 1: Measure savings on a tool result before adopting it

Request: "Our SRE agent sends a 300-row health-check dump to the model every turn. How many tokens would Headroom save?"

```bash
python3 -m venv ~/.venvs/headroom
~/.venvs/headroom/bin/pip install headroom-ai
HEADROOM_TELEMETRY=off ~/.venvs/headroom/bin/python compress_checks.py
```

where `compress_checks.py` holds the script from the library section. Result on that synthetic data (verified with headroom-ai 0.41.0): `10543 3959 62%`, and the single `FATAL` row is still present in `result.messages`. Real savings differ; run it on a captured payload from your own agent before deciding.

### Example 2: Put the proxy in front of Claude Code and read the stats

Request: "Route my Claude Code sessions through Headroom and show me what it saved."

```bash
~/.venvs/headroom/bin/pip install "headroom-ai[proxy]"
~/.venvs/headroom/bin/headroom proxy --port 8787 &
~/.venvs/headroom/bin/headroom doctor --port 8787
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
```

In another terminal after some work:

```bash
curl -s http://127.0.0.1:8787/stats | python3 -m json.tool | head -30
```

The `summary.compression` block lists `requests_compressed`, `total_tokens_before` and `total_tokens_removed`. At the start every counter is 0 until traffic arrives. Stop the proxy with `kill %1`.

## Guidelines

- Use one integration per request path: the proxy or `compress()`, not both on the same traffic, or content is compressed twice.
- Keep the proxy on `127.0.0.1`. It forwards your provider API keys; do not expose it on a public interface.
- The first proxy start loads the Kompress text model (about 20 seconds in testing); wait for `/health` to return `"ready": true`.
- Compression is lossy to the model's view. Keep `headroom_retrieve` available (do not use `--no-mcp` for agents that rely on it) and test answer quality on your own tasks.
- Skip Headroom for short conversations, prose-heavy prompts and workloads where one provider's native compaction is enough.
- `headroom wrap` and `headroom mcp install` change agent configuration. Know how to undo it (`headroom unwrap <tool>`).
- Pin the version in production and re-check CLI flags after upgrades; `headroom update` upgrades in place and `headroom update --check` only reports.
