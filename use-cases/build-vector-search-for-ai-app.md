---
title: Build Vector Search for an AI App
slug: build-vector-search-for-ai-app
description: Add semantic search to a knowledge base using Pinecone for vector storage and OpenAI for embeddings and generation, integrated into a Next.js application.
skills:
  - pinecone
  - openai-sdk
  - nextjs
category: data-ai
tags:
  - semantic-search
  - rag
  - embeddings
  - vector-database
  - nextjs
---

# Build Vector Search for an AI App

Traditional keyword search fails when users phrase questions differently than the source material. Semantic search solves this by comparing meaning, not words. In this walkthrough, you'll build a knowledge base with vector search using Pinecone for storage, OpenAI for embeddings and generation, and Next.js for the frontend.

## How It Works

1. **Ingest** — Split documents into chunks, generate embeddings with OpenAI, store in Pinecone
2. **Search** — Convert user query to an embedding, find similar chunks in Pinecone
3. **Generate** — Pass relevant chunks as context to GPT-4o for an accurate answer

## Project Setup

```bash
# setup.sh: Initialize Next.js project with dependencies
npx create-next-app@latest knowledge-search --typescript --tailwind --app --src-dir
cd knowledge-search
npm install openai @pinecone-database/pinecone
```

Set up environment variables:

```bash
# .env.local: API keys (never commit this file)
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=knowledge-base
```

## Creating the Pinecone Index

Before ingesting data, create the vector index. The dimension must match your embedding model — OpenAI's `text-embedding-3-small` produces 1536-dimensional vectors.

```typescript
// scripts/create-index.ts: One-time index creation script
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

async function main() {
  await pc.createIndex({
    name: 'knowledge-base',
    dimension: 1536,
    metric: 'cosine',
    spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
  });
  console.log('Index created');
}

main();
```

## Document Ingestion

The ingestion pipeline reads documents, splits them into chunks, generates embeddings, and upserts them into Pinecone.

```typescript
// src/lib/ingest.ts: Document chunking and embedding pipeline
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI();
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index(process.env.PINECONE_INDEX!);

function chunkText(text: string, maxChars = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start += maxChars - overlap;
  }
  return chunks;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

export async function ingestDocument(doc: { id: string; title: string; content: string }) {
  const chunks = chunkText(doc.content);
  const embeddings = await generateEmbeddings(chunks);

  const vectors = chunks.map((chunk, i) => ({
    id: `${doc.id}-chunk-${i}`,
    values: embeddings[i],
    metadata: {
      title: doc.title,
      content: chunk,
      docId: doc.id,
      chunkIndex: i,
    },
  }));

  // Upsert in batches of 100
  for (let i = 0; i < vectors.length; i += 100) {
    await index.upsert(vectors.slice(i, i + 100));
  }

  console.log(`Ingested "${doc.title}": ${chunks.length} chunks`);
}
```

## Search API Route

The API route handles the full RAG flow — embed the query, search Pinecone, then generate an answer with GPT-4o.

```typescript
// src/app/api/search/route.ts: RAG search endpoint
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI();
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index(process.env.PINECONE_INDEX!);

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  // 1. Generate embedding for the query
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVector = embeddingRes.data[0].embedding;

  // 2. Search Pinecone for relevant chunks
  const searchResults = await index.query({
    vector: queryVector,
    topK: 5,
    includeMetadata: true,
  });

  const sources = searchResults.matches?.map(m => ({
    title: m.metadata?.title as string,
    content: m.metadata?.content as string,
    score: m.score,
  })) ?? [];

  const context = sources.map(s => s.content).join('\n\n---\n\n');

  // 3. Generate answer with GPT-4o
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. Answer the user's question based ONLY on the following context. If the context doesn't contain the answer, say so.\n\nContext:\n${context}`,
      },
      { role: 'user', content: query },
    ],
    temperature: 0.2,
  });

  return NextResponse.json({
    answer: completion.choices[0].message.content,
    sources: sources.map(s => ({ title: s.title, score: s.score })),
  });
}
```

## Frontend Search UI

Build a clean search interface that shows the AI answer along with source documents.

```typescript
// src/app/page.tsx: Search UI component
'use client';

import { useState } from 'react';

interface SearchResult {
  answer: string;
  sources: { title: string; score: number }[];
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Knowledge Base Search</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {result && (
        <div>
          <div className="bg-gray-50 p-6 rounded-lg mb-4">
            <h2 className="font-semibold mb-2">Answer</h2>
            <p className="whitespace-pre-wrap">{result.answer}</p>
          </div>

          <h3 className="font-semibold mb-2">Sources</h3>
          <ul className="space-y-1">
            {result.sources.map((s, i) => (
              <li key={i} className="text-sm text-gray-600">
                {s.title} — relevance: {(s.score * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
```

## Running the App

```bash
# run.sh: Ingest documents and start the app
# First, ingest your documents (run once or when content changes)
npx tsx scripts/ingest-docs.ts

# Start the development server
npm run dev
# Open http://localhost:3000
```

The search interface converts natural language questions into vector queries, retrieves the most relevant document chunks, and uses GPT-4o to synthesize a coherent answer grounded in your actual content. Users see both the generated answer and the source documents with relevance scores, building trust in the results.
