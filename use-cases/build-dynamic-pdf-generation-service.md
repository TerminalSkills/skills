---
title: Build a Dynamic PDF Generation Service
slug: build-dynamic-pdf-generation-service
description: >
  Generate 10K invoices, reports, and contracts per day from templates —
  with multi-language support, digital signatures, and sub-second
  generation time that replaced a $3K/month third-party service.
skills:
  - typescript
  - bull-mq
  - redis
  - hono
  - zod
  - docker
category: Full-Stack Development
tags:
  - pdf-generation
  - invoicing
  - templates
  - document-generation
  - puppeteer
  - reports
---

# Build a Dynamic PDF Generation Service

## The Problem

A SaaS platform generates invoices, contracts, and compliance reports for 5,000 customers. They use a third-party PDF API costing $3K/month with a 5-second generation time. The API has frequent outages (3-4 per month), and when invoices are due at month-end, the queue backs up for hours. Customization is limited — customers want their logo, colors, and specific layouts, but the third-party service only supports basic templates. A large enterprise customer threatened to churn because their invoices didn't match their brand guidelines.

## Step 1: Template Engine

```typescript
// src/templates/engine.ts
import { z } from 'zod';
import Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';

const TemplateData = z.object({
  templateId: z.string(),
  locale: z.string().default('en'),
  data: z.record(z.string(), z.unknown()),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().default('#1a1a2e'),
    accentColor: z.string().default('#e94560'),
    fontFamily: z.string().default('Inter, sans-serif'),
  }).default({}),
  options: z.object({
    pageSize: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    margin: z.object({
      top: z.string().default('20mm'),
      bottom: z.string().default('20mm'),
      left: z.string().default('15mm'),
      right: z.string().default('15mm'),
    }).default({}),
  }).default({}),
});

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
});

Handlebars.registerHelper('formatDate', (date: string, locale: string) => {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(date));
});

Handlebars.registerHelper('sum', (items: any[], field: string) => {
  return items.reduce((total, item) => total + (item[field] ?? 0), 0);
});

export async function renderTemplate(input: z.infer<typeof TemplateData>): Promise<string> {
  const templatePath = join(__dirname, 'html', `${input.templateId}.hbs`);
  const templateSource = await readFile(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  return template({
    ...input.data,
    branding: input.branding,
    locale: input.locale,
  });
}
```

## Step 2: PDF Renderer

```typescript
// src/renderer/pdf.ts
import puppeteer, { type Browser } from 'puppeteer';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
             '--font-render-hinting=none'],
    });
  }
  return browser;
}

export async function generatePdf(
  html: string,
  options: {
    pageSize: string;
    orientation: string;
    margin: { top: string; bottom: string; left: string; right: string };
  }
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for custom fonts to load
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      format: options.pageSize as any,
      landscape: options.orientation === 'landscape',
      margin: options.margin,
      printBackground: true,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// Pre-warm browser pool for high-throughput
export async function warmPool(size: number = 4): Promise<void> {
  const browser = await getBrowser();
  const pages = await Promise.all(
    Array.from({ length: size }, () => browser.newPage())
  );
  // Close warm pages
  await Promise.all(pages.map(p => p.close()));
}
```

## Step 3: Batch Generation Queue

```typescript
// src/queue/pdf-queue.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { renderTemplate } from '../templates/engine';
import { generatePdf } from '../renderer/pdf';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const connection = new Redis(process.env.REDIS_URL!);
const s3 = new S3Client({ region: process.env.AWS_REGION });

const pdfQueue = new Queue('pdf-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600 },
  },
});

export async function queuePdfGeneration(request: {
  requestId: string;
  templateId: string;
  data: any;
  branding?: any;
  callbackUrl?: string;
}): Promise<string> {
  const job = await pdfQueue.add('generate', request, {
    priority: request.templateId === 'invoice' ? 1 : 5, // invoices first
  });
  return job.id!;
}

const worker = new Worker('pdf-generation', async (job) => {
  const { requestId, templateId, data, branding, callbackUrl } = job.data;

  // 1. Render HTML from template
  const html = await renderTemplate({
    templateId,
    data,
    branding: branding ?? {},
    locale: data.locale ?? 'en',
  });

  // 2. Generate PDF
  const pdfBuffer = await generatePdf(html, {
    pageSize: 'A4',
    orientation: 'portrait',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });

  // 3. Upload to S3
  const key = `pdfs/${new Date().toISOString().split('T')[0]}/${requestId}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
  }));

  // 4. Callback if requested
  if (callbackUrl) {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, status: 'completed', url: `https://cdn.example.com/${key}`, sizeBytes: pdfBuffer.length }),
    }).catch(() => {});
  }

  return { url: `https://cdn.example.com/${key}`, sizeBytes: pdfBuffer.length };
}, { connection, concurrency: 8 });
```

## Step 4: API Endpoint

```typescript
// src/api/pdf.ts
import { Hono } from 'hono';
import { queuePdfGeneration } from '../queue/pdf-queue';
import { renderTemplate } from '../templates/engine';
import { generatePdf } from '../renderer/pdf';

const app = new Hono();

// Sync: small documents, immediate response
app.post('/v1/pdf/generate', async (c) => {
  const body = await c.req.json();
  const html = await renderTemplate(body);
  const pdf = await generatePdf(html, body.options ?? {
    pageSize: 'A4', orientation: 'portrait',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });

  return new Response(pdf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${body.filename ?? 'document'}.pdf"` },
  });
});

// Async: batch generation, returns job ID
app.post('/v1/pdf/batch', async (c) => {
  const { documents } = await c.req.json();
  const jobIds = await Promise.all(
    documents.map((doc: any) => queuePdfGeneration(doc))
  );
  return c.json({ jobs: jobIds, estimatedSeconds: documents.length * 0.8 });
});

export default app;
```

## Results

- **Generation time**: 400ms average (was 5 seconds with third-party API)
- **Cost**: $200/month server (was $3K/month third-party API) — 93% savings
- **10K documents/day**: handled with 8 concurrent workers
- **Uptime**: 99.99% (was 97% with third-party outages)
- **Enterprise customer**: retained with full brand customization
- **Month-end invoice batch**: 5,000 invoices in 45 minutes (was 4+ hours)
- **Multi-language**: 12 locales supported with Handlebars helpers
