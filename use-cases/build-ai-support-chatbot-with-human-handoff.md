---
title: Build an AI Support Chatbot with Human Handoff
slug: build-ai-support-chatbot-with-human-handoff
description: "Build a RAG-based AI support bot that answers from your docs, scores confidence, escalates low-confidence answers to a human agent via WebSocket, and improves retrieval via thumbs up/down feedback."
skills: [anthropic-sdk, langchain, prisma]
category: operations
tags: [ai, chatbot, rag, support, langchain, anthropic, vector-search, handoff]
---

# Build an AI Support Chatbot with Human Handoff

## The Problem

Your support team handles 500 tickets a week. 80% of them are the same 40 questions: "How do I reset my API key?", "What's your refund policy?", "Why is my export failing?" Your docs have the answers — but customers don't read docs, they open a chat. The team spends Monday through Friday answering the same questions, which means complex problems get slow responses.

The goal: route 80% of tickets to AI, keep humans for the 20% that genuinely need them. Not a keyword chatbot — an AI that understands the question, searches the actual docs, generates a real answer, and knows when it doesn't know enough to be useful.

## The Solution

Use **LangChain** to build a RAG pipeline (embed docs → vector search → retrieve context → generate answer). Use **Anthropic SDK** (Claude) as the LLM for generation. Use **Prisma** to store conversations, messages, feedback, and agent routing state. Add a WebSocket-based handoff so human agents can take over any conversation.

## Step-by-Step Walkthrough

### Step 1: Knowledge Base Ingestion

```text
Build a LangChain document ingestion pipeline that loads markdown files 
from a docs/ directory, chunks them with RecursiveCharacterTextSplitter, 
generates embeddings, and stores them in a Postgres vector store (pgvector).
```

```typescript
// scripts/ingest-docs.ts — Index your documentation into pgvector

import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function ingestDocs() {
  // Load all .md files from docs directory
  const loader = new DirectoryLoader('./docs', {
    '.md': (path) => new TextLoader(path),
  })

  const rawDocs = await loader.load()
  console.log(`Loaded ${rawDocs.length} documents`)

  // Split into chunks that fit in context window
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,      // ~750 tokens
    chunkOverlap: 200,    // Overlap keeps context at chunk boundaries
  })

  const chunks = await splitter.splitDocuments(rawDocs)
  console.log(`Split into ${chunks.length} chunks`)

  // Add source metadata for citations
  const docsWithMeta = chunks.map(doc => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      source: doc.metadata.source.replace('./docs/', ''),
      ingestedAt: new Date().toISOString(),
    },
  }))

  // Store embeddings in pgvector
  // Requires: CREATE EXTENSION vector; in Postgres
  await PGVectorStore.fromDocuments(
    docsWithMeta,
    new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
    {
      pool,
      tableName: 'knowledge_base',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'embedding',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
    }
  )

  console.log('Knowledge base indexed successfully')
  await pool.end()
}

ingestDocs()
```

### Step 2: Prisma Schema for Conversations

```prisma
// prisma/schema.prisma additions

model SupportConversation {
  id          String    @id @default(cuid())
  userId      String?
  sessionId   String    @unique // Anonymous session for pre-auth users
  status      String    @default("bot") // "bot" | "pending_handoff" | "human" | "resolved"
  agentId     String?   // Human agent assigned
  rating      Int?      // 1-5 post-resolution rating
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  messages    SupportMessage[]
}

model SupportMessage {
  id             String               @id @default(cuid())
  conversationId String
  conversation   SupportConversation  @relation(fields: [conversationId], references: [id])
  role           String               // "user" | "assistant" | "agent"
  content        String
  confidence     Float?               // AI confidence score 0-1
  sources        Json?                // Array of doc sources used
  feedback       String?              // "positive" | "negative"
  createdAt      DateTime             @default(now())
}
```

### Step 3: RAG Pipeline with Confidence Scoring

```typescript
// lib/support-ai.ts — RAG pipeline with Claude and confidence scoring

import Anthropic from '@anthropic-ai/sdk'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { OpenAIEmbeddings } from '@langchain/openai'
import { Pool } from 'pg'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

interface RAGResponse {
  answer: string
  confidence: number  // 0-1
  sources: Array<{ file: string; excerpt: string }>
  shouldEscalate: boolean
}

export async function answerWithRAG(
  question: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<RAGResponse> {

  // Step 1: Retrieve relevant docs
  const vectorStore = await PGVectorStore.initialize(
    new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
    { pool, tableName: 'knowledge_base' }
  )

  const results = await vectorStore.similaritySearchWithScore(question, 4)
  const relevantDocs = results.filter(([_, score]) => score > 0.75) // Min relevance threshold

  const context = relevantDocs
    .map(([doc]) => `Source: ${doc.metadata.source}\n${doc.pageContent}`)
    .join('\n\n---\n\n')

  const sources = relevantDocs.map(([doc]) => ({
    file: doc.metadata.source,
    excerpt: doc.pageContent.substring(0, 150) + '...',
  }))

  // Step 2: Generate answer with Claude
  const systemPrompt = `You are a helpful customer support assistant. Answer the user's question 
using ONLY the provided documentation context. If the context doesn't contain enough information 
to answer confidently, say so clearly. Be concise and direct.

At the end of your response, add a line: CONFIDENCE: [0.0-1.0] where 1.0 = fully answered 
from docs, 0.5 = partial answer, 0.2 = insufficient context, requiring human support.

