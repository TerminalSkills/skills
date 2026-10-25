---
name: guidance
description: >-
  Guidance is Microsoft's open-source Python library for controlling LLM output with constrained generation: you interleave text, control flow, regex, select() choices and JSON schemas, and the model can only emit tokens that fit. Use when a user needs guaranteed-valid JSON, classification into fixed labels, regex-shaped fields or a custom grammar from a local model (Transformers, llama.cpp), or asks for "guidance", "constrained decoding" or "structured output" without retry loops.
license: Apache-2.0
compatibility: "Python 3.10+; pip install guidance; full constraint support needs a local backend (Transformers, llama.cpp, ONNX Runtime GenAI)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/guidance-ai/guidance"
  category: data-ai
  tags: "llm, constrained-generation, grammar, structured-output, json-schema"
---

# Guidance — Constrained LLM Generation

## Overview

Guidance (`guidance-ai/guidance`, version 0.3.x) constrains the token sampling itself, so output always matches a regex, a fixed list of options, a JSON schema or a context-free grammar. Model objects are immutable: `lm += ...` returns a new model with the text and any named captures. Backends: `Transformers`, `LlamaCpp`, `OnnxRuntimeGenAI`, `OpenAI`, Azure helpers (`create_azure_openai_model`, `create_azure_aifoundry_model`) and `Mock` for tests. Constraints are fully enforced only where the backend gives token-level control, i.e. local models; hosted APIs restrict what can be expressed.

## Instructions

### Install

```bash
pip install guidance          # backend packages (transformers, torch, llama-cpp-python) are installed separately
```

### Chat models: roles, capture, regex, select

```python
from guidance import system, user, assistant, gen, select
from guidance.models import Transformers

base = Transformers("microsoft/Phi-4-mini-instruct")   # downloads the model on first use

lm = base
with system():
    lm += "You classify product reviews."
with user():
    lm += 'Review: "The product arrived damaged but customer service was great"'
with assistant():
    lm += select(["positive", "negative", "mixed", "neutral"], name="sentiment")

print(lm["sentiment"])       # one of the four labels, nothing else is possible
```

`gen(regex=r"0\.\d{2}", name="confidence")` constrains a free-text field to a pattern; `gen(max_tokens=100, stop="\n")` bounds length. Read captures with `lm["name"]`.

### Guaranteed JSON from a Pydantic model or schema

```python
import json
from pydantic import BaseModel
from guidance import json as gen_json

class ProductReview(BaseModel):
    product_name: str
    rating: int
    pros: list[str]
    cons: list[str]
    recommendation: bool

lm = base
with user():
    lm += "Extract data: The XPS 15 has an amazing display and battery life, but runs hot. Would buy again."
with assistant():
    lm += gen_json(name="review", schema=ProductReview)

review = ProductReview.model_validate_json(lm["review"])
```

`schema` accepts a Pydantic class or a JSON-schema dict. Use `model_config = dict(extra="forbid")` on the Pydantic class for strict objects.

### Control flow and lists

Python `if`/`for` run between generations; f-strings can embed grammar pieces. `one_or_more` and `zero_or_more` (from `guidance`) add repetition to a grammar:

```python
lm = base
with user():
    lm += "Classify this message: 'Please restart the staging database'"
with assistant():
    lm += f"Type: {select(['question', 'command', 'chitchat'], name='kind')}"

if lm["kind"] == "command":
    with user():
        lm += "Write the shell command only."
    with assistant():
        lm += gen(name="command", stop="\n", max_tokens=80)
```

### Reusable grammar functions and offline testing

Mark functions with `@guidance` (add `stateless=True` to compose them into a grammar). Debug constraints without a model:

```python
from guidance import gen, select
from guidance.models import Mock

grammar = "Sentiment: " + select(["positive", "negative", "mixed"], name="sentiment") + "\nScore: " + gen(regex=r"0\.\d{2}", name="score")
assert grammar.match("Sentiment: mixed\nScore: 0.82") is not None
assert grammar.match("Sentiment: great\nScore: 0.82") is None

lm = Mock(b"<s>Sentiment: mixed\nScore: 0.82") + grammar
print(lm["sentiment"], lm["score"])     # mixed 0.82
```

## Examples

### "Tag support tickets with a priority and a due-date format"

```python
lm = base
with user():
    lm += "Ticket: 'Checkout page returns 500 for all EU customers since 14:00'"
with assistant():
    lm += "Priority: " + select(["P1", "P2", "P3"], name="priority")
    lm += "\nDue: " + gen(regex=r"20\d{2}-\d{2}-\d{2}", name="due")
```

Result: `lm["priority"]` is `P1`, `P2` or `P3`, and `lm["due"]` always looks like `2026-10-21`; no parsing or retry is needed.

### "Extract an invoice into typed JSON"

```python
class Invoice(BaseModel):
    vendor: str
    total_eur: float
    paid: bool

with user():
    lm += "Invoice text: Hetzner Online GmbH, total 41.65 EUR, status: paid"
with assistant():
    lm += gen_json(name="invoice", schema=Invoice)
```

Result: `{"vendor": "Hetzner Online GmbH", "total_eur": 41.65, "paid": true}`, valid against `Invoice` by construction (content correctness still depends on the model).

## Guidelines

- Valid format does not mean correct content: constraints guarantee syntax, not facts. Validate semantics separately.
- Use `select()` for classification and `regex=` for IDs, dates and numbers; always give `gen()` a `max_tokens` or `stop` when the field is free text.
- Prefer a local backend for hard guarantees; with `models.OpenAI` only the constraints the API can honor are available, so test your grammar before relying on it.
- Use the chat roles (`system()`, `user()`, `assistant()`) with instruct models so the chat template is applied correctly; raw f-string prompts suit base models.
- Models are immutable: assign the result (`lm = lm + ...` or `lm += ...`) and start each independent request from the base model object.
- Test grammars offline with `grammar.match(...)` and `Mock`, which needs no GPU or API key.
- Overly tight constraints (a regex the model finds very unlikely) can produce odd text; loosen them or improve the prompt.
