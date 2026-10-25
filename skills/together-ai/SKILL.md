---
name: together-ai
description: |
  Together AI is a cloud platform that runs open-source AI models behind an API: chat and reasoning LLMs, image generation, and fine-tuning on your own data. Use when a user wants to call open models such as GLM, DeepSeek, Qwen or gpt-oss through an OpenAI-compatible API, stream chat output, get JSON that matches a schema, generate images, or fine-tune a model with the Together Python SDK or CLI.
license: Apache-2.0
compatibility: 'Python 3.10+ (together 3.x), Node 20+ (together-ai), or any OpenAI-compatible client; needs TOGETHER_API_KEY'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags: "llm-hosting, open-source-models, fine-tuning, image-generation, inference-api"
---

# Together AI

## Overview

Together AI hosts open-weight models on shared per-token ("serverless") endpoints and on dedicated endpoints you rent. The API is OpenAI-compatible, so the OpenAI SDK works with a different base URL; the official `together` SDK (Python) and `together-ai` (TypeScript) add files, fine-tuning and image calls. Model IDs change often: the catalog at https://docs.together.ai/docs/serverless/models and the deprecations page at https://docs.together.ai/docs/deprecations are the source of truth. Old IDs (Llama 3.1 Turbo, Mixtral, Stable Diffusion XL, `togethercomputer/m2-bert-*`) have been removed, and Llama-3.3-70B-Instruct-Turbo was scheduled for removal on 2026-10-22.

## Instructions

### Install and authenticate

```bash
pip install together          # Python 3.10+, installs the `tg` CLI too
npm install together-ai       # TypeScript
export TOGETHER_API_KEY="..." # create it under Settings > API keys in the Together dashboard
```

`Together()` reads `TOGETHER_API_KEY` itself. Do not paste keys into code.

### Chat completions

```python
from together import Together

client = Together()
response = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[
        {"role": "system", "content": "You are a helpful coding assistant."},
        {"role": "user", "content": "Write a Python function to merge two sorted lists."},
    ],
    max_tokens=500,
)
print(response.choices[0].message.content)
```

List the live model IDs with `client.models.list()` or the catalog page before hard-coding one. Reasoning models return their thinking in a separate `reasoning` field next to `content`; keep `max_tokens` generous for them.

### Streaming

```python
stream = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[{"role": "user", "content": "Write a haiku about code review"}],
    stream=True,
)
for chunk in stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)
```

### OpenAI SDK

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["TOGETHER_API_KEY"], base_url="https://api.together.ai/v1")
response = client.chat.completions.create(
    model="MiniMaxAI/MiniMax-M3",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

Chat, completions, vision, image generation and embeddings are covered by the compatibility layer. Requests that must stay in the US or Canada go to `us-api.together.ai` or `ca-api.together.ai` (25% premium, a subset of models).

### Structured output (JSON schema)

```python
import json
from pydantic import BaseModel

class VoiceNote(BaseModel):
    title: str
    summary: str
    actionItems: list[str]

response = client.chat.completions.create(
    model="Qwen/Qwen3.5-9B",
    messages=[
        {"role": "system", "content": f"Answer only in JSON following this schema: {json.dumps(VoiceNote.model_json_schema())}"},
        {"role": "user", "content": "Voice note: tomorrow I must book the dentist and send the Q4 invoice to Maria."},
    ],
    reasoning={"enabled": False},
    response_format={
        "type": "json_schema",
        "json_schema": {"name": "voice_note", "schema": VoiceNote.model_json_schema()},
    },
)
note = VoiceNote.model_validate_json(response.choices[0].message.content)
```

Only models marked "Structured outputs: Yes" in the catalog accept `response_format`. Also describe the schema in the prompt so the model fills it sensibly.

### Image generation

```python
import base64

response = client.images.generate(
    model="black-forest-labs/FLUX.2-dev",
    prompt="A serene Japanese garden at sunset, watercolor style",
    steps=20,
    response_format="base64",
)
with open("garden.png", "wb") as f:
    f.write(base64.b64decode(response.data[0].b64_json))
```

With the default `url` response, download the image with a non-empty `User-Agent` header or the CDN answers 403. Stable Diffusion XL is gone; use a FLUX or other model from the catalog's image table.

### Embeddings

The serverless catalog currently lists no embedding or rerank models, and the old `togethercomputer/m2-bert-*` and BGE IDs are retired. Embedding and rerank models run only on dedicated endpoints (https://docs.together.ai/docs/dedicated-endpoints/models); for serverless embeddings use another provider.

### Fine-tuning

```python
train_file = client.files.upload(file="support_chats.jsonl", purpose="fine-tune", check=True)

# wait until client.files.retrieve(train_file.id).processing_status == "COMPLETED"

job = client.fine_tuning.create(
    training_file=train_file.id,
    model="Qwen/Qwen3.5-9B",   # pick a base from the fine-tuning supported-models page
    lora=True,                 # False = full fine-tuning
    n_epochs=3,
    learning_rate=1e-5,
    suffix="support-bot",
)
print(job.id)
print(client.fine_tuning.retrieve(job.id).status)
```

States run `pending, queued, running, uploading, completed`. The same job from the shell: `tg fine-tuning create --training-file file-... --model Qwen/Qwen3.5-9B --lora --n-epochs 3`, then `tg fine-tuning retrieve ft-...` (log in with `tg login`). Each `create` call starts a billed job, so list existing jobs before retrying after an error.

Conversational training data is JSONL, one conversation per line:

```json
{"messages": [{"role": "system", "content": "You are a support agent."}, {"role": "user", "content": "How do I reset my password?"}, {"role": "assistant", "content": "Open Settings > Security and choose Reset Password."}]}
```

## Examples

**Request:** "Summarize this changelog with an open model and print it as it streams."
Use the streaming snippet with a current chat model from the catalog; the summary prints token by token.

**Request:** "Extract name, amount and due date from these invoices as JSON."
Define a Pydantic model, pass its schema in `response_format` as above, and parse with `model_validate_json`; a model without structured-output support returns a 400, in which case pick another from the catalog.

## Guidelines

- Check the deprecations page before pinning a model ID; removed models return errors, and some IDs silently redirect to a newer version.
- Prices and context lengths are per model and change; read them from the catalog instead of assuming "cheaper than proprietary APIs".
- Keep the key in `TOGETHER_API_KEY`; never commit it or send it to a browser.
- Handle rate-limit (429) responses with backoff; the SDK retries twice by default.
- Fine-tuning and dedicated endpoints bill by usage or by the minute; confirm the price before launching and stop endpoints you no longer need.
