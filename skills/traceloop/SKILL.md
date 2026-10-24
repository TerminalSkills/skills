---
name: traceloop
description: >-
  Traceloop's OpenLLMetry SDK adds OpenTelemetry tracing to LLM applications:
  it auto-instruments OpenAI, Anthropic, LangChain, LlamaIndex and vector
  databases, and exports spans to any OTLP backend (Grafana Tempo, Datadog,
  Honeycomb, Jaeger, Traceloop Cloud). Use when someone asks to "trace LLM
  calls", "add observability to my AI app", "OpenLLMetry", "Traceloop", "monitor
  token usage and latency", or "send LLM traces to Grafana/Honeycomb/Datadog".
license: Apache-2.0
compatibility: "Python 3.10+ (traceloop-sdk) or Node.js 18+ (@traceloop/node-server-sdk). Any OTLP/HTTP backend or a Traceloop account."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/traceloop/openllmetry
  tags:
    - observability
    - opentelemetry
    - llm
    - tracing
    - openllmetry
---

# Traceloop (OpenLLMetry)

## Overview

OpenLLMetry is a set of OpenTelemetry instrumentations for LLM providers, vector databases and agent frameworks, plus the Traceloop SDK that wires them up in one call. Output is standard OTLP, so it goes to whatever you already run, or to Traceloop Cloud. Python package `traceloop-sdk` (0.62.x at the time of writing, Apache-2.0) and JavaScript package `@traceloop/node-server-sdk` (0.27.x).

By default prompts and completions are recorded on spans as `gen_ai.input.messages` / `gen_ai.output.messages` (OpenTelemetry GenAI semantic conventions), together with model, token counts and latency.

## Instructions

### Install

```bash
pip install traceloop-sdk httpx
npm install @traceloop/node-server-sdk
```

`httpx` is listed here on purpose: in a clean virtualenv with traceloop-sdk 0.62.4, `from traceloop.sdk import Traceloop` failed with `ModuleNotFoundError: No module named 'httpx'` until it was installed by hand.

### Initialize (Python)

Call `Traceloop.init()` once, before creating provider clients.

```python
from traceloop.sdk import Traceloop

Traceloop.init(app_name="support-bot", disable_batch=False)
```

Configuration normally comes from environment variables, which keeps keys out of code:

| Variable | Meaning |
|---|---|
| `TRACELOOP_API_KEY` | Traceloop Cloud key (needed only for the default endpoint `https://api.traceloop.com`) |
| `TRACELOOP_BASE_URL` | OTLP/HTTP base URL of any other backend; the SDK appends the signal path itself |
| `TRACELOOP_HEADERS` | Auth headers as `key1=value1,key2=value2` |
| `TRACELOOP_TRACE_CONTENT` | `false` stops recording prompts, completions and embeddings |
| `TRACELOOP_TRACING_ENABLED` | `false` disables tracing |

With neither an API key, an exporter, a processor nor a custom base URL, `init()` prints a missing-key error and returns without tracing.

### Initialize (Node.js)

```typescript
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "support-bot",
  disableBatch: process.env.NODE_ENV !== "production",
});
```

Import the SDK before any LLM library. The option for a custom backend is `baseUrl` (not `apiEndpoint`), with `headers` for authentication. Under Next.js or bundlers, auto-instrumentation needs `instrumentModules`; see the Next.js guide in the Traceloop docs.

### Structure traces with decorators (Python)

`@workflow`, `@task`, `@agent` and `@tool` work on sync and async functions alike. The `@aworkflow`, `@atask`, `@aagent`, `@atool` variants are deprecated.

```python
from traceloop.sdk import Traceloop
from traceloop.sdk.decorators import workflow, task, agent, tool

@task(name="classify-intent")
async def classify_intent(message: str) -> str:
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"Classify the intent: {message}"}],
    )
    return response.choices[0].message.content

@workflow(name="support-pipeline")
async def handle_ticket(ticket: dict):
    Traceloop.set_association_properties({"user_id": ticket["user_id"], "session_id": ticket["session_id"]})
    return await classify_intent(ticket["message"])
```

