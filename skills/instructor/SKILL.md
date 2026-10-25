---
name: instructor
description: >-
  Instructor is a Python and TypeScript library that returns validated, typed
  objects from LLM calls using Pydantic models or Zod schemas, with automatic
  retries when validation fails, streaming of partial objects, and support
  for OpenAI, Anthropic, Gemini and local models. Use when someone asks to
  extract structured data from text, get JSON from an LLM that matches a
  schema, validate model output, or stream partial structured results.
license: Apache-2.0
compatibility: Python 3.9+ with instructor 1.17; Node.js with @instructor-ai/instructor 1.7 (TypeScript)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/567-labs/instructor
  tags: "structured-output, llm, pydantic, validation, extraction"
---

# Instructor — Structured LLM Output with Validation

## Overview

Instructor wraps an LLM client so that `create(...)` takes a `response_model` (a Pydantic class in Python, a Zod schema in TypeScript) and returns an instance of it. The schema is sent to the provider as a tool or JSON schema, the reply is parsed and validated, and on a validation error the error text is sent back to the model for another attempt (`max_retries`). Python is the main, actively released implementation (1.17.0 on PyPI, September 2026). The TypeScript package `@instructor-ai/instructor` last released 1.7.0 in January 2025; it still works (checked below) but gets no new provider support.

## Instructions

### Install

```bash
pip install instructor                       # or: uv add instructor
pip install anthropic                        # provider SDKs are separate: openai, anthropic, google-genai ...
npm install @instructor-ai/instructor zod openai
```

### Create a client

The documented way is `from_provider("<provider>/<model>")`. It reads the key from the provider's usual environment variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) and returns a client whose `create` takes `response_model`. Pass `async_client=True` for async.

```python
import instructor

client = instructor.from_provider("openai/gpt-4o-mini")
```

Wrapping an existing SDK client also works and gives the older `client.chat.completions.create(...)` form:

```python
import instructor
from openai import OpenAI

client = instructor.from_openai(OpenAI())          # Mode.TOOLS by default
```

Mode is chosen with `mode=instructor.Mode.TOOLS | JSON | MD_JSON | JSON_SCHEMA | ...`. Use `Mode.JSON` for servers without tool calling (many local models). Anthropic: the docs recommend `Mode.TOOLS`, and every call needs `max_tokens`. The `PARALLEL_TOOLS` and `ANTHROPIC_REASONING_TOOLS` modes are deprecated for Anthropic.

### Streaming and lists

- `client.create_partial(response_model=..., ...)` yields the object as it fills in (fields may be missing until the end).
- `client.create_iterable(response_model=Contact, ...)` yields several objects of the same type one at a time.
- `client.create_with_completion(...)` returns `(object, raw_completion)` when you need token usage.

### Validation

Pydantic validators (`Field(ge=0, le=1)`, `@field_validator`, `Literal[...]`) are what trigger a retry: a failed check becomes feedback to the model. After `max_retries` failures Instructor raises `InstructorRetryException` (import it from `instructor.core.exceptions`).

## Examples

### Extract contacts from an email (Python)

```python
import instructor
from typing import Optional
from pydantic import BaseModel, Field

class ContactInfo(BaseModel):
    name: str = Field(description="Full name of the person")
    email: Optional[str] = Field(default=None, description="Email address if mentioned")
    role: Optional[str] = None

class ExtractedContacts(BaseModel):
    contacts: list[ContactInfo]
    confidence: float = Field(ge=0, le=1, description="Overall extraction confidence")

client = instructor.from_provider("openai/gpt-4o-mini")

result = client.create(
    response_model=ExtractedContacts,
    messages=[{
        "role": "user",
        "content": "Extract contacts: Sarah Chen (sarah@techcorp.io) is VP of "
                   "Engineering at TechCorp. CC: Mike Johnson, mike.j@techcorp.io, Head of DevOps",
    }],
    max_retries=3,
)
print(result.contacts[0].name)    # Sarah Chen
print(result.contacts[1].role)    # Head of DevOps
```

`result` is an `ExtractedContacts` instance; a confidence outside 0-1 would be rejected and retried.

### Stream partial objects, and use Anthropic

```python
client = instructor.from_provider("anthropic/claude-sonnet-5")

for partial in client.create_partial(
    response_model=ExtractedContacts,
    messages=[{"role": "user", "content": email_text}],
    max_tokens=1024,
):
    print(f"{len(partial.contacts or [])} contacts so far")
```

Local Ollama (OpenAI-compatible endpoint):

```python
from openai import OpenAI
client = instructor.from_openai(
    OpenAI(base_url="http://localhost:11434/v1", api_key="ollama"),
    mode=instructor.Mode.JSON,
)
```

### TypeScript (Zod)

```typescript
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";

const client = Instructor({ client: new OpenAI(), mode: "TOOLS" });

const Contact = z.object({
  name: z.string(),
  email: z.string().email().nullable(),
});

const result = await client.chat.completions.create({
  model: "gpt-4o-mini",
  response_model: { schema: Contact, name: "Contact" },
  messages: [{ role: "user", content: "Reach Sarah Chen at sarah@techcorp.io" }],
  max_retries: 3,
});
// result is typed as z.infer<typeof Contact>
```

This was run against a local mock OpenAI-compatible server with openai 7.x and zod 3.25; it returned the parsed object.

## Guidelines

- Put a `description` on every field; it goes into the schema the model sees. Make optional data `Optional[X] = None` (`X | None` on Python 3.10+), otherwise the model invents a value.
- Use `Literal[...]` or `Enum` for categories instead of `str`.
- Keep `max_retries` at 2 or 3; each retry is another paid call with the error appended.
- Model names change often. Check the provider's current list before pinning one, and keep the name in one constant.
- Instructor does not make a weak model accurate: validation guarantees the shape, not the truth. Add validators for facts you can check (dates, ranges, enum membership).
- For TypeScript, expect no new features; pin `@instructor-ai/instructor@1.7.0` and check that your OpenAI SDK major version works in a small test before relying on it.
- Provider SDKs (`openai`, `anthropic`, `google-genai`) must be installed separately; `from_provider` raises an import error naming the missing one.
