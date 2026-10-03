---
name: azure-openai
description: >-
  Azure OpenAI is Microsoft's hosted service for OpenAI models (GPT, gpt-image,
  Whisper, embeddings) on Azure infrastructure. Use when calling OpenAI models
  through Azure, authenticating with Managed Identity or Entra ID, setting up
  content filters, or deploying with enterprise compliance, regional data
  residency or private networking.
license: Apache-2.0
compatibility: "Python or Node.js with the openai SDK (v1 API needs a recent release); Azure subscription with a model deployment"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["azure-openai", "azure", "openai", "enterprise", "microsoft"]
  repository: https://github.com/openai/openai-python
  use-cases:
    - "Deploy GPT models on Azure with enterprise compliance and data residency"
    - "Authenticate with Managed Identity — no API keys in code"
    - "Apply Azure Content Filtering to moderate LLM inputs and outputs"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Azure OpenAI Service

## Overview

Azure OpenAI hosts OpenAI models on Microsoft Azure (now part of Microsoft Foundry). It adds enterprise features: Entra ID and Managed Identity auth, private endpoints, regional data residency, configurable content filtering and Azure RBAC.

Since August 2025 there is a **v1 API**: you use the plain `OpenAI` client with `base_url` set to `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/`, with no `api-version` parameter and no Azure-specific client. Microsoft recommends the Responses API for Azure OpenAI models; chat completions, embeddings, images and audio also work. The older `AzureOpenAI` client with dated `api_version` strings still works and is what many tutorials show.

## Azure vs OpenAI direct

| Feature | OpenAI direct | Azure OpenAI |
|---|---|---|
| Auth | API key | API key, Entra ID, Managed Identity |
| Model name in calls | model name | **your deployment name** |
| Data residency | Limited | Choose region or data zone |
| Network isolation | No | Private endpoints, VNET |
| Content filtering | Moderation endpoint | Built-in, configurable per deployment |
| Quota | Per org | Per deployment and region |

## Instructions

### Setup

```bash
pip install openai azure-identity      # Node: npm install openai @azure/identity
export AZURE_OPENAI_API_KEY="..."      # from the resource's Keys and Endpoint page
export AZURE_OPENAI_ENDPOINT="https://northwind-ai.openai.azure.com"
```

Create a model deployment first (portal or CLI); its **name** is what you pass as `model`.

### Chat and Responses with an API key (v1 API)

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    base_url=f"{os.environ['AZURE_OPENAI_ENDPOINT']}/openai/v1/",
)

resp = client.responses.create(model="gpt-4.1-mini", input="What is Azure OpenAI Service?")
print(resp.output_text)

chat = client.chat.completions.create(
    model="gpt-4.1-mini",   # deployment name
    messages=[{"role": "user", "content": "Summarise RBAC in one sentence."}],
)
print(chat.choices[0].message.content)
```

Setting `OPENAI_BASE_URL` and `OPENAI_API_KEY` lets you call `OpenAI()` with no arguments.

### Entra ID / Managed Identity (no keys)

```python
from openai import OpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

token_provider = get_bearer_token_provider(DefaultAzureCredential(), "https://ai.azure.com/.default")
client = OpenAI(base_url="https://northwind-ai.openai.azure.com/openai/v1/", api_key=token_provider)
```

`DefaultAzureCredential` uses Managed Identity on Azure (VM, AKS, App Service, Functions) and `az login` locally. Assign the identity the **Cognitive Services OpenAI User** role on the resource. The client refreshes tokens automatically.

### TypeScript / Node.js

```typescript
import OpenAI from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

const client = new OpenAI({
  baseURL: "https://northwind-ai.openai.azure.com/openai/v1/",
  apiKey: getBearerTokenProvider(new DefaultAzureCredential(), "https://ai.azure.com/.default"),
});
// key auth: apiKey: process.env.AZURE_OPENAI_API_KEY

const res = await client.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Explain TypeScript generics." }],
});
console.log(res.choices[0].message.content);
```

### Streaming

```python
stream = client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{"role": "user", "content": "Write a sonnet about cloud computing."}],
    stream=True,
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

Guard `chunk.choices`: Azure can send an initial chunk with an empty list while content filter results arrive.

### Function calling

