---
name: structured-output
description: >-
  Force LLMs to return typed, validated JSON — not free-text. Use when someone
  asks to "get structured data from LLM", "parse LLM response as JSON",
  "make AI return typed output", "validate LLM output", "extract structured
  data with AI", "use instructor with OpenAI", or "get reliable JSON from
  Claude/GPT". Covers OpenAI structured outputs, Anthropic output_config.format
  (JSON outputs), Instructor library, Zod schemas, Pydantic models, and
  retry strategies for malformed responses.
license: Apache-2.0
compatibility: "Node.js 20+ or Python 3.10+. OpenAI or Anthropic API key (OPENAI_API_KEY, ANTHROPIC_API_KEY)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "llm, json, validation, zod, pydantic"
---

# Structured Output

## Overview

LLMs love to ramble. When you need JSON, you get JSON wrapped in markdown. When you need a list, you get a paragraph. Structured output forces the model to return exactly the schema you define — validated, typed, and ready to use in code without parsing gymnastics.

## When to Use

- Extracting structured data from unstructured text (invoices, emails, articles)
- Building API responses powered by LLMs that must match a schema
- Creating reliable data pipelines where LLM output feeds into databases
- Generating configuration files, test cases, or code from natural language
- Any time you need JSON from an LLM, not prose

## Instructions

### Strategy 1: OpenAI Structured Outputs (Native)

OpenAI's JSON Schema mode (`strict`) constrains decoding so the reply matches your schema. Use the Responses API: `responses.parse` with `zodTextFormat` (TypeScript) or `text_format=` with a Pydantic model (Python). The older `chat.completions.parse` with `zodResponseFormat` still works but is the legacy path.

```typescript
// openai-structured.ts — Type-safe LLM outputs with OpenAI
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const openai = new OpenAI(); // reads OPENAI_API_KEY

// Strict mode: every field is required and objects take no extra keys.
// Express "maybe missing" as .nullable(), never .optional().
const ProductAnalysis = z.object({
  name: z.string().describe("Product name"),
  category: z.enum(["electronics", "clothing", "food", "software", "other"]),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  score: z.number().describe("Overall quality score from 0 to 10"),
  pros: z.array(z.string()).describe("Positive aspects"),
  cons: z.array(z.string()).describe("Negative aspects"),
  summary: z.string().describe("One-sentence summary, at most 200 characters"),
  warranty_months: z.number().nullable().describe("Warranty length, null if not mentioned"),
});
type ProductAnalysis = z.infer<typeof ProductAnalysis>;

async function analyzeReview(review: string): Promise<ProductAnalysis> {
  const response = await openai.responses.parse({
    model: "gpt-6-luna", // pick a current model; gpt-4o-mini is scheduled for removal on 2027-01-14
    input: [
      { role: "system", content: "Analyze the product review and extract structured data." },
      { role: "user", content: review },
    ],
    text: { format: zodTextFormat(ProductAnalysis, "product_analysis") },
  });

  if (!response.output_parsed) {
    // A safety refusal does not follow the schema; it arrives as a refusal item.
    throw new Error(`No parsed output (status: ${response.status})`);
  }
  return response.output_parsed;
}
```

Python equivalent: `client.responses.parse(model=..., input=[...], text_format=ProductAnalysis)` where `ProductAnalysis` is a Pydantic `BaseModel`; read `response.output_parsed`.

### Strategy 2: Anthropic JSON outputs (`output_config.format`)

Claude constrains its reply to a JSON Schema through `output_config.format` (GA on the Claude API, Bedrock, Vertex and Foundry; supported by current Claude models). `messages.parse` with a Zod schema (`zodOutputFormat`) or a Pydantic model (`output_format=`) sends the schema, validates the reply and returns it typed in `parsed_output`. Keep `max_tokens` high enough: a reply cut off at the limit is not valid JSON.

