---
name: lm-studio-subagents
description: >-
  Offload tasks to local LLMs via LM Studio. Use when a user asks to run
  local models with LM Studio, save API costs by using local LLMs, create
  subagents with local models, offload summarization or classification to
  a local model, or use LM Studio's API for batch processing. Covers
  local model inference, task delegation, and cost optimization.
license: Apache-2.0
compatibility: "Requires LM Studio installed and running locally"
metadata:
  author: terminal-skills
  version: "1.0.1"
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

Offload LLM tasks to local models running in LM Studio to save API costs and maintain privacy. LM Studio provides an OpenAI-compatible API for local models, making it a drop-in replacement for cloud LLM calls. Use local models for high-volume, lower-complexity tasks like summarization, extraction, classification, and reformatting while reserving cloud APIs for complex reasoning.

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

### Task B: Call LM Studio from Python (OpenAI-compatible)

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
        max_tokens=1024,
    )
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
            max_tokens=2048,
        )
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

async def process_batch(items: list[str], system_prompt: str, max_concurrent: int = 4) -> list[str]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_one(text: str) -> str:
        async with semaphore:
            response = await client.chat.completions.create(
                model="loaded-model",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                temperature=0.2,
                max_tokens=512,
            )
            return response.choices[0].message.content

    tasks = [process_one(item) for item in items]
    return await asyncio.gather(*tasks)

# Batch summarize 100 documents
documents = ["doc1 text...", "doc2 text...", ...]  # 100 documents
summaries = asyncio.run(process_batch(
    documents,
    system_prompt="Summarize in 2 sentences.",
    max_concurrent=2,  # LM Studio handles one request at a time by default
))
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
- Use quantized models (Q4_K_M or Q5_K_M) for best speed-to-quality ratio on consumer hardware.
- 8B parameter models are the sweet spot for most extraction and classification tasks.
- Set `temperature=0.0` for deterministic tasks like classification and extraction.
- Test local model accuracy on a sample of 20-50 items before running full batches.
- For tasks where local models underperform, fall back to cloud APIs automatically.
- Keep LM Studio running as a background service for always-on local inference.
- Monitor RAM and VRAM usage; 7B models need ~6 GB RAM (quantized) or ~16 GB (full precision).
