---
name: lm-studio-subagents
description: >-
  Offload tasks to local LLMs via LM Studio. Use when a user asks to run
  local models with LM Studio, save API costs by using local LLMs, create
  subagents with local models, offload summarization or classification to
  a local model, or use LM Studio's API for batch processing. Covers
  local model inference, task delegation, and cost optimization.
license: Apache-2.0
compatibility: "Requires LM Studio installed and running locally; the native /api/v1/chat endpoint requires LM Studio 0.4.0+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["lm-studio", "local-llm", "subagent", "inference", "cost-saving"]
  use-cases:
    - "Offload repetitive LLM tasks to free local models"
    - "Run summarization and classification without API costs"
    - "Create multi-agent workflows mixing cloud and local models"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# LM Studio Subagents

## Overview

Offload LLM tasks to local models running in LM Studio to save API costs and maintain privacy. LM Studio provides a native REST API and OpenAI-compatible endpoints. Prefer the native `/api/v1/chat` API for long-form work because it exposes output-token, reasoning, context-length, streaming, and stateful-continuation controls. Use local models for high-volume, lower-complexity tasks like summarization, extraction, classification, and reformatting while reserving cloud APIs for complex reasoning.

## Instructions

When a user wants to use local models via LM Studio, determine the task:

### Task A: Set up LM Studio as a local API server

1. Download and install LM Studio from `https://lmstudio.ai/`
2. Download a model through the LM Studio UI (recommended starting models):
   - `lmstudio-community/Llama-3.1-8B-Instruct-GGUF` (general purpose)
   - `lmstudio-community/Mistral-7B-Instruct-v0.3-GGUF` (fast inference)
   - `lmstudio-community/Qwen2.5-7B-Instruct-GGUF` (multilingual)

3. Start the local server:
   - Open LM Studio, go to the "Developer" tab
   - Load a model and click "Start Server"
   - Server runs at `http://localhost:1234` by default

4. Verify the server is running:

```bash
curl http://localhost:1234/v1/models
```

5. The native API requires an API token. Generate one under Developer → API tokens and export it as `LM_API_TOKEN`. (The OpenAI-compatible endpoints still accept the placeholder key `lm-studio`.)

### Task B: Call LM Studio from Python (native v1 API, preferred)

The native endpoint exposes output-length, reasoning, and stateful-continuation controls the OpenAI-compatible route lacks. Set `max_output_tokens` generously (4096-8192 for long-form), turn `reasoning` off unless it is genuinely needed, keep `store: true` so a truncated answer can be continued with `previous_response_id`, and allow a long HTTP timeout for slow local models.

```python
import os
import requests

LM_STUDIO_URL = "http://localhost:1234"
HEADERS = {"Authorization": f"Bearer {os.environ['LM_API_TOKEN']}"}

def _chat(**body) -> dict:
    body.setdefault("model", "loaded-model")
    body.setdefault("max_output_tokens", 4096)
    body.setdefault("reasoning", "off")   # reasoning tokens eat the output budget
    body.setdefault("store", True)        # required for previous_response_id
    r = requests.post(f"{LM_STUDIO_URL}/api/v1/chat", headers=HEADERS, json=body,
                      timeout=900)        # local models are slow; do not time out early
    r.raise_for_status()
    data = r.json()
    message = next(item for item in data["output"] if item["type"] == "message")
    return {"text": message["content"], "response_id": data.get("response_id"),
            "stats": data.get("stats", {})}

def ask_local(prompt: str, system: str = "You are a helpful assistant.") -> dict:
    return _chat(input=prompt, system_prompt=system, temperature=0.3,
                 context_length=32768)   # match the loaded model's configured context

def continue_local(response_id: str) -> dict:
    """Resume a cut-off answer without resending the source text."""
    return _chat(previous_response_id=response_id,
                 input="Continue exactly where you stopped. Do not repeat prior text.")

result = ask_local("Summarize this text in 2 sentences: ...")
print(result["text"])
# If stats show the generation hit the output limit, extend it:
# result = continue_local(result["response_id"])
```

### OpenAI-compatible fallback

Use this route when the native API is unavailable (LM Studio older than 0.4.0, or an existing OpenAI-SDK codebase). LM Studio treats `max_tokens: -1` as "no fixed completion cap", which avoids the silent truncation a small hard-coded limit causes. There is no continuation primitive here, so always inspect `finish_reason`.

```python
from openai import OpenAI

# Point to local LM Studio server
client = OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio",  # Any string works
)

def ask_local(prompt: str, system: str = "You are a helpful assistant.") -> str:
    response = client.chat.completions.create(
        model="loaded-model",  # LM Studio ignores this, uses loaded model
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=-1,  # LM Studio: no fixed completion cap
    )
    if response.choices[0].finish_reason == "length":
        raise RuntimeError("LM Studio truncated the response; use the native API continuation flow.")
    return response.choices[0].message.content

# Example usage
result = ask_local("Summarize this text in 2 sentences: ...")
print(result)
```

### Task C: Create task-specific subagents

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

class LocalSubagent:
    def __init__(self, system_prompt: str, temperature: float = 0.2):
        self.system_prompt = system_prompt
        self.temperature = temperature

    def run(self, user_input: str) -> str:
        response = client.chat.completions.create(
            model="loaded-model",
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_input},
            ],
            temperature=self.temperature,
            max_tokens=-1,  # LM Studio: no fixed completion cap
        )
        if response.choices[0].finish_reason == "length":
            raise RuntimeError("Response truncated; retry through the native API continuation flow.")
        return response.choices[0].message.content

