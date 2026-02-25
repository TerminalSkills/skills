---
title: Build an AI-Powered Document Q&A System
slug: build-ai-powered-document-qa-system
description: >-
  A legal tech startup builds a system where lawyers upload contracts and ask
  questions about them. The system uses Claude for analysis and OpenAI
  embeddings for semantic search across document collections, with Ollama as
  a local fallback for sensitive documents that can't leave the network.
skills:
  - anthropic-sdk
  - openai-sdk
  - ollama
  - chromadb
category: data-ai
tags:
  - rag
  - embeddings
  - document-analysis
  - llm
  - search
  - legal
---

# Build an AI-Powered Document Q&A System

Ava leads engineering at a legal tech startup. Lawyers at their client firms spend hours reading through contracts to find specific clauses, compare terms across agreements, and check for risky language. The firm wants a system where lawyers upload contracts (PDFs), and then ask natural language questions like "What's the termination clause in the Acme contract?" or "Which of our vendor agreements have non-compete restrictions?"

The challenge: some clients require that their documents never leave the firm's network (compliance/privilege requirements), while others are fine with cloud processing. Ava builds a hybrid system — cloud AI (Claude + OpenAI) for standard documents, local AI (Ollama) for sensitive ones.

## Step 1: Document Ingestion and Chunking

When a lawyer uploads a PDF, the system extracts text, splits it into semantically meaningful chunks, and generates embeddings for vector search.

```typescript
// lib/document-processor.ts — Extract, chunk, and embed uploaded documents
// PDFs are split into overlapping chunks for accurate retrieval

import { ChromaClient } from 'chromadb'
import OpenAI from 'openai'

const openai = new OpenAI()
const chroma = new ChromaClient({ path: 'http://localhost:8000' })

interface DocumentChunk {
  text: string
  metadata: {
    documentId: string
    documentTitle: string
    pageNumber: number
    chunkIndex: number
  }
}

export async function ingestDocument(
  documentId: string,
  title: string,
  pages: Array<{ pageNumber: number; text: string }>,
  collectionName: string = 'contracts'
) {
  /**
   * Process a document into searchable chunks with embeddings.
   *
   * Args:
   *   documentId: Unique ID for the document
   *   title: Document title (e.g., "Acme Corp Service Agreement")
   *   pages: Array of page objects with text content
   *   collectionName: ChromaDB collection to store in
   */
  const collection = await chroma.getOrCreateCollection({ name: collectionName })

  // Split pages into overlapping chunks (~500 tokens each)
  const chunks = createChunks(pages, {
    maxTokens: 500,
    overlapTokens: 50,    // overlap prevents losing context at chunk boundaries
  })

  // Generate embeddings in batches
  const BATCH_SIZE = 100
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch.map(c => c.text),
    })

    await collection.add({
      ids: batch.map((_, idx) => `${documentId}_chunk_${i + idx}`),
      embeddings: embeddingResponse.data.map(e => e.embedding),
      documents: batch.map(c => c.text),
      metadatas: batch.map(c => ({
        documentId,
        documentTitle: title,
        pageNumber: c.metadata.pageNumber,
        chunkIndex: c.metadata.chunkIndex,
      })),
    })
  }

  return { chunksIndexed: chunks.length }
}

function createChunks(
  pages: Array<{ pageNumber: number; text: string }>,
  options: { maxTokens: number; overlapTokens: number }
): DocumentChunk[] {
  /**
   * Split document pages into overlapping text chunks.
   * Uses paragraph boundaries when possible for cleaner splits.
   */
  const chunks: DocumentChunk[] = []
  let chunkIndex = 0

  for (const page of pages) {
    const paragraphs = page.text.split(/\n\n+/)
    let currentChunk = ''

    for (const paragraph of paragraphs) {
      // Rough token estimate: ~4 chars per token
      if ((currentChunk.length + paragraph.length) / 4 > options.maxTokens && currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: { documentId: '', documentTitle: '', pageNumber: page.pageNumber, chunkIndex: chunkIndex++ },
        })
        // Keep overlap from end of previous chunk
        const overlapChars = options.overlapTokens * 4
        currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + paragraph
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: { documentId: '', documentTitle: '', pageNumber: page.pageNumber, chunkIndex: chunkIndex++ },
      })
    }
  }

  return chunks
}
```

The overlap between chunks (50 tokens) ensures that if a relevant clause spans two chunks, neither chunk loses critical context. Paragraph-boundary splitting preserves semantic coherence within chunks.

## Step 2: Semantic Search (Retrieval)

