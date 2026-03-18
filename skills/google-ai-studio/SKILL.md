---
name: google-ai-studio
description: >-
  Google AI Studio and Gemini API for multimodal AI. Use when you need multimodal
  AI (text + image + video + audio), long context up to 1M tokens, code generation
  with Gemini, grounding with Google Search, or structured output with response schemas.
license: Apache-2.0
compatibility: "Python 3.9+ with google-generativeai SDK, or Node.js 18+ with @google/generative-ai"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["google", "gemini", "multimodal", "long-context", "ai"]
  use-cases:
    - "Analyze images, PDFs, and video files with Gemini's multimodal capabilities"
    - "Process million-token documents with Gemini 1.5 Pro long context"
    - "Build structured data extractors with Gemini JSON response schemas"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Google AI Studio — Gemini API

## Overview

Google AI Studio provides access to the Gemini family of models via API. Gemini 2.0 Flash is Google's fastest model for high-frequency tasks; Gemini 1.5 Pro supports up to 1 million token context windows and handles images, audio, video, and PDFs natively. The API supports grounding with Google Search, structured JSON output, and streaming.

## Setup

```bash
# Python
pip install google-generativeai

# Node.js
npm install @google/generative-ai
```

```bash
export GOOGLE_API_KEY=AIza...
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Available Models

| Model | Context | Best For |
|---|---|---|
| `gemini-2.0-flash` | 1M tokens | Fast, cost-efficient, high-volume |
| `gemini-2.0-flash-thinking-exp` | 1M tokens | Complex reasoning with thoughts |
| `gemini-1.5-pro` | 2M tokens | Longest context, complex tasks |
| `gemini-1.5-flash` | 1M tokens | Balanced speed and capability |
| `text-embedding-004` | 2048 input | Text embeddings |

## Instructions

### Basic Text Generation

```python
import google.generativeai as genai

genai.configure(api_key="AIza...")  # or reads GOOGLE_API_KEY

model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content("Explain neural networks in one paragraph.")
print(response.text)
```

### Multi-Turn Chat

```python
import google.generativeai as genai

genai.configure(api_key="AIza...")

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    system_instruction="You are a Python expert. Always show working code examples.",
)

chat = model.start_chat()
response = chat.send_message("How do I read a CSV with pandas?")
print(response.text)

response = chat.send_message("Now show me how to filter rows where age > 30.")
print(response.text)
```

### Image Analysis

```python
import google.generativeai as genai
import PIL.Image

genai.configure(api_key="AIza...")

model = genai.GenerativeModel("gemini-2.0-flash")

# From local file
image = PIL.Image.open("screenshot.png")
response = model.generate_content(["What's in this image? List all visible text.", image])
print(response.text)

# From URL (inline data)
import httpx
import base64

img_data = httpx.get("https://example.com/chart.png").content
image_part = {"mime_type": "image/png", "data": base64.b64encode(img_data).decode()}
response = model.generate_content(["Analyze this chart:", image_part])
print(response.text)
```

### PDF Processing

```python
import google.generativeai as genai
import pathlib

genai.configure(api_key="AIza...")

model = genai.GenerativeModel("gemini-1.5-pro")

# Upload a PDF file
pdf_file = genai.upload_file(
    path="report.pdf",
    mime_type="application/pdf",
    display_name="Annual Report 2024",
)

response = model.generate_content([
    "Summarize the key financial metrics from this report.",
    pdf_file,
])
print(response.text)

# Inline PDF (smaller files)
pdf_bytes = pathlib.Path("document.pdf").read_bytes()
import base64
pdf_part = {"mime_type": "application/pdf", "data": base64.b64encode(pdf_bytes).decode()}
response = model.generate_content(["Extract all dates and deadlines:", pdf_part])
print(response.text)
```

### Streaming

```python
import google.generativeai as genai

genai.configure(api_key="AIza...")

model = genai.GenerativeModel("gemini-2.0-flash")

for chunk in model.generate_content("Write a short story about AI.", stream=True):
    print(chunk.text, end="", flush=True)
print()
```

### Structured Output with Response Schema

```python
import google.generativeai as genai
import json

genai.configure(api_key="AIza...")

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config={
        "response_mime_type": "application/json",
        "response_schema": {
            "type": "object",
            "properties": {
                "companies": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "founded": {"type": "integer"},
                            "country": {"type": "string"},
                        },
                        "required": ["name", "founded", "country"],
                    },
                }
            },
        },
    },
)

response = model.generate_content(
    "List 3 major AI companies with their founding year and country."
)
data = json.loads(response.text)
print(data)
```

### Grounding with Google Search

```python
import google.generativeai as genai
from google.generativeai import types

genai.configure(api_key="AIza...")

model = genai.GenerativeModel("gemini-2.0-flash")

# Enable Google Search grounding
response = model.generate_content(
    "What are the latest AI research papers published this week?",
    tools=[types.Tool(google_search=types.GoogleSearch())],
)

print(response.text)

# Check grounding metadata
if response.candidates[0].grounding_metadata:
    for source in response.candidates[0].grounding_metadata.search_entry_point or []:
        print(f"Source: {source}")
```

### Function Calling

```python
import google.generativeai as genai

genai.configure(api_key="AIza...")

def get_product_info(product_id: str) -> dict:
    """Simulated product lookup."""
    return {"id": product_id, "name": "Widget Pro", "price": 49.99, "in_stock": True}

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    tools=[get_product_info],  # Pass Python function directly!
)

chat = model.start_chat(enable_automatic_function_calling=True)
response = chat.send_message("What's the price and availability of product P123?")
print(response.text)
# Gemini automatically calls get_product_info("P123") and incorporates the result
```

### Long Context — Process Entire Codebase

```python
import google.generativeai as genai
import pathlib

genai.configure(api_key="AIza...")

model = genai.GenerativeModel("gemini-1.5-pro")  # 2M token context

# Read entire codebase into context
files = list(pathlib.Path("./src").rglob("*.py"))
code_content = "\n\n".join([
    f"# File: {f}\n{f.read_text()}" for f in files
])

response = model.generate_content([
    "Analyze this codebase and identify security vulnerabilities:",
    code_content,
])
print(response.text)
```

### Text Embeddings

```python
import google.generativeai as genai

genai.configure(api_key="AIza...")

# Single embedding
result = genai.embed_content(
    model="text-embedding-004",
    content="Machine learning transforms industries.",
    task_type="retrieval_document",
)
print(f"Embedding dim: {len(result['embedding'])}")  # 768

# Batch embeddings
texts = ["Hello world", "Machine learning", "AI systems"]
result = genai.embed_content(
    model="text-embedding-004",
    content=texts,
    task_type="retrieval_document",
)
embeddings = result["embedding"]  # List of 768-dim vectors
```

## Task Types for Embeddings

| Task Type | Use When |
|---|---|
| `retrieval_document` | Embedding documents to be retrieved |
| `retrieval_query` | Embedding search queries |
| `semantic_similarity` | Comparing text similarity |
| `classification` | Text classification tasks |

## Guidelines

- `gemini-2.0-flash` is the best default for most tasks — fast, cheap, and capable.
- Use `gemini-1.5-pro` only when you need >1M token context or maximum quality.
- Automatic function calling simplifies tool use — pass Python functions directly to `tools=`.
- Always specify `response_mime_type: "application/json"` with `response_schema` for structured output.
- Google Search grounding adds latency but ensures responses reflect current web information.
- The File API supports uploading files up to 2GB; uploaded files are retained for 48 hours.
- Rate limits on the free tier are low (~15 RPM) — use an API key with billing for production.
