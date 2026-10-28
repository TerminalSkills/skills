---
name: hindsight
description: >-
  Hindsight is a self-hosted agent memory server: an agent stores facts with retain, searches them with recall, and asks for reasoned answers over them with reflect, per isolated memory bank. Use when an agent or chatbot must remember users and projects across sessions, or when asked to "set up Hindsight", "retain and recall memories", "add per-user memory banks", "run a memory server for my agent", or "connect an MCP client to Hindsight memory".
license: Apache-2.0
compatibility: "Python 3.10+ for the client (3.11+ for the server package), Docker 24+ for the container route, and an LLM provider API key for the server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "agent-memory, hindsight, llm-agents, retain-recall, mcp"
  repository: https://github.com/vectorize-io/hindsight
---

# Hindsight — Memory Server for Agents That Learn

## Overview

Hindsight is a memory service for AI agents. You run a server (Docker, pip, or Helm), and agents talk to it through a Python, Node.js or Go client, a REST API, or a built-in MCP endpoint. Everything lives in **banks**: strictly isolated stores, typically one per user, agent or project.

Three operations do the work:

- **retain** pushes text in. The server uses its configured LLM to extract facts, entities, relationships and dates.
- **recall** searches a bank with semantic, keyword (BM25), graph and temporal strategies in parallel, merges and reranks, and trims to a token budget.
- **reflect** answers a question by reasoning over the bank, not just returning matches. Facts are consolidated in the background into observations and mental models.

The server needs an LLM key for extraction and reflection, and PostgreSQL with a vector extension (the Docker image and the pip package embed one for development). The README includes benchmark claims; this skill does not rely on them.

Choose Hindsight when you want a standalone memory service shared by several agents or users. For a simple file-based memory inside one project, the `agent-memory` skill is lighter.

## Instructions

### Run the server in Docker

```bash
export OPENAI_API_KEY="$(cat ~/.secrets/openai-key)"   # create at platform.openai.com/api-keys
docker run -d --name hindsight --restart unless-stopped \
  -p 127.0.0.1:8888:8888 -p 127.0.0.1:9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY" \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

The API listens on `http://127.0.0.1:8888` and the web UI on `http://127.0.0.1:9999`. The README's example omits the `127.0.0.1` prefix, which would publish both ports on every network interface; keep it unless you have put authentication in front.

Other providers use `HINDSIGHT_API_LLM_PROVIDER` (for example `openai`, `anthropic`, `gemini`, `groq`, `ollama`), with `HINDSIGHT_API_LLM_MODEL` and `HINDSIGHT_API_LLM_BASE_URL` for a custom endpoint. Pass them as extra `-e` flags.

Check the container is up:

```bash
docker logs --tail 20 hindsight
```

### Run the server with pip instead

```bash
python3 -m venv .venv
.venv/bin/pip install hindsight-api
export HINDSIGHT_API_LLM_PROVIDER=openai
export HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY"
.venv/bin/hindsight-api --host 127.0.0.1 --port 8888
```

`hindsight-api` accepts `--host`, `--port` (default 8888) and `--workers`. Use `hindsight-api-slim` when you supply your own embeddings, reranker and database (needed on Intel Macs).

For a throwaway in-process server in a script, `pip install hindsight-all` provides `HindsightServer` and `HindsightClient` (`from hindsight import HindsightServer, HindsightClient`); the server is a context manager and `server.url` gives its address.

### Install the client

```bash
.venv/bin/pip install -U hindsight-client
```

Node.js: `npm install @vectorize-io/hindsight-client`, then `new HindsightClient({ baseUrl })` with `client.retain(bankId, content)` and `client.recall(bankId, query)`.

### Retain, recall, reflect from Python

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://127.0.0.1:8888")

client.retain(
    bank_id="user-4812",
    content="Marta moved the Lisbon offsite to 14 March and wants vegetarian catering.",
    context="planning chat",
    timestamp="2026-10-12T09:30:00Z",
    tags=["offsite", "catering"],
)

found = client.recall(bank_id="user-4812", query="What does Marta need for the offsite?")
for item in found.results:
    print(item.type, item.text)

answer = client.reflect(bank_id="user-4812", query="What should I keep in mind when booking for Marta?")
print(answer.text)
```

Verified signatures (hindsight-client 1.1.0):

- `retain(bank_id, content, timestamp=None, context=None, document_id=None, metadata=None, tags=None, retain_async=False, ...)`.
- `recall(bank_id, query, types=None, max_tokens=4096, budget="mid", tags=None, tags_match="any", ...)` returns an object whose `results` have `text`, `type`, `tags`, `context`, `occurred_start`.
- `reflect(bank_id, query, budget="low", context=None, max_tokens=None, tags=None, include_facts=False, ...)` returns an object with `text`; `based_on` is filled only when `include_facts=True`.
- `retain_batch(bank_id, items, document_id=None, retain_async=False)` takes a list of dicts, one per memory.
- Async variants carry an `a` prefix: `aretain`, `arecall`, `areflect`.

### Create a bank with a mission

Banks are created on first use, but you can set their purpose and behavior up front:

```python
client.create_bank(
    bank_id="support-agent",
    name="Support agent memory",
    mission="Remember customer environments, recurring failures and what fixed them.",
)
```

Other `create_bank` parameters include `disposition_skepticism`, `disposition_literalism`, `disposition_empathy`, `enable_observations` and `reflect_mission`.

### Tags for per-user filtering inside a bank

Retain with `tags=["user:marta"]`, then recall with `tags=["user:marta"], tags_match="any"`. `tags_match` accepts `any`, `all`, `any_strict`, `all_strict` and `exact`; the `_strict` forms exclude untagged memories.

### Automatic memory with the LLM wrapper

```bash
.venv/bin/pip install hindsight-litellm
```

```python
from openai import OpenAI
from hindsight_litellm import wrap_openai

