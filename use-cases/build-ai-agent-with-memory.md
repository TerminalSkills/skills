---
title: "Build an AI Agent with Persistent Memory"
description: "Create a long-running AI agent that remembers you across sessions using episodic, semantic, and procedural memory stores."
skills: [anthropic-sdk, langchain, agent-memory]
difficulty: advanced
time_estimate: "6 hours"
tags: [ai, agents, memory, vector-db, postgres, langchain, anthropic]
---

# Build an AI Agent with Persistent Memory

> **Persona:** You're building a personal AI assistant that actually *knows* you — your preferences, past decisions, ongoing projects. Every time it starts, it picks up right where you left off.

Most AI assistants are amnesiac by design. You want one that remembers. This guide walks you through a three-tier memory architecture: episodic (what happened), semantic (what's true), and procedural (how to behave).

## Memory Architecture

```
┌─────────────────────────────────────────────────┐
│                   AI Agent                       │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  Episodic   │  │   Semantic   │  │Procedural│ │
│  │  (history)  │  │   (facts)    │  │(behaviors│ │
│  └──────┬──────┘  └──────┬───────┘  └────┬────┘ │
└─────────┼────────────────┼───────────────┼──────┘
          │                │               │
     Postgres          pgvector /       Postgres
    (raw turns)      Pinecone (embeds)  (rules table)
```

## Setup

```bash
npm install @anthropic-ai/sdk langchain @langchain/community pg pgvector
```

```typescript
// memory/types.ts
export interface EpisodicMemory {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  summary?: string;
}

export interface SemanticMemory {
  id: string;
  fact: string;
  embedding: number[];
  source: string;
  confidence: number;
  createdAt: Date;
}

export interface ProceduralMemory {
  id: string;
  trigger: string;
  behavior: string;
  priority: number;
}
```

## Episodic Memory — Conversation History

```typescript
// memory/episodic.ts
import { Pool } from 'pg';

export class EpisodicStore {
  constructor(private db: Pool) {}

  async save(sessionId: string, role: string, content: string) {
    await this.db.query(
      `INSERT INTO episodic_memory (session_id, role, content, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [sessionId, role, content]
    );
  }

  async getRecent(sessionId: string, limit = 20): Promise<EpisodicMemory[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM episodic_memory
       WHERE session_id = $1
       ORDER BY timestamp DESC LIMIT $2`,
      [sessionId, limit]
    );
    return rows.reverse();
  }

  // Summarize old turns to stay within context window
  async consolidate(sessionId: string, keepLast = 10) {
    const old = await this.db.query(
      `SELECT content, role FROM episodic_memory
       WHERE session_id = $1
       ORDER BY timestamp ASC
       LIMIT (SELECT COUNT(*) - $2 FROM episodic_memory WHERE session_id = $1)`,
      [sessionId, keepLast]
    );
    if (old.rows.length === 0) return;

    const summary = await summarizeWithClaude(old.rows);
    await this.db.query(
      `UPDATE episodic_memory SET summary = $1
       WHERE session_id = $2 AND id = (
         SELECT id FROM episodic_memory WHERE session_id = $2 ORDER BY timestamp ASC LIMIT 1
       )`,
      [summary, sessionId]
    );
  }
}
```

## Semantic Memory — Vector-Based Fact Retrieval

```typescript
// memory/semantic.ts
import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';

export class SemanticStore {
  private vectorStore: PGVectorStore;

  async initialize(pool: Pool) {
    this.vectorStore = await PGVectorStore.initialize(
      new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
      { pool, tableName: 'semantic_memory' }
    );
  }

  async remember(fact: string, metadata: Record<string, unknown>) {
    await this.vectorStore.addDocuments([
      { pageContent: fact, metadata }
    ]);
  }

  // Retrieve top-k relevant facts before each response
  async recall(query: string, k = 5): Promise<string[]> {
    const docs = await this.vectorStore.similaritySearch(query, k);
    return docs.map(d => d.pageContent);
  }
}
```

## The Agent — Bringing It Together

```typescript
// agent.ts
import Anthropic from '@anthropic-ai/sdk';

export class MemoryAgent {
  private client = new Anthropic();

  constructor(
    private episodic: EpisodicStore,
    private semantic: SemanticStore,
    private procedural: ProceduralStore,
    private sessionId: string
  ) {}

  async chat(userMessage: string): Promise<string> {
    // 1. Retrieve relevant memories
    const [history, facts, rules] = await Promise.all([
      this.episodic.getRecent(this.sessionId),
      this.semantic.recall(userMessage),
      this.procedural.getAll(),
    ]);

    // 2. Build context-aware system prompt
    const systemPrompt = `You are a personal AI assistant with persistent memory.

FACTS YOU KNOW ABOUT THE USER:
${facts.join('\n')}

BEHAVIORAL RULES:
${rules.map(r => `- ${r.behavior}`).join('\n')}

Use these memories naturally — don't list them, just incorporate them.`;

    // 3. Call Claude with full context
    const messages = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage }
    ];

    const response = await this.client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === 'text'
      ? response.content[0].text : '';

    // 4. Save to episodic memory
    await this.episodic.save(this.sessionId, 'user', userMessage);
    await this.episodic.save(this.sessionId, 'assistant', reply);

    // 5. Extract and store new facts (async, non-blocking)
    this.extractAndStoreFacts(userMessage, reply);

    return reply;
  }

  private async extractAndStoreFacts(user: string, assistant: string) {
    // Use Claude to extract durable facts from the exchange
    const extraction = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Extract durable facts about the user from this exchange.
Return JSON array of strings. Empty array if none.
User: ${user}
Assistant: ${assistant}`
      }]
    });
    // Parse and store extracted facts
    const text = extraction.content[0].type === 'text' ? extraction.content[0].text : '[]';
    const facts = JSON.parse(text) as string[];
    for (const fact of facts) {
      await this.semantic.remember(fact, { source: 'conversation', date: new Date().toISOString() });
    }
  }
}
```

## Database Schema

```sql
-- Episodic memory
CREATE TABLE episodic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic memory (requires pgvector extension)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE semantic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON semantic_memory USING hnsw (embedding vector_cosine_ops);

-- Procedural memory
CREATE TABLE procedural_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT,
  behavior TEXT NOT NULL,
  priority INT DEFAULT 0
);
```

## Running the Agent

```typescript
const agent = new MemoryAgent(episodic, semantic, procedural, 'user-123');

// Session 1
await agent.chat("I prefer TypeScript over Python for backend work");
await agent.chat("My current project is a B2B SaaS for logistics");

// Session 2 (weeks later) — agent remembers
const reply = await agent.chat("What stack should I use for the new microservice?");
// → "Given your preference for TypeScript and your logistics SaaS context, I'd suggest..."
```

## What to Build Next

- **Memory decay:** Lower confidence scores for old facts over time
- **Conflict resolution:** When new facts contradict old ones, ask the user
- **Memory export:** Let users view/edit/delete their stored memories
- **Multi-user isolation:** Namespace all stores by user ID
