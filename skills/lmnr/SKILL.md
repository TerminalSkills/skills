---
name: lmnr
description: >-
  Laminar (package name lmnr) is an open-source observability platform for AI agents: it records every LLM call, tool call and sub-step of an agent run as an OpenTelemetry trace, and runs evaluations over datasets. Use when asked to "trace my agent", "add Laminar", "install lmnr", "see why the agent failed in production", "self-host Laminar", "run evals in CI" or to wire tracing into OpenAI, Anthropic, LangChain or the Vercel AI SDK code with the Python or TypeScript SDK.
license: Apache-2.0
compatibility: "Python 3.11+ (lmnr) or Node.js 22.12+ (@lmnr-ai/lmnr); Docker Compose for self-hosting"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "observability, tracing, llm-evals, opentelemetry, agents"
  repository: https://github.com/lmnr-ai/lmnr
---

# Laminar (lmnr) — trace and evaluate AI agents

## Overview

Laminar is an open-source (Apache-2.0) platform written mostly in Rust. Its SDKs add OpenTelemetry tracing to your agent code: one initialization call instruments installed LLM libraries automatically, and `observe` wraps your own functions as spans. The platform stores traces, shows each run as a readable transcript, supports full-text search and SQL queries over spans, dashboards, datasets, and evaluations that run locally or in CI. You can use the hosted service at laminar.sh or self-host the stack with Docker Compose.

The project is called Laminar; the install names (`lmnr` on PyPI, `@lmnr-ai/lmnr` on npm, the `lmnr` CLI, the `LMNR_*` variables and the repository `lmnr-ai/lmnr`) all use `lmnr`, which is why this skill carries that name. This skill covers SDK version 0.8.x for Python and 0.8.x for TypeScript. For tools that overlap, see `langfuse`, `langsmith`, `helicone`, `phoenix` and `traceloop` in this catalog: choose Laminar when you want agent-run transcripts, a SQL interface for the coding agent itself, and an Apache-2.0 self-host option.

## Instructions

### Install the SDK

```bash
pip install lmnr            # Python 3.11+
npm install @lmnr-ai/lmnr   # Node.js 22.12+
```

Extras such as `lmnr[all]` pull in instrumentation for optional libraries (vector stores, LlamaIndex, and others). Plain `lmnr` is enough for the common LLM clients you already have installed.

The project API key comes from the dashboard: create a project, open project settings, generate a key. Put it in the environment, never in code:

```bash
export LMNR_PROJECT_API_KEY="$(cat ~/.config/laminar/support-bot.key)"
```

The SDK reads `LMNR_PROJECT_API_KEY` when no key is passed to `initialize`.

### Trace a Python agent

`Laminar.initialize()` instruments the LLM libraries installed in the environment (OpenAI, Anthropic, Google GenAI, LiteLLM, LangChain, LangGraph, OpenAI Agents, Pydantic AI, Playwright, Browser Use, MCP and others in the `Instruments` enum). Call it once, before the clients are used.

```python
from lmnr import Laminar, observe
from openai import OpenAI

Laminar.initialize()
client = OpenAI()


@observe(name="answer_ticket", session_id="ticket-48213", user_id="cust-7731", tags=["support"])
def answer_ticket(question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": question}],
    )
    return response.choices[0].message.content


print(answer_ticket("I was charged twice this month."))
```

`observe` creates a root span with the function arguments as input and the return value as output; nested observed functions become child spans and the OpenAI call appears below as an LLM span. Useful `observe` arguments (checked against the installed signature): `name`, `session_id`, `user_id`, `span_type` (`DEFAULT`, `LLM`, `TOOL`, `EVALUATION`), `ignore_input`, `ignore_output`, `ignore_inputs` (a list of argument names), `metadata`, `tags`. Setting `LMNR_DISABLE_TRACING=true` in the environment turns tracing off without removing the decorators.

Other useful calls on `Laminar`: `set_trace_session_id`, `set_trace_user_id`, `set_trace_metadata`, `set_span_tags`, `event`, `start_as_current_span` (trace part of a function), `flush` and `shutdown`. Short scripts and serverless handlers must call `Laminar.flush()` before exit so buffered spans are sent.

### Trace a TypeScript agent

```typescript
import { Laminar, observe } from '@lmnr-ai/lmnr';
import OpenAI from 'openai';

Laminar.initialize({
  instrumentModules: { OpenAI },
});

const openai = new OpenAI();

export const answerTicket = (question: string) =>
  observe({ name: 'answerTicket', sessionId: 'ticket-48213' }, async () => {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: question }],
    });
    return response.choices[0].message.content;
  });
```

In TypeScript you pass the imported library modules to `instrumentModules`, because ESM imports cannot be patched globally. Next.js needs extra setup (`instrumentation.ts` and `serverExternalPackages`), described on the Vercel AI SDK page of the Laminar docs.

### Evaluations

An evaluation has data (list of datapoints with `data` and `target`), an executor that runs your agent on `data`, and evaluators that score the executor output against `target`. `evaluate` initializes Laminar itself.

```python
from lmnr import evaluate


def classify_ticket(data: dict) -> str:
    return "billing" if "charged" in data["text"].lower() else "technical"


def exact_match(output: str, target: str) -> int:
    return 1 if output == target else 0


evaluate(
    data=[
        {"data": {"text": "I was charged twice"}, "target": "billing"},
        {"data": {"text": "The app crashes on login"}, "target": "technical"},
    ],
    executor=classify_ticket,
    evaluators={"exact_match": exact_match},
    name="ticket-router v3",
    group_name="ticket-router",
)
```

