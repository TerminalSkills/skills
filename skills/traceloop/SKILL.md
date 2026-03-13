---
name: traceloop
description: >-
   You are an expert in Traceloop and its OpenLLMetry SDK, the open-source
  observability framework that extends OpenTelemetry for LLM applications. You
  help developers instrument AI pipelines with automatic tracing for OpenAI,
  Anthropic, Cohere, LangChain, LlamaIndex, vector databases, and frameworks —
  exporting to any OpenTelemetry-compatible backend (Grafana Tempo, Jaeger,
  Datadog, Honeycomb, Traceloop Cloud).
category: AI & Machine Learning
tags: [observability, opentelemetry, llm, tracing, openllmetry, monitoring]
version: 1.0.0
author: terminal-skills
---

# Traceloop (OpenLLMetry) — LLM Observability via OpenTelemetry

You are an expert in Traceloop and its OpenLLMetry SDK, the open-source observability framework that extends OpenTelemetry for LLM applications. You help developers instrument AI pipelines with automatic tracing for OpenAI, Anthropic, Cohere, LangChain, LlamaIndex, vector databases, and frameworks — exporting to any OpenTelemetry-compatible backend (Grafana Tempo, Jaeger, Datadog, Honeycomb, Traceloop Cloud).

## Core Capabilities

### Auto-Instrumentation

```python
# One line — instruments everything
from traceloop.sdk import Traceloop

Traceloop.init(
    app_name="my-ai-app",
    api_endpoint="https://api.traceloop.com",   # Or any OTLP endpoint
    api_key="your-key",
    disable_batch=False,                         # Batch for performance
)

# All OpenAI/Anthropic/LangChain calls now traced automatically
import openai
client = openai.OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
# Trace captured: model, tokens, latency, cost, prompt, completion
```

### Workflow and Task Decorators

```python
from traceloop.sdk.decorators import workflow, task, agent, tool

@workflow(name="customer-support-pipeline")
async def handle_support_ticket(ticket: dict):
    """Top-level workflow — groups all child spans."""
    intent = await classify_intent(ticket["message"])
    if intent == "technical":
        return await technical_support(ticket)
    return await general_support(ticket)

@task(name="classify-intent")
async def classify_intent(message: str) -> str:
    """Task span — individual step in workflow."""
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"Classify intent: {message}"}],
    )
    return response.choices[0].message.content

@agent(name="tech-support-agent")
async def technical_support(ticket: dict):
    """Agent span — autonomous agent with tool use."""
    docs = await search_knowledge_base(ticket["message"])
    response = await generate_response(ticket, docs)
    return response

@tool(name="knowledge-base-search")
async def search_knowledge_base(query: str):
    """Tool span — external tool invocation."""
    embedding = await client.embeddings.create(model="text-embedding-3-small", input=query)
    results = await pinecone_index.query(vector=embedding.data[0].embedding, top_k=5)
    return [r.metadata["text"] for r in results.matches]
```

### TypeScript

```typescript
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "my-ai-app",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: false,
});

import { withWorkflow, withTask } from "@traceloop/node-server-sdk";

const handleQuery = withWorkflow({ name: "rag-query" }, async (query: string) => {
  const docs = await withTask({ name: "retrieve" }, () => retrieveDocs(query));
  const answer = await withTask({ name: "generate" }, () => generateAnswer(query, docs));
  return answer;
});
```

### Export to Any Backend

```python
# Send to Grafana Tempo
Traceloop.init(
    app_name="my-app",
    api_endpoint="http://tempo:4318",     # OTLP HTTP endpoint
    headers={},                           # No auth for self-hosted
)

# Send to Datadog
Traceloop.init(
    app_name="my-app",
    api_endpoint="https://trace.agent.datadoghq.com",
    headers={"DD-API-KEY": "your-dd-key"},
)

# Send to Honeycomb
Traceloop.init(
    app_name="my-app",
    api_endpoint="https://api.honeycomb.io",
    headers={"x-honeycomb-team": "your-key"},
)
```

## Installation

```bash
# Python
pip install traceloop-sdk

# TypeScript
npm install @traceloop/node-server-sdk
```

## Best Practices

1. **Semantic conventions** — Use `@workflow`, `@task`, `@agent`, `@tool` decorators; creates meaningful trace hierarchy
2. **OpenTelemetry native** — Standard OTLP export; works with existing observability stack (Grafana, Datadog, etc.)
3. **Auto-instrumentation** — `Traceloop.init()` patches all supported libraries; no per-call code changes
4. **Association properties** — Set user ID, session ID, conversation ID for filtering and grouping traces
5. **Prompt management** — Track prompt versions; correlate prompt changes with quality metrics
6. **Cost tracking** — Automatic cost calculation per model; aggregate by workflow, user, or feature
7. **Vendor-agnostic** — Switch from Traceloop Cloud to self-hosted Jaeger/Tempo without code changes
8. **OpenLLMetry standard** — Extends OpenTelemetry semantic conventions for AI; community-driven spec
