---
name: openviking
description: >-
  OpenViking is an open-source context database for AI agents: one virtual file system under viking:// that holds an agent's knowledge, memories and skills, with generated summaries and semantic search. Use when the user wants persistent agent memory across sessions, wants to import docs or repos for agents to search, asks about the ov CLI, openviking-server or viking:// URIs, or wants to connect Claude Code, Codex or Cursor to a shared memory server.
license: Apache-2.0
compatibility: "Server: Python 3.10+ and uv, plus an embedding model and a VLM. Client: Node.js and npm for the ov CLI, or Python for openviking-sdk. OpenViking 0.5.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/volcengine/OpenViking
  tags: [context-database, agent-memory, openviking, context-management, file-system]
  use-cases:
    - "Give AI agents organized, persistent context that survives across sessions"
    - "Import project docs and repositories so agents can search them by meaning"
    - "Share one memory server between Claude Code, Codex and Cursor"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenViking

## Overview

OpenViking (volcengine/OpenViking, AGPL-3.0 server) is a context database for agents. Everything an agent knows lives in a virtual file system addressed by `viking://` URIs, and agents use file-like commands on it: `ls`, `tree`, `read`, `write`, `grep`, `find`. Checked against version 0.5.2 (PyPI, 2026-10-23) and the `ov` CLI 0.5.1.

Layout of the tree:

```
viking://
├── resources/                 # imported docs, repos, web pages
│   └── my_project/
└── user/{user_id}/
    ├── memories/              # preferences, experience, extracted from sessions
    ├── resources/             # private imports
    └── skills/
```

Every processed directory gets generated summaries, so an agent can check relevance cheaply before opening content:

- L0 abstract: one sentence (`ov abstract`).
- L1 overview: structure and key points (`ov overview`).
- L2 details: the original file (`ov read`).

Architecture: OpenViking is a server (HTTP, default port 1933). Clients are the `ov` CLI (npm), the SDKs (Python `openviking-sdk`, TypeScript `@openviking/sdk`, Go) and agent plugins. The server needs an embedding model and a VLM to build summaries and vectors.

## Instructions

### 1. Get a server

Self-hosted (uv required):

```bash
uv tool install openviking --upgrade
openviking-server init      # wizard, writes ~/.openviking/ov.conf
openviking-server doctor    # checks the model configuration
openviking-server           # runs in the foreground
curl http://127.0.0.1:1933/health
```

`init` supports Volcengine, OpenAI, Kimi, GLM and local Ollama providers. The alternative is the Volcengine-hosted OpenViking Service (endpoint `https://api.vikingdb.cn-beijing.volces.com/openviking`, API key from the console). Docker and production notes: docs.openviking.ai, Deployment guide.

### 2. Install and connect the CLI

```bash
npm install -g @openviking/cli
ov language en              # required once, or most commands exit with code 2
ov config                   # interactive: OpenViking Service or Custom URL
ov health
```

For scripts, save a named connection and pass the key through the environment, not the command line:

```bash
printf '%s' "$OPENVIKING_API_KEY" | ov config add custom --name team-memory --url http://127.0.0.1:1933 --api-key-stdin --activate -o json
ov config validate
```

The client config is `~/.openviking/ovcli.conf` (fields `url`, `api_key`, `timeout`, `output`); it is separate from the server's `ov.conf`.

### 3. Import, browse, search, read

```bash
ov add-resource ./docs --to viking://resources/billing-docs --wait
ov tree viking://resources/billing-docs -L 2
ov overview viking://resources/billing-docs
ov find "how are refunds retried" -u viking://resources/billing-docs
ov grep "idempotency" -u viking://resources/billing-docs -i
ov read viking://resources/billing-docs/refunds.md --offset 0 --limit 40
```

