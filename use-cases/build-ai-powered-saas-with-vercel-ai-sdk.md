---
title: Build an AI-Powered SaaS with Vercel AI SDK and Modern Stack
slug: build-ai-powered-saas-with-vercel-ai-sdk
description: Build a production AI SaaS application using Vercel AI SDK for LLM integration with streaming and tool calling, Trigger.dev for background AI jobs, Resend for transactional emails, Upstash for rate limiting, and SST for deployment — a complete modern stack for launching AI-powered products.
skills: [ai-sdk, trigger-dev, resend, upstash, sst-ion]
category: AI & Machine Learning
tags: [ai, saas, streaming, vercel, llm, modern-stack, production]
---

# Build an AI-Powered SaaS with Vercel AI SDK and Modern Stack

Priya is building DocuMind, an AI-powered document analysis SaaS. Users upload contracts, invoices, and reports — the app extracts key information, answers questions about documents, and sends email summaries. She needs streaming AI responses, background processing for large documents, rate limiting for the API, and automated email notifications.

She builds on the hottest 2025/2026 stack: Vercel AI SDK for LLM integration, Trigger.dev for durable background jobs, Resend for beautiful transactional emails, Upstash for serverless rate limiting, and SST for AWS deployment.

## Step 1: AI Chat with Streaming and Tool Calling