client = wrap_openai(
    OpenAI(),
    bank_id="user-4812",
    hindsight_api_url="http://127.0.0.1:8888",
)
reply = client.chat.completions.create(
    model="gpt-5-mini",
    messages=[{"role": "user", "content": "What do you know about my offsite?"}],
)
```

Relevant memories are recalled before each call and the conversation is retained afterwards. Without `hindsight_api_url` it targets Hindsight Cloud, which needs an account. `wrap_anthropic()` does the same for the Anthropic SDK. Use the explicit client instead when you need to control what is stored.

### MCP endpoint

Every server exposes one MCP endpoint per bank, enabled by default: `http://127.0.0.1:8888/mcp/user-4812/` (the last segment is the bank id). Point an MCP client at it to get retain, recall and reflect as tools.

### Memory for coding agents

The project ships an installer that wires per-repository memory into Claude Code, Codex CLI, Cursor CLI and others:

```bash
npx @vectorize-io/hindsight-coding-agents install claude-code
```

This modifies the agent's configuration, so run it only when the user asks for it.

## Examples

### Example 1: Give a support bot memory per customer

**Request:** "Set up Hindsight locally and make my support bot remember each customer's setup."

```bash
docker run -d --name hindsight -p 127.0.0.1:8888:8888 -p 127.0.0.1:9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY" \
  -v hindsight-data:/home/hindsight/.pg0 ghcr.io/vectorize-io/hindsight:latest
python3 -m venv .venv && .venv/bin/pip install -U hindsight-client
```

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://127.0.0.1:8888")
customer = "cust-20931"

client.retain(bank_id=customer, content="Runs Postgres 15 on RDS in eu-west-1; deploys through GitHub Actions.", context="onboarding call")
client.retain(bank_id=customer, content="Ticket 8841: nightly export failed because the IAM role lacked s3:PutObject. Fixed by adding it.", context="support ticket")

hits = client.recall(bank_id=customer, query="Why did the nightly export fail?")
print(hits.results[0].text)
```

**Result:** once extraction has finished, recall returns the extracted fact about the missing `s3:PutObject` permission; the support bot can paste it into its prompt. One bank per customer keeps data from leaking between them.

### Example 2: Reflect on a project before planning

**Request:** "Before I plan next sprint, what has our team learned about flaky tests?"

```python
client.retain_batch(
    bank_id="payments-team",
    items=[
        {"content": "Retro 2026-09-03: checkout e2e tests flake when the Stripe mock starts late.", "context": "retro"},
        {"content": "Retro 2026-09-24: added a readiness probe for the Stripe mock; flakes dropped from 12% to 2%.", "context": "retro"},
    ],
)
answer = client.reflect(
    bank_id="payments-team",
    query="What have we learned about flaky tests and what is still open?",
    include_facts=True,
)
print(answer.text)
```

**Result:** a short written answer that combines both retros (the cause, the fix and the remaining 2%), with `answer.based_on` listing the memories used (it is filled only because the call passes `include_facts=True`).

## Guidelines

- Retain runs fact extraction through the server's LLM, so it takes a moment and costs tokens; `retain_async=True` queues it instead. If a recall right after a retain misses, retry shortly.
- Retain distilled facts, decisions and outcomes with a `context` string, not raw logs. 
- One bank per user, agent or project. Banks do not leak into each other; use `tags` for finer slices inside one bank.
- Never publish ports 8888 or 9999 beyond localhost without authentication in front; the API has full read and write access to every bank.
- The server key (`HINDSIGHT_API_LLM_API_KEY`) belongs in an environment variable or secret store, never in code or a committed compose file.
- Memory Defense is off by default. Turn it on per bank for banks that ingest user content by setting the bank config field `memory_defense` to `{"enabled": true, "rules": [{"on": "sensitive_data", "action": "redact"}]}` (action `redact` replaces matches such as API keys with `[REDACTED:type]`; `block` drops the item). It applies only to later retains, not to memories already stored.
- Intel Macs need `hindsight-all-slim` or `hindsight-api-slim`.
- The Docker image uses a named volume for its embedded database; deleting the volume deletes the memories. Use external PostgreSQL for production.
- Hindsight Cloud is a hosted option that requires an account; this skill covers only self-hosted use.
- Do not use Hindsight for plain document question answering; it is built for memory that accumulates and consolidates over time.