Run it as a script (`python evals/ticket_router_eval.py`) or through the CLI, which finds `eval_*.py` / `*_eval.py` files in an `evals/` directory:

```bash
lmnr eval                                   # every eval file under evals/
lmnr eval evals/ticket_router_eval.py --continue-on-error --output-file results.json
```

In TypeScript, `npx lmnr eval` runs `*.eval.ts` or `*.eval.js` under `evals/`. Keep `group_name` stable across prompt and model changes so runs can be compared in the UI. An evaluator may return a dict of numbers to report several scores; `evaluate` also accepts `concurrency_limit` and `trials`.

### Self-host with Docker Compose

```bash
git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d
```

This starts the lightweight stack: PostgreSQL, ClickHouse, Quickwit, the frontend (dashboard at port 5667) and the app server (HTTP 8000, gRPC 8001, realtime 8002). The repository's compose file publishes ports on all interfaces, so on a shared machine bind them to localhost with an override file saved next to it as `compose.override.yml` (the `!override` tag needs a current Docker Compose v2):

```yaml
services:
  postgres:
    ports: !override
      - "127.0.0.1:5433:5432"
  quickwit:
    ports: !override
      - "127.0.0.1:7280:7280"
      - "127.0.0.1:7281:7281"
  frontend:
    ports: !override
      - "127.0.0.1:5667:5667"
  app-server:
    ports: !override
      - "127.0.0.1:8000:8000"
      - "127.0.0.1:8001:8001"
      - "127.0.0.1:8002:8002"
```

`docker compose config` should then show `host_ip: 127.0.0.1` on every port. Open `http://localhost:5667`, create a project, copy its API key, and point the SDK at the local server. `base_url` is scheme and host only; ports are separate arguments:

```python
Laminar.initialize(base_url="http://localhost", http_port=8000, grpc_port=8001)
```

TypeScript uses `baseUrl`, `httpPort`, `grpcPort`. For `lmnr eval` against a self-hosted instance, pass the same options to `evaluate`. `docker-compose-full.yml` adds RabbitMQ for queued span processing; Kubernetes deployments use the Helm chart from the docs.

Chat-with-trace and SQL-with-AI need an LLM provider; set `LLM_PROVIDER` (`gemini`, `openai`, `bedrock`, and the Azure variants listed in the README) and `LLM_API_KEY` in the `.env` file at the repository root. Upgrading an existing ClickHouse container is `docker compose up -d --force-recreate clickhouse`.

## Examples

### Example 1: see why a support agent loops in production

Request: "Our refund agent sometimes calls the same tool five times. Add tracing so I can see the runs."

```bash
pip install lmnr
export LMNR_PROJECT_API_KEY="$(cat ~/.config/laminar/refund-agent.key)"
```

```python
from lmnr import Laminar, observe

Laminar.initialize()


@observe(name="refund_agent", span_type="DEFAULT", metadata={"env": "production"})
def run_refund_agent(ticket_id: str) -> str:
    ...
```

The agent adds `Laminar.initialize()` at process start and wraps the entry function. After a few runs each ticket appears as a trace in the dashboard with the LLM calls and tool calls nested under `refund_agent`; filtering by tag or searching span text for the tool name shows which runs repeated it, and the transcript view shows the prompt that triggered the loop.

### Example 2: self-host for a team that cannot send prompts to a cloud service

Request: "Run Laminar on the build server, reachable only from the box itself, and trace our staging agent into it."

The agent clones the repository, saves the override file above as `compose.override.yml`, runs `docker compose up -d`, checks `docker compose ps`, and opens an SSH tunnel for the dashboard (`ssh -L 5667:127.0.0.1:5667 build-server`). After creating a project in the dashboard and storing the key in the environment, the staging service starts with `Laminar.initialize(base_url="http://127.0.0.1", http_port=8000, grpc_port=8001)`. Traces then stay on that machine.

## Guidelines

- Call `Laminar.initialize()` before creating LLM clients, and `flush()` before short-lived processes exit, or the last spans are lost.
- Traces contain prompts and completions. Use `ignore_input`, `ignore_output` or `ignore_inputs` on `observe` for secrets and personal data, and keep the project key in an environment variable or secret manager.
- A self-hosted instance lets any user sign in by default; restrict access (GitHub OAuth plus an `allowed-emails.json`, as described in the self-hosting docs) before exposing it beyond localhost.
- Signals (plain-English failure detection) and the Slack integration are not part of the open-source Docker Compose deployment; the Laminar docs list them under the Helm chart with an enterprise license key or the hosted service. Do not promise them for the compose stack.
- The repository ships a committed `.env` with public default passwords and keys (`POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `SHARED_SECRET_TOKEN`, `AEAD_SECRET_KEY`), and `docker-compose.yml` hardcodes `NEXTAUTH_SECRET: some_secret`. Replace them with your own values before the first `docker compose up`, because the databases keep the first password they were created with.
- The compose file pulls unpinned `ghcr.io/lmnr-ai/frontend` and `app-server` images; pin tags for anything long-lived.
- Not the right tool for plain infrastructure tracing across microservices (use an OpenTelemetry collector and a general backend) or when you only need prompt versioning.
