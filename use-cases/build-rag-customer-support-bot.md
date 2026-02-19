---
title: Build a RAG-Powered Customer Support Bot
slug: build-rag-customer-support-bot
description: Build an AI customer support assistant that answers questions from your documentation, knowledge base, and past support tickets — with source citations, structured ticket classification, and human handoff when confidence is low.
skills:
  - vercel-ai-sdk
  - llamaindex
  - chromadb
  - instructor
  - nextjs
category: AI/ML
tags:
  - rag
  - chatbot
  - ai
  - customer-support
  - embeddings
---

# Build a RAG-Powered Customer Support Bot

Yuki manages support at a 20-person developer tools company. Three support agents handle 200 tickets per day. 60% are questions already answered in the docs — "How do I configure SSO?", "What's the rate limit for the API?", "How do I export data?" The agents spend most of their day copying answers from the knowledge base into Zendesk replies. She wants an AI assistant that answers common questions instantly (with links to the relevant docs), classifies and routes complex tickets, and hands off to a human when it's unsure.

## Step 1 — Ingest Documentation into ChromaDB

The knowledge base includes product docs (Markdown), API reference (OpenAPI spec), past support tickets (CSV export from Zendesk), and internal runbooks. Each document type needs a different chunking strategy.

```typescript
// scripts/ingest.ts — Document ingestion pipeline.
// Run this script whenever docs change to update the vector index.
// Documents are chunked, embedded, and stored in ChromaDB with metadata.

import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";
import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import matter from "gray-matter";  // Parse Markdown frontmatter

const chroma = new ChromaClient({ path: "http://localhost:8000" });

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY!,
  openai_model: "text-embedding-3-small",  // 1536 dimensions, $0.02/1M tokens
});

const collection = await chroma.getOrCreateCollection({
  name: "support-knowledge",
  embeddingFunction: embedder,
  metadata: { "hnsw:space": "cosine" },
});

// --- Ingest Markdown docs ---
async function ingestDocs(docsDir: string) {
  const files = await readdir(docsDir, { recursive: true });
  const mdFiles = files.filter((f) => extname(f) === ".md");

  const documents: string[] = [];
  const metadatas: Record<string, string>[] = [];
  const ids: string[] = [];

  for (const file of mdFiles) {
    const content = await readFile(join(docsDir, file), "utf-8");
    const { data: frontmatter, content: body } = matter(content);

    // Split by heading — each section becomes a chunk
    const sections = body.split(/^##\s+/m).filter((s) => s.trim());

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (section.length < 50) continue;  // Skip tiny sections

      // First line is the heading (split removed the ## prefix)
      const [heading, ...rest] = section.split("\n");
      const text = rest.join("\n").trim();

      documents.push(`# ${frontmatter.title || file}\n## ${heading}\n\n${text}`);
      metadatas.push({
        source: `docs/${file}`,
        type: "documentation",
        title: frontmatter.title || file,
        section: heading.trim(),
        url: `https://docs.example.com/${file.replace(".md", "")}#${heading.trim().toLowerCase().replace(/\s+/g, "-")}`,
      });
      ids.push(`doc-${file}-${i}`);
    }
  }

  // Batch upsert — idempotent, safe to re-run
  await collection.upsert({ ids, documents, metadatas });
  console.log(`Ingested ${ids.length} doc sections`);
}

// --- Ingest past support tickets ---
async function ingestTickets(csvPath: string) {
  const csv = await readFile(csvPath, "utf-8");
  const rows = csv.split("\n").slice(1);  // Skip header

  const documents: string[] = [];
  const metadatas: Record<string, string>[] = [];
  const ids: string[] = [];

  for (const row of rows) {
    const [id, subject, question, answer, category, resolvedBy] = row.split(",");
    if (!answer || answer.length < 100) continue;  // Skip short/empty answers

    documents.push(`Question: ${subject}\n${question}\n\nAnswer: ${answer}`);
    metadatas.push({
      source: `ticket-${id}`,
      type: "support_ticket",
      category: category || "general",
      resolved_by: resolvedBy || "unknown",
    });
    ids.push(`ticket-${id}`);
  }

  await collection.upsert({ ids, documents, metadatas });
  console.log(`Ingested ${ids.length} support tickets`);
}

await ingestDocs("./docs");
await ingestTickets("./data/zendesk-export.csv");
```

The ingestion pipeline splits Markdown by heading and includes the parent title in each chunk. This contextual chunking means a section about "Rate Limits" under "API Reference" is stored as "API Reference > Rate Limits" — not just "Rate Limits" which could match irrelevant results.

## Step 2 — Build the Retrieval and Classification Layer

Before generating an answer, the system classifies the query to determine routing: answer from docs, search tickets for similar past issues, or escalate to a human.

```typescript
// src/lib/support/classifier.ts — Ticket classification with Instructor.
// Extracts structured metadata from the user's message: category, urgency,
// intent, and whether it can likely be answered from documentation.

