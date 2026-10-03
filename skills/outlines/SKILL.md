---
name: outlines
description: >-
  Generates guaranteed-valid structured text from LLMs with Outlines, the Python library that constrains token sampling to a JSON schema, regex, choice list or grammar. Use when a user asks for reliable JSON from a local or hosted model, classification into fixed labels, regex-shaped output, grammar-constrained generation, or structured output with vLLM, Transformers, Ollama or OpenAI-compatible servers.
license: Apache-2.0
compatibility: "Python 3.10 to 3.13; install the extra for the backend you use (transformers, vllm, ollama, openai, llamacpp)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["llm", "structured-generation", "json", "grammar", "regex"]
  repository: https://github.com/dottxt-ai/outlines
---

# Outlines — Structured Text Generation

## Overview

Outlines forces a model's output to match a declared type. For local backends it compiles the type (Pydantic model, regex, choice list, context-free grammar) into a constraint on token sampling, so the first generation is already valid and no retry loop is needed. For hosted backends (OpenAI, Anthropic, Gemini, Ollama, vLLM server) it passes the type to the provider's own structured-output feature through one common interface.

Checked against Outlines 1.3 (October 2026). The 1.x API is `model(prompt, output_type)`. The 0.x calls (`outlines.generate.json(...)`, `outlines.models.transformers(...)`, `outlines.generate.regex(...)`) were removed; code using them fails on current versions.

## Instructions

### Installation and model loading

```bash
pip install "outlines[transformers]"     # local Hugging Face models (also pulls torch)
pip install "outlines[ollama]"           # or: openai, anthropic, gemini, llamacpp, vllm, mlxlm
```

```python
import outlines
from transformers import AutoModelForCausalLM, AutoTokenizer

name = "microsoft/Phi-3-mini-4k-instruct"
model = outlines.from_transformers(
    AutoModelForCausalLM.from_pretrained(name),
    AutoTokenizer.from_pretrained(name),
)
```

Other loaders: `outlines.from_ollama(client, "llama3.2")`, `outlines.from_openai(client, model_name)`, `outlines.from_vllm(openai_client, model_name)` for a running vLLM server (OpenAI client pointed at `http://127.0.0.1:8000/v1`), `outlines.from_vllm_offline(llm)`, `outlines.from_llamacpp(llm)`, plus `from_anthropic`, `from_gemini`, `from_mistral`, `from_sglang`, `from_tgi`, `from_mlxlm`.

### Output types

The second argument of the call is the constraint. Always pass `max_new_tokens` on the Transformers backend: the default of 20 truncates JSON.

```python
from enum import Enum
from typing import Literal
from pydantic import BaseModel, Field
from outlines.types import Regex, Choice, CFG

class ReviewAnalysis(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    score: float = Field(ge=0, le=1)
    topics: list[str]

raw = model("Analyze: 'Great product, slow shipping'", ReviewAnalysis, max_new_tokens=200)
review = ReviewAnalysis.model_validate_json(raw)     # the call returns a JSON string

phone = model("Support phone number:", Regex(r"\(\d{3}\) \d{3}-\d{4}"), max_new_tokens=20)
label = model("Is this spam? 'You won $1000000!!!'", Choice(["spam", "ham", "uncertain"]))
count = model("How many minutes in an hour?", int, max_new_tokens=5)
```

Also accepted: `Literal[...]`, `Enum` classes, plain types (`int`, `float`, `bool`, `datetime.date`), `JsonSchema(schema_string)`, and `CFG(lark_grammar_string)` for a Lark grammar (not every backend supports CFG).

### Batches and reuse

```python
answers = model.batch(["Capital of Lithuania?", "Capital of Latvia?"], max_new_tokens=20)

generator = outlines.Generator(model, ReviewAnalysis)   # compile the constraint once
raw = generator("Analyze: 'Arrived broken'", max_new_tokens=200)
```

## Examples

### Example 1: Classify support tickets into fixed labels

Request: "Sort these tickets into billing, bug or feature, nothing else."

```python
tickets = ["I was charged twice in September", "Export button does nothing on Safari"]
labels = Choice(["billing", "bug", "feature"])
print(model.batch([f"Ticket: {t}\nCategory:" for t in tickets], labels, max_new_tokens=8))
```

Result: `['billing', 'bug']`. The output can only be one of the three strings, so no post-processing is needed.

### Example 2: Extract a typed record with a local server

Request: "Get name, city and plan from this signup email using our vLLM server."

```python
import openai, outlines
from pydantic import BaseModel

class Signup(BaseModel):
    name: str
    city: str
    plan: str

client = openai.OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="local-vllm-key")
model = outlines.from_vllm(client, "microsoft/Phi-3-mini-4k-instruct")
raw = model("Priya Nair from Pune signed up for the Growth plan.", Signup)
print(Signup.model_validate_json(raw))
```

Result: `Signup(name='Priya Nair', city='Pune', plan='Growth')`, validated against the schema.

## Guidelines

- Constrained output guarantees the shape, not the truth: a valid JSON object can still hold a wrong answer. Keep prompts specific and check values that matter.
- Complex schemas and large grammars add compile time on the first call; reuse a `Generator` rather than recompiling.
- Backend support differs (for example CFG and some regex features); the model documentation page for each backend lists what it accepts.
- Python 3.14 is not supported yet by the current release.
- If you already use PydanticAI or a provider's native structured outputs against a hosted model, you may not need Outlines; its strength is local and self-hosted models.
- Never send private text to a hosted backend you have not approved; local backends keep data on the machine.
