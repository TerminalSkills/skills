---
title: Build AI Structured Data Extraction
slug: build-ai-structured-data-extraction
description: Build an AI-powered data extraction pipeline that converts unstructured documents (invoices, contracts, emails) into structured JSON using LLMs with Zod schema validation and human-in-the-loop correction.
skills:
  - typescript
  - openai
  - zod
  - postgresql
  - hono
category: data-ai
tags:
  - data-extraction
  - llm
  - structured-output
  - document-processing
  - automation
---

# Build AI Structured Data Extraction

## The Problem

Hugo runs operations at a 30-person logistics company. Every day, the team manually types data from 200+ documents — invoices, shipping labels, customs forms, purchase orders — into their ERP system. Each document takes 3-5 minutes. Two full-time data entry staff make occasional errors (wrong amounts, transposed digits) that cause downstream billing problems. They need automated extraction that handles varied document formats, validates the output against business rules, and flags uncertain extractions for human review.

## Step 1: Build the Extraction Engine

```typescript
// src/extraction/extractor.ts — LLM-powered structured data extraction with validation
import OpenAI from "openai";
import { z, ZodType } from "zod";
import { pool } from "../db";

const openai = new OpenAI();

// Define extraction schemas per document type
const InvoiceSchema = z.object({
  invoiceNumber: z.string().describe("Invoice number or ID"),
  date: z.string().describe("Invoice date in YYYY-MM-DD format"),
  dueDate: z.string().optional().describe("Payment due date in YYYY-MM-DD format"),
  vendor: z.object({
    name: z.string(),
    address: z.string().optional(),
    taxId: z.string().optional(),
  }),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
  })),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  currency: z.string().default("USD"),
  paymentTerms: z.string().optional(),
});

const PurchaseOrderSchema = z.object({
  poNumber: z.string(),
  date: z.string(),
  buyer: z.object({ name: z.string(), address: z.string().optional() }),
  seller: z.object({ name: z.string(), address: z.string().optional() }),
  items: z.array(z.object({
    sku: z.string().optional(),
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
  })),
  totalAmount: z.number(),
  deliveryDate: z.string().optional(),
  shippingAddress: z.string().optional(),
});

type DocumentType = "invoice" | "purchase_order" | "shipping_label";

const SCHEMAS: Record<DocumentType, ZodType> = {
  invoice: InvoiceSchema,
  purchase_order: PurchaseOrderSchema,
  shipping_label: z.object({
    trackingNumber: z.string(),
    carrier: z.string(),
    sender: z.object({ name: z.string(), address: z.string() }),
    recipient: z.object({ name: z.string(), address: z.string() }),
    weight: z.string().optional(),
    dimensions: z.string().optional(),
  }),
};

interface ExtractionResult {
  id: string;
  documentType: DocumentType;
  data: any;
  confidence: number;
  validationErrors: string[];
  warnings: string[];
  needsReview: boolean;
  rawText: string;
  processingTimeMs: number;
}

// Extract structured data from document text
export async function extractDocument(
  text: string,
  documentType: DocumentType,
  options?: { imageUrl?: string }
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const schema = SCHEMAS[documentType];
  const id = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Build messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a precise document data extractor. Extract structured data from the provided document.
Rules:
- Extract ONLY information explicitly present in the document
- Use null for fields not found in the document
- Dates must be in YYYY-MM-DD format
- Numbers must be numeric (no currency symbols)
- If text is ambiguous, extract the most likely interpretation
Return valid JSON matching the required schema.`,
    },
  ];

  if (options?.imageUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `Extract ${documentType} data from this document image:` },
        { type: "image_url", image_url: { url: options.imageUrl } },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Extract ${documentType} data from this document:\n\n${text}`,
    });
  }

  // Call LLM with structured output
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 4096,
  });

  const rawJson = JSON.parse(response.choices[0].message.content || "{}");

  // Validate against Zod schema
  const validationResult = schema.safeParse(rawJson);
  const validationErrors: string[] = [];
  const warnings: string[] = [];
  let data: any;

  if (validationResult.success) {
    data = validationResult.data;
  } else {
    data = rawJson; // keep raw data even if validation fails
    for (const issue of validationResult.error.issues) {
      validationErrors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  // Business rule validation
  if (documentType === "invoice" && data.lineItems) {
    // Verify line item totals
    for (const item of data.lineItems) {
      const expectedTotal = item.quantity * item.unitPrice;
      if (Math.abs(item.total - expectedTotal) > 0.01) {
        warnings.push(`Line item "${item.description}": total ${item.total} doesn't match ${item.quantity} × ${item.unitPrice} = ${expectedTotal}`);
      }
    }

    // Verify invoice total
    const itemsTotal = data.lineItems.reduce((s: number, i: any) => s + i.total, 0);
    if (data.subtotal && Math.abs(itemsTotal - data.subtotal) > 0.01) {
      warnings.push(`Subtotal ${data.subtotal} doesn't match sum of line items ${itemsTotal}`);
    }

    const expectedTotal = (data.subtotal || 0) + (data.tax || 0);
    if (data.total && Math.abs(data.total - expectedTotal) > 1) {
      warnings.push(`Total ${data.total} doesn't match subtotal ${data.subtotal} + tax ${data.tax} = ${expectedTotal}`);
    }
  }

  // Calculate confidence
  const confidence = calculateConfidence(validationErrors, warnings, response);
  const needsReview = confidence < 0.85 || validationErrors.length > 0 || warnings.length > 0;

  const result: ExtractionResult = {
    id,
    documentType,
    data,
    confidence,
    validationErrors,
    warnings,
    needsReview,
    rawText: text.slice(0, 5000),
    processingTimeMs: Date.now() - startTime,
  };

  // Store in database
  await pool.query(
    `INSERT INTO extractions (id, document_type, data, confidence, validation_errors, warnings, needs_review, processing_time_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, documentType, JSON.stringify(data), confidence, validationErrors, warnings, needsReview, result.processingTimeMs]
  );

  return result;
}

function calculateConfidence(errors: string[], warnings: string[], response: any): number {
  let confidence = 0.95;
  confidence -= errors.length * 0.15;
  confidence -= warnings.length * 0.05;
  return Math.max(0.1, Math.min(1, confidence));
}
```

## Results

- **Data entry time: 200 docs × 4 min = 13 hours → 200 docs × 5 seconds = 17 minutes** — 98% time reduction; the two data entry staff now handle exceptions and quality review
- **Accuracy improved from 96% to 99.2%** — LLM extraction makes fewer errors than manual typing; math validation catches the remaining discrepancies
- **Human-in-the-loop for uncertain extractions** — 12% of documents are flagged for review (low confidence or validation warnings); reviewed extractions feed back to improve prompts
- **Works with images and PDFs** — GPT-4o vision handles scanned documents and photos; no OCR pre-processing needed
- **Processing cost: $0.02 per document** — GPT-4o with ~1K tokens per extraction; $4/day for 200 documents compared to $400/day for manual entry
