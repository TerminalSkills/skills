---
name: arize
description: >-
  Arize is an AI observability platform, and Phoenix is its open-source
  tracing and evaluation tool for LLM applications. Use this skill when the
  user wants to trace OpenAI or LangChain calls, run a local Phoenix server,
  score RAG answers for faithfulness, debug slow or wrong LLM responses, or
  send OpenTelemetry traces to Arize for production monitoring.
license: Apache-2.0
compatibility: "Python 3.11 to 3.14 (Phoenix 21.x; arize-phoenix-otel and arize-otel require below 3.15); OpenAI API key only for the LLM-judge examples"
metadata:
  author: terminal-skills
  version: "1.2.1"
  category: data-ai
  repository: https://github.com/Arize-ai/phoenix
  tags: "observability, llm, phoenix, tracing, evaluation"
---

# Arize (Phoenix) — AI Observability Platform

## Overview

Phoenix (`arize-phoenix`, source-available under the Elastic License 2.0, free to self-host) is an OpenTelemetry-native trace collector and UI for LLM apps: it records every model call, retrieval step and tool call, and lets you evaluate the results with an LLM judge. Arize is the hosted commercial platform from the same company for production monitoring, with the same OpenInference trace format. The workflow is: run Phoenix locally while developing, instrument with OpenInference, score traces with `arize-phoenix-evals`, and point the same instrumentation at Arize when you need dashboards and alerts.

Packages checked in October 2026: `arize-phoenix` 21.0.0, `arize-phoenix-otel` 0.17, `arize-phoenix-client` 3.6, `arize-phoenix-evals` 3.9, `arize` (Arize SDK) 8.63, `arize-otel` 0.14. Phoenix 21 is the server package itself (breaking: new `system_state` table, loopback bind, auth defaults).

## Instructions

### 1. Install and start Phoenix

```bash
pip install arize-phoenix arize-phoenix-otel openinference-instrumentation-openai openai
phoenix serve            # UI and OTLP collector on http://127.0.0.1:6006 (loopback only since v21)
```

`uvx arize-phoenix serve` runs it without installing; a container is published as `arizephoenix/phoenix`. `phoenix serve` has no `--host` or `--port` flags: set `PHOENIX_HOST`, `PHOENIX_PORT` (UI and HTTP OTLP, default 6006) and `PHOENIX_GRPC_PORT` (default 4317) as environment variables. In a notebook, `px.launch_app()` still starts a session, but for applications run the server as a separate process. Set `PHOENIX_TELEMETRY_ENABLED=false` to opt out of usage analytics.

Since v21 the server binds to `127.0.0.1` and authentication is off only for loopback. Binding elsewhere (`PHOENIX_HOST=0.0.0.0`, and the Docker image, which sets `PHOENIX_HOST=::`) turns authentication on unless `PHOENIX_ENABLE_AUTH=false`; then create an API key in the UI and give it to clients as `PHOENIX_API_KEY`. Set `PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD` to an unguessable value before the first start of an authenticated server (the default `admin@localhost` / `admin` must be changed), and `PHOENIX_SECRET` to encrypt saved credentials such as provider keys (setting or changing it makes saved credentials unreadable, so re-enter them).

### 2. Trace an application

```python
from phoenix.otel import register
from openinference.instrumentation.openai import OpenAIInstrumentor
import openai

tracer_provider = register(project_name="support-chatbot")   # gRPC to the local server (port 4317)
OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)

client = openai.OpenAI()
client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Explain CRDTs to a junior developer"}],
)
```

`register(auto_instrument=True)` instruments every installed `openinference-instrumentation-*` package. By default `register()` exports over gRPC: `PHOENIX_COLLECTOR_ENDPOINT` supplies only the host and the port comes from `PHOENIX_GRPC_PORT` (default 4317). To send over HTTP to the UI port, pass `protocol="http/protobuf"` (the endpoint then becomes `<PHOENIX_COLLECTOR_ENDPOINT>/v1/traces`) or pass a full `endpoint="http://host:6006/v1/traces"`. Set `PHOENIX_API_KEY` for a server with authentication on.

