---
name: structured-outputs
description: >-
  Get reliable structured JSON from LLMs using structured outputs, JSON mode,
  and schema enforcement. Use when extracting structured data from LLMs,
  building type-safe AI pipelines, parsing LLM responses reliably, or ensuring
  LLM output matches a defined schema every time.
license: Apache-2.0
compatibility: "OpenAI API (gpt-4o+), Anthropic API, Python 3.9+, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["structured-outputs", "json", "llm", "openai", "anthropic", "zod", "pydantic"]
  use-cases:
    - "Extract structured product data from unstructured descriptions"
    - "Parse LLM responses into typed TypeScript or Python objects"
    - "Build reliable data extraction pipelines with validation and retries"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Structured Outputs

## Overview

Getting reliable, schema-valid JSON from LLMs requires the right approach. Ad-hoc JSON parsing fails in production — models add prose, miss fields, or use wrong types. This skill covers the three main approaches: OpenAI's native structured outputs, Anthropic's tool use for extraction, and the Instructor library for both.

## OpenAI Structured Outputs

OpenAI's `response_format` with `json_schema` guarantees output matches your schema exactly (with `strict: true`).

### TypeScript (with Zod)

```typescript
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI();

// Define schema with Zod
const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  category: z.enum(["electronics", "clothing", "food", "other"]),
  inStock: z.boolean(),
  features: z.array(z.string()),
});

type Product = z.infer<typeof ProductSchema>;

async function extractProduct(text: string): Promise<Product> {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      {
        role: "system",
        content: "Extract product information from the text.",
      },
      { role: "user", content: text },
    ],
    response_format: zodResponseFormat(ProductSchema, "product"),
  });

  const product = response.choices[0].message.parsed;
  if (!product) throw new Error("Failed to parse product");
  return product;
}

// Usage
const product = await extractProduct(
  "Apple AirPods Pro 2nd gen - $249 USD. Noise cancellation, transparency mode. Currently in stock."
);
console.log(product);
// { name: "Apple AirPods Pro", price: 249, currency: "USD", ... }
```

### Python (with Pydantic)

```python
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Literal

client = OpenAI()

class Product(BaseModel):
    name: str
    price: float
    currency: str = Field(default="USD")
    category: Literal["electronics", "clothing", "food", "other"]
    in_stock: bool
    features: list[str]

def extract_product(text: str) -> Product:
    completion = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {"role": "system", "content": "Extract product information from the text."},
            {"role": "user", "content": text},
        ],
        response_format=Product,
    )
    return completion.choices[0].message.parsed

product = extract_product(
    "Sony WH-1000XM5 headphones. $350. Best-in-class ANC, 30hr battery. Ships in 2 days."
)
print(product.model_dump())
```

### JSON Schema (without Zod/Pydantic)

```python
response = client.chat.completions.create(
    model="gpt-4o-2024-08-06",
    messages=[{"role": "user", "content": text}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "product_extraction",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price": {"type": "number"},
                    "in_stock": {"type": "boolean"},
                    "features": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                },
                "required": ["name", "price", "in_stock", "features"],
                "additionalProperties": False
            }
        }
    }
)
result = json.loads(response.choices[0].message.content)
```

## Anthropic Tool Use for Structured Extraction

Anthropic doesn't have native JSON mode, but tool use forces structured output reliably.