```typescript
// app/api/chat/route.ts — Streaming AI with document tools
import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Resource } from "sst";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1m"),  // 20 messages/minute per user
});

export async function POST(req: Request) {
  const { messages, documentId } = await req.json();
  const userId = await getUserId(req);

  // Rate limiting
  const { success, remaining } = await ratelimit.limit(`chat:${userId}`);
  if (!success) {
    return new Response("Rate limit exceeded. Please wait.", { status: 429 });
  }

  // Load document context
  const document = await db.documents.findById(documentId);
  const chunks = await vectorStore.search(
    messages[messages.length - 1].content,
    { filter: { documentId }, topK: 5 },
  );

  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are a document analysis assistant. You have access to the following document:
Title: ${document.title}
Type: ${document.type}

Relevant sections:
${chunks.map(c => c.text).join("\n\n")}

Answer questions accurately based on the document content. Use tools when the user needs specific data extraction.`,
    messages,
    tools: {
      extractKeyTerms: tool({
        description: "Extract key terms, dates, amounts, and parties from the document",
        parameters: z.object({
          extractionType: z.enum(["dates", "amounts", "parties", "obligations", "all"]),
        }),
        execute: async ({ extractionType }) => {
          // Use structured extraction
          const { object } = await generateObject({
            model: openai("gpt-4o"),
            schema: z.object({
              items: z.array(z.object({
                type: z.string(),
                value: z.string(),
                context: z.string(),
                page: z.number().optional(),
              })),
            }),
            prompt: `Extract all ${extractionType} from this document:\n${document.fullText}`,
          });
          return object.items;
        },
      }),
      generateSummary: tool({
        description: "Generate an executive summary of the document",
        parameters: z.object({
          length: z.enum(["brief", "detailed"]).default("brief"),
          focus: z.string().optional().describe("Specific aspect to focus on"),
        }),
        execute: async ({ length, focus }) => {
          const { text } = await generateText({
            model: openai("gpt-4o"),
            prompt: `Write a ${length} executive summary of this document${focus ? `, focusing on ${focus}` : ""}:\n${document.fullText}`,
          });
          return text;
        },
      }),
      emailSummary: tool({
        description: "Email a document summary to the user",
        parameters: z.object({ summary: z.string() }),
        execute: async ({ summary }) => {
          await tasks.trigger("send-document-summary", {
            userId,
            documentId: document.id,
            documentTitle: document.title,
            summary,
          });
          return "Summary email queued for delivery.";
        },
      }),
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

## Step 2: Background Document Processing

```typescript
// trigger/tasks/process-document.ts — Durable background job
import { task, logger, retry } from "@trigger.dev/sdk/v3";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const processDocument = task({
  id: "process-document",
  retry: { maxAttempts: 3 },
  run: async (payload: { documentId: string; userId: string }) => {
    logger.info("Processing document", payload);

    // Step 1: Extract text from PDF
    const document = await db.documents.findById(payload.documentId);
    const text = await extractTextFromPDF(document.s3Key);

    await db.documents.update(payload.documentId, {
      fullText: text,
      status: "text_extracted",
      pageCount: text.split("\f").length,
    });

    // Step 2: Generate embeddings for RAG
    const chunks = splitIntoChunks(text, 500);          // 500 tokens per chunk
    const embeddings = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks.map(c => c.text),
    });

    await vectorStore.upsert(
      chunks.map((chunk, i) => ({
        id: `${payload.documentId}-${i}`,
        values: embeddings.data[i].embedding,
        metadata: { documentId: payload.documentId, text: chunk.text, page: chunk.page },
      })),
    );

    // Step 3: AI classification and metadata extraction
    const { object: metadata } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        documentType: z.enum(["contract", "invoice", "report", "legal", "other"]),
        language: z.string(),
        keyDates: z.array(z.object({ label: z.string(), date: z.string() })),
        parties: z.array(z.string()),
        totalAmount: z.number().nullable(),
        summary: z.string(),
      }),
      prompt: `Analyze this document and extract metadata:\n${text.slice(0, 8000)}`,
    });

    await db.documents.update(payload.documentId, {
      ...metadata,
      status: "ready",
      processedAt: new Date(),
    });

    // Step 4: Notify user
    await tasks.trigger("send-document-summary", {
      userId: payload.userId,
      documentId: payload.documentId,
      documentTitle: document.title,
      summary: metadata.summary,
    });

    logger.info("Document processed", { documentId: payload.documentId, type: metadata.documentType });
    return metadata;
  },
});
```

## Step 3: Transactional Emails with Resend

```typescript
// trigger/tasks/send-document-summary.ts
import { task } from "@trigger.dev/sdk/v3";
import { Resend } from "resend";
import { DocumentSummaryEmail } from "@/emails/document-summary";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendDocumentSummary = task({
  id: "send-document-summary",
  run: async (payload: {
    userId: string;
    documentId: string;
    documentTitle: string;
    summary: string;
  }) => {
    const user = await db.users.findById(payload.userId);

    await resend.emails.send({
      from: "DocuMind <notifications@documind.ai>",
      to: user.email,
      subject: `📄 Analysis ready: ${payload.documentTitle}`,
      react: DocumentSummaryEmail({
        userName: user.name,
        documentTitle: payload.documentTitle,
        summary: payload.summary,
        viewUrl: `https://app.documind.ai/documents/${payload.documentId}`,
      }),
      tags: [
        { name: "type", value: "document-summary" },
        { name: "user_id", value: payload.userId },
      ],
    });
  },
});
```

## Step 4: Infrastructure with SST

```typescript
// sst.config.ts — Full app infrastructure
export default $config({
  app(input) {
    return { name: "documind", home: "aws" };
  },
  async run() {
    const bucket = new sst.aws.Bucket("Documents");
    const stripeKey = new sst.Secret("StripeKey");
    const openaiKey = new sst.Secret("OpenAIKey");
    const resendKey = new sst.Secret("ResendKey");

    const site = new sst.aws.Nextjs("Web", {
      path: "packages/web",
      link: [bucket, stripeKey, openaiKey, resendKey],
      domain: "app.documind.ai",
    });

    return { url: site.url };
  },
});
```

## Results

After 8 weeks, DocuMind processes 2,000 documents daily for 500 active users.

- **Time to first token**: 280ms (streaming AI response via AI SDK)
- **Document processing**: Average 12 seconds for a 50-page PDF (Trigger.dev background job)
- **Rate limiting**: Zero abuse incidents; Upstash rate limiter handles 50K checks/day at <1ms p99
- **Email delivery**: 99.2% delivery rate via Resend; 34% open rate on document summaries
- **Infrastructure cost**: $180/month on AWS via SST (Lambda + S3 + RDS) for 500 users
- **LLM cost**: $420/month (GPT-4o for chat, GPT-4o-mini for classification; AI SDK provider switching)
- **Zero ops**: No servers to manage; SST deploys in 90 seconds, Trigger.dev handles job queues
