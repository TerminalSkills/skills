---
name: vertex-ai-gemini
description: >-
  Google Cloud Vertex AI (now Gemini Enterprise Agent Platform) for running Gemini
  models with Google Cloud IAM, fine-tuning and batch jobs. Use when deploying Gemini in GCP-native environments,
  running fine-tuning jobs, needing enterprise IAM controls, VPC isolation,
  batch prediction at scale, or production ML pipelines on Google Cloud.
license: Apache-2.0
compatibility: "Python 3.10+ with google-genai 2.x and Google Cloud credentials (Application Default Credentials)"
metadata:
  author: terminal-skills
  version: "1.2.0"
  repository: https://github.com/googleapis/python-genai
  category: data-ai
  tags: ["vertex-ai", "google-cloud", "gemini", "enterprise", "mlops"]
  use-cases:
    - "Deploy Gemini with enterprise IAM, VPC controls, and compliance requirements"
    - "Fine-tune Gemini on proprietary data for domain-specific use cases"
    - "Run batch predictions on millions of records with managed infrastructure"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Vertex AI — Gemini on Google Cloud

## Overview

Vertex AI is Google Cloud's enterprise platform for Gemini. It serves the same Gemini models as the Gemini Developer API (Google AI Studio) but authenticates with Google Cloud IAM instead of an API key, bills to your project, and adds supervised fine-tuning, batch jobs at a discount, and Cloud Storage and BigQuery integration.

> **Naming:** Google is renaming Vertex AI to Gemini Enterprise Agent Platform. Same service, same endpoints and IAM roles; the documentation has moved to `docs.cloud.google.com/gemini-enterprise-agent-platform` and the old pages are no longer updated.

## Instructions

### Step 1: Use the Google Gen AI SDK

The Generative AI module of the Vertex AI SDK (`vertexai.generative_models`, `GenerativeModel`, `vertexai.tuning.sft`) was deprecated on June 24, 2025 and scheduled for removal on June 24, 2026 (Google's deprecations page). Do not write new code against it; migrate existing code to `google-genai` (Python 3.10+, version 2.33.0 when checked). Other languages: `@google/genai` (JS/TS), `google.golang.org/genai` (Go), `com.google.genai:google-genai` (Java), `Google.GenAI` (.NET).

```bash
pip install google-genai
gcloud auth application-default login   # local development: no key file needed
```

```python
from google import genai

# Vertex AI / Agent Platform mode: project + location, credentials from ADC
client = genai.Client(enterprise=True, project="northwind-prod", location="global")

response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="Explain containerization in simple terms.",
)
print(response.text)
```

The same client can come from environment variables: `GOOGLE_GENAI_USE_ENTERPRISE=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, then `genai.Client()`. The older `vertexai=True` argument and `GOOGLE_GENAI_USE_VERTEXAI` still work (checked in 2.33.0). If `GOOGLE_API_KEY` or `GEMINI_API_KEY` is set without those variables, the client talks to the Gemini Developer API instead, so check which one you got.

`location="global"` routes to a region with capacity. Use a named region (`us-central1`, `europe-west4`) only for data residency. The SDK calls the beta API by default; pass `http_options=types.HttpOptions(api_version="v1")` to the client for the stable one.

### Step 2: Models

Take the current list from the model-versions page of the docs; IDs change several times a year. On 2026-10-23 it listed:

| Model ID | Notes |
|---|---|
| `gemini-3.8-flash` | released Sep 2, 2026, retirement Sep 2, 2027 or later |
| `gemini-3.5-flash`, `gemini-3.5-flash-lite` | retirement May and July 2027 or later |
| `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` | retirement date Oct 20, 2026 has passed: treat as retired and migrate |
| `gemini-embedding-001`, `gemini-embedding-2` | embeddings |
| `text-embedding-005`, `text-embedding-004` | retire April 1, 2027 |

`gemini-2.0-flash` and `gemini-1.5-*` are retired, and the 2.5 family passed its retirement date on Oct 20, 2026; code that names them fails. Stable model IDs carry no date suffix; use the exact ID rather than an alias such as `gemini-flash-latest` in production, so a new default cannot change your results.

### Step 3: Generation, streaming, chat

```python
from google.genai import types

# System instruction and sampling settings
response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="How do I set up Cloud Run?",
    config=types.GenerateContentConfig(
        system_instruction="You are a GCP expert. Provide concise, actionable answers.",
        temperature=0.2,
    ),
)

# Streaming
for chunk in client.models.generate_content_stream(
    model="gemini-3.5-flash", contents="Write a product description for a smartwatch."
):
    print(chunk.text, end="", flush=True)

# Chat keeps the history for you
chat = client.chats.create(model="gemini-3.5-flash")
print(chat.send_message("How do I set up Cloud Run?").text)
print(chat.send_message("What about environment variables?").text)
```

### Step 4: Images and files from Cloud Storage

```python
response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents=[
        types.Part.from_uri(file_uri="gs://northwind-media/product-photo.jpg", mime_type="image/jpeg"),
        "Describe this product:",
    ],
)

with open("chart.png", "rb") as f:
    chart = types.Part.from_bytes(data=f.read(), mime_type="image/png")
response = client.models.generate_content(
    model="gemini-3.5-flash", contents=[chart, "What trends does this chart show?"]
)
```

The service account needs read access to the bucket for `gs://` URIs.

### Step 5: Structured output and function calling

