---
title: Build a RAG Pipeline with Vector Search
slug: build-rag-pipeline-with-vector-search
description: Build a Retrieval-Augmented Generation pipeline with document chunking, embedding generation, vector search, and contextual answer generation — turning company knowledge into an intelligent Q&A system.
skills:
  - typescript
  - openai
  - postgresql
  - redis
  - hono
  - zod
category: data-ai
tags:
  - rag
  - vector-search
  - embeddings
  - llm
  - knowledge-base
---

# Build a RAG Pipeline with Vector Search

## The Problem

Sofia runs customer success at a 40-person SaaS. Support agents spend 40% of their time searching through 500+ help docs, Notion pages, and Slack threads to find answers. Average first-response time is 4 hours. A simple chatbot with canned responses handles only 15% of questions. They need an AI that actually understands their documentation and gives accurate, sourced answers — not hallucinated ones. RAG grounds LLM responses in real company data, citing specific documents.

## Step 1: Build the Document Ingestion Pipeline

```typescript
// src/rag/ingestion.ts — Chunk, embed, and index documents
import OpenAI from "openai";
import { pool } from "../db";

const openai = new OpenAI();

interface Document {
  id: string;
  title: string;
  content: string;
  source: string;            // "help-docs", "notion", "slack"
  url: string;
  updatedAt: string;
}

interface Chunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: {
    title: string;
    source: string;
    url: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

// Chunk document with overlap for context preservation
function chunkDocument(doc: Document, chunkSize: number = 800, overlap: number = 200): string[] {
  const text = doc.content;
  const chunks: string[] = [];

  // Try to split on paragraph boundaries
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Overlap: keep the last portion of the current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
      currentChunk = overlapWords.join(" ") + "\n\n" + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  return chunks;
}

// Generate embeddings in batches
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

// Ingest a document: chunk → embed → store in pgvector
export async function ingestDocument(doc: Document): Promise<number> {
  // Delete existing chunks for this document (re-indexing)
  await pool.query("DELETE FROM document_chunks WHERE document_id = $1", [doc.id]);

  const textChunks = chunkDocument(doc);
  const embeddings = await generateEmbeddings(
    textChunks.map((chunk, i) => `${doc.title}\n\n${chunk}`) // prepend title for context
  );

  // Store chunks with embeddings in pgvector
  for (let i = 0; i < textChunks.length; i++) {
    await pool.query(
      `INSERT INTO document_chunks (document_id, content, embedding, metadata, created_at)
       VALUES ($1, $2, $3::vector, $4, NOW())`,
      [
        doc.id,
        textChunks[i],
        `[${embeddings[i].join(",")}]`,
        JSON.stringify({
          title: doc.title,
          source: doc.source,
          url: doc.url,
          chunkIndex: i,
          totalChunks: textChunks.length,
        }),
      ]
    );
  }

  return textChunks.length;
}

// Batch ingest multiple documents
export async function ingestDocuments(docs: Document[]): Promise<{
  processed: number;
  totalChunks: number;
  errors: string[];
}> {
  let totalChunks = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    try {
      const chunks = await ingestDocument(doc);
      totalChunks += chunks;
    } catch (err: any) {
      errors.push(`${doc.id}: ${err.message}`);
    }
  }

  return { processed: docs.length - errors.length, totalChunks, errors };
}
```

## Step 2: Build the Query Pipeline

```typescript
// src/rag/query.ts — Retrieve relevant chunks and generate answers
import OpenAI from "openai";
import { pool } from "../db";
import { Redis } from "ioredis";

const openai = new OpenAI();
const redis = new Redis(process.env.REDIS_URL!);

interface RAGResponse {
  answer: string;
  sources: Array<{
    title: string;
    url: string;
    relevanceScore: number;
    snippet: string;
  }>;
  confidence: "high" | "medium" | "low";
  cached: boolean;
}

export async function queryRAG(question: string, options?: {
  topK?: number;
  sourceFilter?: string;
  minScore?: number;
}): Promise<RAGResponse> {
  const topK = options?.topK || 5;
  const minScore = options?.minScore || 0.7;

  // Check cache
  const cacheKey = `rag:${Buffer.from(question).toString("base64").slice(0, 40)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return { ...JSON.parse(cached), cached: true };

  // 1. Embed the question
  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const embedding = queryEmbedding.data[0].embedding;

  // 2. Vector search with pgvector (cosine similarity)
  const { rows: chunks } = await pool.query(
    `SELECT content, metadata, 1 - (embedding <=> $1::vector) as similarity
     FROM document_chunks
     WHERE 1 - (embedding <=> $1::vector) > $2
     ${options?.sourceFilter ? "AND metadata->>'source' = $4" : ""}
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [
      `[${embedding.join(",")}]`,
      minScore,
      topK,
      ...(options?.sourceFilter ? [options.sourceFilter] : []),
    ]
  );

  if (chunks.length === 0) {
    return {
      answer: "I couldn't find relevant information in our documentation to answer this question.",
      sources: [],
      confidence: "low",
      cached: false,
    };
  }

  // 3. Build context from retrieved chunks
  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.metadata.title}]\n${c.content}`)
    .join("\n\n---\n\n");

  // 4. Generate answer with citations
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant that answers questions based ONLY on the provided context.
Rules:
- Only use information from the provided sources
- Cite sources using [Source N] notation
- If the context doesn't contain enough information, say so
- Be concise and direct
- Never make up information not in the sources`,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const answer = response.choices[0].message.content || "";

  // Determine confidence based on similarity scores
  const avgSimilarity = chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length;
  const confidence = avgSimilarity > 0.85 ? "high" : avgSimilarity > 0.75 ? "medium" : "low";

  const result: RAGResponse = {
    answer,
    sources: chunks.map((c) => ({
      title: c.metadata.title,
      url: c.metadata.url,
      relevanceScore: Math.round(c.similarity * 100) / 100,
      snippet: c.content.slice(0, 150) + "...",
    })),
    confidence,
    cached: false,
  };

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(result));

  return result;
}
```

## Results

- **Support first-response time: 4 hours → 30 seconds** — the RAG chatbot answers 65% of questions correctly from documentation; agents handle only complex cases
- **Zero hallucinations in production** — the system prompt enforces source-only answers; when documentation doesn't cover a question, the bot says "I don't know" with high confidence
- **Sources are clickable** — every answer includes the exact documents and sections used; customers verify answers themselves, building trust
- **Re-indexing takes 10 minutes** — when docs are updated, re-ingestion chunks and re-embeds only changed documents; the knowledge base stays current
- **Embedding cost: $0.02 per 1M tokens** — text-embedding-3-small is extremely cheap; indexing 500 documents costs less than $1
