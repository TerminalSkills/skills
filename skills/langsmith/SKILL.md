---
name: langsmith
description: >-
  Monitor, trace, debug, and evaluate LLM applications with LangSmith. Use when
  a user asks to trace LLM calls, debug chain executions, evaluate AI output
  quality, set up LLM observability, monitor agent performance, run prompt
  experiments, compare model outputs, create evaluation datasets, track token
  usage and latency, or build LLM testing pipelines. Covers tracing, datasets,
  evaluators, annotation queues, prompt hub, and production monitoring.
license: Apache-2.0
compatibility: Python 3.9+ or Node.js 18+ (langsmith SDK)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - langsmith
    - llm-observability
    - tracing
    - evaluation
    - monitoring
---

# LangSmith

## Overview

LangSmith is the observability and evaluation platform for LLM applications. It traces every step of your chains and agents, helps you build evaluation datasets, run automated quality checks, and monitor production performance. Essential for moving LLM apps from prototype to production.

## Instructions

### Step 1: Setup and Configuration

Create a LangSmith account at [smith.langchain.com](https://smith.langchain.com) and get an API key.

```bash
pip install langsmith
```

Set environment variables:
```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY="lsv2_pt_..."
export LANGCHAIN_PROJECT="my-project"  # Optional, defaults to "default"
```

Once set, **all LangChain calls are automatically traced** — no code changes needed.

For non-LangChain code, use the SDK directly:
```python
from langsmith import Client
client = Client()
```

### Step 2: Tracing

#### Automatic Tracing (LangChain)
With `LANGCHAIN_TRACING_V2=true`, every `.invoke()`, `.stream()`, `.batch()` call is traced automatically. Each trace shows:
- Input/output at every step
- Token usage and cost
- Latency per component
- Error details with full stack traces

#### Manual Tracing with `@traceable`
For custom functions outside LangChain:
```python
from langsmith import traceable

@traceable(name="process_order", tags=["production"])
def process_order(order_id: str, items: list) -> dict:
    # Your business logic
    validated = validate_items(items)
    summary = generate_summary(validated)  # LLM call
    return {"order_id": order_id, "summary": summary, "status": "processed"}

@traceable
def validate_items(items: list) -> list:
    # Nested traces automatically link to parent
    return [item for item in items if item["quantity"] > 0]
```

#### Tracing with Context Manager
```python
from langsmith import trace

with trace("data-pipeline", inputs={"source": "csv"}) as run:
    data = load_data("input.csv")
    processed = transform(data)
    run.end(outputs={"rows": len(processed)})
```

#### Metadata and Tags
```python
# Add metadata to any LangChain call
result = chain.invoke(
    {"question": "..."},
    config={
        "metadata": {"user_id": "u-123", "environment": "staging"},
        "tags": ["beta-test", "gpt4"]
    }
)
```

### Step 3: Datasets and Examples

Datasets are collections of input/output pairs used for evaluation:

```python
from langsmith import Client

client = Client()

# Create a dataset
dataset = client.create_dataset("customer-support-qa", description="Real support questions with expected answers")

# Add examples
client.create_examples(
    inputs=[
        {"question": "How do I reset my password?"},
        {"question": "What's your refund policy?"},
    ],
    outputs=[
        {"answer": "Go to Settings > Security > Reset Password"},
        {"answer": "Full refund within 30 days, no questions asked"},
    ],
    dataset_id=dataset.id,
)
# Also create from existing traces: in the UI, select traces → "Add to Dataset"
```

### Step 4: Evaluation

Run your chain against a dataset and score the results:

```python
from langsmith import evaluate

# Your target function (chain, agent, or any callable)
def my_app(inputs: dict) -> dict:
    result = chain.invoke(inputs)
    return {"answer": result}

# Custom evaluator
def correctness(run, example) -> dict:
    """Check if the answer matches expected output."""
    predicted = run.outputs["answer"]
    expected = example.outputs["answer"]
    score = 1.0 if expected.lower() in predicted.lower() else 0.0
    return {"key": "correctness", "score": score}

def conciseness(run, example) -> dict:
    """Penalize overly long answers."""
    answer = run.outputs["answer"]
    word_count = len(answer.split())
    score = 1.0 if word_count < 100 else max(0, 1.0 - (word_count - 100) / 200)
    return {"key": "conciseness", "score": score}

# Run evaluation
results = evaluate(
    my_app,
    data="customer-support-qa",  # dataset name
    evaluators=[correctness, conciseness],
    experiment_prefix="gpt4o-v2",
    max_concurrency=4,
)

# Results visible in LangSmith UI with scores, comparisons, and drill-down
```

For LLM-as-judge evaluators, create a function that calls an LLM to rate quality on a 0-1 scale. Use `temperature=0` for consistency. For pairwise comparisons, use `evaluate_comparative` to compare two experiment runs side by side.

### Step 5: Prompt Hub and Annotation Queues

Use `hub.pull("rlm/rag-prompt")` to fetch shared prompts and `hub.push("my-org/support-prompt", my_prompt)` to version your own. Annotation queues let you set up human review workflows — create a queue with `client.create_annotation_queue()`, then filter traces in the UI and send low-scoring ones for review.

### Step 7: Production Monitoring

```python
# Filter and analyze traces
runs = client.list_runs(
    project_name="production",
    filter='and(eq(status, "error"), gt(latency, 5))',
    limit=50,
)

for run in runs:
    print(f"Run {run.id}: {run.error} | Latency: {run.total_time}s | Tokens: {run.total_tokens}")
```

In the LangSmith dashboard, set up automation rules to auto-flag slow runs, send low-score responses to annotation queues, and alert on error rate spikes.

### Step 8: Testing in CI/CD

Run evaluations in CI and assert minimum quality scores:

```python
def test_qa_quality():
    results = evaluate(my_app, data="regression-test-set", evaluators=[correctness])
    avg_score = sum(r["evaluation_results"]["results"][0].score for r in results) / len(results)
    assert avg_score >= 0.85, f"Quality dropped to {avg_score:.2f}"
```

## Examples

### Example 1: Add tracing and evaluation to an existing RAG chatbot
**User prompt:** "I have a LangChain RAG chatbot answering questions about our HR policies. Add LangSmith tracing and create an evaluation pipeline that checks if answers are correct and concise."

The agent will set the `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` environment variables so all chain invocations are automatically traced. It will then create a LangSmith dataset called `hr-policy-qa` with 10-15 real question/answer pairs drawn from common employee queries. Next, it will write two evaluators — a `correctness` evaluator that checks whether the expected answer appears in the predicted output, and a `conciseness` evaluator that penalizes answers over 100 words. Finally, it will wire up `evaluate()` to run the chatbot against the dataset with both evaluators and print a summary of scores.

### Example 2: Monitor production agent and alert on regressions
**User prompt:** "Our customer support agent is in production. Set up LangSmith monitoring to track error rates and latency, and add a CI test that fails if answer quality drops below 90%."

The agent will configure the production project in LangSmith with metadata tags for `environment: production` and `service: support-agent`. It will write a monitoring script using `client.list_runs()` with filters for error status and high latency (over 5 seconds), outputting a summary of total tokens, average latency, and error count. Then it will create a `regression-test-set` dataset from recent production traces and write a pytest test that runs `evaluate()` against it, asserting the average correctness score stays at or above 0.90.

## Guidelines

1. **Always enable tracing in dev** — set `LANGCHAIN_TRACING_V2=true` from day one
2. **Use projects to organize** — separate dev, staging, production traces
3. **Build datasets from production** — real data makes the best test sets
4. **Start with simple evaluators** — exact match and contains before LLM judges
5. **Run evals on every PR** — catch regressions before they ship
6. **Use annotation queues** — human review builds trust and better datasets
7. **Tag everything** — metadata makes filtering and analysis possible
8. **Monitor cost** — track token usage per user/feature to control spend
9. **Compare experiments** — A/B test prompts and models systematically
10. **Version prompts in Hub** — never lose a prompt that worked well

## Common Pitfalls

- **Forgetting to set env vars**: No tracing without `LANGCHAIN_TRACING_V2=true`
- **Huge traces**: Logging full documents in metadata slows the UI — summarize or truncate
- **Evaluator flakiness**: LLM judges are non-deterministic — use temperature=0 and run multiple times
- **Not separating projects**: Dev traces mixed with production makes analysis impossible
- **Ignoring latency data**: Tracing overhead is minimal (<5ms) — the latency insights are worth it
