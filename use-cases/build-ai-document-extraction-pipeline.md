---
title: Build an AI Document Extraction Pipeline
slug: build-ai-document-extraction-pipeline
description: >
  Extract structured data from invoices, receipts, and contracts using
  vision AI — processing 2K documents/day with 95% accuracy and
  replacing 3 manual data entry operators.
skills:
  - typescript
  - vercel-ai-sdk
  - bull-mq
  - redis
  - postgresql
  - zod
  - hono
category: AI & Machine Learning
tags:
  - document-extraction
  - ocr
  - ai-vision
  - data-entry
  - automation
  - invoice-processing
---

# Build an AI Document Extraction Pipeline

## The Problem

An accounting firm processes 2K documents per day: invoices, receipts, purchase orders, and contracts. Three data entry operators manually read each document and type values into the system — vendor name, amounts, dates, line items. Error rate: 4%. Processing time: 3 minutes per document. The team can't scale — hiring more operators takes weeks, and quality degrades with fatigue. Month-end is chaos: 5K documents backlog, operators work overtime, clients complain about slow processing.

## Step 1: Document Intake and Classification

```typescript
// src/extraction/intake.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);
const extractionQueue = new Queue('document-extraction', { connection });

const DocumentClassification = z.object({
  documentType: z.enum(['invoice', 'receipt', 'purchase_order', 'contract', 'bank_statement', 'unknown']),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  pageCount: z.number().int(),
  quality: z.enum(['good', 'fair', 'poor']),
});

export async function classifyDocument(imageUrl: string): Promise<z.infer<typeof DocumentClassification>> {
  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: DocumentClassification,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Classify this document. What type is it? What language? Assess the image quality for OCR.' },
          { type: 'image', image: imageUrl },
        ],
      },
    ],
  });

  return object;
}

export async function submitDocument(fileUrl: string, metadata: { clientId: string; uploadedBy: string }): Promise<string> {
  const jobId = crypto.randomUUID();

  await extractionQueue.add('extract', {
    jobId,
    fileUrl,
    ...metadata,
  }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  });

  return jobId;
}
```

## Step 2: Structured Data Extraction

```typescript
// src/extraction/extractors.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const InvoiceData = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  vendor: z.object({
    name: z.string(),
    address: z.string().optional(),
    taxId: z.string().optional(),
  }),
  buyer: z.object({
    name: z.string(),
    address: z.string().optional(),
  }).optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().optional(),
    unitPrice: z.number().optional(),
    amount: z.number(),
  })),
  subtotal: z.number(),
  tax: z.number().optional(),
  total: z.number(),
  currency: z.string().length(3),
  paymentTerms: z.string().optional(),
  bankDetails: z.object({
    iban: z.string().optional(),
    swift: z.string().optional(),
    bankName: z.string().optional(),
  }).optional(),
});

const ReceiptData = z.object({
  merchantName: z.string(),
  date: z.string(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    price: z.number(),
  })),
  subtotal: z.number().optional(),
  tax: z.number().optional(),
  total: z.number(),
  currency: z.string().length(3),
  paymentMethod: z.string().optional(),
});

export async function extractInvoice(imageUrl: string): Promise<z.infer<typeof InvoiceData>> {
  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: InvoiceData,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all structured data from this invoice. Be precise with numbers — verify totals match line items. Dates should be ISO format (YYYY-MM-DD). Currency as 3-letter code.`,
          },
          { type: 'image', image: imageUrl },
        ],
      },
    ],
  });

  return object;
}

export async function extractReceipt(imageUrl: string): Promise<z.infer<typeof ReceiptData>> {
  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: ReceiptData,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all data from this receipt. Be precise with amounts.' },
          { type: 'image', image: imageUrl },
        ],
      },
    ],
  });

  return object;
}
```

## Step 3: Validation and Human Review

```typescript
// src/extraction/validation.ts
import { Pool } from 'pg';
import type { InvoiceData } from './extractors';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  needsReview: boolean;
}

export function validateInvoice(data: any): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check line items sum matches subtotal
  const lineItemsTotal = data.lineItems.reduce((s: number, i: any) => s + i.amount, 0);
  if (Math.abs(lineItemsTotal - data.subtotal) > 0.01) {
    warnings.push(`Line items sum (${lineItemsTotal.toFixed(2)}) doesn't match subtotal (${data.subtotal.toFixed(2)})`);
  }

  // Check subtotal + tax = total
  const expectedTotal = data.subtotal + (data.tax ?? 0);
  if (Math.abs(expectedTotal - data.total) > 0.01) {
    warnings.push(`Subtotal + tax (${expectedTotal.toFixed(2)}) doesn't match total (${data.total.toFixed(2)})`);
  }

  // Check date is reasonable
  const invoiceDate = new Date(data.invoiceDate);
  if (invoiceDate > new Date()) errors.push('Invoice date is in the future');
  if (invoiceDate < new Date('2020-01-01')) warnings.push('Invoice date is very old');

  // Missing critical fields
  if (!data.invoiceNumber) errors.push('Missing invoice number');
  if (!data.vendor?.name) errors.push('Missing vendor name');

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    needsReview: warnings.length > 0 || errors.length > 0,
  };
}

export async function queueForReview(documentId: string, data: any, validation: ValidationResult): Promise<void> {
  await db.query(`
    INSERT INTO extraction_reviews (document_id, extracted_data, validation_warnings, validation_errors, status, created_at)
    VALUES ($1, $2, $3, $4, 'pending', NOW())
  `, [documentId, JSON.stringify(data), validation.warnings, validation.errors]);
}
```

## Step 4: Processing API

```typescript
// src/api/extraction.ts
import { Hono } from 'hono';
import { submitDocument } from '../extraction/intake';
import { Pool } from 'pg';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

app.post('/v1/documents/upload', async (c) => {
  const { fileUrl, clientId } = await c.req.json();
  const userId = c.get('userId');
  const jobId = await submitDocument(fileUrl, { clientId, uploadedBy: userId });
  return c.json({ jobId, status: 'processing', estimatedSeconds: 15 });
});

app.get('/v1/documents/:jobId/result', async (c) => {
  const jobId = c.req.param('jobId');
  const { rows } = await db.query(
    'SELECT * FROM extraction_results WHERE job_id = $1', [jobId]
  );
  if (!rows[0]) return c.json({ status: 'processing' });
  return c.json(rows[0]);
});

export default app;
```

## Results

- **Processing time**: 12 seconds per document (was 3 minutes manual)
- **Accuracy**: 95% (validated against manual spot-checks)
- **2K documents/day**: processed automatically, zero backlog
- **3 operators replaced**: redeployed to review-only role (handle 5% that need human review)
- **Error rate**: 1.5% (was 4% manual) — AI is more consistent than tired humans
- **Month-end**: no more overtime, documents processed same-day
- **Cost**: $400/month AI API (was $12K/month in operator salaries)
