---
name: langtrace
description: >-
   You are an expert in Langtrace, the open-source observability platform for
  LLM applications built on OpenTelemetry. You help developers trace LLM
  calls, RAG pipelines, agent tool use, and chain executions with automatic
  instrumentation for OpenAI, Anthropic, LangChain, LlamaIndex, and 20+
  providers — providing cost tracking, latency analysis, token usage, and
  quality evaluation in a self-hostable dashboard.
category: AI & Machine Learning
tags: [observability, tracing, llm, opentelemetry, monitoring, evaluation]
version: 1.0.0
author: terminal-skills
---

# Langtrace — Open-Source LLM Observability

You are an expert in Langtrace, the open-source observability platform for LLM applications built on OpenTelemetry. You help developers trace LLM calls, RAG pipelines, agent tool use, and chain executions with automatic instrumentation for OpenAI, Anthropic, LangChain, LlamaIndex, and 20+ providers — providing cost tracking, latency analysis, token usage, and quality evaluation in a self-hostable dashboard.

## Core Capabilities

### Auto-Instrumentation

```typescript
// Automatic tracing — one line setup
import * as Langtrace from "@langtrase/typescript-sdk";

Langtrace.init({
  api_key: process.env.LANGTRACE_API_KEY,
  batch: true,                            // Batch spans for performance
  instrumentations: {
    openai: true,
    anthropic: true,
    langchain: true,
    pinecone: true,
    chromadb: true,
  },
});

// Now all LLM calls are automatically traced
import OpenAI from "openai";
const openai = new OpenAI();

// This call is automatically instrumented — no code changes needed
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Explain quantum computing" }],
});
// Langtrace captures: model, tokens, latency, cost, input, output
```

### Python with Decorators

```python
from langtrace_python_sdk import langtrace, with_langtrace_root_span
from langtrace_python_sdk.utils.with_root_span import with_additional_attributes

langtrace.init(api_key="your-api-key")

@with_langtrace_root_span("rag-pipeline")
async def answer_question(query: str) -> str:
    """Full RAG pipeline — every step traced automatically."""

    # Step 1: Embed query (traced)
    embedding = await openai.embeddings.create(
        model="text-embedding-3-small", input=query,
    )

    # Step 2: Vector search (traced if Pinecone/Chroma instrumented)
    results = index.query(vector=embedding.data[0].embedding, top_k=5)

    # Step 3: Generate answer (traced)
    context = "\n".join([r.metadata["text"] for r in results.matches])
    response = await openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Answer using this context:\n{context}"},
            {"role": "user", "content": query},
        ],
    )

    return response.choices[0].message.content

# Custom attributes for filtering
@with_additional_attributes({"user.tier": "pro", "feature": "search"})
@with_langtrace_root_span("search")
async def pro_search(query: str):
    return await answer_question(query)
```

### Evaluation

```python
from langtrace_python_sdk import langtrace
from langtrace_python_sdk.utils.with_root_span import with_langtrace_root_span

# Run evaluations and track scores
@with_langtrace_root_span("evaluate-rag")
async def evaluate_rag(test_set: list[dict]):
    results = []
    for test in test_set:
        answer = await answer_question(test["query"])

        # Score with LLM-as-judge
        eval_response = await openai.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": f"""Score this answer 1-5 for relevance and accuracy.
                Question: {test['query']}
                Expected: {test['expected']}
                Got: {answer}
                Return JSON: {{"relevance": N, "accuracy": N}}""",
            }],
        )
        scores = json.loads(eval_response.choices[0].message.content)
        results.append({**scores, "query": test["query"]})

    # All evaluation traces visible in Langtrace dashboard
    avg_relevance = sum(r["relevance"] for r in results) / len(results)
    avg_accuracy = sum(r["accuracy"] for r in results) / len(results)
    return {"avg_relevance": avg_relevance, "avg_accuracy": avg_accuracy}
```

## Installation

```bash
# TypeScript
npm install @langtrase/typescript-sdk

# Python
pip install langtrace-python-sdk

# Self-hosted
docker run -p 3000:3000 langtrace/langtrace-client
```

## Best Practices

1. **One-line setup** — `langtrace.init()` auto-instruments all supported libraries; no per-call changes
2. **OpenTelemetry native** — Exports standard OTLP traces; send to Jaeger, Grafana, Datadog alongside Langtrace
3. **Cost tracking** — Automatic cost calculation per model per call; aggregate by user, feature, or pipeline
4. **Root spans** — Use `@with_langtrace_root_span` to group related calls into a single trace (RAG pipeline, agent run)
5. **Custom attributes** — Add user ID, feature flags, A/B test groups; filter and compare in dashboard
6. **Self-hosted** — Deploy your own instance for data privacy; no vendor lock-in
7. **Evaluation tracking** — Log evaluation scores alongside traces; track quality regressions over time
8. **Batch mode** — Enable `batch: true` for production; reduces overhead by batching span exports