- `add-resource` accepts a file, folder, URL, repository or sitemap. `--to` needs a URI that does not exist yet; `--parent` needs an existing directory; `-p` creates the parent. Without `--wait`, poll `ov task status TASK_ID`.
- `find` is semantic search; `-L 0,1,2` limits levels, `--context-type memory|resource|skill` limits the kind, `-t` sets a score threshold.
- `ov write URI --content "..."` updates an existing file (`--append`, `--from-file`).

### 4. Memories and sessions

```bash
ov add-memory "The deployment owner for billing is Priya Raman"      # experimental
ov session new
ov session add-message SESSION_ID --role user --content "We moved billing to Postgres 16"
ov session commit SESSION_ID      # archives the messages and extracts memories
ov find "billing database" --context-type memory
```

Commit extracts memories as Markdown under `viking://user/{user_id}/memories/`; extraction runs in the background, so a search right after the commit may find nothing.

### 5. Python SDK

```bash
python3 -m pip install openviking-sdk      # import name: openviking_sdk
```

```python
import os
from openviking_sdk import SyncHTTPClient

client = SyncHTTPClient(url="http://127.0.0.1:1933", api_key=os.environ["OPENVIKING_API_KEY"])
client.initialize()
client.add_resource("./docs", to="viking://resources/billing-docs", wait=True)
hits = client.find("how are refunds retried", target_uri="viking://resources/billing-docs", limit=5)
client.create_session(session_id="billing-review")
client.session(session_id="billing-review").add_message(role="user", content="Refund retries use exponential backoff")
client.session(session_id="billing-review").commit()
client.close()
```

The SDK also reads `OPENVIKING_URL`, `OPENVIKING_API_KEY` and `~/.openviking/ovcli.conf`; explicit arguments win.

### 6. Connect a coding agent

The project ships memory plugins for Claude Code, Codex, Cursor, TRAE, OpenCode, OpenClaw, Hermes and an MCP route (docs.openviking.ai, section Agent integrations). The README also offers a shell installer at `https://openviking.ai/install`. Download it to a file, read it, and run it only if you accept what it does; never pipe it into a shell. Use a user key, not the root key.

## Examples

### Example 1: "Let my agent search our API docs by meaning"

```console
$ ov add-resource ./docs/api --to viking://resources/payments-api --wait
$ ov find "webhook signature verification" -u viking://resources/payments-api -n 3
```

The second command returns up to three matches with a `viking://resources/payments-api/...` URI and a score each. The agent then calls `ov overview` on the best directory and `ov read` on the file it needs, instead of loading all the docs.

### Example 2: "Make Claude Code remember my preferences across sessions"

```console
$ ov session new
$ ov session add-message SESSION_ID --role user --content "I prefer pytest fixtures over unittest setUp, and Ruff for linting"
$ ov session commit SESSION_ID
$ ov find "testing preferences" --context-type memory
```

Extraction runs in the background, so the search may find nothing right after the commit; once it finishes, it returns memory files under `viking://user/maria/memories/` (the docs show `preferences/` and `entities/` subdirectories, but which files appear depends on the extraction). With the Claude Code plugin installed, hooks do the add and commit steps automatically.

## Guidelines

- Set the display language once (`ov language en`); in non-interactive shells the CLI otherwise exits with code 2.
- Auth: the server picks `api_key` mode when `root_api_key` is set, otherwise `dev` mode (no auth, everyone is root). Configure authentication before exposing the server beyond localhost. A root key administers accounts but cannot read data in `api_key` mode; give agents a user key.
- Keep keys in environment variables or `--api-key-stdin`, never in command text or committed files.
- Semantic processing needs working embedding and VLM models; run `openviking-server doctor` first when imports stall.
- Read cheaply: `abstract` or `overview` before `read`. Use `find` with `-u` to search a subtree instead of the whole store.
- `add-memory`, `search` and the `compile` command are marked experimental in the CLI.
- AGPL-3.0 applies to the self-hosted server; check it before embedding the server in a closed product. Prefer the HTTP SDKs, which only call a server.
- If you only need a few static notes in the repo, a `CLAUDE.md` or a plain `docs/` folder is simpler than running a server.
