---
name: langfuse
description: >-
  Langfuse is an open-source LLM engineering platform that records traces of
  LLM calls, versions prompts, scores outputs and runs experiments on datasets.
  Use when asked to add observability to an LLM or RAG app, trace OpenAI or
  Vercel AI SDK calls, track token cost and latency, manage prompts outside the
  code, score outputs, build an evaluation dataset, or self-host Langfuse.
license: Apache-2.0
compatibility: "Python 3.11+ (langfuse 5.x) or Node.js 22+ (@langfuse/* 6.x); a Langfuse Cloud project or a self-hosted instance"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/langfuse/langfuse
  tags:
    - langfuse
    - llm-observability
    - tracing
    - evaluation
    - prompt-management
---

# Langfuse

## Overview

Langfuse stores traces (one per request), made of nested observations: plain spans, LLM generations with model, token usage and cost, tool calls and retrievals. On top of traces it offers versioned prompts, scores (numeric, boolean, categorical), datasets and experiments. Both SDKs are built on OpenTelemetry. Current generations at the time of writing: Python `langfuse` 5.x and the scoped JavaScript packages `@langfuse/*` 6.x. The old APIs, `langfuse.decorators` / `langfuse_context` in Python and the unscoped `langfuse` and `langfuse-vercel` npm packages (the v3 SDK), are legacy; do not use them in new code.

## Instructions

### Step 1: Configure credentials

Create a project in Langfuse Cloud (or your own instance) and copy its API keys into the environment. Never hardcode them.

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."      # from Project settings > API keys
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"   # US region: https://us.cloud.langfuse.com
```

```bash
pip install langfuse                                   # Python
npm install @langfuse/tracing @langfuse/otel @langfuse/client @opentelemetry/sdk-trace-node   # TypeScript
```

### Step 2: Trace a pipeline (Python)

`@observe` turns a function into an observation and nests calls automatically. Attributes that belong to the whole trace (user, session, tags) are set with the `propagate_attributes` context manager, and everything else is updated through `get_client()`.

```python
import os
from openai import OpenAI
from langfuse import observe, get_client, propagate_attributes

llm = OpenAI()
MODEL = os.environ["OPENAI_MODEL"]            # whichever chat model your account uses

@observe(as_type="retriever")
def retrieve(question: str) -> list[str]:
    return search_index(question, top_k=5)    # your vector-store call

@observe(as_type="generation")
def generate(question: str, docs: list[str]) -> str:
    resp = llm.chat.completions.create(model=MODEL, messages=[
        {"role": "system", "content": "Answer from this context:\n" + "\n".join(docs)},
        {"role": "user", "content": question},
    ])
    get_client().update_current_generation(
        model=MODEL,
        usage_details={"input": resp.usage.prompt_tokens, "output": resp.usage.completion_tokens},
    )
    return resp.choices[0].message.content

@observe()
def answer_question(question: str, user_id: str, session_id: str) -> str:
    with propagate_attributes(user_id=user_id, session_id=session_id, tags=["rag", "production"]):
        return generate(question, retrieve(question))
```

To skip the manual usage code, import the OpenAI drop-in instead: `from langfuse.openai import OpenAI`. It records model, tokens and cost for every call. Short-lived scripts and serverless handlers must call `get_client().flush()` before exiting, or the last spans are lost.

### Step 3: Trace in TypeScript

Register the span processor once at startup, then create observations with `@langfuse/tracing`.

```typescript
// instrumentation.ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();
new NodeTracerProvider({ spanProcessors: [langfuseSpanProcessor] }).register();
```

```typescript
import { startActiveObservation, startObservation, propagateAttributes } from "@langfuse/tracing";

await propagateAttributes({ userId: "user-42", sessionId: "chat-981" }, async () => {
  await startActiveObservation("support-request", async (span) => {
    span.update({ input: { question: "How do I reset my password?" } });
    const generation = startObservation("answer", { model: process.env.OPENAI_MODEL, input: [] }, { asType: "generation" });
    // ... call the LLM, then:
    generation.update({ output: "Open Settings > Security ...", usageDetails: { input: 212, output: 64 } });
    generation.end();
    span.update({ output: "answered" });
  });
});
await langfuseSpanProcessor.forceFlush();   // required on serverless before the function freezes
```

Wrappers exist for other stacks: `observeOpenAI` from `@langfuse/openai`, a callback handler in `@langfuse/langchain`, and `@langfuse/vercel-ai-sdk` for AI SDK v7. For the AI SDK versions up to 6, turn on `experimental_telemetry: { isEnabled: true }` in each call and use the span processor above.

### Step 4: Manage prompts

Create a prompt in the UI (variables are written `{{company_name}}`), publish it with a label such as `production`, and fetch it by label so the app picks up new versions without a deploy. Prompts are cached in the SDK; pass `fallback` so an outage does not break the app.

```python
from langfuse import get_client

