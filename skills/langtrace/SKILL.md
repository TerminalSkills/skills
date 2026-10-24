---
name: langtrace
description: >-
  Langtrace is an open-source, OpenTelemetry-based observability platform for
  LLM applications that records traces, token usage, cost and latency for LLM,
  vector database and framework calls. Use when the user wants to trace OpenAI
  or Anthropic calls, debug a RAG pipeline or agent, group calls into one
  trace, collect user feedback on responses, or self-host an LLM tracing
  dashboard.
license: Apache-2.0
compatibility: 'Node.js (TypeScript SDK) or Python 3.9+ (Python SDK); self-hosting needs Docker Compose'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/Scale3-Labs/langtrace
  tags:
    - observability
    - tracing
    - llm
    - opentelemetry
    - monitoring
---

# Langtrace — Open-Source LLM Observability

## Overview

Langtrace captures traces and metrics from applications that call LLM APIs, vector databases and LLM frameworks. Spans follow OpenTelemetry conventions, so they can also go to any OTLP backend. Two ways to run it: the hosted service at langtrace.ai (create a project, copy its API key) or your own deployment. The dashboard application is AGPL-3.0; the SDKs are Apache-2.0.

SDKs checked against the registries on 2026-10-24: `@langtrase/typescript-sdk` 6.3.7 and `langtrace-python-sdk` 3.8.21 (both last published July 2025; note the npm scope is spelled `langtrase`). Instrumented today (per the SDK READMEs): OpenAI, Anthropic, Azure OpenAI, Cohere, Gemini, Mistral, xAI, Perplexity, Ollama, Vertex AI, AWS Bedrock, LlamaIndex, Pinecone, ChromaDB, Qdrant, Weaviate and PGVector in both languages. Python only: LangChain, LangGraph, DSPy, CrewAI. TypeScript only: Vercel AI.

## Instructions

### TypeScript

```bash
npm install @langtrase/typescript-sdk
export LANGTRACE_API_KEY=lt_project_key_from_dashboard
```

Call `init` before importing any LLM library, otherwise those libraries are not patched:

```typescript
// tracing.ts — import this file first in your entry point
import * as Langtrace from "@langtrase/typescript-sdk";

Langtrace.init({ batch: true });   // api_key is read from LANGTRACE_API_KEY
```

```typescript
// app.ts
import "./tracing";
import OpenAI from "openai";

const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL!,
  messages: [{ role: "user", content: "Explain quantum computing" }],
});
// Langtrace records model, token counts, latency, cost, input and output
```

In Next.js and other bundled apps automatic patching does not work. Pass the imported module for each vendor: `Langtrace.init({ instrumentations: { openai: openai } })` where `openai` is `import * as openai from "openai"`. The values are module objects, not booleans.

Group related calls into one trace and add attributes you can filter on:

```typescript
await Langtrace.withAdditionalAttributes(
  () => Langtrace.withLangTraceRootSpan(async (spanId, traceId) => {
    return answerQuestion(query);
  }, "rag-pipeline"),
  { "user.tier": "pro", feature: "search" },
);
```

`sendUserFeedback({ userId, userScore, traceId, spanId })` attaches a user rating to a trace; the ids come from the root-span callback.

### Python

```bash
pip install langtrace-python-sdk
```

A clean install on Python 3.12 failed on import for two missing dependencies. If you see `No module named 'importlib_metadata'` or `No module named 'pkg_resources'`, run `pip install importlib-metadata "setuptools<81"`.

```python
import os
from langtrace_python_sdk import langtrace, with_langtrace_root_span, inject_additional_attributes

langtrace.init()   # reads LANGTRACE_API_KEY; must run before importing openai

from openai import AsyncOpenAI
client = AsyncOpenAI()

@with_langtrace_root_span("rag-pipeline")
async def answer_question(query: str) -> str:
    response = await client.chat.completions.create(
        model=os.environ["OPENAI_MODEL"],
        messages=[{"role": "user", "content": query}],
    )
    return response.choices[0].message.content

# attach custom attributes to everything called inside
result = await inject_additional_attributes(
    lambda: answer_question("What is our refund policy?"),
    {"user.tier": "pro", "feature": "support-bot"},
)
```

`with_additional_attributes` still exists but is deprecated in favour of `inject_additional_attributes(fn, attributes)`.

### Self-hosting

The dashboard is three services (Next.js app, Postgres, ClickHouse), so a single `docker run` is not enough. Clone the `Scale3-Labs/langtrace` repository, change the default secrets in its `.env` (`NEXTAUTH_SECRET`, the database and admin passwords ship with example values), sign in, create a project to get an API key, and run `docker compose up`; the UI listens on `http://localhost:3000`. `docker compose down -v` also deletes the data volumes. Point the SDK at it:

```typescript
Langtrace.init({ api_host: "http://localhost:3000/api/trace", api_key: process.env.LANGTRACE_API_KEY });
```

```python
langtrace.init(api_key=os.environ["LANGTRACE_API_KEY"], api_host="http://localhost:3000/api/trace")
```

To see spans without any backend, use `write_spans_to_console=True` (Python) or `write_spans_to_console: true` (TypeScript). Use `custom_remote_exporter` to send spans to your own OTLP exporter.

## Examples

### Example 1: Trace a support chatbot per user tier

Request: "I want to see cost and latency of our support bot split by free and pro users."

Wrap the handler in `withLangTraceRootSpan` and `withAdditionalAttributes` with `{ "user.tier": tier }` as shown above. Result: each request is one trace with the OpenAI span nested inside; in the dashboard filter by the `user.tier` attribute to compare token cost and latency between tiers.

### Example 2: Debug a slow RAG pipeline locally without an account

Request: "Where is the time going in my retrieval chain? I do not want to sign up for anything."

```python
langtrace.init(api_key="local-dev", write_spans_to_console=True, batch=False)
```

Result: every span (root span, embedding call, vector query, completion) prints as JSON on stdout with start and end times, so the slow step is visible from the timestamps. Switch to the self-hosted dashboard when you want charts.

## Guidelines

- Initialise Langtrace before importing the instrumented libraries, in every process (workers, serverless handlers included).
- Use `batch: true` in production to cut export overhead; use `batch=False` when debugging so spans appear immediately.
- Prompts and completions are stored in spans. Use `disable_tracing_attributes` (TypeScript) or self-host if they contain personal data.
- The SDKs have not been released since July 2025; check that your provider SDK version is still instrumented before relying on a new feature of it.
- Judge-style quality scoring is something you write yourself (call a model, record the score as a span attribute or user feedback); there is no built-in evaluator API in the SDKs to call.
