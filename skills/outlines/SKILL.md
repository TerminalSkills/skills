---
name: outlines
description: >-
  You are an expert in Outlines, the Python library for reliable structured
  text generation with LLMs. You help developers generate guaranteed-valid
  JSON, regex-matching text, and grammar-constrained output from open-source
  models — using finite state machine guided generation that constrains the
  token sampling process to produce only valid output on the first try.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - llm
    - structured-generation
    - json
    - grammar
    - regex
    - constrained
---

# Outlines — Structured Text Generation

You are an expert in Outlines, the Python library for reliable structured text generation with LLMs. You help developers generate guaranteed-valid JSON, regex-matching text, and grammar-constrained output from open-source models — using finite state machine guided generation that constrains the token sampling process to produce only valid output on the first try.

## Core Capabilities

### Structured Generation

```python
import outlines
from pydantic import BaseModel, Field
from enum import Enum

# Load model
model = outlines.models.transformers("meta-llama/Llama-3.1-8B-Instruct")

# JSON generation with Pydantic schema
class Sentiment(str, Enum):
    positive = "positive"
    negative = "negative"
    neutral = "neutral"

class ReviewAnalysis(BaseModel):
    sentiment: Sentiment
    score: float = Field(ge=0, le=1)
    topics: list[str] = Field(min_length=1, max_length=5)
    summary: str = Field(max_length=200)

generator = outlines.generate.json(model, ReviewAnalysis)

result = generator(
    "Analyze this review: 'Great product, fast shipping, but packaging could be better'"
)
# result is a validated ReviewAnalysis instance — guaranteed to match schema
print(result.sentiment)    # Sentiment.positive
print(result.score)        # 0.85
print(result.topics)       # ["product quality", "shipping", "packaging"]

# Regex-constrained generation
phone_gen = outlines.generate.regex(model, r"\(\d{3}\) \d{3}-\d{4}")
phone = phone_gen("Generate a US phone number:")
# phone = "(415) 555-0123" — always matches the regex

# Choice (classification)
classifier = outlines.generate.choice(model, ["spam", "ham", "uncertain"])
result = classifier("Is this spam? 'You won $1000000!!!'")
# result = "spam"

# Format-constrained (date, number, etc.)
date_gen = outlines.generate.format(model, datetime.date)
date = date_gen("When was Python created?")
# date = datetime.date(1991, 2, 20) — always a valid date object
```

### Batch Processing

```python
# Batch inference for throughput
generator = outlines.generate.json(model, ReviewAnalysis)

reviews = [
    "Amazing quality, will buy again!",
    "Terrible customer service, never ordering here.",
    "It's okay, nothing special.",
]

prompts = [f"Analyze: '{r}'" for r in reviews]
results = generator(prompts, max_tokens=200)
# results is a list of ReviewAnalysis objects — all guaranteed valid
```

### Grammar-Constrained

```python
# Custom grammar (CFG)
arithmetic_grammar = r"""
    ?start: expression
    ?expression: term (("+" | "-") term)*
    ?term: factor (("*" | "/") factor)*
    ?factor: NUMBER | "(" expression ")"
    NUMBER: /[0-9]+(\.[0-9]+)?/
"""

calc_gen = outlines.generate.cfg(model, arithmetic_grammar)
expr = calc_gen("Generate a math expression that equals 42:")
# expr = "(6 * 7)" — always valid arithmetic
```

### With vLLM

```python
# Use with vLLM for production throughput
model = outlines.models.vllm("meta-llama/Llama-3.1-8B-Instruct",
    tensor_parallel_size=1, gpu_memory_utilization=0.9)

generator = outlines.generate.json(model, ReviewAnalysis)
# Combines Outlines' constrained generation with vLLM's batching + PagedAttention
```

## Installation

```bash
pip install outlines
```

## Best Practices

1. **Pydantic schemas** — Define output with Pydantic models; Outlines compiles to FSM for guaranteed compliance
2. **Regex for patterns** — Use `generate.regex()` for dates, emails, IDs; output always matches the pattern
3. **Choice for classification** — Use `generate.choice()` instead of free text; constrained to exact options
4. **vLLM for production** — Combine with vLLM backend for high-throughput constrained generation
5. **Batch for efficiency** — Pass lists of prompts; Outlines batches efficiently with the model
6. **Field constraints** — Use Pydantic's `ge`, `le`, `min_length`, `max_length`; further constrains output
7. **Grammar for DSLs** — Use CFG grammars for domain-specific output (SQL, code, formulas)
8. **First-try guarantee** — Unlike retry-based approaches, Outlines gets valid output on the first generation
