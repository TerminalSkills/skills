---
name: google-ai-studio
description: >-
  Google AI Studio and the Gemini API give programmatic access to Gemini models for multimodal
  (text, image, video, audio, PDF) generation, long context, structured JSON output, function
  calling and Google Search grounding. Use when asked to "call Gemini from Python or Node",
  "get a Gemini API key", "analyze a PDF or image with Gemini", "return JSON from Gemini", or
  "migrate from google-generativeai to google-genai".
license: Apache-2.0
compatibility: "Python 3.9+ with google-genai, or Node.js 18+ with @google/genai; a Gemini API key from aistudio.google.com"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["google", "gemini", "multimodal", "long-context", "ai"]
  repository: https://github.com/googleapis/python-genai
  use-cases:
    - "Analyze images, PDFs, and video files with Gemini's multimodal capabilities"
    - "Process very long documents with Gemini's long context window"
    - "Build structured data extractors with Gemini JSON response schemas"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Google AI Studio — Gemini API

## Overview

Google AI Studio is the web playground and API-key console for the Gemini API. In code you use the **Google Gen AI SDK**: `google-genai` for Python and `@google/genai` for JavaScript/TypeScript. The older `google-generativeai` (Python) and `@google/generative-ai` (JS) packages are deprecated since 30 November 2025 and no longer maintained, so do not start new code on them. Code written as `genai.configure(...)` / `genai.GenerativeModel(...)` belongs to the old SDK and must be ported (see Migration).

The API supports multimodal input, long context, streaming, structured output, function calling, Google Search grounding, file uploads and embeddings. Google also ships a newer Interactions API (`client.interactions.create`); `client.models.generate_content` remains the stable, widely documented entry point and is used below.

## Setup

```bash
pip install google-genai        # Python
npm install @google/genai       # Node.js
export GEMINI_API_KEY=your-key-from-aistudio   # GOOGLE_API_KEY also works
```

Create the key at https://aistudio.google.com/apikey. `genai.Client()` with no arguments reads the environment variable. If both `GEMINI_API_KEY` and `GOOGLE_API_KEY` are set, the SDK warns and prefers `GOOGLE_API_KEY`. Keep keys out of source control and never ship one in browser code.

## Choosing a model

Model IDs and limits change every few months and old generations are retired or restricted to existing users. Before hard-coding an ID, read https://ai.google.dev/gemini-api/docs/models. The SDK README uses the alias `gemini-flash-latest` (always the newest Flash model), which is a safe default for prototypes; pin an exact stable ID in production so a model update cannot change behaviour. Gemini 1.5 and 2.0 IDs found in older tutorials are no longer the recommended choice.

| Need | Pick |
|---|---|
| Fast, cheap, high volume | A current Flash or Flash-Lite model |
| Hardest reasoning and coding | The current Pro model (often listed as preview) |
| Text embeddings | `gemini-embedding-001` (text only) or `gemini-embedding-2` (multimodal) |

## Instructions

### Basic generation and chat

```python
from google import genai
from google.genai import types

client = genai.Client()  # reads GEMINI_API_KEY

response = client.models.generate_content(
    model="gemini-flash-latest",
    contents="Explain neural networks in one paragraph.",
    config=types.GenerateContentConfig(
        system_instruction="You are a Python expert. Always show working code.",
        temperature=0.3,
    ),
)
print(response.text)

chat = client.chats.create(model="gemini-flash-latest")
print(chat.send_message("How do I read a CSV with pandas?").text)
print(chat.send_message("Now filter rows where age > 30.").text)
```

### Streaming

```python
for chunk in client.models.generate_content_stream(
    model="gemini-flash-latest",
    contents="Write a 200-word story about a lighthouse keeper.",
):
    print(chunk.text, end="", flush=True)
```

### Images and PDFs

Small inputs go inline as `types.Part.from_bytes`; larger ones go through the File API.

```python
import pathlib

image = types.Part.from_bytes(
    data=pathlib.Path("dashboard.png").read_bytes(), mime_type="image/png"
)
r = client.models.generate_content(
    model="gemini-flash-latest",
    contents=["List all visible text and the three largest numbers.", image],
)
print(r.text)

# File API: required when the whole request would exceed 100 MB (PDFs: 50 MB)
report = client.files.upload(file="annual-report-2025.pdf")
r = client.models.generate_content(
    model="gemini-flash-latest",
    contents=["Summarize the key financial metrics.", report],
)
print(r.text)
```

Uploaded files are stored for 48 hours (up to 2 GB per file, 20 GB per project) and can be deleted earlier with `client.files.delete(name=report.name)`.

### Structured output

Pass a Pydantic model (or a JSON Schema via `response_json_schema`) and set the JSON MIME type. `response.parsed` returns the model instance.

```python
from pydantic import BaseModel

class Company(BaseModel):
    name: str
    founded: int
    country: str

r = client.models.generate_content(
    model="gemini-flash-latest",
    contents="List 3 major AI companies with founding year and country.",
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=list[Company],
    ),
)
for company in r.parsed:
    print(company.name, company.founded, company.country)
```