# Define specialized subagents
summarizer = LocalSubagent(
    system_prompt="You are a summarization expert. Produce concise 2-3 sentence summaries."
)

classifier = LocalSubagent(
    system_prompt="Classify the input into one of these categories: billing, technical, general, urgent. Respond with only the category name.",
    temperature=0.0,
)

extractor = LocalSubagent(
    system_prompt="Extract all named entities (people, organizations, dates, amounts) from the text. Return as JSON.",
    temperature=0.0,
)

# Use the subagents
summary = summarizer.run("Long document text here...")
category = classifier.run("I can't log into my account and I need to submit a report by EOD")
entities = extractor.run("John Smith signed a $50,000 contract with Acme Corp on March 15, 2025")
```

### Task D: Batch processing with local models

```python
import asyncio
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

async def process_batch(items: list[str], system_prompt: str, max_concurrent: int = 4,
                        max_tokens: int = 4096) -> list[dict]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_one(text: str) -> dict:
        async with semaphore:
            response = await client.chat.completions.create(
                model="loaded-model",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                temperature=0.2,
                max_tokens=max_tokens,  # generous but finite: unbounded batches can run for hours
            )
            choice = response.choices[0]
            # Flag truncation per item instead of raising — one bad item must not
            # discard the other 99 results.
            return {"text": choice.message.content, "truncated": choice.finish_reason == "length"}

    tasks = [process_one(item) for item in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r if isinstance(r, dict) else {"text": None, "error": str(r)} for r in results]

# Batch summarize 100 documents
documents = ["doc1 text...", "doc2 text...", ...]  # 100 documents
summaries = asyncio.run(process_batch(
    documents,
    system_prompt="Summarize in 2 sentences.",
    max_concurrent=2,  # LM Studio handles one request at a time by default
))
incomplete = [i for i, r in enumerate(summaries) if r.get("truncated") or r.get("error")]
```

### Task E: Cost comparison and routing strategy

Decide when to use local vs. cloud models:

| Task | Local Model | Cloud API | Recommendation |
|------|------------|-----------|----------------|
| Summarization | Good | Better | Local (save cost) |
| Classification | Good | Good | Local (save cost) |
| Data extraction | Moderate | Good | Local for simple, cloud for complex |
| Code generation | Moderate | Better | Cloud |
| Complex reasoning | Weak | Strong | Cloud |
| Translation | Good | Better | Local for common languages |

```python
def smart_route(task_type: str, text: str) -> str:
    """Route tasks between local and cloud models."""
    local_tasks = {"summarize", "classify", "extract_simple", "reformat"}

    if task_type in local_tasks:
        return ask_local(text)  # Free, local inference
    else:
        return ask_cloud(text)  # Paid, cloud API
```

## Examples

### Example 1: Summarize 500 support tickets locally

**User request:** "Summarize all our support tickets from last month without API costs"

```python
tickets = load_tickets_from_csv("tickets.csv")
summaries = asyncio.run(process_batch(
    [t["description"] for t in tickets],
    system_prompt="Summarize this support ticket in one sentence. Include the main issue and any resolution.",
    max_concurrent=2,
))
# Re-run any item where r["truncated"] is True through the native continuation flow.
# Cost: $0 (vs ~$15 with GPT-4)
```

### Example 2: Classify incoming emails

**User request:** "Auto-classify emails into categories using a local model"

```python
classifier = LocalSubagent(
    system_prompt="Classify this email into exactly one category: sales, support, spam, internal. Reply with only the category.",
    temperature=0.0,
)
for email in emails:
    category = classifier.run(email["subject"] + "\n" + email["body"])
    email["category"] = category.strip().lower()
```

### Example 3: Extract structured data from documents

**User request:** "Extract names, dates, and amounts from these contracts"

```python
extractor = LocalSubagent(
    system_prompt='Extract fields from the contract as JSON: {"parties": [], "date": "", "amount": "", "term": ""}',
    temperature=0.0,
)
for doc in contracts:
    data = extractor.run(doc["text"])
    print(f"{doc['filename']}: {data}")
```

## Guidelines

- LM Studio processes one request at a time by default. Set `max_concurrent=1-2` for batch jobs.
- Prefer the native `/api/v1/chat` endpoint (LM Studio 0.4.0+) for long-form requests; use `/v1/chat/completions` as a compatibility fallback.
- Never hard-code small output limits such as `512`, `1024`, or `2048` for long-form tasks — that is the usual cause of summaries that stop mid-sentence. Use `max_output_tokens` of 4096-8192 natively, or `max_tokens: -1` on the compatible route.
- Never present a length-terminated response as complete: check `finish_reason == "length"` on the compatible route and the returned `stats` natively, then resume with `previous_response_id` rather than resending the source.
- Use `reasoning: "off"` for summaries and extraction; reasoning tokens consume the generation budget without appearing in the returned text.
- Context length and output length are separate limits — raise `context_length` at model-load time for large inputs, and `max_output_tokens` for long answers.
- Use quantized models (Q4_K_M or Q5_K_M) for best speed-to-quality ratio on consumer hardware.
- 8B parameter models are the sweet spot for most extraction and classification tasks.
- Set `temperature=0.0` for deterministic tasks like classification and extraction.
- Test local model accuracy on a sample of 20-50 items before running full batches.
- For tasks where local models underperform, fall back to cloud APIs automatically.
- Keep LM Studio running as a background service for always-on local inference.
- Monitor RAM and VRAM usage; 7B models need ~6 GB RAM (quantized) or ~16 GB (full precision).