```python
import json

tools = [{
    "type": "function",
    "function": {
        "name": "get_azure_resource_cost",
        "description": "Get this month's cost of an Azure resource",
        "parameters": {
            "type": "object",
            "properties": {"resource_group": {"type": "string"}, "resource_name": {"type": "string"}},
            "required": ["resource_group", "resource_name"],
        },
    },
}]
messages = [{"role": "user", "content": "How much is vm-prod01 costing this month?"}]
response = client.chat.completions.create(model="gpt-4.1-mini", messages=messages, tools=tools)

msg = response.choices[0].message
if msg.tool_calls:
    call = msg.tool_calls[0]
    print(call.function.name, json.loads(call.function.arguments))
    messages += [msg, {"role": "tool", "tool_call_id": call.id,
                       "content": json.dumps({"cost_usd": 142.53})}]
    final = client.chat.completions.create(model="gpt-4.1-mini", messages=messages)
    print(final.choices[0].message.content)
```

### Image generation (gpt-image)

DALL-E 3 was retired on 2026-03-04; use a `gpt-image-*` deployment. These models always return base64.

```python
import base64

result = client.images.generate(
    model="gpt-image-1.5",   # your gpt-image deployment name
    prompt="A futuristic city skyline with solar panels, golden hour",
    size="1024x1024", quality="high", n=1,
)
open("skyline.png", "wb").write(base64.b64decode(result.data[0].b64_json))
```

Sizes: `1024x1024`, `1024x1536`, `1536x1024`; quality `low`, `medium`, `high`.

### Whisper and embeddings

```python
with open("standup-recording.mp3", "rb") as f:
    text = client.audio.transcriptions.create(model="whisper", file=f, language="en", response_format="text")

emb = client.embeddings.create(model="text-embedding-3-large", input=["invoice overdue", "payment received"])
print(len(emb.data[0].embedding))
```

`model` is the deployment name in both calls. Embedding input arrays are capped at 2,048 items.

### Content filtering

Every deployment has a default filter: violence, hate, sexual and self-harm at medium severity, on prompts and completions, plus Prompt Shields for jailbreaks and protected-material checks. Create custom filters in the Foundry portal (Guardrails + controls, Content filters) and attach them to a deployment, or send the `x-policy-id` header to pick one per request. Turning filters off for completions needs Microsoft approval.

```python
from openai import BadRequestError

try:
    client.chat.completions.create(model="gpt-4.1-mini", messages=[{"role": "user", "content": user_input}])
except BadRequestError as e:
    if e.code == "content_filter":
        print("Blocked by content filter:", e.message)
```

A filtered completion instead returns `finish_reason == "content_filter"`.

## Examples

### Example 1: Move a legacy AzureOpenAI app to the v1 API

Request: "Our code uses AzureOpenAI with api_version 2024-10-21; remove the version pinning."

Replace `AzureOpenAI(api_key=..., azure_endpoint=..., api_version=...)` with `OpenAI(api_key=..., base_url=f"{endpoint}/openai/v1/")`. Keep `model=` as the deployment name. Result: the same calls work, and new features arrive without bumping a version string.

### Example 2: Keyless access from AKS

Request: "Call GPT from our pod without storing an API key."

Enable workload identity or a managed identity for the pod, grant it **Cognitive Services OpenAI User** on the resource, and use the Entra ID snippet. Result: no secrets in config; `DefaultAzureCredential` fetches and refreshes tokens.

## Guidelines

- `model` is always the **deployment name**, which can differ from the model name.
- Models retire on a fixed schedule and calls then return `410 Gone`. As of October 2026 gpt-4o 2024-05-13 retires 2026-12-09, gpt-4o 2024-08-06 and gpt-4o-mini on 2027-04-14, gpt-image-1 preview 2026-10-23, and whisper 001 on 2026-12-15. Check the Model retirement schedule and plan to move to current models such as the gpt-4.1 and gpt-5 families; Standard deployments auto-upgrade, provisioned ones do not.
- Prefer Managed Identity in production; keep API keys out of code and rotate them if used.
- Each deployment has its own quota; 429 means throttling, so retry with backoff.
- For HIPAA workloads confirm your Azure agreements cover the service and region.
- Private endpoints keep traffic on your network and are needed for strict isolation.
- Monitor spend with Azure Monitor and budget alerts on the resource.
