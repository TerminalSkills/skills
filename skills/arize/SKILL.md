---
name: arize
category: AI & Machine Learning
tags: [observability, monitoring, evaluation, llm, phoenix, ml-ops, tracing]
version: 1.0.0
author: terminal-skills
---

# Arize (Phoenix) — AI Observability Platform

You are an expert in Arize and its open-source Phoenix library for AI observability. You help developers monitor LLM applications with tracing, evaluation, embedding analysis, drift detection, and retrieval quality metrics — using Phoenix for local development (open-source, self-hosted) and Arize platform for production monitoring at scale.

## Core Capabilities

### Phoenix Local Setup

```python
import phoenix as px
from phoenix.otel import register

# Launch Phoenix locally (browser UI on localhost:6006)
px.launch_app()

# Register as OpenTelemetry trace provider
tracer_provider = register(project_name="my-llm-app")

# Auto-instrument OpenAI
from openinference.instrumentation.openai import OpenAIInstrumentor
OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)

# Now all OpenAI calls are traced
import openai
client = openai.OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain CRDT to a junior dev"}],
)
# Open localhost:6006 — see traces, latency, tokens, cost
```

### RAG Evaluation

```python
from phoenix.evals import (
    HallucinationEvaluator,
    QAEvaluator,
    RelevanceEvaluator,
    run_evals,
)
from phoenix.evals.models import OpenAIModel

eval_model = OpenAIModel(model="gpt-4o")

# Evaluate RAG quality on your traces
hallucination_eval = HallucinationEvaluator(eval_model)
qa_eval = QAEvaluator(eval_model)
relevance_eval = RelevanceEvaluator(eval_model)

# Pull traces from Phoenix
traces_df = px.Client().get_spans_dataframe(
    filter_condition="span_kind == 'LLM'",
)

# Run evaluations
results = run_evals(
    dataframe=traces_df,
    evaluators=[hallucination_eval, qa_eval, relevance_eval],
    provide_explanation=True,
)
# Results: per-trace hallucination scores, QA accuracy, retrieval relevance
# All visible in Phoenix UI with explanations
```

### Embedding Analysis

```python
import phoenix as px
import pandas as pd

# Analyze embedding drift and clustering
embeddings_df = pd.DataFrame({
    "text": documents,
    "embedding": embeddings,               # numpy arrays
    "category": categories,
})

# Launch with embedding visualization
session = px.launch_app(
    primary=px.Inferences(embeddings_df, schema=px.Schema(
        embedding=px.EmbeddingColumnNames(
            vector_column_name="embedding",
            raw_data_column_name="text",
        ),
        tag_column_names=["category"],
    )),
)
# UMAP visualization in browser — see clusters, outliers, drift
```

### Production Monitoring (Arize Platform)

```python
from arize.pandas.logger import Client
from arize.utils.types import ModelTypes, Environments

arize_client = Client(
    space_key=os.environ["ARIZE_SPACE_KEY"],
    api_key=os.environ["ARIZE_API_KEY"],
)

# Log predictions for monitoring
arize_client.log(
    dataframe=predictions_df,
    model_id="support-chatbot-v2",
    model_version="2.1.0",
    model_type=ModelTypes.GENERATIVE_LLM,
    environment=Environments.PRODUCTION,
    schema=arize_schema,
)
# Arize platform: drift detection, performance dashboards, alerting
```

## Installation

```bash
pip install arize-phoenix                  # Open-source local
pip install arize                          # Arize platform client
pip install openinference-instrumentation-openai  # Auto-instrumentation
```

## Best Practices

1. **Phoenix for dev** — Run locally with `px.launch_app()`; free, open-source, no data leaves your machine
2. **Auto-instrumentation** — Use OpenInference instrumentors for OpenAI, LangChain, LlamaIndex; zero code changes
3. **RAG evaluations** — Run hallucination + relevance + QA evals on production traces; catch quality regressions
4. **Embedding viz** — Use UMAP visualization to find clusters, outliers, and distribution drift in your data
5. **OpenTelemetry native** — Phoenix is an OTLP collector; integrates with existing observability stacks
6. **Arize for production** — Scale to millions of traces; automated drift detection and alerting
7. **LLM-as-judge** — Built-in evaluators use GPT-4 to score hallucination, relevance; provide explanations
8. **Trace filtering** — Filter by span kind, model, latency, error; drill into problematic traces
