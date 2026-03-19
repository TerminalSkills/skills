---
title: "Build a Reliable AI Data Extraction Pipeline"
slug: build-reliable-ai-data-extraction-pipeline
description: "Extract structured data from unstructured text using LLMs with prompt engineering, schema enforcement, validation, and batch processing."
skills:
  - prompt-engineering
  - structured-output
  - function-calling
category: data-ai
difficulty: intermediate
time_estimate: "3-5 hours"
tags: [ai, llm, data-extraction, etl, structured-outputs, prompt-engineering]
---

# Build a Reliable AI Data Extraction Pipeline

## The Problem

Maya is a data engineer at a logistics company. They receive thousands of shipping documents, invoices, and contracts daily — all in unstructured text or PDFs. Manually extracting key fields (dates, amounts, parties, addresses) takes hours. She needs a reliable pipeline that extracts structured data using LLMs without hallucinations or schema violations.

## What You'll Build

A production-grade extraction pipeline that:
- Accepts unstructured text (invoices, contracts, emails)
- Extracts structured data matching a defined schema
- Validates output with retry on failure
- Processes documents in batches
- Logs extraction confidence and errors

## Step 1: Define Your Schema

Use Zod (TypeScript) or Pydantic (Python) to define exactly what you want to extract.

```typescript
import { z } from "zod";

const InvoiceSchema = z.object({
  invoice_number: z.string(),
  invoice_date: z.string().describe("ISO 8601 date"),
  due_date: z.string().nullable(),
  vendor: z.object({
    name: z.string(),
    address: z.string().nullable(),
    tax_id: z.string().nullable(),
  }),
  line_items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unit_price: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  tax_amount: z.number().nullable(),
  total_amount: z.number(),
  currency: z.string().default("USD"),
});

type Invoice = z.infer<typeof InvoiceSchema>;
```

## Step 2: Craft an Extraction Prompt

Good extraction prompts are explicit about format, edge cases, and confidence.

```typescript
function buildExtractionPrompt(documentText: string, schemaDescription: string): string {
  return `You are a precise data extraction assistant. Extract structured information from the document below.

<instructions>
- Extract ONLY information explicitly present in the document
- Use null for missing fields, never guess or infer
- Dates must be in ISO 8601 format (YYYY-MM-DD)
- Numbers must be numeric values, not strings
- Return valid JSON matching the schema exactly
</instructions>

<schema>
${schemaDescription}
</schema>

<document>
${documentText}
</document>

Return only the JSON object, no explanation.`;
}
```

## Step 3: Structured Extraction with OpenAI

```typescript
import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";

const openai = new OpenAI();

async function extractInvoice(text: string): Promise<Invoice> {
  const jsonSchema = zodToJsonSchema(InvoiceSchema, "Invoice");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: buildExtractionPrompt(text, JSON.stringify(jsonSchema, null, 2)),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Invoice",
        schema: jsonSchema as any,
        strict: true,
      },
    },
  });

  const raw = response.choices[0].message.content!;
  return InvoiceSchema.parse(JSON.parse(raw));
}
```

## Step 4: Anthropic Alternative (Tool Use)

```python
import anthropic
from pydantic import BaseModel

client = anthropic.Anthropic()

class Invoice(BaseModel):
    invoice_number: str
    invoice_date: str
    total_amount: float
    vendor_name: str

def extract_invoice(text: str) -> Invoice:
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        tools=[{
            "name": "extract_invoice",
            "description": "Extract invoice data from document",
            "input_schema": Invoice.model_json_schema(),
        }],
        tool_choice={"type": "tool", "name": "extract_invoice"},
        messages=[{
            "role": "user",
            "content": f"Extract invoice data:\n\n{text}"
        }],
    )

    tool_use = next(b for b in response.content if b.type == "tool_use")
    return Invoice(**tool_use.input)
```

## Step 5: Retry Logic

```typescript
async function extractWithRetry(
  text: string,
  maxAttempts = 3
): Promise<Invoice | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await extractInvoice(text);
      console.log(`Extracted successfully on attempt ${attempt}`);
      return result;
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error);
      if (attempt === maxAttempts) {
        console.error("All extraction attempts failed");
        return null;
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}
```

## Step 6: Batch Processing

```typescript
import pLimit from "p-limit";

async function processBatch(
  documents: string[],
  concurrency = 5
): Promise<Array<Invoice | null>> {
  const limit = pLimit(concurrency);

  const tasks = documents.map((doc, i) =>
    limit(async () => {
      console.log(`Processing document ${i + 1}/${documents.length}`);
      return extractWithRetry(doc);
    })
  );

  return Promise.all(tasks);
}
```

## Step 7: Validation & Quality Check

```typescript
function validateExtraction(invoice: Invoice, originalText: string): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check total = subtotal + tax
  const calculatedTotal = invoice.subtotal + (invoice.tax_amount ?? 0);
  if (Math.abs(calculatedTotal - invoice.total_amount) > 0.01) {
    warnings.push(`Total mismatch: calculated ${calculatedTotal}, extracted ${invoice.total_amount}`);
  }

  // Verify invoice number appears in document
  if (!originalText.includes(invoice.invoice_number)) {
    warnings.push(`Invoice number "${invoice.invoice_number}" not found in document`);
  }

  return { valid: warnings.length === 0, warnings };
}
```

## Production Tips

- **Use `gpt-4o` or `claude-opus-4-5`** for high-accuracy extraction on complex documents
- **Use `gpt-4o-mini`** for simple, high-volume extraction to reduce costs
- **Store raw LLM output** alongside parsed results for debugging
- **Build a test set** of 20-30 documents with known answers to track accuracy
- **Monitor token usage** — long documents can be expensive; chunk if needed