import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";

const client = Instructor({
  client: new OpenAI(),
  mode: "TOOLS",
});

const TicketClassification = z.object({
  reasoning: z.string().describe(
    "Brief analysis of what the user is asking and why you chose this classification"
  ),
  category: z.enum([
    "authentication",
    "billing",
    "api",
    "integration",
    "bug_report",
    "feature_request",
    "account",
    "general",
  ]).describe("Primary category of the support request"),
  urgency: z.enum(["low", "medium", "high", "critical"]).describe(
    "low: general question. medium: blocked but has workaround. high: blocked, no workaround. critical: data loss or security."
  ),
  intent: z.enum([
    "how_to",          // User wants to learn how to do something
    "troubleshoot",    // Something isn't working as expected
    "report_bug",      // Confirmed bug report
    "request_feature", // New feature request
    "account_action",  // Needs account change (upgrade, delete, transfer)
    "other",
  ]),
  canAnswerFromDocs: z.boolean().describe(
    "True if this question is likely answerable from product documentation and past tickets"
  ),
  suggestedSearchQuery: z.string().describe(
    "Optimized search query for retrieving relevant documentation (not the raw user message)"
  ),
});

export type TicketClassification = z.infer<typeof TicketClassification>;

export async function classifyTicket(message: string): Promise<TicketClassification> {
  const result = await client.chat.completions.create({
    model: "gpt-4o-mini",  // Fast and cheap for classification
    max_tokens: 500,
    max_retries: 2,
    response_model: {
      schema: TicketClassification,
      name: "TicketClassification",
    },
    messages: [
      {
        role: "system",
        content: "You classify customer support messages for a developer tools company. Be precise about urgency — most questions are low/medium.",
      },
      { role: "user", content: message },
    ],
  });

  return result;
}
```

The `reasoning` field forces the model to think before classifying — this chain-of-thought pattern measurably improves classification accuracy. The `suggestedSearchQuery` rewrites the user's casual question ("SSO not working") into a targeted retrieval query ("configure SAML SSO authentication setup").

## Step 3 — Build the Answer Generation Pipeline

The pipeline chains classification → retrieval → generation. If the classifier says the question can be answered from docs, retrieve relevant chunks and generate an answer with citations. Otherwise, route to a human.

```typescript
// src/lib/support/answer.ts — RAG answer generation.
// Retrieves relevant context from ChromaDB, generates an answer with
// the Vercel AI SDK, and includes source citations.

import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";
import { classifyTicket } from "./classifier";

const chroma = new ChromaClient({ path: "http://localhost:8000" });
const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY!,
  openai_model: "text-embedding-3-small",
});

interface SupportContext {
  documents: string[];
  sources: { title: string; url: string; type: string }[];
}

async function retrieveContext(
  query: string,
  category?: string
): Promise<SupportContext> {
  const collection = await chroma.getCollection({
    name: "support-knowledge",
    embeddingFunction: embedder,
  });

  // Query with optional metadata filter
  const results = await collection.query({
    queryTexts: [query],
    nResults: 6,                    // Top 6 most relevant chunks
    ...(category && {
      where: { category },          // Filter by category if classified
    }),
  });

  const documents = results.documents?.[0] || [];
  const metadatas = results.metadatas?.[0] || [];
  const distances = results.distances?.[0] || [];

  // Filter out low-relevance results (cosine distance > 0.4)
  const relevant = documents
    .map((doc, i) => ({ doc, meta: metadatas[i], distance: distances[i] }))
    .filter((item) => item.distance < 0.4);

  return {
    documents: relevant.map((r) => r.doc as string),
    sources: relevant.map((r) => ({
      title: (r.meta as any)?.title || "Unknown",
      url: (r.meta as any)?.url || "#",
      type: (r.meta as any)?.type || "unknown",
    })),
  };
}

export async function generateSupportResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const lastMessage = messages[messages.length - 1].content;

  // Step 1: Classify the query
  const classification = await classifyTicket(lastMessage);

  // Step 2: Check if we should answer or escalate
  if (!classification.canAnswerFromDocs) {
    return {
      classification,
      shouldEscalate: true,
      stream: null,
      sources: [],
    };
  }

  // Step 3: Retrieve relevant context
  const context = await retrieveContext(
    classification.suggestedSearchQuery,
    classification.category
  );

  if (context.documents.length === 0) {
    return {
      classification,
      shouldEscalate: true,
      stream: null,
      sources: [],
    };
  }

  // Step 4: Generate answer with citations
  const contextText = context.documents
    .map((doc, i) => `[Source ${i + 1}]: ${doc}`)
    .join("\n\n---\n\n");

  const stream = streamText({
    model: openai("gpt-4o"),
    system: `You are a helpful customer support assistant for a developer tools company.
Answer the user's question using ONLY the provided context. If the context doesn't contain the answer, say so clearly.

Rules:
- Cite sources using [Source N] notation
- Be concise but thorough
- Include relevant code examples from the docs if available
- If the user needs to take an action (change settings, contact billing), give step-by-step instructions
- Never make up information not in the context

Context:
${contextText}`,
    messages,
    maxTokens: 1000,
  });

  return {
    classification,
    shouldEscalate: false,
    stream,
    sources: context.sources,
  };
}
```

## Step 4 — Build the Chat Interface with Vercel AI SDK

```tsx
// src/app/support/page.tsx — Support chat interface.
// Server Component shell with Client Component chat widget.