### Function calling

Passing a plain Python function with type hints and a docstring enables automatic function calling: the SDK calls it and returns the final text.

```python
def get_order_status(order_id: str) -> dict:
    """Look up the shipping status of an order by its ID."""
    return {"order_id": order_id, "status": "shipped", "eta": "2026-10-09"}

r = client.models.generate_content(
    model="gemini-flash-latest",
    contents="Where is order A-10432?",
    config=types.GenerateContentConfig(tools=[get_order_status]),
)
print(r.text)
```

The SDK warns that automatic function calling behaviour will change in SDK 3.0; if you rely on it, pin `google-genai<3`.

### Grounding with Google Search

```python
r = client.models.generate_content(
    model="gemini-flash-latest",
    contents="Who won the most recent Formula 1 race?",
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    ),
)
print(r.text)
meta = r.candidates[0].grounding_metadata
if meta:
    print(meta.web_search_queries)
    for chunk in meta.grounding_chunks or []:
        print(chunk.web.title, chunk.web.uri)
```

If you display grounded answers to end users, the terms require showing the search suggestions in `meta.search_entry_point`. Grounding is billed separately from tokens; check the pricing page.

### Long context

Flash and Pro models accept up to roughly a million tokens. Count before you send, then pass the text as one `contents` string.

```python
import pathlib

code = "\n\n".join(
    f"# File: {p}\n{p.read_text()}" for p in pathlib.Path("src").rglob("*.py")
)
n = client.models.count_tokens(model="gemini-flash-latest", contents=code)
print(n.total_tokens)
r = client.models.generate_content(
    model="gemini-flash-latest",
    contents=["Find security vulnerabilities in this codebase:", code],
)
print(r.text)
```

### Embeddings

```python
r = client.models.embed_content(
    model="gemini-embedding-001",
    contents=["Machine learning transforms industries.", "Hello world"],
    config=types.EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT", output_dimensionality=768
    ),
)
vectors = [e.values for e in r.embeddings]
print(len(vectors), len(vectors[0]))   # 2 768
```

The default dimension is 3072 (adjustable from 128 to 3072). Dimensions below 3072 must be normalized by you for `gemini-embedding-001`. `task_type` values include `RETRIEVAL_DOCUMENT`, `RETRIEVAL_QUERY`, `SEMANTIC_SIMILARITY` and `CLASSIFICATION`; `gemini-embedding-2` instead takes the task as an instruction in the prompt text and returns one aggregated embedding for several inputs.

### Node.js

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: "Explain event loops in two sentences.",
});
console.log(response.text);
```

## Migration from google-generativeai

| Old | New |
|---|---|
| `pip install google-generativeai` | `pip install google-genai` |
| `import google.generativeai as genai` | `from google import genai` and `from google.genai import types` |
| `genai.configure(api_key=...)` | `client = genai.Client(api_key=...)` |
| `genai.GenerativeModel(name).generate_content(x)` | `client.models.generate_content(model=name, contents=x)` |
| `generation_config={...}`, `tools=`, `system_instruction=` on the model | all go in `config=types.GenerateContentConfig(...)` |
| `model.start_chat()` | `client.chats.create(model=...)` |
| `genai.upload_file(path=...)` | `client.files.upload(file=...)` |
| `genai.embed_content(...)` | `client.models.embed_content(...)` |

## Examples

### Example 1: Extract invoice data from a PDF

User: "Pull vendor, total and due date out of invoice-8841.pdf as JSON."

```python
class Invoice(BaseModel):
    vendor: str
    total: float
    due_date: str

pdf = client.files.upload(file="invoice-8841.pdf")
r = client.models.generate_content(
    model="gemini-flash-latest",
    contents=["Extract the invoice fields.", pdf],
    config=types.GenerateContentConfig(
        response_mime_type="application/json", response_schema=Invoice
    ),
)
print(r.parsed)
```

Result: `vendor='Northwind Traders' total=1842.5 due_date='2026-10-31'`.

### Example 2: Port old code

User: "This script uses google.generativeai and fails with a deprecation warning, fix it."

Replace the import, build a `Client`, move `generation_config` into `types.GenerateContentConfig`, and call `client.models.generate_content(model=..., contents=...)`. Run the script once and confirm the response text prints.

## Guidelines

- Use `google-genai`, not `google-generativeai`; tutorials showing `genai.configure` are outdated.
- Pin an exact model ID in production; aliases such as `gemini-flash-latest` move without notice.
- Free-tier rate limits are not published as fixed numbers; read your project's limits in AI Studio and expect 429 errors under load. Add retry with backoff.
- On the free tier, Google may use prompts and responses to improve its products; use a billed project for private or customer data.
- Check `response.candidates[0].finish_reason` and `response.prompt_feedback`: safety filters can return empty text.
- Thinking models spend extra tokens on reasoning; control it with `types.ThinkingConfig` in the config.
- Do not put API keys in client-side code or commit them.