```typescript
// lib/search.ts — Search across documents using vector similarity
import { ChromaClient } from 'chromadb'
import OpenAI from 'openai'

const openai = new OpenAI()
const chroma = new ChromaClient({ path: 'http://localhost:8000' })

export async function searchDocuments(
  query: string,
  options: {
    collectionName?: string
    documentIds?: string[]
    topK?: number
  } = {}
) {
  /**
   * Semantic search across document chunks.
   *
   * Args:
   *   query: Natural language question
   *   options.collectionName: Collection to search (default: 'contracts')
   *   options.documentIds: Limit search to specific documents
   *   options.topK: Number of results to return (default: 10)
   */
  const collection = await chroma.getCollection({
    name: options.collectionName || 'contracts',
  })

  // Embed the query with the same model used for documents
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })

  // Search with optional document filter
  const where = options.documentIds
    ? { documentId: { $in: options.documentIds } }
    : undefined

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding.data[0].embedding],
    nResults: options.topK || 10,
    where,
  })

  return results.documents[0]!.map((text, i) => ({
    text,
    metadata: results.metadatas[0]![i],
    distance: results.distances?.[0]?.[i],
  }))
}
```

## Step 3: Answer Generation with Claude

Claude's 200K context window and careful instruction following make it ideal for legal document analysis — it can hold multiple contract sections in context and reason about them precisely.

```typescript
// lib/qa.ts — Generate answers from retrieved document chunks
import Anthropic from '@anthropic-ai/sdk'
import { searchDocuments } from './search'

const anthropic = new Anthropic()

export async function answerQuestion(
  question: string,
  documentIds?: string[],
  options: { provider: 'cloud' | 'local' } = { provider: 'cloud' }
) {
  /**
   * Answer a question about uploaded documents using RAG.
   * Retrieves relevant chunks, then generates an answer with citations.
   *
   * Args:
   *   question: User's natural language question
   *   documentIds: Limit search to specific documents (optional)
   *   options.provider: 'cloud' (Claude) or 'local' (Ollama) for sensitive docs
   */
  // Step 1: Retrieve relevant chunks
  const chunks = await searchDocuments(question, { documentIds, topK: 15 })

  // Format context with source references
  const context = chunks
    .map((chunk, i) => {
      const meta = chunk.metadata as Record<string, any>
      return `[Source ${i + 1}: "${meta.documentTitle}", page ${meta.pageNumber}]\n${chunk.text}`
    })
    .join('\n\n---\n\n')

  // Step 2: Generate answer
  if (options.provider === 'cloud') {
    return generateWithClaude(question, context)
  } else {
    return generateWithOllama(question, context)
  }
}

async function generateWithClaude(question: string, context: string) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a legal document analysis assistant. Answer questions based ONLY on the provided document excerpts. For every claim you make, cite the specific source using [Source N] notation. If the answer is not in the provided documents, say so explicitly — never fabricate information.

When analyzing legal language:
- Quote exact contract language when relevant
- Note any ambiguities or potential issues
- If multiple documents are referenced, compare their language`,
    messages: [{
      role: 'user',
      content: `Documents:\n\n${context}\n\n---\n\nQuestion: ${question}`,
    }],
  })

  return {
    answer: response.content[0].type === 'text' ? response.content[0].text : '',
    sources: chunks.map(c => c.metadata),
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  }
}
```

## Step 4: Local Fallback for Sensitive Documents

Some clients require that their documents never leave the firm's network. For these, the system routes to Ollama running locally.

```typescript
// lib/local-qa.ts — Local inference for sensitive documents
import OpenAI from 'openai'

const ollama = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
})

async function generateWithOllama(question: string, context: string) {
  /**
   * Generate answers using a local LLM via Ollama.
   * Used for documents that can't be sent to cloud providers.
   * Quality is lower than Claude but data never leaves the network.
   */
  const response = await ollama.chat.completions.create({
    model: 'llama3.1:70b',    // largest model that fits in memory
    messages: [
      {
        role: 'system',
        content: `You are a legal document analysis assistant. Answer based ONLY on the provided excerpts. Cite sources using [Source N]. If unsure, say so.`,
      },
      {
        role: 'user',
        content: `Documents:\n\n${context}\n\n---\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.2,    // low temperature for factual accuracy
  })

  return {
    answer: response.choices[0].message.content || '',
    sources: [],
    provider: 'local',
  }
}
```

## Step 5: API Endpoint

```typescript
// app/api/qa/route.ts — Question answering API endpoint
import { NextRequest, NextResponse } from 'next/server'
import { answerQuestion } from '@/lib/qa'

export async function POST(req: NextRequest) {
  const { question, documentIds, sensitive } = await req.json()

  if (!question) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const result = await answerQuestion(question, documentIds, {
    provider: sensitive ? 'local' : 'cloud',
  })

  return NextResponse.json(result)
}
```

The system handles both modes transparently — lawyers don't need to know whether their question was processed by Claude or Ollama. They just upload documents, ask questions, and get cited answers. For standard documents, Claude provides high-quality analysis with precise citations. For sensitive documents, Ollama provides good-enough answers without any data leaving the firm's infrastructure.
