---
name: structured-output
description: >-
  Force LLMs to return typed, validated JSON — not free-text. Use when someone
  asks to "get structured data from LLM", "parse LLM response as JSON",
  "make AI return typed output", "validate LLM output", "extract structured
  data with AI", "use instructor with OpenAI", or "get reliable JSON from
  Claude/GPT". Covers OpenAI structured outputs, Anthropic tool_use for
  structured data, Instructor library, Zod schemas, Pydantic models, and
  retry strategies for malformed responses.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. OpenAI or Anthropic API key."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["llm", "json", "validation", "zod", "pydantic", "instructor", "typed"]
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

OpenAI's `response_format` with JSON Schema guarantees valid JSON matching your schema. The model literally cannot produce non-conforming output.

```typescript
// openai-structured.ts — Type-safe LLM outputs with OpenAI
/**
 * Uses OpenAI's native structured outputs to guarantee
 * responses match a JSON Schema. No parsing, no retries,
 * no "please return valid JSON" prompting hacks.
 */
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI();

// Define your output schema with Zod
const ProductAnalysis = z.object({
  name: z.string().describe("Product name"),
  category: z.enum(["electronics", "clothing", "food", "software", "other"]),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  score: z.number().min(0).max(10).describe("Overall quality score"),
  pros: z.array(z.string()).describe("List of positive aspects"),
  cons: z.array(z.string()).describe("List of negative aspects"),
  summary: z.string().max(200).describe("One-sentence summary"),
});

type ProductAnalysis = z.infer<typeof ProductAnalysis>;

async function analyzeReview(review: string): Promise<ProductAnalysis> {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Analyze the product review and extract structured data.",
      },
      { role: "user", content: review },
    ],
    response_format: zodResponseFormat(ProductAnalysis, "product_analysis"),
  });

  // Guaranteed to be valid — no try/catch needed
  return response.choices[0].message.parsed!;
}
```

### Strategy 2: Anthropic Tool Use for Structured Data

Claude doesn't have native JSON mode, but tool_use forces structured output through a function call schema.

```typescript
// anthropic-structured.ts — Structured output from Claude via tool_use
/**
 * Uses Anthropic's tool_use feature to extract structured data.
 * Define a "tool" with your output schema — Claude fills it in
 * as a structured tool call instead of free text.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface ExtractedEvent {
  title: string;
  date: string;        // ISO 8601
  location: string;
  attendees: number;
  description: string;
}

async function extractEvent(text: string): Promise<ExtractedEvent> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    tools: [
      {
        name: "extract_event",
        description: "Extract event details from text",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Event title" },
            date: { type: "string", description: "Event date in ISO 8601 format" },
            location: { type: "string", description: "Event location" },
            attendees: { type: "number", description: "Expected number of attendees" },
            description: { type: "string", description: "Brief event description" },
          },
          required: ["title", "date", "location", "attendees", "description"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_event" },  // Force this tool
    messages: [{ role: "user", content: `Extract event details:\n\n${text}` }],
  });

  // Find the tool_use block
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("No tool_use block in response");
  }

  return toolBlock.input as ExtractedEvent;
}
```

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

# Patch the OpenAI client
client = instructor.from_openai(OpenAI())

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
        model="gpt-4o-mini",
        response_model=EmailAnalysis,  # Instructor magic
        max_retries=3,                 # Auto-retry on validation failure
        messages=[
            {"role": "system", "content": "Analyze the email and extract structured data."},
            {"role": "user", "content": email_text},
        ],
    )

# Usage
result = analyze_email("Hi, I'm John from Acme Corp. We need the API docs by Friday...")
print(result.model_dump_json(indent=2))
```

### Strategy 4: Retry with Validation (Generic)

When the model doesn't support native structured output, validate and retry.

```typescript
// retry-structured.ts — Validate and retry LLM output
/**
 * Generic structured output with retry logic.
 * Works with any LLM provider. Sends the validation error
 * back to the model so it can self-correct.
 */
import { z, ZodSchema } from "zod";

async function structuredLLM<T>(
  llmCall: (messages: Array<{ role: string; content: string }>) => Promise<string>,
  schema: ZodSchema<T>,
  prompt: string,
  maxRetries: number = 3
): Promise<T> {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `Respond with valid JSON matching this schema:\n${JSON.stringify(zodToJsonSchema(schema), null, 2)}`,
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

- **Use native structured output when available** — OpenAI's response_format is 100% reliable
- **Anthropic tool_use works** — force a single tool to get structured data from Claude
- **Instructor is the best Python option** — auto-retries, validation, works with multiple providers
- **Always validate** — even native structured output should be validated with Zod/Pydantic
- **Keep schemas simple** — deeply nested schemas increase error rates
- **Descriptions matter** — add `.describe()` to every field; the model uses them for guidance
- **Retry with error feedback** — sending the validation error back lets the model self-correct
- **Use enums over free strings** — `z.enum(["low", "medium", "high"])` beats `z.string()`
- **Temperature 0 for extraction** — deterministic output reduces schema violations
- **Cost: extraction is cheap** — gpt-4o-mini handles most extraction tasks at $0.15/1M tokens