prompt = get_client().get_prompt("support-system-prompt", label="production",
                                 fallback="You are a support agent for {{company_name}}.")
system_message = prompt.compile(company_name="Northwind Outfitters")
```

Link a generation to its prompt by passing `prompt=prompt` to `update_current_generation`, and the UI shows metrics per prompt version.

```typescript
import { LangfuseClient } from "@langfuse/client";
const langfuse = new LangfuseClient();            // reads the LANGFUSE_* variables
const prompt = await langfuse.prompt.get("support-system-prompt", { label: "production" });
const system = prompt.compile({ company_name: "Northwind Outfitters" });
```

### Step 5: Scores, datasets and experiments

```python
from langfuse import get_client, Evaluation
langfuse = get_client()

# Score the trace you are currently inside (user feedback, LLM-as-judge result, rule check)
langfuse.score_current_trace(name="relevance", value=0.9, comment="Answered the question directly")
# Or score an earlier trace by id
langfuse.create_score(trace_id=trace_id, name="thumbs_up", value=1, data_type="BOOLEAN")

# Dataset of test cases
langfuse.create_dataset(name="support-qa-v1")
langfuse.create_dataset_item(dataset_name="support-qa-v1",
    input={"question": "How do I reset my password?"},
    expected_output="Settings > Security > Reset password")

# Run the app over the dataset and score each output
def task(*, item, **kwargs):
    return answer_question(item.input["question"], user_id="eval", session_id="eval-1")

def contains_expected(*, input, output, expected_output, **kwargs):
    return Evaluation(name="contains_expected", value=float(expected_output.lower() in output.lower()))

result = langfuse.get_dataset("support-qa-v1").run_experiment(
    name="prompt v7", task=task, evaluators=[contains_expected])
print(result.format())
```

Pass local `data=[{"input": ..., "expected_output": ...}]` to `langfuse.run_experiment(...)` to test without creating a dataset. In TypeScript the same flow is `(await langfuse.dataset.get(name)).runExperiment({ name, task, evaluators })`.

## Examples

### Example 1: Add tracing to an existing RAG endpoint

Request: "Trace our /ask endpoint so I can see latency and token cost per user."

Add `@observe` to the handler, the retriever and the LLM call as in Step 2, wrap the handler body in `propagate_attributes(user_id=...)`, and set the three `LANGFUSE_*` variables. After one request, the Traces page shows one trace named `answer_question` with a `retrieve` child and a `generate` generation that lists model, input and output tokens and the calculated cost. Filter by user in the UI to see spend per customer.

### Example 2: Catch a prompt regression before release

Request: "Check whether the new support prompt is worse than the current one."

Fetch the candidate with `label="staging"`, build the dataset from 50 real questions (`create_dataset_item` with `source_trace_id` links an item to the production trace it came from), run `run_experiment` once per prompt version with the same evaluators, and compare the two runs on the dataset page. Each run shows its average `contains_expected` score, latency and cost; promote the `staging` label to `production` only if the new run is not worse.

## Guidelines

- Use the current SDKs. If code imports `langfuse.decorators`, `langfuse_context`, `langfuse.score(...)` or the npm package `langfuse` / `langfuse-vercel`, it follows the v2/v3 API and must be migrated (guides: https://langfuse.com/docs/observability/sdk/upgrade-path).
- Flush before exit in scripts, workers and serverless handlers (`get_client().flush()`, `forceFlush()`); tracing is asynchronous and batched.
- Observations record function inputs and outputs by default. Pass `capture_input=False, capture_output=False` to `@observe`, or mask data in the client, for personal or secret data.
- Cost is derived from the model name and usage details. A custom or fine-tuned model needs a model definition with prices in the project settings, otherwise cost stays empty.
- Self-hosting: the official `docker-compose.yml` in `langfuse/langfuse` runs the web app, a worker, Postgres, ClickHouse, Redis and MinIO. Replace every value marked `CHANGEME` (the Postgres, ClickHouse, Redis and MinIO passwords, `SALT`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`) before exposing it, and publish only port 3000 (and the MinIO port) beyond localhost.
- Sampling (`LANGFUSE_SAMPLE_RATE`) and `LANGFUSE_TRACING_ENABLED=false` keep tracing cheap in development and tests.
- Langfuse observes and evaluates; it does not call models or route requests for you.
