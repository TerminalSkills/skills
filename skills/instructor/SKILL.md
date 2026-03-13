---
name: instructor
description: >-
   You are an expert in Instructor, the library for getting structured,
  validated output from LLMs. You help developers extract typed data from
  unstructured text using Pydantic models (Python) or Zod schemas
  (TypeScript), with automatic retries on validation failures, streaming
  partial objects, and support for OpenAI, Anthropic, Google, and local models
  — turning LLMs into reliable data extraction engines.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - structured-output
    - llm
    - pydantic
    - validation
    - extraction
    - typescript
---

# Instructor — Structured LLM Output with Validation

You are an expert in Instructor, the library for getting structured, validated output from LLMs. You help developers extract typed data from unstructured text using Pydantic models (Python) or Zod schemas (TypeScript), with automatic retries on validation failures, streaming partial objects, and support for OpenAI, Anthropic, Google, and local models — turning LLMs into reliable data extraction engines.

## Core Capabilities

### Python (Pydantic)

```python
# extraction.py — Type-safe LLM extraction
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Literal

client = instructor.from_openai(OpenAI())

class ContactInfo(BaseModel):
    name: str = Field(description="Full name of the person")
    email: str | None = Field(default=None, description="Email address if mentioned")
    phone: str | None = Field(default=None, description="Phone number if mentioned")
    company: str | None = Field(default=None)
    role: str | None = Field(default=None)

class ExtractedContacts(BaseModel):
    contacts: list[ContactInfo]
    confidence: float = Field(ge=0, le=1, description="Overall extraction confidence")

# Extract structured data — guaranteed to match schema
result = client.chat.completions.create(
    model="gpt-4o-mini",
    response_model=ExtractedContacts,
    messages=[{
        "role": "user",
        "content": """Extract contacts from this email:

Hi, I'm reaching out on behalf of Sarah Chen (sarah@techcorp.io),
VP of Engineering at TechCorp. She'd like to schedule a call.
You can also reach her at (415) 555-0123.

CC: Mike Johnson, mike.j@techcorp.io, Head of DevOps""",
    }],
    max_retries=3,                        # Auto-retry on validation failure
)

# result.contacts[0].name → "Sarah Chen"
# result.contacts[0].email → "sarah@techcorp.io"
# result.contacts[0].role → "VP of Engineering"
# Fully typed, validated by Pydantic

# Sentiment analysis with enum
class SentimentAnalysis(BaseModel):
    sentiment: Literal["positive", "negative", "neutral", "mixed"]
    emotions: list[Literal["joy", "anger", "sadness", "fear", "surprise", "disgust"]]
    key_phrases: list[str]
    summary: str

analysis = client.chat.completions.create(
    model="gpt-4o-mini",
    response_model=SentimentAnalysis,
    messages=[{"role": "user", "content": f"Analyze sentiment: {review_text}"}],
)

# Streaming partial objects
from instructor import Partial

for partial in client.chat.completions.create_partial(
    model="gpt-4o",
    response_model=ExtractedContacts,
    messages=[{"role": "user", "content": email_text}],
):
    # partial.contacts may be incomplete — render progressively
    print(f"Found {len(partial.contacts)} contacts so far...")
```

### TypeScript (Zod)

```typescript
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";

const client = Instructor({ client: new OpenAI(), mode: "TOOLS" });

const ContactSchema = z.object({
  contacts: z.array(z.object({
    name: z.string(),
    email: z.string().email().nullable(),
    role: z.string().nullable(),
  })),
  confidence: z.number().min(0).max(1),
});

const result = await client.chat.completions.create({
  model: "gpt-4o-mini",
  response_model: { schema: ContactSchema, name: "ContactExtraction" },
  messages: [{ role: "user", content: emailText }],
  max_retries: 3,
});
// result is fully typed as z.infer<typeof ContactSchema>
```

### Multi-Provider

```python
# Works with any provider
from anthropic import Anthropic
import instructor

# Anthropic
client = instructor.from_anthropic(Anthropic())
result = client.messages.create(
    model="claude-sonnet-4-20250514",
    response_model=ExtractedContacts,
    messages=[{"role": "user", "content": text}],
    max_tokens=1024,
)

# Local models (Ollama)
from openai import OpenAI
client = instructor.from_openai(OpenAI(base_url="http://localhost:11434/v1", api_key="ollama"), mode=instructor.Mode.JSON)
```

## Installation

```bash
pip install instructor                    # Python
npm install @instructor-ai/instructor zod  # TypeScript
```

## Best Practices

1. **Pydantic/Zod for schema** — Define exact output shape; LLM output is validated and typed automatically
2. **Field descriptions** — Add `description` to fields; helps the LLM understand what to extract
3. **max_retries** — Set to 2-3; Instructor auto-retries with validation error feedback when output doesn't match
4. **Literals for enums** — Use `Literal["a", "b"]` instead of `str` for categorical fields; constrains LLM output
5. **Nested models** — Use nested Pydantic models for complex structures; LLM handles hierarchical extraction
6. **Streaming** — Use `create_partial` for progressive rendering; show partial results as they arrive
7. **GPT-4o-mini for extraction** — Structured extraction doesn't need the smartest model; mini is 10x cheaper and fast
8. **Validation as feedback** — When validation fails, Instructor sends the error back to the LLM for self-correction