```typescript
// anthropic-structured.ts — Structured output from Claude
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const ExtractedEvent = z.object({
  title: z.string(),
  date: z.string().describe("Event date in ISO 8601 format"),
  location: z.string(),
  attendees: z.number().describe("Expected number of attendees"),
  description: z.string().describe("Brief event description"),
});
type ExtractedEvent = z.infer<typeof ExtractedEvent>;

async function extractEvent(text: string): Promise<ExtractedEvent> {
  const response = await anthropic.messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: `Extract event details:\n\n${text}` }],
    output_config: { format: zodOutputFormat(ExtractedEvent) },
  });
  if (!response.parsed_output) throw new Error(`No parsed output (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
```

```python
# anthropic_structured.py
from anthropic import Anthropic
from pydantic import BaseModel

class ExtractedEvent(BaseModel):
    title: str
    date: str
    location: str
    attendees: int

client = Anthropic()
response = client.messages.parse(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Extract the event: PyData Berlin, 14 March 2027 at the Kosmos venue, about 300 attendees."}],
    output_format=ExtractedEvent,
)
print(response.parsed_output)
```

The API enforces only a subset of JSON Schema; the SDK helpers strip numeric and length constraints (`minimum`, `maxLength` ...) from the wire schema, move them into the field description and check them on the reply. For tool inputs, set `strict: true` on the tool definition instead. Forcing a single tool with `tool_choice` still works but is no longer the recommended route for plain data extraction.

### Strategy 3: Instructor Library (Python)

Instructor patches the OpenAI/Anthropic client to return Pydantic models directly. The most ergonomic way to get structured output in Python.

```python
# instructor_extract.py — Structured LLM output with Pydantic models
"""
Uses the Instructor library to patch OpenAI/Anthropic clients
and return validated Pydantic models. Handles retries automatically
when the model returns invalid data.
"""
import instructor
from pydantic import BaseModel, Field
from openai import OpenAI
from typing import Optional

# Wrap the OpenAI client (reads OPENAI_API_KEY)
client = instructor.from_openai(OpenAI())  # or instructor.from_provider("openai/gpt-6-luna")

class ContactInfo(BaseModel):
    """Extracted contact information from unstructured text."""
    name: str = Field(description="Full name")
    email: Optional[str] = Field(default=None, description="Email address")
    phone: Optional[str] = Field(default=None, description="Phone number")
    company: Optional[str] = Field(default=None, description="Company name")
    role: Optional[str] = Field(default=None, description="Job title or role")

class EmailAnalysis(BaseModel):
    """Structured analysis of an email."""
    sender: ContactInfo
    intent: str = Field(description="Primary intent: inquiry, complaint, request, info, spam")
    urgency: str = Field(description="low, medium, high, critical")
    action_items: list[str] = Field(description="List of required actions")
    sentiment: float = Field(ge=-1.0, le=1.0, description="Sentiment score -1 to 1")
    summary: str = Field(max_length=200, description="One-sentence summary")

def analyze_email(email_text: str) -> EmailAnalysis:
    """Analyze an email and return structured data.
    
    Args:
        email_text: Raw email body text
        
    Returns:
        Validated EmailAnalysis with all fields populated
    """
    return client.chat.completions.create(
        model="gpt-6-luna",
        response_model=EmailAnalysis,  # Instructor magic
        max_retries=3,                 # Auto-retry on validation failure
        messages=[
            {"role": "system", "content": "Analyze the email and extract structured data."},
            {"role": "user", "content": email_text},
        ],
    )

# Usage
result = analyze_email("Hi, I'm Dana Reyes from Northwind Logistics. We need the API docs by Friday...")
print(result.model_dump_json(indent=2))
```

### Strategy 4: Retry with Validation (Generic)

When the model doesn't support native structured output, validate and retry.

```typescript
// retry-structured.ts — Validate and retry LLM output
/**
 * Generic structured output with retry logic.
 * Works with any LLM provider (Zod 4: z.toJSONSchema is built in). Sends the validation error
 * back to the model so it can self-correct.
 */
import { z, ZodType } from "zod";

async function structuredLLM<T>(
  llmCall: (messages: Array<{ role: string; content: string }>) => Promise<string>,
  schema: ZodType<T>,
  prompt: string,
  maxRetries: number = 3
): Promise<T> {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `Respond with valid JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(schema), null, 2)}`,
    },
    { role: "user", content: prompt },
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const raw = await llmCall(messages);

    // Extract JSON from response (handle markdown code blocks)
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return schema.parse(parsed);  // Zod validation
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} retries: ${error.message}`);
      }

      // Send error back to model for self-correction
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `Invalid output. Error: ${error.message}\nPlease fix and return valid JSON.` }
      );
    }
  }

  throw new Error("Unreachable");
}
```

## Examples

### Example 1: Extract data from invoices

**User prompt:** "Parse PDF invoices and extract line items, totals, vendor info as structured JSON."

The agent will use OpenAI structured outputs with a Zod schema for InvoiceData (vendor, line items array, subtotal, tax, total, date, invoice number) and process each invoice through the model.

### Example 2: Build a structured API from natural language

**User prompt:** "I want users to describe what they need in English, and the API returns a structured search query object."

The agent will define a SearchQuery schema (filters, sort, pagination, date range), use Instructor to convert natural language to the schema, and validate the output before passing it to the database.

## Guidelines

- **Use native structured output when available** — OpenAI `text.format` / `response_format` with strict JSON Schema and Anthropic `output_config.format` both constrain decoding; they guarantee the shape, not that the values are true
- **Handle refusals and truncation** — an OpenAI safety refusal or an Anthropic reply cut off at `max_tokens` will not match the schema; check `output_parsed` / `parsed_output` and `stop_reason`
- **Strict mode limits** — OpenAI needs every field required (use `.nullable()`, not `.optional()`) and `additionalProperties: false`; both vendors support only a subset of JSON Schema, so keep range and length rules in your own validation
- **Instructor is a good Python option** — auto-retries on validation failure, one `response_model=` API across providers
- **Always validate** — business rules (ranges, string length, cross-field checks) are not enforced by the model; check with Zod/Pydantic
- **Keep schemas simple** — deeply nested schemas increase error rates
- **Descriptions matter** — add `.describe()` to every field; the model uses them for guidance
- **Retry with error feedback** — sending the validation error back lets the model self-correct
- **Use enums over free strings** — `z.enum(["low", "medium", "high"])` beats `z.string()`
- **Temperature 0 for extraction** — deterministic output reduces schema violations
- **Cost: extraction is cheap** — a small, cheap model handles most extraction tasks; check the vendor's pricing page