import { SupportChat } from "./support-chat";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">How can we help?</h1>
        <p className="mt-2 text-gray-500">
          Ask a question and our AI assistant will find the answer from our docs.
        </p>
      </div>
      <SupportChat />
    </div>
  );
}
```

```tsx
// src/app/support/support-chat.tsx — Chat widget with streaming.
// Uses useChat() from the Vercel AI SDK for message management,
// streaming display, and automatic scroll handling.

"use client";

import { useChat } from "ai/react";
import { useState } from "react";
import { SourceCard } from "@/components/source-card";

export function SupportChat() {
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [isEscalated, setIsEscalated] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/support/chat",
    onResponse: async (response) => {
      // Parse sources from response headers
      const sourcesHeader = response.headers.get("X-Sources");
      if (sourcesHeader) {
        setSources(JSON.parse(sourcesHeader));
      }

      const escalated = response.headers.get("X-Escalated");
      if (escalated === "true") {
        setIsEscalated(true);
      }
    },
  });

  return (
    <div className="rounded-xl border shadow-lg">
      {/* Messages */}
      <div className="h-[500px] overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-4 py-2">
              <span className="animate-pulse text-sm text-gray-400">Searching docs...</span>
            </div>
          </div>
        )}
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-medium text-gray-500">Sources</p>
          <div className="flex gap-2 overflow-x-auto">
            {sources.map((source, i) => (
              <SourceCard key={i} title={source.title} url={source.url} />
            ))}
          </div>
        </div>
      )}

      {/* Escalation notice */}
      {isEscalated && (
        <div className="border-t bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          This question needs a human agent. A support team member will respond within 2 hours.
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex border-t p-3 gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask a question..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isEscalated}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim() || isEscalated}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

## Step 5 — API Route with Streaming and Escalation

```typescript
// src/app/api/support/chat/route.ts — Chat API route.
// Classifies → retrieves → generates or escalates.
// Streams the response with source metadata in headers.

import { generateSupportResponse } from "@/lib/support/answer";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const result = await generateSupportResponse(messages);

  if (result.shouldEscalate) {
    // Create ticket in Zendesk/Linear/email queue
    // await createEscalationTicket(messages, result.classification);

    return new Response(
      "I don't have enough information to answer this question confidently. " +
      "I've escalated this to our support team — they'll get back to you within 2 hours. " +
      `Category: ${result.classification.category}, Urgency: ${result.classification.urgency}`,
      {
        headers: {
          "X-Escalated": "true",
          "X-Classification": JSON.stringify(result.classification),
        },
      }
    );
  }

  // Stream the AI response
  const response = result.stream!.toDataStreamResponse();

  // Attach sources as a header (parsed by the client)
  response.headers.set("X-Sources", JSON.stringify(result.sources));
  response.headers.set("X-Classification", JSON.stringify(result.classification));

  return response;
}
```

## Results

Yuki deployed the support bot alongside the existing Zendesk workflow. After one month:

- **60% of tickets auto-resolved** — questions about configuration, API usage, and common errors are answered instantly with doc citations. Support agents handle 80 tickets/day instead of 200.
- **Average response time: 3 seconds** (AI) vs 4 hours (human). Customers in different timezones get instant answers instead of waiting for business hours.
- **Answer accuracy: 94%** measured by a weekly sample review. The remaining 6% are correctly escalated (the bot says "I'm not confident" rather than hallucinating).
- **Structured classification routes tickets correctly**: billing questions go to the billing team, bug reports go to engineering with category and urgency pre-filled. Agents save 5 minutes per ticket on triage.
- **Knowledge gaps discovered automatically**: queries that consistently return no relevant documents are logged. Yuki uses this to identify documentation gaps — in the first month, the team wrote 12 new doc pages based on bot escalation patterns.
- **Cost: $180/month** in API calls (GPT-4o for generation, text-embedding-3-small for embeddings, GPT-4o-mini for classification). The bot handles work that previously required a $4,000/month part-time support agent.