Spans are named `<name>.workflow`, `<name>.task` and so on, and carry `traceloop.span.kind`. Association properties attach to every span in the current trace and let you filter by user or session in the backend. `@conversation(conversation_id=...)` sets a conversation ID on all spans inside a function.

### Structure traces (Node.js)

`withWorkflow`, `withTask`, `withAgent` and `withTool` call the function immediately and return a promise; they are not wrappers you store for later:

```typescript
const answer = await traceloop.withWorkflow({ name: "rag-query" }, async (query: string) => {
  const docs = await traceloop.withTask({ name: "retrieve" }, retrieveDocs, query);
  return traceloop.withTask({ name: "generate" }, generateAnswer, query, docs);
}, "How do I reset my password?");
```

`withAssociationProperties({ user_id: "u-1842" }, fn)` tags the spans created inside `fn`.

### Export to a backend

Set the environment before starting the process. The SDK sends OTLP over HTTP.

```bash
# Honeycomb
export TRACELOOP_BASE_URL=https://api.honeycomb.io
export TRACELOOP_HEADERS="x-honeycomb-team=$HONEYCOMB_API_KEY"

# Datadog: send to a Datadog Agent with the OTLP HTTP receiver enabled (port 4318)
export TRACELOOP_BASE_URL=http://datadog-agent.monitoring:4318

# Any OpenTelemetry Collector (Tempo, Jaeger, Grafana Cloud sit behind it)
export TRACELOOP_BASE_URL=http://otel-collector.monitoring:4318
```

Datadog is reached through an Agent or Collector, not by posting directly to a Datadog intake URL. For Grafana Cloud follow the "Grafana" integration page: it needs the Tempo URL, stack ID and token.

To use your own exporter or processor, pass `exporter=` or `processor=` (not both) to `Traceloop.init()`.

## Examples

### Example 1: Trace a RAG pipeline locally

**User prompt:** "Add tracing to my FastAPI support bot so I can see token usage per request, and print the spans while I develop."

```python
from opentelemetry.sdk.trace.export import ConsoleSpanExporter
from traceloop.sdk import Traceloop

Traceloop.init(app_name="support-bot", exporter=ConsoleSpanExporter(), disable_batch=True)
```

Decorate the request handler with `@workflow(name="support-pipeline")` and each step with `@task`. Each request prints a `support-pipeline.workflow` span, a `classify-intent.task` child, and the provider spans (for example `openai.chat`) with the model, `gen_ai.usage.*` token counts and duration. The decorator and association calls were run against traceloop-sdk 0.62.4 with the console exporter and produced exactly these spans with `traceloop.association.properties.user_id` set.

### Example 2: Send traces to Honeycomb without storing prompts

**User prompt:** "Send our LLM traces to Honeycomb but don't store customer text."

```bash
export TRACELOOP_BASE_URL=https://api.honeycomb.io
export TRACELOOP_HEADERS="x-honeycomb-team=$HONEYCOMB_API_KEY"
export TRACELOOP_TRACE_CONTENT=false
python serve.py
```

Spans arrive in Honeycomb with latency, model and token counts, but no prompt or completion text. Group by `traceloop.association.properties.user_id` to see usage per customer.

## Guidelines

- Initialize before importing or creating any provider client, in both languages.
- Use `disable_batch=True` (`disableBatch: true`) only for local debugging. Batching is right for production; flush before short-lived scripts exit.
- Prompts and completions contain user data. Set `TRACELOOP_TRACE_CONTENT=false` when that is not acceptable, and keep API keys in environment variables.
- The SDK sends anonymous usage telemetry about itself by default; pass `telemetry_enabled=False` in Python to switch it off.
- `use_legacy_attributes` is a deprecated alias for `use_attributes` in `Traceloop.init()`; do not pass both.
- Do not use Traceloop when you only need metrics, or when a single provider's own tracing is enough.