```python
from pydantic import BaseModel

class Ticket(BaseModel):
    customer: str
    priority: str

response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="Priya Nair reports the invoice export is down for her whole team.",
    config=types.GenerateContentConfig(
        response_mime_type="application/json", response_schema=Ticket
    ),
)
ticket = response.parsed   # a Ticket instance

run_query = types.FunctionDeclaration(
    name="run_bigquery_query",
    description="Run a SQL query on BigQuery and return the rows",
    parameters_json_schema={
        "type": "object",
        "properties": {"query": {"type": "string", "description": "Standard SQL"}},
        "required": ["query"],
    },
)
response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="How many users signed up last week?",
    config=types.GenerateContentConfig(tools=[types.Tool(function_declarations=[run_query])]),
)
for call in response.function_calls or []:
    print(call.name, dict(call.args))   # run it yourself, then send the result back
```

Passing a plain Python function in `tools=[...]` makes the SDK call it automatically and send the result back to the model. Never run SQL the model produced against production data with a write-capable account.

### Step 6: Batch jobs

Batch inference costs 50% less than real-time calls and is processed asynchronously; most jobs finish within 24 hours of starting, and incomplete jobs are cancelled after 24 hours. Input is one JSONL file in Cloud Storage (or a BigQuery table), one request per line:

```json
{"request": {"contents": [{"role": "user", "parts": [{"text": "Translate to German: Waterproof hiking boots"}]}]}}
```

```python
import time

job = client.batches.create(
    model="gemini-3.5-flash",
    src="gs://northwind-batch/titles-de.jsonl",
    config=types.CreateBatchJobConfig(dest="gs://northwind-batch/out/"),
)
done = {"JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_PAUSED"}
while job.state.name not in done:
    time.sleep(60)
    job = client.batches.get(name=job.name)
print(job.state.name, job.dest)
```

Output JSONL files land under the destination prefix. Tuned Gemini 3 models do not support batch inference, and the global endpoint is not supported for tuned models.

### Step 7: Supervised fine-tuning

Supported base models (docs, Oct 2026): `gemini-3.5-flash`, `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`. Each line of the training JSONL in Cloud Storage is one conversation in `contents` format (not `messages`); start with about 100 examples and add a validation file:

```json
{"systemInstruction": {"parts": [{"text": "Answer as a Northwind support agent."}]}, "contents": [{"role": "user", "parts": [{"text": "Where is order 4417?"}]}, {"role": "model", "parts": [{"text": "Order 4417 left our Rotterdam warehouse on 12 October."}]}]}
```

```python
tuning_job = client.tunings.tune(
    base_model="gemini-3.5-flash",
    training_dataset=types.TuningDataset(gcs_uri="gs://northwind-batch/train.jsonl"),
    config=types.CreateTuningJobConfig(epoch_count=3, tuned_model_display_name="northwind-support"),
)
while tuning_job.state.name not in {"JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED"}:
    time.sleep(60)
    tuning_job = client.tunings.get(name=tuning_job.name)

response = client.models.generate_content(
    model=tuning_job.tuned_model.endpoint, contents="Where is order 4417?"
)
```

The docs recommend turning thinking off, or setting it to the minimum, for tuned tasks, and list `us` and `eu` multi-region endpoints as the supported ones for tuning and tuned-model serving; if a job fails on `global`, create the client with a US or EU location. The SDK marks `tunings` as experimental.

### Step 8: IAM

```bash
gcloud iam service-accounts create gemini-app-sa --display-name="Gemini app"
gcloud projects add-iam-policy-binding northwind-prod \
    --member="serviceAccount:gemini-app-sa@northwind-prod.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"
```

On Cloud Run, GKE or Compute Engine attach this service account to the workload: Application Default Credentials pick it up and no key file exists. For code that runs outside Google Cloud, prefer workload identity federation over downloading a service-account key. If VPC Service Controls protect the project, requests from outside the perimeter are rejected, so run the code inside it.

## Examples

### Example 1 — Move a service off the removed `vertexai` module

**User prompt:** "Our Cloud Run recommendation service imports vertexai.generative_models and started failing with gemini-2.0-flash-001 not found. Fix it."

Replace `pip install google-cloud-aiplatform` with `google-genai`, swap `vertexai.init(...)` and `GenerativeModel(...)` for `genai.Client(enterprise=True, project=..., location="global")`, and turn `model.generate_content(prompt)` into `client.models.generate_content(model="gemini-3.5-flash", contents=prompt)`. The service account and `roles/aiplatform.user` binding stay as they are. Run the same prompts in staging and compare outputs before the cutover.

### Example 2 — Nightly translation of 5 million product titles

**User prompt:** "Translate our BigQuery product titles into German, French, Spanish and Italian every night, as cheaply as possible."

Real-time calls would be slow and cost twice as much. Export one request per title and language to JSONL in `gs://northwind-batch/`, create the job from Step 6 with `gemini-3.5-flash-lite` or `gemini-3.5-flash`, poll until `JOB_STATE_SUCCEEDED`, then load the output files into BigQuery with `bq load --source_format=NEWLINE_DELIMITED_JSON`. Split the input into several files if a job hits the quota or size limits on the quotas page.

## Guidelines

- Use `google-genai` for all new code; the Vertex AI SDK generative module is deprecated and was due for removal on June 24, 2026.
- Check the model-versions page before choosing a model and when a call fails with "model not found": retired IDs stop working.
- Use Application Default Credentials locally and attached service accounts in production; do not commit key files or put them in images.
- Default to `location="global"`; pin a region only for data residency, and remember the global endpoint does not guarantee residency.
- Fine-tune only when prompting and structured output are not enough; the model is trained on conversations in `contents` format and needs a validation set.
- Batch jobs are for offline work. Use real-time calls when a user is waiting.
- Turn on Data Access audit logs for `aiplatform.googleapis.com` if compliance requires a record of requests.
