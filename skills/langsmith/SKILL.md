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
compatibility: Python 3.10+ or Node.js 18+ (langsmith SDK)
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/langchain-ai/langsmith-sdk
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
pip install -U langsmith     # JS/TS: npm install langsmith
```

Set environment variables (the `LANGSMITH_*` names are current; the older `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` names are legacy aliases):
```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="lsv2_pt_8f3a1c9d2b7e4a60"  # from Settings > API Keys
export LANGSMITH_PROJECT="support-bot-dev"           # optional, defaults to "default"
export LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"  # only for EU accounts
export LANGSMITH_WORKSPACE_ID="..."                  # only if your key spans several workspaces
```

Once set, **all LangChain and LangGraph calls are automatically traced** — no code changes needed. For a single block only, use `with langsmith.tracing_context(enabled=True):`.

For non-LangChain code, use the SDK directly (`@traceable` below, or `wrappers.wrap_openai(OpenAI())` to trace OpenAI calls):
```python
from langsmith import Client
client = Client()
```

### Step 2: Tracing

#### Automatic Tracing (LangChain)
With `LANGSMITH_TRACING=true`, every `.invoke()`, `.stream()`, `.batch()` call is traced automatically. Each trace shows:
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
    dataset_id=dataset.id,
    examples=[
        {
            "inputs": {"question": "How do I reset my password?"},
            "outputs": {"answer": "Go to Settings > Security > Reset Password"},
        },
        {
            "inputs": {"question": "What's your refund policy?"},
            "outputs": {"answer": "Full refund within 30 days, no questions asked"},
        },
    ],
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
# Evaluators may take any of: inputs, outputs, reference_outputs (older
# (run, example) signatures still work)
def correctness(outputs: dict, reference_outputs: dict) -> dict:
    """Check if the answer matches expected output."""
    predicted = outputs["answer"]
    expected = reference_outputs["answer"]
    score = 1.0 if expected.lower() in predicted.lower() else 0.0
    return {"key": "correctness", "score": score}

def conciseness(outputs: dict) -> dict:
    """Penalize overly long answers."""
    answer = outputs["answer"]
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

For LLM-as-judge evaluators, create a function that calls an LLM to rate quality on a 0-1 scale. Use `temperature=0` for consistency. For pairwise comparisons, use `evaluate_comparative` (from `langsmith.evaluation`) on two existing experiments. `evaluate` also accepts `num_repetitions` to run each example several times and `upload_results=False` to try an evaluator without writing an experiment.

### Step 5: Prompt Hub and Annotation Queues

Use `client.pull_prompt("rlm/rag-prompt")` to fetch a shared prompt (pin a version with `"name:commit"`) and `client.push_prompt("support-prompt", object=my_prompt)` to version your own. The standalone `langchainhub` package is deprecated. Annotation queues let you set up human review workflows — create a queue with `client.create_annotation_queue(name="low-score-review")`, then filter traces in the UI and send low-scoring ones for review.

### Step 6: Production Monitoring

```python
# Filter and analyze traces
runs = client.list_runs(
    project_name="production",
    filter='and(eq(status, "error"), gt(latency, "5s"))',
    limit=50,
)

for run in runs:
    print(f"Run {run.id}: {run.error} | Latency: {run.latency}s | Tokens: {run.total_tokens}")
```

In the LangSmith dashboard, set up automation rules to auto-flag slow runs, send low-score responses to annotation queues, and alert on error rate spikes.

### Step 7: Testing in CI/CD

Run evaluations in CI and assert minimum quality scores:

```python
def test_qa_quality():
    results = evaluate(my_app, data="regression-test-set", evaluators=[correctness])
    scores = results.to_pandas()["feedback.correctness"]  # requires pandas
    avg_score = scores.mean()
    assert avg_score >= 0.85, f"Quality dropped to {avg_score:.2f}"
```

## Examples

### Example 1: Add tracing and evaluation to an existing RAG chatbot
**User prompt:** "I have a LangChain RAG chatbot answering questions about our HR policies. Add LangSmith tracing and create an evaluation pipeline that checks if answers are correct and concise."

The agent will set the `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` environment variables so all chain invocations are automatically traced. It will then create a LangSmith dataset called `hr-policy-qa` with 10-15 real question/answer pairs drawn from common employee queries. Next, it will write two evaluators — a `correctness` evaluator that checks whether the expected answer appears in the predicted output, and a `conciseness` evaluator that penalizes answers over 100 words. Finally, it will wire up `evaluate()` to run the chatbot against the dataset with both evaluators and print a summary of scores.

### Example 2: Monitor production agent and alert on regressions
**User prompt:** "Our customer support agent is in production. Set up LangSmith monitoring to track error rates and latency, and add a CI test that fails if answer quality drops below 90%."

The agent will configure the production project in LangSmith with metadata tags for `environment: production` and `service: support-agent`. It will write a monitoring script using `client.list_runs()` with filters for error status and high latency (over 5 seconds), outputting a summary of total tokens, average latency, and error count. Then it will create a `regression-test-set` dataset from recent production traces and write a pytest test that runs `evaluate()` against it, asserting the average correctness score stays at or above 0.90.

## Guidelines

1. **Always enable tracing in dev** — set `LANGSMITH_TRACING=true` from day one
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

- **Forgetting to set env vars**: No tracing without `LANGSMITH_TRACING=true` (and a key); in serverless, set `LANGCHAIN_CALLBACKS_BACKGROUND=false` so traces flush before the function exits
- **Huge traces**: Logging full documents in metadata slows the UI — summarize or truncate
- **Evaluator flakiness**: LLM judges are non-deterministic — use temperature=0 and run multiple times
- **Not separating projects**: Dev traces mixed with production makes analysis impossible
- **Ignoring latency data**: Tracing overhead is minimal (<5ms) — the latency insights are worth it