```python
import anthropic
import json

client = anthropic.Anthropic()

def extract_with_tool_use(text: str, schema: dict) -> dict:
    """Use a dummy tool to force structured JSON output from Claude."""
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        tools=[{
            "name": "extract_data",
            "description": "Extract structured data from the provided text",
            "input_schema": schema
        }],
        tool_choice={"type": "tool", "name": "extract_data"},
        messages=[{
            "role": "user",
            "content": f"Extract data from this text:\n\n{text}"
        }]
    )

    # Find the tool use block
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_data":
            return block.input

    raise ValueError("No tool use in response")

# Define extraction schema
schema = {
    "type": "object",
    "properties": {
        "company_name": {"type": "string"},
        "founding_year": {"type": "integer"},
        "employees": {"type": "integer"},
        "headquarters": {"type": "string"},
        "products": {
            "type": "array",
            "items": {"type": "string"}
        }
    },
    "required": ["company_name", "founding_year", "headquarters"]
}

result = extract_with_tool_use(
    "Stripe was founded in 2010 by Patrick and John Collison in San Francisco. "
    "They now have over 8,000 employees and offer payment APIs, billing, and fraud tools.",
    schema
)
```

## Instructor Library

Instructor is a thin wrapper around LLM APIs that adds Pydantic validation and automatic retries.

### Install

```bash
pip install instructor        # Python
npm install @instructor-ai/instructor  # TypeScript
```

### Python

```python
import instructor
from anthropic import Anthropic
from openai import OpenAI
from pydantic import BaseModel, Field, validator

class Address(BaseModel):
    street: str
    city: str
    country: str
    postal_code: str

class ContactInfo(BaseModel):
    name: str
    email: str = Field(pattern=r"^[^@]+@[^@]+\.[^@]+$")
    phone: str | None = None
    address: Address | None = None

    @validator("email")
    def email_lowercase(cls, v):
        return v.lower()

# With OpenAI
client = instructor.from_openai(OpenAI())
contact = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "John Doe, john@EXAMPLE.COM, +1-555-0100, 123 Main St, NYC, US 10001"}],
    response_model=ContactInfo,
)

# With Anthropic
client = instructor.from_anthropic(Anthropic())
contact = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Extract contact info from: ..."}],
    response_model=ContactInfo,
)
```

### TypeScript

```typescript
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";

const client = Instructor({ client: new OpenAI(), mode: "TOOLS" });

const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  email: z.string().email(),
});

const user = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Extract: John Smith, 28, john@smith.com" }],
  response_model: { schema: UserSchema, name: "User" },
});
```

## Retry Logic for Malformed Responses

```python
import json
import time
from typing import TypeVar, Type

T = TypeVar("T")

def extract_with_retry(
    text: str,
    schema_class: Type[T],
    llm_fn,
    max_retries: int = 3,
    backoff: float = 1.0
) -> T:
    last_error = None
    for attempt in range(max_retries):
        try:
            result = llm_fn(text, schema_class)
            # Validate if it's a Pydantic model
            if hasattr(schema_class, "model_validate"):
                return schema_class.model_validate(result)
            return result
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = e
            if attempt < max_retries - 1:
                print(f"Attempt {attempt + 1} failed: {e}. Retrying...")
                time.sleep(backoff * (2 ** attempt))
                # Add error context to next attempt
                text = f"{text}\n\nPrevious attempt failed with: {e}. Please fix the output."
    raise RuntimeError(f"Failed after {max_retries} attempts. Last error: {last_error}")
```

## Zod → JSON Schema Conversion

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const OrderSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
  })),
  totalAmount: z.number().positive(),
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
  createdAt: z.string().datetime(),
});

// Convert Zod schema to JSON Schema for use with raw OpenAI API
const jsonSchema = zodToJsonSchema(OrderSchema, {
  name: "Order",
  nameStrategy: "title",
});
```

## Guidelines

- Use `strict: true` with OpenAI's JSON Schema mode for guaranteed compliance
- For Anthropic, always use tool use with `tool_choice: {type: "tool", name: "..."}` — JSON mode alone is unreliable
- Mark all required fields explicitly; don't rely on model inference
- Use `additionalProperties: false` to prevent extra fields
- Keep schemas flat where possible; deeply nested schemas increase failure rate
- Test schemas with adversarial inputs (missing data, wrong types, partial text)
- Log all failures with the raw LLM response for debugging
- Instructor handles retries automatically; use it in production pipelines
