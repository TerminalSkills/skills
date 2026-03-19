---
name: azure-openai
description: >-
  Azure OpenAI Service — OpenAI models (GPT-4o, DALL-E 3, Whisper) on Azure
  infrastructure. Use when deploying OpenAI models with enterprise compliance
  (GDPR, HIPAA, SOC2), Azure-native auth via Managed Identity, content filtering,
  or VNET-isolated deployments. Same OpenAI API, hosted on Azure.
license: Apache-2.0
compatibility: "Python 3.9+ or Node.js 18+ with openai SDK >=1.0.0"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["azure-openai", "azure", "gpt-4", "enterprise", "microsoft"]
  use-cases:
    - "Deploy GPT-4o on Azure with enterprise compliance and data residency"
    - "Authenticate with Managed Identity — no API keys in code"
    - "Apply Azure Content Filtering to moderate LLM inputs and outputs"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Azure OpenAI Service

## Overview

Azure OpenAI Service provides OpenAI's models (GPT-4o, GPT-4o mini, DALL-E 3, Whisper) hosted on Microsoft Azure infrastructure. It offers enterprise features: Managed Identity authentication (no API keys), VNET integration, Azure Policy compliance, content filtering, abuse monitoring, and regional data residency. Uses the same `openai` Python/TS SDK — just point it at your Azure endpoint.

## Azure vs OpenAI Direct

| Feature | OpenAI (direct) | Azure OpenAI |
|---|---|---|
| Auth | API Key | API Key or Managed Identity |
| Data residency | US primarily | Any Azure region |
| Enterprise compliance | Limited | SOC2, HIPAA, ISO 27001 |
| Content filtering | ❌ | ✅ Configurable |
| VNET isolation | ❌ | ✅ Private endpoints |
| Deployment control | Shared | Your own deployments |
| Fine-tuning | ✅ | ✅ |
| Latency to Azure services | Higher | Lower (co-located) |

## Setup

```bash
pip install openai azure-identity  # azure-identity for Managed Identity
```

```bash
# API Key auth (dev/test)
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com/

# Deployment names (you set these when deploying models in Azure Portal)
export AZURE_OPENAI_DEPLOYMENT=gpt-4o  # Your deployment name
```

## Instructions

### Basic Chat with API Key

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="your_azure_openai_api_key",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-10-21",  # Check docs for latest stable version
)

response = client.chat.completions.create(
    model="gpt-4o",  # This is your DEPLOYMENT NAME, not the model name
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is Azure OpenAI Service?"},
    ],
    max_tokens=1024,
    temperature=0.7,
)

print(response.choices[0].message.content)
```

### Managed Identity Auth (No API Keys)

```python
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

# DefaultAzureCredential works with:
# - Managed Identity (in Azure VM, AKS, App Service, Functions)
# - Azure CLI (local development)
# - Visual Studio / VS Code credentials
credential = DefaultAzureCredential()
token_provider = get_bearer_token_provider(
    credential,
    "https://cognitiveservices.azure.com/.default"
)

client = AzureOpenAI(
    azure_endpoint="https://my-resource.openai.azure.com/",
    azure_ad_token_provider=token_provider,
    api_version="2024-10-21",
)

response = client.chat.completions.create(
    model="gpt-4o",  # deployment name
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

### TypeScript / Node.js

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { "api-version": "2024-10-21" },
  defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY },
});

const response = await client.chat.completions.create({
  model: process.env.AZURE_OPENAI_DEPLOYMENT!,
  messages: [{ role: "user", content: "Explain TypeScript generics." }],
});

console.log(response.choices[0].message.content);
```

### Streaming

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="...",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-10-21",
)

stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a sonnet about cloud computing."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

### Function Calling

```python
import json
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="...",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-10-21",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_azure_resource_cost",
            "description": "Get the cost of an Azure resource for the current month",
            "parameters": {
                "type": "object",
                "properties": {
                    "resource_group": {"type": "string"},
                    "resource_name": {"type": "string"},
                },
                "required": ["resource_group", "resource_name"],
            },
        },
    }
]

messages = [{"role": "user", "content": "How much is my vm-prod01 costing this month?"}]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="auto",
)

if response.choices[0].finish_reason == "tool_calls":
    tool_call = response.choices[0].message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    print(f"Called: {tool_call.function.name} with {args}")

    messages.append(response.choices[0].message)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps({"cost_usd": 142.53, "currency": "USD"}),
    })

    final = client.chat.completions.create(model="gpt-4o", messages=messages)
    print(final.choices[0].message.content)
```

### Image Generation with DALL-E 3

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="...",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-02-01",  # DALL-E uses a different API version
)

response = client.images.generate(
    model="dall-e-3",  # your DALL-E 3 deployment name
    prompt="A futuristic city skyline with solar panels, photorealistic, golden hour",
    size="1024x1024",
    quality="hd",
    n=1,
)

print(response.data[0].url)
print(f"Revised prompt: {response.data[0].revised_prompt}")
```

### Speech-to-Text with Whisper

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="...",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-06-01",
)

with open("recording.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper",  # your Whisper deployment name
        file=audio_file,
        language="en",
        response_format="text",
    )

print(transcript)
```

### Embeddings

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key="...",
    azure_endpoint="https://my-resource.openai.azure.com/",
    api_version="2024-10-21",
)

response = client.embeddings.create(
    model="text-embedding-3-large",  # deployment name
    input=["The quick brown fox", "Jumps over the lazy dog"],
)

for item in response.data:
    print(f"Embedding {item.index}: {len(item.embedding)} dims")
```

### Deployment vs Model Name

A critical Azure OpenAI concept: **deployments** are your named instances of a model:

```
Azure Portal:
  Resource: my-openai-resource
  Deployments:
    - Name: "gpt-4o"          → Model: gpt-4o (2024-11-20)
    - Name: "gpt-4o-mini"     → Model: gpt-4o-mini (2024-07-18)
    - Name: "text-embed-large" → Model: text-embedding-3-large
```

In code, `model=` takes the **deployment name** you configured, not the OpenAI model name.

### Content Filtering Configuration

Content filters are configured in Azure Portal under your deployment settings:
- **Hate, Violence, Sexual, Self-harm** — each configurable (low/medium/high threshold)
- **Prompt injection protection** — detects jailbreak attempts
- **Custom blocklists** — add domain-specific blocked terms

```python
# When content is filtered, the API returns an error:
from openai import AzureOpenAI, BadRequestError

client = AzureOpenAI(...)

try:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "user_input"}],
    )
except BadRequestError as e:
    if e.code == "content_filter":
        print(f"Content filtered: {e.error.innererror}")
```

## Guidelines

- Use **Managed Identity** in production (AKS, App Service, Functions) — never store API keys in code.
- Each **deployment** is a separate Azure resource with its own quota and settings.
- Pin `api_version` to a stable version — latest is not always most stable.
- Azure Content Filtering is always on by default — configure thresholds per deployment.
- For HIPAA compliance, ensure your Azure subscription has a Business Associate Agreement (BAA).
- VNET private endpoints prevent traffic from leaving your Azure network — required for strict isolation.
- Monitor usage and costs with Azure Monitor and set budget alerts on the Cognitive Services resource.