Documentation context:
${context || 'No relevant documentation found for this question.'}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...conversationHistory.slice(-6).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: question },
    ],
  })

  const fullText = response.content[0].type === 'text' ? response.content[0].text : ''

  // Extract confidence score from response
  const confidenceMatch = fullText.match(/CONFIDENCE:\s*([\d.]+)/)
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5
  const answer = fullText.replace(/\nCONFIDENCE:.*$/, '').trim()

  return {
    answer,
    confidence,
    sources,
    shouldEscalate: confidence < 0.6 || relevantDocs.length === 0,
  }
}
```

### Step 4: Chat API with Auto-Escalation

```typescript
// app/api/support/chat/route.ts — Main chat endpoint with escalation logic

import { prisma } from '@/lib/prisma'
import { answerWithRAG } from '@/lib/support-ai'
import { notifyAgents } from '@/lib/agent-notification'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, conversationId, sessionId } = await req.json()

  // Get or create conversation
  const conversation = conversationId
    ? await prisma.supportConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } }
      })
    : await prisma.supportConversation.create({
        data: { sessionId: sessionId || crypto.randomUUID() },
        include: { messages: true },
      })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // If already handed off to human, don't respond with AI
  if (conversation.status === 'human') {
    return NextResponse.json({ handedOff: true })
  }

  // Save user message
  await prisma.supportMessage.create({
    data: { conversationId: conversation.id, role: 'user', content: message }
  })

  // Get AI answer
  const history = conversation.messages.map(m => ({ role: m.role, content: m.content }))
  const { answer, confidence, sources, shouldEscalate } = await answerWithRAG(message, history)

  // Save AI response
  const aiMessage = await prisma.supportMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: answer,
      confidence,
      sources,
    }
  })

  // Auto-escalate if confidence is low
  if (shouldEscalate) {
    await prisma.supportConversation.update({
      where: { id: conversation.id },
      data: { status: 'pending_handoff' },
    })
    // Notify available human agents via WebSocket
    await notifyAgents(conversation.id, message, answer)
  }

  return NextResponse.json({
    answer,
    confidence,
    sources,
    messageId: aiMessage.id,
    conversationId: conversation.id,
    escalated: shouldEscalate,
  })
}
```

### Step 5: Human Agent WebSocket Handoff

```typescript
// lib/agent-notification.ts — Real-time handoff to human agents

import { Server } from 'socket.io'

let io: Server

export function initWebSocket(httpServer: any) {
  io = new Server(httpServer, { cors: { origin: process.env.APP_URL } })

  io.on('connection', (socket) => {
    const agentId = socket.handshake.auth.agentId

    socket.on('join_agents', () => {
      socket.join('agents') // All agents listen on this room
    })

    socket.on('claim_conversation', async ({ conversationId }) => {
      await prisma.supportConversation.update({
        where: { id: conversationId },
        data: { status: 'human', agentId }
      })
      // Move conversation from queue to agent's room
      socket.join(`conv_${conversationId}`)
      io.to('agents').emit('conversation_claimed', { conversationId, agentId })
    })

    socket.on('agent_message', async ({ conversationId, content }) => {
      await prisma.supportMessage.create({
        data: { conversationId, role: 'agent', content }
      })
      // Relay message to user
      io.to(`conv_${conversationId}`).emit('message', {
        role: 'agent', content, conversationId
      })
    })
  })
}

export async function notifyAgents(
  conversationId: string,
  lastUserMessage: string,
  aiAttempt: string
) {
  if (!io) return
  io.to('agents').emit('escalation', {
    conversationId,
    lastUserMessage,
    aiAttempt,
    urgency: 'normal',
    timestamp: new Date().toISOString(),
  })
}
```

### Step 6: Feedback Loop for Retrieval Improvement

```typescript
// app/api/support/feedback/route.ts — Thumbs up/down to improve retrieval

import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { messageId, feedback } = await req.json() // feedback: "positive" | "negative"

  await prisma.supportMessage.update({
    where: { id: messageId },
    data: { feedback }
  })

  // For negative feedback: flag the conversation for doc improvement review
  if (feedback === 'negative') {
    const message = await prisma.supportMessage.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { messages: true } } }
    })

    // Log to a review queue (could be a Slack webhook, Notion database, etc.)
    console.warn('RETRIEVAL MISS:', {
      question: message?.conversation.messages.find(m => m.role === 'user')?.content,
      aiAnswer: message?.content,
      sources: message?.sources,
    })
  }

  return NextResponse.json({ success: true })
}
```

## Real-World Example

A SaaS with 500 support tickets per week deploys this over two weekends. Week one: ingest 120 help articles. Bot goes live handling all incoming chats. In week two, 73% of chats resolve without human handoff. The escalation threshold (confidence < 0.6) sends 27% to agents — mostly billing disputes, edge cases, and angry customers who want a human regardless.

After 30 days, the feedback data reveals 15 common questions the docs don't cover well. Those gaps get filled with new articles. Escalation rate drops to 19%. The support team goes from drowning to handling only genuinely complex issues, with response time on escalated tickets dropping from 4 hours to 45 minutes because agents aren't buried in FAQ traffic.

## Related Skills

- [anthropic-sdk](../skills/anthropic-sdk/) — Claude API for text generation and structured output
- [langchain](../skills/langchain/) — Document loading, chunking, embeddings, and vector retrieval
- [prisma](../skills/prisma/) — Conversation and message persistence