### 3. Pull spans and evaluate them

The current evals API is `LLM` plus metric evaluators run with `evaluate_dataframe`. The older `OpenAIModel`, `run_evals` and `QAEvaluator` classes are gone from the top-level API.

```python
import pandas as pd
from phoenix.client import Client
from phoenix.client.types.spans import SpanQuery
from phoenix.evals import LLM, evaluate_dataframe
from phoenix.evals.metrics import FaithfulnessEvaluator, CorrectnessEvaluator

spans = Client().spans.get_spans_dataframe(
    query=SpanQuery().where("span_kind == 'LLM'"),
    project_name="support-chatbot",
    limit=200,
)

# Evaluators read columns named input, output (and context for faithfulness).
rows = pd.DataFrame({
    "input": spans["attributes.input.value"],
    "output": spans["attributes.output.value"],
    "context": "Refunds are issued within 14 days of purchase.",
})

judge = LLM(provider="openai", model="gpt-4o-mini")   # needs OPENAI_API_KEY
scores = evaluate_dataframe(rows, [FaithfulnessEvaluator(judge), CorrectnessEvaluator(judge)])
```

Each evaluator returns a label, a 0/1 score and an explanation. Other built-ins: `HallucinationEvaluator` (grounded in the conversation itself), `RetrievalRelevanceEvaluator` (replaces the deprecated `DocumentRelevanceEvaluator`), `ToxicityEvaluator`, `RefusalEvaluator`, `PiiDetectionEvaluator`, and tool-call evaluators. `create_classifier` builds a custom judge from your own prompt and labels. Judge models must support tool calling.

### 4. Send traces to Arize

```bash
pip install arize-otel
```

```python
import os
from arize.otel import register

tracer_provider = register(
    space_id=os.environ["ARIZE_SPACE_ID"],
    api_key=os.environ["ARIZE_API_KEY"],
    project_name="support-chatbot",
    auto_instrument=True,
)
```

EU accounts pass `endpoint=Endpoint.ARIZE_EUROPE` (`from arize.otel import Endpoint`). The `arize` package (v8) provides `ArizeClient(api_key=...)` for datasets, experiments and spans over the REST API; the old `arize.pandas.logger.Client` and `ModelTypes` flow is not in the current SDK docs, so use tracing for LLM apps.

## Examples

### Example 1: "Why was this chatbot answer slow?"

```bash
phoenix serve &
python app.py                 # app calls register(project_name="support-chatbot")
```

Open http://127.0.0.1:6006, select the `support-chatbot` project, sort traces by latency, and expand the slowest one. The trace tree shows the retrieval span, the LLM span with prompt, completion and token counts, and which step took the time.

### Example 2: "Check my RAG answers for hallucinations"

Run the step 3 script against 200 recent LLM spans. `scores` has one row per span with `faithfulness_score`, a label (`faithful` or `unfaithful`) and the judge's explanation. Filter for `unfaithful` rows, read the explanations, and fix the retrieval or prompt for those queries.

## Guidelines

- Phoenix stores data in a local SQLite file by default (under `PHOENIX_WORKING_DIR`); for teams set `PHOENIX_SQL_DATABASE_URL` to PostgreSQL and run the container.
- The LLM judge costs tokens: evaluate a sample, not every span, and use a cheaper model first.
- The Phoenix client reads spans through `phoenix.client`; the old `px.Client().get_spans_dataframe(filter_condition=...)` call is replaced by `SpanQuery().where(...)`.
- Old `px.Inferences` / `px.Schema` embedding-drift sessions are no longer exported by the `phoenix` package; use Arize for embedding drift and clustering.
- Keep API keys in environment variables; traces contain prompts and user data, so do not point a development app at a shared instance unintentionally.
