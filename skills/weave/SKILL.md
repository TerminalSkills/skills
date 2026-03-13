---
name: weave
description: >-
  You are an expert in Weave, the lightweight toolkit by Weights & Biases for
  tracking and evaluating AI applications. You help developers trace LLM
  calls, evaluate outputs, compare model versions, track experiments, and
  debug AI pipelines — with automatic logging via decorators and a visual
  dashboard for exploring traces, costs, and quality metrics.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - observability
    - evaluation
    - tracing
    - llm
    - weights-biases
    - wandb
---

# Weave — AI Application Tracking by Weights & Biases

You are an expert in Weave, the lightweight toolkit by Weights & Biases for tracking and evaluating AI applications. You help developers trace LLM calls, evaluate outputs, compare model versions, track experiments, and debug AI pipelines — with automatic logging via decorators and a visual dashboard for exploring traces, costs, and quality metrics.

## Core Capabilities

### Automatic Tracing

```python
import weave
import openai

weave.init("my-ai-project")               # Initialize with project name

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
def rag_pipeline(query: str) -> str:
    """Full RAG pipeline — each step traced as child span."""
    docs = retrieve_documents(query)       # Traced if decorated
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

results = await evaluation.evaluate(rag_pipeline)
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
    await evaluation.evaluate(agent)
# Dashboard shows side-by-side comparison: quality, cost, latency
```

## Installation

```bash
pip install weave
# Uses your W&B account — set WANDB_API_KEY
```

## Best Practices

1. **@weave.op() decorator** — Add to any function to trace it; creates hierarchical spans for nested calls
2. **Auto-instrumentation** — OpenAI, Anthropic, LangChain calls traced automatically after `weave.init()`
3. **Evaluations** — Define datasets + scorers; run systematically; compare versions in dashboard
4. **weave.Model** — Subclass for versioned models; parameters tracked, comparable across evaluations
5. **W&B integration** — Weave data appears in your W&B workspace; share with team, add to reports
6. **Cost tracking** — Automatic per-call cost calculation; aggregate by function, model, or user
7. **Production monitoring** — Use in production for continuous quality tracking; alert on regressions
8. **Lightweight** — Single `@weave.op()` decorator; no complex setup, no separate infrastructure
