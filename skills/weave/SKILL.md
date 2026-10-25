---
name: weave
description: >-
  Weave is Weights & Biases' toolkit for tracing and evaluating LLM applications and AI agents. Use when a user wants to trace OpenAI or Anthropic calls, log agent runs, score outputs with evaluations, compare prompt or model versions, or debug an AI pipeline from a dashboard.
license: Apache-2.0
compatibility: "Python 3.10+, a Weights & Biases account and WANDB_API_KEY"
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/wandb/weave
  category: data-ai
  tags: "observability, evaluation, tracing, llm, weights-biases"
---

# Weave — AI Application Tracking by Weights & Biases

## Overview

Weave traces LLM calls and functions, runs evaluations, and versions models and prompts, with a dashboard in your W&B account for traces, cost, latency and scores. Current releases (0.53.x, Python 3.10+) also trace whole agents: with the OpenAI Agents SDK, Claude Agent SDK or Google ADK, `weave.init()` alone is enough and runs appear on the **Agents** page. Plain `@weave.op` functions and auto-patched LLM clients appear on the **Traces** page; the two kinds of trace are shown separately.

## Instructions

Install and authenticate first (see Installation below), then initialise with `weave.init("<team>/<project>")`; a bare project name uses your default W&B entity. Use the sections below for tracing, evaluations and model versioning.

### Tracing agents

```bash
pip install weave openai-agents
```

```python
import weave
weave.init("acme-ml/support-agent")   # then run the agent as usual; traces land on the Agents page
```

For a custom agent loop use `weave.start_conversation(agent_name=...)`, `weave.start_turn(...)` and `weave.start_llm(...)` as context managers (the older `start_session` is deprecated).

### Automatic Tracing

```python
import json
import weave
import openai

weave.init("acme-ml/support-agent")      # team/project; created on first use

client = openai.OpenAI()

# OpenAI calls are automatically traced
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain transformers"}],
)
# Weave captures: model, tokens, latency, cost, input/output — viewable in dashboard

# Custom function tracing
@weave.op()
def extract_entities(text: str) -> list[str]:
    """Extract named entities from text."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"Extract entities from: {text}\nReturn JSON list."}],
    )
    return json.loads(response.choices[0].message.content)

@weave.op()
def retrieve_documents(query: str) -> list[str]:
    """Stand-in retriever; replace with your vector search."""
    return ["Python is a programming language created by Guido van Rossum."]

@weave.op()
def rag_pipeline(query: str) -> str:
    """Full RAG pipeline — each step traced as child span."""
    docs = retrieve_documents(query)       # traced as a child call because it is an op
    context = "\n".join(docs)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Answer using:\n{context}"},
            {"role": "user", "content": query},
        ],
    )
    return response.choices[0].message.content
```

### Evaluations

```python
# Define evaluation dataset
eval_dataset = [
    {"query": "What is Python?", "expected": "programming language"},
    {"query": "Who created Linux?", "expected": "Linus Torvalds"},
    {"query": "What is Docker?", "expected": "containerization platform"},
]

# Define scoring functions
@weave.op()
def relevance_scorer(output: str, expected: str) -> dict:
    """Score if output contains expected information."""
    contains = expected.lower() in output.lower()
    return {"relevance": 1.0 if contains else 0.0}

@weave.op()
def length_scorer(output: str) -> dict:
    """Score response length (prefer concise)."""
    words = len(output.split())
    return {"conciseness": min(1.0, 50 / max(words, 1))}

# Run evaluation
evaluation = weave.Evaluation(
    dataset=eval_dataset,
    scorers=[relevance_scorer, length_scorer],
)

import asyncio
results = asyncio.run(evaluation.evaluate(rag_pipeline))  # or await it inside async code
# Results visible in Weave dashboard with per-example scores
# Compare across model versions, prompts, parameters
```

### Model Versioning

```python
# Track model/prompt versions
class SupportAgent(weave.Model):
    model_name: str = "gpt-4o"
    system_prompt: str = "You are a helpful support agent."
    temperature: float = 0.7

    @weave.op()
    def predict(self, query: str) -> str:
        response = client.chat.completions.create(
            model=self.model_name,
            temperature=self.temperature,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": query},
            ],
        )
        return response.choices[0].message.content

# Version 1
agent_v1 = SupportAgent(system_prompt="Be concise and helpful.")

# Version 2 — compare in dashboard
agent_v2 = SupportAgent(model_name="gpt-4o-mini", system_prompt="Be detailed and empathetic.")

# Evaluate both versions
for agent in [agent_v1, agent_v2]:
    asyncio.run(evaluation.evaluate(agent))
# Dashboard shows side-by-side comparison: quality, cost, latency
```

## Installation

```bash
pip install weave
export WANDB_API_KEY=...   # key from https://wandb.ai/authorize, or run `wandb login`
```

## Examples

**Trace a RAG function.** User: "Log every call to my answer_question function with its OpenAI usage." Add `weave.init("acme-ml/support-agent")` at startup and `@weave.op()` on the function; each call shows inputs, output, token counts, latency and cost as a trace with child spans on the Traces page.

**Compare two prompts.** User: "Which of my two system prompts answers better?" Wrap each in a `weave.Model` subclass (`agent_v1`, `agent_v2` above), run the same `weave.Evaluation` on both, and open the Evaluations comparison view to see scores side by side.

## Guidelines

1. **@weave.op() decorator** — Add to any function to trace it; creates hierarchical spans for nested calls
2. **Auto-instrumentation** — OpenAI, Anthropic, LangChain calls traced automatically after `weave.init()`
3. **Evaluations** — Define datasets + scorers; run systematically; compare versions in dashboard
4. **weave.Model** — Subclass for versioned models; parameters tracked, comparable across evaluations
5. **W&B integration** — Weave data appears in your W&B workspace; share with team, add to reports
6. **Cost tracking** — Automatic per-call cost calculation; aggregate by function, model, or user
7. **Production monitoring** — Use in production for continuous quality tracking; alert on regressions
8. **Lightweight** — Single `@weave.op()` decorator; no complex setup, no separate infrastructure
